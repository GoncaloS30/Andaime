package pt.andaime.shared.tenant;

import java.util.UUID;

import javax.sql.DataSource;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionException;

import jakarta.persistence.EntityManagerFactory;

/**
 * Repõe o tenant e o utilizador em cada transação PostgreSQL. Os valores são
 * locais à transação, pelo que nunca regressam ao pool Hikari.
 */
public final class TenantAwareJpaTransactionManager extends JpaTransactionManager {

    private final JdbcTemplate jdbcTemplate;

    public TenantAwareJpaTransactionManager(EntityManagerFactory entityManagerFactory, DataSource dataSource) {
        super(entityManagerFactory);
        setDataSource(dataSource);
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) throws TransactionException {
        super.doBegin(transaction, definition);
        var organizationId = TenantContext.organizationId().map(UUID::toString).orElse("");
        var userId = TenantContext.userId().map(UUID::toString).orElse("");
        jdbcTemplate.queryForObject(
                "select set_config('app.org_id', ?, true), set_config('app.user_id', ?, true)",
                (resultSet, rowNumber) -> null,
                organizationId,
                userId);
    }
}
