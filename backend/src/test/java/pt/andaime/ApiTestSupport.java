package pt.andaime;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

import jakarta.servlet.http.Cookie;

/** Utilitários HTTP dos testes de API: contas reais, sessão por cookie e CSRF reais. */
abstract class ApiTestSupport extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    record Session(String email, Cookie session, Cookie csrfCookie, String csrfToken) {
    }

    ResultActions perform(Session user, MockHttpServletRequestBuilder builder) throws Exception {
        return mockMvc.perform(builder
                .cookie(user.session(), user.csrfCookie())
                .header("X-XSRF-TOKEN", user.csrfToken())
                .contentType("application/json"));
    }

    String body(ResultActions actions) throws Exception {
        return actions.andReturn().getResponse().getContentAsString();
    }

    Session newUser(String prefixOrEmail) throws Exception {
        var email = prefixOrEmail.contains("@") ? prefixOrEmail : uniqueEmail(prefixOrEmail);
        var password = "Palavra-passe-" + UUID.randomUUID();
        var csrf = csrf(null);
        mockMvc.perform(post("/api/auth/signup").cookie(csrf.csrfCookie()).header("X-XSRF-TOKEN", csrf.csrfToken())
                        .contentType("application/json")
                        .content("{\"email\":\"%s\",\"password\":\"%s\",\"displayName\":\"Pessoa %s\"}"
                                .formatted(email, password, email.substring(0, 4))))
                .andExpect(status().isAccepted());
        var token = ArgumentCaptor.forClass(String.class);
        verify(mailGateway).sendVerification(eq(email), anyString(), token.capture());
        mockMvc.perform(post("/api/auth/verify-email").cookie(csrf.csrfCookie()).header("X-XSRF-TOKEN", csrf.csrfToken())
                        .contentType("application/json").content("{\"token\":\"" + token.getValue() + "\"}"))
                .andExpect(status().isNoContent());
        var login = mockMvc.perform(post("/api/auth/login").cookie(csrf.csrfCookie())
                        .header("X-XSRF-TOKEN", csrf.csrfToken()).contentType("application/json")
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andExpect(status().isOk())
                .andReturn();
        var session = login.getResponse().getCookie("ANDAIME_SESSION");
        var authenticated = csrf(session);
        return new Session(email, session, authenticated.csrfCookie(), authenticated.csrfToken());
    }

    Session csrf(Cookie session) throws Exception {
        var builder = get("/api/auth/csrf");
        if (session != null) {
            builder.cookie(session);
        }
        var response = mockMvc.perform(builder).andReturn().getResponse();
        return new Session(null, session, response.getCookie("XSRF-TOKEN"),
                JsonPath.read(response.getContentAsString(), "$.token"));
    }

    UUID createOrganization(Session owner, String name) throws Exception {
        var body = perform(owner, post("/api/orgs").content("{\"name\":\"" + name + "\",\"country\":\"PT\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(body, "$.id"));
    }

    /** Convida, cria a conta convidada e aceita: devolve a sessão do novo membro. */
    Session joinAs(Session admin, UUID orgId, String role, String prefix) throws Exception {
        var email = uniqueEmail(prefix);
        perform(admin, post("/api/orgs/{orgId}/invitations", orgId)
                .content("{\"email\":\"" + email + "\",\"role\":\"" + role + "\"}"))
                .andExpect(status().isCreated());
        var token = ArgumentCaptor.forClass(String.class);
        verify(organizationMailGateway).sendInvitation(eq(email), anyString(), anyString(), eq(role), token.capture());
        var member = newUser(email);
        perform(member, post("/api/invitations/{token}/accept", token.getValue())).andExpect(status().isOk());
        return member;
    }

    /** Liga a conta de {@code member} à ficha de trabalhador indicada. */
    void linkEmployee(Session admin, UUID orgId, Session member, UUID employeeId) throws Exception {
        var members = body(perform(admin, get("/api/orgs/{orgId}/members", orgId)));
        List<String> ids = JsonPath.read(members, "$[?(@.email=='" + member.email() + "')].id");
        perform(admin, put("/api/orgs/{orgId}/members/{id}/employee", orgId, ids.getFirst())
                .content("{\"employeeId\":\"" + employeeId + "\"}"))
                .andExpect(status().isOk());
    }

    static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@andaime.local";
    }
}
