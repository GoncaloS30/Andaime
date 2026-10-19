package pt.andaime.workforce;

import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import pt.andaime.shared.api.ApiException;

/** Contrato público do módulo para outros módulos (obras, organizações): consultar trabalhadores. */
@Component
public class EmployeeDirectory {

    private final JdbcTemplate jdbcTemplate;

    EmployeeDirectory(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Nome do trabalhador na organização corrente (RLS), se existir. */
    public Optional<String> name(UUID employeeId) {
        return jdbcTemplate.query("SELECT full_name FROM employees WHERE id = ?",
                (resultSet, rowNumber) -> resultSet.getString(1), employeeId).stream().findFirst();
    }

    /** Exige um trabalhador ativo e não arquivado da organização corrente. */
    public void requireActive(UUID employeeId, String field) {
        var active = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM employees WHERE id = ? AND status = 'ACTIVE' AND archived_at IS NULL)
                """, Boolean.class, employeeId));
        if (!active) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-" + field,
                    "O trabalhador indicado não existe ou não está ativo.");
        }
    }
}
