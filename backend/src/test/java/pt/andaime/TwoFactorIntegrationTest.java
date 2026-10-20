package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;
import pt.andaime.identity.application.Totp;

/** Verificação em dois passos ponta a ponta: sessão, CSRF e PostgreSQL reais. */
class TwoFactorIntegrationTest extends ApiTestSupport {

    @Test
    void configuraEntraComCodigoRecusaReutilizacaoEUsaRecuperacaoUmaVez() throws Exception {
        var password = "Palavra-passe-" + UUID.randomUUID();
        var user = newUser("dois-passos", password);
        perform(user, get("/api/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.twoFactorEnabled").value(false))
                .andExpect(jsonPath("$.twoFactorSetupRequired").value(false));

        // Configuração: segredo Base32 de 20 bytes e URI otpauth com emissor e email.
        var setup = body(perform(user, post("/api/me/2fa/setup")).andExpect(status().isOk()));
        String encodedSecret = JsonPath.read(setup, "$.secret");
        String uri = JsonPath.read(setup, "$.otpauthUri");
        var secret = Totp.base32Decode(encodedSecret);
        assertThat(secret).hasSize(20);
        assertThat(uri).startsWith("otpauth://totp/Andaime:" + user.email().replace("@", "%40") + "?")
                .contains("secret=" + encodedSecret, "issuer=Andaime", "digits=6", "period=30", "algorithm=SHA1");
        perform(user, get("/api/me/2fa"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.pending").value(true))
                .andExpect(jsonPath("$.secret").doesNotExist());

        // O segredo nunca fica em claro na base de dados.
        var stored = asOwner(jdbc -> jdbc.queryForObject("""
                SELECT secret_ciphertext FROM user_totp
                WHERE user_id = (SELECT id FROM users WHERE email = ?)
                """, byte[].class, user.email()));
        assertThat(new String(stored, StandardCharsets.ISO_8859_1))
                .doesNotContain(new String(secret, StandardCharsets.ISO_8859_1));

        // Código errado não ativa; o certo ativa e devolve 10 códigos de recuperação.
        perform(user, post("/api/me/2fa/confirm").content("{\"code\":\"" + wrongCode(secret) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid-code"));
        var baseStep = Totp.step(Instant.now());
        var confirmed = body(perform(user, post("/api/me/2fa/confirm")
                .content("{\"code\":\"" + Totp.code(secret, baseStep) + "\"}"))
                .andExpect(status().isOk()));
        List<String> recoveryCodes = JsonPath.read(confirmed, "$.recoveryCodes");
        assertThat(recoveryCodes).hasSize(10).doesNotHaveDuplicates()
                .allMatch(code -> code.matches("[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}"));
        perform(user, get("/api/me"))
                .andExpect(jsonPath("$.twoFactorEnabled").value(true));
        perform(user, get("/api/me/2fa"))
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.recoveryCodesRemaining").value(10));
        // Depois de ativa, não volta a mostrar (nem a trocar) o segredo.
        perform(user, post("/api/me/2fa/setup"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("two-factor-enabled"));

        perform(user, post("/api/auth/logout")).andExpect(status().isNoContent());

        // Palavra-passe certa: só o pedido do segundo passo, nada autenticado.
        var pending = passwordStep(user.email(), password);
        pending.result().andExpect(status().isOk())
                .andExpect(jsonPath("$.twoFactorRequired").value(true))
                .andExpect(jsonPath("$.user").doesNotExist());
        mockMvc.perform(get("/api/me").cookie(pending.session())).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/me/2fa").cookie(pending.session())).andExpect(status().isUnauthorized());

        // Código errado é recusado e não autentica.
        secondStep(pending, "{\"code\":\"" + wrongCode(secret) + "\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid-code"));
        // O código já usado na confirmação (mesmo passo) é recusado.
        secondStep(pending, "{\"code\":\"" + Totp.code(secret, baseStep) + "\"}")
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/me").cookie(pending.session())).andExpect(status().isUnauthorized());

        // Código certo (passo seguinte, dentro da janela de ±1): sessão nova e autenticada.
        var nextCode = Totp.code(secret, baseStep + 1);
        var completed = secondStep(pending, "{\"code\":\"" + nextCode + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value(user.email()))
                .andExpect(jsonPath("$.twoFactorEnabled").value(true))
                .andReturn();
        var authenticated = completed.getResponse().getCookie("ANDAIME_SESSION");
        assertThat(authenticated).isNotNull();
        assertThat(authenticated.getValue()).isNotEqualTo(pending.session().getValue());
        mockMvc.perform(get("/api/me").cookie(authenticated)).andExpect(status().isOk());
        // A sessão pendente deixou de existir com esse id (proteção contra fixação de sessão).
        mockMvc.perform(get("/api/me").cookie(pending.session())).andExpect(status().isUnauthorized());

        // O mesmo código não serve uma segunda vez, nem noutro login.
        var replay = passwordStep(user.email(), password);
        secondStep(replay, "{\"code\":\"" + nextCode + "\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("invalid-code"));

        // Código de recuperação: funciona uma vez (com ou sem hífenes, maiúsculas indiferentes).
        var recovery = recoveryCodes.getFirst();
        secondStep(replay, "{\"recoveryCode\":\"" + recovery.toUpperCase().replace("-", "") + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value(user.email()));
        var again = passwordStep(user.email(), password);
        secondStep(again, "{\"recoveryCode\":\"" + recovery + "\"}")
                .andExpect(status().isUnauthorized());
        // Os dois campos ao mesmo tempo (ou nenhum) são um pedido inválido.
        secondStep(again, "{\"code\":\"123456\",\"recoveryCode\":\"" + recoveryCodes.get(1) + "\"}")
                .andExpect(status().isBadRequest());
        secondStep(again, "{}").andExpect(status().isBadRequest());
        var loggedIn = completeWithRecovery(again, recoveryCodes.get(1));
        perform(loggedIn, get("/api/me/2fa"))
                .andExpect(jsonPath("$.recoveryCodesRemaining").value(8));

        // Desativar exige a palavra-passe atual e um código válido.
        perform(loggedIn, post("/api/me/2fa/disable")
                .content("{\"password\":\"errada-" + UUID.randomUUID() + "\",\"code\":\"" + recoveryCodes.get(2) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid-password"));
        perform(loggedIn, post("/api/me/2fa/disable")
                .content("{\"password\":\"" + password + "\",\"code\":\"" + wrongCode(secret) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid-code"));
        perform(loggedIn, post("/api/me/2fa/disable")
                .content("{\"password\":\"" + password + "\",\"code\":\"" + recoveryCodes.getFirst() + "\"}"))
                .andExpect(status().isBadRequest());
        perform(loggedIn, post("/api/me/2fa/disable").content("{\"password\":\"" + password + "\"}"))
                .andExpect(status().isBadRequest());
        perform(loggedIn, post("/api/me/2fa/disable")
                .content("{\"password\":\"" + password + "\",\"code\":\"" + recoveryCodes.get(2) + "\"}"))
                .andExpect(status().isNoContent());
        perform(loggedIn, get("/api/me")).andExpect(jsonPath("$.twoFactorEnabled").value(false));
        Integer remainingCodes = asOwner(jdbc -> jdbc.queryForObject("""
                SELECT count(*) FROM user_recovery_codes
                WHERE user_id = (SELECT id FROM users WHERE email = ?)
                """, Integer.class, user.email()));
        assertThat(remainingCodes).isZero();

        // Sem 2FA, o login volta a ser de um só passo.
        passwordStep(user.email(), password).result()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value(user.email()));

        // Auditoria, sem organização, em nome do próprio.
        List<String> actions = asOwner(jdbc -> jdbc.queryForList("""
                SELECT action FROM audit_event
                WHERE actor_user_id = (SELECT id FROM users WHERE email = ?) AND organization_id IS NULL
                ORDER BY occurred_at, id
                """, String.class, user.email()));
        assertThat(actions).containsExactly("user.2fa-enabled", "user.2fa-recovery-used",
                "user.2fa-recovery-used", "user.2fa-recovery-used", "user.2fa-disabled");
    }

    @Test
    void falhasNoSegundoPassoContamParaOBloqueioDoLogin() throws Exception {
        var password = "Palavra-passe-" + UUID.randomUUID();
        var user = newUser("bloqueio-2fa", password);
        var secret = enable(user);
        perform(user, post("/api/auth/logout")).andExpect(status().isNoContent());

        var pending = passwordStep(user.email(), password);
        for (var attempt = 0; attempt < 5; attempt++) {
            secondStep(pending, "{\"code\":\"" + wrongCode(secret) + "\"}").andExpect(status().isUnauthorized());
        }
        // Bloqueado: nem o código certo nem a palavra-passe passam até o bloqueio expirar.
        secondStep(pending, "{\"code\":\"" + Totp.code(secret, Totp.step(Instant.now()) + 1) + "\"}")
                .andExpect(status().isTooManyRequests());
        passwordStep(user.email(), password).result().andExpect(status().isTooManyRequests());

        // Sem passo pendente, o segundo passo é recusado.
        var csrf = csrf(null);
        mockMvc.perform(post("/api/auth/login/2fa").cookie(csrf.csrfCookie())
                        .header("X-XSRF-TOKEN", csrf.csrfToken()).contentType("application/json")
                        .content("{\"code\":\"123456\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("two-factor-expired"));
    }

    @Test
    void politicaDaEmpresaSinalizaAdministradoresSemVerificacao() throws Exception {
        var owner = newUser("politica-2fa");
        var orgId = createOrganization(owner, "Andaimes Seguros, Lda.");
        var worker = joinAs(owner, orgId, "WORKER", "trabalhador-2fa");

        perform(owner, get("/api/orgs/{orgId}", orgId))
                .andExpect(jsonPath("$.requireAdmin2fa").value(false));
        // Um trabalhador não muda a política.
        perform(worker, patch("/api/orgs/{orgId}", orgId)
                .content("{\"name\":\"Andaimes Seguros, Lda.\",\"requireAdmin2fa\":true,\"version\":0}"))
                .andExpect(status().isForbidden());
        perform(owner, patch("/api/orgs/{orgId}", orgId)
                .content("{\"name\":\"Andaimes Seguros, Lda.\",\"requireAdmin2fa\":true,\"version\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requireAdmin2fa").value(true));
        // Sem o campo, a política mantém-se.
        perform(owner, patch("/api/orgs/{orgId}", orgId)
                .content("{\"name\":\"Andaimes Seguros II, Lda.\",\"version\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requireAdmin2fa").value(true));
        perform(owner, get("/api/orgs/{orgId}/audit", orgId))
                .andExpect(jsonPath("$.items[?(@.changes.requireAdmin2fa.to == true)]").exists());

        // O dono sem 2FA continua a entrar, mas /api/me sinaliza; o trabalhador não é abrangido.
        perform(owner, get("/api/me")).andExpect(jsonPath("$.twoFactorSetupRequired").value(true));
        perform(worker, get("/api/me")).andExpect(jsonPath("$.twoFactorSetupRequired").value(false));

        enable(owner);
        perform(owner, get("/api/me"))
                .andExpect(jsonPath("$.twoFactorEnabled").value(true))
                .andExpect(jsonPath("$.twoFactorSetupRequired").value(false));
    }

    // --- utilitários -----------------------------------------------------------------------

    record Pending(ResultActions result, Cookie session) {
    }

    /** Consultas de verificação como dono da base de dados (sem RLS), numa ligação de uso único. */
    private <T> T asOwner(Function<JdbcTemplate, T> query) throws Exception {
        try (var connection = ownerConnection()) {
            return query.apply(new JdbcTemplate(new SingleConnectionDataSource(connection, true)));
        }
    }

    /** Configura e confirma a 2FA; devolve o segredo. */
    private byte[] enable(Session user) throws Exception {
        var setup = body(perform(user, post("/api/me/2fa/setup")).andExpect(status().isOk()));
        var secret = Totp.base32Decode(JsonPath.read(setup, "$.secret"));
        perform(user, post("/api/me/2fa/confirm")
                .content("{\"code\":\"" + Totp.code(secret, Totp.step(Instant.now())) + "\"}"))
                .andExpect(status().isOk());
        return secret;
    }

    private Pending passwordStep(String email, String password) throws Exception {
        var csrf = csrf(null);
        var result = mockMvc.perform(post("/api/auth/login").cookie(csrf.csrfCookie())
                .header("X-XSRF-TOKEN", csrf.csrfToken()).contentType("application/json")
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)));
        return new Pending(result, result.andReturn().getResponse().getCookie("ANDAIME_SESSION"));
    }

    private ResultActions secondStep(Pending pending, String json) throws Exception {
        var csrf = csrf(pending.session());
        return mockMvc.perform(post("/api/auth/login/2fa").cookie(pending.session(), csrf.csrfCookie())
                .header("X-XSRF-TOKEN", csrf.csrfToken()).contentType("application/json").content(json));
    }

    private Session completeWithRecovery(Pending pending, String code) throws Exception {
        var response = secondStep(pending, "{\"recoveryCode\":\"" + code + "\"}")
                .andExpect(status().isOk()).andReturn().getResponse();
        var session = response.getCookie("ANDAIME_SESSION");
        var csrf = csrf(session);
        return new Session(null, session, csrf.csrfCookie(), csrf.csrfToken());
    }

    /** Um código de seis dígitos que não coincide com nenhum passo da janela atual. */
    private static String wrongCode(byte[] secret) {
        var step = Totp.step(Instant.now());
        var valid = new ArrayList<String>();
        for (var offset = -2; offset <= 2; offset++) {
            valid.add(Totp.code(secret, step + offset));
        }
        var candidate = 0;
        while (valid.contains("%06d".formatted(candidate))) {
            candidate++;
        }
        return "%06d".formatted(candidate);
    }
}
