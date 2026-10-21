package pt.andaime.sitediary.application;

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
import pt.andaime.shared.storage.FileScanner;
import pt.andaime.shared.storage.ObjectStorage;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.sitediary.domain.ImageSize;

/**
 * Fotos do diário no armazenamento privado, com as mesmas regras das fotografias da V22 (tipo detetado pelo conteúdo,
 * antivírus com falha fechada, objeto apagado se a transação falhar), mais o resultado da análise e as dimensões.
 */
@Component
class DiaryPhotoStore {

    static final long MAX_BYTES = 10L * 1024 * 1024;
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png", "image/webp");

    record Stored(String key, String contentType, int sizeBytes, Integer width, Integer height, String scanStatus) {
    }

    private final ObjectStorage storage;
    private final FileScanner scanner;
    private final Tika tika = new Tika();

    DiaryPhotoStore(ObjectStorage storage, FileScanner scanner) {
        this.storage = storage;
        this.scanner = scanner;
    }

    Stored store(UUID siteId, UUID entryId, MultipartFile file) {
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
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "file-too-large", "A fotografia tem mais de 10 MB.");
        }
        var detected = tika.detect(content, file.getOriginalFilename());
        if (!TYPES.contains(detected)) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported-type",
                    "Formato não aceite. Use JPEG, PNG ou WebP.").with("detected", detected);
        }
        var scan = scanner.requireClean(content);
        var size = ImageSize.of(content, detected);
        var key = "org/" + TenantContext.organizationId().orElseThrow() + "/photos/diary/" + siteId + "/" + entryId + "/"
                + UUID.randomUUID();
        storage.put(key, content, detected);
        afterCompletion(key, false);
        return new Stored(key, detected, content.length, size.map(ImageSize.Size::width).orElse(null),
                size.map(ImageSize.Size::height).orElse(null), scan.name());
    }

    InputStream open(String key) {
        return storage.open(key);
    }

    /** Apaga o objeto só depois do commit (ou já, se não houver transação). */
    void deleteAfterCommit(String key) {
        if (key != null) {
            afterCompletion(key, true);
        }
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
