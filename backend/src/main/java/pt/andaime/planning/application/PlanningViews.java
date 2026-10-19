package pt.andaime.planning.application;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import pt.andaime.planning.domain.ConflictEngine.Conflict;

/** Contratos da API de planeamento. Horas locais da obra; durações em minutos. */
public final class PlanningViews {

    private PlanningViews() {
    }

    public record AssignmentView(
            UUID id,
            UUID employeeId,
            UUID siteId,
            LocalDate date,
            LocalTime start,
            LocalTime end,
            int breakMin,
            int plannedMin,
            UUID teamId,
            UUID vehicleId,
            boolean foreman,
            String note,
            UUID batchId,
            int version) {
    }

    public record Board(LocalDate from, LocalDate to, List<AssignmentView> assignments, List<Conflict> conflicts,
            boolean readOnly) {
    }

    /**
     * Comando de planeamento. Um só formato para todas as operações; os campos usados dependem do tipo:
     * <ul>
     * <li>{@code ASSIGN}: employeeId, siteId, date, start, end, breakMin?, vehicleId?, foreman?, note?</li>
     * <li>{@code SCHEDULE}: employeeIds, siteId, from, to, weekdays, start, end, breakMin?, vehicleId?,
     * foremanEmployeeId?, note?</li>
     * <li>{@code UPDATE}: items[0] (assignmentId, version) e os campos a mudar (employeeId, siteId, date, start, end,
     * breakMin, vehicleId + clearVehicle, foreman, note)</li>
     * <li>{@code BULK_UPDATE}: items e start/end/vehicleId/clearVehicle/siteId</li>
     * <li>{@code DUPLICATE}: items[0] e employeeId/date/siteId de destino</li>
     * <li>{@code DELETE}: items</li>
     * <li>{@code TRANSFER}: employeeId, siteId, from, to, start, end, weekdays?</li>
     * <li>{@code COPY_WEEK}: sourceWeek, targetWeek, teamIds?</li>
     * </ul>
     */
    public record Command(
            String kind,
            List<Item> items,
            UUID employeeId,
            List<UUID> employeeIds,
            UUID siteId,
            LocalDate date,
            LocalDate from,
            LocalDate to,
            List<Integer> weekdays,
            LocalTime start,
            LocalTime end,
            Integer breakMin,
            UUID vehicleId,
            Boolean clearVehicle,
            Boolean foreman,
            UUID foremanEmployeeId,
            String note,
            LocalDate sourceWeek,
            LocalDate targetWeek,
            List<UUID> teamIds,
            List<String> acknowledgedConflictIds) {
    }

    public record Item(UUID assignmentId, Integer version) {
    }

    public record Skipped(UUID employeeId, LocalDate date, String reason) {
    }

    public record CommandResult(
            boolean preview,
            UUID changeSetId,
            String label,
            int created,
            int updated,
            int deleted,
            List<UUID> createdIds,
            List<Skipped> skipped,
            List<Conflict> newConflicts) {
    }

    public record ChangeSetView(UUID id, String kind, String label, Instant createdAt, boolean reverted, boolean canRevert) {
    }
}
