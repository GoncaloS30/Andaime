package pt.andaime.workforce.application;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.audit.Changes;
import pt.andaime.documents.DocumentPurge;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.api.PageView;
import pt.andaime.shared.storage.PhotoStorage;
import pt.andaime.shared.storage.PhotoStorage.PhotoContent;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.workforce.application.WorkforceViews.ContractView;
import pt.andaime.workforce.application.WorkforceViews.EmployeeDetail;
import pt.andaime.workforce.application.WorkforceViews.EmployeeInput;
import pt.andaime.workforce.application.WorkforceViews.EmployeeSummary;
import pt.andaime.workforce.application.WorkforceViews.LinkedAccount;
import pt.andaime.workforce.application.WorkforceViews.TeamPeriod;
import pt.andaime.workforce.application.WorkforceViews.TeamRef;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Service
public class EmployeeService {

    /** Dados pessoais e de custo: nunca entram em valores de auditoria nem na vista do encarregado. */
    static final Set<String> SENSITIVE = Set.of("phone", "email", "nationality", "homeCity", "homeLatitude", "homeLongitude",
            "hourlyCost", "sizes", "notes");
    private static final Set<String> SIZE_KEYS = Set.of("tshirt", "sweat", "parka", "calcas", "botas", "luvas");
    private static final TypeReference<Map<String, String>> STRING_MAP = new TypeReference<>() {
    };

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final JsonMapper jsonMapper;
    private final PhotoStorage photos;
    private final DocumentPurge documents;
    private final Clock clock;

    public EmployeeService(JdbcTemplate jdbcTemplate, AuditLog auditLog, JsonMapper jsonMapper, PhotoStorage photos,
            DocumentPurge documents, Clock clock) {
        this.photos = photos;
        this.documents = documents;
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageView<EmployeeSummary> list(
            String query, String status, String teamFilter, String category, boolean archived, int page, int size) {
        var today = TenantContext.today(clock);
        var scope = WorkforceScope.employees("employee", today);
        var where = new StringBuilder("employee.organization_id = ? AND ").append(scope.sql());
        var params = new ArrayList<Object>();
        params.add(today);
        params.add(today);
        params.add(organization());
        params.addAll(scope.params());
        where.append(archived ? " AND employee.archived_at IS NOT NULL" : " AND employee.archived_at IS NULL");
        if (status != null && !status.isBlank()) {
            where.append(" AND employee.status = ?");
            params.add(status.toUpperCase(Locale.ROOT));
        }
        if (category != null && !category.isBlank()) {
            where.append(" AND employee.category = ?");
            params.add(category);
        }
        if (query != null && !query.isBlank()) {
            where.append(" AND (employee.full_name ILIKE ? OR employee.number ILIKE ? OR employee.category ILIKE ?)");
            var like = "%" + query.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
            params.add(like);
            params.add(like);
            params.add(like);
        }
        if ("none".equals(teamFilter)) {
            where.append(" AND team.id IS NULL");
        } else if (teamFilter != null && !teamFilter.isBlank()) {
            where.append(" AND team.id = ?");
            params.add(UUID.fromString(teamFilter));
        }
        var safeSize = Math.clamp(size, 1, 200);
        var safePage = Math.max(0, page);
        params.add(safeSize);
        params.add((long) safePage * safeSize);
        var total = new long[] {0};
        var items = jdbcTemplate.query("""
                SELECT employee.id, employee.number, employee.full_name, employee.category, employee.status,
                       employee.archived_at, employee.photo_updated_at, team.id AS team_id, team.name AS team_name, team.color AS team_color,
                       count(*) OVER () AS total
                FROM employees employee
                LEFT JOIN team_members member
                       ON member.organization_id = employee.organization_id AND member.employee_id = employee.id
                      AND member.joined_on <= ? AND (member.left_on IS NULL OR member.left_on >= ?)
                LEFT JOIN teams team ON team.organization_id = member.organization_id AND team.id = member.team_id
                WHERE\s""" + where + """

                ORDER BY lower(employee.full_name), employee.id
                LIMIT ? OFFSET ?
                """, (resultSet, rowNumber) -> {
            total[0] = resultSet.getLong("total");
            return new EmployeeSummary(
                    resultSet.getObject("id", UUID.class),
                    resultSet.getString("number"),
                    resultSet.getString("full_name"),
                    resultSet.getString("category"),
                    resultSet.getString("status"),
                    resultSet.getObject("archived_at") != null,
                    teamRef(resultSet),
                    PhotoStorage.url("employees", resultSet.getObject("id", UUID.class), resultSet.getTimestamp("photo_updated_at")));
        }, params.toArray());
        return new PageView<>(items, safePage, safeSize, total[0]);
    }

    @Transactional(readOnly = true)
    public EmployeeDetail get(UUID employeeId) {
        var today = TenantContext.today(clock);
        var scope = WorkforceScope.employees("employee", today);
        var params = new ArrayList<Object>(List.of(today, today, employeeId));
        params.addAll(scope.params());
        var restricted = !WorkforceScope.seesAll();
        return jdbcTemplate.query("""
                SELECT employee.*, team.id AS team_id, team.name AS team_name, team.color AS team_color,
                       account.id AS membership_id, account.role AS membership_role, person.display_name AS account_name
                FROM employees employee
                LEFT JOIN team_members member
                       ON member.organization_id = employee.organization_id AND member.employee_id = employee.id
                      AND member.joined_on <= ? AND (member.left_on IS NULL OR member.left_on >= ?)
                LEFT JOIN teams team ON team.organization_id = member.organization_id AND team.id = member.team_id
                LEFT JOIN memberships account
                       ON account.organization_id = employee.organization_id AND account.employee_id = employee.id
                LEFT JOIN users person ON person.id = account.user_id
                WHERE employee.id = ? AND\s""" + scope.sql(),
                (resultSet, rowNumber) -> detail(resultSet, restricted), params.toArray())
                .stream().findFirst().orElseThrow(EmployeeService::notFound);
    }

    @Transactional
    public EmployeeDetail create(EmployeeInput input) {
        OrgRole.require(OrgRole.MANAGER);
        var organizationId = organization();
        lockOrganization(organizationId);
        var number = blank(input.number()) ? nextNumber(organizationId) : input.number().strip();
        ensureNumberFree(number, null);
        var values = normalize(input, number);
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO employees (organization_id, number, full_name, category, phone, email, nationality,
                    home_city, hire_date, status, daily_capacity_min, hourly_cost, skills, sizes, notes,
                    home_latitude, home_longitude)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)
                RETURNING id
                """, UUID.class, organizationId, values.get("number"), values.get("fullName"), values.get("category"),
                values.get("phone"), values.get("email"), values.get("nationality"), values.get("homeCity"),
                values.get("hireDate"), values.get("status"), values.get("dailyCapacityMin"), values.get("hourlyCost"),
                textArray(values), sizesJson(values), values.get("notes"), values.get("homeLatitude"),
                values.get("homeLongitude"));
        auditLog.record("employee.created", "employee", id, Changes.created(values, SENSITIVE));
        return get(id);
    }

    @Transactional
    public EmployeeDetail update(UUID employeeId, EmployeeInput input, int expectedVersion) {
        OrgRole.require(OrgRole.MANAGER);
        var before = values(get(employeeId));
        var number = blank(input.number()) ? (String) before.get("number") : input.number().strip();
        ensureNumberFree(number, employeeId);
        var after = normalize(input, number);
        var updated = jdbcTemplate.update("""
                UPDATE employees
                SET number = ?, full_name = ?, category = ?, phone = ?, email = ?, nationality = ?, home_city = ?,
                    hire_date = ?, status = ?, daily_capacity_min = ?, hourly_cost = ?, skills = ?, sizes = ?::jsonb,
                    notes = ?, home_latitude = ?, home_longitude = ?, version = version + 1
                WHERE id = ? AND version = ? AND archived_at IS NULL
                """, after.get("number"), after.get("fullName"), after.get("category"), after.get("phone"),
                after.get("email"), after.get("nationality"), after.get("homeCity"), after.get("hireDate"),
                after.get("status"), after.get("dailyCapacityMin"), after.get("hourlyCost"), textArray(after),
                sizesJson(after), after.get("notes"), after.get("homeLatitude"), after.get("homeLongitude"), employeeId,
                expectedVersion);
        if (updated == 0) {
            throw stale();
        }
        var changes = Changes.diff(before, after, SENSITIVE);
        if (!changes.isEmpty()) {
            auditLog.record("employee.updated", "employee", employeeId, changes);
        }
        return get(employeeId);
    }

    /** Arquiva: sai das equipas a partir de hoje, mantém todo o histórico. */
    @Transactional
    public EmployeeDetail archive(UUID employeeId) {
        OrgRole.require(OrgRole.MANAGER);
        get(employeeId);
        lockEmployee(employeeId);
        var leading = jdbcTemplate.queryForList("""
                SELECT name FROM teams WHERE foreman_employee_id = ? AND archived_at IS NULL
                """, String.class, employeeId);
        if (!leading.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "employee-is-foreman",
                    "É responsável da equipa " + String.join(", ", leading) + ". Escolha outro responsável primeiro.");
        }
        var today = TenantContext.today(clock);
        jdbcTemplate.update("DELETE FROM team_members WHERE employee_id = ? AND joined_on > ?", employeeId, today);
        jdbcTemplate.update("""
                UPDATE team_members SET left_on = ?, ended_by_user_id = ?
                WHERE employee_id = ? AND (left_on IS NULL OR left_on > ?)
                """, today, TenantContext.userId().orElse(null), employeeId, today);
        jdbcTemplate.update("""
                UPDATE employees SET archived_at = now(), status = 'INACTIVE', version = version + 1
                WHERE id = ? AND archived_at IS NULL
                """, employeeId);
        auditLog.record("employee.archived", "employee", employeeId);
        return get(employeeId);
    }

    /**
     * RGPD: apaga os dados pessoais de um ex-trabalhador arquivado (nome, contactos, nacionalidade, morada, tamanhos,
     * competências, notas, custo, contratos, estadias, fotografia e ficheiros dos documentos). Ficam o número, a categoria e o
     * histórico de horas e planeamento, sem identificação. A conta ligada perde o acesso à empresa. Irreversível.
     */
    @Transactional
    public EmployeeDetail anonymize(UUID employeeId) {
        OrgRole.require(OrgRole.ADMIN);
        get(employeeId);
        lockEmployee(employeeId);
        var state = anonymizationState(employeeId);
        if (!state[0]) {
            throw new ApiException(HttpStatus.CONFLICT, "not-archived", "Arquive o trabalhador antes de o anonimizar.");
        }
        if (state[1]) {
            throw new ApiException(HttpStatus.CONFLICT, "already-anonymized", "Este trabalhador já foi anonimizado.");
        }
        erasePersonalData(employeeId);
        auditLog.record("employee.anonymized", "employee", employeeId);
        return get(employeeId);
    }

    /**
     * Conservação de dados: anonimiza os ex-trabalhadores arquivados antes de {@code cutoff}, na transação e na
     * organização correntes. Não exige papel (corre na tarefa diária, sem utilizador no pedido); quem chama é
     * responsável por isso. Fichas ligadas à conta do dono ficam de fora, para não bloquear o acesso à empresa.
     */
    @Transactional
    public int anonymizeArchivedBefore(OffsetDateTime cutoff) {
        var due = jdbcTemplate.queryForList("""
                SELECT employee.id FROM employees employee
                WHERE employee.archived_at < ? AND employee.anonymized_at IS NULL
                  AND NOT EXISTS (SELECT 1 FROM memberships account
                                  WHERE account.organization_id = employee.organization_id AND account.employee_id = employee.id
                                    AND account.role = 'OWNER' AND account.status = 'ACTIVE')
                ORDER BY employee.archived_at, employee.id
                """, UUID.class, cutoff);
        int anonymized = 0;
        for (var employeeId : due) {
            lockEmployee(employeeId);
            var state = anonymizationState(employeeId);
            if (!state[0] || state[1]) {
                continue;
            }
            erasePersonalData(employeeId);
            auditLog.record("employee.anonymized", "employee", employeeId, Map.of("automatic", true));
            anonymized++;
        }
        return anonymized;
    }

    /** {arquivado, anonimizado}. */
    private boolean[] anonymizationState(UUID employeeId) {
        return jdbcTemplate.queryForObject("SELECT archived_at IS NOT NULL, anonymized_at IS NOT NULL FROM employees WHERE id = ?",
                (resultSet, rowNumber) -> new boolean[] {resultSet.getBoolean(1), resultSet.getBoolean(2)}, employeeId);
    }

    private void erasePersonalData(UUID employeeId) {
        jdbcTemplate.update("UPDATE employees SET full_name = 'Ex-trabalhador ' || number, phone = NULL, email = NULL,"
                + " nationality = NULL, home_city = NULL, home_latitude = NULL, home_longitude = NULL, hire_date = NULL, hourly_cost = NULL, skills = '{}', sizes = '{}'::jsonb,"
                + " notes = NULL, anonymized_at = now(), version = version + 1 WHERE id = ?", employeeId);
        jdbcTemplate.queryForList("SELECT photo_key FROM employees WHERE id = ? AND photo_key IS NOT NULL", String.class, employeeId)
                .forEach(photos::deleteAfterCommit);
        jdbcTemplate.update("UPDATE employees SET photo_key = NULL, photo_content_type = NULL, photo_updated_at = NULL WHERE id = ?",
                employeeId);
        jdbcTemplate.update("DELETE FROM employee_contracts WHERE employee_id = ?", employeeId);
        jdbcTemplate.update("DELETE FROM stays WHERE employee_id = ?", employeeId);
        jdbcTemplate.update("UPDATE memberships SET status = 'DISABLED' WHERE employee_id = ? AND status = 'ACTIVE'", employeeId);
        documents.purgeEmployee(employeeId);
    }

    @Transactional
    public EmployeeDetail restore(UUID employeeId) {
        OrgRole.require(OrgRole.MANAGER);
        get(employeeId);
        if (Boolean.TRUE.equals(jdbcTemplate.queryForObject("SELECT anonymized_at IS NOT NULL FROM employees WHERE id = ?",
                Boolean.class, employeeId))) {
            throw new ApiException(HttpStatus.CONFLICT, "already-anonymized", "Um trabalhador anonimizado não pode ser reposto.");
        }
        jdbcTemplate.update("""
                UPDATE employees SET archived_at = NULL, version = version + 1 WHERE id = ? AND archived_at IS NOT NULL
                """, employeeId);
        auditLog.record("employee.restored", "employee", employeeId);
        return get(employeeId);
    }

    @Transactional(readOnly = true)
    public List<TeamPeriod> teamHistory(UUID employeeId) {
        get(employeeId);
        return jdbcTemplate.query("""
                SELECT member.id, team.id AS team_id, team.name, team.color, member.joined_on, member.left_on
                FROM team_members member
                JOIN teams team ON team.organization_id = member.organization_id AND team.id = member.team_id
                WHERE member.employee_id = ?
                ORDER BY member.joined_on DESC
                """, (resultSet, rowNumber) -> new TeamPeriod(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("team_id", UUID.class),
                resultSet.getString("name"),
                resultSet.getString("color"),
                resultSet.getObject("joined_on", LocalDate.class),
                resultSet.getObject("left_on", LocalDate.class)), employeeId);
    }

    @Transactional(readOnly = true)
    public List<ContractView> contracts(UUID employeeId) {
        OrgRole.require(OrgRole.MANAGER);
        get(employeeId);
        return jdbcTemplate.query("""
                SELECT id, kind, start_date, end_date, weekly_min, notes, created_at
                FROM employee_contracts WHERE employee_id = ? ORDER BY start_date DESC
                """, (resultSet, rowNumber) -> new ContractView(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("kind"),
                resultSet.getObject("start_date", LocalDate.class),
                resultSet.getObject("end_date", LocalDate.class),
                (Integer) resultSet.getObject("weekly_min"),
                resultSet.getString("notes"),
                resultSet.getObject("created_at", OffsetDateTime.class).toInstant()), employeeId);
    }

    @Transactional
    public ContractView addContract(UUID employeeId, String kind, LocalDate start, LocalDate end, Integer weeklyMin, String notes) {
        OrgRole.require(OrgRole.MANAGER);
        get(employeeId);
        if (end != null && end.isBefore(start)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-dates", "O fim do contrato é anterior ao início.");
        }
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO employee_contracts (organization_id, employee_id, kind, start_date, end_date, weekly_min,
                    notes, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, organization(), employeeId, kind, start, end, weeklyMin, blankToNull(notes),
                TenantContext.userId().orElse(null));
        auditLog.record("employee.contract-added", "employee", employeeId,
                Map.of("contractId", id, "kind", kind, "startDate", start.toString()));
        return contracts(employeeId).stream().filter(c -> c.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional
    public void removeContract(UUID employeeId, UUID contractId) {
        OrgRole.require(OrgRole.MANAGER);
        var deleted = jdbcTemplate.update("DELETE FROM employee_contracts WHERE id = ? AND employee_id = ?",
                contractId, employeeId);
        if (deleted == 0) {
            throw notFound();
        }
        auditLog.record("employee.contract-removed", "employee", employeeId, Map.of("contractId", contractId));
    }

    // --- fotografia -------------------------------------------------------------------

    @Transactional
    public EmployeeDetail setPhoto(UUID employeeId, org.springframework.web.multipart.MultipartFile file) {
        OrgRole.require(OrgRole.MANAGER);
        if (get(employeeId).anonymized()) {
            throw new ApiException(HttpStatus.CONFLICT, "anonymized", "Este trabalhador foi anonimizado.");
        }
        lockEmployee(employeeId);
        var previous = jdbcTemplate.queryForObject("SELECT photo_key FROM employees WHERE id = ?", String.class, employeeId);
        var stored = photos.store("employees", employeeId, file);
        jdbcTemplate.update("""
                UPDATE employees SET photo_key = ?, photo_content_type = ?, photo_updated_at = clock_timestamp() WHERE id = ?
                """, stored.key(), stored.contentType(), employeeId);
        photos.deleteAfterCommit(previous);
        auditLog.record("employee.photo-changed", "employee", employeeId);
        return get(employeeId);
    }

    @Transactional
    public void removePhoto(UUID employeeId) {
        OrgRole.require(OrgRole.MANAGER);
        get(employeeId);
        lockEmployee(employeeId);
        var previous = jdbcTemplate.queryForObject("SELECT photo_key FROM employees WHERE id = ?", String.class, employeeId);
        if (previous == null) {
            return;
        }
        jdbcTemplate.update("UPDATE employees SET photo_key = NULL, photo_content_type = NULL, photo_updated_at = NULL WHERE id = ?",
                employeeId);
        photos.deleteAfterCommit(previous);
        auditLog.record("employee.photo-removed", "employee", employeeId);
    }

    /** Fotografia para quem pode ver a ficha (mesmo âmbito que {@link #get}). */
    @Transactional(readOnly = true)
    public PhotoContent photo(UUID employeeId) {
        get(employeeId);
        return jdbcTemplate.query("SELECT photo_key, photo_content_type FROM employees WHERE id = ? AND photo_key IS NOT NULL",
                (resultSet, rowNumber) -> new PhotoContent(photos.open(resultSet.getString(1)), resultSet.getString(2)), employeeId)
                .stream().findFirst().orElseThrow(EmployeeService::notFound);
    }

    // --- auxiliares -------------------------------------------------------------------

    private EmployeeDetail detail(ResultSet resultSet, boolean restricted) throws SQLException {
        var membershipId = resultSet.getObject("membership_id", UUID.class);
        return new EmployeeDetail(
                resultSet.getObject("id", UUID.class),
                resultSet.getString("number"),
                resultSet.getString("full_name"),
                resultSet.getString("category"),
                resultSet.getString("status"),
                resultSet.getString("phone"),
                restricted ? null : resultSet.getString("email"),
                restricted ? null : resultSet.getString("nationality"),
                restricted ? null : resultSet.getString("home_city"),
                restricted ? null : resultSet.getBigDecimal("home_latitude"),
                restricted ? null : resultSet.getBigDecimal("home_longitude"),
                restricted ? null : resultSet.getObject("hire_date", LocalDate.class),
                resultSet.getInt("daily_capacity_min"),
                restricted ? null : resultSet.getBigDecimal("hourly_cost"),
                skills(resultSet.getArray("skills")),
                restricted ? Map.of() : jsonMapper.readValue(resultSet.getString("sizes"), STRING_MAP),
                restricted ? null : resultSet.getString("notes"),
                resultSet.getObject("archived_at") == null ? null
                        : resultSet.getObject("archived_at", OffsetDateTime.class).toInstant(),
                teamRef(resultSet),
                membershipId == null ? null : new LinkedAccount(membershipId,
                        resultSet.getString("account_name"), resultSet.getString("membership_role")),
                restricted,
                resultSet.getObject("anonymized_at") != null,
                PhotoStorage.url("employees", resultSet.getObject("id", UUID.class), resultSet.getTimestamp("photo_updated_at")),
                resultSet.getInt("version"));
    }

    private static TeamRef teamRef(ResultSet resultSet) throws SQLException {
        var teamId = resultSet.getObject("team_id", UUID.class);
        return teamId == null ? null : new TeamRef(teamId, resultSet.getString("team_name"), resultSet.getString("team_color"));
    }

    private static List<String> skills(Array array) throws SQLException {
        return array == null ? List.of() : Arrays.asList((String[]) array.getArray());
    }

    private Map<String, Object> values(EmployeeDetail detail) {
        var values = new LinkedHashMap<String, Object>();
        values.put("number", detail.number());
        values.put("fullName", detail.fullName());
        values.put("category", detail.category());
        values.put("phone", detail.phone());
        values.put("email", detail.email());
        values.put("nationality", detail.nationality());
        values.put("homeCity", detail.homeCity());
        values.put("homeLatitude", detail.homeLatitude());
        values.put("homeLongitude", detail.homeLongitude());
        values.put("hireDate", detail.hireDate());
        values.put("status", detail.status());
        values.put("dailyCapacityMin", detail.dailyCapacityMin());
        values.put("hourlyCost", detail.hourlyCost());
        values.put("skills", detail.skills());
        values.put("sizes", new TreeMap<>(detail.sizes()));
        values.put("notes", detail.notes());
        return values;
    }

    private Map<String, Object> normalize(EmployeeInput input, String number) {
        var values = new LinkedHashMap<String, Object>();
        values.put("number", number);
        values.put("fullName", input.fullName().strip());
        values.put("category", input.category().strip());
        values.put("phone", blankToNull(input.phone()));
        values.put("email", blankToNull(input.email()) == null ? null : input.email().strip().toLowerCase(Locale.ROOT));
        values.put("nationality", blankToNull(input.nationality()));
        values.put("homeCity", blankToNull(input.homeCity()));
        // Coordenadas da residência (cidade): as duas ou nenhuma. Base da sugestão "longe de casa" nas dormidas.
        if ((input.homeLatitude() == null) != (input.homeLongitude() == null)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a latitude e a longitude da residência, ou nenhuma.")
                    .with("errors", List.of(Map.of("field", input.homeLatitude() == null ? "homeLatitude" : "homeLongitude",
                            "code", "invalid", "message", "Indique a latitude e a longitude, ou nenhuma.")));
        }
        values.put("homeLatitude", input.homeLatitude() == null ? null
                : input.homeLatitude().setScale(6, java.math.RoundingMode.HALF_UP));
        values.put("homeLongitude", input.homeLongitude() == null ? null
                : input.homeLongitude().setScale(6, java.math.RoundingMode.HALF_UP));
        values.put("hireDate", input.hireDate());
        values.put("status", input.status() == null ? "ACTIVE" : input.status().toUpperCase(Locale.ROOT));
        values.put("dailyCapacityMin", input.dailyCapacityMin() == null ? 480 : input.dailyCapacityMin());
        values.put("hourlyCost", input.hourlyCost() == null ? null : input.hourlyCost().setScale(2, java.math.RoundingMode.HALF_UP));
        values.put("skills", input.skills() == null ? List.of()
                : input.skills().stream().map(String::strip).filter(s -> !s.isEmpty()).distinct().toList());
        var sizes = new TreeMap<String, String>();
        if (input.sizes() != null) {
            input.sizes().forEach((key, value) -> {
                if (SIZE_KEYS.contains(key) && value != null && !value.isBlank()) {
                    sizes.put(key, value.strip());
                }
            });
        }
        values.put("sizes", sizes);
        values.put("notes", blankToNull(input.notes()));
        return values;
    }

    private Array textArray(Map<String, Object> values) {
        @SuppressWarnings("unchecked")
        var skills = (List<String>) values.get("skills");
        return jdbcTemplate.execute((java.sql.Connection connection) ->
                connection.createArrayOf("text", skills.toArray(String[]::new)));
    }

    private String sizesJson(Map<String, Object> values) {
        return jsonMapper.writeValueAsString(values.get("sizes"));
    }

    private void ensureNumberFree(String number, UUID except) {
        var taken = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM employees WHERE number = ? AND id IS DISTINCT FROM ?)
                """, Boolean.class, number, except));
        if (taken) {
            throw new ApiException(HttpStatus.CONFLICT, "number-taken", "Já existe um trabalhador com o número " + number + ".");
        }
    }

    private String nextNumber(UUID organizationId) {
        var next = jdbcTemplate.queryForObject("""
                SELECT coalesce(max(number::bigint), 0) + 1 FROM employees
                WHERE organization_id = ? AND number ~ '^[0-9]{1,15}$'
                """, Long.class, organizationId);
        return Long.toString(next == null ? 1 : next);
    }

    private void lockOrganization(UUID organizationId) {
        jdbcTemplate.query("SELECT id FROM organizations WHERE id = ? FOR UPDATE",
                (resultSet, rowNumber) -> resultSet.getObject(1), organizationId);
    }

    void lockEmployee(UUID employeeId) {
        jdbcTemplate.query("SELECT pg_advisory_xact_lock(hashtextextended('employee:' || ?::text, 0))",
                (resultSet, rowNumber) -> null, employeeId);
    }

    private static UUID organization() {
        return TenantContext.organizationId().orElseThrow();
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "O trabalhador não foi encontrado.");
    }

    private static ApiException stale() {
        return new ApiException(HttpStatus.CONFLICT, "stale",
                "A ficha foi alterada por outra pessoa. Recarregue e tente de novo.");
    }

    static BigDecimal zeroIfNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
