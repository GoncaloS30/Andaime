package pt.andaime.documents;

import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import pt.andaime.reporting.ReportingProjection;
import pt.andaime.shared.storage.ObjectStorage;

/**
 * Contrato público do módulo para a anonimização (RGPD): arquiva os documentos de um trabalhador e apaga os ficheiros
 * do armazenamento. As versões ficam (datas e hash) sem chave nem nome de ficheiro; os objetos só são apagados depois
 * do commit, para que uma anonimização revertida não perca ficheiros.
 */
@Component
public class DocumentPurge {

    static final String PURGED_FILENAME = "documento-apagado";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectStorage storage;
    private final ReportingProjection reporting;

    DocumentPurge(JdbcTemplate jdbcTemplate, ObjectStorage storage, ReportingProjection reporting) {
        this.jdbcTemplate = jdbcTemplate;
        this.storage = storage;
        this.reporting = reporting;
    }

    /** Na transação corrente e na organização corrente (RLS). Devolve quantos ficheiros vão ser apagados. */
    public int purgeEmployee(UUID employeeId) {
        jdbcTemplate.update("UPDATE documents SET archived_at = now(), version = version + 1 WHERE employee_id = ? AND archived_at IS NULL",
                employeeId);
        jdbcTemplate.queryForList("SELECT id FROM documents WHERE employee_id = ?", UUID.class, employeeId)
                .forEach(reporting::removeDocument);
        var keys = jdbcTemplate.queryForList("""
                SELECT version.storage_key FROM document_versions version
                JOIN documents document ON document.organization_id = version.organization_id AND document.id = version.document_id
                WHERE document.employee_id = ? AND version.storage_key IS NOT NULL
                FOR UPDATE OF version
                """, String.class, employeeId);
        if (keys.isEmpty()) {
            return 0;
        }
        jdbcTemplate.update("""
                UPDATE document_versions version SET storage_key = NULL, filename = ?, purged_at = now()
                FROM documents document
                WHERE document.organization_id = version.organization_id AND document.id = version.document_id
                  AND document.employee_id = ? AND version.storage_key IS NOT NULL
                """, PURGED_FILENAME, employeeId);
        deleteAfterCommit(keys);
        return keys.size();
    }

    private void deleteAfterCommit(List<String> keys) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            keys.forEach(storage::delete);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) {
                    keys.forEach(storage::delete);
                }
            }
        });
    }
}
