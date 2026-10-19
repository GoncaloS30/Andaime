package pt.andaime.platform;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import javax.sql.DataSource;

import org.slf4j.MDC;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.zaxxer.hikari.HikariDataSource;

import pt.andaime.identity.UserPrincipal;
import pt.andaime.shared.api.ApiException;

/**
 * Administração da plataforma. Usa um pool próprio com o papel {@code andaime_platform}
 * (leitura entre empresas e alteração do estado), separado do pool da aplicação, que está
 * sempre sujeito a RLS. O papel de administrador é verificado na base de dados em cada
 * pedido, para que uma revogação tenha efeito imediato.
 */
@RestController
@RequestMapping("/api/platform")
public class PlatformController implements DisposableBean {

    private final JdbcTemplate app;
    private final HikariDataSource platformDataSource;
    private final JdbcTemplate platform;

    PlatformController(
            JdbcTemplate app,
            @Value("${spring.datasource.url}") String url,
            @Value("${andaime.platform-datasource.username:andaime_platform}") String username,
            @Value("${andaime.platform-datasource.password:andaime_platform_local}") String password) {
        this.app = app;
        this.platformDataSource = new HikariDataSource();
        platformDataSource.setPoolName("andaime-platform");
        platformDataSource.setJdbcUrl(url);
        platformDataSource.setUsername(username);
        platformDataSource.setPassword(password);
        platformDataSource.setMaximumPoolSize(2);
        platformDataSource.setMinimumIdle(0);
        this.platform = new JdbcTemplate((DataSource) platformDataSource);
    }

    @GetMapping("/orgs")
    List<OrganizationSummary> organizations(@AuthenticationPrincipal UserPrincipal principal) {
        requirePlatformAdmin(principal);
        return platform.query("""
                SELECT organization.id, organization.name, organization.country, organization.status,
                       organization.created_at,
                       (SELECT count(*) FROM memberships membership
                        WHERE membership.organization_id = organization.id
                          AND membership.status = 'ACTIVE') AS members
                FROM organizations organization
                ORDER BY organization.created_at DESC
                LIMIT 500
                """, (resultSet, rowNumber) -> new OrganizationSummary(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("name"),
                resultSet.getString("country"),
                resultSet.getString("status"),
                resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
                resultSet.getLong("members")));
    }

    @PostMapping("/orgs/{orgId}/suspend")
    ResponseEntity<Void> suspend(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID orgId) {
        return setStatus(principal, orgId, "SUSPENDED", "organization.suspended");
    }

    @PostMapping("/orgs/{orgId}/reactivate")
    ResponseEntity<Void> reactivate(@AuthenticationPrincipal UserPrincipal principal, @PathVariable UUID orgId) {
        return setStatus(principal, orgId, "ACTIVE", "organization.reactivated");
    }

    private ResponseEntity<Void> setStatus(UserPrincipal principal, UUID orgId, String status, String action) {
        requirePlatformAdmin(principal);
        var updated = platform.update("""
                UPDATE organizations SET status = ?, version = version + 1 WHERE id = ?
                """, status, orgId);
        if (updated == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "A organização não foi encontrada.");
        }
        platform.update("""
                INSERT INTO audit_event
                    (organization_id, actor_user_id, actor_role, on_behalf, action, entity_type, entity_id, request_id)
                VALUES (?, ?, 'PLATFORM_ADMIN', true, ?, 'organization', ?, ?)
                """, orgId, principal.id(), action, orgId, MDC.get("requestId"));
        return ResponseEntity.noContent().build();
    }

    private void requirePlatformAdmin(UserPrincipal principal) {
        var admin = Boolean.TRUE.equals(app.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = ?)", Boolean.class, principal.id()));
        if (!admin) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Reservado à administração da plataforma.");
        }
    }

    @Override
    public void destroy() {
        platformDataSource.close();
    }

    record OrganizationSummary(UUID id, String name, String country, String status, Instant createdAt, long members) {
    }
}
