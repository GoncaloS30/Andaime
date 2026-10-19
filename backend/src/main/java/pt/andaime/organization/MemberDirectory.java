package pt.andaime.organization;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Contrato público do módulo para outros módulos: consultar quem pertence à organização corrente. */
@Component
public class MemberDirectory {

    private final JdbcTemplate jdbcTemplate;

    MemberDirectory(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Nome de um utilizador com membership ativa de gestor ou superior na organização corrente. */
    public Optional<String> activeManagerName(UUID userId) {
        return jdbcTemplate.query("""
                SELECT person.display_name
                FROM memberships membership
                JOIN users person ON person.id = membership.user_id
                WHERE membership.organization_id = app.current_org_id()
                  AND membership.user_id = ?
                  AND membership.status = 'ACTIVE'
                  AND membership.role IN ('OWNER', 'ADMIN', 'MANAGER')
                """, (resultSet, rowNumber) -> resultSet.getString(1), userId).stream().findFirst();
    }
}
