package pt.andaime.shared.api;

import java.time.Duration;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import pt.andaime.shared.storage.PhotoStorage.PhotoContent;

/** Resposta de uma fotografia: só em cache privada (o URL muda quando a foto muda) e sem interpretação pelo browser. */
public final class PhotoResponses {

    private PhotoResponses() {
    }

    public static ResponseEntity<InputStreamResource> of(PhotoContent photo) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Disposition", "inline")
                .body(new InputStreamResource(photo.content()));
    }
}
