package pt.andaime.reporting.application;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.reporting.application.ReportingViews.PlannedAssignment;
import pt.andaime.reporting.application.ReportingViews.PlanningOverview;
import pt.andaime.reporting.application.ReportingViews.TeamDistribution;
import pt.andaime.reporting.application.ReportingViews.PlannedActualReport;
import pt.andaime.reporting.application.ReportingViews.PlannedActualTotals;
import pt.andaime.reporting.application.ReportingViews.ActualTotals;
import pt.andaime.reporting.application.ReportingViews.DocumentReport;
import pt.andaime.reporting.application.ReportingViews.HoursGroupBy;
import pt.andaime.reporting.application.ReportingViews.HoursReport;
import pt.andaime.reporting.application.ReportingViews.WeeklyActual;
import pt.andaime.reporting.application.ReportingViews.VehicleReport;
import pt.andaime.reporting.application.ReportingViews.WeeklyMap;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapFilter;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapGroup;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapTotals;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapWorker;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;

@Service
public class ReportingService {

    /** Acima deste volume o cliente deve usar a futura fila de exportações assíncronas. */
    static final int MAX_SYNCHRONOUS_ASSIGNMENTS = 20_000;
    static final int MAX_ASYNCHRONOUS_ASSIGNMENTS = 200_000;

    private final ReportingRepository repository;
    private final HrBookRepository policies;

    public ReportingService(ReportingRepository repository, HrBookRepository policies) {
        this.repository = repository;
        this.policies = policies;
    }

    @Transactional(readOnly = true)
    public WeeklyMap weeklyMap(LocalDate requestedWeek, WeeklyMapFilter filter) {
        return weeklyMap(requestedWeek, filter, MAX_SYNCHRONOUS_ASSIGNMENTS,
                "O mapa excede o limite de 20 000 atribuições. Restrinja os filtros ou use a exportação assíncrona.");
    }

    @Transactional(readOnly = true)
    public WeeklyMap weeklyMapForExport(LocalDate requestedWeek, WeeklyMapFilter filter) {
        return weeklyMap(requestedWeek, filter, MAX_ASYNCHRONOUS_ASSIGNMENTS,
                "O mapa excede o limite assíncrono de 200 000 atribuições. Restrinja os filtros.");
    }

    @Transactional(readOnly = true)
    public WeeklyActual weeklyActual(LocalDate requestedWeek, WeeklyMapFilter filter) {
        return weeklyActual(requestedWeek, filter, MAX_SYNCHRONOUS_ASSIGNMENTS,
                "O mapa excede o limite de 20 000 registos aprovados. Use a exportação assíncrona.");
    }

    @Transactional(readOnly = true)
    public WeeklyActual weeklyActualForExport(LocalDate requestedWeek, WeeklyMapFilter filter) {
        return weeklyActual(requestedWeek, filter, MAX_ASYNCHRONOUS_ASSIGNMENTS,
                "O mapa excede o limite de 200 000 registos aprovados. Restrinja os filtros.");
    }

    /**
     * Código de atividade ERP de cada linha pelos escalões de horas extra da política laboral (a mesma regra do livro do
     * RH): normal sem horas extra na linha; senão o escalão em que cai o total de extra da pessoa nesse dia. A projeção
     * guardava o código normal em todas as linhas, mesmo nas de horas extra.
     */
    private List<ReportingViews.ActualTimeRow> withActivityCodes(List<ReportingViews.ActualTimeRow> rows, LocalDate effectiveOn) {
        var table = policies.policy(effectiveOn).activities();
        var codes = table.codes();
        var dayOvertime = new java.util.HashMap<String, Integer>();
        rows.forEach(row -> dayOvertime.merge(row.employeeId() + "|" + row.date(), row.overtimeMin(), Integer::sum));
        return rows.stream()
                .map(row -> row.withActivityCode(codes.get(table.indexFor(row.overtimeMin(),
                        dayOvertime.getOrDefault(row.employeeId() + "|" + row.date(), 0))).code()))
                .toList();
    }

    private WeeklyActual weeklyActual(LocalDate requestedWeek, WeeklyMapFilter filter, int maximum, String detail) {
        OrgRole.require(OrgRole.MANAGER);
        var monday = requestedWeek.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        var rows = repository.actualRows(monday, monday.plusDays(6), filter, maximum + 1);
        if (rows.size() > maximum) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "report-too-large",
                    detail);
        }
        rows = withActivityCodes(rows, monday.plusDays(6));
        var employeeIds = rows.stream().map(ReportingViews.ActualTimeRow::employeeId).collect(java.util.stream.Collectors.toSet());
        var siteIds = rows.stream().map(ReportingViews.ActualTimeRow::siteId).collect(java.util.stream.Collectors.toSet());
        return new WeeklyActual(monday, monday.get(WeekFields.ISO.weekOfWeekBasedYear()), rows,
                new ActualTotals(rows.stream().mapToInt(ReportingViews.ActualTimeRow::workedMin).sum(),
                        rows.stream().mapToInt(ReportingViews.ActualTimeRow::normalMin).sum(),
                        rows.stream().mapToInt(ReportingViews.ActualTimeRow::overtimeMin).sum(),
                        employeeIds.size(), siteIds.size()));
    }

    private WeeklyMap weeklyMap(LocalDate requestedWeek, WeeklyMapFilter filter, int maximum, String tooLargeDetail) {
        OrgRole.require(OrgRole.MANAGER);
        var monday = requestedWeek.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        var rows = repository.weeklyAssignments(monday, monday.plusDays(6), filter, maximum + 1);
        if (rows.size() > maximum) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "report-too-large",
                    tooLargeDetail);
        }
        return assemble(monday, rows);
    }

    @Transactional(readOnly = true)
    public String organizationName() {
        OrgRole.require(OrgRole.MANAGER);
        return repository.organizationName();
    }

    @Transactional(readOnly = true)
    public PlanningOverview planningOverview(LocalDate from, LocalDate to) {
        requireRange(from, to);
        return repository.planningOverview(from, to);
    }

    @Transactional(readOnly = true)
    public List<TeamDistribution> teamDistribution(LocalDate from, LocalDate to) {
        requireRange(from, to);
        return repository.teamDistribution(from, to);
    }

    @Transactional(readOnly = true)
    public List<VehicleReport> vehicles(LocalDate from, LocalDate to) {
        requireRange(from, to);
        return repository.vehicles(from, to);
    }

    @Transactional(readOnly = true)
    public PlannedActualReport plannedActual(LocalDate from, LocalDate to) {
        requireRange(from, to);
        var rows = repository.plannedActual(from, to);
        return new PlannedActualReport(from, to, true, rows, new PlannedActualTotals(
                rows.stream().mapToInt(ReportingViews.SitePlannedActual::actualMin).sum(),
                rows.stream().mapToInt(ReportingViews.SitePlannedActual::approvedMin).sum(),
                rows.stream().mapToInt(ReportingViews.SitePlannedActual::plannedMin).sum()));
    }

    @Transactional(readOnly = true)
    public ReportingViews.HoursMatrix hoursMatrix(String rows, String cols, LocalDate from, LocalDate to,
            java.util.UUID siteId, java.util.UUID employeeId) {
        requireRange(from, to);
        ReportingViews.MatrixDimension rowDimension;
        ReportingViews.MatrixDimension colDimension;
        try {
            rowDimension = ReportingViews.MatrixDimension.parse(rows);
            colDimension = ReportingViews.MatrixDimension.parse(cols);
        } catch (RuntimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "rows e cols devem ser employee, site, day, week ou month.");
        }
        if (rowDimension == colDimension || (rowDimension != ReportingViews.MatrixDimension.EMPLOYEE
                && rowDimension != ReportingViews.MatrixDimension.SITE)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "As linhas são pessoas ou obras, e diferentes das colunas.");
        }
        var cells = repository.hoursMatrix(from, to, rowDimension, colDimension, siteId, employeeId);
        var columnLabels = new java.util.TreeMap<String, String>();
        var columnTotals = new java.util.HashMap<String, Integer>();
        var rowLabels = new java.util.LinkedHashMap<String, String>();
        var rowCells = new java.util.HashMap<String, java.util.Map<String, Integer>>();
        var rowTotals = new java.util.HashMap<String, Integer>();
        var rowApproved = new java.util.HashMap<String, Integer>();
        int total = 0;
        int approved = 0;
        for (var cell : cells) {
            columnLabels.putIfAbsent(cell.colKey(), cell.colLabel());
            columnTotals.merge(cell.colKey(), cell.workedMin(), Integer::sum);
            rowLabels.putIfAbsent(cell.rowKey(), cell.rowLabel());
            rowCells.computeIfAbsent(cell.rowKey(), k -> new java.util.TreeMap<>()).merge(cell.colKey(), cell.workedMin(), Integer::sum);
            rowTotals.merge(cell.rowKey(), cell.workedMin(), Integer::sum);
            rowApproved.merge(cell.rowKey(), cell.approvedMin(), Integer::sum);
            total += cell.workedMin();
            approved += cell.approvedMin();
        }
        // Colunas de tempo pela data (a chave ISO já ordena); de pessoa ou obra, pelo nome.
        var columnKeys = new java.util.ArrayList<>(columnLabels.keySet());
        if (colDimension == ReportingViews.MatrixDimension.EMPLOYEE || colDimension == ReportingViews.MatrixDimension.SITE) {
            columnKeys.sort(java.util.Comparator.comparing(columnLabels::get));
        }
        var columnViews = columnKeys.stream()
                .map(key -> new ReportingViews.MatrixColumn(key, columnLabels.get(key), columnTotals.getOrDefault(key, 0))).toList();
        var rowViews = rowLabels.keySet().stream()
                .map(key -> new ReportingViews.MatrixRow(key, rowLabels.get(key), java.util.Map.copyOf(rowCells.get(key)),
                        rowTotals.get(key), rowApproved.get(key)))
                .sorted(java.util.Comparator.comparingInt(ReportingViews.MatrixRow::totalMin).reversed()
                        .thenComparing(ReportingViews.MatrixRow::label))
                .toList();
        return new ReportingViews.HoursMatrix(from, to, rowDimension.value(), colDimension.value(), columnViews, rowViews,
                total, approved);
    }

    @Transactional(readOnly = true)
    public HoursReport hours(String requestedGroup, LocalDate from, LocalDate to) {
        requireRange(from, to);
        HoursGroupBy groupBy;
        try {
            groupBy = HoursGroupBy.parse(requestedGroup);
        } catch (RuntimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation",
                    "groupBy deve ser employee, team, site ou week.");
        }
        var groups = repository.hours(from, to, groupBy);
        return new HoursReport(from, to, groupBy.value(), groups, repository.actualTotals(from, to));
    }

    @Transactional(readOnly = true)
    public DocumentReport documents() {
        OrgRole.require(OrgRole.MANAGER);
        var statuses = repository.documents();
        return new DocumentReport(statuses.stream().mapToInt(ReportingViews.DocumentStatusCount::documents).sum(), statuses);
    }

    private void requireRange(LocalDate from, LocalDate to) {
        OrgRole.require(OrgRole.MANAGER);
        if (from == null || to == null || to.isBefore(from)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "O intervalo de datas é inválido.");
        }
        if (to.isAfter(from.plusYears(1))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "range-too-large",
                    "O intervalo máximo para relatórios é de um ano.");
        }
    }

    private WeeklyMap assemble(LocalDate monday, List<PlannedAssignment> rows) {
        var grouped = new LinkedHashMap<GroupKey, List<PlannedAssignment>>();
        for (var row : rows) {
            grouped.computeIfAbsent(new GroupKey(row.teamId(), row.siteId()), ignored -> new ArrayList<>()).add(row);
        }

        var groups = grouped.entrySet().stream()
                .map(entry -> group(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparing(WeeklyMapGroup::teamName, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(WeeklyMapGroup::siteCode, String.CASE_INSENSITIVE_ORDER))
                .toList();
        var employeeIds = new LinkedHashSet<UUID>();
        var siteIds = new LinkedHashSet<UUID>();
        var vehicles = new LinkedHashSet<String>();
        var total = 0;
        for (var row : rows) {
            employeeIds.add(row.employeeId());
            siteIds.add(row.siteId());
            if (row.vehiclePlate() != null) vehicles.add(row.vehiclePlate());
            total += row.plannedMin();
        }
        var days = java.util.stream.IntStream.range(0, 7).mapToObj(monday::plusDays).toList();
        return new WeeklyMap(monday, monday.get(WeekFields.ISO.weekOfWeekBasedYear()), days, groups,
                new WeeklyMapTotals(total, employeeIds.size(), siteIds.size(), vehicles.size()));
    }

    private WeeklyMapGroup group(GroupKey key, List<PlannedAssignment> rows) {
        var first = rows.getFirst();
        var dates = rows.stream().map(PlannedAssignment::date).distinct().sorted().toList();
        var schedules = rows.stream().map(row -> schedule(row.start(), row.end())).distinct().toList();
        var vehicles = rows.stream().map(PlannedAssignment::vehiclePlate).filter(Objects::nonNull).distinct().sorted().toList();
        var notes = rows.stream().map(PlannedAssignment::note).filter(Objects::nonNull).map(String::strip)
                .filter(note -> !note.isEmpty()).distinct().toList();

        var byEmployee = new LinkedHashMap<UUID, List<PlannedAssignment>>();
        rows.forEach(row -> byEmployee.computeIfAbsent(row.employeeId(), ignored -> new ArrayList<>()).add(row));
        var workers = byEmployee.values().stream().map(this::worker)
                .sorted(Comparator.comparing(WeeklyMapWorker::foreman).reversed()
                        .thenComparing(WeeklyMapWorker::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
        var foremanName = workers.stream().filter(WeeklyMapWorker::foreman).map(WeeklyMapWorker::name).findFirst().orElse(null);
        return new WeeklyMapGroup(
                (key.teamId() == null ? "sem-equipa" : key.teamId()) + "|" + key.siteId(), key.teamId(),
                first.teamName() == null ? "Sem equipa" : first.teamName(),
                first.teamColor() == null ? "#9aa09b" : first.teamColor(), key.siteId(), first.siteCode(),
                first.siteName(), value(first.clientName()), value(first.city()), value(first.country()), dates,
                schedules.size() == 1 ? first.start() : null, schedules.size() == 1 ? first.end() : null,
                schedules.size() == 1 ? schedules.getFirst() : "Horário variável", vehicles, foremanName, workers,
                rows.stream().mapToInt(PlannedAssignment::plannedMin).sum(), notes);
    }

    private WeeklyMapWorker worker(List<PlannedAssignment> rows) {
        var first = rows.getFirst();
        var minutes = new LinkedHashMap<LocalDate, Integer>();
        rows.forEach(row -> minutes.merge(row.date(), row.plannedMin(), Integer::sum));
        var foreman = rows.stream().anyMatch(PlannedAssignment::foreman)
                || Objects.equals(first.employeeId(), first.teamForemanId());
        return new WeeklyMapWorker(first.employeeId(), first.employeeName(), first.employeeNumber(), first.category(),
                foreman, minutes, rows.stream().mapToInt(PlannedAssignment::plannedMin).sum());
    }

    private static String schedule(java.time.LocalTime start, java.time.LocalTime end) {
        var format = DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT);
        return start.format(format) + "–" + end.format(format);
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }

    private record GroupKey(UUID teamId, UUID siteId) {
    }
}
