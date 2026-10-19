package pt.andaime.workforce.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.audit.Changes;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.workforce.EmployeeDirectory;
import pt.andaime.workforce.application.WorkforceViews.MemberRow;
import pt.andaime.workforce.application.WorkforceViews.TeamDetail;
import pt.andaime.workforce.application.WorkforceViews.TeamSummary;
import pt.andaime.workforce.application.WorkforceViews.VehicleRef;

/**
 * Equipas e a sua composição datada. Regras:
 * <ul>
 * <li>um trabalhador está no máximo numa equipa em cada dia (garantido também pela base de dados);</li>
 * <li>mudanças de composição valem de hoje em diante: as semanas anteriores nunca são reescritas;</li>
 * <li>entrar numa equipa termina, na véspera, a presença na equipa anterior.</li>
 * </ul>
 */
@Service
public class TeamService {

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final EmployeeDirectory employees;
    private final EmployeeService employeeService;
    private final Clock clock;

    public TeamService(
            JdbcTemplate jdbcTemplate,
            AuditLog auditLog,
            EmployeeDirectory employees,
            EmployeeService employeeService,
            Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.employees = employees;
        this.employeeService = employeeService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<TeamSummary> list(boolean archived) {
        if (OrgRole.current() == OrgRole.WORKER) {
            throw forbidden();
        }
        var today = TenantContext.today(clock);
        var scope = WorkforceScope.teams("team");
        var params = new ArrayList<Object>(List.of(today, today, today, today));
        params.addAll(scope.params());
        return jdbcTemplate.query("""
                SELECT team.id, team.name, team.color, team.foreman_employee_id, foreman.full_name AS foreman_name,
                       team.archived_at, team.version, current_vehicle.id AS vehicle_id, current_vehicle.plate AS vehicle_plate,
                       count(member.id) AS member_count,
                       coalesce(array_agg(person.full_name ORDER BY person.full_name)
                                FILTER (WHERE person.id IS NOT NULL), '{}') AS member_names
                FROM teams team
                LEFT JOIN employees foreman
                       ON foreman.organization_id = team.organization_id AND foreman.id = team.foreman_employee_id
                LEFT JOIN LATERAL (SELECT vehicle.id, vehicle.plate FROM team_vehicle_links link
                       JOIN vehicles vehicle ON vehicle.organization_id = link.organization_id AND vehicle.id = link.vehicle_id
                       WHERE link.organization_id = team.organization_id AND link.team_id = team.id
                         AND link.valid_from <= ? AND (link.valid_to IS NULL OR link.valid_to >= ?)
                       LIMIT 1) current_vehicle ON TRUE
                LEFT JOIN team_members member
                       ON member.organization_id = team.organization_id AND member.team_id = team.id
                      AND member.joined_on <= ? AND (member.left_on IS NULL OR member.left_on >= ?)
                LEFT JOIN employees person
                       ON person.organization_id = member.organization_id AND person.id = member.employee_id
                WHERE\s""" + scope.sql() + (archived ? " AND team.archived_at IS NOT NULL" : " AND team.archived_at IS NULL") + """

                GROUP BY team.id, foreman.full_name, current_vehicle.id, current_vehicle.plate
                ORDER BY lower(team.name)
                """, (resultSet, rowNumber) -> new TeamSummary(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("name"),
                resultSet.getString("color"),
                resultSet.getObject("foreman_employee_id", UUID.class),
                resultSet.getString("foreman_name"),
                resultSet.getInt("member_count"),
                Arrays.asList((String[]) resultSet.getArray("member_names").getArray()),
                vehicle(resultSet),
                resultSet.getObject("archived_at") != null,
                resultSet.getInt("version")), params.toArray());
    }

    @Transactional(readOnly = true)
    public TeamDetail get(UUID teamId) {
        if (OrgRole.current() == OrgRole.WORKER) {
            throw forbidden();
        }
        var scope = WorkforceScope.teams("team");
        var now = TenantContext.today(clock);
        var params = new ArrayList<Object>(List.of(now, now, teamId));
        params.addAll(scope.params());
        var head = jdbcTemplate.query("""
                SELECT team.id, team.name, team.color, team.foreman_employee_id, foreman.full_name AS foreman_name,
                       team.archived_at, team.version, current_vehicle.id AS vehicle_id, current_vehicle.plate AS vehicle_plate
                FROM teams team
                LEFT JOIN employees foreman
                       ON foreman.organization_id = team.organization_id AND foreman.id = team.foreman_employee_id
                LEFT JOIN LATERAL (SELECT vehicle.id, vehicle.plate FROM team_vehicle_links link
                       JOIN vehicles vehicle ON vehicle.organization_id = link.organization_id AND vehicle.id = link.vehicle_id
                       WHERE link.organization_id = team.organization_id AND link.team_id = team.id
                         AND link.valid_from <= ? AND (link.valid_to IS NULL OR link.valid_to >= ?)
                       LIMIT 1) current_vehicle ON TRUE
                WHERE team.id = ? AND\s""" + scope.sql(), (resultSet, rowNumber) -> new Object[] {
                resultSet.getString("name"), resultSet.getString("color"),
                resultSet.getObject("foreman_employee_id", UUID.class), resultSet.getString("foreman_name"),
                resultSet.getObject("archived_at") != null, resultSet.getInt("version"), vehicle(resultSet)}, params.toArray())
                .stream().findFirst().orElseThrow(TeamService::notFound);
        var today = TenantContext.today(clock);
        var rows = jdbcTemplate.query("""
                SELECT person.id, person.number, person.full_name, person.category, person.status,
                       member.joined_on, member.left_on
                FROM team_members member
                JOIN employees person ON person.organization_id = member.organization_id AND person.id = member.employee_id
                WHERE member.team_id = ?
                ORDER BY member.joined_on DESC, lower(person.full_name)
                """, TeamService::memberRow, teamId);
        var current = rows.stream()
                .filter(r -> !r.joinedOn().isAfter(today) && (r.leftOn() == null || !r.leftOn().isBefore(today)))
                .sorted((a, b) -> a.fullName().compareToIgnoreCase(b.fullName()))
                .toList();
        return new TeamDetail(teamId, (String) head[0], (String) head[1], (UUID) head[2], (String) head[3],
                (Boolean) head[4], (VehicleRef) head[6], current, rows, (Integer) head[5]);
    }

    @Transactional
    public TeamDetail create(String name, String color, UUID foremanEmployeeId) {
        OrgRole.require(OrgRole.MANAGER);
        ensureNameFree(name, null);
        if (foremanEmployeeId != null) {
            employees.requireActive(foremanEmployeeId, "foreman");
        }
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO teams (organization_id, name, color, foreman_employee_id) VALUES (?, ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), name.strip(), color, foremanEmployeeId);
        auditLog.record("team.created", "team", id, Changes.created(values(name.strip(), color, foremanEmployeeId), java.util.Set.of()));
        return get(id);
    }

    @Transactional
    public TeamDetail update(UUID teamId, String name, String color, UUID foremanEmployeeId, int expectedVersion) {
        OrgRole.require(OrgRole.MANAGER);
        var before = get(teamId);
        ensureNameFree(name, teamId);
        if (foremanEmployeeId != null && !foremanEmployeeId.equals(before.foremanEmployeeId())) {
            employees.requireActive(foremanEmployeeId, "foreman");
        }
        var updated = jdbcTemplate.update("""
                UPDATE teams SET name = ?, color = ?, foreman_employee_id = ?, version = version + 1
                WHERE id = ? AND version = ? AND archived_at IS NULL
                """, name.strip(), color, foremanEmployeeId, teamId, expectedVersion);
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "stale", "A equipa foi alterada por outra pessoa. Recarregue e tente de novo.");
        }
        var changes = Changes.diff(values(before.name(), before.color(), before.foremanEmployeeId()),
                values(name.strip(), color, foremanEmployeeId), java.util.Set.of());
        if (!changes.isEmpty()) {
            auditLog.record("team.updated", "team", teamId, changes);
        }
        return get(teamId);
    }

    /** Junta o trabalhador à equipa a partir de {@code joinedOn} (hoje ou depois). */
    @Transactional
    public TeamDetail addMember(UUID teamId, UUID employeeId, LocalDate joinedOn) {
        OrgRole.require(OrgRole.MANAGER);
        var team = get(teamId);
        if (team.archived()) {
            throw new ApiException(HttpStatus.CONFLICT, "team-archived", "A equipa está arquivada.");
        }
        var today = TenantContext.today(clock);
        var from = joinedOn == null ? today : joinedOn;
        if (from.isBefore(today)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "past-date",
                    "As alterações de equipa valem de hoje em diante; o histórico anterior não é reescrito.");
        }
        employees.requireActive(employeeId, "employee");
        employeeService.lockEmployee(employeeId);

        var covering = jdbcTemplate.query("""
                SELECT id, team_id, joined_on FROM team_members
                WHERE employee_id = ? AND joined_on <= ? AND (left_on IS NULL OR left_on >= ?)
                """, (resultSet, rowNumber) -> new Object[] {
                resultSet.getObject("id", UUID.class), resultSet.getObject("team_id", UUID.class),
                resultSet.getObject("joined_on", LocalDate.class)}, employeeId, from, from);
        if (covering.stream().anyMatch(row -> teamId.equals(row[1]))) {
            throw new ApiException(HttpStatus.CONFLICT, "already-member", "O trabalhador já pertence a esta equipa.");
        }
        UUID previousTeam = null;
        for (var row : covering) {
            previousTeam = (UUID) row[1];
            if (((LocalDate) row[2]).isBefore(from)) {
                jdbcTemplate.update("UPDATE team_members SET left_on = ?, ended_by_user_id = ? WHERE id = ?",
                        from.minusDays(1), TenantContext.userId().orElse(null), row[0]);
            } else {
                jdbcTemplate.update("DELETE FROM team_members WHERE id = ?", row[0]);
            }
        }
        // Presenças futuras já marcadas noutra equipa deixam de fazer sentido.
        jdbcTemplate.update("DELETE FROM team_members WHERE employee_id = ? AND joined_on > ?", employeeId, from);
        jdbcTemplate.update("""
                INSERT INTO team_members (organization_id, team_id, employee_id, joined_on, created_by_user_id)
                VALUES (?, ?, ?, ?, ?)
                """, TenantContext.organizationId().orElseThrow(), teamId, employeeId, from,
                TenantContext.userId().orElse(null));
        var changes = new LinkedHashMap<String, Object>();
        changes.put("employeeId", employeeId);
        changes.put("joinedOn", from.toString());
        if (previousTeam != null) {
            changes.put("previousTeamId", previousTeam);
        }
        auditLog.record("team.member-added", "team", teamId, changes);
        return get(teamId);
    }

    /** O trabalhador sai da equipa; {@code lastDay} é o último dia na equipa (hoje ou depois). */
    @Transactional
    public TeamDetail removeMember(UUID teamId, UUID employeeId, LocalDate lastDay) {
        OrgRole.require(OrgRole.MANAGER);
        get(teamId);
        var today = TenantContext.today(clock);
        var until = lastDay == null ? today : lastDay;
        if (until.isBefore(today)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "past-date",
                    "As alterações de equipa valem de hoje em diante; o histórico anterior não é reescrito.");
        }
        employeeService.lockEmployee(employeeId);
        var rows = jdbcTemplate.query("""
                SELECT id, joined_on FROM team_members
                WHERE team_id = ? AND employee_id = ? AND (left_on IS NULL OR left_on > ?)
                """, (resultSet, rowNumber) -> new Object[] {
                resultSet.getObject("id", UUID.class), resultSet.getObject("joined_on", LocalDate.class)},
                teamId, employeeId, until);
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "O trabalhador não pertence a esta equipa.");
        }
        for (var row : rows) {
            if (((LocalDate) row[1]).isAfter(until)) {
                jdbcTemplate.update("DELETE FROM team_members WHERE id = ?", row[0]);
            } else {
                jdbcTemplate.update("UPDATE team_members SET left_on = ?, ended_by_user_id = ? WHERE id = ?",
                        until, TenantContext.userId().orElse(null), row[0]);
            }
        }
        auditLog.record("team.member-removed", "team", teamId,
                Map.of("employeeId", employeeId, "lastDay", until.toString()));
        return get(teamId);
    }

    /** Arquiva a equipa: os membros saem hoje; a composição passada fica no histórico. */
    @Transactional
    public TeamDetail archive(UUID teamId) {
        OrgRole.require(OrgRole.MANAGER);
        get(teamId);
        var today = TenantContext.today(clock);
        jdbcTemplate.update("DELETE FROM team_members WHERE team_id = ? AND joined_on > ?", teamId, today);
        jdbcTemplate.update("""
                UPDATE team_members SET left_on = ?, ended_by_user_id = ?
                WHERE team_id = ? AND (left_on IS NULL OR left_on > ?)
                """, today, TenantContext.userId().orElse(null), teamId, today);
        jdbcTemplate.update("UPDATE teams SET archived_at = now(), version = version + 1 WHERE id = ? AND archived_at IS NULL",
                teamId);
        auditLog.record("team.archived", "team", teamId);
        return get(teamId);
    }

    private void ensureNameFree(String name, UUID except) {
        var taken = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM teams WHERE lower(name) = lower(?) AND archived_at IS NULL
                               AND id IS DISTINCT FROM ?)
                """, Boolean.class, name.strip(), except));
        if (taken) {
            throw new ApiException(HttpStatus.CONFLICT, "name-taken", "Já existe uma equipa com o nome " + name.strip() + ".");
        }
    }

    private static VehicleRef vehicle(ResultSet resultSet) throws SQLException {
        var id = resultSet.getObject("vehicle_id", UUID.class);
        return id == null ? null : new VehicleRef(id, resultSet.getString("vehicle_plate"));
    }

    private static Map<String, Object> values(String name, String color, UUID foreman) {
        var values = new LinkedHashMap<String, Object>();
        values.put("name", name);
        values.put("color", color);
        values.put("foremanEmployeeId", foreman);
        return values;
    }

    private static MemberRow memberRow(ResultSet resultSet, int rowNumber) throws SQLException {
        return new MemberRow(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("number"),
                resultSet.getString("full_name"),
                resultSet.getString("category"),
                resultSet.getString("status"),
                resultSet.getObject("joined_on", LocalDate.class),
                resultSet.getObject("left_on", LocalDate.class));
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "A equipa não foi encontrada.");
    }

    private static ApiException forbidden() {
        return new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Não tem permissão para ver equipas.");
    }
}
