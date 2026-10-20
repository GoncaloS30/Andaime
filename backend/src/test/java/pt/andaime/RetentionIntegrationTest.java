package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;

import com.jayway.jsonpath.JsonPath;

import pt.andaime.retention.application.RetentionService;
import pt.andaime.shared.storage.ObjectStorage;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

/** Conservação de dados (RGPD): política por empresa, anonimização automática com ficheiros apagados e limpezas. */
class RetentionIntegrationTest extends ApiTestSupport {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Europe/Lisbon"));
    private static final byte[] PDF = ("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n")
            .getBytes(StandardCharsets.US_ASCII);

    @Autowired
    RetentionService retentionService;

    @Autowired
    ObjectStorage storage;

    private UUID employee(Session manager, UUID orgId, String name) throws Exception {
        var json = body(perform(manager, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"%s\",\"category\":\"Pedreiro\",\"email\":\"pessoa@exemplo.pt\"}".formatted(name)))
                .andExpect(status().isCreated()));
        return UUID.fromString(JsonPath.read(json, "$.id"));
    }

    /** Carrega um documento de identificação para o trabalhador; devolve {documentId, versionId}. */
    private String[] uploadDocument(Session owner, UUID orgId, UUID employeeId) throws Exception {
        var types = body(perform(owner, get("/api/orgs/{orgId}/document-types", orgId)).andExpect(status().isOk()));
        var typeId = JsonPath.<List<String>>read(types, "$[?(@.name=='Documento de identificação')].id").getFirst();
        var created = body(mockMvc.perform(multipart("/api/orgs/{orgId}/documents", orgId)
                        .file(new MockMultipartFile("file", "cc-ana-pessoal.pdf", "application/pdf", PDF))
                        .param("typeId", typeId).param("employeeId", employeeId.toString())
                        .param("expiresOn", TODAY.plusYears(2).toString())
                        .cookie(owner.session(), owner.csrfCookie()).header("X-XSRF-TOKEN", owner.csrfToken()))
                .andExpect(status().isCreated()));
        return new String[] {JsonPath.read(created, "$.id"), JsonPath.read(created, "$.current.id")};
    }

    private UUID userId(Session session) throws Exception {
        return UUID.fromString(JsonPath.read(body(perform(session, get("/api/me"))), "$.user.id"));
    }

    @Test
    void politicaDeConservacaoComPermissoesEVersao() throws Exception {
        var owner = newUser("dono-conservacao");
        var orgId = createOrganization(owner, "Conservação");
        var manager = joinAs(owner, orgId, "MANAGER", "gestor-conservacao");
        var foreman = joinAs(owner, orgId, "FOREMAN", "encarregado-conservacao");
        var stranger = newUser("estranho-conservacao");
        createOrganization(stranger, "Outra conservação");

        // Valores por omissão criados com a empresa.
        perform(owner, get("/api/orgs/{orgId}/retention", orgId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.anonymizeAfterMonths").value(12))
                .andExpect(jsonPath("$.notificationsAfterMonths").value(12))
                .andExpect(jsonPath("$.version").value(0));
        perform(manager, get("/api/orgs/{orgId}/retention", orgId)).andExpect(status().isOk());
        perform(foreman, get("/api/orgs/{orgId}/retention", orgId)).andExpect(status().isForbidden());
        perform(stranger, get("/api/orgs/{orgId}/retention", orgId)).andExpect(status().isNotFound());

        var update = "{\"anonymizeAfterMonths\":%s,\"notificationsAfterMonths\":%d,\"version\":%d}";
        perform(manager, put("/api/orgs/{orgId}/retention", orgId).content(update.formatted("24", 6, 0)))
                .andExpect(status().isForbidden());
        perform(stranger, put("/api/orgs/{orgId}/retention", orgId).content(update.formatted("24", 6, 0)))
                .andExpect(status().isNotFound());
        perform(owner, put("/api/orgs/{orgId}/retention", orgId).content(update.formatted("121", 6, 0)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("validation"));
        perform(owner, put("/api/orgs/{orgId}/retention", orgId).content(update.formatted("24", 61, 0)))
                .andExpect(status().isBadRequest());
        perform(owner, put("/api/orgs/{orgId}/retention", orgId).content(update.formatted("24", 6, 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.anonymizeAfterMonths").value(24))
                .andExpect(jsonPath("$.notificationsAfterMonths").value(6))
                .andExpect(jsonPath("$.version").value(1));
        // Versão desatualizada: conflito.
        perform(owner, put("/api/orgs/{orgId}/retention", orgId).content(update.formatted("null", 6, 0)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("stale"));
        // Desligar a anonimização automática.
        perform(owner, put("/api/orgs/{orgId}/retention", orgId).content(update.formatted("null", 6, 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.anonymizeAfterMonths").doesNotExist())
                .andExpect(jsonPath("$.version").value(2));
        perform(manager, get("/api/orgs/{orgId}/retention", orgId)).andExpect(jsonPath("$.notificationsAfterMonths").value(6));

        try (var connection = ownerConnection()) {
            assertThat(strings(connection, "SELECT action FROM audit_event WHERE organization_id = ? AND action = 'retention.updated'",
                    orgId)).hasSize(2);
        }
    }

    @Test
    void anonimizaAutomaticamenteExTrabalhadoresAntigosEApagaFicheirosENotificacoes() throws Exception {
        var owner = newUser("dono-retencao");
        var orgId = createOrganization(owner, "Retenção automática");
        var ownerId = userId(owner);
        var ana = employee(owner, orgId, "Ana Antiga");
        var rui = employee(owner, orgId, "Rui Recente");
        var anaDocument = uploadDocument(owner, orgId, ana);
        var ruiDocument = uploadDocument(owner, orgId, rui);
        perform(owner, post("/api/orgs/{orgId}/employees/{id}/archive", orgId, ana)).andExpect(status().isOk());
        perform(owner, post("/api/orgs/{orgId}/employees/{id}/archive", orgId, rui)).andExpect(status().isOk());

        String anaKey;
        UUID oldNotification = UUID.randomUUID();
        UUID recentNotification = UUID.randomUUID();
        try (var connection = ownerConnection()) {
            // A Ana saiu há dois anos; o Rui saiu hoje.
            execute(connection, "UPDATE employees SET archived_at = now() - interval '2 years' WHERE id = ?", ana);
            anaKey = strings(connection, "SELECT storage_key FROM document_versions WHERE id = ?", UUID.fromString(anaDocument[1]))
                    .getFirst();
            execute(connection, """
                    INSERT INTO notifications (id, organization_id, user_id, kind, title, created_at)
                    VALUES (?, ?, ?, 'test', 'Antiga', now() - interval '13 months'), (?, ?, ?, 'test', 'Recente', now() - interval '1 month')
                    """, oldNotification, orgId, ownerId, recentNotification, orgId, ownerId);
        }
        assertThat(storage.get(anaKey).readAllBytes()).isEqualTo(PDF);

        var result = retentionService.runFor(orgId);
        assertThat(result.skipped()).isFalse();
        assertThat(result.anonymizedEmployees()).isEqualTo(1);
        assertThat(result.deletedNotifications()).isEqualTo(1);

        perform(owner, get("/api/orgs/{orgId}/employees/{id}", orgId, ana)).andExpect(status().isOk())
                .andExpect(jsonPath("$.anonymized").value(true))
                .andExpect(jsonPath("$.fullName").value("Ex-trabalhador 1"))
                .andExpect(jsonPath("$.email").doesNotExist());
        perform(owner, get("/api/orgs/{orgId}/employees/{id}", orgId, rui)).andExpect(status().isOk())
                .andExpect(jsonPath("$.anonymized").value(false))
                .andExpect(jsonPath("$.fullName").value("Rui Recente"));

        // O ficheiro foi apagado do armazenamento; o download responde 410 em vez de falhar.
        perform(owner, get("/api/orgs/{orgId}/documents/{id}/versions/{v}/download", orgId, anaDocument[0], anaDocument[1]))
                .andExpect(status().isGone()).andExpect(jsonPath("$.code").value("document-purged"));
        assertThatThrownBy(() -> storage.get(anaKey).readAllBytes()).isInstanceOf(NoSuchKeyException.class);
        perform(owner, get("/api/orgs/{orgId}/documents/{id}/versions/{v}/download", orgId, ruiDocument[0], ruiDocument[1]))
                .andExpect(status().isOk()).andExpect(content().bytes(PDF));

        try (var connection = ownerConnection()) {
            assertThat(strings(connection, "SELECT filename FROM document_versions WHERE id = ? AND storage_key IS NULL AND purged_at IS NOT NULL",
                    UUID.fromString(anaDocument[1]))).containsExactly("documento-apagado");
            assertThat(strings(connection, "SELECT changes::text FROM audit_event WHERE entity_id = ? AND action = 'employee.anonymized'", ana))
                    .singleElement().satisfies(changes -> assertThat(changes).contains("\"automatic\"").contains("true"));
            assertThat(strings(connection, "SELECT title FROM notifications WHERE id IN (?, ?)", oldNotification, recentNotification))
                    .containsExactly("Recente");
        }

        // Segunda execução não faz nada de novo.
        var again = retentionService.runFor(orgId);
        assertThat(again.anonymizedEmployees()).isZero();
        assertThat(again.deletedNotifications()).isZero();

        // Com a anonimização automática desligada, nem um ex-trabalhador antigo é anonimizado.
        perform(owner, put("/api/orgs/{orgId}/retention", orgId)
                .content("{\"anonymizeAfterMonths\":null,\"notificationsAfterMonths\":12,\"version\":0}")).andExpect(status().isOk());
        try (var connection = ownerConnection()) {
            execute(connection, "UPDATE employees SET archived_at = now() - interval '5 years' WHERE id = ?", rui);
        }
        assertThat(retentionService.runFor(orgId).anonymizedEmployees()).isZero();
        perform(owner, get("/api/orgs/{orgId}/employees/{id}", orgId, rui)).andExpect(jsonPath("$.anonymized").value(false));

        // A anonimização manual também apaga os ficheiros.
        perform(owner, post("/api/orgs/{orgId}/employees/{id}/anonymize", orgId, rui)).andExpect(status().isOk());
        perform(owner, get("/api/orgs/{orgId}/documents/{id}/versions/{v}/download", orgId, ruiDocument[0], ruiDocument[1]))
                .andExpect(status().isGone());
    }

    @Test
    void limpezaGlobalDeTokensConvitesEBloqueiosDeLogin() throws Exception {
        var owner = newUser("dono-limpeza");
        var orgId = createOrganization(owner, "Limpeza global");
        var ownerId = userId(owner);
        var expiredToken = UUID.randomUUID();
        var validToken = UUID.randomUUID();
        var expiredReset = UUID.randomUUID();
        var oldInvitation = UUID.randomUUID();
        var oldAccepted = UUID.randomUUID();
        var pendingInvitation = UUID.randomUUID();
        var oldThrottle = uniqueEmail("antigo");
        var lockedThrottle = uniqueEmail("bloqueado");
        var recentThrottle = uniqueEmail("recente");
        try (var connection = ownerConnection()) {
            execute(connection, """
                    INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
                    VALUES (?, ?, uuid_send(gen_random_uuid()), now() - interval '1 hour'),
                           (?, ?, uuid_send(gen_random_uuid()), now() + interval '1 day')
                    """, expiredToken, ownerId, validToken, ownerId);
            execute(connection, """
                    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
                    VALUES (?, ?, uuid_send(gen_random_uuid()), now() - interval '1 hour')
                    """, expiredReset, ownerId);
            execute(connection, """
                    INSERT INTO invitations (id, organization_id, email, role, token_hash, expires_at, accepted_at, invited_by_user_id)
                    VALUES (?, ?, ?, 'WORKER', uuid_send(gen_random_uuid()), now() - interval '31 days', NULL, ?),
                           (?, ?, ?, 'WORKER', uuid_send(gen_random_uuid()), now() - interval '20 days', now() - interval '40 days', ?),
                           (?, ?, ?, 'WORKER', uuid_send(gen_random_uuid()), now() + interval '5 days', NULL, ?)
                    """, oldInvitation, orgId, uniqueEmail("convite-antigo"), ownerId,
                    oldAccepted, orgId, uniqueEmail("convite-aceite"), ownerId,
                    pendingInvitation, orgId, uniqueEmail("convite-pendente"), ownerId);
            execute(connection, """
                    INSERT INTO login_throttle (email_key, failures, locked_until, last_failure_at)
                    VALUES (?, 3, NULL, now() - interval '40 days'),
                           (?, 9, now() + interval '1 hour', now() - interval '40 days'),
                           (?, 2, NULL, now() - interval '2 days')
                    """, oldThrottle, lockedThrottle, recentThrottle);
        }

        var purged = retentionService.purgePlatformData();
        assertThat(purged.verificationTokens()).isPositive();
        assertThat(purged.resetTokens()).isPositive();
        assertThat(purged.invitations()).isGreaterThanOrEqualTo(2);
        assertThat(purged.loginThrottles()).isPositive();

        try (var connection = ownerConnection()) {
            assertThat(strings(connection, "SELECT id::text FROM email_verification_tokens WHERE id IN (?, ?)", expiredToken, validToken))
                    .containsExactly(validToken.toString());
            assertThat(strings(connection, "SELECT id::text FROM password_reset_tokens WHERE id = ?", expiredReset)).isEmpty();
            assertThat(strings(connection, "SELECT id::text FROM invitations WHERE id IN (?, ?, ?)", oldInvitation, oldAccepted,
                    pendingInvitation)).containsExactly(pendingInvitation.toString());
            assertThat(strings(connection, "SELECT email_key::text FROM login_throttle WHERE email_key IN (?, ?, ?) ORDER BY failures",
                    oldThrottle, lockedThrottle, recentThrottle)).containsExactly(recentThrottle, lockedThrottle);
        }
    }

    private static void execute(Connection connection, String sql, Object... arguments) throws SQLException {
        try (var statement = connection.prepareStatement(sql)) {
            for (int index = 0; index < arguments.length; index++) {
                statement.setObject(index + 1, arguments[index]);
            }
            statement.execute();
        }
    }

    private static List<String> strings(Connection connection, String sql, Object... arguments) throws SQLException {
        try (var statement = connection.prepareStatement(sql)) {
            for (int index = 0; index < arguments.length; index++) {
                statement.setObject(index + 1, arguments[index]);
            }
            var result = statement.executeQuery();
            var values = new ArrayList<String>();
            while (result.next()) {
                values.add(result.getString(1));
            }
            return values;
        }
    }
}
