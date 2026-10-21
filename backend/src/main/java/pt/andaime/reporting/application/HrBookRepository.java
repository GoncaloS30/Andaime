package pt.andaime.reporting.application;

import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import pt.andaime.reporting.domain.HrBook;

/** Leituras do livro do RH, protegidas pelo RLS da organização corrente. */
@Component
class HrBookRepository {

    private final JdbcTemplate jdbcTemplate;

    HrBookRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    record PolicyCodes(HrBook.ActivityTable activities, Set<Integer> restDays) {
    }

    /** Código normal, escalões de horas extra e dias de descanso da política da empresa em vigor na data. */
    PolicyCodes policy(LocalDate effectiveOn) {
        var policy = jdbcTemplate.query("""
                SELECT id, normal_code, rest_days FROM labor_policies
                WHERE country IS NULL AND effective_during @> ?::date
                """, (resultSet, rowNumber) -> {
            var rest = new HashSet<Integer>();
            for (var day : (Object[]) resultSet.getArray("rest_days").getArray()) rest.add(((Number) day).intValue());
            return new PolicyRow(resultSet.getObject("id", UUID.class), resultSet.getString("normal_code"), rest);
        }, effectiveOn).stream().findFirst();
        if (policy.isEmpty()) return new PolicyCodes(new HrBook.ActivityTable(null, List.of()), Set.of(6, 7));
        var tiers = jdbcTemplate.query("""
                SELECT CASE WHEN jsonb_typeof(tier -> 'upToMin') = 'number' THEN round((tier ->> 'upToMin')::numeric)::int END up_to,
                       tier ->> 'code' code
                FROM labor_policies policy,
                     jsonb_array_elements(CASE WHEN jsonb_typeof(policy.overtime_tiers) = 'array'
                                               THEN policy.overtime_tiers ELSE '[]'::jsonb END) tier
                WHERE policy.id = ? AND jsonb_typeof(tier) = 'object'
                """, (resultSet, rowNumber) -> new HrBook.Tier((Integer) resultSet.getObject("up_to"), resultSet.getString("code")),
                policy.get().id());
        return new PolicyCodes(new HrBook.ActivityTable(policy.get().normalCode(), tiers), policy.get().restDays());
    }

    private record PolicyRow(UUID id, String normalCode, Set<Integer> restDays) {
    }

    /** Feriados da empresa no período (os nacionais vêm de {@code policy.PublicHolidays}). */
    Set<LocalDate> organizationHolidays(LocalDate from, LocalDate to) {
        return new HashSet<>(jdbcTemplate.query("""
                SELECT holiday_date FROM org_holidays WHERE holiday_date BETWEEN ? AND ?
                """, (resultSet, rowNumber) -> resultSet.getObject(1, LocalDate.class), from, to));
    }

    String organizationCountry() {
        return jdbcTemplate.query("SELECT country FROM organizations WHERE id = app.current_org_id()",
                (resultSet, rowNumber) -> resultSet.getString(1)).stream().findFirst().map(String::strip).orElse(null);
    }

    /** Horas aprovadas (projeção de reporting) somadas por pessoa, dia e obra. */
    List<HrBook.WorkedDay> worked(LocalDate from, LocalDate to) {
        return jdbcTemplate.query("""
                SELECT fact.employee_id, fact.work_date, site.code, site.erp_order,
                       sum(fact.worked_min)::int worked_min, sum(fact.normal_min)::int normal_min,
                       sum(fact.overtime_min)::int overtime_min
                FROM reporting_time_facts fact
                JOIN sites site ON site.organization_id = fact.organization_id AND site.id = fact.site_id
                WHERE fact.work_date BETWEEN ? AND ?
                GROUP BY fact.employee_id, fact.work_date, site.code, site.erp_order
                """, (resultSet, rowNumber) -> new HrBook.WorkedDay(resultSet.getObject("employee_id", UUID.class),
                resultSet.getObject("work_date", LocalDate.class), resultSet.getString("code"), resultSet.getString("erp_order"),
                resultSet.getInt("worked_min"), resultSet.getInt("normal_min"), resultSet.getInt("overtime_min")), from, to);
    }

    List<HrBook.Absence> approvedAbsences(LocalDate from, LocalDate to) {
        return jdbcTemplate.query("""
                SELECT employee_id, kind, starts_on, ends_on, partial_minutes FROM absences
                WHERE status = 'APPROVED' AND starts_on <= ? AND ends_on >= ?
                """, (resultSet, rowNumber) -> new HrBook.Absence(resultSet.getObject("employee_id", UUID.class),
                resultSet.getString("kind"), resultSet.getObject("starts_on", LocalDate.class),
                resultSet.getObject("ends_on", LocalDate.class), (Integer) resultSet.getObject("partial_minutes")), to, from);
    }

    List<HrBook.Employee> employees(Set<UUID> ids) {
        if (ids.isEmpty()) return List.of();
        return jdbcTemplate.query("SELECT id, full_name, number FROM employees WHERE id = ANY (?::uuid[])",
                (resultSet, rowNumber) -> new HrBook.Employee(resultSet.getObject("id", UUID.class),
                        resultSet.getString("full_name"), resultSet.getString("number")),
                (Object) ids.stream().map(UUID::toString).toArray(String[]::new));
    }

    /**
     * Dias (pessoa × dia) com registos fechados em semanas ainda não aprovadas: ficam fora do livro, e o ecrã avisa.
     */
    int pendingDays(LocalDate from, LocalDate to) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(DISTINCT (entry.employee_id, entry.work_date))::int
                FROM time_entries entry
                LEFT JOIN timesheets sheet ON sheet.organization_id = entry.organization_id
                 AND sheet.employee_id = entry.employee_id
                 AND sheet.week_start = entry.work_date - (extract(isodow FROM entry.work_date)::int - 1)
                WHERE entry.status = 'CLOSED' AND entry.work_date BETWEEN ? AND ?
                  AND (sheet.status IS NULL OR sheet.status <> 'APPROVED')
                """, Integer.class, from, to);
        return count == null ? 0 : count;
    }
}
