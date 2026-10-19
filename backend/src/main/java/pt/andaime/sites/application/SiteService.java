package pt.andaime.sites.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
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
import pt.andaime.organization.MemberDirectory;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.sites.application.SiteViews.Ref;
import pt.andaime.sites.application.SiteViews.SiteDetail;
import pt.andaime.sites.application.SiteViews.SiteInput;
import pt.andaime.sites.application.SiteViews.SiteSummary;
import pt.andaime.sites.domain.SiteMetrics;
import pt.andaime.workforce.EmployeeDirectory;

/**
 * Obras. Âmbito: gestores vêem todas; o encarregado vê as obras de que é encarregado
 * (a partir de F3 também as obras onde as suas equipas estão planeadas); o trabalhador não acede.
 */
@Service
public class SiteService {

    /** Fuso por omissão a partir do país da obra (editável). */
    static final Map<String, String> COUNTRY_ZONE = Map.ofEntries(
            Map.entry("PT", "Europe/Lisbon"), Map.entry("ES", "Europe/Madrid"), Map.entry("FR", "Europe/Paris"),
            Map.entry("BE", "Europe/Brussels"), Map.entry("LU", "Europe/Luxembourg"),
            Map.entry("NL", "Europe/Amsterdam"), Map.entry("DE", "Europe/Berlin"), Map.entry("CH", "Europe/Zurich"),
            Map.entry("GB", "Europe/London"), Map.entry("IE", "Europe/Dublin"), Map.entry("AT", "Europe/Vienna"),
            Map.entry("IT", "Europe/Rome"));
    private static final List<String> PALETTE = List.of(
            "#2a78d6", "#d4652f", "#1a9e72", "#8a4fc7", "#c0457f", "#3f8a2a", "#4a3aa7", "#8f8a14", "#2196a8", "#b5532c");
    private static final Set<String> NOT_AUDITED_VALUES = Set.of("description");

    private static final String SELECT = """
            SELECT site.*, client.name AS client_name, foreman.full_name AS foreman_name,
                   director.display_name AS director_name,
                   (SELECT count(*) FROM site_issues issue WHERE issue.site_id = site.id AND issue.status = 'OPEN') AS open_issues,
                   (SELECT coalesce(sum(assignment.planned_min), 0) FROM assignments assignment
                    WHERE assignment.organization_id = site.organization_id AND assignment.site_id = site.id
                      AND assignment.work_date >= ?) AS planned_future_min
            FROM sites site
            LEFT JOIN clients client ON client.organization_id = site.organization_id AND client.id = site.client_id
            LEFT JOIN employees foreman ON foreman.organization_id = site.organization_id AND foreman.id = site.foreman_employee_id
            LEFT JOIN users director ON director.id = site.director_user_id
            """;

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final EmployeeDirectory employees;
    private final MemberDirectory members;
    private final Clock clock;

    public SiteService(
            JdbcTemplate jdbcTemplate,
            AuditLog auditLog,
            EmployeeDirectory employees,
            MemberDirectory members,
            Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.employees = employees;
        this.members = members;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<SiteSummary> list(String query, String status, String country, boolean archived) {
        var scope = scope();
        var where = new StringBuilder(scope.sql());
        var params = new ArrayList<Object>(List.of(TenantContext.today(clock)));
        params.addAll(scope.params());
        where.append(archived ? " AND site.archived_at IS NOT NULL" : " AND site.archived_at IS NULL");
        if (status != null && !status.isBlank()) {
            where.append(" AND site.status = ?");
            params.add(status.toUpperCase(Locale.ROOT));
        }
        if (country != null && !country.isBlank()) {
            where.append(" AND site.country = ?");
            params.add(country.toUpperCase(Locale.ROOT));
        }
        if (query != null && !query.isBlank()) {
            where.append(" AND (site.code ILIKE ? OR site.name ILIKE ? OR site.city ILIKE ? OR client.name ILIKE ?)");
            var like = "%" + query.strip().replace("%", "\\%").replace("_", "\\_") + "%";
            for (int i = 0; i < 4; i++) {
                params.add(like);
            }
        }
        return jdbcTemplate.query(SELECT + " WHERE " + where + " ORDER BY site.code LIMIT 1000",
                (resultSet, rowNumber) -> new SiteSummary(
                        resultSet.getObject("id", UUID.class),
                        resultSet.getString("code"),
                        resultSet.getString("name"),
                        resultSet.getString("status"),
                        resultSet.getString("country"),
                        resultSet.getString("city"),
                        resultSet.getBigDecimal("latitude"),
                        resultSet.getBigDecimal("longitude"),
                        resultSet.getString("color"),
                        resultSet.getObject("start_date", LocalDate.class),
                        resultSet.getObject("end_date", LocalDate.class),
                        ref(resultSet, "client_id", "client_name"),
                        ref(resultSet, "foreman_employee_id", "foreman_name"),
                        resultSet.getInt("open_issues"),
                        resultSet.getObject("archived_at") != null,
                        metrics(resultSet)), params.toArray());
    }

    @Transactional(readOnly = true)
    public SiteDetail get(UUID siteId) {
        var scope = scope();
        var params = new ArrayList<Object>(List.of(TenantContext.today(clock), siteId));
        params.addAll(scope.params());
        return jdbcTemplate.query(SELECT + " WHERE site.id = ? AND " + scope.sql(), this::detail, params.toArray())
                .stream().findFirst().orElseThrow(SiteService::notFound);
    }

    @Transactional
    public SiteDetail create(SiteInput input) {
        OrgRole.require(OrgRole.MANAGER);
        var organizationId = TenantContext.organizationId().orElseThrow();
        jdbcTemplate.query("SELECT id FROM organizations WHERE id = ? FOR UPDATE",
                (resultSet, rowNumber) -> resultSet.getObject(1), organizationId);
        var today = TenantContext.today(clock);
        var values = normalize(input, null, today);
        ensureCodeFree((String) values.get("code"), null);
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO sites (organization_id, code, name, client_id, country, city, address, latitude, longitude,
                    timezone, status, start_date, end_date, hour_limit_min, baseline_realized_min, baseline_approved_min,
                    director_user_id, foreman_employee_id, color, description, erp_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, organizationId, values.get("code"), values.get("name"), values.get("clientId"),
                values.get("country"), values.get("city"), values.get("address"), values.get("latitude"),
                values.get("longitude"), values.get("timezone"), values.get("status"), values.get("startDate"),
                values.get("endDate"), values.get("hourLimitMin"), values.get("baselineRealizedMin"),
                values.get("baselineApprovedMin"), values.get("directorUserId"), values.get("foremanEmployeeId"),
                values.get("color"), values.get("description"), values.get("erpOrder"));
        auditLog.record("site.created", "site", id, Changes.created(values, NOT_AUDITED_VALUES));
        return get(id);
    }

    @Transactional
    public SiteDetail update(UUID siteId, SiteInput input, int expectedVersion) {
        OrgRole.require(OrgRole.MANAGER);
        var current = get(siteId);
        var before = values(current);
        var after = normalize(input, current, TenantContext.today(clock));
        ensureCodeFree((String) after.get("code"), siteId);
        var updated = jdbcTemplate.update("""
                UPDATE sites SET code = ?, name = ?, client_id = ?, country = ?, city = ?, address = ?, latitude = ?,
                    longitude = ?, timezone = ?, status = ?, start_date = ?, end_date = ?, hour_limit_min = ?,
                    baseline_realized_min = ?, baseline_approved_min = ?, director_user_id = ?,
                    foreman_employee_id = ?, color = ?, description = ?, erp_order = ?, version = version + 1
                WHERE id = ? AND version = ? AND archived_at IS NULL
                """, after.get("code"), after.get("name"), after.get("clientId"), after.get("country"),
                after.get("city"), after.get("address"), after.get("latitude"), after.get("longitude"),
                after.get("timezone"), after.get("status"), after.get("startDate"), after.get("endDate"),
                after.get("hourLimitMin"), after.get("baselineRealizedMin"), after.get("baselineApprovedMin"),
                after.get("directorUserId"), after.get("foremanEmployeeId"), after.get("color"),
                after.get("description"), after.get("erpOrder"), siteId, expectedVersion);
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "stale", "A obra foi alterada por outra pessoa. Recarregue e tente de novo.");
        }
        var changes = Changes.diff(before, after, NOT_AUDITED_VALUES);
        if (!changes.isEmpty()) {
            auditLog.record("site.updated", "site", siteId, changes);
        }
        return get(siteId);
    }

    @Transactional
    public SiteDetail archive(UUID siteId, boolean archived) {
        OrgRole.require(OrgRole.MANAGER);
        get(siteId);
        jdbcTemplate.update(archived
                ? "UPDATE sites SET archived_at = now(), version = version + 1 WHERE id = ? AND archived_at IS NULL"
                : "UPDATE sites SET archived_at = NULL, version = version + 1 WHERE id = ? AND archived_at IS NOT NULL",
                siteId);
        auditLog.record(archived ? "site.archived" : "site.restored", "site", siteId);
        return get(siteId);
    }

    /** Sugestão de código para uma obra nova ({@code OB-AA-NNN}). */
    @Transactional(readOnly = true)
    public String suggestCode() {
        OrgRole.require(OrgRole.MANAGER);
        return nextCode(TenantContext.today(clock));
    }

    // --- âmbito ------------------------------------------------------------------------

    record Scope(String sql, List<Object> params) {
    }

    static Scope scope() {
        var role = OrgRole.current();
        if (role.atLeast(OrgRole.MANAGER)) {
            return new Scope("TRUE", List.of());
        }
        var me = TenantContext.employeeId().orElse(null);
        if (role == OrgRole.WORKER || me == null) {
            if (role == OrgRole.WORKER) {
                throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Não tem permissão para ver obras.");
            }
            return new Scope("FALSE", List.of());
        }
        return new Scope("""
                (site.foreman_employee_id = ? OR site.id IN (SELECT assignment.site_id FROM assignments assignment
                 JOIN teams team ON team.organization_id = assignment.organization_id AND team.id = assignment.team_id
                 WHERE team.foreman_employee_id = ? AND assignment.work_date >= current_date - 30))""", List.of(me, me));
    }

    // --- auxiliares ---------------------------------------------------------------------

    private Map<String, Object> normalize(SiteInput input, SiteDetail current, LocalDate today) {
        var values = new LinkedHashMap<String, Object>();
        var country = input.country().strip().toUpperCase(Locale.ROOT);
        var code = blank(input.code())
                ? (current == null ? nextCode(today) : current.code())
                : input.code().strip().toUpperCase(Locale.ROOT);
        values.put("code", code);
        values.put("name", input.name().strip());
        if (input.clientId() != null && !input.clientId().equals(current == null || current.client() == null ? null : current.client().id())) {
            var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM clients WHERE id = ? AND archived_at IS NULL)", Boolean.class, input.clientId()));
            if (!exists) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-client", "O cliente indicado não existe.");
            }
        }
        values.put("clientId", input.clientId());
        values.put("country", country);
        values.put("city", ClientService.blankToNull(input.city()));
        values.put("address", ClientService.blankToNull(input.address()));
        if ((input.latitude() == null) != (input.longitude() == null)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-coordinates", "Indique a latitude e a longitude, ou nenhuma.");
        }
        // Mesma escala da coluna numeric(9,6): evita "alterações" falsas na auditoria.
        values.put("latitude", input.latitude() == null ? null : input.latitude().setScale(6, java.math.RoundingMode.HALF_UP));
        values.put("longitude", input.longitude() == null ? null : input.longitude().setScale(6, java.math.RoundingMode.HALF_UP));
        values.put("timezone", zone(input.timezone(), country));
        var status = blank(input.status())
                ? (current != null ? current.status()
                        : input.startDate() != null && !input.startDate().isAfter(today) ? "ACTIVE" : "PLANNED")
                : input.status().toUpperCase(Locale.ROOT);
        values.put("status", status);
        if (input.startDate() != null && input.endDate() != null && input.endDate().isBefore(input.startDate())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-dates", "A data de fim é anterior à data de início.");
        }
        values.put("startDate", input.startDate());
        values.put("endDate", input.endDate());
        values.put("hourLimitMin", input.hourLimitMin());
        var realized = input.baselineRealizedMin() == null ? 0 : input.baselineRealizedMin();
        var approved = input.baselineApprovedMin() == null ? 0 : input.baselineApprovedMin();
        if (approved > realized) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-baseline",
                    "As horas aprovadas importadas não podem exceder as realizadas.");
        }
        values.put("baselineRealizedMin", realized);
        values.put("baselineApprovedMin", approved);
        if (input.directorUserId() != null && members.activeManagerName(input.directorUserId()).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-director",
                    "O diretor de obra tem de ser um gestor ativo da empresa.");
        }
        values.put("directorUserId", input.directorUserId());
        var currentForeman = current == null || current.foreman() == null ? null : current.foreman().id();
        if (input.foremanEmployeeId() != null && !input.foremanEmployeeId().equals(currentForeman)) {
            employees.requireActive(input.foremanEmployeeId(), "foreman");
        }
        values.put("foremanEmployeeId", input.foremanEmployeeId());
        values.put("color", blank(input.color())
                ? (current != null ? current.color() : PALETTE.get(Math.floorMod(code.hashCode(), PALETTE.size())))
                : input.color());
        values.put("description", ClientService.blankToNull(input.description()));
        values.put("erpOrder", ClientService.blankToNull(input.erpOrder()));
        return values;
    }

    private static Map<String, Object> values(SiteDetail site) {
        var values = new LinkedHashMap<String, Object>();
        values.put("code", site.code());
        values.put("name", site.name());
        values.put("clientId", site.client() == null ? null : site.client().id());
        values.put("country", site.country());
        values.put("city", site.city());
        values.put("address", site.address());
        values.put("latitude", site.latitude());
        values.put("longitude", site.longitude());
        values.put("timezone", site.timezone());
        values.put("status", site.status());
        values.put("startDate", site.startDate());
        values.put("endDate", site.endDate());
        values.put("hourLimitMin", site.hourLimitMin());
        values.put("baselineRealizedMin", site.baselineRealizedMin());
        values.put("baselineApprovedMin", site.baselineApprovedMin());
        values.put("directorUserId", site.director() == null ? null : site.director().id());
        values.put("foremanEmployeeId", site.foreman() == null ? null : site.foreman().id());
        values.put("color", site.color());
        values.put("description", site.description());
        values.put("erpOrder", site.erpOrder());
        return values;
    }

    private String zone(String requested, String country) {
        var candidate = blank(requested) ? COUNTRY_ZONE.getOrDefault(country, TenantContext.zone().getId()) : requested.strip();
        try {
            return ZoneId.of(candidate).getId();
        } catch (DateTimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-timezone", "O fuso horário é inválido.");
        }
    }

    private String nextCode(LocalDate today) {
        var prefix = "OB-%02d-".formatted(today.getYear() % 100);
        var last = jdbcTemplate.queryForObject("""
                SELECT coalesce(max(substring(code FROM '^' || ? || '([0-9]{1,6})$')::int), 0)
                FROM sites WHERE code LIKE ? || '%'
                """, Integer.class, prefix, prefix);
        return prefix + "%03d".formatted((last == null ? 0 : last) + 1);
    }

    private void ensureCodeFree(String code, UUID except) {
        var taken = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM sites WHERE code = ? AND id IS DISTINCT FROM ?)", Boolean.class, code, except));
        if (taken) {
            throw new ApiException(HttpStatus.CONFLICT, "code-taken", "Já existe uma obra com o código " + code + ".");
        }
    }

    private SiteDetail detail(ResultSet resultSet, int rowNumber) throws SQLException {
        return new SiteDetail(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("code"),
                resultSet.getString("name"),
                resultSet.getString("status"),
                resultSet.getString("country"),
                resultSet.getString("city"),
                resultSet.getString("address"),
                resultSet.getBigDecimal("latitude"),
                resultSet.getBigDecimal("longitude"),
                resultSet.getString("timezone"),
                resultSet.getString("color"),
                resultSet.getObject("start_date", LocalDate.class),
                resultSet.getObject("end_date", LocalDate.class),
                (Integer) resultSet.getObject("hour_limit_min"),
                resultSet.getInt("baseline_realized_min"),
                resultSet.getInt("baseline_approved_min"),
                resultSet.getString("description"),
                resultSet.getString("erp_order"),
                ref(resultSet, "client_id", "client_name"),
                ref(resultSet, "director_user_id", "director_name"),
                ref(resultSet, "foreman_employee_id", "foreman_name"),
                resultSet.getInt("open_issues"),
                resultSet.getObject("archived_at") == null ? null
                        : resultSet.getObject("archived_at", OffsetDateTime.class).toInstant(),
                metrics(resultSet),
                resultSet.getInt("version"));
    }

    /**
     * Métricas a partir dos dados persistidos. Até existir registo de horas (F4), as realizadas e aprovadas vêm só
     * do histórico importado; as planeadas são as atribuições de hoje em diante.
     */
    private static SiteMetrics metrics(ResultSet resultSet) throws SQLException {
        return SiteMetrics.of(
                (Integer) resultSet.getObject("hour_limit_min"),
                resultSet.getInt("baseline_realized_min"),
                resultSet.getInt("baseline_approved_min"),
                resultSet.getInt("planned_future_min"),
                false);
    }

    private static Ref ref(ResultSet resultSet, String idColumn, String nameColumn) throws SQLException {
        var id = resultSet.getObject(idColumn, UUID.class);
        return id == null ? null : new Ref(id, resultSet.getString(nameColumn));
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "A obra não foi encontrada.");
    }
}
