package pt.andaime.identity.application;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.api.RateLimitedException;

@Service
public class AuthenticationService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration VERIFICATION_VALIDITY = Duration.ofHours(24);
    private static final Duration PASSWORD_RESET_VALIDITY = Duration.ofHours(1);

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final IdentityMailGateway mailGateway;
    private final Clock clock;

    public AuthenticationService(
            JdbcTemplate jdbcTemplate,
            PasswordEncoder passwordEncoder,
            AuthenticationManager authenticationManager,
            IdentityMailGateway mailGateway,
            Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.mailGateway = mailGateway;
        this.clock = clock;
    }

    @Transactional
    public void signup(String rawEmail, String password, String displayName) {
        var email = normalize(rawEmail);
        var existing = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM users WHERE email = ?", Integer.class, email);
        if (existing != null && existing > 0) {
            mailGateway.sendExistingAccountNotice(email);
            return;
        }

        var userId = jdbcTemplate.queryForObject("""
                INSERT INTO users (email, password_hash, display_name)
                VALUES (?, ?, ?)
                RETURNING id
                """, UUID.class, email, passwordEncoder.encode(password), displayName.strip());
        var token = newToken();
        jdbcTemplate.update("""
                INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
                VALUES (?, ?, ?)
                """, userId, hash(token), OffsetDateTime.ofInstant(clock.instant().plus(VERIFICATION_VALIDITY), ZoneOffset.UTC));
        mailGateway.sendVerification(email, displayName.strip(), token);
    }

    @Transactional
    public void verifyEmail(String token) {
        var userIds = jdbcTemplate.query("""
                UPDATE email_verification_tokens
                SET used_at = now()
                WHERE token_hash = ?
                  AND used_at IS NULL
                  AND expires_at > now()
                RETURNING user_id
                """, (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), hash(token));
        if (userIds.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-token", "O código é inválido ou expirou.");
        }
        jdbcTemplate.update("""
                UPDATE users
                SET email_verified_at = COALESCE(email_verified_at, now()), version = version + 1
                WHERE id = ?
                """, userIds.getFirst());
    }

    @Transactional(noRollbackFor = ApiException.class)
    public Authentication login(String rawEmail, String password) {
        var email = normalize(rawEmail);
        enforceThrottle(email);
        try {
            var authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(email, password));
            jdbcTemplate.update("DELETE FROM login_throttle WHERE email_key = ?", email);
            // A sessão é persistida no PostgreSQL: nunca guardar lá o hash da palavra-passe.
            var principal = ((pt.andaime.identity.UserPrincipal) authentication.getPrincipal()).withoutPassword();
            return UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities());
        } catch (AuthenticationException exception) {
            recordFailure(email);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthenticated", "Email ou palavra-passe inválidos.");
        }
    }

    @Transactional
    public void requestPasswordReset(String rawEmail) {
        var email = normalize(rawEmail);
        var users = jdbcTemplate.query(
                "SELECT id FROM users WHERE email = ? AND status = 'ACTIVE'",
                (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class),
                email);
        if (users.isEmpty()) {
            return;
        }

        var userId = users.getFirst();
        jdbcTemplate.update("""
                UPDATE password_reset_tokens
                SET used_at = now()
                WHERE user_id = ? AND used_at IS NULL
                """, userId);
        var token = newToken();
        jdbcTemplate.update("""
                INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                VALUES (?, ?, ?)
                """, userId, hash(token),
                OffsetDateTime.ofInstant(clock.instant().plus(PASSWORD_RESET_VALIDITY), ZoneOffset.UTC));
        mailGateway.sendPasswordReset(email, token);
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        var users = jdbcTemplate.query("""
                UPDATE password_reset_tokens
                SET used_at = now()
                WHERE token_hash = ?
                  AND used_at IS NULL
                  AND expires_at > now()
                RETURNING user_id
                """, (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), hash(token));
        if (users.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-token", "O código é inválido ou expirou.");
        }

        var userId = users.getFirst();
        var email = jdbcTemplate.queryForObject(
                "SELECT email::text FROM users WHERE id = ?", String.class, userId);
        jdbcTemplate.update("""
                UPDATE users SET password_hash = ?, version = version + 1 WHERE id = ?
                """, passwordEncoder.encode(newPassword), userId);
        jdbcTemplate.update("DELETE FROM spring_session WHERE principal_name = ?", email);
    }

    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword, String currentSessionId) {
        var user = jdbcTemplate.queryForObject("""
                SELECT email::text, password_hash FROM users WHERE id = ?
                """, (resultSet, rowNumber) -> new PasswordRow(
                resultSet.getString("email"), resultSet.getString("password_hash")), userId);
        if (user == null || !passwordEncoder.matches(currentPassword, user.passwordHash())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-password", "A palavra-passe atual está incorreta.");
        }
        jdbcTemplate.update("""
                UPDATE users SET password_hash = ?, version = version + 1 WHERE id = ?
                """, passwordEncoder.encode(newPassword), userId);
        jdbcTemplate.update("""
                DELETE FROM spring_session
                WHERE principal_name = ? AND session_id <> ?
                """, user.email(), currentSessionId);
    }

    private void enforceThrottle(String email) {
        var lockedUntil = jdbcTemplate.query("""
                SELECT locked_until FROM login_throttle WHERE email_key = ?
                """, resultSet -> resultSet.next() ? resultSet.getObject(1, OffsetDateTime.class) : null, email);
        var now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        if (lockedUntil != null && lockedUntil.isAfter(now)) {
            throw new RateLimitedException(Duration.between(now, lockedUntil));
        }
    }

    private void recordFailure(String email) {
        jdbcTemplate.update("""
                INSERT INTO login_throttle (email_key, failures, last_failure_at)
                VALUES (?, 1, now())
                ON CONFLICT (email_key) DO UPDATE
                SET failures = login_throttle.failures + 1,
                    last_failure_at = now(),
                    updated_at = now()
                """, email);
        var failures = jdbcTemplate.queryForObject(
                "SELECT failures FROM login_throttle WHERE email_key = ?", Integer.class, email);
        if (failures != null && failures >= 5) {
            var seconds = Math.min(900, 30L << Math.min(5, failures - 5));
            jdbcTemplate.update("""
                    UPDATE login_throttle SET locked_until = now() + (? * interval '1 second')
                    WHERE email_key = ?
                    """, seconds, email);
        }
    }

    private String normalize(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    private String newToken() {
        var bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private byte[] hash(String token) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 indisponível", exception);
        }
    }

    private record PasswordRow(String email, String passwordHash) {
    }
}
