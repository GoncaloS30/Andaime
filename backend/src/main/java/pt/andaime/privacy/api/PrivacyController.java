package pt.andaime.privacy.api;

import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import pt.andaime.privacy.application.PrivacyExportService;
import pt.andaime.privacy.application.PrivacyExportService.ExportPackage;

/** Exportação RGPD dos dados de um trabalhador (pela empresa) ou do próprio (pela sua conta). */
@RestController
@RequestMapping("/api/orgs/{orgId}")
public class PrivacyController {

    private static final MediaType ZIP = MediaType.parseMediaType("application/zip");

    private final PrivacyExportService exports;

    public PrivacyController(PrivacyExportService exports) {
        this.exports = exports;
    }

    @GetMapping("/employees/{employeeId}/export")
    ResponseEntity<StreamingResponseBody> exportEmployee(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return zip(exports.forEmployee(employeeId));
    }

    @GetMapping("/me/export")
    ResponseEntity<StreamingResponseBody> exportMine(@PathVariable UUID orgId) {
        return zip(exports.forCurrentUser());
    }

    private ResponseEntity<StreamingResponseBody> zip(ExportPackage export) {
        StreamingResponseBody body = output -> exports.write(export, output);
        return ResponseEntity.ok()
                .contentType(ZIP)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(export.filename()).build().toString())
                .body(body);
    }
}
