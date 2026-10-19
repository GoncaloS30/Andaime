package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.Test;

import com.jayway.jsonpath.JsonPath;

/** Planeamento por comandos: pré-visualização, conflitos, confirmação, anular, concorrência e viaturas. */
class PlanningIntegrationTest extends ApiTestSupport {

    private static final LocalDate MONDAY = LocalDate.now(ZoneId.of("Europe/Lisbon")).with(TemporalAdjusters.next(DayOfWeek.MONDAY));

    private UUID employee(Session manager, UUID orgId, String name, String category) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"%s\",\"category\":\"%s\"}".formatted(name, category))).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private UUID site(Session manager, UUID orgId, String name) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/sites", orgId)
                .content("{\"name\":\"%s\",\"country\":\"PT\",\"startDate\":\"%s\"}".formatted(name, MONDAY.minusDays(30))))
                .andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private static String assign(UUID employee, UUID site, LocalDate date, String start, String end, String extra) {
        return """
                {"kind":"ASSIGN","employeeId":"%s","siteId":"%s","date":"%s","start":"%s","end":"%s"%s}
                """.formatted(employee, site, date, start, end, extra);
    }

    private String board(Session user, UUID orgId) throws Exception {
        return body(perform(user, get("/api/orgs/{orgId}/planning/board", orgId)
                .param("from", MONDAY.toString()).param("to", MONDAY.plusDays(13).toString())).andExpect(status().isOk()));
    }

    @Test
    void comandosComPreVisualizacaoConflitosConfirmacaoEAnular() throws Exception {
        var owner = newUser("dono-plano");
        var orgId = createOrganization(owner, "Planeamento F3");
        var ana = employee(owner, orgId, "Ana Pedreira", "Pedreiro");
        var rui = employee(owner, orgId, "Rui Servente", "Servente");
        var siteA = site(owner, orgId, "Obra A");
        var siteB = site(owner, orgId, "Obra B");

        // Atribuição simples: pausa da política (60 min acima de 6 h) e minutos planeados.
        var created = body(perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(ana, siteA, MONDAY, "08:00", "17:00", ""))).andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(created, "$.created")).isEqualTo(1);
        var anaId = JsonPath.<String>read(created, "$.createdIds[0]");
        var first = board(owner, orgId);
        assertThat((Integer) JsonPath.read(first, "$.assignments[0].plannedMin")).isEqualTo(480);
        assertThat((Integer) JsonPath.read(first, "$.assignments[0].breakMin")).isEqualTo(60);

        // A pré-visualização mostra o conflito e não grava nada.
        var preview = body(perform(owner, post("/api/orgs/{orgId}/planning/preview", orgId)
                .content(assign(ana, siteB, MONDAY, "16:00", "20:00", ""))).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(preview, "$.newConflicts[*].type")).contains("EMPLOYEE_OVERLAP");
        assertThat(JsonPath.<List<Object>>read(board(owner, orgId), "$.assignments")).hasSize(1);

        // Sobreposição: bloqueia sempre.
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(ana, siteB, MONDAY, "16:00", "20:00", "")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("planning-conflicts"))
                .andExpect(jsonPath("$.conflicts[0].type").value("EMPLOYEE_OVERLAP"));
        // Duas obras no mesmo dia sem sobreposição: permitido (com aviso de capacidade diária a confirmar).
        var split = body(perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(ana, siteB, MONDAY, "17:00", "19:00", "")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("confirmation-required")));
        var capacity = JsonPath.<String>read(split, "$.conflicts[0].id");
        assertThat(capacity).startsWith("DAILY_CAPACITY:");
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(ana, siteB, MONDAY, "17:00", "19:00", ",\"acknowledgedConflictIds\":[\"" + capacity + "\"]")))
                .andExpect(status().isOk());

        // Duas pessoas sem responsável na mesma obra: aviso que exige confirmação.
        var warning = body(perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(rui, siteA, MONDAY, "08:00", "17:00", "")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("confirmation-required")));
        var missing = JsonPath.<String>read(warning, "$.conflicts[0].id");
        assertThat(missing).startsWith("MISSING_FOREMAN:");
        var confirmed = body(perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(rui, siteA, MONDAY, "08:00", "17:00", ",\"acknowledgedConflictIds\":[\"" + missing + "\"]")))
                .andExpect(status().isOk()));
        var changeSet = JsonPath.<String>read(confirmed, "$.changeSetId");
        assertThat(JsonPath.<List<Object>>read(board(owner, orgId), "$.assignments")).hasSize(3);

        // Anular a última alteração; anular duas vezes não é possível.
        var sets = body(perform(owner, get("/api/orgs/{orgId}/planning/change-sets", orgId)).andExpect(status().isOk()));
        assertThat((String) JsonPath.read(sets, "$[0].id")).isEqualTo(changeSet);
        perform(owner, post("/api/orgs/{orgId}/planning/change-sets/{id}/revert", orgId, changeSet))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deleted").value(1));
        assertThat(JsonPath.<List<Object>>read(board(owner, orgId), "$.assignments")).hasSize(2);
        perform(owner, post("/api/orgs/{orgId}/planning/change-sets/{id}/revert", orgId, changeSet))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("already-reverted"));

        // Versões: alteração com versão antiga dá 409; anular a criação depois de alterada também.
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"UPDATE","items":[{"assignmentId":"%s","version":0}],"start":"07:00"}""".formatted(anaId)))
                .andExpect(status().isOk());
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"UPDATE","items":[{"assignmentId":"%s","version":0}],"start":"09:00"}""".formatted(anaId)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("stale"));
        var history = body(perform(owner, get("/api/orgs/{orgId}/planning/change-sets", orgId)));
        var createAna = JsonPath.<List<String>>read(history, "$[?(@.kind=='ASSIGN')].id").getLast();
        perform(owner, post("/api/orgs/{orgId}/planning/change-sets/{id}/revert", orgId, createAna))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("stale"));

        // Turno noturno: o fim passa para o dia seguinte.
        var night = body(perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(rui, siteB, MONDAY.plusDays(1), "22:00", "06:00", ""))).andExpect(status().isOk()));
        var nightId = JsonPath.<String>read(night, "$.createdIds[0]");
        assertThat(JsonPath.<List<Integer>>read(board(owner, orgId), "$.assignments[?(@.id=='" + nightId + "')].plannedMin"))
                .containsExactly(420);

        // Hora inexistente na mudança para a hora de verão (último domingo de março).
        var springForward = LocalDate.of(MONDAY.getYear() + 1, 3, 31).with(TemporalAdjusters.lastInMonth(DayOfWeek.SUNDAY));
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(rui, siteA, springForward, "01:30", "05:00", "")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation"));

        // O trabalhador vê só as suas atribuições, em modo de leitura, e não altera nada.
        var worker = joinAs(owner, orgId, "WORKER", "trabalhador-plano");
        linkEmployee(owner, orgId, worker, rui);
        var own = board(worker, orgId);
        assertThat((Boolean) JsonPath.read(own, "$.readOnly")).isTrue();
        assertThat(JsonPath.<List<String>>read(own, "$.assignments[*].employeeId")).containsOnly(rui.toString());
        assertThat(JsonPath.<List<Object>>read(own, "$.conflicts")).isEmpty();
        perform(worker, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(rui, siteA, MONDAY.plusDays(3), "08:00", "12:00", "")))
                .andExpect(status().isForbidden());

        // Histórico de auditoria da alteração.
        var audit = body(perform(owner, get("/api/orgs/{orgId}/audit", orgId).param("entityType", "planning_change_set")));
        assertThat(JsonPath.<List<String>>read(audit, "$.items[*].action")).contains("planning.changed", "planning.reverted");
    }

    @Test
    void pedidosSimultaneosIncompativeisSoUmVence() throws Exception {
        var owner = newUser("dono-concorrencia");
        var orgId = createOrganization(owner, "Concorrência F3");
        var ana = employee(owner, orgId, "Ana Concorrente", "Pedreiro");
        var siteA = site(owner, orgId, "Obra C1");
        var siteB = site(owner, orgId, "Obra C2");

        var start = new CountDownLatch(1);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var tasks = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (var site : List.of(siteA, siteB)) {
                Callable<Integer> call = () -> {
                    start.await();
                    return perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                            .content(assign(ana, site, MONDAY.plusDays(2), "08:00", "12:00", "")))
                            .andReturn().getResponse().getStatus();
                };
                tasks.add(executor.submit(call));
            }
            start.countDown();
            var statuses = new ArrayList<Integer>();
            for (var task : tasks) {
                statuses.add(task.get());
            }
            assertThat(statuses).containsExactlyInAnyOrder(200, 409);
        } finally {
            executor.shutdownNow();
        }
        var board = body(perform(owner, get("/api/orgs/{orgId}/planning/board", orgId)
                .param("from", MONDAY.toString()).param("to", MONDAY.plusDays(6).toString())));
        assertThat(JsonPath.<List<Object>>read(board, "$.assignments")).hasSize(1);
    }

    @Test
    void viaturasLigadasAEquipaEntramNoPlaneamentoECopiarSemana() throws Exception {
        var owner = newUser("dono-frota");
        var orgId = createOrganization(owner, "Frota F3");
        var leader = employee(owner, orgId, "Joana Encarregada", "Encarregado");
        var mason = employee(owner, orgId, "Carlos Pedreiro", "Pedreiro");
        var helper = employee(owner, orgId, "Hugo Servente", "Servente");
        var siteA = site(owner, orgId, "Obra Frota");

        var van = body(perform(owner, post("/api/orgs/{orgId}/vehicles", orgId).content("""
                {"plate":"aa-00-aa","make":"Marca","model":"Carrinha","seats":2,"inspectionUntil":"%s"}"""
                .formatted(MONDAY.plusDays(400)))).andExpect(status().isCreated()));
        var vanId = JsonPath.<String>read(van, "$.id");
        assertThat((String) JsonPath.read(van, "$.plate")).isEqualTo("AA-00-AA");
        perform(owner, post("/api/orgs/{orgId}/vehicles", orgId).content("{\"plate\":\"AA-00-AA\",\"seats\":5}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("plate-taken"));

        var team = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/teams", orgId)
                .content("{\"name\":\"Equipa Frota\",\"color\":\"#2a78d6\",\"foremanEmployeeId\":\"" + leader + "\"}"))
                .andExpect(status().isCreated())), "$.id"));
        for (var member : List.of(leader, mason, helper)) {
            perform(owner, post("/api/orgs/{orgId}/teams/{teamId}/members", orgId, team)
                    .content("{\"employeeId\":\"" + member + "\"}")).andExpect(status().isOk());
        }
        perform(owner, put("/api/orgs/{orgId}/teams/{teamId}/vehicle", orgId, team).content("{\"vehicleId\":\"" + vanId + "\"}"))
                .andExpect(status().isNoContent());
        perform(owner, get("/api/orgs/{orgId}/teams/{teamId}", orgId, team))
                .andExpect(jsonPath("$.vehicle.plate").value("AA-00-AA"));

        // Escala da equipa: a viatura vem da equipa; 3 pessoas numa carrinha de 2 lugares é aviso.
        var schedule = """
                {"kind":"SCHEDULE","employeeIds":["%s","%s","%s"],"siteId":"%s","from":"%s","to":"%s",
                 "weekdays":[1,2,3],"start":"08:00","end":"17:00","foremanEmployeeId":"%s"%%s}
                """.formatted(leader, mason, helper, siteA, MONDAY, MONDAY.plusDays(6), leader);
        var preview = body(perform(owner, post("/api/orgs/{orgId}/planning/preview", orgId).content(schedule.formatted("")))
                .andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(preview, "$.created")).isEqualTo(9);
        List<String> warnings = JsonPath.read(preview, "$.newConflicts[?(@.severity=='WARN')].id");
        assertThat(JsonPath.<List<String>>read(preview, "$.newConflicts[*].type")).containsOnly("VEHICLE_CAPACITY");
        var acks = ",\"acknowledgedConflictIds\":[\"" + String.join("\",\"", warnings) + "\"]";
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId).content(schedule.formatted(acks)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(9));
        var board = board(owner, orgId);
        assertThat(JsonPath.<List<String>>read(board, "$.assignments[*].vehicleId")).hasSize(9).containsOnly(vanId);

        // Viatura indisponível: bloqueia novas atribuições com ela.
        perform(owner, post("/api/orgs/{orgId}/vehicles/{id}/unavailability", orgId, vanId).content("""
                {"startsOn":"%s","endsOn":"%s","reason":"Revisão"}""".formatted(MONDAY.plusDays(3), MONDAY.plusDays(3))))
                .andExpect(status().isOk());
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(mason, siteA, MONDAY.plusDays(3), "08:00", "12:00", "")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.conflicts[0].type").value("VEHICLE_UNAVAILABLE"));

        // Copiar a semana para a seguinte: dias já ocupados são ignorados e devolvidos.
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId)
                .content(assign(helper, siteA, MONDAY.plusDays(7), "08:00", "12:00", ",\"clearVehicle\":true")))
                .andExpect(status().isOk());
        var copyPreview = body(perform(owner, post("/api/orgs/{orgId}/planning/preview", orgId).content("""
                {"kind":"COPY_WEEK","sourceWeek":"%s","targetWeek":"%s"}""".formatted(MONDAY, MONDAY.plusDays(7))))
                .andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(copyPreview, "$.created")).isEqualTo(8);
        assertThat(JsonPath.<List<String>>read(copyPreview, "$.skipped[*].reason")).containsExactly("ALREADY_PLANNED");
        List<String> copyWarnings = JsonPath.read(copyPreview, "$.newConflicts[?(@.severity=='WARN')].id");
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"COPY_WEEK","sourceWeek":"%s","targetWeek":"%s","acknowledgedConflictIds":["%s"]}"""
                .formatted(MONDAY, MONDAY.plusDays(7), String.join("\",\"", copyWarnings))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(8));

        // Ficha da viatura: próximas saídas e indisponibilidade.
        perform(owner, get("/api/orgs/{orgId}/vehicles/{id}", orgId, vanId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.team.name").value("Equipa Frota"))
                .andExpect(jsonPath("$.unavailability[0].reason").value("Revisão"));
    }
}
