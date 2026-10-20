package pt.andaime.planning.application;

import java.math.BigDecimal;
import java.sql.Array;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.TenantContext;

/**
 * As atribuições da própria pessoa, já com a obra, a equipa, a viatura, o encarregado e os colegas resolvidos: é o que
 * a app do trabalhador mostra em "Hoje" e "Próximos dias". Um trabalhador não pode ler obras nem viaturas diretamente,
 * por isso esta leitura devolve só o necessário e só das suas atribuições.
 */
@Service
public class MyScheduleService {

    public record SiteRef(UUID id, String code, String name, String address, String city, BigDecimal latitude,
            BigDecimal longitude, String color) {
    }

    public record VehicleRef(UUID id, String plate, String make, String model) {
    }

    public record MyAssignment(UUID id, LocalDate date, LocalTime start, LocalTime end, int breakMin, int plannedMin,
            boolean foreman, String note, SiteRef site, String teamName, VehicleRef vehicle, String foremanName,
            List<String> colleagues) {
    }

    private final JdbcTemplate jdbcTemplate;

    public MyScheduleService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(readOnly = true)
    public List<MyAssignment> mine(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 62) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-range", "Escolha um período de até 62 dias.");
        }
        // Conta sem ficha de trabalhador (ex.: gestor): não tem atribuições próprias.
        var me = TenantContext.employeeId().orElse(null);
        if (me == null) {
            return List.of();
        }
        return jdbcTemplate.query("""
                SELECT a.id, a.work_date, a.start_time, a.end_time, a.break_min, a.planned_min, a.is_foreman, a.note,
                       s.id AS site_id, s.code, s.name, s.address, s.city, s.latitude, s.longitude, s.color,
                       t.name AS team_name, v.id AS vehicle_id, v.plate, v.make, v.model,
                       coalesce(site_foreman.full_name, team_foreman.full_name) AS foreman_name,
                       ARRAY(SELECT DISTINCT colleague.full_name FROM assignments other
                             JOIN employees colleague ON colleague.organization_id = other.organization_id
                              AND colleague.id = other.employee_id
                             WHERE other.organization_id = a.organization_id AND other.site_id = a.site_id
                               AND other.work_date = a.work_date AND other.employee_id <> a.employee_id
                             ORDER BY colleague.full_name) AS colleagues
                FROM assignments a
                JOIN sites s ON s.organization_id = a.organization_id AND s.id = a.site_id
                LEFT JOIN teams t ON t.organization_id = a.organization_id AND t.id = a.team_id
                LEFT JOIN vehicles v ON v.organization_id = a.organization_id AND v.id = a.vehicle_id
                LEFT JOIN employees site_foreman ON site_foreman.organization_id = s.organization_id
                 AND site_foreman.id = s.foreman_employee_id
                LEFT JOIN employees team_foreman ON team_foreman.organization_id = t.organization_id
                 AND team_foreman.id = t.foreman_employee_id
                WHERE a.employee_id = ? AND a.work_date BETWEEN ? AND ?
                ORDER BY a.work_date, a.start_time
                """, (rs, rowNumber) -> {
            Array colleagues = rs.getArray("colleagues");
            var vehicleId = rs.getObject("vehicle_id", UUID.class);
            return new MyAssignment(
                    rs.getObject("id", UUID.class),
                    rs.getObject("work_date", LocalDate.class),
                    rs.getObject("start_time", LocalTime.class),
                    rs.getObject("end_time", LocalTime.class),
                    rs.getInt("break_min"),
                    rs.getInt("planned_min"),
                    rs.getBoolean("is_foreman"),
                    rs.getString("note"),
                    new SiteRef(rs.getObject("site_id", UUID.class), rs.getString("code"), rs.getString("name"),
                            rs.getString("address"), rs.getString("city"), rs.getBigDecimal("latitude"),
                            rs.getBigDecimal("longitude"), rs.getString("color")),
                    rs.getString("team_name"),
                    vehicleId == null ? null : new VehicleRef(vehicleId, rs.getString("plate"), rs.getString("make"), rs.getString("model")),
                    rs.getString("foreman_name"),
                    colleagues == null ? List.of() : Arrays.asList((String[]) colleagues.getArray()));
        }, me, from, to);
    }
}
