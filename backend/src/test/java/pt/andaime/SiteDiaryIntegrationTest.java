package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

/** Diário de obra: âmbito por papel, autor ou gestor edita, fotos no S3, pesquisa sem acentos, Word e Excel. */
class SiteDiaryIntegrationTest extends ApiTestSupport {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Europe/Lisbon"));
    private static final LocalDate LAST_MONTH = TODAY.minusMonths(1).withDayOfMonth(1);

    private static byte[] png(int width, int height, Color color) throws Exception {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        var graphics = image.createGraphics();
        graphics.setColor(color);
        graphics.fillRect(0, 0, width, height);
        graphics.dispose();
        var out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private MockMultipartHttpServletRequestBuilder upload(Session user, String path, Object... vars) {
        var builder = multipart(path, vars);
        builder.cookie(user.session(), user.csrfCookie()).header("X-XSRF-TOKEN", user.csrfToken());
        return builder;
    }

    private UUID id(String json) {
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    @Test
    void diarioDeObraComFotosPesquisaEExportacoes() throws Exception {
        var owner = newUser("dona-diario");
        var orgId = createOrganization(owner, "Diário F8.5");
        var rui = id(body(perform(owner, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"Rui Encarregado\",\"category\":\"Encarregado\"}")).andExpect(status().isCreated())));
        var siteA = id(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId).content("""
                {"code":"OB-DI-1","name":"Edifício Aurora","country":"PT","status":"ACTIVE","foremanEmployeeId":"%s"}
                """.formatted(rui))).andExpect(status().isCreated())));
        var siteB = id(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId)
                .content("{\"name\":\"Outra obra\",\"country\":\"PT\",\"status\":\"ACTIVE\"}")).andExpect(status().isCreated())));
        var foreman = joinAs(owner, orgId, "FOREMAN", "encarregado-diario");
        linkEmployee(owner, orgId, foreman, rui);
        var worker = joinAs(owner, orgId, "WORKER", "trabalhador-diario");
        var entries = "/api/orgs/{orgId}/sites/{siteId}/diary/entries";
        var diary = "/api/orgs/{orgId}/sites/{siteId}/diary";

        // O encarregado escreve na sua obra; repetir o envio com a mesma chave não duplica.
        var key = UUID.randomUUID();
        var request = """
                {"date":"%s","title":"Betonagem da laje","body":"Piso 2, betão C30/37\\nTempo seco","clientKey":"%s"}
                """.formatted(TODAY, key);
        var first = body(perform(foreman, post(entries, orgId, siteA).content(request)).andExpect(status().isCreated()));
        var mine = id(first);
        assertThat(id(body(perform(foreman, post(entries, orgId, siteA).content(request)).andExpect(status().isCreated()))))
                .isEqualTo(mine);
        assertThat((String) JsonPath.read(first, "$.author.role")).isEqualTo("FOREMAN");
        assertThat((Boolean) JsonPath.read(first, "$.canEdit")).isTrue();

        // Fora do âmbito: obra de outro encarregado (404); trabalhador sem acesso (403); data futura recusada.
        perform(foreman, post(entries, orgId, siteB).content("{\"date\":\"%s\",\"title\":\"X\"}".formatted(TODAY)))
                .andExpect(status().isNotFound());
        perform(worker, get(diary, orgId, siteA)).andExpect(status().isForbidden());
        perform(owner, post(entries, orgId, siteA).content("{\"date\":\"%s\",\"title\":\"Amanhã\"}".formatted(TODAY.plusDays(1))))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid-date"));

        // O gestor escreve noutro mês.
        var managers = id(body(perform(owner, post(entries, orgId, siteA).content("""
                {"date":"%s","title":"Armaduras","body":"Inspeção do fiscal"}""".formatted(LAST_MONTH)))
                .andExpect(status().isCreated())));

        // Fotos: tipo pelo conteúdo, dimensões guardadas, servidas pela API.
        var wide = png(40, 30, Color.ORANGE);
        var tall = png(30, 40, Color.BLUE);
        var withPhotos = body(mockMvc.perform(upload(foreman, entries + "/{entryId}/photos", orgId, siteA, mine)
                        .file(new MockMultipartFile("files", "a.png", "image/png", wide))
                        .file(new MockMultipartFile("files", "b.png", "image/png", tall)))
                .andExpect(status().isOk()));
        assertThat(JsonPath.<List<Integer>>read(withPhotos, "$.photos[*].width")).containsExactly(40, 30);
        assertThat(JsonPath.<List<Integer>>read(withPhotos, "$.photos[*].height")).containsExactly(30, 40);
        String photoUrl = JsonPath.read(withPhotos, "$.photos[0].url");
        assertThat(perform(foreman, get(photoUrl)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray())
                .isEqualTo(wide);
        perform(worker, get(photoUrl)).andExpect(status().isForbidden());
        mockMvc.perform(upload(foreman, entries + "/{entryId}/photos", orgId, siteA, mine)
                        .file(new MockMultipartFile("files", "falsa.png", "image/png", "texto".getBytes())))
                .andExpect(status().isUnsupportedMediaType());
        // No máximo 20 fotos por registo (já tem 2).
        var tooMany = upload(foreman, entries + "/{entryId}/photos", orgId, siteA, mine);
        for (int i = 0; i < 19; i++) {
            tooMany.file(new MockMultipartFile("files", "f" + i + ".png", "image/png", wide));
        }
        mockMvc.perform(tooMany).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("too-many-photos"));

        // Editar: o autor ou um gestor; versão antiga dá 409.
        perform(foreman, patch(entries + "/{entryId}", orgId, siteA, managers)
                .content("{\"date\":\"%s\",\"title\":\"Mudado\",\"version\":0}".formatted(LAST_MONTH)))
                .andExpect(status().isForbidden());
        perform(owner, patch(entries + "/{entryId}", orgId, siteA, mine)
                .content("{\"date\":\"%s\",\"title\":\"Betonagem da laje do piso 2\",\"body\":\"Piso 2, betão C30/37\",\"version\":0}"
                        .formatted(TODAY)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        perform(foreman, patch(entries + "/{entryId}", orgId, siteA, mine)
                .content("{\"date\":\"%s\",\"title\":\"Velho\",\"version\":0}".formatted(TODAY)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("stale"));

        // Linha do tempo: do mais recente para trás, atalhos por mês, pesquisa sem acentos nem maiúsculas.
        var all = body(perform(foreman, get(diary, orgId, siteA)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(all, "$.entries[*].title")).containsExactly("Betonagem da laje do piso 2", "Armaduras");
        assertThat(JsonPath.<List<Boolean>>read(all, "$.entries[*].canEdit")).containsExactly(true, false);
        assertThat(JsonPath.<List<String>>read(all, "$.months[*].month"))
                .containsExactly(TODAY.toString().substring(0, 7), LAST_MONTH.toString().substring(0, 7));
        assertThat((Boolean) JsonPath.read(all, "$.canWrite")).isTrue();
        var search = body(perform(foreman, get(diary, orgId, siteA).param("q", "BETAO")).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(search, "$.entries[*].id")).containsExactly(mine.toString());
        search = body(perform(foreman, get(diary, orgId, siteA).param("q", "inspecao")).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(search, "$.entries[*].id")).containsExactly(managers.toString());
        search = body(perform(foreman, get(diary, orgId, siteA).param("month", LAST_MONTH.toString().substring(0, 7))));
        assertThat(JsonPath.<List<String>>read(search, "$.entries[*].title")).containsExactly("Armaduras");
        perform(foreman, get(diary, orgId, siteA).param("month", "2026-13")).andExpect(status().isBadRequest());

        // Word: título, texto e as duas fotos (mês corrente).
        var started = perform(foreman, get(diary + "/export.docx", orgId, siteA).param("month", TODAY.toString().substring(0, 7)))
                .andExpect(request().asyncStarted()).andReturn();
        var word = mockMvc.perform(asyncDispatch(started)).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(word.getHeader("Content-Disposition")).contains("diario-ob-di-1-" + TODAY.toString().substring(0, 7) + ".docx");
        try (var document = new XWPFDocument(new ByteArrayInputStream(word.getContentAsByteArray()))) {
            var text = new ArrayList<String>();
            document.getParagraphs().forEach(paragraph -> text.add(paragraph.getText()));
            assertThat(text).anyMatch(t -> t.contains("Diário de obra · OB-DI-1 Edifício Aurora"));
            assertThat(text).anyMatch(t -> t.contains("Betonagem da laje do piso 2"));
            assertThat(text).contains("Piso 2, betão C30/37");
            assertThat(text).noneMatch(t -> t.contains("Armaduras"));
            assertThat(document.getAllPictures()).hasSize(2);
            var margins = document.getDocument().getBody().getSectPr().getPgMar();
            assertThat(margins.getLeft().toString()).isEqualTo("1134");
        }

        // Excel com a pesquisa: uma linha por registo.
        var excelStarted = perform(owner, get(diary + "/export.xlsx", orgId, siteA).param("q", "inspeção"))
                .andExpect(request().asyncStarted()).andReturn();
        var excel = mockMvc.perform(asyncDispatch(excelStarted)).andExpect(status().isOk()).andReturn().getResponse();
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(excel.getContentAsByteArray()))) {
            var sheet = workbook.getSheetAt(0);
            assertThat(sheet.getRow(3).getCell(2).getStringCellValue()).isEqualTo("Título");
            assertThat(sheet.getRow(4).getCell(2).getStringCellValue()).isEqualTo("Armaduras");
            assertThat(sheet.getRow(4).getCell(5).getStringCellValue()).isEqualTo("Direção de obra");
            assertThat(sheet.getLastRowNum()).isEqualTo(4);
        }

        // Últimos registos de todas as obras (início do gestor), com miniaturas.
        var recent = body(perform(owner, get("/api/orgs/{orgId}/diary/recent", orgId)).andExpect(status().isOk()));
        assertThat(JsonPath.<List<String>>read(recent, "$[*].id")).containsExactlyInAnyOrder(mine.toString(), managers.toString());
        assertThat(JsonPath.<List<Integer>>read(recent, "$[?(@.id=='" + mine + "')].photoCount")).containsExactly(2);
        perform(worker, get("/api/orgs/{orgId}/diary/recent", orgId)).andExpect(status().isForbidden());

        // Remover uma foto renumera as seguintes; apagar o registo apaga as fotos.
        String firstPhoto = JsonPath.read(withPhotos, "$.photos[0].id");
        perform(foreman, delete(entries + "/{entryId}/photos/{photoId}", orgId, siteA, mine, firstPhoto))
                .andExpect(status().isNoContent());
        var after = body(perform(foreman, get(diary, orgId, siteA)));
        assertThat(JsonPath.<List<Integer>>read(after, "$.entries[?(@.id=='" + mine + "')].photos[*].position")).containsExactly(0);
        String remaining = JsonPath.<List<String>>read(after, "$.entries[?(@.id=='" + mine + "')].photos[*].url").getFirst();
        perform(foreman, delete(entries + "/{entryId}", orgId, siteA, managers)).andExpect(status().isForbidden());
        perform(foreman, delete(entries + "/{entryId}", orgId, siteA, mine)).andExpect(status().isNoContent());
        perform(foreman, get(remaining)).andExpect(status().isNotFound());

        // Outra empresa não vê nada.
        var stranger = newUser("estranho-diario");
        perform(stranger, get(diary, orgId, siteA)).andExpect(status().isNotFound());
    }
}
