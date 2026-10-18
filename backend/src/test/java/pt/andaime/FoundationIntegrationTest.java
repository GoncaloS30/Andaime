package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import pt.andaime.shared.tenant.TenantContext;

@Testcontainers
@SpringBootTest
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class FoundationIntegrationTest {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine")
            .withDatabaseName("andaime")
            .withUsername("postgres")
            .withPassword("postgres_local")
            .withInitScript("postgres-init.sql");

    static UUID userId;
    static UUID orgA;
    static UUID orgB;

    @Autowired
    PlatformTransactionManager transactionManager;

    @Autowired
    JdbcTemplate jdbcTemplate;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", () -> "andaime_app");
        registry.add("spring.datasource.password", () -> "andaime_app_local");
        registry.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
    }

    static {
        userId = UUID.randomUUID();
        orgA = UUID.randomUUID();
        orgB = UUID.randomUUID();
    }

    @BeforeEach
    void seedTwoOrganizations() throws SQLException {
        try (var connection = ownerConnection()) {
            execute(connection, """
                    INSERT INTO users (id, email, password_hash, display_name)
                    VALUES (?, 'teste@andaime.local', 'not-a-real-hash', 'Teste')
                    ON CONFLICT DO NOTHING
                    """, userId);
            execute(connection, """
                    INSERT INTO organizations (id, name, country, created_by_user_id)
                    VALUES (?, 'Organização A', 'PT', ?), (?, 'Organização B', 'PT', ?)
                    ON CONFLICT DO NOTHING
                    """, orgA, userId, orgB, userId);
            execute(connection, """
                    INSERT INTO memberships (organization_id, user_id, role)
                    VALUES (?, ?, 'OWNER')
                    ON CONFLICT DO NOTHING
                    """, orgA, userId);
        }
    }

    @Test
    void aplicouTodasAsMigracoes() throws SQLException {
        try (var connection = ownerConnection();
             var statement = connection.prepareStatement(
                     "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank")) {
            var result = statement.executeQuery();
            var versions = new java.util.ArrayList<String>();
            while (result.next()) {
                assertThat(result.getBoolean("success")).isTrue();
                versions.add(result.getString("version"));
            }
            assertThat(versions).containsExactlyElementsOf(
                    List.of("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"));
        }
    }

    @Test
    void todasAsTabelasDeTenantTemRlsAtivaEForcada() throws SQLException {
        try (var connection = ownerConnection();
             var statement = connection.prepareStatement("""
                     SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
                     FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'public'
                       AND c.relkind = 'r'
                       AND (
                         c.relname = 'organizations'
                         OR EXISTS (
                           SELECT 1 FROM pg_attribute a
                           WHERE a.attrelid = c.oid
                             AND a.attname = 'organization_id'
                             AND NOT a.attisdropped
                         )
                       )
                     ORDER BY c.relname
                     """)) {
            var result = statement.executeQuery();
            var tables = new java.util.ArrayList<String>();
            while (result.next()) {
                tables.add(result.getString("relname"));
                assertThat(result.getBoolean("relrowsecurity"))
                        .as("RLS ativa em %s", result.getString("relname"))
                        .isTrue();
                assertThat(result.getBoolean("relforcerowsecurity"))
                        .as("RLS forçada em %s", result.getString("relname"))
                        .isTrue();
            }
            assertThat(tables).contains("organizations", "memberships", "invitations",
                    "audit_event", "event_publication", "idempotency_keys", "labor_policies",
                    "org_holidays", "conflict_rule_settings", "support_access_grants");
        }
    }

    @Test
    void papelDaAplicacaoNaoPossuiObjetos() throws SQLException {
        try (var connection = ownerConnection();
             var statement = connection.prepareStatement("""
                     SELECT count(*)
                     FROM pg_class c
                     JOIN pg_roles r ON r.oid = c.relowner
                     WHERE r.rolname = 'andaime_app'
                     """)) {
            var result = statement.executeQuery();
            result.next();
            assertThat(result.getInt(1)).isZero();
        }
    }

    @Test
    void auditEventEAppendOnlyMesmoParaOProprietario() throws SQLException {
        var auditId = UUID.randomUUID();
        try (var connection = ownerConnection()) {
            execute(connection, """
                    INSERT INTO audit_event
                        (id, organization_id, actor_user_id, actor_role, action, entity_type)
                    VALUES (?, ?, ?, 'OWNER', 'organization.created', 'organization')
                    """, auditId, orgA, userId);

            assertThatThrownBy(() -> execute(connection,
                    "UPDATE audit_event SET action = 'tampered' WHERE id = ?", auditId))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("append-only");
        }
    }

    @Test
    void rlsEscondeOutraOrganizacaoEImpedeEscritaCruzada() throws SQLException {
        try (var connection = appConnection()) {
            setContext(connection, orgA, userId);
            assertThat(queryOrganizationIds(connection)).containsExactly(orgA);

            assertThatThrownBy(() -> execute(connection, """
                    INSERT INTO memberships (organization_id, user_id, role)
                    VALUES (?, ?, 'WORKER')
                    """, orgB, userId))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("row-level security");
        }
    }

    @Test
    void contextoDeTenantEmFaltaFalhaFechado() throws SQLException {
        try (var connection = appConnection()) {
            assertThat(queryOrganizationIds(connection)).isEmpty();
        }
    }

    @Test
    void transactionManagerDefineEIsolaOContextoPostgresql() {
        var transaction = new TransactionTemplate(transactionManager);

        try (var ignored = TenantContext.open(orgA, userId)) {
            var currentOrg = transaction.execute(status ->
                    jdbcTemplate.queryForObject("select app.current_org_id()", UUID.class));
            assertThat(currentOrg).isEqualTo(orgA);
        }

        var currentOrgWithoutContext = transaction.execute(status ->
                jdbcTemplate.queryForObject("select app.current_org_id()", UUID.class));
        assertThat(currentOrgWithoutContext).isNull();
    }

    private static Connection ownerConnection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static Connection appConnection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), "andaime_app", "andaime_app_local");
    }

    private static void setContext(Connection connection, UUID organizationId, UUID currentUserId)
            throws SQLException {
        execute(connection, "SELECT set_config('app.org_id', ?, false)", organizationId.toString());
        execute(connection, "SELECT set_config('app.user_id', ?, false)", currentUserId.toString());
    }

    private static List<UUID> queryOrganizationIds(Connection connection) throws SQLException {
        try (var statement = connection.prepareStatement("SELECT id FROM organizations ORDER BY id")) {
            var result = statement.executeQuery();
            var ids = new java.util.ArrayList<UUID>();
            while (result.next()) {
                ids.add(result.getObject(1, UUID.class));
            }
            return ids;
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
}
