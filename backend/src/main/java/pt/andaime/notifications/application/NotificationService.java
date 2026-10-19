package pt.andaime.notifications.application;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import pt.andaime.shared.tenant.TenantContext;

/** Notificações do utilizador corrente na empresa corrente. */
@Service
public class NotificationService {

    public record NotificationView(UUID id, String kind, String title, String body, String link, Instant createdAt, boolean read) {
    }

    public record Inbox(int unread, List<NotificationView> items) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final NotificationStream stream;

    public NotificationService(JdbcTemplate jdbcTemplate, NotificationStream stream) {
        this.jdbcTemplate = jdbcTemplate;
        this.stream = stream;
    }

    @Transactional(readOnly = true)
    public Inbox inbox(int limit) {
        var me = TenantContext.userId().orElseThrow();
        var unread = jdbcTemplate.queryForObject("SELECT count(*) FROM notifications WHERE user_id = ? AND read_at IS NULL",
                Integer.class, me);
        var items = jdbcTemplate.query("""
                SELECT id, kind, title, body, link, created_at, read_at FROM notifications
                WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
                """, (resultSet, rowNumber) -> new NotificationView(resultSet.getObject(1, UUID.class), resultSet.getString(2),
                resultSet.getString(3), resultSet.getString(4), resultSet.getString(5),
                resultSet.getObject(6, OffsetDateTime.class).toInstant(), resultSet.getObject(7) != null), me, Math.clamp(limit, 1, 100));
        return new Inbox(unread, items);
    }

    /** Marca como lidas as indicadas (ou todas, se a lista vier vazia). */
    @Transactional
    public Inbox markRead(List<UUID> ids) {
        var me = TenantContext.userId().orElseThrow();
        if (ids == null || ids.isEmpty()) {
            jdbcTemplate.update("UPDATE notifications SET read_at = now() WHERE user_id = ? AND read_at IS NULL", me);
        } else {
            for (var id : ids) {
                jdbcTemplate.update("UPDATE notifications SET read_at = now() WHERE id = ? AND user_id = ? AND read_at IS NULL", id, me);
            }
        }
        return inbox(30);
    }

    public SseEmitter subscribe() {
        return stream.open(TenantContext.organizationId().orElseThrow(), TenantContext.userId().orElseThrow());
    }
}
