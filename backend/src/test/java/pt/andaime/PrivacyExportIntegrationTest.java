package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;

import com.jayway.jsonpath.JsonPath;

/** RGPD: exportação dos dados de um trabalhador (pela empresa e pelo próprio), com ficheiros, âmbito e auditoria. */
class PrivacyExportIntegrationTest extends ApiTestSupport {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Europe/Lisbon"));
    private static final LocalDate LAST_MONDAY = TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusDays(7);
    private static final byte[] PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    private static final byte[] PDF = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);

    @Test
    void exportaTudoDoTitularSoParaQuemPode() throws Exception {
        var owner = newUser("dono-rgpd");
        var orgId = createOrganization(owner, "Construções RGPD");
        var ana = id(body(perform(owner, post("/api/orgs/{orgId}/employees", orgId).content("""
                {"fullName":"Ana Titular","category":"Pedreira","phone":"+351 912 345 678","nationality":"Portuguesa"}"""))
                .andExpect(status().isCreated())));
        var bruno = id(body(perform(owner, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"Bruno Colega\",\"category\":\"Servente\"}")).andExpect(status().isCreated())));
        var site = id(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"name":"Obra Privada","country":"PT","status":"ACTIVE","startDate":"%s"}""".formatted(TODAY.minusDays(60))))
                .andExpect(status().isCreated())));
        var vehicle = id(body(perform(owner, post("/api/orgs/{orgId}/vehicles", orgId)
                .content("{\"plate\":\"RG-20-PD\",\"seats\":5}")).andExpect(status().isCreated())));

        // Planeamento com viatura, horas aprovadas com motivo, documento e fotografia.
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"ASSIGN","employeeId":"%s","siteId":"%s","date":"%s","start":"08:00","end":"17:00","vehicleId":"%s"}"""
                .formatted(ana, site, TODAY.plusDays(1), vehicle))).andExpect(status().isOk());
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content("""
                {"employeeId":"%s","siteId":"%s","date":"%s","start":"08:00","end":"17:00","reason":"Esqueceu-se do ponto"}"""
                .formatted(ana, site, LAST_MONDAY))).andExpect(status().isCreated());
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content("""
                {"employeeId":"%s","siteId":"%s","date":"%s","start":"07:00","end":"12:00","reason":"Registo do colega"}"""
                .formatted(bruno, site, LAST_MONDAY))).andExpect(status().isCreated());
        perform(owner, post("/api/orgs/{orgId}/timesheets/{e}/{w}/approve", orgId, ana, LAST_MONDAY)).andExpect(status().isOk());
        var types = body(perform(owner, get("/api/orgs/{orgId}/document-types", orgId)));
        var typeId = JsonPath.<List<String>>read(types, "$[?(@.name=='Ficha de aptidão médica')].id").getFirst();
        mockMvc.perform(multipart("/api/orgs/{orgId}/documents", orgId)
                .file(new MockMultipartFile("file", "aptidao.pdf", "application/pdf", PDF))
                .param("typeId", typeId).param("employeeId", ana.toString()).param("expiresOn", TODAY.plusYears(1).toString())
                .cookie(owner.session(), owner.csrfCookie()).header("X-XSRF-TOKEN", owner.csrfToken()))
                .andExpect(status().isCreated());
        var photo = multipart(HttpMethod.PUT, "/api/orgs/{orgId}/employees/{id}/photo", orgId, ana);
        photo.cookie(owner.session(), owner.csrfCookie()).header("X-XSRF-TOKEN", owner.csrfToken());
        mockMvc.perform(photo.file(new MockMultipartFile("file", "ana.png", "image/png", PNG))).andExpect(status().isOk());
        var hotel = id(body(perform(owner, post("/api/orgs/{orgId}/lodging/hotels", orgId).content("""
                {"siteId":"%s","name":"Hotel RGPD","address":"Rua Privada 1"}""".formatted(site))).andExpect(status().isCreated())));
        var monday = TODAY.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        perform(owner, put("/api/orgs/{orgId}/lodging/stays", orgId).content("""
                {"employeeId":"%s","siteId":"%s","week":"%s","hotelId":"%s","checkIn":"%s","checkOut":"%s","notes":"Quarto 12"}"""
                .formatted(ana, site, monday, hotel, monday, monday.plusDays(4)))).andExpect(status().isOk());

        // Dono/administrador: ZIP completo.
        var files = export(owner, "/api/orgs/{orgId}/employees/{id}/export", orgId, ana);
        assertThat(files).containsKeys("dados.json", "LEIA-ME.txt", "documentos/fotografia.png",
                "documentos/ficha-de-aptidao-medica-v1-aptidao.pdf");
        assertThat(files.get("documentos/ficha-de-aptidao-medica-v1-aptidao.pdf")).isEqualTo(PDF);
        assertThat(files.get("documentos/fotografia.png")).isEqualTo(PNG);
        assertThat(new String(files.get("LEIA-ME.txt"), StandardCharsets.UTF_8)).contains("RGPD").contains("dados.json");
        var data = new String(files.get("dados.json"), StandardCharsets.UTF_8);
        assertThat(JsonPath.<String>read(data, "$.empresa.nome")).isEqualTo("Construções RGPD");
        assertThat(JsonPath.<String>read(data, "$.titular.nome")).isEqualTo("Ana Titular");
        assertThat(JsonPath.<String>read(data, "$.titular.telefone")).isEqualTo("+351 912 345 678");
        assertThat(JsonPath.<String>read(data, "$.titular.fotografia")).isEqualTo("documentos/fotografia.png");
        assertThat(JsonPath.<List<String>>read(data, "$.registosDeHoras[*].data")).containsExactly(LAST_MONDAY.toString());
        assertThat(JsonPath.<Integer>read(data, "$.registosDeHoras[0].minutosTrabalhados")).isEqualTo(480);
        assertThat(JsonPath.<List<String>>read(data, "$.registosDeHoras[0].revisoes[*].motivo")).contains("Esqueceu-se do ponto");
        assertThat(JsonPath.<List<String>>read(data, "$.folhasDeHoras[*].estado")).containsExactly("APPROVED");
        assertThat(JsonPath.<String>read(data, "$.planeamento[0].viatura")).isEqualTo("RG-20-PD");
        assertThat(JsonPath.<Integer>read(data, "$.planeamento[0].minutosPlaneados")).isPositive();
        assertThat(JsonPath.<String>read(data, "$.documentos[0].tipo")).isEqualTo("Ficha de aptidão médica");
        assertThat(JsonPath.<String>read(data, "$.documentos[0].versoes[0].ficheiro")).isEqualTo("aptidao.pdf");
        assertThat(JsonPath.<String>read(data, "$.documentos[0].versoes[0].ficheiroNoZip"))
                .isEqualTo("documentos/ficha-de-aptidao-medica-v1-aptidao.pdf");
        assertThat(JsonPath.<List<String>>read(data, "$.auditoria[*].acao")).contains("employee.created");
        assertThat(JsonPath.<String>read(data, "$.estadias[0].hotel")).isEqualTo("Hotel RGPD");
        assertThat(JsonPath.<String>read(data, "$.estadias[0].hotelMorada")).isEqualTo("Rua Privada 1");
        assertThat(JsonPath.<String>read(data, "$.estadias[0].obraCodigo")).isNotBlank();
        assertThat(JsonPath.<Integer>read(data, "$.estadias[0].noites")).isEqualTo(4);
        assertThat(JsonPath.<String>read(data, "$.estadias[0].notas")).isEqualTo("Quarto 12");
        assertThat(new String(files.get("LEIA-ME.txt"), StandardCharsets.UTF_8)).contains("estadias");
        assertThat(data).doesNotContain("Bruno Colega").doesNotContain("Registo do colega");

        // Gestor não exporta; outra empresa não vê; trabalhador não exporta fichas pela via da empresa.
        var manager = joinAs(owner, orgId, "MANAGER", "gestor-rgpd");
        perform(manager, get("/api/orgs/{orgId}/employees/{id}/export", orgId, ana)).andExpect(status().isForbidden());
        var stranger = newUser("estranho-rgpd");
        var otherOrg = createOrganization(stranger, "Outra RGPD");
        perform(stranger, get("/api/orgs/{orgId}/employees/{id}/export", orgId, ana)).andExpect(status().isNotFound());
        perform(stranger, get("/api/orgs/{orgId}/employees/{id}/export", otherOrg, ana))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("not-found"));

        // O próprio: só os seus dados; sem ficha ligada, 404 no-employee.
        var worker = joinAs(owner, orgId, "WORKER", "titular-rgpd");
        perform(worker, get("/api/orgs/{orgId}/me/export", orgId))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("no-employee"));
        linkEmployee(owner, orgId, worker, ana);
        perform(worker, get("/api/orgs/{orgId}/employees/{id}/export", orgId, ana)).andExpect(status().isForbidden());
        var mine = export(worker, "/api/orgs/{orgId}/me/export", orgId);
        var mineData = new String(mine.get("dados.json"), StandardCharsets.UTF_8);
        assertThat(JsonPath.<String>read(mineData, "$.titular.nome")).isEqualTo("Ana Titular");
        assertThat(mineData).doesNotContain("Bruno Colega").doesNotContain("Registo do colega");
        assertThat(mine.get("documentos/ficha-de-aptidao-medica-v1-aptidao.pdf")).isEqualTo(PDF);
        var colleague = joinAs(owner, orgId, "WORKER", "colega-rgpd");
        linkEmployee(owner, orgId, colleague, bruno);
        var theirs = new String(export(colleague, "/api/orgs/{orgId}/me/export", orgId).get("dados.json"), StandardCharsets.UTF_8);
        assertThat(JsonPath.<String>read(theirs, "$.titular.nome")).isEqualTo("Bruno Colega");
        assertThat(theirs).doesNotContain("Ana Titular");

        // Cada exportação fica auditada, com quem a pediu.
        var audit = body(perform(owner, get("/api/orgs/{orgId}/audit", orgId)
                .param("entityType", "employee").param("entityId", ana.toString())).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(audit, "$.items[?(@.action=='employee.exported')].changes.by"))
                .containsExactlyInAnyOrder("admin", "self");
    }

    /** Pede o ZIP (resposta em streaming) e devolve as entradas por nome. */
    private Map<String, byte[]> export(Session user, String path, Object... variables) throws Exception {
        var started = perform(user, get(path, variables)).andExpect(request().asyncStarted()).andReturn();
        var response = mockMvc.perform(asyncDispatch(started))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/zip"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse();
        assertThat(response.getHeader("Content-Disposition")).startsWith("attachment").contains("dados-").contains(TODAY + ".zip");
        var entries = new LinkedHashMap<String, byte[]>();
        try (var zip = new ZipInputStream(new ByteArrayInputStream(response.getContentAsByteArray()), StandardCharsets.UTF_8)) {
            for (var entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                entries.put(entry.getName(), zip.readAllBytes());
            }
        }
        return entries;
    }

    private static UUID id(String json) {
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }
}
