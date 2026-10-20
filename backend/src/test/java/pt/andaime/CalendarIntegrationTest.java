package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.jayway.jsonpath.JsonPath;

/**
 * F8.6: agenda do mês (camadas, âmbito por papel, doença só para gestores e para o próprio, eventos próprios) e mapa
 * de férias do ano (dias úteis sem fins de semana nem feriados, recorte ao ano).
 */
class CalendarIntegrationTest extends ApiTestSupport {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Europe/Lisbon"));
    /** Um mês com todos os dias 1–28 a menos de 60 dias de hoje (para a camada das validades). */
    private static final YearMonth MONTH = YearMonth.from(TODAY.plusDays(20));
    private static final byte[] PDF = ("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n")
            .getBytes(StandardCharsets.US_ASCII);

    private static LocalDate day(int day) {
        return MONTH.atDay(day);
    }

    private UUID employee(Session manager, UUID orgId, String name) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"%s\",\"category\":\"Pedreiro\"}".formatted(name))).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private UUID approvedAbsence(Session manager, UUID orgId, UUID employeeId, String kind, LocalDate from, LocalDate to) throws Exception {
        var id = JsonPath.<String>read(body(perform(manager, post("/api/orgs/{orgId}/absences", orgId).content("""
                {"employeeId":"%s","kind":"%s","startsOn":"%s","endsOn":"%s"}""".formatted(employeeId, kind, from, to)))
                .andExpect(status().isCreated())), "$.id");
        perform(manager, post("/api/orgs/{orgId}/absences/{id}/approve", orgId, id).content("{}")).andExpect(status().isOk());
        return UUID.fromString(id);
    }

    private void requestedAbsence(Session manager, UUID orgId, UUID employeeId, String kind, LocalDate from, LocalDate to) throws Exception {
        perform(manager, post("/api/orgs/{orgId}/absences", orgId).content("""
                {"employeeId":"%s","kind":"%s","startsOn":"%s","endsOn":"%s"}""".formatted(employeeId, kind, from, to)))
                .andExpect(status().isCreated());
    }

    @Test
    void agendaDoMesComCamadasEAmbitoPorPapel() throws Exception {
        var owner = newUser("dono-agenda");
        var orgId = createOrganization(owner, "Agenda F8.6");
        var ana = employee(owner, orgId, "Ana Agenda");
        var bruno = employee(owner, orgId, "Bruno Encarregado");
        var carla = employee(owner, orgId, "Carla Fora");
        var team = JsonPath.<String>read(body(perform(owner, post("/api/orgs/{orgId}/teams", orgId)
                .content("{\"name\":\"Equipa Agenda\",\"color\":\"#2a78d6\",\"foremanEmployeeId\":\"" + bruno + "\"}"))
                .andExpect(status().isCreated())), "$.id");
        perform(owner, post("/api/orgs/{orgId}/teams/{teamId}/members", orgId, team).content("{\"employeeId\":\"" + ana + "\"}"))
                .andExpect(status().isOk());
        var foreman = joinAs(owner, orgId, "FOREMAN", "encarregado-agenda");
        linkEmployee(owner, orgId, foreman, bruno);
        var worker = joinAs(owner, orgId, "WORKER", "trabalhadora-agenda");
        linkEmployee(owner, orgId, worker, ana);

        // Ausências: só as aprovadas entram.
        approvedAbsence(owner, orgId, ana, "VACATION", day(10), day(12));
        approvedAbsence(owner, orgId, ana, "SICK", day(20), day(21));
        approvedAbsence(owner, orgId, carla, "SICK", day(5), day(5));
        requestedAbsence(owner, orgId, carla, "VACATION", day(22), day(23));

        // Obras: a do Bruno com a previsão depois do fim contratual (atrasada) e outra fora do âmbito dele.
        var site = JsonPath.<String>read(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"Obra Agenda","country":"PT","status":"ACTIVE","startDate":"%s","contractEndDate":"%s","endDate":"%s",
                 "foremanEmployeeId":"%s"}""".formatted(day(3), day(15), day(24), bruno))).andExpect(status().isCreated())), "$.id");
        perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"Obra Alheia","country":"PT","status":"ACTIVE","startDate":"%s"}""".formatted(day(4))))
                .andExpect(status().isCreated());

        // Validades: seguro de uma viatura e um documento da Ana.
        perform(owner, post("/api/orgs/{orgId}/vehicles", orgId).content("""
                {"plate":"AG-86-AG","seats":5,"insuranceUntil":"%s"}""".formatted(day(12)))).andExpect(status().isCreated());
        var types = body(perform(owner, get("/api/orgs/{orgId}/document-types", orgId)).andExpect(status().isOk()));
        var licence = JsonPath.<List<String>>read(types, "$[?(@.name=='Carta de condução')].id").getFirst();
        mockMvc.perform(multipart("/api/orgs/{orgId}/documents", orgId)
                        .file(new MockMultipartFile("file", "carta.pdf", "application/pdf", PDF))
                        .param("typeId", licence).param("employeeId", ana.toString()).param("expiresOn", day(18).toString())
                        .cookie(owner.session(), owner.csrfCookie()).header("X-XSRF-TOKEN", owner.csrfToken()))
                .andExpect(status().isCreated());

        // Feriado da empresa e eventos próprios (só o gestor marca).
        perform(owner, post("/api/orgs/{orgId}/holidays", orgId).content("""
                {"date":"%s","name":"Feriado municipal da agenda"}""".formatted(day(14)))).andExpect(status().isCreated());
        var timed = JsonPath.<String>read(body(perform(owner, post("/api/orgs/{orgId}/calendar/events", orgId).content("""
                {"title":"Reunião de obra","startsOn":"%s","time":"09:30","location":"Estaleiro"}""".formatted(day(8))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.layer").value("EVENT"))
                .andExpect(jsonPath("$.end").value(day(8).toString()))), "$.link.id");
        perform(owner, post("/api/orgs/{orgId}/calendar/events", orgId).content("""
                {"title":"Entrega de material","startsOn":"%s","endsOn":"%s"}""".formatted(day(8), day(9))))
                .andExpect(status().isCreated());
        perform(owner, post("/api/orgs/{orgId}/calendar/events", orgId).content("""
                {"title":"Mau","startsOn":"%s","endsOn":"%s"}""".formatted(day(8), day(7))))
                .andExpect(status().isBadRequest());
        perform(worker, post("/api/orgs/{orgId}/calendar/events", orgId).content("""
                {"title":"Do trabalhador","startsOn":"%s"}""".formatted(day(8)))).andExpect(status().isForbidden());

        // Gestor: tudo.
        var month = body(perform(owner, get("/api/orgs/{orgId}/calendar", orgId).param("month", MONTH.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canManageEvents").value(true)));
        assertThat(JsonPath.<String>read(month, "$.from")).isLessThanOrEqualTo(day(1).toString());
        assertThat(JsonPath.<List<String>>read(month, "$.items[?(@.layer=='ABSENCE')].title"))
                .containsExactlyInAnyOrder("Carla Fora · Doença", "Ana Agenda · Férias", "Ana Agenda · Doença");
        assertThat(JsonPath.<List<String>>read(month, "$.items[?(@.layer=='ABSENCE' && @.kind=='VACATION')].tone"))
                .containsExactly("vacation");
        assertThat(JsonPath.<List<String>>read(month, "$.items[?(@.layer=='SITE' && @.link.id=='" + site + "')].kind"))
                .containsExactly("SITE_START", "SITE_CONTRACT_END", "SITE_FORECAST_END");
        assertThat(JsonPath.<List<Boolean>>read(month, "$.items[?(@.kind=='SITE_FORECAST_END' && @.link.id=='" + site + "')].late"))
                .containsExactly(true);
        assertThat(JsonPath.<List<String>>read(month, "$.items[?(@.kind=='SITE_FORECAST_END')].title").getFirst()).endsWith("(atrasada)");
        assertThat(JsonPath.<List<Object>>read(month, "$.items[?(@.layer=='SITE')]")).hasSize(4);
        assertThat(JsonPath.<List<String>>read(month, "$.items[?(@.layer=='EXPIRY')].kind")).containsExactlyInAnyOrder("INSURANCE", "DOCUMENT");
        assertThat(JsonPath.<List<String>>read(month, "$.items[?(@.kind=='DOCUMENT')].link.type")).containsExactly("EMPLOYEE_DOCUMENTS");
        assertThat(JsonPath.<List<String>>read(month, "$.items[?(@.kind=='COMPANY_HOLIDAY')].title")).containsExactly("Feriado municipal da agenda");
        // No mesmo dia, os de dia inteiro aparecem antes dos que têm hora.
        List<String> titles = JsonPath.read(month, "$.items[?(@.layer=='EVENT')].title");
        assertThat(titles).containsExactly("Entrega de material", "Reunião de obra");

        // Encarregado: a sua equipa e as suas obras; a doença da Ana aparece como "Ausência"; sem viaturas.
        var foremanMonth = body(perform(foreman, get("/api/orgs/{orgId}/calendar", orgId).param("month", MONTH.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canManageEvents").value(false)));
        assertThat(JsonPath.<List<String>>read(foremanMonth, "$.items[?(@.layer=='ABSENCE')].title"))
                .containsExactlyInAnyOrder("Ana Agenda · Férias", "Ana Agenda · Ausência");
        assertThat(JsonPath.<List<String>>read(foremanMonth, "$.items[?(@.layer=='ABSENCE')].kind")).doesNotContain("SICK");
        assertThat(JsonPath.<List<Object>>read(foremanMonth, "$.items[?(@.layer=='SITE')]")).hasSize(3);
        assertThat(JsonPath.<List<String>>read(foremanMonth, "$.items[?(@.layer=='EXPIRY')].kind")).containsExactly("DOCUMENT");
        assertThat(JsonPath.<List<Object>>read(foremanMonth, "$.items[?(@.layer=='EVENT')]")).hasSize(2);

        // Trabalhadora: as suas ausências (a doença é dela, aparece), feriados e eventos; nada de obras nem validades.
        var workerMonth = body(perform(worker, get("/api/orgs/{orgId}/calendar", orgId).param("month", MONTH.toString()))
                .andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(workerMonth, "$.items[?(@.layer=='ABSENCE')].kind")).containsExactlyInAnyOrder("VACATION", "SICK");
        assertThat(JsonPath.<List<Object>>read(workerMonth, "$.items[?(@.layer=='SITE' || @.layer=='EXPIRY')]")).isEmpty();
        assertThat(JsonPath.<List<Object>>read(workerMonth, "$.items[?(@.layer=='HOLIDAY')]")).isNotEmpty();

        // Validação e remoção de eventos.
        perform(owner, get("/api/orgs/{orgId}/calendar", orgId).param("month", "2026-13")).andExpect(status().isBadRequest());
        perform(foreman, delete("/api/orgs/{orgId}/calendar/events/{id}", orgId, timed)).andExpect(status().isForbidden());
        perform(owner, delete("/api/orgs/{orgId}/calendar/events/{id}", orgId, timed)).andExpect(status().isNoContent());
        perform(owner, delete("/api/orgs/{orgId}/calendar/events/{id}", orgId, timed)).andExpect(status().isNotFound());

        // Outra empresa não vê nada desta.
        var other = newUser("outro-agenda");
        var otherOrg = createOrganization(other, "Outra Agenda");
        var otherMonth = body(perform(other, get("/api/orgs/{orgId}/calendar", otherOrg).param("month", MONTH.toString())));
        assertThat(JsonPath.<List<Object>>read(otherMonth, "$.items[?(@.layer=='EVENT' || @.layer=='ABSENCE' || @.layer=='SITE')]")).isEmpty();
    }

    @Test
    void mapaDoAnoContaDiasUteisSemFeriadosERecortaAoAno() throws Exception {
        var owner = newUser("dono-mapa");
        var orgId = createOrganization(owner, "Mapa de Férias");
        var ana = employee(owner, orgId, "Ana Mapa");
        var bruno = employee(owner, orgId, "Bruno Mapa");
        var carla = employee(owner, orgId, "Carla Mapa");
        var team = JsonPath.<String>read(body(perform(owner, post("/api/orgs/{orgId}/teams", orgId)
                .content("{\"name\":\"Equipa Mapa\",\"color\":\"#2a78d6\",\"foremanEmployeeId\":\"" + bruno + "\"}"))
                .andExpect(status().isCreated())), "$.id");
        perform(owner, post("/api/orgs/{orgId}/teams/{teamId}/members", orgId, team).content("{\"employeeId\":\"" + ana + "\"}"))
                .andExpect(status().isOk());
        var foreman = joinAs(owner, orgId, "FOREMAN", "encarregado-mapa");
        linkEmployee(owner, orgId, foreman, bruno);
        var worker = joinAs(owner, orgId, "WORKER", "trabalhadora-mapa");
        linkEmployee(owner, orgId, worker, ana);

        // 23/12/2030 (segunda) a 03/01/2031: em 2030 contam 23, 26, 27, 30 e 31 (25 é Natal e 24 feriado da empresa);
        // em 2031 contam 2 e 3 (1 de janeiro é feriado).
        perform(owner, post("/api/orgs/{orgId}/holidays", orgId).content("{\"date\":\"2030-12-24\",\"name\":\"Véspera de Natal\"}"))
                .andExpect(status().isCreated());
        approvedAbsence(owner, orgId, ana, "VACATION", LocalDate.parse("2030-12-23"), LocalDate.parse("2031-01-03"));
        requestedAbsence(owner, orgId, ana, "VACATION", LocalDate.parse("2030-08-05"), LocalDate.parse("2030-08-09"));
        approvedAbsence(owner, orgId, ana, "SICK", LocalDate.parse("2030-03-04"), LocalDate.parse("2030-03-06"));
        approvedAbsence(owner, orgId, carla, "VACATION", LocalDate.parse("2030-06-03"), LocalDate.parse("2030-06-07"));

        var map = body(perform(owner, get("/api/orgs/{orgId}/absences/year", orgId).param("year", "2030")).andExpect(status().isOk()));
        assertThat(JsonPath.<List<Integer>>read(map, "$.years")).contains(TODAY.getYear(), TODAY.getYear() + 1, 2030, 2031);
        assertThat(JsonPath.<List<String>>read(map, "$.holidays[*].date")).contains("2030-12-24", "2030-12-25");
        assertThat(JsonPath.<List<String>>read(map, "$.rows[*].employeeName")).containsExactly("Ana Mapa", "Bruno Mapa", "Carla Mapa");
        var anaRow = "$.rows[?(@.employeeName=='Ana Mapa')]";
        assertThat(JsonPath.<List<Integer>>read(map, anaRow + ".vacationDays")).containsExactly(5);
        assertThat(JsonPath.<List<Integer>>read(map, anaRow + ".pendingVacationDays")).containsExactly(5);
        assertThat(JsonPath.<List<String>>read(map, anaRow + ".periods[*].kind")).containsExactly("SICK", "VACATION", "VACATION");
        assertThat(JsonPath.<List<String>>read(map, anaRow + ".periods[?(@.status=='APPROVED' && @.kind=='VACATION')].to"))
                .containsExactly("2030-12-31");
        // Carla: 3 a 7 de junho de 2030, sem feriados nesses dias (10 de junho fica fora).
        assertThat(JsonPath.<List<Integer>>read(map, "$.rows[?(@.employeeName=='Carla Mapa')].vacationDays")).containsExactly(5);

        var next = body(perform(owner, get("/api/orgs/{orgId}/absences/year", orgId).param("year", "2031")).andExpect(status().isOk()));
        assertThat(JsonPath.<List<Integer>>read(next, anaRow + ".vacationDays")).containsExactly(2);
        assertThat(JsonPath.<List<String>>read(next, anaRow + ".periods[*].from")).containsExactly("2031-01-01");

        // Encarregado: ele e a equipa; a doença da Ana aparece como "Ausência". Trabalhadora: só a sua linha, com a doença.
        var foremanMap = body(perform(foreman, get("/api/orgs/{orgId}/absences/year", orgId).param("year", "2030")).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(foremanMap, "$.rows[*].employeeName")).containsExactly("Ana Mapa", "Bruno Mapa");
        assertThat(JsonPath.<List<String>>read(foremanMap, anaRow + ".periods[*].kind")).containsExactly("ABSENCE", "VACATION", "VACATION");
        var workerMap = body(perform(worker, get("/api/orgs/{orgId}/absences/year", orgId).param("year", "2030")).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(workerMap, "$.rows[*].employeeName")).containsExactly("Ana Mapa");
        assertThat(JsonPath.<List<String>>read(workerMap, anaRow + ".periods[*].kind")).containsExactly("SICK", "VACATION", "VACATION");

        perform(owner, get("/api/orgs/{orgId}/absences/year", orgId).param("year", "1990")).andExpect(status().isBadRequest());
    }
}
