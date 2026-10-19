package pt.andaime.sites.application;

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
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.sites.application.SiteViews.ClientInput;
import pt.andaime.sites.application.SiteViews.ClientView;

@Service
public class ClientService {

    private static final Set<String> CONTACT = Set.of("contactName", "email", "phone");

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;

    public ClientService(JdbcTemplate jdbcTemplate, AuditLog auditLog) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
    }

    @Transactional(readOnly = true)
    public List<ClientView> list(String query, boolean archived) {
        OrgRole.require(OrgRole.MANAGER);
        var params = new ArrayList<Object>();
        var where = new StringBuilder(archived ? "client.archived_at IS NOT NULL" : "client.archived_at IS NULL");
        if (query != null && !query.isBlank()) {
            where.append(" AND (client.name ILIKE ? OR client.tax_id ILIKE ?)");
            var like = "%" + query.strip().replace("%", "\\%").replace("_", "\\_") + "%";
            params.add(like);
            params.add(like);
        }
        return query(where + " ORDER BY lower(client.name) LIMIT 500", params.toArray());
    }

    private List<ClientView> query(String where, Object... params) {
        return jdbcTemplate.query("""
                SELECT client.*,
                       (SELECT count(*) FROM sites site
                        WHERE site.client_id = client.id AND site.archived_at IS NULL
                          AND site.status IN ('PLANNED', 'ACTIVE', 'SUSPENDED')) AS active_sites
                FROM clients client
                WHERE\s""" + where,
                (resultSet, rowNumber) -> new ClientView(
                        resultSet.getObject("id", UUID.class),
                        resultSet.getString("name"),
                        resultSet.getString("tax_id"),
                        resultSet.getString("contact_name"),
                        resultSet.getString("email"),
                        resultSet.getString("phone"),
                        resultSet.getString("country"),
                        resultSet.getInt("active_sites"),
                        resultSet.getObject("archived_at") != null,
                        resultSet.getInt("version")), params);
    }

    @Transactional
    public ClientView create(ClientInput input) {
        OrgRole.require(OrgRole.MANAGER);
        var values = normalize(input);
        ensureTaxIdFree((String) values.get("taxId"), null);
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO clients (organization_id, name, tax_id, contact_name, email, phone, country)
                VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), values.get("name"), values.get("taxId"),
                values.get("contactName"), values.get("email"), values.get("phone"), values.get("country"));
        auditLog.record("client.created", "client", id, Changes.created(values, CONTACT));
        return get(id);
    }

    @Transactional
    public ClientView update(UUID clientId, ClientInput input, int expectedVersion) {
        OrgRole.require(OrgRole.MANAGER);
        var before = get(clientId);
        var after = normalize(input);
        ensureTaxIdFree((String) after.get("taxId"), clientId);
        var updated = jdbcTemplate.update("""
                UPDATE clients SET name = ?, tax_id = ?, contact_name = ?, email = ?, phone = ?, country = ?,
                                   version = version + 1
                WHERE id = ? AND version = ?
                """, after.get("name"), after.get("taxId"), after.get("contactName"), after.get("email"),
                after.get("phone"), after.get("country"), clientId, expectedVersion);
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "stale", "O cliente foi alterado por outra pessoa. Recarregue e tente de novo.");
        }
        var changes = Changes.diff(values(before), after, CONTACT);
        if (!changes.isEmpty()) {
            auditLog.record("client.updated", "client", clientId, changes);
        }
        return get(clientId);
    }

    @Transactional(readOnly = true)
    public ClientView get(UUID clientId) {
        OrgRole.require(OrgRole.MANAGER);
        return query("client.id = ?", clientId).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "O cliente não foi encontrado."));
    }

    private void ensureTaxIdFree(String taxId, UUID except) {
        if (taxId == null) {
            return;
        }
        var taken = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM clients WHERE tax_id = ? AND id IS DISTINCT FROM ?)",
                Boolean.class, taxId, except));
        if (taken) {
            throw new ApiException(HttpStatus.CONFLICT, "tax-id-taken", "Já existe um cliente com o NIF " + taxId + ".");
        }
    }

    private static Map<String, Object> normalize(ClientInput input) {
        var values = new LinkedHashMap<String, Object>();
        values.put("name", input.name().strip());
        values.put("taxId", blankToNull(input.taxId()) == null ? null : input.taxId().replace(" ", "").toUpperCase(Locale.ROOT));
        values.put("contactName", blankToNull(input.contactName()));
        values.put("email", blankToNull(input.email()) == null ? null : input.email().strip().toLowerCase(Locale.ROOT));
        values.put("phone", blankToNull(input.phone()));
        values.put("country", blankToNull(input.country()) == null ? null : input.country().strip().toUpperCase(Locale.ROOT));
        return values;
    }

    private static Map<String, Object> values(ClientView client) {
        var values = new LinkedHashMap<String, Object>();
        values.put("name", client.name());
        values.put("taxId", client.taxId());
        values.put("contactName", client.contactName());
        values.put("email", client.email());
        values.put("phone", client.phone());
        values.put("country", client.country());
        return values;
    }

    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
