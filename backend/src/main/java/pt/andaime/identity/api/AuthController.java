package pt.andaime.identity.api;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.DeferredCsrfToken;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import pt.andaime.identity.MeView;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.identity.application.AuthenticationService;
import pt.andaime.identity.application.MeService;
import pt.andaime.shared.tenant.TenantContext;

@Validated
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationService authenticationService;
    private final MeService meService;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(
            AuthenticationService authenticationService,
            MeService meService,
            SecurityContextRepository securityContextRepository) {
        this.authenticationService = authenticationService;
        this.meService = meService;
        this.securityContextRepository = securityContextRepository;
    }

    @GetMapping("/csrf")
    CsrfView csrf(HttpServletRequest request) {
        var deferredToken = (DeferredCsrfToken) request.getAttribute(DeferredCsrfToken.class.getName());
        var token = deferredToken.get();
        return new CsrfView(token.getToken(), token.getHeaderName(), token.getParameterName());
    }

    @PostMapping("/signup")
    ResponseEntity<Void> signup(@Valid @RequestBody SignupRequest request) {
        authenticationService.signup(request.email(), request.password(), request.displayName());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/verify-email")
    ResponseEntity<Void> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        authenticationService.verifyEmail(request.token());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/login")
    MeView login(
            @Valid @RequestBody LoginRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        var authentication = authenticationService.login(body.email(), body.password());
        request.getSession(true);
        request.changeSessionId();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        var principal = (UserPrincipal) authentication.getPrincipal();
        try (var ignored = TenantContext.openForUser(principal.id())) {
            return meService.load(principal);
        }
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password/forgot")
    ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        authenticationService.requestPasswordReset(request.email());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/password/reset")
    ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authenticationService.resetPassword(request.token(), request.password());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password/change")
    ResponseEntity<Void> changePassword(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChangePasswordRequest body,
            HttpServletRequest request) {
        authenticationService.changePassword(
                principal.id(), body.currentPassword(), body.newPassword(), request.getSession().getId());
        return ResponseEntity.noContent().build();
    }

    record CsrfView(String token, String headerName, String parameterName) {
    }

    record SignupRequest(
            @NotBlank @Email String email,
            @NotBlank @Size(min = 12, max = 128) String password,
            @NotBlank @Size(min = 2, max = 120) String displayName) {
    }

    record VerifyEmailRequest(@NotBlank String token) {
    }

    record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {
    }

    record ForgotPasswordRequest(@NotBlank @Email String email) {
    }

    record ResetPasswordRequest(
            @NotBlank String token,
            @NotBlank @Size(min = 12, max = 128) String password) {
    }

    record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 12, max = 128) String newPassword) {
    }
}
