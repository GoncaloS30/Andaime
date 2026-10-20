package pt.andaime.identity.api;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.identity.application.TwoFactorService;
import pt.andaime.shared.tenant.TenantContext;

/** Verificação em dois passos da própria conta (aplicação autenticadora TOTP). */
@RestController
@RequestMapping("/api/me/2fa")
public class TwoFactorController {

    private final TwoFactorService twoFactorService;

    public TwoFactorController(TwoFactorService twoFactorService) {
        this.twoFactorService = twoFactorService;
    }

    @GetMapping
    TwoFactorService.StatusView status(@AuthenticationPrincipal UserPrincipal principal) {
        return twoFactorService.status(principal.id());
    }

    /** Segredo novo (pendente): devolvido só aqui, para a aplicação autenticadora. */
    @PostMapping("/setup")
    TwoFactorService.SetupView setup(@AuthenticationPrincipal UserPrincipal principal) {
        return twoFactorService.setup(principal.id(), principal.email());
    }

    /** Ativa com um código da aplicação; os códigos de recuperação só são mostrados nesta resposta. */
    @PostMapping("/confirm")
    RecoveryCodesView confirm(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ConfirmRequest request) {
        try (var ignored = TenantContext.openForUser(principal.id())) {
            return new RecoveryCodesView(twoFactorService.confirm(principal.id(), request.code()));
        }
    }

    @PostMapping("/disable")
    ResponseEntity<Void> disable(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody DisableRequest request) {
        try (var ignored = TenantContext.openForUser(principal.id())) {
            twoFactorService.disable(principal.id(), request.password(), request.code());
        }
        return ResponseEntity.noContent().build();
    }

    record ConfirmRequest(@NotBlank @Size(max = 16) String code) {
    }

    record DisableRequest(@NotBlank String password, @NotBlank @Size(max = 32) String code) {
    }

    record RecoveryCodesView(List<String> recoveryCodes) {
    }
}
