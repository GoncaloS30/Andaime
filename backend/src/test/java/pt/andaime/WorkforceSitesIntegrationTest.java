package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.jayway.jsonpath.JsonPath;

/** Trabalhadores, equipas com composição datada, obras, clientes e ocorrências, por HTTP. */
class WorkforceSitesIntegrationTest extends ApiTestSupport {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Europe/Lisbon"));

    private UUID createEmployee(Session manager, UUID orgId, String name, String category) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/employees", orgId).content("""
                {"fullName":"%s","category":"%s","phone":"+351 910 000 001","email":"x@y.pt","hourlyCost":14.5,
                 "sizes":{"botas":"42","inexistente":"X"}}
                """.formatted(name, category))).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private UUID createTeam(Session manager, UUID orgId, String name, UUID foreman) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/teams", orgId).content("""
                {"name":"%s","color":"#2a78d6"%s}
                """.formatted(name, foreman == null ? "" : ",\"foremanEmployeeId\":\"" + foreman + "\"")))
                .andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private void join(Session manager, UUID orgId, UUID teamId, UUID employeeId, LocalDate on) throws Exception {
        perform(manager, post("/api/orgs/{orgId}/teams/{teamId}/members", orgId, teamId)
                .content("{\"employeeId\":\"" + employeeId + "\",\"joinedOn\":\"" + on + "\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void trabalhadoresComNumeroAutomaticoVersaoEAmbitoPorPapel() throws Exception {
        var owner = newUser("dona-f2");
        var orgId = createOrganization(owner, "Obras F2");

        var leader = createEmployee(owner, orgId, "Rui Encarregado", "Encarregado");
        var mason = createEmployee(owner, orgId, "Ana Pedreira", "Pedreiro");
        var outsider = createEmployee(owner, orgId, "Zé Sem Equipa", "Servente");

        // Números atribuídos automaticamente e únicos; tamanhos desconhecidos ignorados.
        var detail = body(perform(owner, get("/api/orgs/{orgId}/employees/{id}", orgId, mason)).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(detail, "$.number")).isEqualTo("2");
        assertThat(JsonPath.<java.util.Map<String, Object>>read(detail, "$.sizes")).containsExactly(java.util.Map.entry("botas", "42"));
        perform(owner, post("/api/orgs/{orgId}/employees", orgId).content("""
                {"number":"2","fullName":"Duplicado","category":"Servente"}"""))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("number-taken"));

        // Edição com versão; versão antiga dá 409.
        perform(owner, patch("/api/orgs/{orgId}/employees/{id}", orgId, mason).content("""
                {"fullName":"Ana Pedreira Silva","category":"Pedreiro","hourlyCost":15,"version":0}"""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        perform(owner, patch("/api/orgs/{orgId}/employees/{id}", orgId, mason).content("""
                {"fullName":"Outra","category":"Pedreiro","version":0}"""))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("stale"));

        // Equipa com encarregado; o encarregado liga a conta à sua ficha.
        var team = createTeam(owner, orgId, "Estrutura", leader);
        join(owner, orgId, team, leader, TODAY);
        join(owner, orgId, team, mason, TODAY);
        var foreman = joinAs(owner, orgId, "FOREMAN", "encarregado-f2");
        linkEmployee(owner, orgId, foreman, leader);

        // O encarregado vê-se a si e à equipa, sem custos nem dados pessoais; não vê quem está fora.
        var visible = body(perform(foreman, get("/api/orgs/{orgId}/employees", orgId)).andExpect(status().isOk()));
        List<String> names = JsonPath.read(visible, "$.items[*].fullName");
        assertThat(names).containsExactly("Ana Pedreira Silva", "Rui Encarregado");
        perform(foreman, get("/api/orgs/{orgId}/employees/{id}", orgId, mason))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.restricted").value(true))
                .andExpect(jsonPath("$.hourlyCost").doesNotExist())
                .andExpect(jsonPath("$.email").doesNotExist());
        perform(foreman, get("/api/orgs/{orgId}/employees/{id}", orgId, outsider)).andExpect(status().isNotFound());
        perform(foreman, post("/api/orgs/{orgId}/employees", orgId).content("""
                {"fullName":"Não pode","category":"Servente"}""")).andExpect(status().isForbidden());

        // Um trabalhador só vê a própria ficha.
        var worker = joinAs(owner, orgId, "WORKER", "trabalhador-f2");
        linkEmployee(owner, orgId, worker, outsider);
        var own = body(perform(worker, get("/api/orgs/{orgId}/employees", orgId)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(own, "$.items[*].fullName")).containsExactly("Zé Sem Equipa");
        perform(worker, get("/api/orgs/{orgId}/teams", orgId)).andExpect(status().isForbidden());

        // Histórico de auditoria sem dados pessoais nos valores.
        var history = body(perform(owner, get("/api/orgs/{orgId}/audit", orgId)
                .param("entityType", "employee").param("entityId", mason.toString())).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(history, "$.items[0].action")).isEqualTo("employee.updated");
        assertThat(JsonPath.<java.util.Map<String, Object>>read(history, "$.items[0].changes.hourlyCost"))
                .containsExactly(java.util.Map.entry("changed", true));
    }

    @Test
    void mudarDeEquipaPreservaOHistoricoENaoAceitaDatasPassadas() throws Exception {
        var owner = newUser("dono-equipas");
        var orgId = createOrganization(owner, "Equipas F2");
        var worker = createEmployee(owner, orgId, "Carlos Móvel", "Pedreiro");
        var teamA = createTeam(owner, orgId, "Equipa A", null);
        var teamB = createTeam(owner, orgId, "Equipa B", null);

        join(owner, orgId, teamA, worker, TODAY);
        join(owner, orgId, teamB, worker, TODAY.plusDays(7));

        // Fica na equipa A até à véspera da entrada na B: as semanas anteriores não mudam.
        var history = body(perform(owner, get("/api/orgs/{orgId}/employees/{id}/teams", orgId, worker)));
        assertThat(JsonPath.<List<String>>read(history, "$[*].teamName")).containsExactly("Equipa B", "Equipa A");
        assertThat((String) JsonPath.read(history, "$[1].leftOn")).isEqualTo(TODAY.plusDays(6).toString());
        assertThat(JsonPath.<Object>read(history, "$[0].leftOn")).isNull();

        perform(owner, post("/api/orgs/{orgId}/teams/{teamId}/members", orgId, teamA)
                .content("{\"employeeId\":\"" + worker + "\",\"joinedOn\":\"" + TODAY.minusDays(1) + "\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("past-date"));

        // Hoje continua na equipa A.
        perform(owner, get("/api/orgs/{orgId}/employees/{id}", orgId, worker))
                .andExpect(jsonPath("$.team.name").value("Equipa A"));

        // A base de dados impede dois períodos sobrepostos, mesmo sem passar pelo serviço.
        try (var connection = ownerConnection(); var statement = connection.prepareStatement("""
                INSERT INTO team_members (organization_id, team_id, employee_id, joined_on) VALUES (?, ?, ?, ?)
                """)) {
            statement.setObject(1, orgId);
            statement.setObject(2, teamB);
            statement.setObject(3, worker);
            statement.setObject(4, TODAY);
            org.assertj.core.api.Assertions.assertThatThrownBy(statement::execute)
                    .hasMessageContaining("team_members_one_team_per_day");
        }
    }

    @Test
    void obrasComCodigoAutomaticoMetricasReaisEOcorrenciasNoAmbitoDoEncarregado() throws Exception {
        var owner = newUser("dono-obras");
        var orgId = createOrganization(owner, "Obras e clientes");
        var leader = createEmployee(owner, orgId, "Joana Encarregada", "Encarregado");
        var foreman = joinAs(owner, orgId, "FOREMAN", "encarregada-obras");
        linkEmployee(owner, orgId, foreman, leader);

        var client = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/clients", orgId)
                .content("{\"name\":\"Cliente Teste, Lda.\",\"taxId\":\"PT 500 000 000\",\"country\":\"PT\"}"))
                .andExpect(status().isCreated())), "$.id"));
        perform(owner, post("/api/orgs/{orgId}/clients", orgId).content("{\"name\":\"Outro\",\"taxId\":\"PT500000000\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("tax-id-taken"));

        var year = "%02d".formatted(TODAY.getYear() % 100);
        var site = body(perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"Edifício Teste","clientId":"%s","country":"FR","city":"Lyon","latitude":45.7485,"longitude":4.8167,
                 "startDate":"%s","hourLimitMin":60000,"baselineRealizedMin":51000,"baselineApprovedMin":40000,
                 "foremanEmployeeId":"%s"}
                """.formatted(client, TODAY.minusDays(10), leader))).andExpect(status().isCreated()));
        var siteId = UUID.fromString(JsonPath.read(site, "$.id"));
        assertThat((String) JsonPath.read(site, "$.code")).isEqualTo("OB-" + year + "-001");
        assertThat((String) JsonPath.read(site, "$.timezone")).isEqualTo("Europe/Paris");
        assertThat((String) JsonPath.read(site, "$.status")).isEqualTo("ACTIVE");
        // 51 000 / 60 000 = 85 %: atenção. Histórico importado + registos de horas (nenhum ainda).
        assertThat((String) JsonPath.read(site, "$.metrics.status")).isEqualTo("WARNING");
        assertThat((Boolean) JsonPath.read(site, "$.metrics.includesTimeEntries")).isTrue();
        assertThat((Integer) JsonPath.read(site, "$.metrics.balanceMin")).isEqualTo(9000);

        perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"Fuso errado","country":"PT","timezone":"Lua/Base"}"""))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid-timezone"));
        var otherSite = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId)
                .content("{\"name\":\"Obra de outro encarregado\",\"country\":\"PT\"}")).andExpect(status().isCreated())), "$.id"));

        // O encarregado só vê a sua obra e comunica ocorrências apenas nela.
        var visible = body(perform(foreman, get("/api/orgs/{orgId}/sites", orgId)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(visible, "$[*].name")).containsExactly("Edifício Teste");
        perform(foreman, post("/api/orgs/{orgId}/sites/{siteId}/issues", orgId, siteId)
                .content("{\"category\":\"SAFETY\",\"description\":\"Guarda-corpos em falta no piso 3\"}"))
                .andExpect(status().isCreated());
        perform(foreman, post("/api/orgs/{orgId}/sites/{siteId}/issues", orgId, otherSite)
                .content("{\"category\":\"OTHER\",\"description\":\"Não devia conseguir\"}"))
                .andExpect(status().isNotFound());
        var issues = body(perform(owner, get("/api/orgs/{orgId}/issues", orgId).param("status", "OPEN")));
        var issueId = (String) JsonPath.read(issues, "$[0].id");
        perform(owner, post("/api/orgs/{orgId}/issues/{issueId}/resolve", orgId, issueId).content("{\"note\":\"Colocados\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RESOLVED"));
        perform(owner, post("/api/orgs/{orgId}/issues/{issueId}/resolve", orgId, issueId).content("{}"))
                .andExpect(status().isConflict());

        // Edição com versão e registo na auditoria da obra.
        perform(owner, patch("/api/orgs/{orgId}/sites/{siteId}", orgId, siteId).content("""
                {"name":"Edifício Teste","country":"FR","city":"Lyon","status":"SUSPENDED","hourLimitMin":60000,
                 "baselineRealizedMin":51000,"baselineApprovedMin":40000,"latitude":45.7485,"longitude":4.8167,
                 "foremanEmployeeId":"%s","clientId":"%s","startDate":"%s","version":0}
                """.formatted(leader, client, TODAY.minusDays(10)))).andExpect(status().isOk());
        var audit = body(perform(owner, get("/api/orgs/{orgId}/audit", orgId)
                .param("entityType", "site").param("entityId", siteId.toString())));
        assertThat((String) JsonPath.read(audit, "$.items[0].changes.status.to")).isEqualTo("SUSPENDED");
        assertThat(JsonPath.<java.util.Map<String, Object>>read(audit, "$.items[0].changes"))
                .as("sem alterações falsas").containsOnlyKeys("status");
    }

    @Test
    void fimContratualComPrevisaoAtrasadaDaAvisoEmDiasUteis() throws Exception {
        var owner = newUser("dono-prazos");
        var orgId = createOrganization(owner, "Prazos de obra");
        var start = LocalDate.parse("2026-01-05");

        // Fim contratual sexta 16/10, previsão sexta 23/10: 5 dias úteis de atraso.
        var site = body(perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"Obra atrasada","country":"PT","startDate":"%s","contractEndDate":"2026-10-16","endDate":"2026-10-23"}
                """.formatted(start))).andExpect(status().isCreated()));
        var siteId = UUID.fromString(JsonPath.read(site, "$.id"));
        assertThat((String) JsonPath.read(site, "$.contractEndDate")).isEqualTo("2026-10-16");
        assertThat((Integer) JsonPath.read(site, "$.delayWorkdays")).isEqualTo(5);
        var list = body(perform(owner, get("/api/orgs/{orgId}/sites", orgId)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<Integer>>read(list, "$[?(@.name == 'Obra atrasada')].delayWorkdays")).containsExactly(5);

        // A previsão volta para dentro do prazo: o aviso desaparece e a auditoria regista só a data mudada.
        perform(owner, patch("/api/orgs/{orgId}/sites/{siteId}", orgId, siteId).content("""
                {"name":"Obra atrasada","country":"PT","startDate":"%s","contractEndDate":"2026-10-16","endDate":"2026-10-15","version":0}
                """.formatted(start))).andExpect(status().isOk()).andExpect(jsonPath("$.delayWorkdays").value(0));
        var audit = body(perform(owner, get("/api/orgs/{orgId}/audit", orgId)
                .param("entityType", "site").param("entityId", siteId.toString())));
        assertThat(JsonPath.<java.util.Map<String, Object>>read(audit, "$.items[0].changes")).containsOnlyKeys("endDate");

        // Sem fim contratual não há aviso; fim contratual antes do início é recusado.
        perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"Sem contrato","country":"PT","endDate":"2026-12-31"}"""))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.delayWorkdays").value(0));
        perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"Datas trocadas","country":"PT","startDate":"%s","contractEndDate":"2025-12-31"}
                """.formatted(start))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid-dates"));
    }

    @Test
    void recursosDeOutraEmpresaNaoSaoAcessiveisPeloCaminhoDaPropria() throws Exception {
        var ownerA = newUser("dono-idor-a");
        var orgA = createOrganization(ownerA, "IDOR A");
        var ownerB = newUser("dono-idor-b");
        var orgB = createOrganization(ownerB, "IDOR B");
        var employeeB = createEmployee(ownerB, orgB, "Trabalhador B", "Pedreiro");
        var teamB = createTeam(ownerB, orgB, "Equipa B", null);

        perform(ownerA, get("/api/orgs/{orgId}/employees/{id}", orgA, employeeB)).andExpect(status().isNotFound());
        perform(ownerA, get("/api/orgs/{orgId}/teams/{id}", orgA, teamB)).andExpect(status().isNotFound());
        // Nem como referência: ligar um trabalhador de B a uma equipa de A falha.
        var teamA = createTeam(ownerA, orgA, "Equipa A", null);
        perform(ownerA, post("/api/orgs/{orgId}/teams/{teamId}/members", orgA, teamA)
                .content("{\"employeeId\":\"" + employeeB + "\"}"))
                .andExpect(status().isBadRequest());
        var listB = body(perform(ownerA, get("/api/orgs/{orgId}/employees", orgA)));
        assertThat((Integer) JsonPath.read(listB, "$.total")).isZero();
    }
}
