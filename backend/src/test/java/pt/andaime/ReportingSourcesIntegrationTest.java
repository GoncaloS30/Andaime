package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.jayway.jsonpath.JsonPath;

/** F6: os relatórios só contam horas de semanas aprovadas e o estado real dos documentos (projeções). */
class ReportingSourcesIntegrationTest extends ApiTestSupport {

    private static final LocalDate LAST_MONDAY = LocalDate.now(ZoneId.of("Europe/Lisbon"))
            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusDays(7);

    @Test
    void horasAprovadasEDocumentosChegamAosRelatorios() throws Exception {
        var owner = newUser("dono-relatorios-fontes");
        var orgId = createOrganization(owner, "Relatórios F6");
        var ana = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"Ana Relatório\",\"category\":\"Pedreiro\"}")).andExpect(status().isCreated())), "$.id"));
        var site = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId)
                .content("{\"name\":\"Obra Relatório\",\"country\":\"PT\",\"status\":\"ACTIVE\"}")).andExpect(status().isCreated())), "$.id"));
        // Segunda 10 h (8 normais + 2 extra) e terça 4 h.
        for (var entry : List.of(new String[] {"0", "07:00", "18:00"}, new String[] {"1", "08:00", "12:00"})) {
            perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content("""
                    {"employeeId":"%s","siteId":"%s","date":"%s","start":"%s","end":"%s","reason":"Registo de teste"}"""
                    .formatted(ana, site, LAST_MONDAY.plusDays(Integer.parseInt(entry[0])), entry[1], entry[2])))
                    .andExpect(status().isCreated());
        }
        var hours = "/api/orgs/{orgId}/reporting/hours";
        // Antes de aprovar: nada nos relatórios.
        perform(owner, get(hours, orgId).param("groupBy", "employee").param("from", LAST_MONDAY.toString())
                .param("to", LAST_MONDAY.plusDays(6).toString())).andExpect(status().isOk()).andExpect(jsonPath("$.totals.workedMin").value(0));

        perform(owner, post("/api/orgs/{orgId}/timesheets/{e}/{w}/approve", orgId, ana, LAST_MONDAY)).andExpect(status().isOk());
        var report = body(perform(owner, get(hours, orgId).param("groupBy", "employee").param("from", LAST_MONDAY.toString())
                .param("to", LAST_MONDAY.plusDays(6).toString())).andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(report, "$.totals.workedMin")).isEqualTo(600 + 240);
        assertThat((Integer) JsonPath.read(report, "$.totals.overtimeMin")).isEqualTo(120);
        assertThat(JsonPath.<List<String>>read(report, "$.groups[*].label")).containsExactly("Ana Relatório");

        // Reabrir a semana retira as horas dos relatórios até nova aprovação.
        perform(owner, post("/api/orgs/{orgId}/timesheets/{e}/{w}/reopen", orgId, ana, LAST_MONDAY)
                .content("{\"note\":\"Correção pedida\"}")).andExpect(status().isOk());
        perform(owner, get(hours, orgId).param("groupBy", "employee").param("from", LAST_MONDAY.toString())
                .param("to", LAST_MONDAY.plusDays(6).toString())).andExpect(jsonPath("$.totals.workedMin").value(0));

        // Documento carregado e por verificar.
        var types = body(perform(owner, get("/api/orgs/{orgId}/document-types", orgId)));
        var typeId = JsonPath.<List<String>>read(types, "$[?(@.name=='Ficha de aptidão médica')].id").getFirst();
        var pdf = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
        mockMvc.perform(multipart("/api/orgs/{orgId}/documents", orgId).file(new MockMultipartFile("file", "a.pdf", "application/pdf", pdf))
                .param("typeId", typeId).param("employeeId", ana.toString()).param("expiresOn", LAST_MONDAY.plusYears(1).toString())
                .cookie(owner.session(), owner.csrfCookie()).header("X-XSRF-TOKEN", owner.csrfToken())).andExpect(status().isCreated());
        var documents = body(perform(owner, get("/api/orgs/{orgId}/reporting/documents", orgId)).andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(documents, "$.total")).isEqualTo(1);
        assertThat(JsonPath.<List<String>>read(documents, "$.statuses[?(@.documents > 0)].status")).containsExactly("PENDING");
    }
}
