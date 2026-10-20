package pt.andaime.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class TotpTest {

    /** Segredo dos vetores de teste SHA1 da RFC 6238 (apêndice B) e da RFC 4226 (apêndice D). */
    private static final byte[] RFC_SECRET = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

    @ParameterizedTest(name = "T={0}s → {1}")
    @CsvSource({
            "59, 94287082",
            "1111111109, 07081804",
            "1111111111, 14050471",
            "1234567890, 89005924",
            "2000000000, 69279037",
            "20000000000, 65353130",
    })
    void reproduzOsVetoresSha1DaRfc6238(long epochSeconds, String expected) {
        var step = Totp.step(Instant.ofEpochSecond(epochSeconds));
        assertThat(Totp.code(RFC_SECRET, step, 8)).isEqualTo(expected);
        // Com 6 dígitos, a truncagem é o mesmo valor módulo 10^6: os últimos seis dígitos.
        assertThat(Totp.code(RFC_SECRET, step)).isEqualTo(expected.substring(2));
    }

    @Test
    void reproduzOsVetoresHotpDaRfc4226() {
        var expected = new String[] {
                "755224", "287082", "359152", "969429", "338314",
                "254676", "287922", "162583", "399871", "520489"};
        for (var counter = 0; counter < expected.length; counter++) {
            assertThat(Totp.code(RFC_SECRET, counter)).isEqualTo(expected[counter]);
        }
    }

    @Test
    void passoDeTrintaSegundos() {
        assertThat(Totp.step(Instant.ofEpochSecond(0))).isZero();
        assertThat(Totp.step(Instant.ofEpochSecond(29))).isZero();
        assertThat(Totp.step(Instant.ofEpochSecond(30))).isEqualTo(1);
        assertThat(Totp.step(Instant.ofEpochSecond(59))).isEqualTo(1);
    }

    @Test
    void aceitaUmPassoAntesEDepoisENadaMais() {
        var now = Instant.parse("2026-10-20T10:00:15Z");
        var current = Totp.step(now);

        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, current), now)).hasValue(current);
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, current - 1), now)).hasValue(current - 1);
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, current + 1), now)).hasValue(current + 1);
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, current - 2), now)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, Totp.code(RFC_SECRET, current + 2), now)).isEmpty();
    }

    @Test
    void recusaCodigosMalFormados() {
        var now = Instant.parse("2026-10-20T10:00:15Z");
        var valid = Totp.code(RFC_SECRET, Totp.step(now));

        assertThat(Totp.verify(RFC_SECRET, null, now)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, "", now)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, valid.substring(1), now)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, valid + "0", now)).isEmpty();
        assertThat(Totp.verify(RFC_SECRET, "12a456", now)).isEmpty();
        // Espaços (como as aplicações mostram "123 456") são tolerados.
        assertThat(Totp.verify(RFC_SECRET, valid.substring(0, 3) + " " + valid.substring(3), now)).isPresent();
    }

    @ParameterizedTest(name = "\"{0}\" → \"{1}\"")
    @CsvSource({
            "'', ''",
            "f, MY",
            "fo, MZXQ",
            "foo, MZXW6",
            "foob, MZXW6YQ",
            "fooba, MZXW6YTB",
            "foobar, MZXW6YTBOI",
    })
    void base32SegundoARfc4648SemPreenchimento(String plain, String encoded) {
        var bytes = plain.getBytes(StandardCharsets.US_ASCII);
        assertThat(Totp.base32Encode(bytes)).isEqualTo(encoded);
        assertThat(Totp.base32Decode(encoded)).isEqualTo(bytes);
        assertThat(Totp.base32Decode(encoded.toLowerCase() + "=")).isEqualTo(bytes);
    }

    @Test
    void base32DoSegredoDaRfc() {
        assertThat(Totp.base32Encode(RFC_SECRET)).isEqualTo("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
        assertThat(Totp.base32Decode("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ")).isEqualTo(RFC_SECRET);
        assertThatThrownBy(() -> Totp.base32Decode("GEZ1")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void cifraDoSegredoEstaLigadaAoUtilizador() {
        var cipher = new TotpSecretCipher(Base64.getEncoder().encodeToString(new byte[32]));
        var user = UUID.randomUUID();
        var stored = cipher.encrypt(user, RFC_SECRET);

        assertThat(stored).hasSize(12 + RFC_SECRET.length + 16);
        assertThat(cipher.decrypt(user, stored)).isEqualTo(RFC_SECRET);
        // Nonce aleatório: cifrar duas vezes nunca dá o mesmo resultado.
        assertThat(cipher.encrypt(user, RFC_SECRET)).isNotEqualTo(stored);
        assertThatThrownBy(() -> cipher.decrypt(UUID.randomUUID(), stored)).isInstanceOf(IllegalStateException.class);
        var tampered = stored.clone();
        tampered[tampered.length - 1] ^= 1;
        assertThatThrownBy(() -> cipher.decrypt(user, tampered)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void chaveDeCifraTemDeTer32Bytes() {
        assertThatThrownBy(() -> new TotpSecretCipher("")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new TotpSecretCipher(Base64.getEncoder().encodeToString(new byte[16])))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new TotpSecretCipher("não é base64!")).isInstanceOf(IllegalStateException.class);
    }
}
