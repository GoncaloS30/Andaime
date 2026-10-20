package pt.andaime.identity.api;

import java.time.Clock;
import java.time.Duration;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
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
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import pt.andaime.identity.MeView;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.identity.application.AuthenticationService;
import pt.andaime.identity.application.MeService;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.TenantContext;

@Validated
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /** Validade do estado "palavra-passe certa, falta o código". */
    static final Duration PENDING_VALIDITY = Duration.ofMinutes(5);
    private static final String PENDING_USER = "andaime.2fa.pending.user";
    private static final String PENDING_EMAIL = "andaime.2fa.pending.email";
    private static final String PENDING_EXPIRES = "andaime.2fa.pending.expires";

    private final AuthenticationService authenticationService;
    private final MeService meService;
    private final SecurityContextRepository securityContextRepository;
    private final Clock clock;

    public AuthController(
            AuthenticationService authenticationService,
            MeService meService,
            SecurityContextRepository securityContextRepository,
            Clock clock) {
        this.authenticationService = authenticationService;
        this.meService = meService;
        this.securityContextRepository = securityContextRepository;
        this.clock = clock;
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

    /**
     * Passo da palavra-passe. Sem verificação em dois passos, autentica e devolve o
     * {@link MeView}. Com ela ativa, responde 200 {@code {"twoFactorRequired": true}} sem
     * autenticar: a palavra-passe estava certa (não é um erro) e o estado pendente fica numa
     * sessão nova, não autenticada, durante {@link #PENDING_VALIDITY}.
     */
    @PostMapping("/login")
    Object login(
            @Valid @RequestBody LoginRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        return switch (authenticationService.login(body.email(), body.password())) {
            case AuthenticationService.Authenticated authenticated ->
                    establishSession(authenticated.authentication(), request, response);
            case AuthenticationService.SecondFactorRequired pending -> {
                // Sessão nova (nunca a de outro utilizador já autenticado neste browser).
                var previous = request.getSession(false);
                if (previous != null) {
                    previous.invalidate();
                }
                SecurityContextHolder.clearContext();
                var session = request.getSession(true);
                session.setAttribute(PENDING_USER, pending.userId().toString());
                session.setAttribute(PENDING_EMAIL, pending.email());
                session.setAttribute(PENDING_EXPIRES, clock.millis() + PENDING_VALIDITY.toMillis());
                yield new TwoFactorChallengeView(true);
            }
        };
    }

    /** Segundo passo: conclui o login exatamente como um login sem verificação em dois passos. */
    @PostMapping("/login/2fa")
    MeView loginSecondFactor(
            @Valid @RequestBody SecondFactorRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        var session = request.getSession(false);
        var userId = session == null ? null : (String) session.getAttribute(PENDING_USER);
        var email = session == null ? null : (String) session.getAttribute(PENDING_EMAIL);
        var expires = session == null ? null : (Long) session.getAttribute(PENDING_EXPIRES);
        if (userId == null || email == null || expires == null || expires < clock.millis()) {
            if (session != null) {
                clearPending(session);
            }
            throw new ApiException(HttpStatus.UNAUTHORIZED, "two-factor-expired",
                    "O passo de verificação expirou. Entre novamente com a palavra-passe.");
        }
        var hasCode = body.code() != null && !body.code().isBlank();
        var hasRecovery = body.recoveryCode() != null && !body.recoveryCode().isBlank();
        if (hasCode == hasRecovery) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation",
                    "Indique o código da aplicação ou um código de recuperação.");
        }
        var pendingUser = UUID.fromString(userId);
        Authentication authentication;
        // Contexto do próprio utilizador: o uso de um código de recuperação fica auditado.
        try (var ignored = TenantContext.openForUser(pendingUser)) {
            authentication = authenticationService.completeSecondFactor(
                    pendingUser, email, hasCode ? body.code() : null, hasRecovery ? body.recoveryCode() : null);
        }
        clearPending(session);
        return establishSession(authentication, request, response);
    }

    private MeView establishSession(
            Authentication authentication,
            HttpServletRequest request,
            HttpServletResponse response) {
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

    private static void clearPending(HttpSession session) {
        session.removeAttribute(PENDING_USER);
        session.removeAttribute(PENDING_EMAIL);
        session.removeAttribute(PENDING_EXPIRES);
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

    record TwoFactorChallengeView(boolean twoFactorRequired) {
    }

    record SecondFactorRequest(@Size(max = 16) String code, @Size(max = 32) String recoveryCode) {
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
