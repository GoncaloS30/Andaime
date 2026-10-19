package pt.andaime.documents.api;

import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import pt.andaime.documents.application.DocumentService;
import pt.andaime.documents.application.DocumentService.ComplianceRow;
import pt.andaime.documents.application.DocumentService.DocumentType;
import pt.andaime.documents.application.DocumentService.DocumentView;
import pt.andaime.documents.application.DocumentService.TypeInput;
import pt.andaime.documents.application.DocumentService.Upload;

@RestController
@RequestMapping("/api/orgs/{orgId}")
public class DocumentController {

    private final DocumentService documents;

    public DocumentController(DocumentService documents) {
        this.documents = documents;
    }

    @GetMapping("/document-types")
    List<DocumentType> types(@PathVariable UUID orgId) {
        return documents.types();
    }

    @PostMapping("/document-types")
    @ResponseStatus(HttpStatus.CREATED)
    DocumentType createType(@PathVariable UUID orgId, @RequestBody TypeInput input) {
        return documents.saveType(null, input);
    }

    @PatchMapping("/document-types/{typeId}")
    DocumentType updateType(@PathVariable UUID orgId, @PathVariable UUID typeId, @RequestBody TypeInput input) {
        return documents.saveType(typeId, input);
    }

    @PostMapping("/document-types/{typeId}/archive")
    ResponseEntity<Void> archiveType(@PathVariable UUID orgId, @PathVariable UUID typeId) {
        documents.archiveType(typeId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/document-types/{typeId}/requirements")
    DocumentType requirements(@PathVariable UUID orgId, @PathVariable UUID typeId, @RequestBody RequirementsRequest request) {
        return documents.setRequirements(typeId, Boolean.TRUE.equals(request.everywhere()), request.countries());
    }

    @GetMapping("/documents")
    List<DocumentView> list(@PathVariable UUID orgId, @RequestParam(required = false) UUID employeeId,
            @RequestParam(required = false) UUID vehicleId, @RequestParam(required = false) UUID typeId,
            @RequestParam(required = false) String status, @RequestParam(defaultValue = "false") boolean archived) {
        return documents.list(employeeId, vehicleId, typeId, status, archived);
    }

    @GetMapping("/documents/compliance")
    List<ComplianceRow> compliance(@PathVariable UUID orgId, @RequestParam(required = false) String country) {
        return documents.compliance(country);
    }

    @GetMapping("/documents/{documentId}")
    DocumentView get(@PathVariable UUID orgId, @PathVariable UUID documentId) {
        return documents.get(documentId);
    }

    /** Upload multipart; o tipo do ficheiro é detetado pelo conteúdo (PDF, JPEG, PNG, WebP; máx. 15 MB). */
    @PostMapping(path = "/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    DocumentView upload(@PathVariable UUID orgId, @RequestParam UUID typeId, @RequestParam(required = false) UUID employeeId,
            @RequestParam(required = false) UUID vehicleId, @RequestParam(required = false) LocalDate issuedOn,
            @RequestParam(required = false) LocalDate expiresOn, @RequestPart("file") MultipartFile file) throws IOException {
        return documents.upload(new Upload(typeId, employeeId, vehicleId, issuedOn, expiresOn, file.getOriginalFilename(), file.getBytes()));
    }

    @GetMapping("/documents/{documentId}/versions/{versionId}/download")
    ResponseEntity<InputStreamResource> download(@PathVariable UUID orgId, @PathVariable UUID documentId, @PathVariable UUID versionId) {
        var file = documents.download(documentId, versionId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                .contentLength(file.size())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.filename(),
                        java.nio.charset.StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
                .body(new InputStreamResource(file.content()));
    }

    @PostMapping("/documents/{documentId}/versions/{versionId}/verify")
    DocumentView verify(@PathVariable UUID orgId, @PathVariable UUID documentId, @PathVariable UUID versionId) {
        return documents.verify(documentId, versionId);
    }

    @PostMapping("/documents/{documentId}/archive")
    DocumentView archive(@PathVariable UUID orgId, @PathVariable UUID documentId) {
        return documents.archive(documentId);
    }

    record RequirementsRequest(Boolean everywhere, List<String> countries) {
    }
}
