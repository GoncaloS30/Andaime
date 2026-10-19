package pt.andaime.audit.api;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.constraints.Pattern;

import pt.andaime.shared.api.PageView;
import pt.andaime.shared.tenant.OrgRole;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/orgs/{orgId}/audit")
public class AuditController {

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };

    private final JdbcTemplate jdbcTemplate;
    private final JsonMapper jsonMapper;

    AuditController(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.jsonMapper = jsonMapper;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public PageView<AuditEntry> list(
            @PathVariable UUID orgId,
            @RequestParam(required = false) @Pattern(regexp = "[a-z_]{2,40}") String entityType,
            @RequestParam(required = false) UUID entityId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        // O registo completo é para administradores; o histórico de um registo concreto (trabalhador,
        // equipa, obra) também para gestores.
        var byEntity = entityType != null && entityId != null;
        OrgRole.require(byEntity ? OrgRole.MANAGER : OrgRole.ADMIN);
        var where = byEntity ? "event.organization_id = ? AND event.entity_type = ? AND event.entity_id = ?"
                : "event.organization_id = ?";
        var filter = byEntity ? new Object[] {orgId, entityType, entityId} : new Object[] {orgId};
        var safeSize = Math.clamp(size, 1, 200);
        var safePage = Math.max(page, 0);
        var total = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM audit_event event WHERE " + where, Long.class, filter);
        List<AuditEntry> items = jdbcTemplate.query("""
                SELECT event.id, event.occurred_at, event.actor_user_id, actor.display_name,
                       event.actor_role, event.action, event.entity_type, event.entity_id, event.changes::text AS changes
                FROM audit_event event
                LEFT JOIN users actor ON actor.id = event.actor_user_id
                WHERE\s""" + where + """

                ORDER BY event.occurred_at DESC, event.id DESC
                LIMIT ? OFFSET ?
                """, (resultSet, rowNumber) -> new AuditEntry(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("occurred_at", OffsetDateTime.class).toInstant(),
                resultSet.getObject("actor_user_id", UUID.class),
                resultSet.getString("display_name"),
                resultSet.getString("actor_role"),
                resultSet.getString("action"),
                resultSet.getString("entity_type"),
                resultSet.getObject("entity_id", UUID.class),
                jsonMapper.readValue(resultSet.getString("changes"), MAP)),
                java.util.stream.Stream.concat(java.util.Arrays.stream(filter),
                        java.util.stream.Stream.of(safeSize, (long) safePage * safeSize)).toArray());
        return new PageView<>(items, safePage, safeSize, total == null ? 0 : total);
    }

    public record AuditEntry(
            UUID id,
            java.time.Instant occurredAt,
            UUID actorUserId,
            String actorName,
            String actorRole,
            String action,
            String entityType,
            UUID entityId,
            Map<String, Object> changes) {
    }
}
