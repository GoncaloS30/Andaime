package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.jayway.jsonpath.JsonPath;

/** F7: endpoints de gestão fechados, acesso de suporte, ponto sem rede, política laboral e anonimização. */
class HardeningIntegrationTest extends ApiTestSupport {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Europe/Lisbon"));

    private UUID employee(Session manager, UUID orgId, String name) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"%s\",\"category\":\"Pedreiro\",\"email\":\"pessoa@exemplo.pt\",\"phone\":\"+351 910 000 000\"}"
                        .formatted(name))).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private UUID site(Session manager, UUID orgId) throws Exception {
        return UUID.fromString(JsonPath.read(body(perform(manager, post("/api/orgs/{orgId}/sites", orgId)
                .content("{\"name\":\"Obra F7\",\"country\":\"PT\",\"status\":\"ACTIVE\"}")).andExpect(status().isCreated())), "$.id"));
    }

    @Test
    void endpointsDeGestaoNaoEstaoNaPortaPublica() throws Exception {
        var user = newUser("metricas");
        mockMvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk());
        perform(user, get("/actuator/prometheus")).andExpect(status().isForbidden());
        perform(user, get("/actuator/info")).andExpect(status().isForbidden());
    }

    @Test
    void acessoDeSuporteTemporarioSoLeituraEAuditado() throws Exception {
        var owner = newUser("dono-suporte");
        var orgId = createOrganization(owner, "Suporte F7");
        employee(owner, orgId, "Ana Suporte");
        var support = newUser("suporte-andaime");

        perform(owner, post("/api/orgs/{orgId}/support-access", orgId).content("""
                {"email":"%s","hours":2,"reason":"Investigar o erro reportado no planeamento"}""".formatted(support.email())))
                .andExpect(status().isBadRequest());
        try (var connection = ownerConnection();
             var statement = connection.prepareStatement("INSERT INTO platform_admins (user_id) SELECT id FROM users WHERE email = ?")) {
            statement.setString(1, support.email());
            statement.execute();
        }
        // Sem concessão, o suporte não vê a empresa.
        perform(support, get("/api/orgs/{orgId}/employees", orgId)).andExpect(status().isNotFound());
        perform(owner, post("/api/orgs/{orgId}/support-access", orgId).content("""
                {"email":"%s","hours":200,"reason":"Investigar o erro reportado no planeamento"}""".formatted(support.email())))
                .andExpect(status().isBadRequest());
        var grant = body(perform(owner, post("/api/orgs/{orgId}/support-access", orgId).content("""
                {"email":"%s","hours":2,"reason":"Investigar o erro reportado no planeamento"}""".formatted(support.email())))
                .andExpect(status().isCreated()));
        var grantId = JsonPath.<String>read(grant, "$.id");

        // Aparece no /me como empresa só de leitura; consegue ler, não consegue alterar.
        var me = body(perform(support, get("/api/me")));
        assertThat(JsonPath.<List<String>>read(me, "$.memberships[?(@.orgId=='" + orgId + "')].supportUntil")).hasSize(1);
        perform(support, get("/api/orgs/{orgId}/employees", orgId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].fullName").value("Ana Suporte"));
        perform(support, post("/api/orgs/{orgId}/employees", orgId).content("{\"fullName\":\"Intruso\",\"category\":\"Servente\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("support-read-only"));
        var grants = body(perform(owner, get("/api/orgs/{orgId}/support-access", orgId)).andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(grants, "$[0].requests")).isGreaterThanOrEqualTo(1);
        var audit = body(perform(owner, get("/api/orgs/{orgId}/audit", orgId).param("entityType", "support_access_grant")));
        assertThat(JsonPath.<List<String>>read(audit, "$.items[*].action")).contains("support.granted", "support.viewed", "support.blocked");

        // Revogar corta o acesso de imediato.
        perform(owner, post("/api/orgs/{orgId}/support-access/{id}/revoke", orgId, grantId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        perform(support, get("/api/orgs/{orgId}/employees", orgId)).andExpect(status().isNotFound());
    }

    @Test
    void pontoSemRedeUsaAHoraDoTelemovelDentroDeLimites() throws Exception {
        var owner = newUser("dono-offline");
        var orgId = createOrganization(owner, "Offline F7");
        var rui = employee(owner, orgId, "Rui Offline");
        var site = site(owner, orgId);
        var worker = joinAs(owner, orgId, "WORKER", "trabalhador-offline");
        linkEmployee(owner, orgId, worker, rui);

        var now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        perform(worker, post("/api/orgs/{orgId}/me/clock/in", orgId).content("""
                {"idempotencyKey":"offline-antigo","deviceTime":"%s","siteId":"%s","offline":true}""".formatted(now.minus(4, ChronoUnit.DAYS), site)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("offline-too-old"));
        perform(worker, post("/api/orgs/{orgId}/me/clock/in", orgId).content("""
                {"idempotencyKey":"offline-entrada","deviceTime":"%s","siteId":"%s","offline":true}""".formatted(now.minusSeconds(7200), site)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.open.startedAt").value(now.minusSeconds(7200).toString()));
        perform(worker, post("/api/orgs/{orgId}/me/clock/out", orgId).content("""
                {"idempotencyKey":"offline-fora-de-ordem","deviceTime":"%s","offline":true}""".formatted(now.minusSeconds(9000))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("offline-out-of-order"));
        perform(worker, post("/api/orgs/{orgId}/me/clock/out", orgId).content("""
                {"idempotencyKey":"offline-saida","deviceTime":"%s","offline":true}""".formatted(now.minusSeconds(3600))))
                .andExpect(status().isOk());
        var entries = body(perform(owner, get("/api/orgs/{orgId}/time-entries", orgId)
                .param("from", TODAY.minusDays(1).toString()).param("to", TODAY.toString())));
        assertThat(JsonPath.<List<Integer>>read(entries, "$[*].workedMin")).containsExactly(60);
    }

    @Test
    void politicaLaboralEFeriadosDaEmpresaContamNasHoras() throws Exception {
        var owner = newUser("dono-politica");
        var orgId = createOrganization(owner, "Política F7");
        var ana = employee(owner, orgId, "Ana Política");
        var site = site(owner, orgId);
        var foreman = joinAs(owner, orgId, "FOREMAN", "encarregado-politica");

        var policy = body(perform(owner, get("/api/orgs/{orgId}/labor-policy", orgId)).andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(policy, "$.dailyNormalMin")).isEqualTo(480);
        var version = (Integer) JsonPath.read(policy, "$.version");
        var update = """
                {"dailyNormalMin":420,"weeklyNormalMin":2100,"restDays":[7],"autoBreakAfterMin":300,"autoBreakMin":30,
                 "overnightAttribution":"START_DAY","version":%d}""";
        perform(foreman, put("/api/orgs/{orgId}/labor-policy", orgId).content(update.formatted(version))).andExpect(status().isForbidden());
        perform(owner, put("/api/orgs/{orgId}/labor-policy", orgId).content(update.formatted(version + 5)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("stale"));
        perform(owner, put("/api/orgs/{orgId}/labor-policy", orgId).content(update.formatted(version)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.dailyNormalMin").value(420)).andExpect(jsonPath("$.restDays[0]").value(7));

        // 8 h hoje: pausa automática de 30 min (acima de 5 h) → 7 h 30 trabalhadas, 7 h normais, 30 min extra.
        var entry = body(perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content("""
                {"employeeId":"%s","siteId":"%s","date":"%s","start":"00:30","end":"08:30","reason":"Registo de teste"}"""
                .formatted(ana, site, TODAY))).andExpect(status().isCreated()));
        assertThat((Integer) JsonPath.read(entry, "$.workedMin")).isEqualTo(450);
        var week = TODAY.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY));
        perform(owner, get("/api/orgs/{orgId}/timesheets/{e}/{w}", orgId, ana, week))
                .andExpect(jsonPath("$.summary.overtimeMin").value(TODAY.getDayOfWeek().getValue() == 7 ? 450 : 30));

        // Feriado da empresa: o dia passa a ser todo extra.
        var holiday = JsonPath.<String>read(body(perform(owner, post("/api/orgs/{orgId}/holidays", orgId)
                .content("{\"date\":\"%s\",\"name\":\"Feriado municipal\"}".formatted(TODAY))).andExpect(status().isCreated())), "$.id");
        perform(owner, post("/api/orgs/{orgId}/holidays", orgId).content("{\"date\":\"%s\",\"name\":\"Feriado municipal\"}".formatted(TODAY)))
                .andExpect(status().isConflict());
        perform(owner, get("/api/orgs/{orgId}/timesheets/{e}/{w}", orgId, ana, week))
                .andExpect(jsonPath("$.summary.overtimeMin").value(450));
        perform(owner, delete("/api/orgs/{orgId}/holidays/{id}", orgId, holiday)).andExpect(status().isNoContent());
        var audit = body(perform(owner, get("/api/orgs/{orgId}/audit", orgId).param("entityType", "organization")));
        assertThat(JsonPath.<List<String>>read(audit, "$.items[*].action")).contains("labor-policy.updated", "holiday.added", "holiday.removed");
    }

    @Test
    void anonimizarExTrabalhadorApagaDadosPessoaisEMantemHistorico() throws Exception {
        var owner = newUser("dono-rgpd");
        var orgId = createOrganization(owner, "RGPD F7");
        var ana = employee(owner, orgId, "Ana Pessoal");
        var site = site(owner, orgId);
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content("""
                {"employeeId":"%s","siteId":"%s","date":"%s","start":"00:30","end":"04:30","reason":"Registo de teste"}"""
                .formatted(ana, site, TODAY))).andExpect(status().isCreated());

        perform(owner, post("/api/orgs/{orgId}/employees/{id}/anonymize", orgId, ana))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not-archived"));
        perform(owner, post("/api/orgs/{orgId}/employees/{id}/archive", orgId, ana)).andExpect(status().isOk());
        var manager = joinAs(owner, orgId, "MANAGER", "gestor-rgpd");
        perform(manager, post("/api/orgs/{orgId}/employees/{id}/anonymize", orgId, ana)).andExpect(status().isForbidden());
        perform(owner, post("/api/orgs/{orgId}/employees/{id}/anonymize", orgId, ana))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Ex-trabalhador 1"))
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.phone").doesNotExist());
        perform(owner, post("/api/orgs/{orgId}/employees/{id}/anonymize", orgId, ana)).andExpect(status().isConflict());
        perform(owner, post("/api/orgs/{orgId}/employees/{id}/restore", orgId, ana))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already-anonymized"));
        // As horas continuam no histórico (sem identificação).
        var entries = body(perform(owner, get("/api/orgs/{orgId}/time-entries", orgId)
                .param("from", TODAY.toString()).param("to", TODAY.toString())));
        assertThat(JsonPath.<List<String>>read(entries, "$[*].employeeName")).containsExactly("Ex-trabalhador 1");
    }
}
