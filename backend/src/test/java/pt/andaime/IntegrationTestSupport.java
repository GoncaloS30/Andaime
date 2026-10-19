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
import org.testcontainers.postgresql.PostgreSQLContainer;

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

    static {
        POSTGRES.start();
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
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
    }

    static Connection ownerConnection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    static Connection appConnection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), "andaime_app", "andaime_app_local");
    }
}
