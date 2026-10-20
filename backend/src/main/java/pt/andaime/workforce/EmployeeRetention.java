package pt.andaime.workforce;

import java.time.OffsetDateTime;

import org.springframework.stereotype.Component;

import pt.andaime.workforce.application.EmployeeService;

/** Contrato público do módulo para a conservação de dados: anonimização automática de ex-trabalhadores. */
@Component
public class EmployeeRetention {

    private final EmployeeService employees;

    EmployeeRetention(EmployeeService employees) {
        this.employees = employees;
    }

    /**
     * Anonimiza os trabalhadores arquivados antes de {@code cutoff} na organização corrente, na transação corrente.
     * Cada um fica auditado como {@code employee.anonymized} com {@code {"automatic": true}}. Devolve quantos.
     */
    public int anonymizeArchivedBefore(OffsetDateTime cutoff) {
        return employees.anonymizeArchivedBefore(cutoff);
    }
}
