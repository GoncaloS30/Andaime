package pt.andaime.absences.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.absences.domain.WorkingDays;
import pt.andaime.policy.PublicHolidays;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Mapa de férias do ano: uma linha por pessoa no âmbito de quem pede, com os períodos aprovados e pedidos que tocam o
 * ano (recortados ao ano) e os dias úteis de férias contados só dentro do ano, sem os dias de descanso da política
 * laboral nem os feriados (da empresa e nacionais do país da empresa).
 * <p>
 * Âmbito igual ao da lista de ausências: gestor vê todos; encarregado ele próprio e quem está nas suas equipas;
 * trabalhador só a sua linha. A doença (dado de saúde) só aparece como tal a gestores e ao próprio; os restantes
 * veem "Ausência" ({@code kind = ABSENCE}).
 */
@Service
public class AbsenceYearService {

    public record YearPeriod(UUID id, String kind, String status, LocalDate startsOn, LocalDate endsOn, LocalDate from,
            LocalDate to, Integer partialMinutes, int workingDays) {
    }

    public record YearRow(UUID employeeId, String employeeName, String employeeNumber, int vacationDays,
            int pendingVacationDays, List<YearPeriod> periods) {
    }

    public record YearHoliday(LocalDate date, String name, String source) {
    }

    public record YearMap(int year, List<Integer> years, List<YearHoliday> holidays, List<YearRow> rows) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final PublicHolidays publicHolidays;
    private final Clock clock;

    public AbsenceYearService(JdbcTemplate jdbcTemplate, PublicHolidays publicHolidays, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.publicHolidays = publicHolidays;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public YearMap year(Integer requested) {
        var today = TenantContext.today(clock);
        var year = requested == null ? today.getYear() : requested;
        if (year < 2000 || year > 2100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Ano inválido.")
                    .with("errors", List.of(Map.of("field", "year", "code", "invalid", "message", "Ano inválido.")));
        }
        var first = LocalDate.of(year, 1, 1);
        var last = LocalDate.of(year, 12, 31);
        var role = OrgRole.current();
        var manager = role.atLeast(OrgRole.MANAGER);
        var me = TenantContext.employeeId().orElse(null);
        var scope = scope("employee.id", role, me);

        var holidays = holidays(year);
        var calendar = new WorkingDays.Calendar(restRules(first, last),
                holidays.stream().map(YearHoliday::date).collect(java.util.stream.Collectors.toSet()));

        var rows = new LinkedHashMap<UUID, RowBuilder>();
        var employeeParams = new ArrayList<Object>(scope.params());
        jdbcTemplate.query("SELECT employee.id, employee.full_name, employee.number FROM employees employee "
                + "WHERE employee.archived_at IS NULL AND " + scope.sql() + " ORDER BY employee.full_name, employee.number LIMIT 2000",
                resultSet -> {
                    var id = resultSet.getObject(1, UUID.class);
                    rows.put(id, new RowBuilder(id, resultSet.getString(2), resultSet.getString(3)));
                }, employeeParams.toArray());

        var periodParams = new ArrayList<Object>(List.of(last, first));
        periodParams.addAll(scope.params());
        jdbcTemplate.query("""
                SELECT absence.id, absence.employee_id, absence.kind, absence.status, absence.starts_on, absence.ends_on,
                       absence.partial_minutes
                FROM absences absence
                JOIN employees employee ON employee.organization_id = absence.organization_id AND employee.id = absence.employee_id
                WHERE absence.status IN ('APPROVED', 'REQUESTED') AND absence.starts_on <= ? AND absence.ends_on >= ?
                  AND employee.archived_at IS NULL AND """ + " " + scope.sql() + " ORDER BY absence.starts_on", resultSet -> {
            var row = rows.get(resultSet.getObject("employee_id", UUID.class));
            if (row == null) {
                return;
            }
            var start = resultSet.getObject("starts_on", LocalDate.class);
            var end = resultSet.getObject("ends_on", LocalDate.class);
            var clipped = WorkingDays.clip(start, end, year).orElseThrow();
            var partial = (Integer) resultSet.getObject("partial_minutes");
            var kind = resultSet.getString("kind");
            var visibleKind = "SICK".equals(kind) && !manager && !row.id.equals(me) ? "ABSENCE" : kind;
            // Uma ausência parcial (algumas horas num dia) não conta como dia de férias.
            var days = partial != null ? 0 : WorkingDays.inYear(start, end, year, calendar);
            var status = resultSet.getString("status");
            row.periods.add(new YearPeriod(resultSet.getObject("id", UUID.class), visibleKind, status, start, end, clipped.start(),
                    clipped.end(), partial, days));
            if ("VACATION".equals(kind)) {
                if ("APPROVED".equals(status)) {
                    row.vacationDays += days;
                } else {
                    row.pendingVacationDays += days;
                }
            }
        }, periodParams.toArray());

        return new YearMap(year, years(scope, today.getYear()), holidays,
                rows.values().stream().map(RowBuilder::build).toList());
    }

    // --- auxiliares ------------------------------------------------------------------------------------

    private static final class RowBuilder {
        private final UUID id;
        private final String name;
        private final String number;
        private final List<YearPeriod> periods = new ArrayList<>();
        private int vacationDays;
        private int pendingVacationDays;

        RowBuilder(UUID id, String name, String number) {
            this.id = id;
            this.name = name;
            this.number = number;
        }

        YearRow build() {
            return new YearRow(id, name, number, vacationDays, pendingVacationDays, List.copyOf(periods));
        }
    }

    /** Anos do seletor: os que têm ausências no âmbito, mais o corrente e o seguinte. */
    private List<Integer> years(Scope scope, int current) {
        var years = new TreeSet<Integer>(List.of(current, current + 1));
        jdbcTemplate.query("""
                SELECT DISTINCT extract(year FROM generate_series(date_trunc('year', absence.starts_on),
                       date_trunc('year', absence.ends_on), interval '1 year'))::int
                FROM absences absence
                JOIN employees employee ON employee.organization_id = absence.organization_id AND employee.id = absence.employee_id
                WHERE absence.status IN ('APPROVED', 'REQUESTED') AND """ + " " + scope.sql(),
                resultSet -> {
                    var year = resultSet.getInt(1);
                    if (year >= 2000 && year <= 2100) {
                        years.add(year);
                    }
                }, scope.params().toArray());
        return List.copyOf(years);
    }

    /** Feriados da empresa e nacionais do país da empresa nesse ano, por data. */
    private List<YearHoliday> holidays(int year) {
        var byDate = new TreeMap<LocalDate, YearHoliday>();
        var country = jdbcTemplate.query("SELECT country FROM organizations WHERE id = app.current_org_id()",
                (resultSet, rowNumber) -> resultSet.getString(1)).stream().filter(c -> c != null && !c.isBlank())
                .map(String::strip).findFirst();
        country.ifPresent(c -> publicHolidays.national(c, year)
                .forEach(holiday -> byDate.put(holiday.date(), new YearHoliday(holiday.date(), holiday.name(), "PUBLIC"))));
        jdbcTemplate.query("SELECT holiday_date, name FROM org_holidays WHERE holiday_date BETWEEN ? AND ? ORDER BY holiday_date",
                resultSet -> {
                    var date = resultSet.getObject(1, LocalDate.class);
                    byDate.putIfAbsent(date, new YearHoliday(date, resultSet.getString(2), "COMPANY"));
                }, LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
        return List.copyOf(byDate.values());
    }

    /** Dias de descanso das políticas laborais da empresa que tocam o ano. */
    private List<WorkingDays.RestRule> restRules(LocalDate first, LocalDate last) {
        return jdbcTemplate.query("""
                SELECT lower(effective_during), upper(effective_during), rest_days FROM labor_policies
                WHERE country IS NULL AND effective_during && daterange(?::date, ?::date, '[]')
                ORDER BY lower(effective_during) NULLS FIRST
                """, (resultSet, rowNumber) -> {
            var rest = new HashSet<Integer>();
            for (var day : (Object[]) resultSet.getArray(3).getArray()) {
                rest.add(((Number) day).intValue());
            }
            return new WorkingDays.RestRule(resultSet.getObject(1, LocalDate.class), resultSet.getObject(2, LocalDate.class), rest);
        }, first, last);
    }

    private record Scope(String sql, List<Object> params) {
    }

    /** Mesma regra de {@code AbsenceService}: gestor todos; encarregado ele e as suas equipas; trabalhador ele. */
    private static Scope scope(String column, OrgRole role, UUID me) {
        if (role.atLeast(OrgRole.MANAGER)) {
            return new Scope("TRUE", List.of());
        }
        if (me == null) {
            return new Scope("FALSE", List.of());
        }
        if (role == OrgRole.WORKER) {
            return new Scope(column + " = ?", List.of(me));
        }
        return new Scope("(" + column + " = ? OR " + column + " IN (SELECT member.employee_id FROM team_members member "
                + "JOIN teams led ON led.organization_id = member.organization_id AND led.id = member.team_id "
                + "WHERE led.foreman_employee_id = ? AND (member.left_on IS NULL OR member.left_on >= current_date - 31)))",
                List.of(me, me));
    }
}
