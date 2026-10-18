package pt.andaime.identity.api;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.identity.MeView;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.identity.application.MeService;
import pt.andaime.shared.tenant.TenantContext;

@RestController
@RequestMapping("/api/me")
public class MeController {

    private final MeService meService;

    public MeController(MeService meService) {
        this.meService = meService;
    }

    @GetMapping
    MeView me(@AuthenticationPrincipal UserPrincipal principal) {
        try (var ignored = TenantContext.openForUser(principal.id())) {
            return meService.load(principal);
        }
    }
}
