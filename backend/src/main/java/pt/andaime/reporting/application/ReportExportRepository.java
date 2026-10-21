package pt.andaime.reporting.application;

import java.io.InputStream;
import java.sql.Types;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import pt.andaime.reporting.application.ReportingViews.ClaimedExport;
import pt.andaime.reporting.application.ReportingViews.ExportJob;
import pt.andaime.reporting.application.ReportingViews.ExportParameters;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapTemplate;
import pt.andaime.shared.tenant.TenantContext;
import tools.jackson.databind.json.JsonMapper;

@Component
class ReportExportRepository {

    private final JdbcTemplate jdbcTemplate;
    private final JsonMapper jsonMapper;

    ReportExportRepository(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.jsonMapper = jsonMapper;
    }

    ExportJob create(String kind, WeeklyMapTemplate template, ExportParameters parameters) {
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO report_exports
                    (organization_id, requested_by_user_id, kind, template, parameters)
                VALUES (?, ?, ?, ?, ?::jsonb)
                RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(),
                TenantContext.userId().orElseThrow(), kind, template == null ? null : template.name(),
                jsonMapper.writeValueAsString(parameters));
        return find(id).orElseThrow();
    }

    Optional<ExportJob> find(UUID id) {
        return jdbcTemplate.query("""
                SELECT id, kind, template, parameters::text, status, filename, content_type, content_size,
                       error_code, error_detail, created_at, started_at, finished_at, expires_at
                FROM report_exports WHERE id = ? AND organization_id = app.current_org_id()
                """, (resultSet, rowNumber) -> new ExportJob(
                resultSet.getObject("id", UUID.class), resultSet.getString("kind"),
                resultSet.getString("template"),
                jsonMapper.readValue(resultSet.getString("parameters"), ExportParameters.class),
                resultSet.getString("status"), resultSet.getString("filename"),
                resultSet.getString("content_type"), resultSet.getObject("content_size", Long.class),
                resultSet.getString("error_code"), resultSet.getString("error_detail"),
                instant(resultSet, "created_at"), instant(resultSet, "started_at"),
                instant(resultSet, "finished_at"), instant(resultSet, "expires_at")), id).stream().findFirst();
    }

    Optional<ClaimedExport> claim() {
        return jdbcTemplate.query("SELECT job_id, organization_id, user_id FROM app.claim_report_export()",
                (resultSet, rowNumber) -> new ClaimedExport(
                        resultSet.getObject("job_id", UUID.class),
                        resultSet.getObject("organization_id", UUID.class),
                        resultSet.getObject("user_id", UUID.class)))
                .stream().findFirst();
    }

    void complete(UUID id, String filename, String contentType, long size, InputStream content) {
        jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
            try (var statement = connection.prepareStatement("""
                    UPDATE report_exports
                       SET status = 'READY', filename = ?, content_type = ?, content_size = ?, content = ?,
                           finished_at = now(), error_code = NULL, error_detail = NULL
                     WHERE id = ? AND organization_id = app.current_org_id() AND status = 'RUNNING'
                    """)) {
                statement.setString(1, filename);
                statement.setString(2, contentType);
                statement.setLong(3, size);
                statement.setBinaryStream(4, content, size);
                statement.setObject(5, id, Types.OTHER);
                if (statement.executeUpdate() != 1) throw new IllegalStateException("Job de exportação não está em execução");
            }
            return null;
        });
    }

    void fail(UUID id, String code, String detail) {
        jdbcTemplate.update("""
                UPDATE report_exports
                   SET status = 'FAILED', content = NULL, content_size = NULL, filename = NULL, content_type = NULL,
                       finished_at = now(), error_code = ?, error_detail = ?
                 WHERE id = ? AND organization_id = app.current_org_id() AND status = 'RUNNING'
                """, code, truncate(detail), id);
    }

    Optional<byte[]> content(UUID id) {
        return jdbcTemplate.query("""
                SELECT content FROM report_exports
                WHERE id = ? AND organization_id = app.current_org_id() AND status = 'READY' AND expires_at > now()
                """, (resultSet, rowNumber) -> resultSet.getBytes(1), id).stream().findFirst();
    }

    private static Instant instant(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        var timestamp = resultSet.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static String truncate(String value) {
        var safe = value == null || value.isBlank() ? "Falha inesperada ao gerar a exportação." : value;
        return safe.length() <= 2_000 ? safe : safe.substring(0, 2_000);
    }
}
