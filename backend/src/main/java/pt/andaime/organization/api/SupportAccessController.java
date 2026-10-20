package pt.andaime.organization.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.organization.application.SupportAccessService;
import pt.andaime.organization.application.SupportAccessService.GrantView;

/** Acesso temporário da equipa de suporte, autorizado pela própria empresa. */
@RestController
@RequestMapping("/api/orgs/{orgId}/support-access")
public class SupportAccessController {

    private final SupportAccessService support;

    public SupportAccessController(SupportAccessService support) {
        this.support = support;
    }

    @GetMapping
    List<GrantView> list(@PathVariable UUID orgId) {
        return support.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    GrantView grant(@PathVariable UUID orgId, @RequestBody GrantRequest request) {
        return support.grant(request.email(), request.hours() == null ? 4 : request.hours(), request.reason());
    }

    @PostMapping("/{grantId}/revoke")
    GrantView revoke(@PathVariable UUID orgId, @PathVariable UUID grantId) {
        return support.revoke(grantId);
    }

    record GrantRequest(String email, Integer hours, String reason) {
    }
}
