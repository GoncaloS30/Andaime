package pt.andaime.identity.application;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.shared.api.ApiException;

/**
 * Verificação em dois passos (TOTP). O segredo fica cifrado em repouso e nunca é devolvido
 * depois da confirmação; dos códigos de recuperação só se guarda o hash.
 *
 * <p>Os métodos que auditam exigem o contexto do utilizador aberto antes da transação
 * ({@code TenantContext.openForUser}): os eventos ficam sem organização, em nome do próprio.
 */
@Service
public class TwoFactorService {

    public static final String ISSUER = "Andaime";
    static final int RECOVERY_CODES = 10;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int SECRET_BYTES = 20;
    /** Sem caracteres ambíguos (0/o, 1/l/i): 31 símbolos × 12 posições ≈ 59 bits por código. */
    private static final char[] RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789".toCharArray();
    private static final int RECOVERY_LENGTH = 12;

    private final JdbcTemplate jdbcTemplate;
    private final TotpSecretCipher cipher;
    private final PasswordEncoder passwordEncoder;
    private final AuditLog auditLog;
    private final Clock clock;

    public TwoFactorService(
            JdbcTemplate jdbcTemplate,
            TotpSecretCipher cipher,
            PasswordEncoder passwordEncoder,
            AuditLog auditLog,
            Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.cipher = cipher;
        this.passwordEncoder = passwordEncoder;
        this.auditLog = auditLog;
        this.clock = clock;
    }

    public record SetupView(String secret, String otpauthUri) {
    }

    public record StatusView(boolean enabled, boolean pending, int recoveryCodesRemaining) {
    }

    @Transactional(readOnly = true)
    public boolean isEnabled(UUID userId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM user_totp WHERE user_id = ? AND enabled_at IS NOT NULL)",
                Boolean.class, userId));
    }

    @Transactional(readOnly = true)
    public StatusView status(UUID userId) {
        var rows = jdbcTemplate.query(
                "SELECT enabled_at IS NOT NULL AS enabled FROM user_totp WHERE user_id = ?",
                (resultSet, rowNumber) -> resultSet.getBoolean("enabled"), userId);
        var enabled = !rows.isEmpty() && rows.getFirst();
        var remaining = enabled ? jdbcTemplate.queryForObject(
                "SELECT count(*) FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL",
                Integer.class, userId) : Integer.valueOf(0);
        return new StatusView(enabled, !rows.isEmpty() && !enabled, remaining == null ? 0 : remaining);
    }

    /**
     * Gera um segredo novo, guardado como pendente até ser confirmado com um código. Repetir
     * substitui o segredo pendente; com a verificação já ativa, é recusado.
     */
    @Transactional
    public SetupView setup(UUID userId, String email) {
        var secret = new byte[SECRET_BYTES];
        RANDOM.nextBytes(secret);
        var stored = jdbcTemplate.update("""
                INSERT INTO user_totp (user_id, secret_ciphertext)
                VALUES (?, ?)
                ON CONFLICT (user_id) DO UPDATE
                SET secret_ciphertext = EXCLUDED.secret_ciphertext,
                    last_used_step = NULL,
                    created_at = now()
                WHERE user_totp.enabled_at IS NULL
                """, userId, cipher.encrypt(userId, secret));
        if (stored == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "two-factor-enabled",
                    "A verificação em dois passos já está ativa.");
        }
        var encodedSecret = Totp.base32Encode(secret);
        Arrays.fill(secret, (byte) 0);
        return new SetupView(encodedSecret, otpauthUri(email, encodedSecret));
    }

    /** Confirma a configuração com um código da aplicação e devolve os códigos de recuperação (uma única vez). */
    @Transactional
    public List<String> confirm(UUID userId, String code) {
        var pending = jdbcTemplate.query("""
                SELECT secret_ciphertext FROM user_totp
                WHERE user_id = ? AND enabled_at IS NULL
                FOR UPDATE
                """, (resultSet, rowNumber) -> resultSet.getBytes(1), userId);
        if (pending.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "two-factor-not-started",
                    "Comece por configurar a verificação em dois passos.");
        }
        var secret = cipher.decrypt(userId, pending.getFirst());
        var step = Totp.verify(secret, code, clock.instant());
        Arrays.fill(secret, (byte) 0);
        if (step.isEmpty()) {
            throw invalidCode();
        }
        jdbcTemplate.update("""
                UPDATE user_totp SET enabled_at = now(), last_used_step = ? WHERE user_id = ?
                """, step.getAsLong(), userId);
        var codes = replaceRecoveryCodes(userId);
        auditLog.record("user.2fa-enabled", "user", userId);
        return codes;
    }

    /** Desativa: exige a palavra-passe atual e um código da aplicação ou de recuperação. */
    @Transactional
    public void disable(UUID userId, String password, String code) {
        if (!isEnabled(userId)) {
            throw new ApiException(HttpStatus.CONFLICT, "two-factor-disabled",
                    "A verificação em dois passos não está ativa.");
        }
        var hash = jdbcTemplate.queryForObject("SELECT password_hash FROM users WHERE id = ?", String.class, userId);
        if (hash == null || !passwordEncoder.matches(password, hash)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-password", "A palavra-passe atual está incorreta.");
        }
        if (!verifyAnyCode(userId, code)) {
            throw invalidCode();
        }
        jdbcTemplate.update("DELETE FROM user_recovery_codes WHERE user_id = ?", userId);
        jdbcTemplate.update("DELETE FROM user_totp WHERE user_id = ?", userId);
        auditLog.record("user.2fa-disabled", "user", userId);
    }

    /**
     * Aceita um código TOTP uma única vez: o passo usado fica registado e qualquer código do
     * mesmo passo (ou anterior) passa a ser recusado.
     */
    @Transactional
    public boolean verifyTotp(UUID userId, String code) {
        var rows = jdbcTemplate.query("""
                SELECT secret_ciphertext FROM user_totp WHERE user_id = ? AND enabled_at IS NOT NULL
                """, (resultSet, rowNumber) -> resultSet.getBytes(1), userId);
        if (rows.isEmpty()) {
            return false;
        }
        var secret = cipher.decrypt(userId, rows.getFirst());
        var step = Totp.verify(secret, code, clock.instant());
        Arrays.fill(secret, (byte) 0);
        if (step.isEmpty()) {
            return false;
        }
        return jdbcTemplate.update("""
                UPDATE user_totp SET last_used_step = ?
                WHERE user_id = ?
                  AND enabled_at IS NOT NULL
                  AND (last_used_step IS NULL OR last_used_step < ?)
                """, step.getAsLong(), userId, step.getAsLong()) == 1;
    }

    /** Consome um código de recuperação (uso único). */
    @Transactional
    public boolean useRecoveryCode(UUID userId, String rawCode) {
        var code = normalizeRecoveryCode(rawCode);
        if (code.length() != RECOVERY_LENGTH) {
            return false;
        }
        var candidates = jdbcTemplate.query("""
                SELECT id, salt, code_hash FROM user_recovery_codes
                WHERE user_id = ? AND used_at IS NULL
                """, (resultSet, rowNumber) -> new RecoveryRow(
                resultSet.getObject("id", UUID.class), resultSet.getBytes("salt"), resultSet.getBytes("code_hash")), userId);
        UUID matched = null;
        for (var candidate : candidates) {
            if (MessageDigest.isEqual(hashRecoveryCode(candidate.salt(), code), candidate.hash())) {
                matched = candidate.id();
            }
        }
        if (matched == null) {
            return false;
        }
        var used = jdbcTemplate.update("""
                UPDATE user_recovery_codes SET used_at = now() WHERE id = ? AND used_at IS NULL
                """, matched) == 1;
        if (used) {
            var remaining = jdbcTemplate.queryForObject(
                    "SELECT count(*) FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL",
                    Integer.class, userId);
            auditLog.record("user.2fa-recovery-used", "user", userId, Map.of("remaining", remaining == null ? 0 : remaining));
        }
        return used;
    }

    /** Seis dígitos = código da aplicação; qualquer outra coisa é tratada como código de recuperação. */
    private boolean verifyAnyCode(UUID userId, String code) {
        var compact = code == null ? "" : code.replace(" ", "").strip();
        return compact.length() == Totp.DIGITS && compact.chars().allMatch(Character::isDigit)
                ? verifyTotp(userId, compact)
                : useRecoveryCode(userId, code);
    }

    private List<String> replaceRecoveryCodes(UUID userId) {
        jdbcTemplate.update("DELETE FROM user_recovery_codes WHERE user_id = ?", userId);
        var codes = new ArrayList<String>(RECOVERY_CODES);
        for (var index = 0; index < RECOVERY_CODES; index++) {
            var raw = new StringBuilder(RECOVERY_LENGTH);
            for (var position = 0; position < RECOVERY_LENGTH; position++) {
                raw.append(RECOVERY_ALPHABET[RANDOM.nextInt(RECOVERY_ALPHABET.length)]);
            }
            var salt = new byte[16];
            RANDOM.nextBytes(salt);
            jdbcTemplate.update("""
                    INSERT INTO user_recovery_codes (user_id, salt, code_hash) VALUES (?, ?, ?)
                    """, userId, salt, hashRecoveryCode(salt, raw.toString()));
            codes.add(raw.substring(0, 4) + "-" + raw.substring(4, 8) + "-" + raw.substring(8));
        }
        return codes;
    }

    private static String normalizeRecoveryCode(String code) {
        return code == null ? "" : code.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static byte[] hashRecoveryCode(byte[] salt, String normalizedCode) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            digest.update(salt);
            return digest.digest(normalizedCode.getBytes(StandardCharsets.US_ASCII));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 indisponível", exception);
        }
    }

    private static String otpauthUri(String email, String secret) {
        var label = encode(ISSUER) + ":" + encode(email);
        return "otpauth://totp/" + label + "?secret=" + secret + "&issuer=" + encode(ISSUER)
                + "&algorithm=SHA1&digits=" + Totp.DIGITS + "&period=" + Totp.PERIOD_SECONDS;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static ApiException invalidCode() {
        return new ApiException(HttpStatus.BAD_REQUEST, "invalid-code",
                "O código não é válido. Confirme que a hora do telemóvel está certa e tente de novo.");
    }

    private record RecoveryRow(UUID id, byte[] salt, byte[] hash) {
    }
}
