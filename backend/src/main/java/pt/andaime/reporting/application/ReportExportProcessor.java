package pt.andaime.reporting.application;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import pt.andaime.shared.tenant.TenantContext;

@Component
public class ReportExportProcessor {

    private static final Logger LOG = LoggerFactory.getLogger(ReportExportProcessor.class);
    private static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private final ReportExportTransactions transactions;
    private final ReportingService reporting;
    private final WeeklyMapWorkbook workbooks;
    private final HrBookService hrBooks;
    private final HrBookWorkbook hrBookWorkbooks;

    public ReportExportProcessor(ReportExportTransactions transactions, ReportingService reporting,
            WeeklyMapWorkbook workbooks, HrBookService hrBooks, HrBookWorkbook hrBookWorkbooks) {
        this.transactions = transactions;
        this.reporting = reporting;
        this.workbooks = workbooks;
        this.hrBooks = hrBooks;
        this.hrBookWorkbooks = hrBookWorkbooks;
    }

    @Scheduled(fixedDelayString = "${andaime.reporting.exports.poll-interval:PT2S}",
            initialDelayString = "${andaime.reporting.exports.initial-delay:PT2S}")
    void poll() {
        try {
            processOne();
        } catch (RuntimeException exception) {
            LOG.error("Falha ao processar a fila de exportações", exception);
        }
    }

    /** Público para testes operacionais e execução manual; processa no máximo um job. */
    public boolean processOne() {
        var claimed = transactions.claim();
        if (claimed.isEmpty()) return false;
        var job = claimed.get();
        try (var ignored = TenantContext.open(job.organizationId(), job.userId(), "MANAGER", null,
                ZoneId.of("Europe/Lisbon"))) {
            Path temporary = null;
            try {
                var payload = transactions.payload(job.id());
                temporary = Files.createTempFile("andaime-report-", ".xlsx");
                String filename;
                if (ReportExportService.HR_BOOK.equals(payload.kind())) {
                    var book = hrBooks.book(payload.parameters().month());
                    try (var output = Files.newOutputStream(temporary)) {
                        hrBookWorkbooks.write(output, book);
                    }
                    filename = HrBookService.filename(book.month());
                } else {
                    var map = reporting.weeklyMapForExport(payload.parameters().week(), payload.parameters().filter());
                    var actual = payload.template() == ReportingViews.WeeklyMapTemplate.HORAS
                            || payload.template() == ReportingViews.WeeklyMapTemplate.ERP
                            ? reporting.weeklyActualForExport(payload.parameters().week(), payload.parameters().filter()).rows()
                            : java.util.List.<ReportingViews.ActualTimeRow>of();
                    var organizationName = reporting.organizationName();
                    try (var output = Files.newOutputStream(temporary)) {
                        workbooks.write(output, organizationName, payload.template(), map, actual);
                    }
                    filename = "mapa-" + payload.template().value() + "-semana-" + map.weekStart() + ".xlsx";
                }
                try (var input = Files.newInputStream(temporary)) {
                    transactions.complete(job.id(), filename, XLSX, Files.size(temporary), input);
                }
            } catch (Exception exception) {
                transactions.fail(job.id(), exception);
                LOG.warn("Exportação {} falhou: {}", job.id(), exception.getMessage());
            } finally {
                delete(temporary);
            }
        }
        return true;
    }

    private static void delete(Path path) {
        if (path == null) return;
        try {
            Files.deleteIfExists(path);
        } catch (IOException exception) {
            LOG.warn("Não foi possível remover o ficheiro temporário {}", path, exception);
        }
    }
}
