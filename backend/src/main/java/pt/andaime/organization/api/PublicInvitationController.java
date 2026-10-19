package pt.andaime.organization.api;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.identity.UserPrincipal;
import pt.andaime.organization.InvitationView;
import pt.andaime.organization.application.InvitationService;

/** Convites por token: pré-visualização pública e aceitação com sessão. */
@RestController
@RequestMapping("/api/invitations/{token}")
public class PublicInvitationController {

    private final InvitationService invitationService;

    public PublicInvitationController(InvitationService invitationService) {
        this.invitationService = invitationService;
    }

    @GetMapping
    InvitationView.Preview preview(@PathVariable String token) {
        return invitationService.preview(token);
    }

    @PostMapping("/accept")
    InvitationView.Accepted accept(@PathVariable String token, @AuthenticationPrincipal UserPrincipal principal) {
        return invitationService.accept(token, principal.id(), principal.email());
    }
}
