package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

import pt.andaime.documents.application.DocumentService;
import pt.andaime.shared.tenant.TenantContext;

/** F5: documentos (armazenamento S3 real), alertas e notificações, ausências com impacto no planeamento e equipamentos. */
class OperationsIntegrationTest extends ApiTestSupport {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Europe/Lisbon"));
    private static final LocalDate NEXT_MONDAY = TODAY.with(TemporalAdjusters.next(DayOfWeek.MONDAY));
    private static final byte[] PDF = ("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n")
            .getBytes(StandardCharsets.US_ASCII);

    @Autowired
    DocumentService documentService;

    private UUID employee(Session manager, UUID orgId, String name) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"%s\",\"category\":\"Pedreiro\"}".formatted(name))).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private UUID site(Session manager, UUID orgId) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/sites", orgId)
                .content("{\"name\":\"Obra F5\",\"country\":\"PT\",\"status\":\"ACTIVE\"}")).andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    private ResultActions upload(Session user, UUID orgId, UUID typeId, UUID employeeId, String filename, byte[] bytes,
            LocalDate expiresOn) throws Exception {
        var request = multipart("/api/orgs/{orgId}/documents", orgId)
                .file(new MockMultipartFile("file", filename, "application/pdf", bytes))
                .param("typeId", typeId.toString()).param("employeeId", employeeId.toString());
        if (expiresOn != null) {
            request.param("expiresOn", expiresOn.toString());
        }
        return mockMvc.perform(request.cookie(user.session(), user.csrfCookie()).header("X-XSRF-TOKEN", user.csrfToken()));
    }

    private UUID typeId(Session user, UUID orgId, String name) throws Exception {
        var types = body(perform(user, get("/api/orgs/{orgId}/document-types", orgId)).andExpect(status().isOk()));
        return UUID.fromString(JsonPath.<List<String>>read(types, "$[?(@.name=='" + name + "')].id").getFirst());
    }

    private UUID userId(Session session) throws Exception {
        return UUID.fromString(JsonPath.read(body(perform(session, get("/api/me"))), "$.user.id"));
    }

    @Test
    void documentosComFicheiroRealVersoesConformidadeEAlertas() throws Exception {
        var owner = newUser("dono-docs");
        var orgId = createOrganization(owner, "Documentos F5");
        var ana = employee(owner, orgId, "Ana Documentada");
        var rui = employee(owner, orgId, "Rui Outro");
        var siteId = site(owner, orgId);
        var worker = joinAs(owner, orgId, "WORKER", "trabalhadora-docs");
        linkEmployee(owner, orgId, worker, ana);

        // Catálogo inicial sem exigências; a empresa torna obrigatórios a identificação e a aptidão médica.
        var types = body(perform(owner, get("/api/orgs/{orgId}/document-types", orgId)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(types, "$[*].name")).contains("Documento de identificação", "Ficha de aptidão médica",
                "Seguro da viatura");
        assertThat(JsonPath.<List<Object>>read(types, "$[?(@.requiredEverywhere == true)]")).isEmpty();
        var idType = typeId(owner, orgId, "Documento de identificação");
        for (var required : List.of(idType, typeId(owner, orgId, "Ficha de aptidão médica"))) {
            perform(worker, put("/api/orgs/{orgId}/document-types/{id}/requirements", orgId, required)
                    .content("{\"everywhere\":true}")).andExpect(status().isForbidden());
            perform(owner, put("/api/orgs/{orgId}/document-types/{id}/requirements", orgId, required)
                    .content("{\"everywhere\":true}")).andExpect(status().isOk()).andExpect(jsonPath("$.requiredEverywhere").value(true));
        }

        // A trabalhadora carrega o seu documento; o tipo é detetado pelo conteúdo, não pela extensão.
        upload(worker, orgId, idType, ana, "falso.pdf", "isto não é um PDF".getBytes(StandardCharsets.UTF_8), TODAY.plusDays(10))
                .andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("$.code").value("file-type"));
        upload(worker, orgId, idType, ana, "bi.pdf", PDF, null)
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation"));
        upload(worker, orgId, idType, rui, "bi.pdf", PDF, TODAY.plusDays(10)).andExpect(status().isNotFound());
        var created = body(upload(worker, orgId, idType, ana, "C:\\fotos\\bi.pdf", PDF, TODAY.plusDays(10))
                .andExpect(status().isCreated()));
        var documentId = JsonPath.<String>read(created, "$.id");
        var versionId = JsonPath.<String>read(created, "$.current.id");
        assertThat((String) JsonPath.read(created, "$.status")).isEqualTo("EXPIRING");
        assertThat((String) JsonPath.read(created, "$.current.filename")).isEqualTo("bi.pdf");
        assertThat((String) JsonPath.read(created, "$.current.contentType")).isEqualTo("application/pdf");

        // Download autorizado devolve exatamente o ficheiro; outro trabalhador não o vê.
        perform(owner, get("/api/orgs/{orgId}/documents/{id}/versions/{v}/download", orgId, documentId, versionId))
                .andExpect(status().isOk()).andExpect(content().bytes(PDF));
        var other = joinAs(owner, orgId, "WORKER", "trabalhador-docs");
        linkEmployee(owner, orgId, other, rui);
        perform(other, get("/api/orgs/{orgId}/documents/{id}/versions/{v}/download", orgId, documentId, versionId))
                .andExpect(status().isNotFound());
        assertThat(JsonPath.<List<Object>>read(body(perform(other, get("/api/orgs/{orgId}/documents", orgId))), "$")).isEmpty();

        // Renovar cria nova versão; o gestor verifica.
        var renewed = body(upload(owner, orgId, idType, ana, "bi-novo.pdf", PDF, TODAY.plusYears(5)).andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(renewed, "$.id")).isEqualTo(documentId);
        assertThat(JsonPath.<List<Object>>read(renewed, "$.versions")).hasSize(2);
        assertThat((String) JsonPath.read(renewed, "$.status")).isEqualTo("VALID");
        var newVersion = JsonPath.<String>read(renewed, "$.current.id");
        perform(worker, post("/api/orgs/{orgId}/documents/{id}/versions/{v}/verify", orgId, documentId, newVersion))
                .andExpect(status().isForbidden());
        perform(owner, post("/api/orgs/{orgId}/documents/{id}/versions/{v}/verify", orgId, documentId, newVersion))
                .andExpect(status().isOk()).andExpect(jsonPath("$.verified").value(true));

        // Conformidade: falta a aptidão médica.
        var compliance = body(perform(owner, get("/api/orgs/{orgId}/documents/compliance", orgId)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(compliance, "$[?(@.employeeName=='Ana Documentada')].items[*].status"))
                .containsExactlyInAnyOrder("VALID", "MISSING");

        // O planeamento avisa de documentos em falta (aviso que exige confirmação).
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"ASSIGN","employeeId":"%s","siteId":"%s","date":"%s","start":"08:00","end":"12:00","foreman":true}"""
                .formatted(ana, siteId, NEXT_MONDAY)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("confirmation-required"))
                .andExpect(jsonPath("$.conflicts[0].type").value("DOCUMENT_MISSING"));

        // Alerta diário: avisa uma vez por versão e situação.
        var ruiType = typeId(owner, orgId, "Ficha de aptidão médica");
        upload(owner, orgId, ruiType, rui, "aptidao.pdf", PDF, TODAY.plusDays(3)).andExpect(status().isCreated());
        var ownerId = userId(owner);
        int first;
        int second;
        try (var ignored = TenantContext.open(orgId, ownerId, "OWNER")) {
            first = documentService.notifyExpiring();
            second = documentService.notifyExpiring();
        }
        assertThat(first).isEqualTo(1);
        assertThat(second).isZero();
        var inbox = body(perform(owner, get("/api/orgs/{orgId}/notifications", orgId)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(inbox, "$.items[*].title")).anyMatch(t -> t.startsWith("A caducar: Ficha de aptidão médica"));
        assertThat((Integer) JsonPath.read(inbox, "$.unread")).isGreaterThanOrEqualTo(1);
        perform(owner, post("/api/orgs/{orgId}/notifications/read", orgId).content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.unread").value(0));
    }

    @Test
    void ausenciaAprovadaComImpactoExplicitoNoPlaneamento() throws Exception {
        var owner = newUser("dono-ausencias");
        var orgId = createOrganization(owner, "Ausências F5");
        var ana = employee(owner, orgId, "Ana Férias");
        var siteId = site(owner, orgId);
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"SCHEDULE","employeeIds":["%s"],"siteId":"%s","from":"%s","to":"%s","weekdays":[1,2],
                 "start":"08:00","end":"17:00","foremanEmployeeId":"%s"}""".formatted(ana, siteId, NEXT_MONDAY, NEXT_MONDAY.plusDays(1), ana)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(2));
        var worker = joinAs(owner, orgId, "WORKER", "trabalhadora-ferias");
        linkEmployee(owner, orgId, worker, ana);

        // Pedido da própria; não pode pedir dias passados nem sobrepor outro pedido.
        perform(worker, post("/api/orgs/{orgId}/absences", orgId).content("""
                {"kind":"VACATION","startsOn":"%s","endsOn":"%s"}""".formatted(TODAY.minusDays(3), TODAY.minusDays(2))))
                .andExpect(status().isBadRequest());
        var requested = body(perform(worker, post("/api/orgs/{orgId}/absences", orgId).content("""
                {"kind":"VACATION","startsOn":"%s","endsOn":"%s","note":"Casamento"}""".formatted(NEXT_MONDAY, NEXT_MONDAY.plusDays(4))))
                .andExpect(status().isCreated()));
        var absenceId = JsonPath.<String>read(requested, "$.id");
        perform(worker, post("/api/orgs/{orgId}/absences", orgId).content("""
                {"kind":"PERSONAL","startsOn":"%s","endsOn":"%s"}""".formatted(NEXT_MONDAY.plusDays(2), NEXT_MONDAY.plusDays(2))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("overlap"));
        var managerInbox = body(perform(owner, get("/api/orgs/{orgId}/notifications", orgId)));
        assertThat(JsonPath.<List<String>>read(managerInbox, "$.items[*].title")).contains("Pedido de ausência: Ana Férias");

        // A trabalhadora não decide; o gestor tem de escolher o que fazer às atribuições.
        perform(worker, post("/api/orgs/{orgId}/absences/{id}/approve", orgId, absenceId)).andExpect(status().isForbidden());
        perform(owner, get("/api/orgs/{orgId}/absences/{id}/impact", orgId, absenceId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.assignments.length()").value(2));
        perform(owner, post("/api/orgs/{orgId}/absences/{id}/approve", orgId, absenceId).content("{}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("resolution-required"))
                .andExpect(jsonPath("$.assignments.length()").value(2));
        perform(owner, post("/api/orgs/{orgId}/absences/{id}/approve", orgId, absenceId).content("{\"resolution\":\"REMOVE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));
        var board = body(perform(owner, get("/api/orgs/{orgId}/planning/board", orgId)
                .param("from", NEXT_MONDAY.toString()).param("to", NEXT_MONDAY.plusDays(6).toString())));
        assertThat(JsonPath.<List<Object>>read(board, "$.assignments")).isEmpty();
        var workerInbox = body(perform(worker, get("/api/orgs/{orgId}/notifications", orgId)));
        assertThat(JsonPath.<List<String>>read(workerInbox, "$.items[*].title")).contains("Ausência aprovada");

        // Planear em dia de ausência aprovada é bloqueado.
        perform(owner, post("/api/orgs/{orgId}/planning/commands", orgId).content("""
                {"kind":"ASSIGN","employeeId":"%s","siteId":"%s","date":"%s","start":"08:00","end":"12:00"}"""
                .formatted(ana, siteId, NEXT_MONDAY.plusDays(3))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("planning-conflicts"))
                .andExpect(jsonPath("$.conflicts[0].type").value("ABSENCE"));

        // Cancelar uma ausência aprovada é ato do gestor; o registo fica.
        perform(worker, post("/api/orgs/{orgId}/absences/{id}/cancel", orgId, absenceId)).andExpect(status().isConflict());
        perform(owner, post("/api/orgs/{orgId}/absences/{id}/cancel", orgId, absenceId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        var list = body(perform(owner, get("/api/orgs/{orgId}/absences", orgId)
                .param("from", NEXT_MONDAY.toString()).param("to", NEXT_MONDAY.plusDays(6).toString())));
        assertThat(JsonPath.<List<String>>read(list, "$[*].status")).containsExactly("CANCELLED");

        // Recusa com motivo.
        var second = JsonPath.<String>read(body(perform(worker, post("/api/orgs/{orgId}/absences", orgId).content("""
                {"kind":"PERSONAL","startsOn":"%s","endsOn":"%s","partialMinutes":120}""".formatted(NEXT_MONDAY.plusDays(8),
                NEXT_MONDAY.plusDays(8)))).andExpect(status().isCreated())), "$.id");
        perform(owner, post("/api/orgs/{orgId}/absences/{id}/reject", orgId, second).content("{}")).andExpect(status().isBadRequest());
        perform(owner, post("/api/orgs/{orgId}/absences/{id}/reject", orgId, second).content("{\"note\":\"Semana de entrega da obra\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
    }

    @Test
    void equipamentosComStockNuncaNegativoEUnidadesComTitular() throws Exception {
        var owner = newUser("dono-epi");
        var orgId = createOrganization(owner, "Equipamentos F5");
        var ana = employee(owner, orgId, "Ana EPI");
        var rui = employee(owner, orgId, "Rui EPI");
        var worker = joinAs(owner, orgId, "WORKER", "trabalhadora-epi");
        linkEmployee(owner, orgId, worker, ana);

        var boots = JsonPath.<String>read(body(perform(owner, post("/api/orgs/{orgId}/equipment/items", orgId).content("""
                {"name":"Botas de segurança","category":"PPE","tracking":"STOCK","size":"42","minStock":5}"""))
                .andExpect(status().isCreated())), "$.id");
        perform(owner, post("/api/orgs/{orgId}/equipment/items", orgId).content("""
                {"name":"botas de segurança","category":"PPE","tracking":"STOCK","size":"42"}"""))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("name-taken"));
        perform(owner, post("/api/orgs/{orgId}/equipment/receive", orgId).content("{\"itemId\":\"%s\",\"quantity\":10}".formatted(boots)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.onHand").value(10));
        perform(owner, post("/api/orgs/{orgId}/equipment/deliver", orgId).content("""
                {"itemId":"%s","employeeId":"%s","quantity":3}""".formatted(boots, ana)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].quantity").value(3));
        perform(owner, post("/api/orgs/{orgId}/equipment/deliver", orgId).content("""
                {"itemId":"%s","employeeId":"%s","quantity":8}""".formatted(boots, rui)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("insufficient-stock"));
        perform(owner, post("/api/orgs/{orgId}/equipment/return", orgId).content("""
                {"itemId":"%s","employeeId":"%s","quantity":5,"condition":"OK"}""".formatted(boots, ana)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not-held"));
        perform(owner, post("/api/orgs/{orgId}/equipment/return", orgId).content("""
                {"itemId":"%s","employeeId":"%s","quantity":1,"condition":"DAMAGED","note":"Sola rota"}""".formatted(boots, ana)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].quantity").value(2));
        perform(owner, post("/api/orgs/{orgId}/equipment/items/{id}/adjust", orgId, boots).content("{\"delta\":-2}"))
                .andExpect(status().isBadRequest());
        perform(owner, post("/api/orgs/{orgId}/equipment/items/{id}/adjust", orgId, boots).content("{\"delta\":-10,\"note\":\"Contagem\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("insufficient-stock"));
        perform(owner, post("/api/orgs/{orgId}/equipment/items/{id}/adjust", orgId, boots).content("{\"delta\":-3,\"note\":\"Contagem\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.onHand").value(4)).andExpect(jsonPath("$.low").value(true))
                .andExpect(jsonPath("$.assigned").value(2));

        var helmet = JsonPath.<String>read(body(perform(owner, post("/api/orgs/{orgId}/equipment/items", orgId).content("""
                {"name":"Capacete","category":"PPE","tracking":"SERIAL"}""")).andExpect(status().isCreated())), "$.id");
        perform(owner, post("/api/orgs/{orgId}/equipment/receive", orgId).content("{\"itemId\":\"%s\",\"serials\":[\"C-1\",\"C-2\"]}"
                .formatted(helmet))).andExpect(status().isOk()).andExpect(jsonPath("$.onHand").value(2));
        perform(owner, post("/api/orgs/{orgId}/equipment/receive", orgId).content("{\"itemId\":\"%s\",\"serials\":[\"C-1\"]}"
                .formatted(helmet))).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("serial-taken"));
        var units = body(perform(owner, get("/api/orgs/{orgId}/equipment/items/{id}/units", orgId, helmet)));
        var c1 = JsonPath.<List<String>>read(units, "$[?(@.serial=='C-1')].id").getFirst();
        perform(owner, post("/api/orgs/{orgId}/equipment/deliver", orgId).content("""
                {"itemId":"%s","employeeId":"%s","unitId":"%s"}""".formatted(helmet, ana, c1))).andExpect(status().isOk());
        perform(owner, post("/api/orgs/{orgId}/equipment/deliver", orgId).content("""
                {"itemId":"%s","employeeId":"%s","unitId":"%s"}""".formatted(helmet, rui, c1)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("unit-unavailable"));

        // A trabalhadora vê o que tem; não vê o de outros.
        var mine = body(perform(worker, get("/api/orgs/{orgId}/equipment/holdings/{e}", orgId, ana)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(mine, "$[*].itemName")).containsExactly("Botas de segurança", "Capacete");
        assertThat(JsonPath.<List<String>>read(mine, "$[1].serials")).containsExactly("C-1");
        perform(worker, get("/api/orgs/{orgId}/equipment/holdings/{e}", orgId, rui)).andExpect(status().isNotFound());
        perform(worker, post("/api/orgs/{orgId}/equipment/deliver", orgId).content("{}")).andExpect(status().isForbidden());

        perform(owner, post("/api/orgs/{orgId}/equipment/return", orgId).content("""
                {"itemId":"%s","employeeId":"%s","unitId":"%s","condition":"LOST"}""".formatted(helmet, ana, c1))).andExpect(status().isOk());
        perform(owner, get("/api/orgs/{orgId}/equipment/items/{id}/units", orgId, helmet))
                .andExpect(jsonPath("$[?(@.serial=='C-1')].status").value("LOST"));
        var movements = body(perform(owner, get("/api/orgs/{orgId}/equipment/movements", orgId).param("employeeId", ana.toString())));
        assertThat(JsonPath.<List<String>>read(movements, "$[*].kind")).containsExactly("LOST", "DELIVER", "DAMAGED", "DELIVER");
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder put(String uri, Object... vars) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(uri, vars);
    }
}
