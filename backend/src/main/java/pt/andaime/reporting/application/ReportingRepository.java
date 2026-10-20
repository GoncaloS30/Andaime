package pt.andaime.reporting.application;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import pt.andaime.reporting.application.ReportingViews.PlannedAssignment;
import pt.andaime.reporting.application.ReportingViews.ActualTimeRow;
import pt.andaime.reporting.application.ReportingViews.ActualTotals;
import pt.andaime.reporting.application.ReportingViews.DocumentStatusCount;
import pt.andaime.reporting.application.ReportingViews.HoursGroup;
import pt.andaime.reporting.application.ReportingViews.HoursGroupBy;
import pt.andaime.reporting.application.ReportingViews.PlanningOverview;
import pt.andaime.reporting.application.ReportingViews.TeamDistribution;
import pt.andaime.reporting.application.ReportingViews.SitePlannedActual;
import pt.andaime.reporting.application.ReportingViews.VehicleReport;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapFilter;
import pt.andaime.shared.tenant.TenantContext;

/** Consultas denormalizadas, somente de leitura e protegidas pelo RLS da organização corrente. */
@Component
class ReportingRepository {

    private final JdbcTemplate jdbcTemplate;

    ReportingRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    String organizationName() {
        return jdbcTemplate.queryForObject("SELECT name FROM organizations WHERE id = ?", String.class,
                TenantContext.organizationId().orElseThrow());
    }

    List<PlannedAssignment> weeklyAssignments(LocalDate from, LocalDate to, WeeklyMapFilter filter, int limit) {
        var sql = new StringBuilder("""
                SELECT assignment.employee_id, employee.number employee_number, employee.full_name employee_name,
                       employee.category, assignment.team_id, team.name team_name, team.color team_color,
                       team.foreman_employee_id team_foreman_id, assignment.site_id, site.code site_code,
                       site.name site_name, client.name client_name, site.city, site.country, assignment.work_date,
                       assignment.start_time, assignment.end_time, assignment.planned_min, assignment.is_foreman,
                       vehicle.plate vehicle_plate, assignment.note
                FROM assignments assignment
                JOIN employees employee ON employee.organization_id = assignment.organization_id
                                       AND employee.id = assignment.employee_id
                JOIN sites site ON site.organization_id = assignment.organization_id AND site.id = assignment.site_id
                LEFT JOIN teams team ON team.organization_id = assignment.organization_id AND team.id = assignment.team_id
                LEFT JOIN clients client ON client.organization_id = site.organization_id AND client.id = site.client_id
                LEFT JOIN vehicles vehicle ON vehicle.organization_id = assignment.organization_id
                                          AND vehicle.id = assignment.vehicle_id
                WHERE assignment.work_date BETWEEN ? AND ?
                """);
        var params = new ArrayList<Object>(List.of(from, to));
        appendFilter(sql, params, "assignment.team_id", filter.teamId());
        appendFilter(sql, params, "assignment.site_id", filter.siteId());
        appendFilter(sql, params, "assignment.employee_id", filter.employeeId());
        appendFilter(sql, params, "site.client_id", filter.clientId());
        sql.append(" ORDER BY team.name NULLS LAST, site.code, assignment.work_date, employee.full_name, assignment.start_time LIMIT ?");
        params.add(limit);
        return jdbcTemplate.query(sql.toString(), (resultSet, rowNumber) -> new PlannedAssignment(
                resultSet.getObject("employee_id", UUID.class), resultSet.getString("employee_number"),
                resultSet.getString("employee_name"), resultSet.getString("category"),
                resultSet.getObject("team_id", UUID.class), resultSet.getString("team_name"),
                resultSet.getString("team_color"), resultSet.getObject("team_foreman_id", UUID.class),
                resultSet.getObject("site_id", UUID.class), resultSet.getString("site_code"),
                resultSet.getString("site_name"), resultSet.getString("client_name"), resultSet.getString("city"),
                resultSet.getString("country"), resultSet.getObject("work_date", LocalDate.class),
                resultSet.getObject("start_time", LocalTime.class), resultSet.getObject("end_time", LocalTime.class),
                resultSet.getInt("planned_min"), resultSet.getBoolean("is_foreman"),
                resultSet.getString("vehicle_plate"), resultSet.getString("note")), params.toArray());
    }

    List<ActualTimeRow> actualRows(LocalDate from, LocalDate to, WeeklyMapFilter filter, int limit) {
        var sql = new StringBuilder("""
                SELECT fact.employee_id, employee.number employee_number, employee.full_name employee_name,
                       fact.team_id, team.name team_name, fact.site_id, site.code site_code, site.name site_name,
                       site.erp_order, fact.work_date, fact.clock_in, fact.clock_out, fact.worked_min,
                       fact.normal_min, fact.overtime_min, fact.activity_code
                FROM reporting_time_facts fact
                JOIN employees employee ON employee.organization_id = fact.organization_id AND employee.id = fact.employee_id
                JOIN sites site ON site.organization_id = fact.organization_id AND site.id = fact.site_id
                LEFT JOIN teams team ON team.organization_id = fact.organization_id AND team.id = fact.team_id
                WHERE fact.work_date BETWEEN ? AND ?
                """);
        var params = new ArrayList<Object>(List.of(from, to));
        appendFilter(sql, params, "fact.team_id", filter.teamId());
        appendFilter(sql, params, "fact.site_id", filter.siteId());
        appendFilter(sql, params, "fact.employee_id", filter.employeeId());
        appendFilter(sql, params, "site.client_id", filter.clientId());
        sql.append(" ORDER BY employee.full_name, fact.work_date, fact.clock_in NULLS LAST, site.code LIMIT ?");
        params.add(limit);
        return jdbcTemplate.query(sql.toString(), (resultSet, rowNumber) -> new ActualTimeRow(
                resultSet.getObject("employee_id", UUID.class), resultSet.getString("employee_number"),
                resultSet.getString("employee_name"), resultSet.getObject("team_id", UUID.class),
                resultSet.getString("team_name"), resultSet.getObject("site_id", UUID.class),
                resultSet.getString("site_code"), resultSet.getString("site_name"), resultSet.getString("erp_order"),
                resultSet.getObject("work_date", LocalDate.class), resultSet.getObject("clock_in", LocalTime.class),
                resultSet.getObject("clock_out", LocalTime.class), resultSet.getInt("worked_min"),
                resultSet.getInt("normal_min"), resultSet.getInt("overtime_min"),
                resultSet.getString("activity_code"), "APPROVED"), params.toArray());
    }

    List<HoursGroup> hours(LocalDate from, LocalDate to, HoursGroupBy groupBy) {
        var expressions = switch (groupBy) {
            case EMPLOYEE -> new String[] {"fact.employee_id::text", "employee.full_name"};
            case TEAM -> new String[] {"coalesce(fact.team_id::text, 'none')", "coalesce(team.name, 'Sem equipa')"};
            case SITE -> new String[] {"fact.site_id::text", "site.code || ' — ' || site.name"};
            case WEEK -> new String[] {
                    "to_char(date_trunc('week', fact.work_date), 'YYYY-MM-DD')",
                    "'Semana ' || to_char(fact.work_date, 'IYYY-IW')"};
        };
        var sql = """
                SELECT %s group_key, %s group_label, sum(fact.worked_min)::int worked_min,
                       sum(fact.normal_min)::int normal_min, sum(fact.overtime_min)::int overtime_min,
                       count(*)::int entries, count(DISTINCT fact.employee_id)::int employees,
                       count(DISTINCT fact.site_id)::int sites
                FROM reporting_time_facts fact
                JOIN employees employee ON employee.organization_id = fact.organization_id AND employee.id = fact.employee_id
                JOIN sites site ON site.organization_id = fact.organization_id AND site.id = fact.site_id
                LEFT JOIN teams team ON team.organization_id = fact.organization_id AND team.id = fact.team_id
                WHERE fact.work_date BETWEEN ? AND ?
                GROUP BY 1, 2 ORDER BY 3 DESC, 2
                """.formatted(expressions[0], expressions[1]);
        return jdbcTemplate.query(sql, (resultSet, rowNumber) -> new HoursGroup(
                resultSet.getString("group_key"), resultSet.getString("group_label"),
                resultSet.getInt("worked_min"), resultSet.getInt("normal_min"),
                resultSet.getInt("overtime_min"), resultSet.getInt("entries"),
                resultSet.getInt("employees"), resultSet.getInt("sites")), from, to);
    }

    record MatrixCell(String rowKey, String rowLabel, String colKey, String colLabel, int workedMin, int approvedMin) {
    }

    /** Registos fechados agrupados pelas duas dimensões; as aprovadas vêm das semanas com folha aprovada. */
    List<MatrixCell> hoursMatrix(LocalDate from, LocalDate to, ReportingViews.MatrixDimension rows,
            ReportingViews.MatrixDimension cols, java.util.UUID siteId, java.util.UUID employeeId) {
        var sql = """
                SELECT %s row_key, %s row_label, %s col_key, %s col_label,
                       sum(entry.worked_min)::int worked_min,
                       sum(CASE WHEN sheet.status = 'APPROVED' THEN entry.worked_min ELSE 0 END)::int approved_min
                FROM time_entries entry
                JOIN employees employee ON employee.organization_id = entry.organization_id AND employee.id = entry.employee_id
                JOIN sites site ON site.organization_id = entry.organization_id AND site.id = entry.site_id
                LEFT JOIN timesheets sheet ON sheet.organization_id = entry.organization_id AND sheet.employee_id = entry.employee_id
                 AND sheet.week_start = entry.work_date - (extract(isodow FROM entry.work_date)::int - 1)
                WHERE entry.status = 'CLOSED' AND entry.worked_min IS NOT NULL AND entry.work_date BETWEEN ? AND ?
                  AND (?::uuid IS NULL OR entry.site_id = ?::uuid) AND (?::uuid IS NULL OR entry.employee_id = ?::uuid)
                GROUP BY 1, 2, 3, 4
                """.formatted(rows.keySql, rows.labelSql, cols.keySql, cols.labelSql);
        return jdbcTemplate.query(sql, (rs, n) -> new MatrixCell(rs.getString("row_key"), rs.getString("row_label"),
                rs.getString("col_key"), rs.getString("col_label"), rs.getInt("worked_min"), rs.getInt("approved_min")),
                from, to, siteId, siteId, employeeId, employeeId);
    }

    ActualTotals actualTotals(LocalDate from, LocalDate to) {
        return jdbcTemplate.queryForObject("""
                SELECT coalesce(sum(worked_min), 0)::int worked_min,
                       coalesce(sum(normal_min), 0)::int normal_min,
                       coalesce(sum(overtime_min), 0)::int overtime_min,
                       count(DISTINCT employee_id)::int employees,
                       count(DISTINCT site_id)::int sites
                FROM reporting_time_facts WHERE work_date BETWEEN ? AND ?
                """, (resultSet, rowNumber) -> new ActualTotals(resultSet.getInt("worked_min"),
                resultSet.getInt("normal_min"), resultSet.getInt("overtime_min"),
                resultSet.getInt("employees"), resultSet.getInt("sites")), from, to);
    }

    List<DocumentStatusCount> documents() {
        return jdbcTemplate.query("""
                SELECT status, count(*)::int documents FROM reporting_document_facts
                GROUP BY status ORDER BY status
                """, (resultSet, rowNumber) -> new DocumentStatusCount(
                resultSet.getString("status"), resultSet.getInt("documents")));
    }

    PlanningOverview planningOverview(LocalDate from, LocalDate to) {
        return jdbcTemplate.queryForObject("""
                SELECT coalesce(sum(planned_min), 0)::int planned_min,
                       count(*)::int assignments,
                       count(DISTINCT employee_id)::int employees,
                       count(DISTINCT team_id)::int teams,
                       count(DISTINCT site_id)::int sites,
                       count(DISTINCT vehicle_id)::int vehicles
                FROM assignments WHERE work_date BETWEEN ? AND ?
                """, (resultSet, rowNumber) -> new PlanningOverview(from, to,
                resultSet.getInt("planned_min"), resultSet.getInt("assignments"),
                resultSet.getInt("employees"), resultSet.getInt("teams"), resultSet.getInt("sites"),
                resultSet.getInt("vehicles")), from, to);
    }

    List<TeamDistribution> teamDistribution(LocalDate from, LocalDate to) {
        return jdbcTemplate.query("""
                SELECT assignment.team_id, coalesce(team.name, 'Sem equipa') team_name,
                       coalesce(team.color, '#9aa09b') team_color,
                       sum(assignment.planned_min)::int planned_min,
                       count(DISTINCT assignment.employee_id)::int employees,
                       count(DISTINCT assignment.site_id)::int sites,
                       count(DISTINCT assignment.work_date)::int assignment_days
                FROM assignments assignment
                LEFT JOIN teams team ON team.organization_id = assignment.organization_id
                                    AND team.id = assignment.team_id
                WHERE assignment.work_date BETWEEN ? AND ?
                GROUP BY assignment.team_id, team.name, team.color
                ORDER BY planned_min DESC, team_name
                """, (resultSet, rowNumber) -> new TeamDistribution(
                resultSet.getObject("team_id", UUID.class), resultSet.getString("team_name"),
                resultSet.getString("team_color"), resultSet.getInt("planned_min"),
                resultSet.getInt("employees"), resultSet.getInt("sites"), resultSet.getInt("assignment_days")),
                from, to);
    }

    List<VehicleReport> vehicles(LocalDate from, LocalDate to) {
        return jdbcTemplate.query("""
                WITH riders AS (
                    SELECT vehicle_id, work_date, site_id, count(DISTINCT employee_id)::int riders
                    FROM assignments
                    WHERE work_date BETWEEN ? AND ? AND vehicle_id IS NOT NULL
                    GROUP BY vehicle_id, work_date, site_id
                ), peaks AS (
                    SELECT vehicle_id, max(riders)::int peak_riders FROM riders GROUP BY vehicle_id
                )
                SELECT vehicle.id, vehicle.plate, vehicle.make, vehicle.model, vehicle.status, vehicle.seats,
                       coalesce(sum(assignment.planned_min), 0)::int planned_min,
                       count(DISTINCT assignment.employee_id)::int employees,
                       count(DISTINCT assignment.site_id)::int sites,
                       count(DISTINCT assignment.work_date)::int assignment_days,
                       coalesce(peak.peak_riders, 0)::int peak_riders
                FROM vehicles vehicle
                LEFT JOIN assignments assignment ON assignment.organization_id = vehicle.organization_id
                                                AND assignment.vehicle_id = vehicle.id
                                                AND assignment.work_date BETWEEN ? AND ?
                LEFT JOIN peaks peak ON peak.vehicle_id = vehicle.id
                WHERE vehicle.archived_at IS NULL
                GROUP BY vehicle.id, peak.peak_riders
                ORDER BY planned_min DESC, vehicle.plate
                """, (resultSet, rowNumber) -> new VehicleReport(
                resultSet.getObject("id", UUID.class), resultSet.getString("plate"), resultSet.getString("make"),
                resultSet.getString("model"), resultSet.getString("status"), resultSet.getInt("seats"),
                resultSet.getInt("planned_min"), resultSet.getInt("employees"), resultSet.getInt("sites"),
                resultSet.getInt("assignment_days"), resultSet.getInt("peak_riders")), from, to, from, to);
    }

    List<SitePlannedActual> plannedActual(LocalDate from, LocalDate to) {
        return jdbcTemplate.query("""
                WITH actual AS (
                    SELECT site_id, sum(worked_min)::int actual_min, sum(worked_min)::int approved_min
                    FROM reporting_time_facts WHERE work_date BETWEEN ? AND ? GROUP BY site_id
                )
                SELECT site.id, site.code, site.name, site.country, site.hour_limit_min,
                       site.baseline_realized_min + coalesce(actual.actual_min, 0) actual_min,
                       site.baseline_approved_min + coalesce(actual.approved_min, 0) approved_min,
                       coalesce(sum(assignment.planned_min), 0)::int planned_min
                FROM sites site
                LEFT JOIN actual ON actual.site_id = site.id
                LEFT JOIN assignments assignment ON assignment.organization_id = site.organization_id
                                                AND assignment.site_id = site.id
                                                AND assignment.work_date BETWEEN ? AND ?
                WHERE site.archived_at IS NULL
                GROUP BY site.id, actual.actual_min, actual.approved_min
                ORDER BY site.code
                """, (resultSet, rowNumber) -> {
            var limit = (Integer) resultSet.getObject("hour_limit_min");
            var actual = resultSet.getInt("actual_min");
            var approved = resultSet.getInt("approved_min");
            var planned = resultSet.getInt("planned_min");
            var remaining = limit == null ? null : limit - approved - planned;
            var projected = limit == null ? null : Math.round((actual + planned) * 100f / limit);
            return new SitePlannedActual(resultSet.getObject("id", UUID.class), resultSet.getString("code"),
                    resultSet.getString("name"), resultSet.getString("country"), limit, actual, approved, planned,
                    remaining, projected);
        }, from, to, from, to);
    }

    private static void appendFilter(StringBuilder sql, List<Object> params, String column, UUID value) {
        if (value != null) {
            sql.append(" AND ").append(column).append(" = ?");
            params.add(value);
        }
    }
}
