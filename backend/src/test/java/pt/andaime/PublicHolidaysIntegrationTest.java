package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

import com.jayway.jsonpath.JsonPath;

/**
 * Feriados nacionais: lista por país e ano carregada a pedido na tabela global, e o trabalho num feriado nacional do
 * país da obra a contar como num feriado da empresa. As datas são de 2026, já passadas (não há registos no futuro).
 */
@TestPropertySource(properties = "andaime.holidays.national-in-hours=true")
class PublicHolidaysIntegrationTest extends ApiTestSupport {

    private UUID employee(Session manager, UUID orgId, String name) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"%s\",\"category\":\"Pedreiro\"}".formatted(name))).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private UUID site(Session manager, UUID orgId, String name, String country) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"%s","country":"%s","status":"ACTIVE","startDate":"2026-01-01"}""".formatted(name, country)))
                .andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private void entry(Session manager, UUID orgId, UUID employee, UUID site, LocalDate date) throws Exception {
        perform(manager, post("/api/orgs/{orgId}/time-entries", orgId).content("""
                {"employeeId":"%s","siteId":"%s","date":"%s","start":"08:00","end":"12:00","reason":"Registo de teste"}"""
                .formatted(employee, site, date))).andExpect(status().isCreated());
    }

    /** Dia da folha semanal: [trabalhado, normal, extra, descanso?]. */
    private List<Object> day(Session manager, UUID orgId, UUID employee, LocalDate date) throws Exception {
        var monday = date.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY));
        var json = body(perform(manager, get("/api/orgs/{orgId}/timesheets/{e}/{w}", orgId, employee, monday)).andExpect(status().isOk()));
        var path = "$.days[?(@.date=='" + date + "')]";
        return List.of(JsonPath.<List<Integer>>read(json, path + ".workedMin").getFirst(),
                JsonPath.<List<Integer>>read(json, path + ".normalMin").getFirst(),
                JsonPath.<List<Integer>>read(json, path + ".overtimeMin").getFirst(),
                JsonPath.<List<Boolean>>read(json, path + ".restDay").getFirst());
    }

    @Test
    void listaOsFeriadosNacionaisPorPaisEAno() throws Exception {
        var owner = newUser("dono-feriados");
        var orgId = createOrganization(owner, "Feriados Nacionais");

        var pt = body(perform(owner, get("/api/orgs/{orgId}/public-holidays", orgId).param("country", "PT").param("year", "2026"))
                .andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(pt, "$[*].date")).containsExactly(
                "2026-01-01", "2026-04-03", "2026-04-05", "2026-04-25", "2026-05-01", "2026-06-04", "2026-06-10", "2026-08-15",
                "2026-10-05", "2026-11-01", "2026-12-01", "2026-12-08", "2026-12-25");
        assertThat(JsonPath.<List<String>>read(pt, "$[?(@.date=='2026-06-04')].name")).containsExactly("Corpo de Deus");
        // Repetir não duplica (carregamento idempotente) e o código do país aceita minúsculas.
        perform(owner, get("/api/orgs/{orgId}/public-holidays", orgId).param("country", "pt").param("year", "2026"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(13));
        perform(owner, get("/api/orgs/{orgId}/public-holidays", orgId).param("country", "FR").param("year", "2026"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.date=='2026-05-14')].name").value("Ascension"));

        perform(owner, get("/api/orgs/{orgId}/public-holidays", orgId).param("country", "PL").param("year", "2026"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("unsupported-country"));
        perform(owner, get("/api/orgs/{orgId}/public-holidays", orgId).param("country", "PT").param("year", "1890"))
                .andExpect(status().isBadRequest());
        var worker = joinAs(owner, orgId, "WORKER", "trabalhador-feriados");
        perform(worker, get("/api/orgs/{orgId}/public-holidays", orgId).param("country", "PT").param("year", "2026"))
                .andExpect(status().isForbidden());
    }

    @Test
    void trabalhoNumFeriadoNacionalDaObraContaComoNumFeriadoDaEmpresa() throws Exception {
        var owner = newUser("dono-feriado-obra");
        var orgId = createOrganization(owner, "Feriados nas Obras");
        var ana = employee(owner, orgId, "Ana Feriado");
        var rui = employee(owner, orgId, "Rui Feriado");
        var lisboa = site(owner, orgId, "Obra Lisboa", "PT");
        var madrid = site(owner, orgId, "Obra Madrid", "ES");

        // Dia de Portugal (quarta, 10/06/2026) numa obra em Portugal: 4 h todas extra, dia de descanso.
        entry(owner, orgId, ana, lisboa, LocalDate.of(2026, 6, 10));
        assertThat(day(owner, orgId, ana, LocalDate.of(2026, 6, 10))).containsExactly(240, 0, 240, true);

        // Exatamente como um feriado da empresa (quarta seguinte, 17/06/2026).
        perform(owner, post("/api/orgs/{orgId}/holidays", orgId).content("{\"date\":\"2026-06-17\",\"name\":\"Feriado municipal\"}"))
                .andExpect(status().isCreated());
        entry(owner, orgId, ana, lisboa, LocalDate.of(2026, 6, 17));
        assertThat(day(owner, orgId, ana, LocalDate.of(2026, 6, 17))).containsExactly(240, 0, 240, true);
        // Na véspera, dia útil normal.
        entry(owner, orgId, ana, lisboa, LocalDate.of(2026, 6, 16));
        assertThat(day(owner, orgId, ana, LocalDate.of(2026, 6, 16))).containsExactly(240, 240, 0, false);

        // Aprovar a semana mantém a divisão (e é o que segue para os relatórios).
        var june = LocalDate.of(2026, 6, 8);
        perform(owner, post("/api/orgs/{orgId}/timesheets/{e}/{w}/approve", orgId, ana, june)).andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.status").value("APPROVED"))
                .andExpect(jsonPath("$.summary.normalMin").value(0))
                .andExpect(jsonPath("$.summary.overtimeMin").value(240));

        // Fiesta Nacional de España (segunda, 12/10/2026): é feriado na obra de Madrid, não na de Lisboa.
        var october = LocalDate.of(2026, 10, 12);
        entry(owner, orgId, ana, madrid, october);
        entry(owner, orgId, rui, lisboa, october);
        assertThat(day(owner, orgId, ana, october)).containsExactly(240, 0, 240, true);
        assertThat(day(owner, orgId, rui, october)).containsExactly(240, 240, 0, false);
        // No dia seguinte, em Madrid, é um dia útil.
        entry(owner, orgId, ana, madrid, october.plusDays(1));
        assertThat(day(owner, orgId, ana, october.plusDays(1))).containsExactly(240, 240, 0, false);

        // A vista semanal da equipa usa a mesma regra.
        var week = body(perform(owner, get("/api/orgs/{orgId}/timesheets", orgId).param("week", october.toString()))
                .andExpect(status().isOk()));
        assertThat(JsonPath.<List<Integer>>read(week, "$[?(@.employeeId=='" + ana + "')].overtimeMin")).containsExactly(240);
        assertThat(JsonPath.<List<Integer>>read(week, "$[?(@.employeeId=='" + rui + "')].overtimeMin")).containsExactly(0);
    }

    @Test
    void aAplicacaoSoAcrescentaFeriadosAtravesDaFuncao() throws SQLException {
        try (var connection = appConnection(); var statement = connection.createStatement()) {
            assertThatThrownBy(() -> statement.execute(
                    "INSERT INTO public_holidays (country, region, holiday_date, name) VALUES ('PT', '', '2031-02-03', 'Falso')"))
                    .isInstanceOf(SQLException.class).hasMessageContaining("permission denied");
            assertThatThrownBy(() -> statement.execute("DELETE FROM public_holidays"))
                    .isInstanceOf(SQLException.class).hasMessageContaining("permission denied");
            assertThatThrownBy(() -> statement.execute(
                    "SELECT app.ensure_public_holidays('PT', 2031, '[{\"date\":\"2032-01-01\",\"name\":\"Fora do ano\"}]'::jsonb)"))
                    .isInstanceOf(SQLException.class).hasMessageContaining("fora do ano");
            var result = statement.executeQuery(
                    "SELECT app.ensure_public_holidays('XX', 2031, '[{\"date\":\"2031-03-03\",\"name\":\"Teste\"}]'::jsonb)");
            result.next();
            assertThat(result.getInt(1)).isEqualTo(1);
            result = statement.executeQuery(
                    "SELECT app.ensure_public_holidays('XX', 2031, '[{\"date\":\"2031-03-03\",\"name\":\"Teste\"}]'::jsonb)");
            result.next();
            assertThat(result.getInt(1)).isZero();
        }
    }
}
