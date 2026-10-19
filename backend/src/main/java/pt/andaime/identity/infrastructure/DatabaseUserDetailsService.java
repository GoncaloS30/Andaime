package pt.andaime.identity.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import pt.andaime.identity.UserPrincipal;

@Service
public final class DatabaseUserDetailsService implements UserDetailsService {

    private final JdbcTemplate jdbcTemplate;

    public DatabaseUserDetailsService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        var users = jdbcTemplate.query("""
                SELECT id, email::text, password_hash, display_name,
                       email_verified_at IS NOT NULL AS email_verified,
                       status = 'ACTIVE' AS active
                FROM users
                WHERE email = ?
                """, (resultSet, rowNumber) -> new UserPrincipal(
                resultSet.getObject("id", java.util.UUID.class),
                resultSet.getString("email"),
                resultSet.getString("password_hash"),
                resultSet.getString("display_name"),
                resultSet.getBoolean("email_verified"),
                resultSet.getBoolean("active")), normalize(username));

        if (users.isEmpty()) {
            throw new UsernameNotFoundException("Credenciais inválidas");
        }
        return users.getFirst();
    }

    private String normalize(String email) {
        return email == null ? "" : email.strip().toLowerCase(java.util.Locale.ROOT);
    }
}
