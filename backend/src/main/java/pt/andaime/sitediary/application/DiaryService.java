package pt.andaime.sitediary.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import pt.andaime.audit.AuditLog;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.storage.PhotoStorage.PhotoContent;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.sitediary.application.DiaryViews.Author;
import pt.andaime.sitediary.application.DiaryViews.DiaryPage;
import pt.andaime.sitediary.application.DiaryViews.EntryInput;
import pt.andaime.sitediary.application.DiaryViews.EntryView;
import pt.andaime.sitediary.application.DiaryViews.Export;
import pt.andaime.sitediary.application.DiaryViews.ExportEntry;
import pt.andaime.sitediary.application.DiaryViews.ExportPhoto;
import pt.andaime.sitediary.application.DiaryViews.MonthCount;
import pt.andaime.sitediary.application.DiaryViews.PhotoView;
import pt.andaime.sitediary.application.DiaryViews.RecentEntry;
import pt.andaime.sitediary.domain.DiaryRules;

/**
 * Diário de obra. Lê quem vê a obra (gestores: todas; encarregado: as obras de que é encarregado ou onde as suas
 * equipas estiveram planeadas, como em {@code SiteService}); escreve o gestor em todas e o encarregado nas do seu
 * âmbito; edita e apaga o autor ou um gestor. O trabalhador não acede.
 */
@Service
public class DiaryService {

    static final int LIST_LIMIT = 300;
    public static final int DOCX_MAX_ENTRIES = 400;
    public static final int DOCX_MAX_PHOTOS = 300;
    public static final int XLSX_MAX_ENTRIES = 10_000;
    private static final DateTimeFormatter MONTH_LABEL = DateTimeFormatter.ofPattern("MMMM 'de' yyyy", Locale.forLanguageTag("pt-PT"));

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final DiaryPhotoStore photos;
    private final Clock clock;

    public DiaryService(JdbcTemplate jdbcTemplate, AuditLog auditLog, DiaryPhotoStore photos, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.photos = photos;
        this.clock = clock;
    }

    // --- leitura -----------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public DiaryPage list(UUID siteId, String month, String query) {
        var site = site(siteId);
        var filter = filter(siteId, month, query);
        var params = new ArrayList<>(filter.params());
        params.add(LIST_LIMIT);
        var entries = jdbcTemplate.query(ENTRY_SELECT + " WHERE " + filter.sql()
                + " ORDER BY entry.entry_date DESC, entry.created_at DESC LIMIT ?", this::entryRow, params.toArray());
        var total = jdbcTemplate.queryForObject("SELECT count(*) FROM diary_entries entry WHERE " + filter.sql(), Integer.class,
                filter.params().toArray());
        var months = jdbcTemplate.query("""
                SELECT to_char(entry_date, 'YYYY-MM') AS month, count(*) AS total FROM diary_entries
                WHERE site_id = ? GROUP BY 1 ORDER BY 1 DESC
                """, (resultSet, rowNumber) -> new MonthCount(resultSet.getString(1), resultSet.getInt(2)), siteId);
        var canWrite = canWrite(site);
        var views = withPhotos(siteId, entries, canWrite);
        return new DiaryPage(views, months, total == null ? 0 : total, total != null && total > entries.size(), canWrite);
    }

    /** Últimos registos de todas as obras no âmbito (obras não arquivadas), com até 4 fotos cada. */
    @Transactional(readOnly = true)
    public List<RecentEntry> recent(int limit) {
        var scope = scope();
        var params = new ArrayList<>(scope.params());
        params.add(Math.max(1, Math.min(limit, 20)));
        record Row(UUID id, UUID siteId, String code, String name, String color, LocalDate date, String title,
                String author, java.time.Instant createdAt, int photoCount) {
        }
        var rows = jdbcTemplate.query("""
                SELECT entry.id, entry.site_id, site.code, site.name, site.color, entry.entry_date, entry.title,
                       author.display_name, entry.created_at,
                       (SELECT count(*) FROM diary_photos photo
                        WHERE photo.organization_id = entry.organization_id AND photo.entry_id = entry.id) AS photo_count
                FROM diary_entries entry
                JOIN sites site ON site.organization_id = entry.organization_id AND site.id = entry.site_id
                JOIN users author ON author.id = entry.author_user_id
                WHERE site.archived_at IS NULL AND\s""" + scope.sql() + " ORDER BY entry.created_at DESC LIMIT ?",
                (resultSet, rowNumber) -> new Row(resultSet.getObject(1, UUID.class), resultSet.getObject(2, UUID.class),
                        resultSet.getString(3), resultSet.getString(4), resultSet.getString(5),
                        resultSet.getObject(6, LocalDate.class), resultSet.getString(7), resultSet.getString(8),
                        resultSet.getObject(9, OffsetDateTime.class).toInstant(), resultSet.getInt(10)),
                params.toArray());
        var photosByEntry = photoViews(rows.stream().map(Row::id).toList(), 4);
        return rows.stream().map(row -> new RecentEntry(row.id(), row.siteId(), row.code(), row.name(), row.color(), row.date(),
                row.title(), row.author(), row.createdAt(), row.photoCount(), photosByEntry.getOrDefault(row.id(), List.of())))
                .toList();
    }

    /** Fotografia para quem pode ver a obra. */
    @Transactional(readOnly = true)
    public PhotoContent photo(UUID siteId, UUID entryId, UUID photoId) {
        site(siteId);
        return jdbcTemplate.query("""
                SELECT photo.storage_key, photo.content_type FROM diary_photos photo
                JOIN diary_entries entry ON entry.organization_id = photo.organization_id AND entry.id = photo.entry_id
                WHERE photo.id = ? AND entry.id = ? AND entry.site_id = ?
                """, (resultSet, rowNumber) -> new PhotoContent(photos.open(resultSet.getString(1)), resultSet.getString(2)),
                photoId, entryId, siteId).stream().findFirst().orElseThrow(DiaryService::photoNotFound);
    }

    /** Registos (do mais antigo para o mais recente) e fotos para o Word e o Excel, com os mesmos filtros do ecrã. */
    @Transactional
    public Export export(UUID siteId, String month, String query, int maxEntries, int maxPhotos) {
        var site = site(siteId);
        var filter = filter(siteId, month, query);
        var total = jdbcTemplate.queryForObject("SELECT count(*) FROM diary_entries entry WHERE " + filter.sql(), Integer.class,
                filter.params().toArray());
        if (total != null && total > maxEntries) {
            throw tooLarge();
        }
        var entries = jdbcTemplate.query(ENTRY_SELECT + " WHERE " + filter.sql()
                + " ORDER BY entry.entry_date, entry.created_at", this::entryRow, filter.params().toArray());
        var ids = entries.stream().map(EntryRow::id).toList();
        var byEntry = new HashMap<UUID, List<ExportPhoto>>();
        var photoCount = 0;
        if (!ids.isEmpty()) {
            var rows = jdbcTemplate.query("""
                    SELECT entry_id, storage_key, content_type, width, height FROM diary_photos
                    WHERE entry_id = ANY (?) ORDER BY entry_id, position
                    """, preparedStatement -> preparedStatement.setArray(1,
                            preparedStatement.getConnection().createArrayOf("uuid", ids.toArray())),
                    (resultSet, rowNumber) -> Map.entry(resultSet.getObject(1, UUID.class), new ExportPhoto(resultSet.getString(2),
                            resultSet.getString(3), (Integer) resultSet.getObject(4), (Integer) resultSet.getObject(5))));
            photoCount = rows.size();
            rows.forEach(row -> byEntry.computeIfAbsent(row.getKey(), key -> new ArrayList<>()).add(row.getValue()));
        }
        if (photoCount > maxPhotos) {
            throw tooLarge();
        }
        var exportEntries = entries.stream().map(entry -> new ExportEntry(entry.date(), entry.title(), entry.body(),
                entry.authorName(), entry.authorRole(), entry.createdAt(), entry.updatedAt(),
                byEntry.getOrDefault(entry.id(), List.of()))).toList();
        var yearMonth = month(month);
        var scope = yearMonth == null ? "Todos os registos" : capitalize(MONTH_LABEL.format(yearMonth));
        if (query != null && !query.isBlank()) {
            scope += " · pesquisa \"" + query.strip() + "\"";
        }
        var filename = "diario-" + site.code().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9-]", "")
                + (yearMonth == null ? "" : "-" + yearMonth);
        auditLog.record("site.diary-exported", "site", siteId, Map.of("entries", exportEntries.size()));
        return new Export(site.code(), site.name(), scope, filename, exportEntries);
    }

    // --- escrita -----------------------------------------------------------------------------

    @Transactional
    public EntryView create(UUID siteId, EntryInput input) {
        var role = OrgRole.require(OrgRole.FOREMAN);
        writableSite(siteId);
        var values = validate(input);
        var me = TenantContext.userId().orElseThrow();
        var created = jdbcTemplate.query("""
                INSERT INTO diary_entries (organization_id, site_id, entry_date, title, body, author_user_id, author_role, client_key)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (organization_id, author_user_id, client_key) WHERE client_key IS NOT NULL DO NOTHING
                RETURNING id
                """, (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class),
                TenantContext.organizationId().orElseThrow(), siteId, values.date(), values.title(), values.body(), me,
                role.name(), input.clientKey()).stream().findFirst();
        if (created.isEmpty()) {
            // Repetição do mesmo envio (rede instável): devolve o registo já criado.
            var existing = jdbcTemplate.query("SELECT id, site_id FROM diary_entries WHERE author_user_id = ? AND client_key = ?",
                    (resultSet, rowNumber) -> Map.entry(resultSet.getObject(1, UUID.class), resultSet.getObject(2, UUID.class)),
                    me, input.clientKey()).stream().findFirst().orElseThrow();
            if (!existing.getValue().equals(siteId)) {
                throw new ApiException(HttpStatus.CONFLICT, "client-key-reused", "Este envio já foi usado noutra obra.");
            }
            return entry(siteId, existing.getKey());
        }
        var id = created.get();
        auditLog.record("site.diary-created", "site", siteId, Map.of("entryId", id, "date", values.date().toString()));
        return entry(siteId, id);
    }

    @Transactional
    public EntryView update(UUID siteId, UUID entryId, EntryInput input, int expectedVersion) {
        OrgRole.require(OrgRole.FOREMAN);
        writableSite(siteId);
        var current = editable(siteId, entryId);
        var values = validate(input);
        var updated = jdbcTemplate.update("""
                UPDATE diary_entries SET entry_date = ?, title = ?, body = ?, version = version + 1
                WHERE id = ? AND site_id = ? AND version = ?
                """, values.date(), values.title(), values.body(), entryId, siteId, expectedVersion);
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "stale", "O registo foi alterado por outra pessoa. Recarregue e tente de novo.");
        }
        var changes = new LinkedHashMap<String, Object>();
        changes.put("entryId", entryId);
        if (!current.date().equals(values.date())) {
            changes.put("date", Map.of("from", current.date().toString(), "to", values.date().toString()));
        }
        if (!current.title().equals(values.title())) {
            changes.put("title", Map.of("changed", true));
        }
        if (!current.body().equals(values.body())) {
            changes.put("body", Map.of("changed", true));
        }
        auditLog.record("site.diary-updated", "site", siteId, changes);
        return entry(siteId, entryId);
    }

    @Transactional
    public void delete(UUID siteId, UUID entryId) {
        OrgRole.require(OrgRole.FOREMAN);
        writableSite(siteId);
        var current = editable(siteId, entryId);
        var keys = jdbcTemplate.queryForList("SELECT storage_key FROM diary_photos WHERE entry_id = ?", String.class, entryId);
        jdbcTemplate.update("DELETE FROM diary_entries WHERE id = ? AND site_id = ?", entryId, siteId);
        keys.forEach(photos::deleteAfterCommit);
        auditLog.record("site.diary-deleted", "site", siteId,
                Map.of("entryId", entryId, "date", current.date().toString(), "photos", keys.size()));
    }

    /** Acrescenta fotos ao fim do registo (no máximo 20 no total). Com {@code clientKey}, repetir o envio não duplica. */
    @Transactional
    public EntryView addPhotos(UUID siteId, UUID entryId, List<MultipartFile> files, UUID clientKey) {
        OrgRole.require(OrgRole.FOREMAN);
        writableSite(siteId);
        editable(siteId, entryId);
        if (files == null || files.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "file-empty", "Escolha uma fotografia.");
        }
        if (clientKey != null) {
            if (files.size() != 1) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Envie uma fotografia de cada vez com a chave do envio.");
            }
            var repeated = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM diary_photos WHERE entry_id = ? AND client_key = ?)", Boolean.class, entryId, clientKey));
            if (repeated) {
                return entry(siteId, entryId);
            }
        }
        var next = jdbcTemplate.queryForObject("SELECT coalesce(max(position) + 1, 0) FROM diary_photos WHERE entry_id = ?",
                Integer.class, entryId);
        var start = next == null ? 0 : next;
        if (start + files.size() > DiaryRules.MAX_PHOTOS) {
            throw new ApiException(HttpStatus.CONFLICT, "too-many-photos",
                    "Um registo leva no máximo " + DiaryRules.MAX_PHOTOS + " fotos.").with("max", DiaryRules.MAX_PHOTOS)
                    .with("current", start);
        }
        var organizationId = TenantContext.organizationId().orElseThrow();
        var me = TenantContext.userId().orElseThrow();
        for (int i = 0; i < files.size(); i++) {
            var stored = photos.store(siteId, entryId, files.get(i));
            jdbcTemplate.update("""
                    INSERT INTO diary_photos (organization_id, entry_id, position, storage_key, content_type, width, height,
                        size_bytes, scan_status, client_key, uploaded_by_user_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, organizationId, entryId, start + i, stored.key(), stored.contentType(), stored.width(), stored.height(),
                    stored.sizeBytes(), stored.scanStatus(), clientKey, me);
        }
        auditLog.record("site.diary-photo-added", "site", siteId, Map.of("entryId", entryId, "count", files.size()));
        return entry(siteId, entryId);
    }

    @Transactional
    public void removePhoto(UUID siteId, UUID entryId, UUID photoId) {
        OrgRole.require(OrgRole.FOREMAN);
        writableSite(siteId);
        editable(siteId, entryId);
        var photo = jdbcTemplate.query("SELECT position, storage_key FROM diary_photos WHERE id = ? AND entry_id = ?",
                (resultSet, rowNumber) -> Map.entry(resultSet.getInt(1), resultSet.getString(2)), photoId, entryId)
                .stream().findFirst().orElseThrow(DiaryService::photoNotFound);
        jdbcTemplate.update("DELETE FROM diary_photos WHERE id = ?", photoId);
        jdbcTemplate.update("UPDATE diary_photos SET position = position - 1 WHERE entry_id = ? AND position > ?",
                entryId, photo.getKey());
        photos.deleteAfterCommit(photo.getValue());
        auditLog.record("site.diary-photo-removed", "site", siteId, Map.of("entryId", entryId));
    }

    // --- âmbito ------------------------------------------------------------------------------

    record Scope(String sql, List<Object> params) {
    }

    /** O mesmo âmbito de {@code SiteService.scope()} (alias {@code site}). */
    static Scope scope() {
        var role = OrgRole.current();
        if (role.atLeast(OrgRole.MANAGER)) {
            return new Scope("TRUE", List.of());
        }
        if (role == OrgRole.WORKER) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Não tem permissão para ver o diário de obra.");
        }
        var me = TenantContext.employeeId().orElse(null);
        if (me == null) {
            return new Scope("FALSE", List.of());
        }
        return new Scope("""
                (site.foreman_employee_id = ? OR site.id IN (SELECT assignment.site_id FROM assignments assignment
                 JOIN teams team ON team.organization_id = assignment.organization_id AND team.id = assignment.team_id
                 WHERE team.foreman_employee_id = ? AND assignment.work_date >= current_date - 30))""", List.of(me, me));
    }

    record SiteRef(UUID id, String code, String name, boolean archived) {
    }

    private SiteRef site(UUID siteId) {
        var scope = scope();
        var params = new ArrayList<Object>(List.of(siteId));
        params.addAll(scope.params());
        return jdbcTemplate.query("SELECT site.id, site.code, site.name, site.archived_at FROM sites site WHERE site.id = ? AND "
                + scope.sql(), (resultSet, rowNumber) -> new SiteRef(resultSet.getObject(1, UUID.class), resultSet.getString(2),
                        resultSet.getString(3), resultSet.getObject(4) != null), params.toArray())
                .stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "A obra não foi encontrada."));
    }

    private SiteRef writableSite(UUID siteId) {
        var site = site(siteId);
        if (site.archived()) {
            throw new ApiException(HttpStatus.CONFLICT, "site-archived", "A obra está arquivada: o diário só pode ser consultado.");
        }
        return site;
    }

    private static boolean canWrite(SiteRef site) {
        return OrgRole.current().atLeast(OrgRole.FOREMAN) && !site.archived();
    }

    private static boolean canEdit(EntryRow entry) {
        return OrgRole.current().atLeast(OrgRole.MANAGER)
                || entry.authorUserId().equals(TenantContext.userId().orElse(null));
    }

    /** Registo da obra, bloqueado para alteração, que quem pede pode editar (autor ou gestor). */
    private EntryRow editable(UUID siteId, UUID entryId) {
        var entry = jdbcTemplate.query(ENTRY_SELECT + " WHERE entry.id = ? AND entry.site_id = ? FOR UPDATE OF entry",
                this::entryRow, entryId, siteId).stream().findFirst().orElseThrow(DiaryService::entryNotFound);
        if (!canEdit(entry)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Só quem escreveu o registo ou um gestor o pode alterar.");
        }
        return entry;
    }

    // --- auxiliares --------------------------------------------------------------------------

    private static final String ENTRY_SELECT = """
            SELECT entry.*, author.display_name AS author_name
            FROM diary_entries entry
            JOIN users author ON author.id = entry.author_user_id
            """;

    record EntryRow(UUID id, UUID siteId, LocalDate date, String title, String body, UUID authorUserId, String authorName,
            String authorRole, java.time.Instant createdAt, java.time.Instant updatedAt, int version) {
    }

    private EntryRow entryRow(ResultSet resultSet, int rowNumber) throws SQLException {
        return new EntryRow(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("site_id", UUID.class),
                resultSet.getObject("entry_date", LocalDate.class),
                resultSet.getString("title"),
                resultSet.getString("body"),
                resultSet.getObject("author_user_id", UUID.class),
                resultSet.getString("author_name"),
                resultSet.getString("author_role"),
                resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
                resultSet.getObject("updated_at", OffsetDateTime.class).toInstant(),
                resultSet.getInt("version"));
    }

    private EntryView entry(UUID siteId, UUID entryId) {
        var site = site(siteId);
        var rows = jdbcTemplate.query(ENTRY_SELECT + " WHERE entry.id = ? AND entry.site_id = ?", this::entryRow, entryId, siteId);
        if (rows.isEmpty()) {
            throw entryNotFound();
        }
        return withPhotos(siteId, rows, canWrite(site)).getFirst();
    }

    private List<EntryView> withPhotos(UUID siteId, List<EntryRow> entries, boolean canWrite) {
        var byEntry = photoViews(entries.stream().map(EntryRow::id).toList(), DiaryRules.MAX_PHOTOS);
        return entries.stream().map(entry -> new EntryView(entry.id(), siteId, entry.date(), entry.title(), entry.body(),
                new Author(entry.authorUserId(), entry.authorName(), entry.authorRole()), entry.createdAt(), entry.updatedAt(),
                entry.version(), canWrite && canEdit(entry), byEntry.getOrDefault(entry.id(), List.of()))).toList();
    }

    private Map<UUID, List<PhotoView>> photoViews(List<UUID> entryIds, int perEntry) {
        var result = new HashMap<UUID, List<PhotoView>>();
        if (entryIds.isEmpty()) {
            return result;
        }
        var organizationId = TenantContext.organizationId().orElseThrow();
        jdbcTemplate.query("""
                SELECT photo.id, photo.entry_id, entry.site_id, photo.position, photo.content_type, photo.width, photo.height
                FROM diary_photos photo
                JOIN diary_entries entry ON entry.organization_id = photo.organization_id AND entry.id = photo.entry_id
                WHERE photo.entry_id = ANY (?) AND photo.position < ?
                ORDER BY photo.entry_id, photo.position
                """, preparedStatement -> {
                    preparedStatement.setArray(1, preparedStatement.getConnection().createArrayOf("uuid", entryIds.toArray()));
                    preparedStatement.setInt(2, perEntry);
                }, resultSet -> {
                    var photoId = resultSet.getObject(1, UUID.class);
                    var entryId = resultSet.getObject(2, UUID.class);
                    var url = "/api/orgs/" + organizationId + "/sites/" + resultSet.getObject(3, UUID.class) + "/diary/entries/"
                            + entryId + "/photos/" + photoId;
                    result.computeIfAbsent(entryId, key -> new ArrayList<>()).add(new PhotoView(photoId, resultSet.getInt(4), url,
                            resultSet.getString(5), (Integer) resultSet.getObject(6), (Integer) resultSet.getObject(7)));
                });
        return result;
    }

    record Filter(String sql, List<Object> params) {
    }

    private static Filter filter(UUID siteId, String month, String query) {
        var sql = new StringBuilder("entry.site_id = ?");
        var params = new ArrayList<Object>(List.of(siteId));
        var yearMonth = month(month);
        if (yearMonth != null) {
            sql.append(" AND entry.entry_date >= ? AND entry.entry_date < ?");
            params.add(yearMonth.atDay(1));
            params.add(yearMonth.plusMonths(1).atDay(1));
        }
        DiaryRules.searchPattern(query).ifPresent(pattern -> {
            sql.append(" AND app.fold_name(entry.title || ' ' || entry.body) LIKE '%' || app.fold_name(?) || '%'");
            params.add(pattern);
        });
        return new Filter(sql.toString(), params);
    }

    private static YearMonth month(String month) {
        try {
            return DiaryRules.month(month).orElse(null);
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-month", "Indique o mês no formato AAAA-MM.");
        }
    }

    record Values(LocalDate date, String title, String body) {
    }

    private Values validate(EntryInput input) {
        if (input == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a data e o título do registo.");
        }
        var title = input.title() == null ? "" : input.title().strip();
        if (title.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "title-required", "Indique o título (ex.: \"Betonagem da laje do piso 2\").");
        }
        if (title.length() > DiaryRules.MAX_TITLE) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "title-too-long", "O título tem mais de " + DiaryRules.MAX_TITLE + " caracteres.");
        }
        var body = input.body() == null ? "" : input.body().replace("\r\n", "\n").strip();
        if (body.length() > DiaryRules.MAX_BODY) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "body-too-long", "O texto tem mais de " + DiaryRules.MAX_BODY + " caracteres.");
        }
        if (!DiaryRules.validDate(input.date(), TenantContext.today(clock))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-date", "Indique uma data até hoje.");
        }
        return new Values(input.date(), title, body);
    }

    private static String capitalize(String text) {
        return text.isEmpty() ? text : Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    private static ApiException tooLarge() {
        return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "export-too-large",
                "Há demasiados registos ou fotos para um só ficheiro. Escolha um mês ou pesquise.");
    }

    private static ApiException entryNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "O registo do diário não foi encontrado.");
    }

    private static ApiException photoNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "A fotografia não foi encontrada.");
    }
}
