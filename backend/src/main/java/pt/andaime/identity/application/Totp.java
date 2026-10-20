package pt.andaime.identity.application;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Locale;
import java.util.OptionalLong;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Códigos de uso único baseados no tempo (TOTP, RFC 6238) sobre HOTP (RFC 4226):
 * HMAC-SHA1, passos de 30 segundos, 6 dígitos — o que todas as aplicações autenticadoras
 * aceitam por omissão. Inclui um codificador Base32 (RFC 4648) mínimo para o segredo.
 */
public final class Totp {

    public static final int DIGITS = 6;
    public static final long PERIOD_SECONDS = 30;
    /** Passos aceites antes e depois do atual, para tolerar relógios ligeiramente desacertados. */
    public static final int WINDOW = 1;

    private static final int[] POWERS_OF_TEN = {1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000};
    private static final char[] BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();

    private Totp() {
    }

    /** Passo de tempo (contador T da RFC 6238) que contém o instante indicado. */
    public static long step(Instant instant) {
        return Math.floorDiv(instant.getEpochSecond(), PERIOD_SECONDS);
    }

    /** Código de {@link #DIGITS} dígitos para um passo. */
    public static String code(byte[] secret, long step) {
        return code(secret, step, DIGITS);
    }

    /** HOTP(K, T) truncado a {@code digits} dígitos, com zeros à esquerda. */
    public static String code(byte[] secret, long step, int digits) {
        if (digits < 1 || digits >= POWERS_OF_TEN.length) {
            throw new IllegalArgumentException("Número de dígitos inválido: " + digits);
        }
        byte[] hash;
        try {
            var mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            hash = mac.doFinal(ByteBuffer.allocate(Long.BYTES).putLong(step).array());
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("HmacSHA1 indisponível", exception);
        }
        // Truncagem dinâmica (RFC 4226, secção 5.3).
        var offset = hash[hash.length - 1] & 0x0f;
        var binary = ((hash[offset] & 0x7f) << 24)
                | ((hash[offset + 1] & 0xff) << 16)
                | ((hash[offset + 2] & 0xff) << 8)
                | (hash[offset + 3] & 0xff);
        var otp = binary % POWERS_OF_TEN[digits];
        return String.format(Locale.ROOT, "%0" + digits + "d", otp);
    }

    /**
     * Verifica um código contra o passo atual e os {@link #WINDOW} vizinhos. Devolve o passo
     * que coincidiu (para a proteção contra reutilização) ou vazio. Compara sempre os três
     * passos em tempo constante.
     */
    public static OptionalLong verify(byte[] secret, String candidate, Instant now) {
        var normalized = candidate == null ? "" : candidate.replace(" ", "").strip();
        if (normalized.length() != DIGITS || !normalized.chars().allMatch(Character::isDigit)) {
            return OptionalLong.empty();
        }
        var current = step(now);
        var matched = OptionalLong.empty();
        for (var step = current - WINDOW; step <= current + WINDOW; step++) {
            var expected = code(secret, step).getBytes(StandardCharsets.US_ASCII);
            if (MessageDigest.isEqual(expected, normalized.getBytes(StandardCharsets.US_ASCII))) {
                matched = OptionalLong.of(step);
            }
        }
        return matched;
    }

    /** Base32 (RFC 4648) sem preenchimento, como esperado nos URIs {@code otpauth://}. */
    public static String base32Encode(byte[] data) {
        var output = new StringBuilder((data.length * 8 + 4) / 5);
        var buffer = 0;
        var bits = 0;
        for (var value : data) {
            buffer = (buffer << 8) | (value & 0xff);
            bits += 8;
            while (bits >= 5) {
                output.append(BASE32_ALPHABET[(buffer >>> (bits - 5)) & 0x1f]);
                bits -= 5;
            }
        }
        if (bits > 0) {
            output.append(BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f]);
        }
        return output.toString();
    }

    /** Descodifica Base32 tolerando minúsculas, espaços, hífenes e preenchimento. */
    public static byte[] base32Decode(String text) {
        var output = new ByteArrayOutputStream();
        var buffer = 0;
        var bits = 0;
        for (var character : text.toUpperCase(Locale.ROOT).toCharArray()) {
            if (character == '=' || character == ' ' || character == '-') {
                continue;
            }
            int value;
            if (character >= 'A' && character <= 'Z') {
                value = character - 'A';
            } else if (character >= '2' && character <= '7') {
                value = character - '2' + 26;
            } else {
                throw new IllegalArgumentException("Carácter Base32 inválido: " + character);
            }
            buffer = (buffer << 5) | value;
            bits += 5;
            if (bits >= 8) {
                output.write((buffer >>> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        return output.toByteArray();
    }
}
