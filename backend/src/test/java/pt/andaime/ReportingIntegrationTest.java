package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;

import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.junit.jupiter.api.Test;

import com.jayway.jsonpath.JsonPath;

import pt.andaime.reporting.application.ReportExportProcessor;
import pt.andaime.reporting.ReportingProjection;
import pt.andaime.shared.tenant.TenantContext;

/** Read model semanal real, isolamento por organização e ficheiro XLSX produzido no servidor. */
class ReportingIntegrationTest extends ApiTestSupport {

    private static final LocalDate MONDAY = LocalDate.now(ZoneId.of("Europe/Lisbon"))
            .with(TemporalAdjusters.next(DayOfWeek.MONDAY));

    @Autowired
    ReportExportProcessor exportProcessor;

    @Autowired
    ReportingProjection projection;

    @Test
    void mapaSemanalEExcelUsamPlaneamentoReal() throws Exception {
        var owner = newUser("dono-reporting");
        var orgId = createOrganization(owner, "Construções Relatório");
        var clientId = id(body(perform(owner, post("/api/orgs/{orgId}/clients", orgId)
                .content("{\"name\":\"Cliente Norte\"}")).andExpect(status().isCreated())));
        var employeeId = id(body(perform(owner, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"Ana Pedreira\",\"category\":\"Encarregada\"}"))
                .andExpect(status().isCreated())));
        var siteId = id(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"Escola Central","clientId":"%s","country":"PT","city":"Braga","erpOrder":"OC-42"}
                """.formatted(clientId))).andExpect(status().isCreated())));
        var teamId = id(body(perform(owner, post("/api/orgs/{orgId}/teams", orgId).content("""
                {"name":"Equipa Norte","color":"#2a78d6","foremanEmployeeId":"%s"}
                """.formatted(employeeId))).andExpect(status().isCreated())));
        perform(owner, post("/api/orgs/{orgId}/teams/{teamId}/members", orgId, teamId)
                .content("{\"employeeId\":\"" + employeeId + "\",\"joinedOn\":\"" + MONDAY + "\"}"))
                .andExpect(status().isOk());
        var vehicleJson = body(perform(owner, post("/api/orgs/{orgId}/vehicles", orgId)
                .content("{\"plate\":\"AA-42-ZZ\",\"seats\":5}"))
                .andExpect(status().isCreated()));
        var vehicleId = id(vehicleJson);
        perform(owner, put("/api/orgs/{orgId}/teams/{teamId}/vehicle", orgId, teamId)
                .content("{\"vehicleId\":\"" + vehicleId + "\",\"validFrom\":\"" + MONDAY + "\"}"))
                .andExpect(status().isNoContent());

        assign(owner, orgId, employeeId, siteId, MONDAY, "08:00", "17:00", "Montagem");
        assign(owner, orgId, employeeId, siteId, MONDAY.plusDays(1), "08:00", "12:00", "Acabamentos");
        try (var ignored = TenantContext.open(orgId, userId(owner.email()), "OWNER")) {
            projection.approvedTime(new ReportingProjection.ApprovedTime(UUID.randomUUID(), employeeId, siteId,
                    teamId, MONDAY, LocalTime.of(8, 0), LocalTime.of(17, 0), 480, 420, 60, "801",
                    Instant.now()));
            projection.documentState(new ReportingProjection.DocumentState(UUID.randomUUID(), "EMPLOYEE",
                    employeeId, "Aptidão médica", "PT", "VALID", MONDAY.plusYears(1)));
        }

        perform(owner, get("/api/orgs/{orgId}/reporting/weekly-map", orgId)
                .param("week", MONDAY.plusDays(2).toString()).param("template", "equipa"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.weekStart").value(MONDAY.toString()))
                .andExpect(jsonPath("$.totals.plannedMin").value(720))
                .andExpect(jsonPath("$.totals.employees").value(1))
                .andExpect(jsonPath("$.totals.sites").value(1))
                .andExpect(jsonPath("$.totals.vehicles").value(1))
                .andExpect(jsonPath("$.groups[0].teamName").value("Equipa Norte"))
                .andExpect(jsonPath("$.groups[0].siteName").value("Escola Central"))
                .andExpect(jsonPath("$.groups[0].clientName").value("Cliente Norte"))
                .andExpect(jsonPath("$.groups[0].schedule").value("Horário variável"))
                .andExpect(jsonPath("$.groups[0].vehicles[0]").value("AA-42-ZZ"))
                .andExpect(jsonPath("$.groups[0].workers[0].foreman").value(true))
                .andExpect(jsonPath("$.groups[0].workers[0].totalMin").value(720))
                .andExpect(jsonPath("$.groups[0].notes[0]").value("Montagem"));

        perform(owner, get("/api/orgs/{orgId}/reporting/overview", orgId)
                .param("from", MONDAY.toString()).param("to", MONDAY.plusDays(6).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plannedMin").value(720))
                .andExpect(jsonPath("$.assignments").value(2))
                .andExpect(jsonPath("$.employees").value(1))
                .andExpect(jsonPath("$.teams").value(1))
                .andExpect(jsonPath("$.sites").value(1))
                .andExpect(jsonPath("$.vehicles").value(1));
        perform(owner, get("/api/orgs/{orgId}/reporting/team-distribution", orgId)
                .param("from", MONDAY.toString()).param("to", MONDAY.plusDays(6).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].teamName").value("Equipa Norte"))
                .andExpect(jsonPath("$[0].plannedMin").value(720))
                .andExpect(jsonPath("$[0].assignmentDays").value(2));
        perform(owner, get("/api/orgs/{orgId}/reporting/vehicles", orgId)
                .param("from", MONDAY.toString()).param("to", MONDAY.plusDays(6).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].plate").value("AA-42-ZZ"))
                .andExpect(jsonPath("$[0].plannedMin").value(720))
                .andExpect(jsonPath("$[0].peakRiders").value(1));
        perform(owner, get("/api/orgs/{orgId}/reporting/planned-vs-actual", orgId)
                .param("from", MONDAY.toString()).param("to", MONDAY.plusDays(6).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.includesTimeEntries").value(true))
                .andExpect(jsonPath("$.rows[0].siteCode").isNotEmpty())
                .andExpect(jsonPath("$.rows[0].actualMin").value(480))
                .andExpect(jsonPath("$.rows[0].plannedMin").value(720))
                .andExpect(jsonPath("$.totals.plannedMin").value(720));
        perform(owner, get("/api/orgs/{orgId}/reporting/hours", orgId)
                .param("groupBy", "employee").param("from", MONDAY.toString())
                .param("to", MONDAY.plusDays(6).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups[0].label").value("Ana Pedreira"))
                .andExpect(jsonPath("$.totals.workedMin").value(480))
                .andExpect(jsonPath("$.totals.overtimeMin").value(60));
        perform(owner, get("/api/orgs/{orgId}/reporting/documents", orgId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.statuses[0].status").value("VALID"));
        perform(owner, get("/api/orgs/{orgId}/reporting/weekly-map", orgId)
                .param("week", MONDAY.toString()).param("template", "horas"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.rows[0].activityCode").value("801"))
                .andExpect(jsonPath("$.totals.workedMin").value(480));

        var initial = perform(owner, get("/api/orgs/{orgId}/reporting/exports/weekly-map.xlsx", orgId)
                .param("week", MONDAY.toString()).param("template", "obra"))
                .andExpect(request().asyncStarted()).andReturn();
        var exported = mockMvc.perform(asyncDispatch(initial))
                .andExpect(status().isOk())
                .andExpect(content().contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .andReturn().getResponse();
        assertThat(exported.getHeader("Content-Disposition")).contains("mapa-obra-semana-" + MONDAY + ".xlsx");
        assertThat(exported.getContentAsByteArray()).startsWith((byte) 'P', (byte) 'K');
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(exported.getContentAsByteArray()))) {
            assertThat(workbook.getNumberOfSheets()).isEqualTo(1);
            assertThat(workbook.getSheetName(0)).isEqualTo("Mapa por obra");
            assertThat(workbook.getSheetAt(0).getRow(0).getCell(0).getStringCellValue()).contains("Semana");
            assertThat(workbook.getSheetAt(0).getRow(1).getCell(0).getStringCellValue())
                    .isEqualTo("Construções Relatório");
        }

        var queued = body(perform(owner, post("/api/orgs/{orgId}/reporting/exports", orgId).content("""
                {"week":"%s","template":"obra"}
                """.formatted(MONDAY))).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PENDING")));
        var exportId = id(queued);
        assertThat(exportProcessor.processOne()).isTrue();
        perform(owner, get("/api/orgs/{orgId}/reporting/exports/{exportId}", orgId, exportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("READY"))
                .andExpect(jsonPath("$.contentSize").isNumber());
        var asyncFile = perform(owner,
                get("/api/orgs/{orgId}/reporting/exports/{exportId}/download", orgId, exportId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        assertThat(asyncFile).startsWith((byte) 'P', (byte) 'K');

        var hoursInitial = perform(owner, get("/api/orgs/{orgId}/reporting/exports/weekly-map.xlsx", orgId)
                .param("week", MONDAY.toString()).param("template", "horas"))
                .andExpect(request().asyncStarted()).andReturn();
        var hoursFile = mockMvc.perform(asyncDispatch(hoursInitial)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(hoursFile))) {
            assertThat(workbook.getSheetName(0)).isEqualTo("Folha de horas");
            assertThat(workbook.getSheetAt(0).getLastRowNum()).isEqualTo(3);
        }
    }

    @Test
    void reportingValidaPermissoesTemplatesEIsolamento() throws Exception {
        var owner = newUser("dono-reporting-acesso");
        var orgId = createOrganization(owner, "Relatórios A");
        var otherOwner = newUser("dono-reporting-outra");
        var otherOrg = createOrganization(otherOwner, "Relatórios B");
        var foreman = joinAs(owner, orgId, "FOREMAN", "encarregado-reporting");

        perform(foreman, get("/api/orgs/{orgId}/reporting/weekly-map", orgId).param("week", MONDAY.toString()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("forbidden"));
        perform(owner, get("/api/orgs/{orgId}/reporting/weekly-map", otherOrg).param("week", MONDAY.toString()))
                .andExpect(status().isNotFound());
        perform(owner, get("/api/orgs/{orgId}/reporting/weekly-map", orgId)
                .param("week", MONDAY.toString()).param("template", "pdf"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation"));
        perform(owner, get("/api/orgs/{orgId}/reporting/hours", orgId)
                .param("groupBy", "invalid").param("from", MONDAY.toString()).param("to", MONDAY.toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation"));
        perform(owner, get("/api/orgs/{orgId}/reporting/overview", orgId)
                .param("from", MONDAY.toString()).param("to", MONDAY.plusYears(1).plusDays(1).toString()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("range-too-large"));
        var queued = body(perform(owner, post("/api/orgs/{orgId}/reporting/exports", orgId).content("""
                {"week":"%s","template":"equipa"}
                """.formatted(MONDAY))).andExpect(status().isAccepted()));
        perform(otherOwner, get("/api/orgs/{orgId}/reporting/exports/{exportId}", otherOrg, id(queued)))
                .andExpect(status().isNotFound());
        perform(otherOwner, get("/api/orgs/{orgId}/reporting/documents", otherOrg))
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
    }

    private void assign(Session owner, UUID orgId, UUID employeeId, UUID siteId, LocalDate date,
            String start, String end, String note) throws Exception {
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"ASSIGN","employeeId":"%s","siteId":"%s","date":"%s","start":"%s","end":"%s",
                 "foreman":true,"note":"%s"}
                """.formatted(employeeId, siteId, date, start, end, note))).andExpect(status().isOk());
    }

    private static UUID id(String json) {
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private static UUID userId(String email) throws Exception {
        try (var connection = ownerConnection();
             var statement = connection.prepareStatement("SELECT id FROM users WHERE email = ?")) {
            statement.setString(1, email);
            try (var result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                return result.getObject(1, UUID.class);
            }
        }
    }
}
