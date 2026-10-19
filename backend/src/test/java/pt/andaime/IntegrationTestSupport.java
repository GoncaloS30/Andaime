package pt.andaime;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

import pt.andaime.identity.application.IdentityMailGateway;
import pt.andaime.organization.application.OrganizationMailGateway;

/**
 * Base dos testes de integração: um único PostgreSQL real para toda a execução e um
 * contexto Spring partilhado (mesma configuração em todas as classes = cache do Spring).
 * Os gateways de email são substituídos para capturar tokens; o SMTP real é exercitado
 * pelos testes E2E com o Mailpit.
 */
@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
abstract class IntegrationTestSupport {

    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine")
            .withDatabaseName("andaime")
            .withUsername("postgres")
            .withPassword("postgres_local")
            .withInitScript("postgres-init.sql");

    /** Armazenamento S3 real (SeaweedFS) para os documentos. */
    @SuppressWarnings("resource")
    static final GenericContainer<?> OBJECT_STORE = new GenericContainer<>("chrislusf/seaweedfs:4.48")
            .withCommand("server", "-s3", "-dir=/data", "-s3.config=/etc/seaweedfs/s3.json")
            .withCopyFileToContainer(MountableFile.forClasspathResource("objectstore-s3.json"), "/etc/seaweedfs/s3.json")
            .withExposedPorts(8333)
            .waitingFor(Wait.forLogMessage(".*Start Seaweed S3 API Server.*", 1).withStartupTimeout(java.time.Duration.ofMinutes(2)));

    static {
        POSTGRES.start();
        OBJECT_STORE.start();
    }

    @MockitoBean
    IdentityMailGateway mailGateway;

    @MockitoBean
    OrganizationMailGateway organizationMailGateway;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", () -> "andaime_app");
        registry.add("spring.datasource.password", () -> "andaime_app_local");
        registry.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user", () -> "andaime_owner");
        registry.add("spring.flyway.password", () -> "andaime_owner_local");
        registry.add("andaime.storage.endpoint", () -> "http://" + OBJECT_STORE.getHost() + ":" + OBJECT_STORE.getMappedPort(8333));
    }

    static Connection ownerConnection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    static Connection appConnection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), "andaime_app", "andaime_app_local");
    }
}
