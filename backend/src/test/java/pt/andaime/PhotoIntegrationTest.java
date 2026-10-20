package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

/** Fotografias de trabalhadores e obras: só imagens, só gestores alteram, servidas pela API com o âmbito da ficha. */
class PhotoIntegrationTest extends ApiTestSupport {

    /** PNG 1×1 válido. */
    private static final byte[] PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    private MockMultipartHttpServletRequestBuilder upload(Session user, String path, Object... vars) {
        var builder = multipart(HttpMethod.PUT, path, vars);
        builder.cookie(user.session(), user.csrfCookie()).header("X-XSRF-TOKEN", user.csrfToken());
        return builder;
    }

    @Test
    void fotografiasDeTrabalhadoresEObras() throws Exception {
        var owner = newUser("dono-fotos");
        var orgId = createOrganization(owner, "Fotos F7");
        var ana = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"Ana Foto\",\"category\":\"Pedreiro\"}")).andExpect(status().isCreated())), "$.id"));
        var site = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId)
                .content("{\"name\":\"Obra Foto\",\"country\":\"PT\",\"status\":\"ACTIVE\"}")).andExpect(status().isCreated())), "$.id"));
        var employeePhoto = "/api/orgs/{orgId}/employees/{id}/photo";

        // Sem foto: 404 e photoUrl nulo.
        perform(owner, get(employeePhoto, orgId, ana)).andExpect(status().isNotFound());

        // Texto com extensão .png: o tipo é detetado pelo conteúdo e recusado.
        mockMvc.perform(upload(owner, employeePhoto, orgId, ana)
                .file(new MockMultipartFile("file", "falsa.png", "image/png", "não sou uma imagem".getBytes(StandardCharsets.UTF_8))))
                .andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("$.code").value("unsupported-type"));

        var detail = body(mockMvc.perform(upload(owner, employeePhoto, orgId, ana)
                .file(new MockMultipartFile("file", "ana.png", "image/png", PNG))).andExpect(status().isOk()));
        String url = JsonPath.read(detail, "$.photoUrl");
        assertThat(url).startsWith("/api/orgs/" + orgId + "/employees/" + ana + "/photo?v=");
        var image = perform(owner, get(url)).andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(image).isEqualTo(PNG);
        var list = body(perform(owner, get("/api/orgs/{orgId}/employees", orgId)));
        assertThat(JsonPath.<List<String>>read(list, "$.items[?(@.id=='" + ana + "')].photoUrl")).containsExactly(url);

        // Trabalhador não altera fotos; outra empresa não vê.
        var worker = joinAs(owner, orgId, "WORKER", "trabalhador-fotos");
        mockMvc.perform(upload(worker, employeePhoto, orgId, ana).file(new MockMultipartFile("file", "x.png", "image/png", PNG)))
                .andExpect(status().isForbidden());
        var stranger = newUser("estranho-fotos");
        perform(stranger, get(employeePhoto, orgId, ana)).andExpect(status().isNotFound());

        // Remover: deixa de existir.
        perform(owner, delete(employeePhoto, orgId, ana)).andExpect(status().isNoContent());
        perform(owner, get(employeePhoto, orgId, ana)).andExpect(status().isNotFound());

        // Obras.
        var sitePhoto = "/api/orgs/{orgId}/sites/{id}/photo";
        var siteDetail = body(mockMvc.perform(upload(owner, sitePhoto, orgId, site)
                .file(new MockMultipartFile("file", "obra.png", "image/png", PNG))).andExpect(status().isOk()));
        String siteUrl = JsonPath.read(siteDetail, "$.photoUrl");
        assertThat(perform(owner, get(siteUrl)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray())
                .isEqualTo(PNG);
        var sites = body(perform(owner, get("/api/orgs/{orgId}/sites", orgId)));
        assertThat(JsonPath.<List<String>>read(sites, "$[?(@.id=='" + site + "')].photoUrl")).containsExactly(siteUrl);
        perform(stranger, get(sitePhoto, orgId, site)).andExpect(status().isNotFound());
    }
}
