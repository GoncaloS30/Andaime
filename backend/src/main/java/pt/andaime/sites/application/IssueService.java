package pt.andaime.sites.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.sites.application.SiteViews.IssueView;

/** Ocorrências de obra (segurança, material, acesso…), comunicadas pelo encarregado ou pelo escritório. */
@Service
public class IssueService {

    private final JdbcTemplate jdbcTemplate;
    private final SiteService sites;
    private final AuditLog auditLog;

    public IssueService(JdbcTemplate jdbcTemplate, SiteService sites, AuditLog auditLog) {
        this.jdbcTemplate = jdbcTemplate;
        this.sites = sites;
        this.auditLog = auditLog;
    }

    @Transactional(readOnly = true)
    public List<IssueView> list(UUID siteId, String status) {
        var scope = SiteService.scope();
        var where = new StringBuilder(scope.sql());
        var params = new ArrayList<>(scope.params());
        if (siteId != null) {
            where.append(" AND issue.site_id = ?");
            params.add(siteId);
        }
        if (status != null && !status.isBlank()) {
            where.append(" AND issue.status = ?");
            params.add(status.toUpperCase(Locale.ROOT));
        }
        return jdbcTemplate.query("""
                SELECT issue.*, site.code, site.name AS site_name, reporter.display_name AS reporter_name,
                       resolver.display_name AS resolver_name
                FROM site_issues issue
                JOIN sites site ON site.organization_id = issue.organization_id AND site.id = issue.site_id
                JOIN users reporter ON reporter.id = issue.reported_by_user_id
                LEFT JOIN users resolver ON resolver.id = issue.resolved_by_user_id
                WHERE\s""" + where + " ORDER BY issue.status DESC, issue.created_at DESC LIMIT 500",
                IssueService::issue, params.toArray());
    }

    @Transactional
    public IssueView report(UUID siteId, String category, String description) {
        OrgRole.require(OrgRole.FOREMAN);
        sites.get(siteId);
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO site_issues (organization_id, site_id, reported_by_user_id, category, description)
                VALUES (?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), siteId,
                TenantContext.userId().orElseThrow(), category, description.strip());
        auditLog.record("site.issue-reported", "site", siteId, Map.of("issueId", id, "category", category));
        return find(id);
    }

    @Transactional
    public IssueView resolve(UUID issueId, String note) {
        OrgRole.require(OrgRole.FOREMAN);
        var issue = find(issueId);
        var updated = jdbcTemplate.update("""
                UPDATE site_issues SET status = 'RESOLVED', resolved_at = now(), resolved_by_user_id = ?,
                       resolution_note = ?, version = version + 1
                WHERE id = ? AND status = 'OPEN'
                """, TenantContext.userId().orElseThrow(), ClientService.blankToNull(note), issueId);
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "already-resolved", "A ocorrência já estava resolvida.");
        }
        auditLog.record("site.issue-resolved", "site", issue.siteId(), Map.of("issueId", issueId));
        return find(issueId);
    }

    private IssueView find(UUID issueId) {
        var scope = SiteService.scope();
        var params = new ArrayList<Object>(List.of(issueId));
        params.addAll(scope.params());
        return jdbcTemplate.query("""
                SELECT issue.*, site.code, site.name AS site_name, reporter.display_name AS reporter_name,
                       resolver.display_name AS resolver_name
                FROM site_issues issue
                JOIN sites site ON site.organization_id = issue.organization_id AND site.id = issue.site_id
                JOIN users reporter ON reporter.id = issue.reported_by_user_id
                LEFT JOIN users resolver ON resolver.id = issue.resolved_by_user_id
                WHERE issue.id = ? AND\s""" + scope.sql(), IssueService::issue, params.toArray())
                .stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "A ocorrência não foi encontrada."));
    }

    private static IssueView issue(ResultSet resultSet, int rowNumber) throws SQLException {
        var resolvedAt = resultSet.getObject("resolved_at", OffsetDateTime.class);
        return new IssueView(
                resultSet.getObject("id", UUID.class),
                resultSet.getObject("site_id", UUID.class),
                resultSet.getString("code"),
                resultSet.getString("site_name"),
                resultSet.getString("category"),
                resultSet.getString("description"),
                resultSet.getString("status"),
                resultSet.getString("reporter_name"),
                resultSet.getObject("created_at", OffsetDateTime.class).toInstant(),
                resultSet.getString("resolver_name"),
                resolvedAt == null ? null : resolvedAt.toInstant(),
                resultSet.getString("resolution_note"),
                resultSet.getInt("version"));
    }
}
