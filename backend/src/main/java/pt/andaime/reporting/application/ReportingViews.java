package pt.andaime.reporting.application;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Contratos dos read models de reporting. Durações são sempre inteiros em minutos. */
public final class ReportingViews {

    private ReportingViews() {
    }

    public enum WeeklyMapTemplate {
        EQUIPA("equipa"), OBRA("obra"), HORAS("horas"), ERP("erp");

        private final String value;

        WeeklyMapTemplate(String value) {
            this.value = value;
        }

        public String value() {
            return value;
        }

        public static WeeklyMapTemplate parse(String value) {
            for (var template : values()) {
                if (template.value.equalsIgnoreCase(value)) {
                    return template;
                }
            }
            throw new IllegalArgumentException("template");
        }
    }

    public enum HoursGroupBy {
        EMPLOYEE("employee"), TEAM("team"), SITE("site"), WEEK("week");

        private final String value;

        HoursGroupBy(String value) {
            this.value = value;
        }

        public static HoursGroupBy parse(String value) {
            for (var group : values()) if (group.value.equalsIgnoreCase(value)) return group;
            throw new IllegalArgumentException("groupBy");
        }

        public String value() {
            return value;
        }
    }

    public record WeeklyMapFilter(UUID teamId, UUID siteId, UUID employeeId, UUID clientId) {
    }

    public record WeeklyMap(
            LocalDate weekStart,
            int weekNumber,
            List<LocalDate> days,
            List<WeeklyMapGroup> groups,
            WeeklyMapTotals totals) {
    }

    public record WeeklyMapGroup(
            String key,
            UUID teamId,
            String teamName,
            String teamColor,
            UUID siteId,
            String siteCode,
            String siteName,
            String clientName,
            String city,
            String country,
            List<LocalDate> dates,
            LocalTime start,
            LocalTime end,
            String schedule,
            List<String> vehicles,
            String foremanName,
            List<WeeklyMapWorker> workers,
            int totalMin,
            List<String> notes) {
    }

    public record WeeklyMapWorker(
            UUID employeeId,
            String name,
            String number,
            String category,
            boolean foreman,
            Map<LocalDate, Integer> minutesByDate,
            int totalMin) {
    }

    public record WeeklyMapTotals(int plannedMin, int employees, int sites, int vehicles) {
    }

    public record PlanningOverview(
            LocalDate from,
            LocalDate to,
            int plannedMin,
            int assignments,
            int employees,
            int teams,
            int sites,
            int vehicles) {
    }

    public record TeamDistribution(
            UUID teamId,
            String teamName,
            String teamColor,
            int plannedMin,
            int employees,
            int sites,
            int assignmentDays) {
    }

    public record PlannedActualReport(
            LocalDate from,
            LocalDate to,
            boolean includesTimeEntries,
            List<SitePlannedActual> rows,
            PlannedActualTotals totals) {
    }

    public record SitePlannedActual(
            UUID siteId,
            String siteCode,
            String siteName,
            String country,
            Integer hourLimitMin,
            int actualMin,
            int approvedMin,
            int plannedMin,
            Integer remainingMin,
            Integer projectedPercent) {
    }

    public record PlannedActualTotals(int actualMin, int approvedMin, int plannedMin) {
    }

    public record VehicleReport(
            UUID vehicleId,
            String plate,
            String make,
            String model,
            String status,
            int seats,
            int plannedMin,
            int employees,
            int sites,
            int assignmentDays,
            int peakRiders) {
    }

    /** Linha aprovada, já calculada segundo a política laboral aplicável. */
    public record ActualTimeRow(
            UUID employeeId,
            String employeeNumber,
            String employeeName,
            UUID teamId,
            String teamName,
            UUID siteId,
            String siteCode,
            String siteName,
            String erpOrder,
            LocalDate date,
            LocalTime clockIn,
            LocalTime clockOut,
            int workedMin,
            int normalMin,
            int overtimeMin,
            String activityCode,
            String status) {
    }

    public record WeeklyActual(
            LocalDate weekStart,
            int weekNumber,
            List<ActualTimeRow> rows,
            ActualTotals totals) {
    }

    public record ActualTotals(int workedMin, int normalMin, int overtimeMin, int employees, int sites) {
    }

    public record HoursReport(
            LocalDate from,
            LocalDate to,
            String groupBy,
            List<HoursGroup> groups,
            ActualTotals totals) {
    }

    public record HoursGroup(
            String key,
            String label,
            int workedMin,
            int normalMin,
            int overtimeMin,
            int entries,
            int employees,
            int sites) {
    }

    public record DocumentReport(int total, List<DocumentStatusCount> statuses) {
    }

    public record DocumentStatusCount(String status, int documents) {
    }

    public record ExportRequest(
            LocalDate week,
            String template,
            UUID teamId,
            UUID siteId,
            UUID employeeId,
            UUID clientId) {
    }

    public record ExportParameters(
            LocalDate week,
            UUID teamId,
            UUID siteId,
            UUID employeeId,
            UUID clientId) {

        WeeklyMapFilter filter() {
            return new WeeklyMapFilter(teamId, siteId, employeeId, clientId);
        }
    }

    public record ExportJob(
            UUID id,
            String kind,
            String template,
            ExportParameters parameters,
            String status,
            String filename,
            String contentType,
            Long contentSize,
            String errorCode,
            String errorDetail,
            Instant createdAt,
            Instant startedAt,
            Instant finishedAt,
            Instant expiresAt) {
    }

    record ClaimedExport(UUID id, UUID organizationId, UUID userId) {
    }

    record ExportPayload(WeeklyMapTemplate template, ExportParameters parameters) {
    }

    record PlannedAssignment(
            UUID employeeId,
            String employeeNumber,
            String employeeName,
            String category,
            UUID teamId,
            String teamName,
            String teamColor,
            UUID teamForemanId,
            UUID siteId,
            String siteCode,
            String siteName,
            String clientName,
            String city,
            String country,
            LocalDate date,
            LocalTime start,
            LocalTime end,
            int plannedMin,
            boolean foreman,
            String vehiclePlate,
            String note) {
    }
}
