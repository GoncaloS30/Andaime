package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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

/** Dormidas e hotéis (F8.4): hotéis por obra, quadro da semana, estadias, app do trabalhador e histórico. */
class LodgingIntegrationTest extends ApiTestSupport {

    private static final LocalDate MONDAY = LocalDate.now(ZoneId.of("Europe/Lisbon")).with(TemporalAdjusters.next(DayOfWeek.MONDAY));

    private UUID employee(Session manager, UUID orgId, String name, String extra) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"%s\",\"category\":\"Pedreiro\"%s}".formatted(name, extra))).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private UUID site(Session manager, UUID orgId, String name, String country, double lat, double lng) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"%s","country":"%s","status":"ACTIVE","latitude":%s,"longitude":%s}""".formatted(name, country, lat, lng)))
                .andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private int schedule(Session manager, UUID orgId, UUID employee, UUID site, LocalDate from, LocalDate to) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"SCHEDULE","employeeIds":["%s"],"siteId":"%s","from":"%s","to":"%s","weekdays":[1,2,3,4,5],
                 "start":"08:00","end":"17:00","foremanEmployeeId":"%s"}""".formatted(employee, site, from, to, employee)))
                .andExpect(status().isOk()));
        return JsonPath.read(json, "$.created");
    }

    private String hotel(Session manager, UUID orgId, UUID site, String name) throws Exception {
        return body(perform(manager, post("/api/orgs/{orgId}/lodging/hotels", orgId).content("""
                {"siteId":"%s","name":"%s","address":"Hauptstraße 1, München","contact":"+49 89 000"}""".formatted(site, name))));
    }

    private static String stay(UUID employee, UUID site, Object hotel, LocalDate in, LocalDate out) {
        return """
                {"employeeId":"%s","siteId":"%s","week":"%s","hotelId":%s,"checkIn":"%s","checkOut":"%s"}
                """.formatted(employee, site, MONDAY, hotel == null ? "null" : "\"" + hotel + "\"", in, out);
    }

    private String week(Session manager, UUID orgId) throws Exception {
        return body(perform(manager, get("/api/orgs/{orgId}/lodging/week", orgId).param("week", MONDAY.plusDays(2).toString()))
                .andExpect(status().isOk()));
    }

    @Test
    void hoteisQuadroDaSemanaEstadiasEAppDoTrabalhador() throws Exception {
        var owner = newUser("dono-dormidas");
        var orgId = createOrganization(owner, "Dormidas F8.4");

        // Residência: latitude e longitude juntas, ou nenhuma.
        perform(owner, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"Meia Coordenada\",\"category\":\"Pedreiro\",\"homeLatitude\":41.5}"))
                .andExpect(status().isBadRequest());
        var ana = employee(owner, orgId, "Ana Longe", ",\"homeCity\":\"Braga\",\"homeLatitude\":41.5454,\"homeLongitude\":-8.4265");
        perform(owner, get("/api/orgs/{orgId}/employees/{id}", orgId, ana))
                .andExpect(jsonPath("$.homeLatitude").value(41.5454)).andExpect(jsonPath("$.homeLongitude").value(-8.4265));
        var rui = employee(owner, orgId, "Rui Perto", "");
        var munich = site(owner, orgId, "Obra Munique", "DE", 48.11, 11.56);
        var braga = site(owner, orgId, "Obra Braga", "PT", 41.56, -8.40);

        var anaDays = schedule(owner, orgId, ana, munich, MONDAY, MONDAY.plusDays(4));
        schedule(owner, orgId, rui, braga, MONDAY, MONDAY.plusDays(1));
        // Ausência aprovada (mantendo a escala) na terça: esse dia não conta para as dormidas.
        var absence = JsonPath.<String>read(body(perform(owner, post("/api/orgs/{orgId}/absences", orgId).content("""
                {"employeeId":"%s","kind":"VACATION","startsOn":"%s","endsOn":"%s"}""".formatted(rui, MONDAY.plusDays(1),
                MONDAY.plusDays(1)))).andExpect(status().isCreated())), "$.id");
        perform(owner, post("/api/orgs/{orgId}/absences/{id}/approve", orgId, absence).content("{\"resolution\":\"KEEP\"}"))
                .andExpect(status().isOk());

        // Hotéis: nome único na obra sem acentos nem maiúsculas.
        var saoJoao = JsonPath.<String>read(hotel(owner, orgId, munich, "Hotel São João"), "$.id");
        perform(owner, post("/api/orgs/{orgId}/lodging/hotels", orgId).content("""
                {"siteId":"%s","name":"hotel sao joao"}""".formatted(munich)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("name-taken"));
        var pensao = JsonPath.<String>read(hotel(owner, orgId, munich, "Pensão Alemã"), "$.id");
        var bragaHotel = JsonPath.<String>read(hotel(owner, orgId, braga, "Hotel Bracara"), "$.id");
        perform(owner, patch("/api/orgs/{orgId}/lodging/hotels/{id}", orgId, pensao)
                .content("{\"name\":\"Pensão Alemã\",\"contact\":\"+49 89 111\",\"version\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.contact").value("+49 89 111"));

        // Quadro: longe primeiro, datas propostas pela escala, ausência descontada, residência sem localização.
        var board = week(owner, orgId);
        assertThat((String) JsonPath.read(board, "$.week")).isEqualTo(MONDAY.toString());
        assertThat(JsonPath.<List<String>>read(board, "$.lines[*].employeeName")).containsExactly("Ana Longe", "Rui Perto");
        assertThat((String) JsonPath.read(board, "$.lines[0].away")).isEqualTo("FAR");
        assertThat(JsonPath.<List<Object>>read(board, "$.lines[0].days")).hasSize(anaDays);
        assertThat(JsonPath.<List<String>>read(board, "$.lines[0].hotels[*].name")).containsExactly("Hotel São João", "Pensão Alemã");
        assertThat((String) JsonPath.read(board, "$.lines[1].away")).isEqualTo("UNKNOWN");
        assertThat(JsonPath.<List<String>>read(board, "$.lines[1].days")).containsExactly(MONDAY.toString());
        assertThat((String) JsonPath.read(board, "$.lines[1].proposedCheckOut")).isEqualTo(MONDAY.plusDays(1).toString());
        assertThat((Integer) JsonPath.read(board, "$.lines[1].proposedNights")).isEqualTo(1);

        var worker = joinAs(owner, orgId, "WORKER", "trabalhadora-dormidas");
        linkEmployee(owner, orgId, worker, ana);

        // Marcar: só a gestão; datas e hotel validados; idempotente por pessoa × obra × semana.
        var anaStay = stay(ana, munich, saoJoao, MONDAY, MONDAY.plusDays(4));
        perform(worker, put("/api/orgs/{orgId}/lodging/stays", orgId).content(anaStay)).andExpect(status().isForbidden());
        perform(owner, put("/api/orgs/{orgId}/lodging/stays", orgId).content(stay(ana, munich, saoJoao, MONDAY, MONDAY)))
                .andExpect(status().isBadRequest());
        perform(owner, put("/api/orgs/{orgId}/lodging/stays", orgId).content(stay(ana, munich, bragaHotel, MONDAY, MONDAY.plusDays(4))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("hotelId"));
        var marked = body(perform(owner, put("/api/orgs/{orgId}/lodging/stays", orgId).content(anaStay))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nights").value(4)).andExpect(jsonPath("$.hotelName").value("Hotel São João")));
        var stayId = JsonPath.<String>read(marked, "$.id");
        perform(owner, put("/api/orgs/{orgId}/lodging/stays", orgId).content(anaStay))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(stayId)).andExpect(jsonPath("$.version").value(0));
        var inbox = body(perform(worker, get("/api/orgs/{orgId}/notifications", orgId)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(inbox, "$.items[*].title")).containsOnlyOnce("Estadia marcada");

        // App do trabalhador: onde dorme esta semana; histórico só da própria pessoa.
        var mine = body(perform(worker, get("/api/orgs/{orgId}/me/stays", orgId).param("week", MONDAY.toString())).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(mine, "$[*].hotelAddress")).containsExactly("Hauptstraße 1, München");
        perform(worker, get("/api/orgs/{orgId}/employees/{id}/stays", orgId, ana)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        perform(worker, get("/api/orgs/{orgId}/employees/{id}/stays", orgId, rui)).andExpect(status().isForbidden());
        perform(worker, get("/api/orgs/{orgId}/lodging/week", orgId)).andExpect(status().isForbidden());
        perform(owner, get("/api/orgs/{orgId}/me/stays", orgId)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));

        // Estadia sem escala (o Rui não está escalado em Munique) e com hotel por definir.
        var orphan = JsonPath.<String>read(body(perform(owner, put("/api/orgs/{orgId}/lodging/stays", orgId)
                .content(stay(rui, munich, null, MONDAY, MONDAY.plusDays(1)))).andExpect(status().isOk())), "$.id");
        board = week(owner, orgId);
        assertThat((String) JsonPath.read(board, "$.lines[0].stay.id")).isEqualTo(stayId);
        assertThat(JsonPath.<List<String>>read(board, "$.staysWithoutSchedule[*].id")).containsExactly(orphan);
        assertThat((Integer) JsonPath.read(board, "$.summary.peopleAway")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(board, "$.summary.nights")).isEqualTo(5);
        assertThat((Integer) JsonPath.read(board, "$.summary.undefinedHotel")).isEqualTo(1);
        assertThat((Integer) JsonPath.read(board, "$.summary.withoutSchedule")).isEqualTo(1);

        // Remover o hotel não apaga a estadia: fica "por definir".
        var hotels = body(perform(owner, get("/api/orgs/{orgId}/lodging/hotels", orgId).param("siteId", munich.toString())));
        assertThat((Integer) JsonPath.read(hotels, "$[0].nights")).isEqualTo(4);
        perform(owner, delete("/api/orgs/{orgId}/lodging/hotels/{id}", orgId, saoJoao)).andExpect(status().isNoContent());
        board = week(owner, orgId);
        assertThat((Object) JsonPath.read(board, "$.lines[0].stay.hotelId")).isNull();
        assertThat((Integer) JsonPath.read(board, "$.summary.undefinedHotel")).isEqualTo(2);
        assertThat(JsonPath.<List<String>>read(board, "$.lines[0].hotels[*].name")).containsExactly("Pensão Alemã");

        // Remover a estadia sem escala.
        perform(owner, delete("/api/orgs/{orgId}/lodging/stays/{id}", orgId, orphan)).andExpect(status().isNoContent());
        assertThat((Integer) JsonPath.read(week(owner, orgId), "$.summary.withoutSchedule")).isZero();
    }
}
