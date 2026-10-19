package pt.andaime.organization.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.organization.InvitationView;
import pt.andaime.organization.MemberView;
import pt.andaime.organization.application.InvitationService;
import pt.andaime.organization.application.MembershipService;
import pt.andaime.shared.tenant.OrgRole;

@RestController
@RequestMapping("/api/orgs/{orgId}")
public class MemberController {

    private final MembershipService membershipService;
    private final InvitationService invitationService;

    public MemberController(MembershipService membershipService, InvitationService invitationService) {
        this.membershipService = membershipService;
        this.invitationService = invitationService;
    }

    @GetMapping("/members")
    List<MemberView> members(@PathVariable UUID orgId) {
        return membershipService.list(orgId);
    }

    @PatchMapping("/members/{membershipId}")
    MemberView changeRole(
            @PathVariable UUID orgId,
            @PathVariable UUID membershipId,
            @Valid @RequestBody ChangeRoleRequest request) {
        return membershipService.changeRole(orgId, membershipId, request.role(), request.version());
    }

    @DeleteMapping("/members/{membershipId}")
    ResponseEntity<Void> deactivate(@PathVariable UUID orgId, @PathVariable UUID membershipId) {
        membershipService.deactivate(orgId, membershipId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/invitations")
    List<InvitationView> invitations(@PathVariable UUID orgId) {
        return invitationService.listPending(orgId);
    }

    @PostMapping("/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    InvitationCreated invite(
            @PathVariable UUID orgId,
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody InviteRequest request) {
        return new InvitationCreated(invitationService.invite(orgId, request.email(), request.role()));
    }

    @DeleteMapping("/invitations/{invitationId}")
    ResponseEntity<Void> revoke(@PathVariable UUID orgId, @PathVariable UUID invitationId) {
        invitationService.revoke(orgId, invitationId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/invitations/{invitationId}/resend")
    ResponseEntity<Void> resend(@PathVariable UUID orgId, @PathVariable UUID invitationId) {
        invitationService.resend(orgId, invitationId);
        return ResponseEntity.noContent().build();
    }

    record ChangeRoleRequest(@NotNull OrgRole role, @NotNull Integer version) {
    }

    record InviteRequest(@NotBlank @Email @Size(max = 254) String email, @NotNull OrgRole role) {
    }

    record InvitationCreated(UUID id) {
    }
}
