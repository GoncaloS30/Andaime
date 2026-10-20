package pt.andaime.reporting.application;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.reporting.application.ReportingViews.ExportJob;
import pt.andaime.reporting.application.ReportingViews.ExportParameters;
import pt.andaime.reporting.application.ReportingViews.ExportRequest;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapTemplate;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;

@Service
public class ReportExportService {

    private final ReportExportRepository repository;

    public ReportExportService(ReportExportRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public ExportJob create(ExportRequest request) {
        OrgRole.require(OrgRole.MANAGER);
        if (request == null || request.week() == null || request.template() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "A semana e o modelo são obrigatórios.");
        }
        var template = parseTemplate(request.template());
        var monday = request.week().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        return repository.create(template, new ExportParameters(monday, request.teamId(), request.siteId(),
                request.employeeId(), request.clientId()));
    }

    @Transactional(readOnly = true)
    public ExportJob get(UUID id) {
        OrgRole.require(OrgRole.MANAGER);
        return repository.find(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "Exportação não encontrada."));
    }

    @Transactional(readOnly = true)
    public byte[] download(UUID id) {
        var job = get(id);
        if ("EXPIRED".equals(job.status()) || job.expiresAt().isBefore(java.time.Instant.now())) {
            throw new ApiException(HttpStatus.GONE, "export-expired", "A exportação expirou. Crie uma nova.");
        }
        if (!"READY".equals(job.status())) {
            throw new ApiException(HttpStatus.CONFLICT, "export-not-ready", "A exportação ainda não está pronta.");
        }
        return repository.content(id).orElseThrow(() -> new ApiException(HttpStatus.GONE, "export-expired", "A exportação expirou. Crie uma nova."));
    }

    public static WeeklyMapTemplate parseTemplate(String value) {
        try {
            return WeeklyMapTemplate.parse(value.strip().toLowerCase(Locale.ROOT));
        } catch (RuntimeException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "O template deve ser equipa, obra, horas ou erp.");
        }
    }
}
