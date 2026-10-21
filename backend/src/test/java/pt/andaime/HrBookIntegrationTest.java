package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import com.jayway.jsonpath.JsonPath;

import pt.andaime.reporting.application.ReportExportProcessor;

/** F8.7: livro de horas do RH pela fila de exportações e férias aprovadas em .ics. */
class HrBookIntegrationTest extends ApiTestSupport {

    /** Março de 2026: o dia 1 é domingo, a semana de 2 a 8 fica aprovada e a de 16 não. */
    private static final LocalDate MONDAY = LocalDate.of(2026, 3, 2);

    @Autowired
    ReportExportProcessor exportProcessor;

    @Test
    void livroDoMesComFolhaPorPessoaAusenciasEFormulasParaTabelas() throws Exception {
        var owner = newUser("dono-livro");
        var orgId = createOrganization(owner, "Livro RH");
        var ana = id(body(perform(owner, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"Ana Livro\",\"category\":\"Pedreira\",\"number\":\"123\"}"))
                .andExpect(status().isCreated())));
        var bruno = id(body(perform(owner, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"Bruno Livro\",\"category\":\"Servente\",\"number\":\"7\"}"))
                .andExpect(status().isCreated())));
        var site = id(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"code":"OB-77","name":"Obra Livro","country":"PT","status":"ACTIVE","startDate":"2026-01-01","erpOrder":"OC-77"}
                """)).andExpect(status().isCreated())));

        // Segunda 8 h normais; terça 11 h (3 h extra → 802); quarta 8,5 h (30 min extra → 801).
        manual(owner, orgId, ana, site, MONDAY, "08:00", "17:00");
        manual(owner, orgId, ana, site, MONDAY.plusDays(1), "07:00", "19:00");
        manual(owner, orgId, ana, site, MONDAY.plusDays(2), "08:00", "17:30");
        perform(owner, post("/api/orgs/{orgId}/timesheets/{employeeId}/{week}/approve", orgId, ana, MONDAY))
                .andExpect(status().isOk());
        // Semana por aprovar: fica fora do livro e conta como pendente.
        manual(owner, orgId, ana, site, MONDAY.plusDays(14), "08:00", "12:00");

        // Férias de quinta a segunda (5 a 9): o fim de semana não entra. Doença do Bruno num dia.
        var vacation = absence(owner, orgId, ana, "VACATION", MONDAY.plusDays(3), MONDAY.plusDays(7));
        absence(owner, orgId, bruno, "SICK", MONDAY.plusDays(8), MONDAY.plusDays(8));

        var worker = joinAs(owner, orgId, "WORKER", "trabalhador-livro");
        perform(worker, get("/api/orgs/{orgId}/reporting/hr-book", orgId).param("month", "2026-03"))
                .andExpect(status().isForbidden());
        perform(owner, get("/api/orgs/{orgId}/reporting/hr-book", orgId).param("month", "2026-13"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation"));
        perform(owner, get("/api/orgs/{orgId}/reporting/hr-book", orgId).param("month", "2026-03"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.month").value("2026-03"))
                .andExpect(jsonPath("$.sheets").value(2))
                .andExpect(jsonPath("$.rows").value(7))
                .andExpect(jsonPath("$.absenceDays").value(4))
                .andExpect(jsonPath("$.workedMin").value(480 + 660 + 510))
                .andExpect(jsonPath("$.pendingDays").value(1))
                .andExpect(jsonPath("$.activityCodes[0].code").value("800"))
                .andExpect(jsonPath("$.people[0].sheetName").value("Ana Livro-123"))
                .andExpect(jsonPath("$.people[1].sheetName").value("Bruno Livro-7"));

        perform(owner, post("/api/orgs/{orgId}/reporting/exports", orgId).content("{\"kind\":\"HR_BOOK\"}"))
                .andExpect(status().isBadRequest());
        var queued = body(perform(owner, post("/api/orgs/{orgId}/reporting/exports", orgId)
                .content("{\"kind\":\"HR_BOOK\",\"month\":\"2026-03\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.kind").value("HR_BOOK"))
                .andExpect(jsonPath("$.parameters.month").value("2026-03")));
        var exportId = id(queued);
        // A fila é partilhada pelos testes: processa até este job ficar pronto.
        String state = "PENDING";
        for (int attempt = 0; attempt < 20 && !"READY".equals(state) && !"FAILED".equals(state); attempt++) {
            exportProcessor.processOne();
            state = JsonPath.read(body(perform(owner, get("/api/orgs/{orgId}/reporting/exports/{id}", orgId, exportId))),
                    "$.status");
        }
        assertThat(state).isEqualTo("READY");
        var download = perform(owner, get("/api/orgs/{orgId}/reporting/exports/{id}/download", orgId, exportId))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(download.getHeader("Content-Disposition")).contains("livro-horas-rh-2026-03.xlsx");

        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(download.getContentAsByteArray()))) {
            assertThat(workbook.getNumberOfSheets()).isEqualTo(3);
            assertThat(workbook.getSheetName(0)).isEqualTo("Tabelas");
            assertThat(workbook.getSheetName(1)).isEqualTo("Ana Livro-123");
            assertThat(workbook.getSheetName(2)).isEqualTo("Bruno Livro-7");
            var tables = workbook.getSheet("Tabelas");
            assertThat(tables.getRow(1).getCell(1).getStringCellValue()).isEqualTo("800");
            assertThat(tables.getRow(2).getCell(1).getStringCellValue()).isEqualTo("801");
            assertThat(tables.getRow(3).getCell(1).getStringCellValue()).isEqualTo("802");

            var sheet = workbook.getSheet("Ana Livro-123");
            var header = sheet.getRow(0);
            assertThat(new String[] {header.getCell(0).getStringCellValue(), header.getCell(1).getStringCellValue(),
                    header.getCell(2).getStringCellValue(), header.getCell(3).getStringCellValue(),
                    header.getCell(4).getStringCellValue(), header.getCell(5).getStringCellValue()})
                    .containsExactly("Data", "Horas", "Obra", "Atividade", "Ordem", "Ausência");
            assertThat(sheet.getLastRowNum()).isEqualTo(6);

            var monday = sheet.getRow(1);
            assertThat(monday.getCell(0).getLocalDateTimeCellValue().toLocalDate()).isEqualTo(MONDAY);
            assertThat(monday.getCell(1).getNumericCellValue()).isEqualTo(8.0);
            assertThat(monday.getCell(2).getStringCellValue()).isEqualTo("OB-77");
            assertThat(monday.getCell(3).getCellType()).isEqualTo(CellType.FORMULA);
            assertThat(monday.getCell(3).getCellFormula()).isEqualTo("Tabelas!$B$2");
            assertThat(monday.getCell(3).getStringCellValue()).isEqualTo("800");
            assertThat(monday.getCell(4).getStringCellValue()).isEqualTo("OC-77");
            assertThat(sheet.getRow(2).getCell(3).getCellFormula()).isEqualTo("Tabelas!$B$4");
            assertThat(sheet.getRow(2).getCell(3).getStringCellValue()).isEqualTo("802");
            assertThat(sheet.getRow(3).getCell(3).getStringCellValue()).isEqualTo("801");
            assertThat(sheet.getRow(3).getCell(1).getNumericCellValue()).isEqualTo(8.5);

            var vacationRow = sheet.getRow(4);
            assertThat(vacationRow.getCell(0).getLocalDateTimeCellValue().toLocalDate()).isEqualTo(MONDAY.plusDays(3));
            assertThat(vacationRow.getCell(1).getNumericCellValue()).isZero();
            assertThat(vacationRow.getCell(2).getStringCellValue()).isEmpty();
            assertThat(vacationRow.getCell(5).getStringCellValue()).isEqualTo("Férias");
            assertThat(sheet.getRow(6).getCell(0).getLocalDateTimeCellValue().toLocalDate()).isEqualTo(MONDAY.plusDays(7));
            assertThat(workbook.getSheet("Bruno Livro-7").getRow(1).getCell(5).getStringCellValue()).isEqualTo("Doença");
        }

        // Férias aprovadas em .ics: só as férias, com fim exclusivo e UID estável.
        perform(worker, get("/api/orgs/{orgId}/absences/export.ics", orgId).param("from", "2026-03-01").param("to", "2026-03-31"))
                .andExpect(status().isForbidden());
        var ics = perform(owner, get("/api/orgs/{orgId}/absences/export.ics", orgId)
                .param("from", "2026-03-01").param("to", "2026-03-31"))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(ics.getContentType()).startsWith("text/calendar");
        assertThat(ics.getHeader("Content-Disposition")).contains("ferias-2026-03-01-a-2026-03-31.ics");
        var calendar = new String(ics.getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(calendar).contains("BEGIN:VCALENDAR", "UID:" + vacation + "@andaime.pt", "DTSTART;VALUE=DATE:20260305",
                "DTEND;VALUE=DATE:20260310", "SUMMARY:Férias — Ana Livro");
        assertThat(calendar.split("BEGIN:VEVENT", -1)).hasSize(2);
        perform(owner, get("/api/orgs/{orgId}/absences/export.ics", orgId).param("from", "2026-03-31").param("to", "2026-03-01"))
                .andExpect(status().isBadRequest());
    }

    private void manual(Session owner, UUID orgId, UUID employee, UUID site, LocalDate date, String start, String end)
            throws Exception {
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content("""
                {"employeeId":"%s","siteId":"%s","date":"%s","start":"%s","end":"%s","reason":"Registo do livro"}"""
                .formatted(employee, site, date, start, end))).andExpect(status().isCreated());
    }

    private UUID absence(Session owner, UUID orgId, UUID employee, String kind, LocalDate from, LocalDate to) throws Exception {
        var absence = id(body(perform(owner, post("/api/orgs/{orgId}/absences", orgId).content("""
                {"employeeId":"%s","kind":"%s","startsOn":"%s","endsOn":"%s"}""".formatted(employee, kind, from, to)))
                .andExpect(status().isCreated())));
        perform(owner, post("/api/orgs/{orgId}/absences/{id}/approve", orgId, absence).content("{}"))
                .andExpect(status().isOk());
        return absence;
    }

    private static UUID id(String json) {
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }
}
