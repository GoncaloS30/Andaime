package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pt.andaime.shared.tenant.TenantContext;

class FoundationIntegrationTest extends IntegrationTestSupport {

    static UUID userId;
    static UUID orgA;
    static UUID orgB;

    @Autowired
    PlatformTransactionManager transactionManager;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Autowired
    MockMvc mockMvc;

    static {
        userId = UUID.randomUUID();
        orgA = UUID.randomUUID();
        orgB = UUID.randomUUID();
    }

    @BeforeEach
    void seedTwoOrganizations() throws SQLException {
        try (var connection = ownerConnection()) {
            execute(connection, """
                    INSERT INTO users (id, email, password_hash, display_name)
                    VALUES (?, 'teste@andaime.local', 'not-a-real-hash', 'Teste')
                    ON CONFLICT DO NOTHING
                    """, userId);
            execute(connection, """
                    INSERT INTO organizations (id, name, country, created_by_user_id)
                    VALUES (?, 'Organização A', 'PT', ?), (?, 'Organização B', 'PT', ?)
                    ON CONFLICT DO NOTHING
                    """, orgA, userId, orgB, userId);
            execute(connection, """
                    INSERT INTO memberships (organization_id, user_id, role)
                    VALUES (?, ?, 'OWNER')
                    ON CONFLICT DO NOTHING
                    """, orgA, userId);
        }
    }

    /** Cabeçalhos e cookie CSRF endurecidos (análise ZAP): SameSite no cookie e recursos só para a mesma origem. */
    @Test
    void cabecalhosDeSegurancaECookieCsrf() throws Exception {
        mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(cookie().sameSite("XSRF-TOKEN", "Lax"))
                .andExpect(cookie().httpOnly("XSRF-TOKEN", false))
                .andExpect(header().string("Cross-Origin-Resource-Policy", "same-origin"))
                .andExpect(header().string("Content-Security-Policy", "default-src 'self'"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"));
    }

    @Test
    void aplicouTodasAsMigracoes() throws SQLException {
        try (var connection = ownerConnection();
             var statement = connection.prepareStatement(
                     "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank")) {
            var result = statement.executeQuery();
            var versions = new java.util.ArrayList<String>();
            while (result.next()) {
                assertThat(result.getBoolean("success")).isTrue();
                versions.add(result.getString("version"));
            }
            assertThat(versions).containsExactlyElementsOf(
                    List.of("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "18.1", "18.2", "19", "20", "21", "22", "23", "25"));
        }
    }

    @Test
    void todasAsTabelasDeTenantTemRlsAtivaEForcada() throws SQLException {
        try (var connection = ownerConnection();
             var statement = connection.prepareStatement("""
                     SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
                     FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'public'
                       AND c.relkind = 'r'
                       AND (
                         c.relname = 'organizations'
                         OR EXISTS (
                           SELECT 1 FROM pg_attribute a
                           WHERE a.attrelid = c.oid
                             AND a.attname = 'organization_id'
                             AND NOT a.attisdropped
                         )
                       )
                     ORDER BY c.relname
                     """)) {
            var result = statement.executeQuery();
            var tables = new java.util.ArrayList<String>();
            while (result.next()) {
                tables.add(result.getString("relname"));
                assertThat(result.getBoolean("relrowsecurity"))
                        .as("RLS ativa em %s", result.getString("relname"))
                        .isTrue();
                assertThat(result.getBoolean("relforcerowsecurity"))
                        .as("RLS forçada em %s", result.getString("relname"))
                        .isTrue();
            }
            assertThat(tables).contains("organizations", "memberships", "invitations",
                    "audit_event", "event_publication", "idempotency_keys", "labor_policies",
                    "org_holidays", "conflict_rule_settings", "support_access_grants", "retention_policies");
        }
    }

    @Test
    void papelDaAplicacaoNaoPossuiObjetos() throws SQLException {
        try (var connection = ownerConnection();
             var statement = connection.prepareStatement("""
                     SELECT count(*)
                     FROM pg_class c
                     JOIN pg_roles r ON r.oid = c.relowner
                     WHERE r.rolname = 'andaime_app'
                     """)) {
            var result = statement.executeQuery();
            result.next();
            assertThat(result.getInt(1)).isZero();
        }
    }

    @Test
    void auditEventEAppendOnlyMesmoParaOProprietario() throws SQLException {
        var auditId = UUID.randomUUID();
        try (var connection = ownerConnection()) {
            execute(connection, """
                    INSERT INTO audit_event
                        (id, organization_id, actor_user_id, actor_role, action, entity_type)
                    VALUES (?, ?, ?, 'OWNER', 'organization.created', 'organization')
                    """, auditId, orgA, userId);

            assertThatThrownBy(() -> execute(connection,
                    "UPDATE audit_event SET action = 'tampered' WHERE id = ?", auditId))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("append-only");
        }
    }

    @Test
    void rlsEscondeOutraOrganizacaoEImpedeEscritaCruzada() throws SQLException {
        try (var connection = appConnection()) {
            setContext(connection, orgA, userId);
            assertThat(queryOrganizationIds(connection)).containsExactly(orgA);

            assertThatThrownBy(() -> execute(connection, """
                    INSERT INTO memberships (organization_id, user_id, role)
                    VALUES (?, ?, 'WORKER')
                    """, orgB, userId))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("row-level security");
        }
    }

    @Test
    void contextoDeTenantEmFaltaFalhaFechado() throws SQLException {
        try (var connection = appConnection()) {
            assertThat(queryOrganizationIds(connection)).isEmpty();
        }
    }

    @Test
    void transactionManagerDefineEIsolaOContextoPostgresql() {
        var transaction = new TransactionTemplate(transactionManager);

        try (var ignored = TenantContext.open(orgA, userId)) {
            var currentOrg = transaction.execute(status ->
                    jdbcTemplate.queryForObject("select app.current_org_id()", UUID.class));
            assertThat(currentOrg).isEqualTo(orgA);
        }

        var currentOrgWithoutContext = transaction.execute(status ->
                jdbcTemplate.queryForObject("select app.current_org_id()", UUID.class));
        assertThat(currentOrgWithoutContext).isNull();
    }

    @Test
    void fluxoRegistoVerificacaoLoginEOnboarding() throws Exception {
        var suffix = UUID.randomUUID().toString().substring(0, 8);
        var email = "owner-" + suffix + "@andaime.local";
        var password = "Palavra-passe-" + suffix;

        var anonymousCsrf = obtainCsrf();

        mockMvc.perform(post("/api/auth/signup")
                        .cookie(anonymousCsrf.cookie())
                        .header(anonymousCsrf.headerName(), anonymousCsrf.token())
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"%s","displayName":"Dona da Obra"}
                                """.formatted(email, password)))
                .andExpect(status().isAccepted());

        var token = ArgumentCaptor.forClass(String.class);
        verify(mailGateway).sendVerification(anyString(), anyString(), token.capture());

        mockMvc.perform(post("/api/auth/verify-email")
                        .cookie(anonymousCsrf.cookie())
                        .header(anonymousCsrf.headerName(), anonymousCsrf.token())
                        .contentType("application/json")
                        .content("{\"token\":\"" + token.getValue() + "\"}"))
                .andExpect(status().isNoContent());

        var login = mockMvc.perform(post("/api/auth/login")
                        .cookie(anonymousCsrf.cookie())
                        .header(anonymousCsrf.headerName(), anonymousCsrf.token())
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"%s"}
                                """.formatted(email, password)))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("ANDAIME_SESSION"))
                .andExpect(jsonPath("$.user.email").value(email))
                .andExpect(jsonPath("$.memberships").isEmpty())
                .andReturn();

        var sessionCookie = login.getResponse().getCookie("ANDAIME_SESSION");
        assertThat(sessionCookie).isNotNull();
        var authenticatedCsrf = obtainCsrf(sessionCookie);

        var onboarding = mockMvc.perform(post("/api/orgs")
                        .cookie(sessionCookie, authenticatedCsrf.cookie())
                        .header(authenticatedCsrf.headerName(), authenticatedCsrf.token())
                        .contentType("application/json")
                        .content("""
                                {"name":"Obras %s","country":"pt","timezone":"Europe/Lisbon"}
                                """.formatted(suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Obras " + suffix))
                .andExpect(jsonPath("$.country").value("PT"))
                .andReturn();

        var organizationId = UUID.fromString(com.jayway.jsonpath.JsonPath.read(
                onboarding.getResponse().getContentAsString(), "$.id"));
        assertThat(organizationId.version()).isEqualTo(7);

        mockMvc.perform(get("/api/me").cookie(sessionCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeOrgId").value(organizationId.toString()))
                .andExpect(jsonPath("$.memberships[0].orgId").value(organizationId.toString()))
                .andExpect(jsonPath("$.memberships[0].role").value("OWNER"));

        mockMvc.perform(patch("/api/me")
                        .cookie(sessionCookie, authenticatedCsrf.cookie())
                        .header(authenticatedCsrf.headerName(), authenticatedCsrf.token())
                        .contentType("application/json")
                        .content("""
                                {"displayName":"Dona Atualizada","locale":"en-GB"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.displayName").value("Dona Atualizada"))
                .andExpect(jsonPath("$.user.locale").value("en-GB"));

        mockMvc.perform(put("/api/me/active-org")
                        .cookie(sessionCookie, authenticatedCsrf.cookie())
                        .header(authenticatedCsrf.headerName(), authenticatedCsrf.token())
                        .contentType("application/json")
                        .content("{\"orgId\":\"" + organizationId + "\"}"))
                .andExpect(status().isNoContent());

        var sessionList = mockMvc.perform(get("/api/me/sessions").cookie(sessionCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].current").value(true))
                .andReturn();
        var currentSessionId = (String) com.jayway.jsonpath.JsonPath.read(
                sessionList.getResponse().getContentAsString(), "$[0].id");

        mockMvc.perform(delete("/api/me/sessions/{id}", currentSessionId)
                        .cookie(sessionCookie, authenticatedCsrf.cookie())
                        .header(authenticatedCsrf.headerName(), authenticatedCsrf.token()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/me").cookie(sessionCookie))
                .andExpect(status().isUnauthorized());

        try (var connection = ownerConnection()) {
            assertThat(count(connection,
                    "SELECT count(*) FROM labor_policies WHERE organization_id = ?", organizationId)).isOne();
            assertThat(count(connection,
                    "SELECT count(*) FROM conflict_rule_settings WHERE organization_id = ?", organizationId)).isEqualTo(12);
            assertThat(count(connection,
                    "SELECT count(*) FROM audit_event WHERE organization_id = ?", organizationId)).isOne();
        }
    }

    @Test
    void meSemSessaoResponde401() throws Exception {
        mockMvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("unauthenticated"));
    }

    @Test
    void mutacaoSemCsrfERecusadaSemCriarUtilizador() throws Exception {
        var email = "sem-csrf-" + UUID.randomUUID().toString().substring(0, 8) + "@andaime.local";
        mockMvc.perform(post("/api/auth/signup")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"Palavra-passe-segura","displayName":"Sem CSRF"}
                                """.formatted(email)))
                .andExpect(status().isForbidden());

        try (var connection = ownerConnection()) {
            assertThat(count(connection, "SELECT count(*) FROM users WHERE email = ?", email)).isZero();
        }
    }

    @Test
    void bloqueiaTemporariamenteDepoisDeCincoLoginsFalhados() throws Exception {
        var csrf = obtainCsrf();
        for (int attempt = 0; attempt < 5; attempt++) {
            mockMvc.perform(post("/api/auth/login")
                            .cookie(csrf.cookie())
                            .header(csrf.headerName(), csrf.token())
                            .contentType("application/json")
                            .content("""
                                    {"email":"inexistente-throttle@andaime.local","password":"palavra-passe-errada"}
                                    """))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post("/api/auth/login")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType("application/json")
                        .content("""
                                {"email":"inexistente-throttle@andaime.local","password":"palavra-passe-errada"}
                                """))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate-limited"));
    }

    @Test
    void recuperaEAlteraPasswordRevogandoAsOutrasSessoes() throws Exception {
        var suffix = UUID.randomUUID().toString().substring(0, 8);
        var email = "password-" + suffix + "@andaime.local";
        var originalPassword = "Original-segura-" + suffix;
        var resetPassword = "Reposta-segura-" + suffix;
        var finalPassword = "Final-segura-" + suffix;
        var csrf = obtainCsrf();

        mockMvc.perform(post("/api/auth/signup")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"%s","displayName":"Conta Password"}
                                """.formatted(email, originalPassword)))
                .andExpect(status().isAccepted());
        var verificationToken = ArgumentCaptor.forClass(String.class);
        verify(mailGateway).sendVerification(eq(email), anyString(), verificationToken.capture());
        mockMvc.perform(post("/api/auth/verify-email")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType("application/json")
                        .content("{\"token\":\"" + verificationToken.getValue() + "\"}"))
                .andExpect(status().isNoContent());

        var firstLogin = login(email, originalPassword, csrf);
        var firstSession = firstLogin.getResponse().getCookie("ANDAIME_SESSION");
        assertThat(firstSession).isNotNull();

        mockMvc.perform(post("/api/auth/password/forgot")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType("application/json")
                        .content("{\"email\":\"" + email + "\"}"))
                .andExpect(status().isAccepted());
        var resetToken = ArgumentCaptor.forClass(String.class);
        verify(mailGateway).sendPasswordReset(eq(email), resetToken.capture());

        mockMvc.perform(post("/api/auth/password/reset")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType("application/json")
                        .content("""
                                {"token":"%s","password":"%s"}
                                """.formatted(resetToken.getValue(), resetPassword)))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/me").cookie(firstSession))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/password/reset")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType("application/json")
                        .content("""
                                {"token":"%s","password":"%s"}
                                """.formatted(resetToken.getValue(), finalPassword)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid-token"));
        mockMvc.perform(post("/api/auth/login")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"%s"}
                                """.formatted(email, originalPassword)))
                .andExpect(status().isUnauthorized());

        var currentLogin = login(email, resetPassword, csrf);
        var currentSession = currentLogin.getResponse().getCookie("ANDAIME_SESSION");
        var otherLogin = login(email, resetPassword, csrf);
        var otherSession = otherLogin.getResponse().getCookie("ANDAIME_SESSION");
        assertThat(currentSession).isNotNull();
        assertThat(otherSession).isNotNull();
        var authenticatedCsrf = obtainCsrf(currentSession);

        mockMvc.perform(post("/api/auth/password/change")
                        .cookie(currentSession, authenticatedCsrf.cookie())
                        .header(authenticatedCsrf.headerName(), authenticatedCsrf.token())
                        .contentType("application/json")
                        .content("""
                                {"currentPassword":"%s","newPassword":"%s"}
                                """.formatted(resetPassword, finalPassword)))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/me").cookie(currentSession))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/me").cookie(otherSession))
                .andExpect(status().isUnauthorized());
        login(email, finalPassword, csrf);
    }

    private org.springframework.test.web.servlet.MvcResult login(
            String email, String password, CsrfExchange csrf) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                        .cookie(csrf.cookie())
                        .header(csrf.headerName(), csrf.token())
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"%s"}
                                """.formatted(email, password)))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("ANDAIME_SESSION"))
                .andReturn();
    }

    private CsrfExchange obtainCsrf(Cookie... cookies) throws Exception {
        var request = get("/api/auth/csrf");
        if (cookies.length > 0) {
            request.cookie(cookies);
        }
        var result = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(jsonPath("$.headerName").value("X-XSRF-TOKEN"))
                .andReturn();
        var response = result.getResponse();
        return new CsrfExchange(
                com.jayway.jsonpath.JsonPath.read(response.getContentAsString(), "$.token"),
                com.jayway.jsonpath.JsonPath.read(response.getContentAsString(), "$.headerName"),
                response.getCookie("XSRF-TOKEN"));
    }

    private record CsrfExchange(String token, String headerName, Cookie cookie) {
    }



    private static void setContext(Connection connection, UUID organizationId, UUID currentUserId)
            throws SQLException {
        execute(connection, "SELECT set_config('app.org_id', ?, false)", organizationId.toString());
        execute(connection, "SELECT set_config('app.user_id', ?, false)", currentUserId.toString());
    }

    private static List<UUID> queryOrganizationIds(Connection connection) throws SQLException {
        try (var statement = connection.prepareStatement("SELECT id FROM organizations ORDER BY id")) {
            var result = statement.executeQuery();
            var ids = new java.util.ArrayList<UUID>();
            while (result.next()) {
                ids.add(result.getObject(1, UUID.class));
            }
            return ids;
        }
    }

    private static void execute(Connection connection, String sql, Object... arguments) throws SQLException {
        try (var statement = connection.prepareStatement(sql)) {
            for (int index = 0; index < arguments.length; index++) {
                statement.setObject(index + 1, arguments[index]);
            }
            statement.execute();
        }
    }

    private static int count(Connection connection, String sql, Object... arguments) throws SQLException {
        try (var statement = connection.prepareStatement(sql)) {
            for (int index = 0; index < arguments.length; index++) {
                statement.setObject(index + 1, arguments[index]);
            }
            var result = statement.executeQuery();
            result.next();
            return result.getInt(1);
        }
    }
}
