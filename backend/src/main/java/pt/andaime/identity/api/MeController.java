package pt.andaime.identity.api;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import pt.andaime.identity.MeView;
import pt.andaime.identity.SessionView;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.identity.application.MeService;
import pt.andaime.identity.application.SessionService;
import pt.andaime.shared.tenant.TenantContext;

@RestController
@RequestMapping("/api/me")
public class MeController {

    private final MeService meService;
    private final SessionService sessionService;

    public MeController(MeService meService, SessionService sessionService) {
        this.meService = meService;
        this.sessionService = sessionService;
    }

    @GetMapping
    MeView me(@AuthenticationPrincipal UserPrincipal principal) {
        try (var ignored = TenantContext.openForUser(principal.id())) {
            return meService.load(principal);
        }
    }

    @PatchMapping
    MeView update(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody UpdateProfileRequest request) {
        try (var ignored = TenantContext.openForUser(principal.id())) {
            return meService.updateProfile(
                    principal, request.displayName(), normalizeLocale(request.locale()));
        }
    }

    @PutMapping("/active-org")
    ResponseEntity<Void> selectActiveOrganization(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ActiveOrganizationRequest request) {
        try (var ignored = TenantContext.openForUser(principal.id())) {
            meService.selectActiveOrganization(principal, request.orgId());
        }
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sessions")
    List<SessionView> sessions(
            @AuthenticationPrincipal UserPrincipal principal,
            HttpServletRequest request) {
        return sessionService.list(principal, request.getSession().getId());
    }

    @DeleteMapping("/sessions/{id}")
    ResponseEntity<Void> deleteSession(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String id,
            HttpServletRequest request) {
        var current = sessionService.delete(principal, id, request.getSession().getId());
        if (current) {
            request.getSession().invalidate();
        }
        return ResponseEntity.noContent().build();
    }

    private String normalizeLocale(String value) {
        return Locale.forLanguageTag(value).toLanguageTag();
    }

    record UpdateProfileRequest(
            @NotBlank @Size(min = 2, max = 120) String displayName,
            @NotBlank @Size(max = 16)
            @Pattern(regexp = "^[A-Za-z]{2,3}(?:-[A-Za-z]{2}|-[0-9]{3})?$") String locale) {
    }

    record ActiveOrganizationRequest(@NotNull UUID orgId) {
    }
}
