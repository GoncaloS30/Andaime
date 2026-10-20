package pt.andaime.shared.storage;

import java.io.IOException;
import java.io.InputStream;
import java.util.Set;
import java.util.UUID;

import org.apache.tika.Tika;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Fotografias de trabalhadores e obras no armazenamento privado. O tipo é detetado pelo conteúdo (não pela extensão),
 * o objeto antigo só é apagado depois do commit e o novo é apagado se a transação falhar.
 */
@Component
public class PhotoStorage {

    public static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png", "image/webp");

    public record StoredPhoto(String key, String contentType) {
    }

    public record PhotoContent(InputStream content, String contentType) {
    }

    /** URL da fotografia na API (a data de alteração muda o URL quando a foto muda, para a cache do browser). */
    public static String url(String collection, UUID id, java.sql.Timestamp updatedAt) {
        return updatedAt == null ? null : "/api/orgs/" + TenantContext.organizationId().orElseThrow() + "/" + collection + "/" + id
                + "/photo?v=" + updatedAt.getTime();
    }

    private final ObjectStorage storage;
    private final FileScanner scanner;
    private final Tika tika = new Tika();

    public PhotoStorage(ObjectStorage storage, FileScanner scanner) {
        this.storage = storage;
        this.scanner = scanner;
    }

    /** Valida e guarda; {@code folder} é {@code employees} ou {@code sites}. */
    public StoredPhoto store(String folder, UUID ownerId, MultipartFile file) {
        byte[] content;
        try {
            content = file == null ? new byte[0] : file.getBytes();
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "file-unreadable", "Não foi possível ler a fotografia.");
        }
        if (content.length == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "file-empty", "Escolha uma fotografia.");
        }
        if (content.length > MAX_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "file-too-large", "A fotografia tem mais de 5 MB.");
        }
        var detected = tika.detect(content, file.getOriginalFilename());
        if (!TYPES.contains(detected)) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported-type",
                    "Formato não aceite. Use JPEG, PNG ou WebP.").with("detected", detected);
        }
        scanner.requireClean(content);
        var key = "org/" + TenantContext.organizationId().orElseThrow() + "/photos/" + folder + "/" + ownerId + "/" + UUID.randomUUID();
        storage.put(key, content, detected);
        afterCompletion(key, false);
        return new StoredPhoto(key, detected);
    }

    /** Apaga o objeto só se a transação corrente for confirmada (ou já, se não houver transação). */
    public void deleteAfterCommit(String key) {
        if (key != null) {
            afterCompletion(key, true);
        }
    }

    public InputStream open(String key) {
        return storage.open(key);
    }

    private void afterCompletion(String key, boolean onCommit) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            if (onCommit) {
                storage.delete(key);
            }
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if ((status == STATUS_COMMITTED) == onCommit) {
                    storage.delete(key);
                }
            }
        });
    }
}
