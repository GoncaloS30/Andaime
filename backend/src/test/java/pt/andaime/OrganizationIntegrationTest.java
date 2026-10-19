package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import com.jayway.jsonpath.JsonPath;

/**
 * Organizações, membros, convites, auditoria, plataforma e isolamento entre empresas,
 * sempre por HTTP com sessão e CSRF reais.
 */
class OrganizationIntegrationTest extends ApiTestSupport {

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping handlerMapping;

    @Test
    void conviteAceiteDaPapelEPermissoesCorretas() throws Exception {
        var owner = newUser("dona");
        var orgId = createOrganization(owner, "Construções Norte");

        // Convidar um gestor; o token chega pelo email.
        var managerEmail = uniqueEmail("gestor");
        perform(owner, post("/api/orgs/{orgId}/invitations", orgId)
                .content("{\"email\":\"" + managerEmail.toUpperCase() + "\",\"role\":\"MANAGER\"}"))
                .andExpect(status().isCreated());
        var token = ArgumentCaptor.forClass(String.class);
        verify(organizationMailGateway).sendInvitation(
                eq(managerEmail), eq("Construções Norte"), anyString(), eq("MANAGER"), token.capture());

        mockMvc.perform(get("/api/invitations/{token}", token.getValue()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.organizationName").value("Construções Norte"))
                .andExpect(jsonPath("$.status").value("VALID"))
                .andExpect(jsonPath("$.emailMasked").value(managerEmail.charAt(0) + "***@andaime.local"));

        // Outra conta não pode aceitar o convite.
        var intruder = newUser("intrusa");
        perform(intruder, post("/api/invitations/{token}/accept", token.getValue()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("invitation-email-mismatch"));

        var manager = newUser(managerEmail);
        perform(manager, post("/api/invitations/{token}/accept", token.getValue()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("MANAGER"));
        perform(manager, post("/api/invitations/{token}/accept", token.getValue()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("invitation-invalid"));

        // O gestor vê a equipa mas não convida nem altera papéis.
        var members = perform(manager, get("/api/orgs/{orgId}/members", orgId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        perform(manager, post("/api/orgs/{orgId}/invitations", orgId)
                .content("{\"email\":\"" + uniqueEmail("x") + "\",\"role\":\"WORKER\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("forbidden"));

        java.util.List<String> owners = JsonPath.read(members, "$[?(@.role=='OWNER')].id");
        java.util.List<String> managers = JsonPath.read(members, "$[?(@.role=='MANAGER')].id");
        var ownerMembership = owners.getFirst();
        var managerMembership = managers.getFirst();

        // O único dono não pode deixar de o ser.
        perform(owner, request(HttpMethod.PATCH, "/api/orgs/{orgId}/members/{id}", orgId, ownerMembership)
                .content("{\"role\":\"ADMIN\",\"version\":0}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("last-owner"));

        // Promoção com versão; versão antiga dá 409 stale.
        perform(owner, request(HttpMethod.PATCH, "/api/orgs/{orgId}/members/{id}", orgId, managerMembership)
                .content("{\"role\":\"ADMIN\",\"version\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.version").value(1));
        perform(owner, request(HttpMethod.PATCH, "/api/orgs/{orgId}/members/{id}", orgId, managerMembership)
                .content("{\"role\":\"MANAGER\",\"version\":0}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("stale"));

        // Um administrador não pode retirar o dono.
        perform(manager, request(HttpMethod.DELETE, "/api/orgs/{orgId}/members/{id}", orgId, ownerMembership))
                .andExpect(status().isForbidden());

        // Edição da empresa e auditoria.
        perform(owner, request(HttpMethod.PATCH, "/api/orgs/{orgId}", orgId)
                .content("{\"name\":\"Construções Norte, Lda.\",\"timezone\":\"Europe/Paris\",\"version\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timezone").value("Europe/Paris"));
        perform(owner, get("/api/orgs/{orgId}/audit", orgId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].action").value("organization.updated"))
                .andExpect(jsonPath("$.items[0].changes.name.to").value("Construções Norte, Lda."))
                .andExpect(jsonPath("$.items[?(@.action=='invitation.accepted')]").exists());
    }

    /**
     * Suite IDOR: todas as rotas de empresa, chamadas por um utilizador de outra empresa,
     * respondem 404 sem efeitos. Uma rota nova entra automaticamente neste teste.
     */
    @Test
    void nenhumaRotaDeEmpresaEAcessivelAPartirDeOutraEmpresa() throws Exception {
        var ownerA = newUser("dono-a");
        var orgA = createOrganization(ownerA, "Empresa A");
        var ownerB = newUser("dono-b");
        var orgB = createOrganization(ownerB, "Empresa B");

        var routes = new ArrayList<String>();
        for (var entry : handlerMapping.getHandlerMethods().entrySet()) {
            var info = entry.getKey();
            for (var pattern : info.getPatternValues()) {
                if (!pattern.startsWith("/api/orgs/{orgId}")) {
                    continue;
                }
                var methods = info.getMethodsCondition().getMethods();
                for (var method : methods) {
                    var uri = pattern.replace("{orgId}", orgB.toString())
                            .replaceAll("\\{[^}]+}", UUID.randomUUID().toString());
                    routes.add(method + " " + pattern);
                    perform(ownerA, request(HttpMethod.valueOf(method.name()), uri).content("{}"))
                            .andExpect(status().isNotFound())
                            .andExpect(jsonPath("$.code").value("not-found"));
                }
            }
        }
        assertThat(routes).as("rotas de empresa verificadas").hasSizeGreaterThanOrEqualTo(9);

        // Id de um recurso da empresa B usado no caminho da empresa A.
        var membersB = perform(ownerB, get("/api/orgs/{orgId}/members", orgB))
                .andReturn().getResponse().getContentAsString();
        String membershipB = JsonPath.read(membersB, "$[0].id");
        perform(ownerA, request(HttpMethod.PATCH, "/api/orgs/{orgId}/members/{id}", orgA, membershipB)
                .content("{\"role\":\"WORKER\",\"version\":0}"))
                .andExpect(status().isNotFound());
        perform(ownerB, get("/api/orgs/{orgId}/members", orgB))
                .andExpect(jsonPath("$[0].role").value("OWNER"));
    }

    @Test
    void plataformaListaESuspendeOrganizacoes() throws Exception {
        var owner = newUser("dono-suspenso");
        var orgId = createOrganization(owner, "Empresa a suspender");
        var admin = newUser("plataforma");

        perform(admin, get("/api/platform/orgs")).andExpect(status().isForbidden());
        try (var connection = ownerConnection();
             var statement = connection.prepareStatement(
                     "INSERT INTO platform_admins (user_id) SELECT id FROM users WHERE email = ?")) {
            statement.setString(1, admin.email());
            statement.execute();
        }

        perform(admin, get("/api/platform/orgs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + orgId + "')].members").value(1));
        perform(admin, post("/api/platform/orgs/{orgId}/suspend", orgId)).andExpect(status().isNoContent());
        perform(owner, get("/api/orgs/{orgId}", orgId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("organization-suspended"));
        perform(admin, post("/api/platform/orgs/{orgId}/reactivate", orgId)).andExpect(status().isNoContent());
        perform(owner, get("/api/orgs/{orgId}", orgId)).andExpect(status().isOk());
    }
}
