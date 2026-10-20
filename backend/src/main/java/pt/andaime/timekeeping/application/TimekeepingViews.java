package pt.andaime.timekeeping.application;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/** Contratos da API de horas. Instantes em UTC; horas locais no fuso da obra; durações em minutos. */
public final class TimekeepingViews {

    private TimekeepingViews() {
    }

    public record EntryView(
            UUID id,
            UUID employeeId,
            String employeeName,
            UUID siteId,
            String siteCode,
            UUID assignmentId,
            LocalDate workDate,
            String timezone,
            Instant startedAt,
            Instant endedAt,
            LocalTime startLocal,
            LocalTime endLocal,
            boolean onBreak,
            int breakMin,
            Integer workedMin,
            String status,
            String source,
            String note,
            int revisions,
            int version) {
    }

    public record PlannedView(UUID assignmentId, UUID employeeId, String employeeName, UUID siteId, String siteCode,
            String siteName, LocalDate date, LocalTime start, LocalTime end, int plannedMin, boolean confirmed) {
    }

    public record ClockStatus(UUID employeeId, EntryView open, List<PlannedView> today, int weekWorkedMin,
            int weekOvertimeMin) {
    }

    /**
     * @param offline o toque foi feito sem rede e chega agora da fila do telemóvel: conta a hora do dispositivo
     *                ({@code deviceTime}), dentro de limites (até 72 h atrás, nunca no futuro, nunca antes do último toque).
     */
    public record ClockRequest(String idempotencyKey, Instant deviceTime, UUID siteId, Boolean offline) {
    }

    public record DayView(LocalDate date, int plannedMin, int workedMin, int normalMin, int overtimeMin, boolean restDay,
            List<EntryView> entries) {
    }

    public record TimesheetSummary(
            UUID employeeId,
            String employeeName,
            String teamName,
            LocalDate weekStart,
            String status,
            int plannedMin,
            int workedMin,
            int normalMin,
            int overtimeMin,
            int openEntries,
            int missingDays,
            int version) {
    }

    public record TimesheetDetail(
            TimesheetSummary summary,
            List<DayView> days,
            String decisionNote,
            Instant submittedAt,
            Instant decidedAt,
            String decidedBy) {
    }

    public record ManualEntry(UUID employeeId, UUID siteId, LocalDate date, LocalTime start, LocalTime end,
            Integer breakMin, String note, String reason) {
    }

    public record Correction(UUID siteId, LocalDate date, LocalTime start, LocalTime end, Integer breakMin, String note,
            String reason, Integer version) {
    }

    public record RevisionView(UUID id, String before, String after, String reason, String userName, Instant createdAt) {
    }

    public record ConfirmResult(int created, List<UUID> skippedAssignmentIds) {
    }
}
