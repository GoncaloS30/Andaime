package pt.andaime.reporting;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/**
 * Porta pública do módulo reporting. F4/F5 projetam aqui apenas factos finais; repetir o mesmo
 * source id é idempotente e uma anulação remove a projeção.
 */
public interface ReportingProjection {

    void approvedTime(ApprovedTime fact);

    void removeApprovedTime(UUID sourceEntryId);

    void documentState(DocumentState fact);

    void removeDocument(UUID sourceDocumentId);

    record ApprovedTime(
            UUID sourceEntryId,
            UUID employeeId,
            UUID siteId,
            UUID teamId,
            LocalDate workDate,
            LocalTime clockIn,
            LocalTime clockOut,
            int workedMin,
            int normalMin,
            int overtimeMin,
            String activityCode,
            Instant approvedAt) {
    }

    record DocumentState(
            UUID sourceDocumentId,
            String ownerKind,
            UUID ownerId,
            String documentTypeName,
            String country,
            String status,
            LocalDate expiresOn) {
    }
}
