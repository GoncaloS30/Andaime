package pt.andaime.reporting.application;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.reporting.ReportingProjection;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.TenantContext;

@Service
class ReportingProjectionService implements ReportingProjection {

    private final JdbcTemplate jdbcTemplate;

    ReportingProjectionService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    @Transactional
    public void approvedTime(ApprovedTime fact) {
        requireMinutes(fact);
        jdbcTemplate.update("""
                INSERT INTO reporting_time_facts
                    (organization_id, source_entry_id, employee_id, site_id, team_id, work_date,
                     clock_in, clock_out, worked_min, normal_min, overtime_min, activity_code, approved_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (organization_id, source_entry_id) DO UPDATE SET
                    employee_id = excluded.employee_id, site_id = excluded.site_id, team_id = excluded.team_id,
                    work_date = excluded.work_date, clock_in = excluded.clock_in, clock_out = excluded.clock_out,
                    worked_min = excluded.worked_min, normal_min = excluded.normal_min,
                    overtime_min = excluded.overtime_min, activity_code = excluded.activity_code,
                    approved_at = excluded.approved_at, updated_at = now()
                """, organizationId(), fact.sourceEntryId(), fact.employeeId(), fact.siteId(), fact.teamId(),
                fact.workDate(), fact.clockIn(), fact.clockOut(), fact.workedMin(), fact.normalMin(),
                fact.overtimeMin(), required(fact.activityCode(), "Código de atividade em falta."),
                java.sql.Timestamp.from(fact.approvedAt()));
    }

    @Override
    @Transactional
    public void removeApprovedTime(UUID sourceEntryId) {
        jdbcTemplate.update("DELETE FROM reporting_time_facts WHERE source_entry_id = ?", sourceEntryId);
    }

    @Override
    @Transactional
    public void documentState(DocumentState fact) {
        jdbcTemplate.update("""
                INSERT INTO reporting_document_facts
                    (organization_id, source_document_id, owner_kind, owner_id, document_type_name,
                     country, status, expires_on)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (organization_id, source_document_id) DO UPDATE SET
                    owner_kind = excluded.owner_kind, owner_id = excluded.owner_id,
                    document_type_name = excluded.document_type_name, country = excluded.country,
                    status = excluded.status, expires_on = excluded.expires_on, updated_at = now()
                """, organizationId(), fact.sourceDocumentId(), required(fact.ownerKind(), "Titular em falta."),
                fact.ownerId(), required(fact.documentTypeName(), "Tipo de documento em falta."),
                fact.country(), required(fact.status(), "Estado documental em falta."), fact.expiresOn());
    }

    @Override
    @Transactional
    public void removeDocument(UUID sourceDocumentId) {
        jdbcTemplate.update("DELETE FROM reporting_document_facts WHERE source_document_id = ?", sourceDocumentId);
    }

    private static void requireMinutes(ApprovedTime fact) {
        if (fact == null || fact.workedMin() < 0 || fact.normalMin() < 0 || fact.overtimeMin() < 0
                || fact.normalMin() + fact.overtimeMin() != fact.workedMin()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-reporting-fact", "Os minutos aprovados são inválidos.");
        }
    }

    private static String required(String value, String detail) {
        if (value == null || value.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-reporting-fact", detail);
        return value.strip();
    }

    private static UUID organizationId() {
        return TenantContext.organizationId().orElseThrow();
    }
}
