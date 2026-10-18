package pt.andaime.shared.config;

import javax.sql.DataSource;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.transaction.PlatformTransactionManager;

import jakarta.persistence.EntityManagerFactory;
import pt.andaime.shared.tenant.TenantAwareJpaTransactionManager;

@Configuration(proxyBeanMethods = false)
class TransactionConfig {

    @Bean
    @Primary
    PlatformTransactionManager transactionManager(
            EntityManagerFactory entityManagerFactory,
            DataSource dataSource) {
        return new TenantAwareJpaTransactionManager(entityManagerFactory, dataSource);
    }
}
