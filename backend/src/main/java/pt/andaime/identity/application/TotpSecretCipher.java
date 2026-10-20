package pt.andaime.identity.application;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Cifra os segredos TOTP em repouso (AES-256-GCM). O id do utilizador entra como dados
 * associados: um segredo copiado para a linha de outro utilizador deixa de decifrar.
 * Formato guardado: nonce (12 bytes) || texto cifrado com etiqueta (16 bytes).
 */
@Component
public class TotpSecretCipher {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int NONCE_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKey key;

    TotpSecretCipher(@Value("${andaime.security.totp-key:}") String base64Key) {
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(base64Key == null ? "" : base64Key.strip());
        } catch (IllegalArgumentException exception) {
            bytes = new byte[0];
        }
        if (bytes.length != 32) {
            throw new IllegalStateException("andaime.security.totp-key (ANDAIME_TOTP_KEY) tem de ser uma chave "
                    + "de 32 bytes em base64. Gere uma com: openssl rand -base64 32");
        }
        this.key = new SecretKeySpec(bytes, "AES");
        Arrays.fill(bytes, (byte) 0);
    }

    public byte[] encrypt(UUID userId, byte[] secret) {
        var nonce = new byte[NONCE_BYTES];
        RANDOM.nextBytes(nonce);
        try {
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, nonce));
            cipher.updateAAD(associatedData(userId));
            var ciphertext = cipher.doFinal(secret);
            return ByteBuffer.allocate(nonce.length + ciphertext.length).put(nonce).put(ciphertext).array();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Não foi possível cifrar o segredo TOTP", exception);
        }
    }

    public byte[] decrypt(UUID userId, byte[] stored) {
        if (stored == null || stored.length <= NONCE_BYTES) {
            throw new IllegalStateException("Segredo TOTP guardado com formato inválido");
        }
        try {
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, stored, 0, NONCE_BYTES));
            cipher.updateAAD(associatedData(userId));
            return cipher.doFinal(stored, NONCE_BYTES, stored.length - NONCE_BYTES);
        } catch (GeneralSecurityException exception) {
            // Chave errada (rodada sem migração) ou dados adulterados.
            throw new IllegalStateException("Não foi possível decifrar o segredo TOTP", exception);
        }
    }

    private static byte[] associatedData(UUID userId) {
        return ByteBuffer.allocate(16)
                .putLong(userId.getMostSignificantBits())
                .putLong(userId.getLeastSignificantBits())
                .array();
    }
}
