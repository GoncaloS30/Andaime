package pt.andaime.planning.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import pt.andaime.planning.application.PlanningViews.AssignmentView;
import pt.andaime.planning.domain.ConflictEngine;
import pt.andaime.planning.domain.ConflictEngine.DateRange;
import pt.andaime.planning.domain.ConflictEngine.Severity;
import pt.andaime.planning.domain.ConflictEngine.Snapshot;
import pt.andaime.shared.tenant.TenantContext;

/** Acesso a dados do planeamento (SQL sob RLS da organização corrente). */
@Component
class PlanningRepository {

    private static final String COLUMNS = """
            id, employee_id, site_id, work_date, start_time, end_time, break_min, planned_min, team_id, vehicle_id,
            is_foreman, note, batch_id, version""";

    private final JdbcTemplate jdbcTemplate;

    PlanningRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    static AssignmentView row(ResultSet resultSet, int rowNumber) throws SQLException {
        return new AssignmentView(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("employee_id", UUID.class),
                resultSet.getObject("site_id", UUID.class),
                resultSet.getObject("work_date", LocalDate.class),
                resultSet.getObject("start_time", LocalTime.class),
                resultSet.getObject("end_time", LocalTime.class),
                resultSet.getInt("break_min"),
                resultSet.getInt("planned_min"),
                resultSet.getObject("team_id", UUID.class),
                resultSet.getObject("vehicle_id", UUID.class),
                resultSet.getBoolean("is_foreman"),
                resultSet.getString("note"),
                resultSet.getObject("batch_id", UUID.class),
                resultSet.getInt("version"));
    }

    List<AssignmentView> inRange(LocalDate from, LocalDate to, String scopeSql, List<Object> scopeParams) {
        var params = new ArrayList<Object>(List.of(from, to));
        params.addAll(scopeParams);
        return jdbcTemplate.query("SELECT " + COLUMNS + " FROM assignments assignment WHERE work_date BETWEEN ? AND ? AND "
                + scopeSql + " ORDER BY work_date, start_time", PlanningRepository::row, params.toArray());
    }

    Optional<AssignmentView> find(UUID id) {
        return jdbcTemplate.query("SELECT " + COLUMNS + " FROM assignments WHERE id = ?", PlanningRepository::row, id)
                .stream().findFirst();
    }

    List<AssignmentView> forEmployeeBetween(UUID employeeId, LocalDate from, LocalDate to) {
        return jdbcTemplate.query("SELECT " + COLUMNS + " FROM assignments WHERE employee_id = ? AND work_date BETWEEN ? AND ?",
                PlanningRepository::row, employeeId, from, to);
    }

    List<AssignmentView> forWeek(LocalDate monday, Collection<UUID> teamIds) {
        if (teamIds == null || teamIds.isEmpty()) {
            return jdbcTemplate.query("SELECT " + COLUMNS + " FROM assignments WHERE work_date BETWEEN ? AND ?",
                    PlanningRepository::row, monday, monday.plusDays(6));
        }
        var params = new ArrayList<Object>(List.of(monday, monday.plusDays(6)));
        params.addAll(teamIds);
        return jdbcTemplate.query("SELECT " + COLUMNS + " FROM assignments WHERE work_date BETWEEN ? AND ? AND team_id IN ("
                + teamIds.stream().map(t -> "?").collect(Collectors.joining(",")) + ")", PlanningRepository::row, params.toArray());
    }

    UUID insert(AssignmentView a, UUID userId) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO assignments (id, organization_id, employee_id, site_id, work_date, start_time, end_time,
                    break_min, planned_min, site_timezone, period, team_id, vehicle_id, is_foreman, note, batch_id,
                    created_by_user_id)
                VALUES (coalesce(?, uuidv7()), ?, ?, ?, ?, ?, ?, ?, ?, '', 'empty', ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class, a.id(), TenantContext.organizationId().orElseThrow(), a.employeeId(), a.siteId(), a.date(),
                a.start(), a.end(), a.breakMin(), a.plannedMin(), a.teamId(), a.vehicleId(), a.foreman(), a.note(),
                a.batchId(), userId);
    }

    /** Atualiza com verificação de versão; devolve a nova versão ou -1 se a versão já não era a esperada. */
    int update(AssignmentView a, int expectedVersion) {
        var versions = jdbcTemplate.query("""
                UPDATE assignments SET employee_id = ?, site_id = ?, work_date = ?, start_time = ?, end_time = ?,
                       break_min = ?, planned_min = ?, team_id = ?, vehicle_id = ?, is_foreman = ?, note = ?,
                       version = version + 1
                WHERE id = ? AND version = ?
                RETURNING version
                """, (resultSet, rowNumber) -> resultSet.getInt(1), a.employeeId(), a.siteId(), a.date(), a.start(), a.end(),
                a.breakMin(), a.plannedMin(), a.teamId(), a.vehicleId(), a.foreman(), a.note(), a.id(), expectedVersion);
        return versions.isEmpty() ? -1 : versions.getFirst();
    }

    boolean delete(UUID id, int expectedVersion) {
        return jdbcTemplate.update("DELETE FROM assignments WHERE id = ? AND version = ?", id, expectedVersion) == 1;
    }

    /** Bloqueios consultivos ordenados (evita deadlocks): serializam comandos sobre os mesmos trabalhadores e viaturas. */
    void lock(Collection<String> keys) {
        for (var key : new TreeSet<>(keys)) {
            jdbcTemplate.query("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", (resultSet, rowNumber) -> null,
                    TenantContext.organizationId().orElseThrow() + ":" + key);
        }
    }

    void constraintsNow() {
        jdbcTemplate.execute("SET CONSTRAINTS ALL IMMEDIATE");
    }

    Optional<String> siteZone(UUID siteId) {
        return jdbcTemplate.query("SELECT timezone FROM sites WHERE id = ? AND archived_at IS NULL",
                (resultSet, rowNumber) -> resultSet.getString(1), siteId).stream().findFirst();
    }

    boolean employeeExists(UUID employeeId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM employees WHERE id = ? AND archived_at IS NULL)", Boolean.class, employeeId));
    }

    boolean employeeActive(UUID employeeId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM employees WHERE id = ? AND archived_at IS NULL AND status = 'ACTIVE')",
                Boolean.class, employeeId));
    }

    boolean vehicleExists(UUID vehicleId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM vehicles WHERE id = ? AND archived_at IS NULL)", Boolean.class, vehicleId));
    }

    Optional<UUID> teamOf(UUID employeeId, LocalDate date) {
        return jdbcTemplate.query("""
                SELECT team_id FROM team_members WHERE employee_id = ? AND joined_on <= ? AND (left_on IS NULL OR left_on >= ?)
                """, (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), employeeId, date, date).stream().findFirst();
    }

    Optional<UUID> vehicleOfTeam(UUID teamId, LocalDate date) {
        return jdbcTemplate.query("""
                SELECT vehicle_id FROM team_vehicle_links WHERE team_id = ? AND valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)
                """, (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), teamId, date, date).stream().findFirst();
    }

    /** Pausa automática da política laboral em vigor (por omissão: 60 min acima de 6 h). */
    int[] breakPolicy(LocalDate date) {
        return jdbcTemplate.query("""
                SELECT auto_break_after_min, auto_break_min FROM labor_policies
                WHERE country IS NULL AND effective_during @> ?::date
                """, (resultSet, rowNumber) -> new int[] {resultSet.getInt(1), resultSet.getInt(2)}, date)
                .stream().findFirst().orElse(new int[] {360, 60});
    }

    Snapshot snapshot(LocalDate from, LocalDate to, LocalDate today) {
        var assignments = jdbcTemplate.query("""
                SELECT assignment.id, assignment.employee_id, assignment.site_id, assignment.work_date,
                       assignment.start_time, assignment.end_time, assignment.planned_min, assignment.vehicle_id,
                       assignment.is_foreman, lower(assignment.period) AS starts_at, upper(assignment.period) AS ends_at
                FROM assignments assignment
                WHERE assignment.work_date BETWEEN ? AND ?
                """, (resultSet, rowNumber) -> new ConflictEngine.Assignment(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("employee_id", UUID.class),
                resultSet.getObject("site_id", UUID.class),
                resultSet.getObject("work_date", LocalDate.class),
                resultSet.getObject("start_time", LocalTime.class),
                resultSet.getObject("end_time", LocalTime.class),
                resultSet.getInt("planned_min"),
                resultSet.getObject("starts_at", OffsetDateTime.class).toInstant(),
                resultSet.getObject("ends_at", OffsetDateTime.class).toInstant(),
                resultSet.getObject("vehicle_id", UUID.class),
                resultSet.getBoolean("is_foreman")), from.minusDays(1), to.plusDays(1));

        var employeeIds = assignments.stream().map(ConflictEngine.Assignment::employeeId).distinct().toList();
        var employees = new HashMap<UUID, ConflictEngine.Employee>();
        if (!employeeIds.isEmpty()) {
            jdbcTemplate.query("SELECT id, full_name, category, status, archived_at, daily_capacity_min FROM employees WHERE id IN ("
                    + placeholders(employeeIds.size()) + ")", resultSet -> {
                        var id = resultSet.getObject("id", UUID.class);
                        employees.put(id, new ConflictEngine.Employee(id, resultSet.getString("full_name"),
                                resultSet.getString("category"),
                                "ACTIVE".equals(resultSet.getString("status")) && resultSet.getObject("archived_at") == null,
                                resultSet.getInt("daily_capacity_min")));
                    }, employeeIds.toArray());
        }

        Map<UUID, List<DateRange>> unavailable = new HashMap<>();
        jdbcTemplate.query("SELECT vehicle_id, starts_on, ends_on FROM vehicle_unavailability WHERE ends_on >= ? AND starts_on <= ?",
                resultSet -> {
                    unavailable.computeIfAbsent(resultSet.getObject("vehicle_id", UUID.class), k -> new ArrayList<>())
                            .add(new DateRange(resultSet.getObject("starts_on", LocalDate.class), resultSet.getObject("ends_on", LocalDate.class)));
                }, from, to);
        var vehicles = new HashMap<UUID, ConflictEngine.Vehicle>();
        jdbcTemplate.query("SELECT id, plate, seats, status, insurance_until, inspection_until, archived_at FROM vehicles", resultSet -> {
            var id = resultSet.getObject("id", UUID.class);
            vehicles.put(id, new ConflictEngine.Vehicle(id, resultSet.getString("plate"), resultSet.getInt("seats"),
                    resultSet.getString("status"), resultSet.getObject("insurance_until", LocalDate.class),
                    resultSet.getObject("inspection_until", LocalDate.class), resultSet.getObject("archived_at") != null,
                    unavailable.getOrDefault(id, List.of())));
        });

        var sites = new HashMap<UUID, ConflictEngine.Site>();
        jdbcTemplate.query("""
                SELECT site.id, site.code, site.name, site.status, site.hour_limit_min, site.baseline_realized_min,
                       (SELECT coalesce(sum(planned.planned_min), 0) FROM assignments planned
                        WHERE planned.site_id = site.id AND planned.work_date >= ?) AS planned_from_today
                FROM sites site
                WHERE site.archived_at IS NULL
                  AND (site.id IN (SELECT DISTINCT site_id FROM assignments WHERE work_date BETWEEN ? AND ?)
                       OR (site.status = 'ACTIVE' AND site.hour_limit_min IS NOT NULL))
                """, resultSet -> {
                    var id = resultSet.getObject("id", UUID.class);
                    sites.put(id, new ConflictEngine.Site(id, resultSet.getString("code"), resultSet.getString("name"),
                            resultSet.getString("status"), (Integer) resultSet.getObject("hour_limit_min"),
                            resultSet.getInt("baseline_realized_min"), resultSet.getInt("planned_from_today")));
                }, today, from, to);

        var rules = new HashMap<String, Severity>();
        jdbcTemplate.query("SELECT rule, severity FROM conflict_rule_settings", resultSet -> {
            rules.put(resultSet.getString("rule"), Severity.valueOf(resultSet.getString("severity")));
        });
        return new Snapshot(today, assignments, employees, vehicles, sites, rules);
    }

    private static String placeholders(int count) {
        return String.join(",", java.util.Collections.nCopies(count, "?"));
    }
}
