package pt.andaime.sites.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.api.PhotoResponses;
import pt.andaime.sites.application.ClientService;
import pt.andaime.sites.application.IssueService;
import pt.andaime.sites.application.SiteService;
import pt.andaime.sites.application.SiteViews.ClientInput;
import pt.andaime.sites.application.SiteViews.ClientView;
import pt.andaime.sites.application.SiteViews.IssueView;
import pt.andaime.sites.application.SiteViews.SiteDetail;
import pt.andaime.sites.application.SiteViews.SiteInput;
import pt.andaime.sites.application.SiteViews.SiteSummary;

@RestController
@RequestMapping("/api/orgs/{orgId}")
public class SiteController {

    private final SiteService sites;
    private final ClientService clients;
    private final IssueService issues;

    public SiteController(SiteService sites, ClientService clients, IssueService issues) {
        this.sites = sites;
        this.clients = clients;
        this.issues = issues;
    }

    // --- obras ---------------------------------------------------------------------------

    @GetMapping("/sites")
    List<SiteSummary> sites(
            @PathVariable UUID orgId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @Pattern(regexp = "PLANNED|ACTIVE|SUSPENDED|DONE") String status,
            @RequestParam(required = false) @Pattern(regexp = "[A-Za-z]{2}") String country,
            @RequestParam(defaultValue = "false") boolean archived) {
        return sites.list(q, status, country, archived);
    }

    @GetMapping("/sites/next-code")
    Map<String, String> nextCode(@PathVariable UUID orgId) {
        return Map.of("code", sites.suggestCode());
    }

    @GetMapping("/sites/{siteId}")
    SiteDetail site(@PathVariable UUID orgId, @PathVariable UUID siteId) {
        return sites.get(siteId);
    }

    @PutMapping(path = "/sites/{siteId}/photo", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    SiteDetail setPhoto(@PathVariable UUID orgId, @PathVariable UUID siteId,
            @org.springframework.web.bind.annotation.RequestPart("file") org.springframework.web.multipart.MultipartFile file) {
        return sites.setPhoto(siteId, file);
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/sites/{siteId}/photo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removePhoto(@PathVariable UUID orgId, @PathVariable UUID siteId) {
        sites.removePhoto(siteId);
    }

    @GetMapping("/sites/{siteId}/photo")
    org.springframework.http.ResponseEntity<org.springframework.core.io.InputStreamResource> photo(@PathVariable UUID orgId,
            @PathVariable UUID siteId) {
        return PhotoResponses.of(sites.photo(siteId));
    }

    @PostMapping("/sites")
    @ResponseStatus(HttpStatus.CREATED)
    SiteDetail create(@PathVariable UUID orgId, @Valid @RequestBody SiteRequest request) {
        return sites.create(request.toInput());
    }

    @PatchMapping("/sites/{siteId}")
    SiteDetail update(@PathVariable UUID orgId, @PathVariable UUID siteId, @Valid @RequestBody SiteRequest request) {
        if (request.version() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a versão da obra que está a alterar.");
        }
        return sites.update(siteId, request.toInput(), request.version());
    }

    @PostMapping("/sites/{siteId}/archive")
    SiteDetail archive(@PathVariable UUID orgId, @PathVariable UUID siteId) {
        return sites.archive(siteId, true);
    }

    @PostMapping("/sites/{siteId}/restore")
    SiteDetail restore(@PathVariable UUID orgId, @PathVariable UUID siteId) {
        return sites.archive(siteId, false);
    }

    // --- ocorrências ---------------------------------------------------------------------

    @GetMapping("/sites/{siteId}/issues")
    List<IssueView> siteIssues(@PathVariable UUID orgId, @PathVariable UUID siteId,
            @RequestParam(required = false) @Pattern(regexp = "OPEN|RESOLVED") String status) {
        sites.get(siteId);
        return issues.list(siteId, status);
    }

    @GetMapping("/issues")
    List<IssueView> allIssues(@PathVariable UUID orgId,
            @RequestParam(required = false) @Pattern(regexp = "OPEN|RESOLVED") String status) {
        return issues.list(null, status);
    }

    @PostMapping("/sites/{siteId}/issues")
    @ResponseStatus(HttpStatus.CREATED)
    IssueView report(@PathVariable UUID orgId, @PathVariable UUID siteId, @Valid @RequestBody IssueRequest request) {
        return issues.report(siteId, request.category(), request.description());
    }

    @PostMapping("/issues/{issueId}/resolve")
    IssueView resolve(@PathVariable UUID orgId, @PathVariable UUID issueId,
            @Valid @RequestBody(required = false) ResolveRequest request) {
        return issues.resolve(issueId, request == null ? null : request.note());
    }

    // --- clientes ------------------------------------------------------------------------

    @GetMapping("/clients")
    List<ClientView> clients(@PathVariable UUID orgId, @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "false") boolean archived) {
        return clients.list(q, archived);
    }

    @GetMapping("/clients/{clientId}")
    ClientView client(@PathVariable UUID orgId, @PathVariable UUID clientId) {
        return clients.get(clientId);
    }

    @PostMapping("/clients")
    @ResponseStatus(HttpStatus.CREATED)
    ClientView createClient(@PathVariable UUID orgId, @Valid @RequestBody ClientRequest request) {
        return clients.create(request.toInput());
    }

    @PatchMapping("/clients/{clientId}")
    ClientView updateClient(@PathVariable UUID orgId, @PathVariable UUID clientId, @Valid @RequestBody ClientRequest request) {
        if (request.version() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a versão do cliente que está a alterar.");
        }
        return clients.update(clientId, request.toInput(), request.version());
    }

    record SiteRequest(
            @Size(max = 20) @Pattern(regexp = "^[A-Za-z0-9-]*$", message = "Use só letras, números e hífen.") String code,
            @NotBlank @Size(min = 2, max = 160) String name,
            UUID clientId,
            @NotBlank @Pattern(regexp = "^[A-Za-z]{2}$") String country,
            @Size(max = 80) String city,
            @Size(max = 300) String address,
            @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
            @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude,
            @Size(max = 64) String timezone,
            @Pattern(regexp = "PLANNED|ACTIVE|SUSPENDED|DONE") String status,
            LocalDate startDate,
            LocalDate endDate,
            @Min(60) @Max(100_000_000) Integer hourLimitMin,
            @Min(0) @Max(100_000_000) Integer baselineRealizedMin,
            @Min(0) @Max(100_000_000) Integer baselineApprovedMin,
            UUID directorUserId,
            UUID foremanEmployeeId,
            @Pattern(regexp = "^#[0-9a-fA-F]{6}$") String color,
            @Size(max = 2000) String description,
            @Size(max = 40) String erpOrder,
            Integer version) {

        SiteInput toInput() {
            return new SiteInput(code, name, clientId, country, city, address, latitude, longitude, timezone, status,
                    startDate, endDate, hourLimitMin, baselineRealizedMin, baselineApprovedMin, directorUserId,
                    foremanEmployeeId, color, description, erpOrder);
        }
    }

    record ClientRequest(
            @NotBlank @Size(min = 2, max = 160) String name,
            @Size(max = 40) String taxId,
            @Size(max = 120) String contactName,
            @Email @Size(max = 254) String email,
            @Size(max = 40) String phone,
            @Pattern(regexp = "^([A-Za-z]{2})?$") String country,
            Integer version) {

        ClientInput toInput() {
            return new ClientInput(name, taxId, contactName, email, phone, country);
        }
    }

    record IssueRequest(
            @NotNull @Pattern(regexp = "SAFETY|MATERIAL|EQUIPMENT|ACCESS|OTHER") String category,
            @NotBlank @Size(min = 3, max = 2000) String description) {
    }

    record ResolveRequest(@Size(max = 2000) String note) {
    }
}
