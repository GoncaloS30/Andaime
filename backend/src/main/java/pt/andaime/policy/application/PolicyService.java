package pt.andaime.policy.application;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Política laboral da empresa (horas normais por dia e semana, dias de descanso, pausa automática, turnos noturnos)
 * e feriados próprios. Alterar a política vale de hoje em diante: o período anterior fica fechado na véspera, para
 * que as semanas passadas continuem a ser calculadas com as regras que estavam em vigor.
 */
@Service
public class PolicyService {

    public record LaborPolicy(int dailyNormalMin, int weeklyNormalMin, List<Integer> restDays, Integer autoBreakAfterMin,
            Integer autoBreakMin, String overnightAttribution, LocalDate effectiveFrom, int version) {
    }

    public record Holiday(UUID id, LocalDate date, String name) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final Clock clock;

    public PolicyService(JdbcTemplate jdbcTemplate, AuditLog auditLog, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public LaborPolicy current() {
        OrgRole.require(OrgRole.FOREMAN);
        return jdbcTemplate.query("""
                SELECT daily_normal_min, weekly_normal_min, rest_days, auto_break_after_min, auto_break_min,
                       overnight_attribution, lower(effective_during) AS effective_from, version
                FROM labor_policies WHERE country IS NULL AND effective_during @> ?::date
                """, (resultSet, rowNumber) -> {
            var rest = new ArrayList<Integer>();
            for (var day : (Object[]) resultSet.getArray("rest_days").getArray()) {
                rest.add(((Number) day).intValue());
            }
            return new LaborPolicy(resultSet.getInt(1), resultSet.getInt(2), rest, (Integer) resultSet.getObject(4),
                    (Integer) resultSet.getObject(5), resultSet.getString(6), resultSet.getObject(7, LocalDate.class), resultSet.getInt(8));
        }, today()).stream().findFirst()
                .orElse(new LaborPolicy(480, 2400, List.of(6, 7), 360, 60, "START_DAY", null, -1));
    }

    @Transactional
    public LaborPolicy update(LaborPolicy input) {
        OrgRole.require(OrgRole.ADMIN);
        validate(input);
        var current = current();
        if (current.version() >= 0 && input.version() != current.version()) {
            throw new ApiException(HttpStatus.CONFLICT, "stale", "A política foi alterada entretanto. Recarregue e tente de novo.");
        }
        var today = today();
        var rest = new TreeSet<>(input.restDays()).toArray(Integer[]::new);
        var organizationId = TenantContext.organizationId().orElseThrow();
        if (today.equals(current.effectiveFrom())) {
            jdbcTemplate.update("""
                    UPDATE labor_policies SET daily_normal_min = ?, weekly_normal_min = ?, rest_days = ?::smallint[],
                           auto_break_after_min = ?, auto_break_min = ?, overnight_attribution = ?, version = version + 1
                    WHERE country IS NULL AND effective_during @> ?::date
                    """, input.dailyNormalMin(), input.weeklyNormalMin(), array(rest), input.autoBreakAfterMin(), input.autoBreakMin(),
                    input.overnightAttribution(), today);
        } else {
            jdbcTemplate.update("""
                    UPDATE labor_policies SET effective_during = daterange(lower(effective_during), ?::date, '[)'), version = version + 1
                    WHERE country IS NULL AND effective_during @> ?::date
                    """, today, today);
            jdbcTemplate.update("""
                    INSERT INTO labor_policies (organization_id, country, effective_during, daily_normal_min, weekly_normal_min,
                                                rest_days, auto_break_after_min, auto_break_min, overnight_attribution)
                    VALUES (?, NULL, daterange(?::date, NULL, '[)'), ?, ?, ?::smallint[], ?, ?, ?)
                    """, organizationId, today, input.dailyNormalMin(), input.weeklyNormalMin(), array(rest), input.autoBreakAfterMin(),
                    input.autoBreakMin(), input.overnightAttribution());
        }
        var changes = new LinkedHashMap<String, Object>();
        diff(changes, "dailyNormalMin", current.dailyNormalMin(), input.dailyNormalMin());
        diff(changes, "weeklyNormalMin", current.weeklyNormalMin(), input.weeklyNormalMin());
        diff(changes, "restDays", current.restDays(), List.of(rest));
        diff(changes, "autoBreakAfterMin", current.autoBreakAfterMin(), input.autoBreakAfterMin());
        diff(changes, "autoBreakMin", current.autoBreakMin(), input.autoBreakMin());
        diff(changes, "overnightAttribution", current.overnightAttribution(), input.overnightAttribution());
        changes.put("effectiveFrom", today.toString());
        auditLog.record("labor-policy.updated", "organization", organizationId, changes);
        return current();
    }

    @Transactional(readOnly = true)
    public List<Holiday> holidays(int year) {
        OrgRole.require(OrgRole.FOREMAN);
        return jdbcTemplate.query("""
                SELECT id, holiday_date, name FROM org_holidays WHERE extract(year FROM holiday_date) = ? ORDER BY holiday_date
                """, (resultSet, rowNumber) -> new Holiday(resultSet.getObject(1, UUID.class), resultSet.getObject(2, LocalDate.class),
                resultSet.getString(3)), year);
    }

    @Transactional
    public Holiday addHoliday(LocalDate date, String name) {
        OrgRole.require(OrgRole.ADMIN);
        if (date == null || name == null || name.isBlank() || name.length() > 120) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a data e o nome do feriado.");
        }
        try {
            var id = jdbcTemplate.queryForObject("""
                    INSERT INTO org_holidays (organization_id, holiday_date, name) VALUES (?, ?, ?) RETURNING id
                    """, UUID.class, TenantContext.organizationId().orElseThrow(), date, name.strip());
            auditLog.record("holiday.added", "organization", TenantContext.organizationId().orElseThrow(),
                    Map.of("date", date.toString(), "name", name.strip()));
            return new Holiday(id, date, name.strip());
        } catch (DuplicateKeyException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "duplicate", "Esse feriado já existe.");
        }
    }

    @Transactional
    public void removeHoliday(UUID id) {
        OrgRole.require(OrgRole.ADMIN);
        var removed = jdbcTemplate.query("DELETE FROM org_holidays WHERE id = ? RETURNING holiday_date, name",
                (resultSet, rowNumber) -> resultSet.getObject(1, LocalDate.class) + " " + resultSet.getString(2), id);
        if (removed.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "O feriado não foi encontrado.");
        }
        auditLog.record("holiday.removed", "organization", TenantContext.organizationId().orElseThrow(),
                Map.of("holiday", removed.getFirst()));
    }

    private static void validate(LaborPolicy input) {
        if (input.dailyNormalMin() < 60 || input.dailyNormalMin() > 720) {
            throw invalid("dailyNormalMin", "Horas normais por dia entre 1 e 12.");
        }
        if (input.weeklyNormalMin() < input.dailyNormalMin() || input.weeklyNormalMin() > 4200) {
            throw invalid("weeklyNormalMin", "Horas normais por semana entre o limite diário e 70.");
        }
        if (input.restDays() == null || input.restDays().stream().anyMatch(d -> d == null || d < 1 || d > 7)
                || Set.copyOf(input.restDays()).size() > 6) {
            throw invalid("restDays", "Dias de descanso inválidos.");
        }
        if ((input.autoBreakAfterMin() == null) != (input.autoBreakMin() == null)) {
            throw invalid("autoBreakMin", "Indique as duas regras da pausa automática ou nenhuma.");
        }
        if (input.autoBreakAfterMin() != null && (input.autoBreakAfterMin() < 60 || input.autoBreakAfterMin() > 720
                || input.autoBreakMin() < 5 || input.autoBreakMin() > 180)) {
            throw invalid("autoBreakMin", "Pausa automática inválida.");
        }
        if (!Set.of("START_DAY", "SPLIT_MIDNIGHT").contains(Objects.requireNonNullElse(input.overnightAttribution(), ""))) {
            throw invalid("overnightAttribution", "Escolha como contar os turnos noturnos.");
        }
    }

    private static void diff(Map<String, Object> changes, String field, Object before, Object after) {
        if (!Objects.equals(before, after)) {
            var change = new LinkedHashMap<String, Object>();
            change.put("from", before);
            change.put("to", after);
            changes.put(field, change);
        }
    }

    private static String array(Integer[] values) {
        return "{" + String.join(",", java.util.Arrays.stream(values).map(String::valueOf).toList()) + "}";
    }

    private LocalDate today() {
        return TenantContext.today(clock);
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
    }
}
