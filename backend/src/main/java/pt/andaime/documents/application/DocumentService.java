package pt.andaime.documents.application;

import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.apache.tika.Tika;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import pt.andaime.audit.AuditLog;
import pt.andaime.notifications.Notifier;
import pt.andaime.shared.storage.FileScanner;
import pt.andaime.shared.storage.ObjectStorage;
import pt.andaime.reporting.ReportingProjection;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Documentos de trabalhadores e viaturas. O ficheiro vai para o armazenamento privado; a base de dados guarda os
 * metadados, o hash SHA-256 e o tipo real detetado pelo conteúdo. Renovar um documento cria uma nova versão; as
 * anteriores ficam disponíveis. Encarregados vêem e carregam documentos da sua equipa; trabalhadores os seus.
 */
@Service
public class DocumentService {

    static final Set<String> ALLOWED_TYPES = Set.of("application/pdf", "image/jpeg", "image/png", "image/webp");

    public record DocumentType(UUID id, String name, String subject, boolean requiresExpiry, int alertDays,
            boolean requiredEverywhere, List<String> requiredCountries, int version) {
    }

    public record TypeInput(String name, String subject, Boolean requiresExpiry, Integer alertDays, Integer version) {
    }

    public record VersionView(UUID id, String filename, String contentType, long sizeBytes, String sha256, LocalDate issuedOn,
            LocalDate expiresOn, String uploadedBy, Instant uploadedAt, String verifiedBy, Instant verifiedAt) {
    }

    public record DocumentView(UUID id, UUID typeId, String typeName, UUID employeeId, String employeeName, UUID vehicleId,
            String vehiclePlate, String status, LocalDate expiresOn, boolean verified, VersionView current,
            List<VersionView> versions, boolean archived, int version) {
    }

    public record ComplianceItem(UUID typeId, String typeName, String status, LocalDate expiresOn, UUID documentId) {
    }

    public record ComplianceRow(UUID employeeId, String employeeName, List<ComplianceItem> items, int missing, int expired) {
    }

    public record Upload(UUID typeId, UUID employeeId, UUID vehicleId, LocalDate issuedOn, LocalDate expiresOn, String filename,
            byte[] content) {
    }

    public record Download(String filename, String contentType, long size, InputStream content) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final ObjectStorage storage;
    private final FileScanner scanner;
    private final AuditLog auditLog;
    private final Notifier notifier;
    private final ReportingProjection reporting;
    private final Clock clock;
    private final long maxBytes;
    private final Tika tika = new Tika();

    public DocumentService(JdbcTemplate jdbcTemplate, ObjectStorage storage, FileScanner scanner, AuditLog auditLog, Notifier notifier,
            ReportingProjection reporting, Clock clock, @Value("${andaime.storage.max-file-bytes}") long maxBytes) {
        this.reporting = reporting;
        this.jdbcTemplate = jdbcTemplate;
        this.storage = storage;
        this.scanner = scanner;
        this.auditLog = auditLog;
        this.notifier = notifier;
        this.clock = clock;
        this.maxBytes = maxBytes;
    }

    // --- tipos e exigências ---------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<DocumentType> types() {
        OrgRole.require(OrgRole.WORKER);
        var countries = new HashMap<UUID, List<String>>();
        var everywhere = new HashMap<UUID, Boolean>();
        jdbcTemplate.query("SELECT document_type_id, country FROM document_requirements", resultSet -> {
            var type = resultSet.getObject(1, UUID.class);
            var country = resultSet.getString(2);
            if (country == null) {
                everywhere.put(type, true);
            } else {
                countries.computeIfAbsent(type, k -> new ArrayList<>()).add(country);
            }
        });
        return jdbcTemplate.query("""
                SELECT id, name, subject, requires_expiry, alert_days, version FROM document_types
                WHERE archived_at IS NULL ORDER BY subject, lower(name)
                """, (resultSet, rowNumber) -> {
            var id = resultSet.getObject(1, UUID.class);
            return new DocumentType(id, resultSet.getString(2), resultSet.getString(3), resultSet.getBoolean(4), resultSet.getInt(5),
                    everywhere.getOrDefault(id, false), countries.getOrDefault(id, List.of()), resultSet.getInt(6));
        });
    }

    @Transactional
    public DocumentType saveType(UUID id, TypeInput input) {
        OrgRole.require(OrgRole.MANAGER);
        var name = input.name() == null ? "" : input.name().strip();
        if (name.length() < 2 || name.length() > 120) {
            throw invalid("name", "Indique o nome do tipo de documento.");
        }
        var subject = input.subject() == null ? "EMPLOYEE" : input.subject();
        if (!Set.of("EMPLOYEE", "VEHICLE").contains(subject)) {
            throw invalid("subject", "Tipo de titular inválido.");
        }
        var alertDays = input.alertDays() == null ? 30 : input.alertDays();
        if (alertDays < 0 || alertDays > 365) {
            throw invalid("alertDays", "O aviso tem de ser entre 0 e 365 dias.");
        }
        try {
            if (id == null) {
                id = jdbcTemplate.queryForObject("""
                        INSERT INTO document_types (organization_id, name, subject, requires_expiry, alert_days)
                        VALUES (?, ?, ?, ?, ?) RETURNING id
                        """, UUID.class, TenantContext.organizationId().orElseThrow(), name, subject,
                        input.requiresExpiry() == null || input.requiresExpiry(), alertDays);
                auditLog.record("document-type.created", "document_type", id, Map.of("name", name));
            } else {
                var updated = jdbcTemplate.update("""
                        UPDATE document_types SET name = ?, requires_expiry = ?, alert_days = ?, version = version + 1
                        WHERE id = ? AND archived_at IS NULL AND (?::int IS NULL OR version = ?)
                        """, name, input.requiresExpiry() == null || input.requiresExpiry(), alertDays, id, input.version(), input.version());
                if (updated == 0) {
                    throw new ApiException(HttpStatus.CONFLICT, "stale", "O tipo foi alterado entretanto ou já não existe.");
                }
                auditLog.record("document-type.updated", "document_type", id, Map.of("name", name));
            }
        } catch (org.springframework.dao.DuplicateKeyException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "name-taken", "Já existe um tipo de documento com esse nome.");
        }
        var saved = id;
        return types().stream().filter(t -> t.id().equals(saved)).findFirst().orElseThrow();
    }

    @Transactional
    public void archiveType(UUID id) {
        OrgRole.require(OrgRole.MANAGER);
        if (jdbcTemplate.update("UPDATE document_types SET archived_at = now(), version = version + 1 WHERE id = ? AND archived_at IS NULL", id) == 0) {
            throw notFound();
        }
        jdbcTemplate.update("DELETE FROM document_requirements WHERE document_type_id = ?", id);
        auditLog.record("document-type.archived", "document_type", id);
    }

    /** Define onde o tipo é obrigatório: em todas as obras ({@code everywhere}) e/ou em obras de certos países. */
    @Transactional
    public DocumentType setRequirements(UUID typeId, boolean everywhere, List<String> countries) {
        OrgRole.require(OrgRole.MANAGER);
        var exists = jdbcTemplate.queryForObject("SELECT EXISTS (SELECT 1 FROM document_types WHERE id = ? AND archived_at IS NULL)",
                Boolean.class, typeId);
        if (!Boolean.TRUE.equals(exists)) {
            throw notFound();
        }
        jdbcTemplate.update("DELETE FROM document_requirements WHERE document_type_id = ?", typeId);
        var organizationId = TenantContext.organizationId().orElseThrow();
        if (everywhere) {
            jdbcTemplate.update("INSERT INTO document_requirements (organization_id, document_type_id, country) VALUES (?, ?, NULL)",
                    organizationId, typeId);
        }
        for (var country : countries == null ? List.<String>of() : countries) {
            var code = country.strip().toUpperCase(Locale.ROOT);
            if (!code.matches("^[A-Z]{2}$")) {
                throw invalid("countries", "País inválido: " + country);
            }
            jdbcTemplate.update("""
                    INSERT INTO document_requirements (organization_id, document_type_id, country) VALUES (?, ?, ?) ON CONFLICT DO NOTHING
                    """, organizationId, typeId, code);
        }
        auditLog.record("document-type.requirements", "document_type", typeId,
                Map.of("everywhere", everywhere, "countries", countries == null ? List.of() : countries));
        return types().stream().filter(t -> t.id().equals(typeId)).findFirst().orElseThrow();
    }

    // --- documentos -------------------------------------------------------------------------------------

    private static final String DOCUMENT_SELECT = """
            SELECT document.id, document.document_type_id, type.name AS type_name, type.alert_days, type.requires_expiry,
                   document.employee_id, employee.full_name, document.vehicle_id, vehicle.plate, document.archived_at,
                   document.version, current.expires_on, current.verified_at IS NOT NULL AS verified
            FROM documents document
            JOIN document_types type ON type.organization_id = document.organization_id AND type.id = document.document_type_id
            LEFT JOIN employees employee ON employee.organization_id = document.organization_id AND employee.id = document.employee_id
            LEFT JOIN vehicles vehicle ON vehicle.organization_id = document.organization_id AND vehicle.id = document.vehicle_id
            LEFT JOIN document_versions current ON current.organization_id = document.organization_id AND current.id = document.current_version_id
            """;

    @Transactional(readOnly = true)
    public List<DocumentView> list(UUID employeeId, UUID vehicleId, UUID typeId, String status, boolean archived) {
        var scope = scope("document");
        var sql = new StringBuilder(DOCUMENT_SELECT).append(" WHERE ").append(scope.sql())
                .append(archived ? " AND document.archived_at IS NOT NULL" : " AND document.archived_at IS NULL");
        var params = new ArrayList<Object>(scope.params());
        if (employeeId != null) {
            sql.append(" AND document.employee_id = ?");
            params.add(employeeId);
        }
        if (vehicleId != null) {
            sql.append(" AND document.vehicle_id = ?");
            params.add(vehicleId);
        }
        if (typeId != null) {
            sql.append(" AND document.document_type_id = ?");
            params.add(typeId);
        }
        sql.append(" ORDER BY current.expires_on NULLS LAST, type.name LIMIT 2000");
        var today = TenantContext.today(clock);
        var result = jdbcTemplate.query(sql.toString(), (resultSet, rowNumber) -> document(resultSet, today, null, List.of()),
                params.toArray());
        return status == null || status.isBlank() ? result : result.stream().filter(d -> d.status().equals(status)).toList();
    }

    @Transactional(readOnly = true)
    public DocumentView get(UUID id) {
        var scope = scope("document");
        var params = new ArrayList<Object>(List.of(id));
        params.addAll(scope.params());
        var today = TenantContext.today(clock);
        var versions = versions(id);
        return jdbcTemplate.query(DOCUMENT_SELECT + " WHERE document.id = ? AND " + scope.sql(), (resultSet, rowNumber) -> {
            var currentId = versions.isEmpty() ? null : versions.getFirst();
            return document(resultSet, today, currentId, versions);
        }, params.toArray()).stream().findFirst().orElseThrow(DocumentService::notFound);
    }

    @Transactional
    public DocumentView upload(Upload upload) {
        if ((upload.employeeId() == null) == (upload.vehicleId() == null)) {
            throw invalid("employeeId", "Indique o trabalhador ou a viatura.");
        }
        if (upload.vehicleId() != null) {
            OrgRole.require(OrgRole.MANAGER);
        } else if (!inScope(upload.employeeId())) {
            throw notFound();
        }
        var type = jdbcTemplate.query("SELECT subject, requires_expiry, name FROM document_types WHERE id = ? AND archived_at IS NULL",
                (resultSet, rowNumber) -> new Object[] {resultSet.getString(1), resultSet.getBoolean(2), resultSet.getString(3)},
                upload.typeId()).stream().findFirst().orElseThrow(() -> invalid("typeId", "Tipo de documento inválido."));
        if (!type[0].equals(upload.employeeId() != null ? "EMPLOYEE" : "VEHICLE")) {
            throw invalid("typeId", "Este tipo de documento não se aplica a este titular.");
        }
        if ((Boolean) type[1] && upload.expiresOn() == null) {
            throw invalid("expiresOn", "Indique a data de validade.");
        }
        if (upload.issuedOn() != null && upload.expiresOn() != null && upload.expiresOn().isBefore(upload.issuedOn())) {
            throw invalid("expiresOn", "A validade não pode ser anterior à emissão.");
        }
        var content = upload.content();
        if (content == null || content.length == 0) {
            throw invalid("file", "Escolha um ficheiro.");
        }
        if (content.length > maxBytes) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "file-too-large", "O ficheiro tem mais de " + (maxBytes / 1024 / 1024) + " MB.");
        }
        var filename = cleanFilename(upload.filename());
        var detected = tika.detect(content, filename);
        if (!ALLOWED_TYPES.contains(detected)) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "file-type",
                    "Formato não aceite. Use PDF, JPEG, PNG ou WebP.").with("detected", detected);
        }

        var organizationId = TenantContext.organizationId().orElseThrow();
        var holderColumn = upload.employeeId() != null ? "employee_id" : "vehicle_id";
        var holder = upload.employeeId() != null ? upload.employeeId() : upload.vehicleId();
        // Serializa uploads concorrentes para o mesmo titular e tipo (um documento ativo por tipo).
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class,
                organizationId + ":document:" + holder + ":" + upload.typeId());
        var documentId = jdbcTemplate.query("SELECT id FROM documents WHERE " + holderColumn
                + " = ? AND document_type_id = ? AND archived_at IS NULL", (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class),
                holder, upload.typeId()).stream().findFirst().orElse(null);
        var created = documentId == null;
        if (created) {
            documentId = jdbcTemplate.queryForObject("INSERT INTO documents (organization_id, document_type_id, " + holderColumn
                    + ") VALUES (?, ?, ?) RETURNING id", UUID.class, organizationId, upload.typeId(), holder);
        }
        var scan = scanner.requireClean(content);
        var versionId = UUID.randomUUID();
        var key = "org/" + organizationId + "/documents/" + documentId + "/" + versionId;
        storage.put(key, content, detected);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        storage.delete(key);
                    }
                }
            });
        }
        jdbcTemplate.update("""
                INSERT INTO document_versions (id, organization_id, document_id, storage_key, filename, content_type, size_bytes, sha256,
                                               issued_on, expires_on, uploaded_by_user_id, scan_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, versionId, organizationId, documentId, key, filename, detected, (long) content.length, sha256(content),
                upload.issuedOn(), upload.expiresOn(), TenantContext.userId().orElseThrow(), scan.name());
        jdbcTemplate.update("UPDATE documents SET current_version_id = ?, version = version + 1 WHERE id = ?", versionId, documentId);
        var changes = new LinkedHashMap<String, Object>();
        changes.put("type", type[2]);
        changes.put("expiresOn", upload.expiresOn() == null ? null : upload.expiresOn().toString());
        changes.put("sizeBytes", content.length);
        auditLog.record(created ? "document.uploaded" : "document.renewed", "document", documentId, changes);
        project(documentId);
        if (!OrgRole.current().atLeast(OrgRole.MANAGER)) {
            notifier.notify(notifier.managers(), "document.uploaded", "Novo documento para verificar",
                    type[2] + " carregado e à espera de verificação.", "/documentos", null);
        }
        return get(documentId);
    }

    /** Download sempre pela API (com verificação de acesso); cada download fica auditado. */
    @Transactional
    public Download download(UUID documentId, UUID versionId) {
        get(documentId);
        var row = jdbcTemplate.query("""
                SELECT storage_key, filename, content_type, size_bytes FROM document_versions WHERE id = ? AND document_id = ?
                """, (resultSet, rowNumber) -> new Object[] {resultSet.getString(1), resultSet.getString(2), resultSet.getString(3),
                resultSet.getLong(4)}, versionId, documentId).stream().findFirst().orElseThrow(DocumentService::notFound);
        if (row[0] == null) {
            // Ficheiro apagado na anonimização do trabalhador (RGPD).
            throw new ApiException(HttpStatus.GONE, "document-purged", "O ficheiro foi apagado e já não está disponível.");
        }
        auditLog.record("document.downloaded", "document", documentId, Map.of("versionId", versionId.toString()));
        return new Download((String) row[1], (String) row[2], (Long) row[3], storage.open((String) row[0]));
    }

    @Transactional
    public DocumentView verify(UUID documentId, UUID versionId) {
        OrgRole.require(OrgRole.MANAGER);
        get(documentId);
        if (jdbcTemplate.update("""
                UPDATE document_versions SET verified_at = now(), verified_by_user_id = ?
                WHERE id = ? AND document_id = ? AND verified_at IS NULL
                """, TenantContext.userId().orElseThrow(), versionId, documentId) == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "already-verified", "Esta versão já foi verificada ou não existe.");
        }
        auditLog.record("document.verified", "document", documentId, Map.of("versionId", versionId.toString()));
        project(documentId);
        return get(documentId);
    }

    @Transactional
    public DocumentView archive(UUID documentId) {
        OrgRole.require(OrgRole.MANAGER);
        get(documentId);
        jdbcTemplate.update("UPDATE documents SET archived_at = now(), version = version + 1 WHERE id = ? AND archived_at IS NULL", documentId);
        auditLog.record("document.archived", "document", documentId);
        reporting.removeDocument(documentId);
        return jdbcTemplate.query(DOCUMENT_SELECT + " WHERE document.id = ?",
                (resultSet, rowNumber) -> document(resultSet, TenantContext.today(clock), null, List.of()), documentId).getFirst();
    }

    // --- conformidade e alertas ---------------------------------------------------------------------------

    /** Situação de cada trabalhador ativo (no âmbito) face aos documentos obrigatórios; {@code country} junta os desse país. */
    @Transactional(readOnly = true)
    public List<ComplianceRow> compliance(String country) {
        OrgRole.require(OrgRole.FOREMAN);
        var code = country == null || country.isBlank() ? null : country.strip().toUpperCase(Locale.ROOT);
        var required = jdbcTemplate.query("""
                SELECT DISTINCT type.id, type.name, type.alert_days FROM document_requirements requirement
                JOIN document_types type ON type.organization_id = requirement.organization_id AND type.id = requirement.document_type_id
                WHERE type.archived_at IS NULL AND type.subject = 'EMPLOYEE' AND (requirement.country IS NULL OR requirement.country = ?)
                ORDER BY type.name
                """, (resultSet, rowNumber) -> new Object[] {resultSet.getObject(1, UUID.class), resultSet.getString(2), resultSet.getInt(3)},
                code);
        var scope = scope("document");
        var employeeScope = scope.sql().replace("document.employee_id", "employee.id").replace("document.vehicle_id IS NULL AND ", "");
        var employees = jdbcTemplate.query("SELECT employee.id, employee.full_name FROM employees employee WHERE employee.archived_at IS NULL"
                + " AND employee.status = 'ACTIVE' AND " + employeeScope + " ORDER BY employee.full_name",
                (resultSet, rowNumber) -> new Object[] {resultSet.getObject(1, UUID.class), resultSet.getString(2)}, scope.params().toArray());
        var held = new HashMap<String, Object[]>();
        jdbcTemplate.query("""
                SELECT document.employee_id, document.document_type_id, document.id, current.expires_on
                FROM documents document
                JOIN document_versions current ON current.organization_id = document.organization_id AND current.id = document.current_version_id
                WHERE document.archived_at IS NULL AND document.employee_id IS NOT NULL
                """, resultSet -> {
            held.put(resultSet.getObject(1, UUID.class) + ":" + resultSet.getObject(2, UUID.class),
                    new Object[] {resultSet.getObject(3, UUID.class), resultSet.getObject(4, LocalDate.class)});
        });
        var today = TenantContext.today(clock);
        var rows = new ArrayList<ComplianceRow>();
        for (var employee : employees) {
            var items = new ArrayList<ComplianceItem>();
            int missing = 0;
            int expired = 0;
            for (var type : required) {
                var doc = held.get(employee[0] + ":" + type[0]);
                String status;
                LocalDate expires = null;
                UUID documentId = null;
                if (doc == null) {
                    status = "MISSING";
                    missing++;
                } else {
                    documentId = (UUID) doc[0];
                    expires = (LocalDate) doc[1];
                    status = status(expires, (Integer) type[2], today);
                    if (status.equals("EXPIRED")) {
                        expired++;
                    }
                }
                items.add(new ComplianceItem((UUID) type[0], (String) type[1], status, expires, documentId));
            }
            rows.add(new ComplianceRow((UUID) employee[0], (String) employee[1], items, missing, expired));
        }
        return rows;
    }

    /**
     * Alerta diário: avisa os gestores dos documentos que caducam dentro do prazo do tipo ou já caducaram.
     * Uma notificação por versão e situação (a chave de deduplicação impede repetições). Devolve quantas criou.
     */
    @Transactional
    public int notifyExpiring() {
        var today = TenantContext.today(clock);
        var due = jdbcTemplate.query("""
                SELECT document.id, current.id, current.expires_on, type.name, coalesce(employee.full_name, vehicle.plate)
                FROM documents document
                JOIN document_versions current ON current.organization_id = document.organization_id AND current.id = document.current_version_id
                JOIN document_types type ON type.organization_id = document.organization_id AND type.id = document.document_type_id
                LEFT JOIN employees employee ON employee.organization_id = document.organization_id AND employee.id = document.employee_id
                LEFT JOIN vehicles vehicle ON vehicle.organization_id = document.organization_id AND vehicle.id = document.vehicle_id
                WHERE document.archived_at IS NULL AND current.expires_on IS NOT NULL
                  AND current.expires_on <= ?::date + type.alert_days
                """, (resultSet, rowNumber) -> new Object[] {resultSet.getObject(1, UUID.class), resultSet.getObject(2, UUID.class),
                resultSet.getObject(3, LocalDate.class), resultSet.getString(4), resultSet.getString(5)}, today);
        // Os estados mudam com o tempo (a caducar, caducado): atualiza os relatórios de todos os documentos ativos.
        jdbcTemplate.queryForList("SELECT id FROM documents WHERE archived_at IS NULL", UUID.class).forEach(this::project);
        var managers = notifier.managers();
        int created = 0;
        for (var row : due) {
            var expires = (LocalDate) row[2];
            var expired = expires.isBefore(today);
            var before = jdbcTemplate.queryForObject("SELECT count(*) FROM notifications", Integer.class);
            notifier.notify(managers, expired ? "document.expired" : "document.expiring",
                    (expired ? "Caducado: " : "A caducar: ") + row[3] + " — " + row[4],
                    (expired ? "Caducou a " : "Caduca a ") + expires, "/documentos",
                    "document:" + row[1] + ":" + (expired ? "expired" : "expiring"));
            created += jdbcTemplate.queryForObject("SELECT count(*) FROM notifications", Integer.class) - before;
        }
        return created;
    }

    /** Estado do documento nos relatórios: válido, a caducar, caducado, ou por verificar (versão atual não verificada). */
    private void project(UUID documentId) {
        var today = TenantContext.today(clock);
        jdbcTemplate.query(DOCUMENT_SELECT + " WHERE document.id = ? AND document.archived_at IS NULL", resultSet -> {
            var expires = resultSet.getObject("expires_on", LocalDate.class);
            var status = status(expires, resultSet.getInt("alert_days"), today);
            if (status.equals("VALID") && !resultSet.getBoolean("verified")) {
                status = "PENDING";
            }
            var employee = resultSet.getObject("employee_id", UUID.class);
            reporting.documentState(new ReportingProjection.DocumentState(documentId, employee != null ? "EMPLOYEE" : "VEHICLE",
                    employee != null ? employee : resultSet.getObject("vehicle_id", UUID.class), resultSet.getString("type_name"),
                    null, status, expires));
        }, documentId);
    }

    // --- auxiliares ---------------------------------------------------------------------------------------

    private record Scope(String sql, List<Object> params) {
    }

    /** Gestor: tudo; encarregado: documentos da sua equipa e os seus; trabalhador: os seus. Viaturas só gestor. */
    private static Scope scope(String alias) {
        var role = OrgRole.current();
        if (role.atLeast(OrgRole.MANAGER)) {
            return new Scope("TRUE", List.of());
        }
        var me = TenantContext.employeeId().orElse(null);
        if (me == null) {
            return new Scope("FALSE", List.of());
        }
        if (role == OrgRole.WORKER) {
            return new Scope(alias + ".vehicle_id IS NULL AND " + alias + ".employee_id = ?", List.of(me));
        }
        return new Scope(alias + ".vehicle_id IS NULL AND (" + alias + ".employee_id = ? OR " + alias + ".employee_id IN ("
                + "SELECT member.employee_id FROM team_members member JOIN teams led ON led.organization_id = member.organization_id "
                + "AND led.id = member.team_id WHERE led.foreman_employee_id = ? AND member.joined_on <= current_date "
                + "AND (member.left_on IS NULL OR member.left_on >= current_date)))", List.of(me, me));
    }

    private boolean inScope(UUID employeeId) {
        var scope = scope("document");
        var params = new ArrayList<Object>(List.of(employeeId));
        params.addAll(scope.params());
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM (SELECT ?::uuid AS employee_id, NULL::uuid AS vehicle_id) document WHERE " + scope.sql() + ")",
                Boolean.class, params.toArray()));
    }

    private List<VersionView> versions(UUID documentId) {
        return jdbcTemplate.query("""
                SELECT version.id, version.filename, version.content_type, version.size_bytes, version.sha256, version.issued_on,
                       version.expires_on, uploader.display_name, version.uploaded_at, verifier.display_name, version.verified_at
                FROM document_versions version
                JOIN users uploader ON uploader.id = version.uploaded_by_user_id
                LEFT JOIN users verifier ON verifier.id = version.verified_by_user_id
                WHERE version.document_id = ? ORDER BY version.uploaded_at DESC
                """, (resultSet, rowNumber) -> new VersionView(resultSet.getObject(1, UUID.class), resultSet.getString(2),
                resultSet.getString(3), resultSet.getLong(4), resultSet.getString(5), resultSet.getObject(6, LocalDate.class),
                resultSet.getObject(7, LocalDate.class), resultSet.getString(8), resultSet.getObject(9, OffsetDateTime.class).toInstant(),
                resultSet.getString(10), resultSet.getObject(11) == null ? null : resultSet.getObject(11, OffsetDateTime.class).toInstant()),
                documentId);
    }

    private static DocumentView document(ResultSet resultSet, LocalDate today, VersionView current, List<VersionView> versions)
            throws SQLException {
        var expires = resultSet.getObject("expires_on", LocalDate.class);
        return new DocumentView(resultSet.getObject("id", UUID.class), resultSet.getObject("document_type_id", UUID.class),
                resultSet.getString("type_name"), resultSet.getObject("employee_id", UUID.class), resultSet.getString("full_name"),
                resultSet.getObject("vehicle_id", UUID.class), resultSet.getString("plate"),
                status(expires, resultSet.getInt("alert_days"), today), expires, resultSet.getBoolean("verified"), current, versions,
                resultSet.getObject("archived_at") != null, resultSet.getInt("version"));
    }

    static String status(LocalDate expires, int alertDays, LocalDate today) {
        if (expires == null) {
            return "VALID";
        }
        if (expires.isBefore(today)) {
            return "EXPIRED";
        }
        return expires.isAfter(today.plusDays(alertDays)) ? "VALID" : "EXPIRING";
    }

    private static String cleanFilename(String name) {
        var base = name == null ? "documento" : name.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}\"]", "").strip();
        if (base.isEmpty()) {
            base = "documento";
        }
        return base.length() > 200 ? base.substring(base.length() - 200) : base;
    }

    private static String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
    }

    static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "O documento não foi encontrado.");
    }
}
