package pt.andaime.sitediary.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.api.PhotoResponses;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.sitediary.application.DiaryDocument;
import pt.andaime.sitediary.application.DiaryService;
import pt.andaime.sitediary.application.DiaryViews.DiaryPage;
import pt.andaime.sitediary.application.DiaryViews.EntryInput;
import pt.andaime.sitediary.application.DiaryViews.EntryView;
import pt.andaime.sitediary.application.DiaryViews.RecentEntry;
import pt.andaime.sitediary.application.DiaryWorkbook;

@RestController
@RequestMapping("/api/orgs/{orgId}")
public class DiaryController {

    private static final MediaType DOCX = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    private static final MediaType XLSX = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final DiaryService diary;
    private final DiaryDocument documents;
    private final DiaryWorkbook workbooks;

    public DiaryController(DiaryService diary, DiaryDocument documents, DiaryWorkbook workbooks) {
        this.diary = diary;
        this.documents = documents;
        this.workbooks = workbooks;
    }

    @GetMapping("/sites/{siteId}/diary")
    DiaryPage list(@PathVariable UUID orgId, @PathVariable UUID siteId,
            @RequestParam(required = false) String month, @RequestParam(required = false) String q) {
        return diary.list(siteId, month, q);
    }

    @GetMapping("/diary/recent")
    List<RecentEntry> recent(@PathVariable UUID orgId, @RequestParam(defaultValue = "6") int limit) {
        return diary.recent(limit);
    }

    @PostMapping("/sites/{siteId}/diary/entries")
    @ResponseStatus(HttpStatus.CREATED)
    EntryView create(@PathVariable UUID orgId, @PathVariable UUID siteId, @Valid @RequestBody EntryRequest request) {
        return diary.create(siteId, request.toInput());
    }

    @PatchMapping("/sites/{siteId}/diary/entries/{entryId}")
    EntryView update(@PathVariable UUID orgId, @PathVariable UUID siteId, @PathVariable UUID entryId,
            @Valid @RequestBody EntryRequest request) {
        if (request.version() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a versão do registo que está a alterar.");
        }
        return diary.update(siteId, entryId, request.toInput(), request.version());
    }

    @DeleteMapping("/sites/{siteId}/diary/entries/{entryId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID orgId, @PathVariable UUID siteId, @PathVariable UUID entryId) {
        diary.delete(siteId, entryId);
    }

    @PostMapping(path = "/sites/{siteId}/diary/entries/{entryId}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    EntryView addPhotos(@PathVariable UUID orgId, @PathVariable UUID siteId, @PathVariable UUID entryId,
            @RequestPart("files") List<MultipartFile> files, @RequestParam(required = false) UUID clientKey) {
        return diary.addPhotos(siteId, entryId, files, clientKey);
    }

    @DeleteMapping("/sites/{siteId}/diary/entries/{entryId}/photos/{photoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removePhoto(@PathVariable UUID orgId, @PathVariable UUID siteId, @PathVariable UUID entryId,
            @PathVariable UUID photoId) {
        diary.removePhoto(siteId, entryId, photoId);
    }

    @GetMapping("/sites/{siteId}/diary/entries/{entryId}/photos/{photoId}")
    ResponseEntity<InputStreamResource> photo(@PathVariable UUID orgId, @PathVariable UUID siteId, @PathVariable UUID entryId,
            @PathVariable UUID photoId) {
        return PhotoResponses.of(diary.photo(siteId, entryId, photoId));
    }

    /** Word (A4) com os filtros do ecrã; os dados são lidos já, as fotos ao escrever o ficheiro. */
    @GetMapping("/sites/{siteId}/diary/export.docx")
    ResponseEntity<StreamingResponseBody> exportWord(@PathVariable UUID orgId, @PathVariable UUID siteId,
            @RequestParam(required = false) String month, @RequestParam(required = false) String q) {
        var export = diary.export(siteId, month, q, DiaryService.DOCX_MAX_ENTRIES, DiaryService.DOCX_MAX_PHOTOS);
        var zone = TenantContext.zone();
        StreamingResponseBody body = output -> documents.write(output, export, zone);
        return download(body, DOCX, export.filenameBase() + ".docx");
    }

    @GetMapping("/sites/{siteId}/diary/export.xlsx")
    ResponseEntity<StreamingResponseBody> exportExcel(@PathVariable UUID orgId, @PathVariable UUID siteId,
            @RequestParam(required = false) String month, @RequestParam(required = false) String q) {
        var export = diary.export(siteId, month, q, DiaryService.XLSX_MAX_ENTRIES, Integer.MAX_VALUE);
        var zone = TenantContext.zone();
        StreamingResponseBody body = output -> workbooks.write(output, export, zone);
        return download(body, XLSX, export.filenameBase() + ".xlsx");
    }

    private static ResponseEntity<StreamingResponseBody> download(StreamingResponseBody body, MediaType type, String filename) {
        return ResponseEntity.ok()
                .contentType(type)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .body(body);
    }

    record EntryRequest(
            @NotNull LocalDate date,
            @NotNull @Size(min = 1, max = 160) String title,
            @Size(max = 10_000) String body,
            UUID clientKey,
            Integer version) {

        EntryInput toInput() {
            return new EntryInput(date, title, body, clientKey);
        }
    }
}
