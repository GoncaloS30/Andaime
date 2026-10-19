package pt.andaime.shared.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Tarefas agendadas (ex.: alertas de validade de documentos). Desligadas nos testes, que as chamam diretamente. */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "andaime.jobs.enabled", havingValue = "true", matchIfMissing = true)
class SchedulingConfig {
}
