package pt.andaime.fleet.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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

/**
 * Viaturas, indisponibilidades e viatura habitual de cada equipa (com períodos, como a composição
 * das equipas). Os alertas (seguro, inspeção, manutenção) são calculados na data de hoje da empresa.
 */
@Service
public class VehicleService {

    /** Dias de antecedência para avisar seguro, inspeção e manutenção. */
    static final int ALERT_DAYS = 30;

    public record TeamRef(UUID id, String name, String color) {
    }

    public record Alert(String kind, LocalDate date, boolean expired) {
    }

    public record VehicleSummary(
            UUID id, String plate, String make, String model, int seats, String status, int km,
            LocalDate insuranceUntil, LocalDate inspectionUntil, LocalDate maintenanceDue,
            TeamRef team, List<Alert> alerts, boolean archived) {
    }

    public record Unavailability(UUID id, LocalDate startsOn, LocalDate endsOn, String reason) {
    }

    public record UpcomingAssignment(LocalDate date, String siteCode, String siteName, UUID siteId, int riders) {
    }

    public record VehicleDetail(
            UUID id, String plate, String make, String model, int seats, String status, int km,
            LocalDate insuranceUntil, LocalDate inspectionUntil, LocalDate maintenanceDue, String notes,
            TeamRef team, List<Alert> alerts, List<Unavailability> unavailability,
            List<UpcomingAssignment> upcoming, OffsetDateTime archivedAt, int version) {
    }

    public record VehicleInput(
            String plate, String make, String model, int seats, String status, Integer km,
            LocalDate insuranceUntil, LocalDate inspectionUntil, LocalDate maintenanceDue, String notes) {
    }

    private static final String SELECT = """
            SELECT vehicle.*, team.id AS team_id, team.name AS team_name, team.color AS team_color
            FROM vehicles vehicle
            LEFT JOIN team_vehicle_links link
                   ON link.organization_id = vehicle.organization_id AND link.vehicle_id = vehicle.id
                  AND link.valid_from <= ? AND (link.valid_to IS NULL OR link.valid_to >= ?)
            LEFT JOIN teams team ON team.organization_id = link.organization_id AND team.id = link.team_id
            """;

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final Clock clock;

    public VehicleService(JdbcTemplate jdbcTemplate, AuditLog auditLog, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<VehicleSummary> list(String query, String status, boolean archived) {
        OrgRole.require(OrgRole.FOREMAN);
        var today = TenantContext.today(clock);
        var params = new ArrayList<Object>(List.of(today, today));
        var where = new StringBuilder(archived ? "vehicle.archived_at IS NOT NULL" : "vehicle.archived_at IS NULL");
        if (status != null && !status.isBlank()) {
            where.append(" AND vehicle.status = ?");
            params.add(status.toUpperCase(Locale.ROOT));
        }
        if (query != null && !query.isBlank()) {
            where.append(" AND (vehicle.plate ILIKE ? OR vehicle.make ILIKE ? OR vehicle.model ILIKE ?)");
            var like = "%" + query.strip().replace("%", "\\%").replace("_", "\\_") + "%";
            params.add(like);
            params.add(like);
            params.add(like);
        }
        return jdbcTemplate.query(SELECT + " WHERE " + where + " ORDER BY vehicle.plate LIMIT 1000",
                (resultSet, rowNumber) -> new VehicleSummary(
                        resultSet.getObject("id", UUID.class), resultSet.getString("plate"), resultSet.getString("make"),
                        resultSet.getString("model"), resultSet.getInt("seats"), resultSet.getString("status"),
                        resultSet.getInt("km"), date(resultSet, "insurance_until"), date(resultSet, "inspection_until"),
                        date(resultSet, "maintenance_due"), team(resultSet), alerts(resultSet, today),
                        resultSet.getObject("archived_at") != null), params.toArray());
    }

    @Transactional(readOnly = true)
    public VehicleDetail get(UUID vehicleId) {
        OrgRole.require(OrgRole.FOREMAN);
        var today = TenantContext.today(clock);
        var detail = jdbcTemplate.query(SELECT + " WHERE vehicle.id = ?", (resultSet, rowNumber) -> new Object[] {
                resultSet.getString("plate"), resultSet.getString("make"), resultSet.getString("model"),
                resultSet.getInt("seats"), resultSet.getString("status"), resultSet.getInt("km"),
                date(resultSet, "insurance_until"), date(resultSet, "inspection_until"), date(resultSet, "maintenance_due"),
                resultSet.getString("notes"), team(resultSet), alerts(resultSet, today),
                resultSet.getObject("archived_at", OffsetDateTime.class), resultSet.getInt("version")},
                today, today, vehicleId).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "A viatura não foi encontrada."));
        var unavailable = jdbcTemplate.query("""
                SELECT id, starts_on, ends_on, reason FROM vehicle_unavailability
                WHERE vehicle_id = ? AND ends_on >= ? ORDER BY starts_on
                """, (resultSet, rowNumber) -> new Unavailability(resultSet.getObject("id", UUID.class),
                date(resultSet, "starts_on"), date(resultSet, "ends_on"), resultSet.getString("reason")),
                vehicleId, today.minusDays(30));
        var upcoming = jdbcTemplate.query("""
                SELECT assignment.work_date, site.id AS site_id, site.code, site.name,
                       count(DISTINCT assignment.employee_id) AS riders
                FROM assignments assignment
                JOIN sites site ON site.organization_id = assignment.organization_id AND site.id = assignment.site_id
                WHERE assignment.vehicle_id = ? AND assignment.work_date BETWEEN ? AND ?
                GROUP BY assignment.work_date, site.id, site.code, site.name
                ORDER BY assignment.work_date, site.code
                """, (resultSet, rowNumber) -> new UpcomingAssignment(date(resultSet, "work_date"),
                resultSet.getString("code"), resultSet.getString("name"), resultSet.getObject("site_id", UUID.class),
                resultSet.getInt("riders")), vehicleId, today.minusDays(7), today.plusDays(28));
        return new VehicleDetail(vehicleId, (String) detail[0], (String) detail[1], (String) detail[2], (Integer) detail[3],
                (String) detail[4], (Integer) detail[5], (LocalDate) detail[6], (LocalDate) detail[7], (LocalDate) detail[8],
                (String) detail[9], (TeamRef) detail[10], castAlerts(detail[11]), unavailable, upcoming,
                (OffsetDateTime) detail[12], (Integer) detail[13]);
    }

    @Transactional
    public VehicleDetail create(VehicleInput input) {
        OrgRole.require(OrgRole.MANAGER);
        var values = normalize(input);
        ensurePlateFree((String) values.get("plate"), null);
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO vehicles (organization_id, plate, make, model, seats, status, km, insurance_until,
                    inspection_until, maintenance_due, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), values.get("plate"), values.get("make"),
                values.get("model"), values.get("seats"), values.get("status"), values.get("km"),
                values.get("insuranceUntil"), values.get("inspectionUntil"), values.get("maintenanceDue"), values.get("notes"));
        auditLog.record("vehicle.created", "vehicle", id, Changes.created(values, Set.of("notes")));
        return get(id);
    }

    @Transactional
    public VehicleDetail update(UUID vehicleId, VehicleInput input, int expectedVersion) {
        OrgRole.require(OrgRole.MANAGER);
        var before = values(get(vehicleId));
        var after = normalize(input);
        ensurePlateFree((String) after.get("plate"), vehicleId);
        var updated = jdbcTemplate.update("""
                UPDATE vehicles SET plate = ?, make = ?, model = ?, seats = ?, status = ?, km = ?, insurance_until = ?,
                       inspection_until = ?, maintenance_due = ?, notes = ?, version = version + 1
                WHERE id = ? AND version = ? AND archived_at IS NULL
                """, after.get("plate"), after.get("make"), after.get("model"), after.get("seats"), after.get("status"),
                after.get("km"), after.get("insuranceUntil"), after.get("inspectionUntil"), after.get("maintenanceDue"),
                after.get("notes"), vehicleId, expectedVersion);
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "stale", "A viatura foi alterada por outra pessoa. Recarregue e tente de novo.");
        }
        var changes = Changes.diff(before, after, Set.of("notes"));
        if (!changes.isEmpty()) {
            auditLog.record("vehicle.updated", "vehicle", vehicleId, changes);
        }
        return get(vehicleId);
    }

    @Transactional
    public VehicleDetail archive(UUID vehicleId, boolean archived) {
        OrgRole.require(OrgRole.MANAGER);
        get(vehicleId);
        if (archived) {
            var today = TenantContext.today(clock);
            jdbcTemplate.update("DELETE FROM team_vehicle_links WHERE vehicle_id = ? AND valid_from > ?", vehicleId, today);
            jdbcTemplate.update("""
                    UPDATE team_vehicle_links SET valid_to = ? WHERE vehicle_id = ? AND (valid_to IS NULL OR valid_to > ?)
                    """, today, vehicleId, today);
        }
        jdbcTemplate.update(archived
                ? "UPDATE vehicles SET archived_at = now(), status = 'INACTIVE', version = version + 1 WHERE id = ? AND archived_at IS NULL"
                : "UPDATE vehicles SET archived_at = NULL, version = version + 1 WHERE id = ? AND archived_at IS NOT NULL", vehicleId);
        auditLog.record(archived ? "vehicle.archived" : "vehicle.restored", "vehicle", vehicleId);
        return get(vehicleId);
    }

    @Transactional
    public VehicleDetail addUnavailability(UUID vehicleId, LocalDate startsOn, LocalDate endsOn, String reason) {
        OrgRole.require(OrgRole.MANAGER);
        get(vehicleId);
        if (endsOn.isBefore(startsOn)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-dates", "O fim é anterior ao início.");
        }
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO vehicle_unavailability (organization_id, vehicle_id, starts_on, ends_on, reason, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), vehicleId, startsOn, endsOn, reason.strip(),
                TenantContext.userId().orElse(null));
        auditLog.record("vehicle.unavailability-added", "vehicle", vehicleId,
                Map.of("unavailabilityId", id, "startsOn", startsOn.toString(), "endsOn", endsOn.toString()));
        return get(vehicleId);
    }

    @Transactional
    public VehicleDetail removeUnavailability(UUID vehicleId, UUID unavailabilityId) {
        OrgRole.require(OrgRole.MANAGER);
        var deleted = jdbcTemplate.update("DELETE FROM vehicle_unavailability WHERE id = ? AND vehicle_id = ?",
                unavailabilityId, vehicleId);
        if (deleted == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "A indisponibilidade não foi encontrada.");
        }
        auditLog.record("vehicle.unavailability-removed", "vehicle", vehicleId, Map.of("unavailabilityId", unavailabilityId));
        return get(vehicleId);
    }

    /**
     * Viatura habitual da equipa a partir de {@code from} (hoje ou depois). {@code vehicleId == null} retira a viatura.
     * A viatura deixa a equipa anterior na véspera; o histórico mantém-se.
     */
    @Transactional
    public void linkTeam(UUID teamId, UUID vehicleId, LocalDate from) {
        OrgRole.require(OrgRole.MANAGER);
        var today = TenantContext.today(clock);
        var start = from == null ? today : from;
        if (start.isBefore(today)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "past-date", "A mudança vale de hoje em diante.");
        }
        var team = jdbcTemplate.query("SELECT id FROM teams WHERE id = ? AND archived_at IS NULL",
                (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), teamId);
        if (team.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "A equipa não foi encontrada.");
        }
        if (vehicleId != null) {
            var usable = jdbcTemplate.query("SELECT id FROM vehicles WHERE id = ? AND archived_at IS NULL",
                    (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), vehicleId);
            if (usable.isEmpty()) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-vehicle", "A viatura indicada não existe.");
            }
        }
        // Fecha a ligação atual da equipa e a da viatura (noutra equipa) na véspera; apaga ligações futuras.
        for (var column : vehicleId == null ? List.of("team_id") : List.of("team_id", "vehicle_id")) {
            var key = "team_id".equals(column) ? teamId : vehicleId;
            jdbcTemplate.update("DELETE FROM team_vehicle_links WHERE " + column + " = ? AND valid_from >= ?", key, start);
            jdbcTemplate.update("UPDATE team_vehicle_links SET valid_to = ? WHERE " + column
                    + " = ? AND (valid_to IS NULL OR valid_to >= ?)", start.minusDays(1), key, start);
        }
        if (vehicleId != null) {
            jdbcTemplate.update("""
                    INSERT INTO team_vehicle_links (organization_id, team_id, vehicle_id, valid_from, created_by_user_id)
                    VALUES (?, ?, ?, ?, ?)
                    """, TenantContext.organizationId().orElseThrow(), teamId, vehicleId, start, TenantContext.userId().orElse(null));
        }
        var changes = new LinkedHashMap<String, Object>();
        changes.put("vehicleId", vehicleId);
        changes.put("from", start.toString());
        auditLog.record("team.vehicle-changed", "team", teamId, changes);
    }

    // --- auxiliares ------------------------------------------------------------------------

    private static List<Alert> alerts(ResultSet resultSet, LocalDate today) throws SQLException {
        var alerts = new ArrayList<Alert>();
        addAlert(alerts, "INSURANCE", date(resultSet, "insurance_until"), today);
        addAlert(alerts, "INSPECTION", date(resultSet, "inspection_until"), today);
        addAlert(alerts, "MAINTENANCE", date(resultSet, "maintenance_due"), today);
        return alerts;
    }

    private static void addAlert(List<Alert> alerts, String kind, LocalDate date, LocalDate today) {
        if (date != null && !date.isAfter(today.plusDays(ALERT_DAYS))) {
            alerts.add(new Alert(kind, date, date.isBefore(today)));
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Alert> castAlerts(Object value) {
        return (List<Alert>) value;
    }

    private static TeamRef team(ResultSet resultSet) throws SQLException {
        var id = resultSet.getObject("team_id", UUID.class);
        return id == null ? null : new TeamRef(id, resultSet.getString("team_name"), resultSet.getString("team_color"));
    }

    private static LocalDate date(ResultSet resultSet, String column) throws SQLException {
        return resultSet.getObject(column, LocalDate.class);
    }

    private void ensurePlateFree(String plate, UUID except) {
        var taken = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM vehicles WHERE plate = ? AND id IS DISTINCT FROM ?)", Boolean.class, plate, except));
        if (taken) {
            throw new ApiException(HttpStatus.CONFLICT, "plate-taken", "Já existe uma viatura com a matrícula " + plate + ".");
        }
    }

    private static Map<String, Object> normalize(VehicleInput input) {
        var values = new LinkedHashMap<String, Object>();
        values.put("plate", input.plate().strip().toUpperCase(Locale.ROOT).replace(' ', '-'));
        values.put("make", blankToNull(input.make()));
        values.put("model", blankToNull(input.model()));
        values.put("seats", input.seats());
        values.put("status", input.status() == null ? "OPERATIONAL" : input.status().toUpperCase(Locale.ROOT));
        values.put("km", input.km() == null ? 0 : input.km());
        values.put("insuranceUntil", input.insuranceUntil());
        values.put("inspectionUntil", input.inspectionUntil());
        values.put("maintenanceDue", input.maintenanceDue());
        values.put("notes", blankToNull(input.notes()));
        return values;
    }

    private static Map<String, Object> values(VehicleDetail vehicle) {
        var values = new LinkedHashMap<String, Object>();
        values.put("plate", vehicle.plate());
        values.put("make", vehicle.make());
        values.put("model", vehicle.model());
        values.put("seats", vehicle.seats());
        values.put("status", vehicle.status());
        values.put("km", vehicle.km());
        values.put("insuranceUntil", vehicle.insuranceUntil());
        values.put("inspectionUntil", vehicle.inspectionUntil());
        values.put("maintenanceDue", vehicle.maintenanceDue());
        values.put("notes", vehicle.notes());
        return values;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
