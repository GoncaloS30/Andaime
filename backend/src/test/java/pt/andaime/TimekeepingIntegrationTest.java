package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.jayway.jsonpath.JsonPath;

/** Ponto, registos, folhas semanais com aprovação e bloqueio, correções e presença confirmada pelo encarregado. */
class TimekeepingIntegrationTest extends ApiTestSupport {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Europe/Lisbon"));
    private static final LocalDate LAST_MONDAY = TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusDays(7);

    private UUID employee(Session manager, UUID orgId, String name, String category) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"%s\",\"category\":\"%s\"}".formatted(name, category))).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private UUID site(Session manager, UUID orgId, String name, Integer limitMin) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"%s","country":"PT","status":"ACTIVE","startDate":"%s"%s}""".formatted(name, TODAY.minusDays(60),
                limitMin == null ? "" : ",\"hourLimitMin\":" + limitMin))).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private UUID planToday(Session manager, UUID orgId, UUID employee, UUID site) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"ASSIGN","employeeId":"%s","siteId":"%s","date":"%s","start":"00:30","end":"06:30","foreman":true}"""
                .formatted(employee, site, TODAY))).andExpect(status().isOk()));
        return UUID.fromString(JsonPath.read(json, "$.createdIds[0]"));
    }

    private String manual(UUID employee, UUID site, LocalDate date, String start, String end) {
        return """
                {"employeeId":"%s","siteId":"%s","date":"%s","start":"%s","end":"%s","reason":"Esqueceu-se do ponto"}"""
                .formatted(employee, site, date, start, end);
    }

    @Test
    void pontoIdempotenteComPausaESaida() throws Exception {
        var owner = newUser("dono-ponto");
        var orgId = createOrganization(owner, "Ponto F4");
        var rui = employee(owner, orgId, "Rui Ponto", "Servente");
        var site = site(owner, orgId, "Obra Ponto", null);
        planToday(owner, orgId, rui, site);
        var worker = joinAs(owner, orgId, "WORKER", "trabalhador-ponto");

        // Sem ficha ligada não há ponto.
        perform(worker, get("/api/orgs/{orgId}/me/clock", orgId)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("no-employee"));
        linkEmployee(owner, orgId, worker, rui);
        perform(worker, get("/api/orgs/{orgId}/me/clock", orgId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.today[0].siteId").value(site.toString()))
                .andExpect(jsonPath("$.open").doesNotExist());

        // Entrada: a obra vem do planeamento. Repetir o mesmo pedido não duplica.
        for (int i = 0; i < 2; i++) {
            perform(worker, post("/api/orgs/{orgId}/me/clock/in", orgId).content("{\"idempotencyKey\":\"chave-entrada-1\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.open.siteId").value(site.toString()))
                    .andExpect(jsonPath("$.open.status").value("OPEN"));
        }
        perform(worker, post("/api/orgs/{orgId}/me/clock/in", orgId).content("{\"idempotencyKey\":\"chave-entrada-2\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already-clocked-in"));
        perform(worker, post("/api/orgs/{orgId}/me/clock/break-end", orgId).content("{\"idempotencyKey\":\"chave-pausa-0\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not-on-break"));
        perform(worker, post("/api/orgs/{orgId}/me/clock/break-start", orgId).content("{\"idempotencyKey\":\"chave-pausa-1\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.open.onBreak").value(true));
        // Sair durante a pausa fecha a pausa e o registo.
        perform(worker, post("/api/orgs/{orgId}/me/clock/out", orgId).content("{\"idempotencyKey\":\"chave-saida-1\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.open").doesNotExist());
        perform(worker, post("/api/orgs/{orgId}/me/clock/out", orgId).content("{\"idempotencyKey\":\"chave-saida-2\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not-clocked-in"));

        var entries = body(perform(owner, get("/api/orgs/{orgId}/time-entries", orgId)
                .param("from", TODAY.toString()).param("to", TODAY.toString())).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(entries, "$[*].status")).containsExactly("CLOSED");
        assertThat(JsonPath.<List<String>>read(entries, "$[*].source")).containsExactly("CLOCK");
        // O trabalhador não regista horas por outros nem corrige registos.
        perform(worker, post("/api/orgs/{orgId}/time-entries", orgId).content(manual(rui, site, TODAY, "08:00", "09:00")))
                .andExpect(status().isForbidden());
    }

    @Test
    void folhaSemanalSubmeterDevolverAprovarBloquearEReabrir() throws Exception {
        var owner = newUser("dono-folha");
        var orgId = createOrganization(owner, "Folhas F4");
        var ana = employee(owner, orgId, "Ana Folha", "Pedreiro");
        var site = site(owner, orgId, "Obra Folha", 60000);
        var worker = joinAs(owner, orgId, "WORKER", "trabalhadora-folha");
        linkEmployee(owner, orgId, worker, ana);

        // Registos manuais: pausa automática acima de 6 h; 11 h num dia útil → 2 h extra; sábado → tudo extra.
        var monday = body(perform(owner, post("/api/orgs/{orgId}/time-entries", orgId)
                .content(manual(ana, site, LAST_MONDAY, "08:00", "17:00"))).andExpect(status().isCreated()));
        assertThat((Integer) JsonPath.read(monday, "$.workedMin")).isEqualTo(480);
        assertThat((Integer) JsonPath.read(monday, "$.breakMin")).isEqualTo(60);
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content(manual(ana, site, LAST_MONDAY.plusDays(1), "07:00", "19:00")))
                .andExpect(status().isCreated());
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content(manual(ana, site, LAST_MONDAY.plusDays(5), "08:00", "12:00")))
                .andExpect(status().isCreated());
        // Sobreposição com um registo existente: a base de dados recusa.
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content(manual(ana, site, LAST_MONDAY, "16:00", "18:00")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("overlap"));
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content(manual(ana, site, TODAY.plusDays(2), "08:00", "12:00")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("future-date"));

        var week = body(perform(owner, get("/api/orgs/{orgId}/timesheets", orgId).param("week", LAST_MONDAY.toString()))
                .andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(week, "$[0].workedMin")).isEqualTo(480 + 660 + 240);
        assertThat((Integer) JsonPath.read(week, "$[0].overtimeMin")).isEqualTo(180 + 240);
        assertThat((String) JsonPath.read(week, "$[0].status")).isEqualTo("DRAFT");

        var path = "/api/orgs/{orgId}/timesheets/{employeeId}/{week}/{action}";
        // A trabalhadora submete; o gestor devolve com nota; ela volta a submeter; o gestor aprova.
        perform(worker, post(path, orgId, ana, LAST_MONDAY, "submit")).andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.status").value("SUBMITTED"));
        perform(worker, post(path, orgId, ana, LAST_MONDAY, "approve")).andExpect(status().isForbidden());
        perform(owner, post(path, orgId, ana, LAST_MONDAY, "reject").content("{}")).andExpect(status().isBadRequest());
        perform(owner, post(path, orgId, ana, LAST_MONDAY, "reject").content("{\"note\":\"Falta a terça à tarde\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.summary.status").value("REJECTED"));
        perform(worker, post(path, orgId, ana, LAST_MONDAY, "submit")).andExpect(status().isOk());
        perform(owner, post(path, orgId, ana, LAST_MONDAY, "approve").content("{\"version\":0}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("stale"));
        perform(owner, post(path, orgId, ana, LAST_MONDAY, "approve")).andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.status").value("APPROVED"))
                .andExpect(jsonPath("$.days[1].overtimeMin").value(180));

        // Semana aprovada: fechada na base de dados.
        var mondayId = JsonPath.<String>read(monday, "$.id");
        perform(owner, patch("/api/orgs/{orgId}/time-entries/{id}", orgId, mondayId)
                .content("{\"end\":\"18:00\",\"reason\":\"Saiu mais tarde\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("timesheet-locked"));
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content(manual(ana, site, LAST_MONDAY.plusDays(2), "08:00", "12:00")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("timesheet-locked"));

        // As horas aprovadas entram nas métricas da obra.
        perform(owner, get("/api/orgs/{orgId}/sites/{id}", orgId, site)).andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.realizedMin").value(1380))
                .andExpect(jsonPath("$.metrics.approvedMin").value(1380))
                .andExpect(jsonPath("$.metrics.includesTimeEntries").value(true));

        // Reabrir exige motivo; depois a correção é possível e fica numa revisão com o original.
        perform(owner, post(path, orgId, ana, LAST_MONDAY, "reopen")).andExpect(status().isBadRequest());
        perform(owner, post(path, orgId, ana, LAST_MONDAY, "reopen").content("{\"note\":\"Correção pedida pelo encarregado\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.summary.status").value("DRAFT"));
        perform(owner, patch("/api/orgs/{orgId}/time-entries/{id}", orgId, mondayId)
                .content("{\"end\":\"18:00\",\"reason\":\"Saiu mais tarde\",\"version\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.workedMin").value(540)).andExpect(jsonPath("$.revisions").value(2));
        var revisions = body(perform(owner, get("/api/orgs/{orgId}/time-entries/{id}/revisions", orgId, mondayId)));
        assertThat(JsonPath.<List<String>>read(revisions, "$[*].reason")).containsExactly("Saiu mais tarde", "Esqueceu-se do ponto");
        var audit = body(perform(owner, get("/api/orgs/{orgId}/audit", orgId).param("entityType", "timesheet")));
        assertThat(JsonPath.<List<String>>read(audit, "$.items[*].action"))
                .contains("timesheet.submit", "timesheet.reject", "timesheet.approve", "timesheet.reopen");
    }

    @Test
    void encarregadoConfirmaPresencaDaEquipaSemAprovar() throws Exception {
        var owner = newUser("dono-presenca");
        var orgId = createOrganization(owner, "Presenças F4");
        var leader = employee(owner, orgId, "Joana Encarregada", "Encarregado");
        var mason = employee(owner, orgId, "Carlos Pedreiro", "Pedreiro");
        var outsider = employee(owner, orgId, "Zé de Fora", "Servente");
        var site = site(owner, orgId, "Obra Presença", null);
        var team = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/teams", orgId)
                .content("{\"name\":\"Equipa P\",\"color\":\"#2a78d6\",\"foremanEmployeeId\":\"" + leader + "\"}"))
                .andExpect(status().isCreated())), "$.id"));
        for (var member : List.of(leader, mason)) {
            perform(owner, post("/api/orgs/{orgId}/teams/{teamId}/members", orgId, team)
                    .content("{\"employeeId\":\"" + member + "\",\"joinedOn\":\"" + TODAY.minusDays(14) + "\"}"))
                    .andExpect(status().isBadRequest());
            perform(owner, post("/api/orgs/{orgId}/teams/{teamId}/members", orgId, team)
                    .content("{\"employeeId\":\"" + member + "\"}")).andExpect(status().isOk());
        }
        var masonPlan = planToday(owner, orgId, mason, site);
        var outsiderPlan = planToday(owner, orgId, outsider, site);
        var foreman = joinAs(owner, orgId, "FOREMAN", "encarregada-presenca");
        linkEmployee(owner, orgId, foreman, leader);

        // Só confirma quem é da sua equipa; repetir não duplica.
        perform(foreman, post("/api/orgs/{orgId}/time-entries/confirm-planned", orgId)
                .content("{\"assignmentIds\":[\"%s\",\"%s\"]}".formatted(masonPlan, outsiderPlan)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(1))
                .andExpect(jsonPath("$.skippedAssignmentIds[0]").value(outsiderPlan.toString()));
        perform(foreman, post("/api/orgs/{orgId}/time-entries/confirm-planned", orgId)
                .content("{\"assignmentIds\":[\"%s\"]}".formatted(masonPlan)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(0));

        var visible = body(perform(foreman, get("/api/orgs/{orgId}/time-entries", orgId)
                .param("from", TODAY.toString()).param("to", TODAY.toString())).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(visible, "$[*].employeeId")).containsExactly(mason.toString());
        assertThat(JsonPath.<List<Integer>>read(visible, "$[*].workedMin")).containsExactly(360);
        assertThat(JsonPath.<List<String>>read(visible, "$[*].source")).containsExactly("FOREMAN");

        // Submete pela equipa, mas não aprova; horas de quem está fora da equipa não existem para ele.
        var week = TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        perform(foreman, post("/api/orgs/{orgId}/timesheets/{e}/{w}/submit", orgId, mason, week)).andExpect(status().isOk());
        perform(foreman, post("/api/orgs/{orgId}/timesheets/{e}/{w}/approve", orgId, mason, week)).andExpect(status().isForbidden());
        perform(foreman, get("/api/orgs/{orgId}/timesheets/{e}/{w}", orgId, outsider, week)).andExpect(status().isNotFound());
    }
}
