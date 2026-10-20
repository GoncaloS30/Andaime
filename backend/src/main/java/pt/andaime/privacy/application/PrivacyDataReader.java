package pt.andaime.privacy.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.text.Normalizer;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.privacy.application.PrivacyExportService.StoredFile;
import pt.andaime.privacy.application.PrivacyViews.Atribuicao;
import pt.andaime.privacy.application.PrivacyViews.Ausencia;
import pt.andaime.privacy.application.PrivacyViews.Contrato;
import pt.andaime.privacy.application.PrivacyViews.Documento;
import pt.andaime.privacy.application.PrivacyViews.Empresa;
import pt.andaime.privacy.application.PrivacyViews.Equipa;
import pt.andaime.privacy.application.PrivacyViews.Equipamento;
import pt.andaime.privacy.application.PrivacyViews.EquipamentoEmPosse;
import pt.andaime.privacy.application.PrivacyViews.EventoAuditoria;
import pt.andaime.privacy.application.PrivacyViews.Export;
import pt.andaime.privacy.application.PrivacyViews.FolhaHoras;
import pt.andaime.privacy.application.PrivacyViews.MovimentoEquipamento;
import pt.andaime.privacy.application.PrivacyViews.Notificacao;
import pt.andaime.privacy.application.PrivacyViews.Picagem;
import pt.andaime.privacy.application.PrivacyViews.RegistoHoras;
import pt.andaime.privacy.application.PrivacyViews.Revisao;
import pt.andaime.privacy.application.PrivacyViews.Titular;
import pt.andaime.privacy.application.PrivacyViews.VersaoDocumento;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.TenantContext;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Lê, só com SQL e sob RLS da empresa corrente, tudo o que a empresa guarda sobre um trabalhador. Modelo de leitura
 * próprio (como o dos relatórios): não depende dos serviços internos dos outros módulos.
 */
@Component
class PrivacyDataReader {

    private static final TypeReference<Map<String, String>> STRING_MAP = new TypeReference<>() {
    };

    record Collected(Export data, String employeeNumber, List<StoredFile> files) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    PrivacyDataReader(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    /**
     * O acesso de suporte da plataforma também entra como administrador; a exportação de dados pessoais exige uma
     * membership real de dono ou administrador na empresa.
     */
    @Transactional(readOnly = true)
    public boolean isOrganizationAdmin() {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM memberships
                               WHERE organization_id = ? AND user_id = ? AND status = 'ACTIVE' AND role IN ('OWNER', 'ADMIN'))
                """, Boolean.class, TenantContext.organizationId().orElseThrow(), TenantContext.userId().orElseThrow()));
    }

    @Transactional(readOnly = true)
    public Collected collect(UUID employeeId) {
        var files = new ArrayList<StoredFile>();
        var usedPaths = new HashSet<String>();
        var titular = titular(employeeId, files, usedPaths);
        var empresa = new Empresa(jdbcTemplate.queryForObject("SELECT name FROM organizations WHERE id = ?", String.class,
                TenantContext.organizationId().orElseThrow()));
        var data = new Export(
                clock.instant(),
                empresa,
                titular,
                contracts(employeeId),
                teams(employeeId),
                assignments(employeeId),
                clockEvents(employeeId),
                timeEntries(employeeId),
                timesheets(employeeId),
                absences(employeeId),
                documents(employeeId, files, usedPaths),
                new Equipamento(movements(employeeId), holdings(employeeId)),
                notifications(employeeId),
                auditEvents(employeeId));
        return new Collected(data, titular.numero(), files);
    }

    private Titular titular(UUID employeeId, List<StoredFile> files, Set<String> usedPaths) {
        var rows = jdbcTemplate.query("""
                SELECT id, number, full_name, category, phone, email, nationality, home_city, hire_date, daily_capacity_min,
                       hourly_cost, skills, sizes::text AS sizes, notes, status, created_at, updated_at, archived_at,
                       anonymized_at, photo_key, photo_content_type
                FROM employees WHERE id = ?
                """, (resultSet, rowNumber) -> {
            String photo = null;
            var photoKey = resultSet.getString("photo_key");
            if (photoKey != null) {
                photo = unique("documentos/fotografia" + extension(resultSet.getString("photo_content_type")), usedPaths);
                files.add(new StoredFile(photo, photoKey));
            }
            var skills = resultSet.getArray("skills");
            return new Titular(
                    resultSet.getObject("id", UUID.class),
                    resultSet.getString("number"),
                    resultSet.getString("full_name"),
                    resultSet.getString("category"),
                    resultSet.getString("phone"),
                    resultSet.getString("email"),
                    resultSet.getString("nationality"),
                    resultSet.getString("home_city"),
                    resultSet.getObject("hire_date", java.time.LocalDate.class),
                    resultSet.getInt("daily_capacity_min"),
                    resultSet.getBigDecimal("hourly_cost"),
                    skills == null ? List.of() : Arrays.asList((String[]) skills.getArray()),
                    jsonMapper.readValue(resultSet.getString("sizes"), STRING_MAP),
                    resultSet.getString("notes"),
                    resultSet.getString("status"),
                    instant(resultSet, "created_at"),
                    instant(resultSet, "updated_at"),
                    instant(resultSet, "archived_at"),
                    instant(resultSet, "anonymized_at"),
                    photo);
        }, employeeId);
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "O trabalhador não foi encontrado.");
        }
        return rows.getFirst();
    }

    private List<Contrato> contracts(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT kind, start_date, end_date, weekly_min, notes, created_at
                FROM employee_contracts WHERE employee_id = ? ORDER BY start_date, id
                """, (resultSet, rowNumber) -> new Contrato(
                resultSet.getString("kind"),
                resultSet.getObject("start_date", java.time.LocalDate.class),
                resultSet.getObject("end_date", java.time.LocalDate.class),
                (Integer) resultSet.getObject("weekly_min"),
                resultSet.getString("notes"),
                instant(resultSet, "created_at")), employeeId);
    }

    private List<Equipa> teams(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT team.name, member.joined_on, member.left_on
                FROM team_members member
                JOIN teams team ON team.organization_id = member.organization_id AND team.id = member.team_id
                WHERE member.employee_id = ? ORDER BY member.joined_on, member.id
                """, (resultSet, rowNumber) -> new Equipa(
                resultSet.getString("name"),
                resultSet.getObject("joined_on", java.time.LocalDate.class),
                resultSet.getObject("left_on", java.time.LocalDate.class)), employeeId);
    }

    private List<Atribuicao> assignments(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT assignment.work_date, site.code, site.name AS site_name, assignment.start_time, assignment.end_time,
                       assignment.break_min, assignment.planned_min, assignment.site_timezone, team.name AS team_name,
                       vehicle.plate, assignment.is_foreman, assignment.note
                FROM assignments assignment
                JOIN sites site ON site.organization_id = assignment.organization_id AND site.id = assignment.site_id
                LEFT JOIN teams team ON team.organization_id = assignment.organization_id AND team.id = assignment.team_id
                LEFT JOIN vehicles vehicle
                       ON vehicle.organization_id = assignment.organization_id AND vehicle.id = assignment.vehicle_id
                WHERE assignment.employee_id = ? ORDER BY assignment.work_date, assignment.start_time, assignment.id
                """, (resultSet, rowNumber) -> new Atribuicao(
                resultSet.getObject("work_date", java.time.LocalDate.class),
                resultSet.getString("code"),
                resultSet.getString("site_name"),
                resultSet.getObject("start_time", java.time.LocalTime.class),
                resultSet.getObject("end_time", java.time.LocalTime.class),
                resultSet.getInt("break_min"),
                resultSet.getInt("planned_min"),
                resultSet.getString("site_timezone"),
                resultSet.getString("team_name"),
                resultSet.getString("plate"),
                resultSet.getBoolean("is_foreman"),
                resultSet.getString("note")), employeeId);
    }

    private List<Picagem> clockEvents(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT event.kind, event.occurred_at, event.device_time, site.code, event.created_at
                FROM clock_events event
                LEFT JOIN sites site ON site.organization_id = event.organization_id AND site.id = event.site_id
                WHERE event.employee_id = ? ORDER BY event.occurred_at, event.id
                """, (resultSet, rowNumber) -> new Picagem(
                resultSet.getString("kind"),
                instant(resultSet, "occurred_at"),
                instant(resultSet, "device_time"),
                resultSet.getString("code"),
                instant(resultSet, "created_at")), employeeId);
    }

    private List<RegistoHoras> timeEntries(UUID employeeId) {
        var revisions = new LinkedHashMap<UUID, List<Revisao>>();
        jdbcTemplate.query("""
                SELECT revision.time_entry_id, revision.created_at, author.display_name, revision.reason,
                       revision.before::text AS before, revision.after::text AS after
                FROM time_entry_revisions revision
                JOIN time_entries entry ON entry.organization_id = revision.organization_id AND entry.id = revision.time_entry_id
                LEFT JOIN users author ON author.id = revision.user_id
                WHERE entry.employee_id = ? ORDER BY revision.created_at, revision.id
                """, resultSet -> {
            revisions.computeIfAbsent(resultSet.getObject("time_entry_id", UUID.class), key -> new ArrayList<>())
                    .add(new Revisao(
                            instant(resultSet, "created_at"),
                            resultSet.getString("display_name"),
                            resultSet.getString("reason"),
                            json(resultSet.getString("before")),
                            json(resultSet.getString("after"))));
        }, employeeId);
        return jdbcTemplate.query("""
                SELECT entry.id, entry.work_date, site.code, site.name AS site_name, entry.timezone, entry.started_at,
                       entry.ended_at, entry.break_min, entry.worked_min, entry.status, entry.source, entry.note
                FROM time_entries entry
                JOIN sites site ON site.organization_id = entry.organization_id AND site.id = entry.site_id
                WHERE entry.employee_id = ? ORDER BY entry.work_date, entry.started_at, entry.id
                """, (resultSet, rowNumber) -> {
            var id = resultSet.getObject("id", UUID.class);
            return new RegistoHoras(
                    id,
                    resultSet.getObject("work_date", java.time.LocalDate.class),
                    resultSet.getString("code"),
                    resultSet.getString("site_name"),
                    resultSet.getString("timezone"),
                    instant(resultSet, "started_at"),
                    instant(resultSet, "ended_at"),
                    resultSet.getInt("break_min"),
                    (Integer) resultSet.getObject("worked_min"),
                    resultSet.getString("status"),
                    resultSet.getString("source"),
                    resultSet.getString("note"),
                    revisions.getOrDefault(id, List.of()));
        }, employeeId);
    }

    private List<FolhaHoras> timesheets(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT sheet.week_start, sheet.status, sheet.submitted_at, submitter.display_name AS submitted_by,
                       sheet.decided_at, decider.display_name AS decided_by, sheet.decision_note
                FROM timesheets sheet
                LEFT JOIN users submitter ON submitter.id = sheet.submitted_by_user_id
                LEFT JOIN users decider ON decider.id = sheet.decided_by_user_id
                WHERE sheet.employee_id = ? ORDER BY sheet.week_start
                """, (resultSet, rowNumber) -> new FolhaHoras(
                resultSet.getObject("week_start", java.time.LocalDate.class),
                resultSet.getString("status"),
                instant(resultSet, "submitted_at"),
                resultSet.getString("submitted_by"),
                instant(resultSet, "decided_at"),
                resultSet.getString("decided_by"),
                resultSet.getString("decision_note")), employeeId);
    }

    private List<Ausencia> absences(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT absence.kind, absence.starts_on, absence.ends_on, absence.partial_minutes, absence.status, absence.note,
                       absence.created_at, absence.decided_at, decider.display_name AS decided_by, absence.decision_note
                FROM absences absence
                LEFT JOIN users decider ON decider.id = absence.decided_by_user_id
                WHERE absence.employee_id = ? ORDER BY absence.starts_on, absence.id
                """, (resultSet, rowNumber) -> new Ausencia(
                resultSet.getString("kind"),
                resultSet.getObject("starts_on", java.time.LocalDate.class),
                resultSet.getObject("ends_on", java.time.LocalDate.class),
                (Integer) resultSet.getObject("partial_minutes"),
                resultSet.getString("status"),
                resultSet.getString("note"),
                instant(resultSet, "created_at"),
                instant(resultSet, "decided_at"),
                resultSet.getString("decided_by"),
                resultSet.getString("decision_note")), employeeId);
    }

    /**
     * Metadados de todas as versões; o ficheiro só da versão atual de cada documento (nunca de uma versão marcada como
     * infetada pela análise antivírus).
     */
    private List<Documento> documents(UUID employeeId, List<StoredFile> files, Set<String> usedPaths) {
        var documents = new LinkedHashMap<UUID, Documento>();
        jdbcTemplate.query("""
                SELECT document.id AS document_id, type.name AS type_name, document.created_at, document.archived_at,
                       version.id IS NOT NULL AND version.id = document.current_version_id AS current,
                       row_number() OVER (PARTITION BY document.id ORDER BY version.uploaded_at, version.id) AS number,
                       version.id AS version_id, version.filename, version.content_type, version.size_bytes, version.sha256,
                       version.issued_on, version.expires_on, version.uploaded_at, version.verified_at, version.scan_status,
                       version.storage_key
                FROM documents document
                JOIN document_types type ON type.organization_id = document.organization_id AND type.id = document.document_type_id
                LEFT JOIN document_versions version
                       ON version.organization_id = document.organization_id AND version.document_id = document.id
                WHERE document.employee_id = ?
                ORDER BY type.name, document.created_at, document.id, version.uploaded_at, version.id
                """, resultSet -> {
            var typeName = resultSet.getString("type_name");
            var document = documents.computeIfAbsent(resultSet.getObject("document_id", UUID.class), key -> {
                try {
                    return new Documento(typeName, instant(resultSet, "created_at"), instant(resultSet, "archived_at"), new ArrayList<>());
                } catch (SQLException exception) {
                    throw new IllegalStateException(exception);
                }
            });
            if (resultSet.getObject("version_id") == null) {
                return;
            }
            var number = resultSet.getInt("number");
            var current = resultSet.getBoolean("current");
            var filename = resultSet.getString("filename");
            String inZip = null;
            if (current && !"INFECTED".equals(resultSet.getString("scan_status"))) {
                inZip = unique("documentos/" + slug(typeName) + "-v" + number + "-" + safeFilename(filename), usedPaths);
                files.add(new StoredFile(inZip, resultSet.getString("storage_key")));
            }
            document.versoes().add(new VersaoDocumento(
                    number,
                    current,
                    filename,
                    resultSet.getString("content_type"),
                    resultSet.getLong("size_bytes"),
                    resultSet.getString("sha256"),
                    resultSet.getObject("issued_on", java.time.LocalDate.class),
                    resultSet.getObject("expires_on", java.time.LocalDate.class),
                    instant(resultSet, "uploaded_at"),
                    instant(resultSet, "verified_at"),
                    resultSet.getString("scan_status"),
                    inZip));
        }, employeeId);
        return List.copyOf(documents.values());
    }

    private List<MovimentoEquipamento> movements(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT movement.occurred_at, movement.kind, item.name, item.category, item.size, movement.quantity, unit.serial,
                       movement.note
                FROM equipment_movements movement
                JOIN equipment_items item ON item.organization_id = movement.organization_id AND item.id = movement.item_id
                LEFT JOIN equipment_units unit ON unit.organization_id = movement.organization_id AND unit.id = movement.unit_id
                WHERE movement.employee_id = ? ORDER BY movement.occurred_at, movement.id
                """, (resultSet, rowNumber) -> new MovimentoEquipamento(
                instant(resultSet, "occurred_at"),
                resultSet.getString("kind"),
                resultSet.getString("name"),
                resultSet.getString("category"),
                resultSet.getString("size"),
                resultSet.getInt("quantity"),
                resultSet.getString("serial"),
                resultSet.getString("note")), employeeId);
    }

    /** O que está hoje em poder do trabalhador: saldo dos artigos de stock e unidades com número de série. */
    private List<EquipamentoEmPosse> holdings(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT item.name, item.category, item.size,
                       sum(CASE movement.kind WHEN 'DELIVER' THEN movement.quantity ELSE -movement.quantity END)::int AS quantity,
                       NULL AS serial
                FROM equipment_movements movement
                JOIN equipment_items item ON item.organization_id = movement.organization_id AND item.id = movement.item_id
                WHERE movement.employee_id = ? AND item.tracking = 'STOCK' AND movement.kind IN ('DELIVER', 'RETURN', 'DAMAGED', 'LOST')
                GROUP BY item.id, item.name, item.category, item.size
                HAVING sum(CASE movement.kind WHEN 'DELIVER' THEN movement.quantity ELSE -movement.quantity END) > 0
                UNION ALL
                SELECT item.name, item.category, item.size, 1, unit.serial
                FROM equipment_units unit
                JOIN equipment_items item ON item.organization_id = unit.organization_id AND item.id = unit.item_id
                WHERE unit.holder_employee_id = ? AND unit.status = 'ASSIGNED'
                ORDER BY 1, 5
                """, (resultSet, rowNumber) -> new EquipamentoEmPosse(
                resultSet.getString("name"),
                resultSet.getString("category"),
                resultSet.getString("size"),
                resultSet.getInt("quantity"),
                resultSet.getString("serial")), employeeId, employeeId);
    }

    /** Notificações da conta ligada a esta ficha, nesta empresa. */
    private List<Notificacao> notifications(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT notification.kind, notification.title, notification.body, notification.created_at, notification.read_at
                FROM notifications notification
                JOIN memberships membership
                  ON membership.organization_id = notification.organization_id AND membership.user_id = notification.user_id
                WHERE membership.employee_id = ? ORDER BY notification.created_at, notification.id
                """, (resultSet, rowNumber) -> new Notificacao(
                resultSet.getString("kind"),
                resultSet.getString("title"),
                resultSet.getString("body"),
                instant(resultSet, "created_at"),
                instant(resultSet, "read_at")), employeeId);
    }

    private List<EventoAuditoria> auditEvents(UUID employeeId) {
        return jdbcTemplate.query("""
                SELECT event.action, event.occurred_at, actor.display_name, event.actor_role
                FROM audit_event event
                LEFT JOIN users actor ON actor.id = event.actor_user_id
                WHERE event.organization_id = ? AND event.entity_type = 'employee' AND event.entity_id = ?
                ORDER BY event.occurred_at, event.id
                """, (resultSet, rowNumber) -> new EventoAuditoria(
                resultSet.getString("action"),
                instant(resultSet, "occurred_at"),
                resultSet.getString("display_name"),
                resultSet.getString("actor_role")), TenantContext.organizationId().orElseThrow(), employeeId);
    }

    private tools.jackson.databind.JsonNode json(String value) {
        return value == null ? null : jsonMapper.readTree(value);
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        var value = resultSet.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    private static String extension(String contentType) {
        return switch (contentType == null ? "" : contentType) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "image/jpeg" -> ".jpg";
            default -> "";
        };
    }

    /** "Ficha de aptidão médica" → "ficha-de-aptidao-medica". */
    static String slug(String value) {
        var plain = Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
        var slug = plain.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return slug.isEmpty() ? "documento" : slug;
    }

    /** Sem separadores de diretório nem caracteres de controlo: o nome nunca sai da pasta {@code documentos/}. */
    static String safeFilename(String filename) {
        var safe = filename == null ? "" : filename.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").strip();
        return safe.isEmpty() || safe.chars().allMatch(character -> character == '.') ? "ficheiro" : safe;
    }

    /** Os nomes de entrada de um ZIP têm de ser únicos. */
    private static String unique(String path, Set<String> usedPaths) {
        var candidate = path;
        var dot = path.lastIndexOf('.');
        var counter = 2;
        while (!usedPaths.add(candidate)) {
            candidate = dot > path.lastIndexOf('/') ? path.substring(0, dot) + "-" + counter + path.substring(dot) : path + "-" + counter;
            counter++;
        }
        return candidate;
    }
}
