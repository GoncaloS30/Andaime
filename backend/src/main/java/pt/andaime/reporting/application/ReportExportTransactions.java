package pt.andaime.reporting.application;

import java.io.InputStream;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.reporting.application.ReportingViews.ClaimedExport;
import pt.andaime.reporting.application.ReportingViews.ExportJob;
import pt.andaime.reporting.application.ReportingViews.ExportPayload;
import pt.andaime.shared.api.ApiException;

/** Fronteiras transacionais separadas do ciclo do worker. */
@Service
class ReportExportTransactions {

    private final ReportExportRepository repository;

    ReportExportTransactions(ReportExportRepository repository) {
        this.repository = repository;
    }

    @Transactional
    Optional<ClaimedExport> claim() {
        return repository.claim();
    }

    @Transactional(readOnly = true)
    ExportPayload payload(UUID id) {
        ExportJob job = repository.find(id).orElseThrow();
        return new ExportPayload(ReportingViews.WeeklyMapTemplate.valueOf(job.template()), job.parameters());
    }

    @Transactional
    void complete(UUID id, String filename, String contentType, long size, InputStream content) {
        repository.complete(id, filename, contentType, size, content);
    }

    @Transactional
    void fail(UUID id, Throwable failure) {
        var code = failure instanceof ApiException api ? api.code() : "export-failed";
        repository.fail(id, code, failure.getMessage());
    }
}
