package pt.andaime.organization.api;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.organization.OrganizationView;
import pt.andaime.organization.application.OrganizationService;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.ids.Ids;
import pt.andaime.shared.tenant.TenantContext;

@RestController
@RequestMapping("/api/orgs")
public class OrganizationController {

    private final OrganizationService organizationService;
    private final Ids ids;

    public OrganizationController(OrganizationService organizationService, Ids ids) {
        this.organizationService = organizationService;
        this.ids = ids;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    OrganizationView create(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateOrganizationRequest request) {
        var organizationId = ids.next();
        var country = request.country().toUpperCase(Locale.ROOT);
        var timezone = timezone(request.timezone());
        try (var ignored = TenantContext.open(organizationId, principal.id())) {
            return organizationService.create(
                    organizationId,
                    principal.id(),
                    request.name(),
                    request.legalName(),
                    request.taxId(),
                    country,
                    timezone);
        }
    }

    private String timezone(String value) {
        var candidate = value == null || value.isBlank() ? "Europe/Lisbon" : value.strip();
        try {
            return ZoneId.of(candidate).getId();
        } catch (DateTimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "O fuso horário é inválido.");
        }
    }

    record CreateOrganizationRequest(
            @NotBlank @Size(max = 160) String name,
            @Size(max = 200) String legalName,
            @Size(max = 40) String taxId,
            @NotBlank @Pattern(regexp = "^[A-Za-z]{2}$") String country,
            @Size(max = 80) String timezone) {
    }
}
