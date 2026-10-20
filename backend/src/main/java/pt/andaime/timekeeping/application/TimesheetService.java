package pt.andaime.timekeeping.application;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.notifications.Notifier;
import pt.andaime.reporting.ReportingProjection;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.timekeeping.application.TimekeepingViews.DayView;
import pt.andaime.timekeeping.application.TimekeepingViews.EntryView;
import pt.andaime.timekeeping.application.TimekeepingViews.PlannedView;
import pt.andaime.timekeeping.application.TimekeepingViews.TimesheetDetail;
import pt.andaime.timekeeping.application.TimekeepingViews.TimesheetSummary;
import pt.andaime.timekeeping.domain.HoursCalculator;

/**
 * Folha semanal por trabalhador: DRAFT → SUBMITTED → APPROVED, ou REJECTED para corrigir e voltar a submeter.
 * Aprovar fecha a semana na base de dados; reabrir é um ato do gestor, com motivo e auditado.
 * A folha é criada quando é usada pela primeira vez (não há linhas vazias por trabalhador e semana).
 */
@Service
public class TimesheetService {

    private final TimekeepingRepository repository;
    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final ReportingProjection reporting;
    private final Notifier notifier;
    private final Clock clock;

    public TimesheetService(TimekeepingRepository repository, JdbcTemplate jdbcTemplate, AuditLog auditLog,
            ReportingProjection reporting, Notifier notifier, Clock clock) {
        this.repository = repository;
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.reporting = reporting;
        this.notifier = notifier;
        this.clock = clock;
    }

    private record Sheet(String status, int version, String note, OffsetDateTime submittedAt, OffsetDateTime decidedAt,
            String decidedBy) {
    }

    @Transactional(readOnly = true)
    public List<TimesheetSummary> week(LocalDate weekStart, String status) {
        var monday = monday(weekStart);
        var sunday = monday.plusDays(6);
        var scope = TimekeepingRepository.scope(monday, sunday);
        var entries = repository.entries(monday, sunday, scope, null, null);
        var planned = repository.planned(monday, sunday, scope, null);
        var employees = new LinkedHashSet<UUID>();
        var names = new HashMap<UUID, String>();
        entries.forEach(e -> {
            employees.add(e.employeeId());
            names.put(e.employeeId(), e.employeeName());
        });
        planned.forEach(p -> {
            employees.add(p.employeeId());
            names.put(p.employeeId(), p.employeeName());
        });
        var sheets = sheets(monday);
        var teams = teams(monday);
        var policy = repository.policy(monday).policy();
        var result = new ArrayList<TimesheetSummary>();
        // Agrupado uma vez por trabalhador (com centenas de pessoas, filtrar a lista inteira por cada uma é quadrático).
        var entriesBy = entries.stream().collect(java.util.stream.Collectors.groupingBy(EntryView::employeeId));
        var plannedBy = planned.stream().collect(java.util.stream.Collectors.groupingBy(PlannedView::employeeId));
        for (var employee : employees) {
            var mine = entriesBy.getOrDefault(employee, List.of());
            var plan = plannedBy.getOrDefault(employee, List.of());
            var summary = summary(employee, names.get(employee), teams.get(employee), monday, mine, plan,
                    sheets.get(employee), policy);
            if (status == null || status.isBlank() || summary.status().equals(status)) {
                result.add(summary);
            }
        }
        result.sort((a, b) -> a.employeeName().compareToIgnoreCase(b.employeeName()));
        return result;
    }

    @Transactional(readOnly = true)
    public TimesheetDetail detail(UUID employeeId, LocalDate weekStart) {
        var monday = monday(weekStart);
        var sunday = monday.plusDays(6);
        requireScope(employeeId, monday);
        var scope = TimekeepingRepository.scope(monday, sunday);
        var entries = repository.entries(monday, sunday, scope, employeeId, null);
        var planned = repository.planned(monday, sunday, scope, employeeId);
        var policy = repository.policy(monday).policy();
        var sheet = sheets(monday).get(employeeId);
        var summary = summary(employeeId, repository.employeeName(employeeId), teams(monday).get(employeeId), monday, entries, planned,
                sheet, policy);
        var week = HoursCalculator.week(monday, closed(entries), policy);
        var days = new ArrayList<DayView>();
        for (var day : week.days()) {
            days.add(new DayView(day.date(),
                    planned.stream().filter(p -> p.date().equals(day.date())).mapToInt(PlannedView::plannedMin).sum(),
                    day.workedMin(), day.normalMin(), day.overtimeMin(), day.restDay(),
                    entries.stream().filter(e -> e.workDate().equals(day.date())).toList()));
        }
        return new TimesheetDetail(summary, days, sheet == null ? null : sheet.note(),
                sheet == null || sheet.submittedAt() == null ? null : sheet.submittedAt().toInstant(),
                sheet == null || sheet.decidedAt() == null ? null : sheet.decidedAt().toInstant(),
                sheet == null ? null : sheet.decidedBy());
    }

    /**
     * Transições: {@code submit} (o próprio, o encarregado ou o gestor), {@code approve}, {@code reject} (com nota) e
     * {@code reopen} (com motivo), estas três só gestor.
     */
    @Transactional
    public TimesheetDetail transition(UUID employeeId, LocalDate weekStart, String action, String note, Integer version) {
        var monday = monday(weekStart);
        var role = OrgRole.current();
        var self = TenantContext.employeeId().map(employeeId::equals).orElse(false);
        switch (action) {
            case "submit" -> {
                if (!self && !role.atLeast(OrgRole.FOREMAN)) {
                    throw forbidden();
                }
            }
            case "approve", "reject", "reopen" -> OrgRole.require(OrgRole.MANAGER);
            default -> throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "Ação desconhecida.");
        }
        requireScope(employeeId, monday);
        jdbcTemplate.update("""
                INSERT INTO timesheets (organization_id, employee_id, week_start) VALUES (?, ?, ?) ON CONFLICT DO NOTHING
                """, TenantContext.organizationId().orElseThrow(), employeeId, monday);
        var current = jdbcTemplate.queryForObject("""
                SELECT status, version FROM timesheets WHERE employee_id = ? AND week_start = ? FOR UPDATE
                """, (resultSet, rowNumber) -> new Object[] {resultSet.getString(1), resultSet.getInt(2)}, employeeId, monday);
        var status = (String) current[0];
        var currentVersion = (Integer) current[1];
        if (version != null && version.intValue() != currentVersion) {
            throw new ApiException(HttpStatus.CONFLICT, "stale", "A folha foi alterada entretanto. Recarregue e tente de novo.");
        }
        var open = jdbcTemplate.queryForObject("""
                SELECT count(*) FROM time_entries WHERE employee_id = ? AND status = 'OPEN' AND work_date BETWEEN ? AND ?
                """, Integer.class, employeeId, monday, monday.plusDays(6));
        var userId = TenantContext.userId().orElseThrow();
        String next;
        switch (action) {
            case "submit" -> {
                expect(status, "submeter", "DRAFT", "REJECTED");
                noOpenEntries(open);
                next = "SUBMITTED";
                jdbcTemplate.update("""
                        UPDATE timesheets SET status = 'SUBMITTED', submitted_at = now(), submitted_by_user_id = ?, version = version + 1
                        WHERE employee_id = ? AND week_start = ?
                        """, userId, employeeId, monday);
            }
            case "approve" -> {
                expect(status, "aprovar", "DRAFT", "SUBMITTED");
                noOpenEntries(open);
                next = "APPROVED";
                jdbcTemplate.update("""
                        UPDATE timesheets SET status = 'APPROVED', decided_at = now(), decided_by_user_id = ?, decision_note = ?,
                               version = version + 1
                        WHERE employee_id = ? AND week_start = ?
                        """, userId, blank(note), employeeId, monday);
            }
            case "reject" -> {
                expect(status, "devolver", "SUBMITTED");
                requireNote(note, "Indique o que há a corrigir.");
                next = "REJECTED";
                jdbcTemplate.update("""
                        UPDATE timesheets SET status = 'REJECTED', decided_at = now(), decided_by_user_id = ?, decision_note = ?,
                               version = version + 1
                        WHERE employee_id = ? AND week_start = ?
                        """, userId, note.strip(), employeeId, monday);
                var reason = note.strip();
                notifier.notify(notifier.userOfEmployee(employeeId), "timesheet.rejected", "Folha de horas devolvida",
                        "Semana de " + monday.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")) + ": "
                                + (reason.length() > 900 ? reason.substring(0, 900) + "…" : reason), "/app", null);
            }
            default -> {
                expect(status, "reabrir", "APPROVED");
                requireNote(note, "Indique o motivo para reabrir a semana.");
                next = "DRAFT";
                jdbcTemplate.update("""
                        UPDATE timesheets SET status = 'DRAFT', decided_at = NULL, decided_by_user_id = NULL, decision_note = ?,
                               version = version + 1
                        WHERE employee_id = ? AND week_start = ?
                        """, note.strip(), employeeId, monday);
            }
        }
        var id = jdbcTemplate.queryForObject("SELECT id FROM timesheets WHERE employee_id = ? AND week_start = ?", UUID.class,
                employeeId, monday);
        var changes = new LinkedHashMap<String, Object>();
        changes.put("status", Map.of("from", status, "to", next));
        changes.put("weekStart", monday.toString());
        if (note != null && !note.isBlank()) {
            changes.put("note", note.strip());
        }
        auditLog.record("timesheet." + action, "timesheet", id, changes);
        if (next.equals("APPROVED")) {
            projectApproved(employeeId, monday);
        } else if (status.equals("APPROVED")) {
            removeProjection(employeeId, monday);
        }
        return detail(employeeId, monday);
    }

    // --- relatórios: só horas aprovadas -------------------------------------------------------------

    /**
     * Publica nos relatórios os registos da semana aprovada, com a divisão normal/extra da política laboral: em cada
     * dia, as horas normais vão para os primeiros registos (por ordem de entrada) e o resto é extra.
     */
    private void projectApproved(UUID employeeId, LocalDate monday) {
        var self = new TimekeepingRepository.Scope("entry.employee_id = ?", List.of(employeeId));
        var entries = repository.entries(monday, monday.plusDays(6), self, employeeId, null).stream()
                .filter(e -> e.status().equals("CLOSED")).sorted(java.util.Comparator.comparing(EntryView::startedAt)).toList();
        var week = HoursCalculator.week(monday, closed(entries), repository.policy(monday).policy());
        var normalLeft = new HashMap<LocalDate, Integer>();
        week.days().forEach(day -> normalLeft.put(day.date(), day.normalMin()));
        var code = jdbcTemplate.query("SELECT normal_code FROM labor_policies WHERE country IS NULL AND effective_during @> ?::date",
                (resultSet, rowNumber) -> resultSet.getString(1), monday.plusDays(6)).stream().findFirst().orElse("800");
        var approvedAt = clock.instant();
        for (var entry : entries) {
            var worked = entry.workedMin() == null ? 0 : entry.workedMin();
            var normal = Math.min(worked, normalLeft.getOrDefault(entry.workDate(), 0));
            normalLeft.merge(entry.workDate(), -normal, Integer::sum);
            var team = jdbcTemplate.query("""
                    SELECT team_id FROM team_members WHERE employee_id = ? AND joined_on <= ? AND (left_on IS NULL OR left_on >= ?)
                    ORDER BY joined_on DESC LIMIT 1
                    """, (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), employeeId, entry.workDate(), entry.workDate())
                    .stream().findFirst().orElse(null);
            reporting.approvedTime(new ReportingProjection.ApprovedTime(entry.id(), employeeId, entry.siteId(), team,
                    entry.workDate(), entry.startLocal(), entry.endLocal(), worked, normal, worked - normal, code, approvedAt));
        }
    }

    private void removeProjection(UUID employeeId, LocalDate monday) {
        jdbcTemplate.queryForList("SELECT id FROM time_entries WHERE employee_id = ? AND work_date BETWEEN ? AND ?", UUID.class,
                employeeId, monday, monday.plusDays(6)).forEach(reporting::removeApprovedTime);
    }

    // --- auxiliares ----------------------------------------------------------------------------------

    private TimesheetSummary summary(UUID employeeId, String name, String team, LocalDate monday, List<EntryView> entries,
            List<PlannedView> planned, Sheet sheet, HoursCalculator.Policy policy) {
        var week = HoursCalculator.week(monday, closed(entries), policy);
        var plannedDays = planned.stream().map(PlannedView::date).distinct().toList();
        var today = TenantContext.today(clock);
        var missing = (int) plannedDays.stream()
                .filter(d -> d.isBefore(today) && entries.stream().noneMatch(e -> e.workDate().equals(d))).count();
        return new TimesheetSummary(employeeId, name, team, monday, sheet == null ? "DRAFT" : sheet.status(),
                planned.stream().mapToInt(PlannedView::plannedMin).sum(), week.workedMin(), week.normalMin(), week.overtimeMin(),
                (int) entries.stream().filter(e -> e.status().equals("OPEN")).count(), missing, sheet == null ? 0 : sheet.version());
    }

    private static List<HoursCalculator.Entry> closed(List<EntryView> entries) {
        return entries.stream().filter(e -> e.status().equals("CLOSED"))
                .map(e -> new HoursCalculator.Entry(e.workDate(), e.startedAt(), e.endedAt(), ZoneId.of(e.timezone()), e.breakMin()))
                .toList();
    }

    private Map<UUID, Sheet> sheets(LocalDate monday) {
        var map = new HashMap<UUID, Sheet>();
        jdbcTemplate.query("""
                SELECT sheet.employee_id, sheet.status, sheet.version, sheet.decision_note, sheet.submitted_at, sheet.decided_at,
                       decider.display_name
                FROM timesheets sheet LEFT JOIN users decider ON decider.id = sheet.decided_by_user_id
                WHERE sheet.week_start = ?
                """, resultSet -> {
            map.put(resultSet.getObject(1, UUID.class), new Sheet(resultSet.getString(2), resultSet.getInt(3), resultSet.getString(4),
                    resultSet.getObject(5, OffsetDateTime.class), resultSet.getObject(6, OffsetDateTime.class), resultSet.getString(7)));
        }, monday);
        return map;
    }

    /** Equipa de cada trabalhador nessa semana (a da segunda-feira, ou a primeira em que entrou). */
    private Map<UUID, String> teams(LocalDate monday) {
        var map = new HashMap<UUID, String>();
        jdbcTemplate.query("""
                SELECT member.employee_id, team.name FROM team_members member
                JOIN teams team ON team.organization_id = member.organization_id AND team.id = member.team_id
                WHERE member.joined_on <= ? AND (member.left_on IS NULL OR member.left_on >= ?)
                ORDER BY member.joined_on
                """, resultSet -> {
            map.putIfAbsent(resultSet.getObject(1, UUID.class), resultSet.getString(2));
        }, monday.plusDays(6), monday);
        return map;
    }

    private void requireScope(UUID employeeId, LocalDate monday) {
        if (employeeId == null || !repository.inScope(employeeId, monday, monday.plusDays(6))) {
            throw TimekeepingRepository.notFound();
        }
    }

    private static LocalDate monday(LocalDate date) {
        if (date == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a semana.");
        }
        return date.with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    private static void expect(String status, String verb, String... allowed) {
        for (var candidate : allowed) {
            if (candidate.equals(status)) {
                return;
            }
        }
        throw new ApiException(HttpStatus.CONFLICT, "invalid-transition", "Não é possível " + verb + " uma folha "
                + switch (status) {
                    case "SUBMITTED" -> "já submetida";
                    case "APPROVED" -> "já aprovada";
                    case "REJECTED" -> "devolvida";
                    default -> "por submeter";
                } + ".").with("status", status);
    }

    private static void noOpenEntries(int open) {
        if (open > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "open-entries",
                    "Há uma entrada sem saída nesta semana. Registe ou corrija a saída primeiro.");
        }
    }

    private static void requireNote(String note, String message) {
        if (note == null || note.strip().length() < 3) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                    .with("errors", List.of(Map.of("field", "note", "code", "invalid", "message", message)));
        }
    }

    private static String blank(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static ApiException forbidden() {
        return new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Não tem permissão para esta operação.");
    }
}
