package pt.andaime.audit;

import java.util.Map;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.shared.tenant.TenantContext;
import tools.jackson.databind.json.JsonMapper;

/**
 * Registo de auditoria de negócio. Escreve na transação corrente, por isso uma operação
 * revertida nunca deixa rasto falso. Não guardar aqui dados pessoais sensíveis.
 */
@Component
public class AuditLog {

    private final JdbcTemplate jdbcTemplate;
    private final JsonMapper jsonMapper;

    AuditLog(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.jsonMapper = jsonMapper;
    }

    @Transactional
    public void record(String action, String entityType, UUID entityId, Map<String, ?> changes) {
        jdbcTemplate.update("""
                INSERT INTO audit_event
                    (organization_id, actor_user_id, actor_role, action, entity_type, entity_id,
                     changes, request_id)
                VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?)
                """,
                TenantContext.organizationId().orElse(null),
                TenantContext.userId().orElse(null),
                TenantContext.role().orElse(null),
                action,
                entityType,
                entityId,
                jsonMapper.writeValueAsString(changes == null ? Map.of() : changes),
                MDC.get("requestId"));
    }

    public void record(String action, String entityType, UUID entityId) {
        record(action, entityType, entityId, Map.of());
    }
}
