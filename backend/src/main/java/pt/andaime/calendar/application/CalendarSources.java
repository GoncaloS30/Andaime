package pt.andaime.calendar.application;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import pt.andaime.calendar.application.CalendarViews.CalendarItem;
import pt.andaime.calendar.application.CalendarViews.Layer;
import pt.andaime.calendar.application.CalendarViews.Link;
import pt.andaime.policy.PublicHolidays;
import pt.andaime.shared.tenant.OrgRole;

/**
 * Leituras de cada camada da agenda diretamente nas tabelas de origem (como o módulo de relatórios), protegidas pelo
 * RLS da organização corrente. Nada é copiado para a agenda.
 * <p>
 * Âmbito por papel:
 * <ul>
 * <li>gestor (MANAGER ou acima): tudo;</li>
 * <li>encarregado: ausências e validades de documentos dele e de quem está nas suas equipas; datas das obras de que é
 * encarregado ou onde as suas equipas trabalharam nos últimos 30 dias (a mesma regra da lista de obras); sem
 * viaturas;</li>
 * <li>trabalhador: só as suas ausências;</li>
 * <li>todos: feriados e eventos da empresa.</li>
 * </ul>
 * A doença (dado de saúde) só aparece como tal a gestores e ao próprio; os outros veem "Ausência".
 */
@Component
class CalendarSources {

    static final Map<String, String> ABSENCE_LABEL = Map.of("VACATION", "Férias", "SICK", "Doença", "TRAINING", "Formação",
            "PERSONAL", "Assunto pessoal", "LEAVE", "Licença", "OTHER", "Outra ausência", "ABSENCE", "Ausência");

    record Viewer(OrgRole role, UUID employeeId) {

        boolean manager() {
            return role.atLeast(OrgRole.MANAGER);
        }

        boolean foreman() {
            return role == OrgRole.FOREMAN;
        }
    }

    private record Scope(String sql, List<Object> params) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final PublicHolidays publicHolidays;

    CalendarSources(JdbcTemplate jdbcTemplate, PublicHolidays publicHolidays) {
        this.jdbcTemplate = jdbcTemplate;
        this.publicHolidays = publicHolidays;
    }

    // --- ausências aprovadas -----------------------------------------------------------------------------

    List<CalendarItem> absences(LocalDate from, LocalDate to, Viewer viewer) {
        var scope = employeeScope("absence.employee_id", viewer, false);
        var params = new ArrayList<Object>(List.of(to, from));
        params.addAll(scope.params());
        return jdbcTemplate.query("""
                SELECT absence.id, absence.employee_id, employee.full_name, absence.kind, absence.starts_on, absence.ends_on,
                       absence.partial_minutes
                FROM absences absence
                JOIN employees employee ON employee.organization_id = absence.organization_id AND employee.id = absence.employee_id
                WHERE absence.status = 'APPROVED' AND absence.starts_on <= ? AND absence.ends_on >= ? AND\s"""
                + scope.sql() + " ORDER BY absence.starts_on, employee.full_name LIMIT 3000", (resultSet, rowNumber) -> {
            var employeeId = resultSet.getObject("employee_id", UUID.class);
            var kind = resultSet.getString("kind");
            if ("SICK".equals(kind) && !viewer.manager() && !employeeId.equals(viewer.employeeId())) {
                kind = "ABSENCE";
            }
            var partial = (Integer) resultSet.getObject("partial_minutes");
            var title = resultSet.getString("full_name") + " · " + ABSENCE_LABEL.get(kind);
            return new CalendarItem("absence:" + resultSet.getObject("id", UUID.class), Layer.ABSENCE, kind, title,
                    partial == null ? null : "Parte do dia (" + partial + " min)",
                    resultSet.getObject("starts_on", LocalDate.class), resultSet.getObject("ends_on", LocalDate.class), null,
                    "VACATION".equals(kind) ? "vacation" : "absence", null, false,
                    viewer.role() == OrgRole.WORKER ? null : new Link("EMPLOYEE", employeeId));
        }, params.toArray());
    }

    // --- datas das obras ---------------------------------------------------------------------------------

    List<CalendarItem> siteDates(LocalDate from, LocalDate to, Viewer viewer) {
        if (!viewer.manager() && (!viewer.foreman() || viewer.employeeId() == null)) {
            return List.of();
        }
        var scope = viewer.manager() ? new Scope("TRUE", List.of()) : new Scope("""
                (site.foreman_employee_id = ? OR site.id IN (SELECT assignment.site_id FROM assignments assignment
                 JOIN teams team ON team.organization_id = assignment.organization_id AND team.id = assignment.team_id
                 WHERE team.foreman_employee_id = ? AND assignment.work_date >= current_date - 30))""",
                List.of(viewer.employeeId(), viewer.employeeId()));
        var params = new ArrayList<Object>(List.of(from, to, from, to, from, to));
        params.addAll(scope.params());
        var items = new ArrayList<CalendarItem>();
        jdbcTemplate.query("""
                SELECT site.id, site.code, site.name, site.color, site.start_date, site.end_date, site.contract_end_date
                FROM sites site
                WHERE site.archived_at IS NULL
                  AND (site.start_date BETWEEN ? AND ? OR site.end_date BETWEEN ? AND ? OR site.contract_end_date BETWEEN ? AND ?)
                  AND\s""" + scope.sql() + " ORDER BY site.code LIMIT 2000", resultSet -> {
            var id = resultSet.getObject("id", UUID.class);
            var code = resultSet.getString("code");
            var name = resultSet.getString("name");
            var color = resultSet.getString("color");
            var start = resultSet.getObject("start_date", LocalDate.class);
            var forecast = resultSet.getObject("end_date", LocalDate.class);
            var contract = resultSet.getObject("contract_end_date", LocalDate.class);
            var late = contract != null && forecast != null && forecast.isAfter(contract);
            var link = new Link("SITE", id);
            if (within(start, from, to)) {
                items.add(new CalendarItem("site:" + id + ":start", Layer.SITE, "SITE_START", code + " · Início", name, start, start,
                        null, "site", color, false, link));
            }
            if (within(contract, from, to)) {
                items.add(new CalendarItem("site:" + id + ":contract-end", Layer.SITE, "SITE_CONTRACT_END", code + " · Fim contratual",
                        name, contract, contract, null, late ? "late" : "site", color, late, link));
            }
            // A previsão só aparece à parte quando difere do fim contratual (como no protótipo).
            if (within(forecast, from, to) && !forecast.equals(contract)) {
                items.add(new CalendarItem("site:" + id + ":forecast-end", Layer.SITE, "SITE_FORECAST_END",
                        code + " · Previsão de fim" + (late ? " (atrasada)" : ""), name, forecast, forecast, null,
                        late ? "late" : "site", color, late, link));
            }
        }, params.toArray());
        return items;
    }

    // --- validades ---------------------------------------------------------------------------------------

    /** Documentos (versão em vigor), seguros e inspeções das viaturas que expiram entre {@code from} e {@code to}. */
    List<CalendarItem> expiries(LocalDate from, LocalDate to, LocalDate today, Viewer viewer) {
        if (to.isBefore(from) || (!viewer.manager() && (!viewer.foreman() || viewer.employeeId() == null))) {
            return List.of();
        }
        var items = new ArrayList<CalendarItem>();
        var scope = viewer.manager() ? new Scope("TRUE", List.of())
                : new Scope("document.vehicle_id IS NULL AND " + employeeScope("document.employee_id", viewer, true).sql(),
                        employeeScope("document.employee_id", viewer, true).params());
        var params = new ArrayList<Object>(List.of(from, to));
        params.addAll(scope.params());
        jdbcTemplate.query("""
                SELECT document.id, document.employee_id, document.vehicle_id, type.name AS type_name, version.expires_on,
                       employee.full_name, vehicle.plate
                FROM documents document
                JOIN document_types type ON type.organization_id = document.organization_id AND type.id = document.document_type_id
                JOIN document_versions version ON version.organization_id = document.organization_id
                                              AND version.id = document.current_version_id
                LEFT JOIN employees employee ON employee.organization_id = document.organization_id AND employee.id = document.employee_id
                LEFT JOIN vehicles vehicle ON vehicle.organization_id = document.organization_id AND vehicle.id = document.vehicle_id
                WHERE document.archived_at IS NULL AND version.expires_on BETWEEN ? AND ?
                  AND (employee.id IS NULL OR employee.archived_at IS NULL) AND (vehicle.id IS NULL OR vehicle.archived_at IS NULL)
                  AND\s""" + scope.sql() + " ORDER BY version.expires_on LIMIT 3000", resultSet -> {
            var expires = resultSet.getObject("expires_on", LocalDate.class);
            var employeeId = resultSet.getObject("employee_id", UUID.class);
            var vehicleId = resultSet.getObject("vehicle_id", UUID.class);
            var owner = employeeId != null ? resultSet.getString("full_name") : resultSet.getString("plate");
            items.add(new CalendarItem("document:" + resultSet.getObject("id", UUID.class), Layer.EXPIRY, "DOCUMENT",
                    "Validade: " + resultSet.getString("type_name") + " · " + owner, null, expires, expires, null,
                    expiryTone(expires, today), null, false,
                    employeeId != null ? new Link("EMPLOYEE_DOCUMENTS", employeeId) : new Link("VEHICLE", vehicleId)));
        }, params.toArray());
        if (viewer.manager()) {
            jdbcTemplate.query("""
                    SELECT id, plate, insurance_until, inspection_until FROM vehicles
                    WHERE archived_at IS NULL AND (insurance_until BETWEEN ? AND ? OR inspection_until BETWEEN ? AND ?)
                    ORDER BY plate LIMIT 2000
                    """, resultSet -> {
                var id = resultSet.getObject("id", UUID.class);
                var plate = resultSet.getString("plate");
                var insurance = resultSet.getObject("insurance_until", LocalDate.class);
                var inspection = resultSet.getObject("inspection_until", LocalDate.class);
                if (within(insurance, from, to)) {
                    items.add(new CalendarItem("vehicle:" + id + ":insurance", Layer.EXPIRY, "INSURANCE", "Seguro: " + plate, null,
                            insurance, insurance, null, expiryTone(insurance, today), null, false, new Link("VEHICLE", id)));
                }
                if (within(inspection, from, to)) {
                    items.add(new CalendarItem("vehicle:" + id + ":inspection", Layer.EXPIRY, "INSPECTION", "Inspeção: " + plate, null,
                            inspection, inspection, null, expiryTone(inspection, today), null, false, new Link("VEHICLE", id)));
                }
            }, from, to, from, to);
        }
        return items;
    }

    // --- feriados ----------------------------------------------------------------------------------------

    /** Feriados nacionais do país da empresa e feriados próprios da empresa. */
    List<CalendarItem> holidays(LocalDate from, LocalDate to) {
        var items = new ArrayList<CalendarItem>();
        var country = jdbcTemplate.query("SELECT country FROM organizations WHERE id = app.current_org_id()",
                (resultSet, rowNumber) -> resultSet.getString(1)).stream().filter(c -> c != null && !c.isBlank())
                .map(String::strip).findFirst();
        country.ifPresent(c -> {
            for (var year = from.getYear(); year <= to.getYear(); year++) {
                for (var holiday : publicHolidays.national(c, year)) {
                    if (within(holiday.date(), from, to)) {
                        items.add(new CalendarItem("holiday:public:" + holiday.date(), Layer.HOLIDAY, "PUBLIC_HOLIDAY", holiday.name(),
                                "Feriado nacional", holiday.date(), holiday.date(), null, "holiday", null, false, null));
                    }
                }
            }
        });
        jdbcTemplate.query("SELECT id, holiday_date, name FROM org_holidays WHERE holiday_date BETWEEN ? AND ? ORDER BY holiday_date",
                resultSet -> {
                    var date = resultSet.getObject("holiday_date", LocalDate.class);
                    items.add(new CalendarItem("holiday:company:" + resultSet.getObject("id", UUID.class), Layer.HOLIDAY,
                            "COMPANY_HOLIDAY", resultSet.getString("name"), "Feriado da empresa", date, date, null, "holiday", null,
                            false, null));
                }, from, to);
        return items;
    }

    // --- eventos próprios --------------------------------------------------------------------------------

    List<CalendarItem> events(LocalDate from, LocalDate to) {
        return jdbcTemplate.query("""
                SELECT id, title, starts_on, ends_on, start_time, location FROM calendar_events
                WHERE starts_on <= ? AND ends_on >= ? ORDER BY starts_on, start_time NULLS FIRST LIMIT 2000
                """, CalendarSources::event, to, from);
    }

    CalendarItem event(UUID id) {
        return jdbcTemplate.query("SELECT id, title, starts_on, ends_on, start_time, location FROM calendar_events WHERE id = ?",
                CalendarSources::event, id).stream().findFirst().orElse(null);
    }

    private static CalendarItem event(java.sql.ResultSet resultSet, int rowNumber) throws java.sql.SQLException {
        var id = resultSet.getObject("id", UUID.class);
        return new CalendarItem("event:" + id, Layer.EVENT, "EVENT", resultSet.getString("title"), resultSet.getString("location"),
                resultSet.getObject("starts_on", LocalDate.class), resultSet.getObject("ends_on", LocalDate.class),
                resultSet.getObject("start_time", LocalTime.class), "event", null, false, new Link("EVENT", id));
    }

    // --- auxiliares --------------------------------------------------------------------------------------

    /**
     * Gestor: todos; encarregado: ele próprio e quem está nas suas equipas ({@code current} = só hoje, como nos
     * documentos; senão até 31 dias depois de sair, como nas ausências); trabalhador: ele próprio.
     */
    private static Scope employeeScope(String column, Viewer viewer, boolean current) {
        if (viewer.manager()) {
            return new Scope("TRUE", List.of());
        }
        var me = viewer.employeeId();
        if (me == null) {
            return new Scope("FALSE", List.of());
        }
        if (viewer.role() == OrgRole.WORKER) {
            return new Scope(column + " = ?", List.of(me));
        }
        var membership = current ? "member.joined_on <= current_date AND (member.left_on IS NULL OR member.left_on >= current_date)"
                : "(member.left_on IS NULL OR member.left_on >= current_date - 31)";
        return new Scope("(" + column + " = ? OR " + column + " IN (SELECT member.employee_id FROM team_members member "
                + "JOIN teams led ON led.organization_id = member.organization_id AND led.id = member.team_id "
                + "WHERE led.foreman_employee_id = ? AND " + membership + "))", List.of(me, me));
    }

    private static boolean within(LocalDate date, LocalDate from, LocalDate to) {
        return date != null && !date.isBefore(from) && !date.isAfter(to);
    }

    private static String expiryTone(LocalDate expires, LocalDate today) {
        return expires.isBefore(today) ? "expired" : "expiring";
    }
}
