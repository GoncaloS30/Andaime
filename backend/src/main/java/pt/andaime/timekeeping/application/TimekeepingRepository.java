package pt.andaime.timekeeping.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.timekeeping.application.TimekeepingViews.EntryView;
import pt.andaime.timekeeping.application.TimekeepingViews.PlannedView;
import pt.andaime.timekeeping.domain.HoursCalculator;
import pt.andaime.timekeeping.domain.HoursCalculator.Policy;

/** SQL partilhado do registo de horas: registos, planeado, política laboral e âmbito por papel. */
@Component
class TimekeepingRepository {

    static final String ENTRY_SELECT = """
            SELECT entry.*, employee.full_name AS employee_name, site.code AS site_code,
                   (SELECT count(*) FROM time_entry_revisions revision WHERE revision.time_entry_id = entry.id) AS revisions
            FROM time_entries entry
            JOIN employees employee ON employee.organization_id = entry.organization_id AND employee.id = entry.employee_id
            JOIN sites site ON site.organization_id = entry.organization_id AND site.id = entry.site_id
            """;

    record Scope(String sql, List<Object> params) {
    }

    record PolicyRow(Policy policy, int autoBreakAfterMin, int autoBreakMin) {
    }

    private final JdbcTemplate jdbcTemplate;

    TimekeepingRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    static EntryView entry(ResultSet resultSet, int rowNumber) throws SQLException {
        var zone = ZoneId.of(resultSet.getString("timezone"));
        var started = resultSet.getObject("started_at", OffsetDateTime.class).toInstant();
        var endedAt = resultSet.getObject("ended_at", OffsetDateTime.class);
        var ended = endedAt == null ? null : endedAt.toInstant();
        return new EntryView(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("employee_id", UUID.class),
                resultSet.getString("employee_name"),
                resultSet.getObject("site_id", UUID.class),
                resultSet.getString("site_code"),
                resultSet.getObject("assignment_id", UUID.class),
                resultSet.getObject("work_date", LocalDate.class),
                zone.getId(),
                started,
                ended,
                started.atZone(zone).toLocalTime(),
                ended == null ? null : ended.atZone(zone).toLocalTime(),
                resultSet.getObject("break_started_at") != null,
                resultSet.getInt("break_min"),
                (Integer) resultSet.getObject("worked_min"),
                resultSet.getString("status"),
                resultSet.getString("source"),
                resultSet.getString("note"),
                resultSet.getInt("revisions"),
                resultSet.getInt("version"));
    }

    Optional<EntryView> find(UUID id) {
        return jdbcTemplate.query(ENTRY_SELECT + " WHERE entry.id = ?", TimekeepingRepository::entry, id).stream().findFirst();
    }

    Optional<EntryView> openEntry(UUID employeeId) {
        return jdbcTemplate.query(ENTRY_SELECT + " WHERE entry.employee_id = ? AND entry.status = 'OPEN'",
                TimekeepingRepository::entry, employeeId).stream().findFirst();
    }

    List<EntryView> entries(LocalDate from, LocalDate to, Scope scope, UUID employeeId, UUID siteId) {
        var sql = new StringBuilder(ENTRY_SELECT).append(" WHERE entry.work_date BETWEEN ? AND ? AND entry.status <> 'CANCELLED' AND ")
                .append(scope.sql());
        var params = new ArrayList<Object>(List.of(from, to));
        params.addAll(scope.params());
        if (employeeId != null) {
            sql.append(" AND entry.employee_id = ?");
            params.add(employeeId);
        }
        if (siteId != null) {
            sql.append(" AND entry.site_id = ?");
            params.add(siteId);
        }
        sql.append(" ORDER BY entry.work_date, entry.started_at LIMIT 5000");
        return jdbcTemplate.query(sql.toString(), TimekeepingRepository::entry, params.toArray());
    }

    List<PlannedView> planned(LocalDate from, LocalDate to, Scope scope, UUID employeeId) {
        var sql = new StringBuilder("""
                SELECT assignment.id, assignment.employee_id, person.full_name, assignment.site_id, site.code, site.name,
                       assignment.work_date, assignment.start_time, assignment.end_time, assignment.planned_min,
                       EXISTS (SELECT 1 FROM time_entries te WHERE te.assignment_id = assignment.id AND te.status <> 'CANCELLED') AS confirmed
                FROM assignments assignment
                JOIN employees person ON person.organization_id = assignment.organization_id AND person.id = assignment.employee_id
                JOIN sites site ON site.organization_id = assignment.organization_id AND site.id = assignment.site_id
                WHERE assignment.work_date BETWEEN ? AND ? AND\s""").append(scope.sql().replace("entry.employee_id", "assignment.employee_id"));
        var params = new ArrayList<Object>(List.of(from, to));
        params.addAll(scope.params());
        if (employeeId != null) {
            sql.append(" AND assignment.employee_id = ?");
            params.add(employeeId);
        }
        sql.append(" ORDER BY assignment.work_date, assignment.start_time");
        return jdbcTemplate.query(sql.toString(), (resultSet, rowNumber) -> new PlannedView(
                resultSet.getObject(1, UUID.class), resultSet.getObject(2, UUID.class), resultSet.getString(3),
                resultSet.getObject(4, UUID.class), resultSet.getString(5), resultSet.getString(6),
                resultSet.getObject(7, LocalDate.class), resultSet.getObject(8, LocalTime.class),
                resultSet.getObject(9, LocalTime.class), resultSet.getInt(10), resultSet.getBoolean(11)), params.toArray());
    }

    /** Política laboral em vigor na data (por omissão 8 h/dia, 40 h/semana, pausa de 60 min acima de 6 h). */
    PolicyRow policy(LocalDate monday) {
        var holidays = new HashSet<LocalDate>(jdbcTemplate.query("""
                SELECT holiday_date FROM org_holidays WHERE holiday_date BETWEEN ? AND ?
                UNION
                SELECT holiday.holiday_date FROM public_holidays holiday
                JOIN organizations organization ON organization.id = app.current_org_id() AND organization.country = holiday.country
                WHERE holiday.region = '' AND holiday.holiday_date BETWEEN ? AND ?
                """, (resultSet, rowNumber) -> resultSet.getObject(1, LocalDate.class), monday, monday.plusDays(6), monday,
                monday.plusDays(6)));
        return jdbcTemplate.query("""
                SELECT daily_normal_min, weekly_normal_min, rest_days, overnight_attribution, auto_break_after_min, auto_break_min
                FROM labor_policies WHERE country IS NULL AND effective_during @> ?::date
                """, (resultSet, rowNumber) -> {
            Set<Integer> rest = new HashSet<>();
            for (var day : (Object[]) resultSet.getArray("rest_days").getArray()) {
                rest.add(((Number) day).intValue());
            }
            return new PolicyRow(new Policy(resultSet.getInt(1), resultSet.getInt(2), rest, holidays, resultSet.getString(4)),
                    resultSet.getObject(5) == null ? Integer.MAX_VALUE : resultSet.getInt(5),
                    resultSet.getObject(6) == null ? 0 : resultSet.getInt(6));
        }, monday).stream().findFirst()
                .orElse(new PolicyRow(new Policy(480, 2400, Set.of(6, 7), holidays, "START_DAY"), 360, 60));
    }

    /** Pausa a aplicar: a registada ou, sem nenhuma, a automática da política quando o período a justifica. */
    int breakFor(Instant start, Instant end, int recordedBreak, LocalDate date) {
        if (recordedBreak > 0) {
            return recordedBreak;
        }
        var policy = policy(date);
        var minutes = java.time.Duration.between(start, end).toMinutes();
        return minutes > policy.autoBreakAfterMin() ? policy.autoBreakMin() : 0;
    }

    String siteZone(UUID siteId) {
        return jdbcTemplate.query("SELECT timezone FROM sites WHERE id = ? AND archived_at IS NULL",
                (resultSet, rowNumber) -> resultSet.getString(1), siteId).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST, "invalid-site", "A obra não existe ou está arquivada."));
    }

    boolean employeeExists(UUID employeeId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM employees WHERE id = ? AND archived_at IS NULL)", Boolean.class, employeeId));
    }

    String employeeName(UUID employeeId) {
        return jdbcTemplate.query("SELECT full_name FROM employees WHERE id = ?", (resultSet, rowNumber) -> resultSet.getString(1),
                employeeId).stream().findFirst().orElseThrow(TimekeepingRepository::notFound);
    }

    HoursCalculator.Week week(UUID employeeId, LocalDate monday) {
        var entries = jdbcTemplate.query("""
                SELECT work_date, started_at, ended_at, timezone, break_min FROM time_entries
                WHERE employee_id = ? AND status = 'CLOSED' AND work_date BETWEEN ? AND ?
                """, (resultSet, rowNumber) -> new HoursCalculator.Entry(resultSet.getObject(1, LocalDate.class),
                resultSet.getObject(2, OffsetDateTime.class).toInstant(), resultSet.getObject(3, OffsetDateTime.class).toInstant(),
                ZoneId.of(resultSet.getString(4)), resultSet.getInt(5)), employeeId, monday, monday.plusDays(6));
        return HoursCalculator.week(monday, entries, policy(monday).policy());
    }

    // --- âmbito ---------------------------------------------------------------------------------

    /**
     * Condição sobre {@code entry.employee_id}: gestor vê todos; encarregado ele próprio e quem esteve nas equipas que
     * lidera durante o período; trabalhador só ele próprio.
     */
    static Scope scope(LocalDate from, LocalDate to) {
        var role = OrgRole.current();
        if (role.atLeast(OrgRole.MANAGER)) {
            return new Scope("TRUE", List.of());
        }
        var me = TenantContext.employeeId().orElse(null);
        if (me == null) {
            return new Scope("FALSE", List.of());
        }
        if (role == OrgRole.WORKER) {
            return new Scope("entry.employee_id = ?", List.of(me));
        }
        return new Scope("(entry.employee_id = ? OR entry.employee_id IN ("
                + "SELECT member.employee_id FROM team_members member "
                + "JOIN teams led ON led.organization_id = member.organization_id AND led.id = member.team_id "
                + "WHERE led.foreman_employee_id = ? AND member.joined_on <= ? AND (member.left_on IS NULL OR member.left_on >= ?)))",
                List.of(me, me, to, from));
    }

    /** O utilizador pode ver/gerir as horas deste trabalhador no período? */
    boolean inScope(UUID employeeId, LocalDate from, LocalDate to) {
        var scope = scope(from, to);
        var params = new ArrayList<Object>(List.of(employeeId));
        params.addAll(scope.params());
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM (SELECT ?::uuid AS employee_id) entry WHERE " + scope.sql() + ")",
                Boolean.class, params.toArray()));
    }

    static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "O registo não foi encontrado.");
    }
}
