package pt.andaime.reporting.api;

import java.time.LocalDate;
import java.net.URI;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import pt.andaime.reporting.application.ReportingService;
import pt.andaime.reporting.application.ReportExportService;
import pt.andaime.reporting.application.ReportingViews;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapFilter;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapTemplate;
import pt.andaime.reporting.application.WeeklyMapWorkbook;

@RestController
@RequestMapping("/api/orgs/{orgId}/reporting")
public class ReportingController {

    private static final MediaType XLSX = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final ReportingService reporting;
    private final WeeklyMapWorkbook workbooks;
    private final ReportExportService exports;

    public ReportingController(ReportingService reporting, WeeklyMapWorkbook workbooks, ReportExportService exports) {
        this.reporting = reporting;
        this.workbooks = workbooks;
        this.exports = exports;
    }

    @GetMapping("/weekly-map")
    Object weeklyMap(
            @PathVariable UUID orgId,
            @RequestParam LocalDate week,
            @RequestParam(defaultValue = "equipa") String template,
            @RequestParam(required = false) UUID teamId,
            @RequestParam(required = false) UUID siteId,
            @RequestParam(required = false) UUID employeeId,
            @RequestParam(required = false) UUID clientId) {
        var selected = parseTemplate(template);
        var filter = new WeeklyMapFilter(teamId, siteId, employeeId, clientId);
        return selected == WeeklyMapTemplate.HORAS || selected == WeeklyMapTemplate.ERP
                ? reporting.weeklyActual(week, filter)
                : reporting.weeklyMap(week, filter);
    }

    @GetMapping("/overview")
    ReportingViews.PlanningOverview overview(
            @PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to) {
        return reporting.planningOverview(from, to);
    }

    @GetMapping("/team-distribution")
    java.util.List<ReportingViews.TeamDistribution> teamDistribution(
            @PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to) {
        return reporting.teamDistribution(from, to);
    }

    @GetMapping("/vehicles")
    java.util.List<ReportingViews.VehicleReport> vehicles(
            @PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to) {
        return reporting.vehicles(from, to);
    }

    @GetMapping("/hours")
    ReportingViews.HoursReport hours(
            @PathVariable UUID orgId,
            @RequestParam(defaultValue = "employee") String groupBy,
            @RequestParam LocalDate from,
            @RequestParam LocalDate to) {
        return reporting.hours(groupBy, from, to);
    }

    @GetMapping("/documents")
    ReportingViews.DocumentReport documents(@PathVariable UUID orgId) {
        return reporting.documents();
    }

    @GetMapping("/planned-vs-actual")
    ReportingViews.PlannedActualReport plannedActual(
            @PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to) {
        return reporting.plannedActual(from, to);
    }

    @GetMapping("/exports/weekly-map.xlsx")
    ResponseEntity<StreamingResponseBody> exportWeeklyMap(
            @PathVariable UUID orgId,
            @RequestParam LocalDate week,
            @RequestParam(defaultValue = "equipa") String template,
            @RequestParam(required = false) UUID teamId,
            @RequestParam(required = false) UUID siteId,
            @RequestParam(required = false) UUID employeeId,
            @RequestParam(required = false) UUID clientId) {
        var selected = parseTemplate(template);
        var filter = new WeeklyMapFilter(teamId, siteId, employeeId, clientId);
        var map = reporting.weeklyMap(week, filter);
        var actual = selected == WeeklyMapTemplate.HORAS || selected == WeeklyMapTemplate.ERP
                ? reporting.weeklyActual(week, filter).rows() : java.util.List.<ReportingViews.ActualTimeRow>of();
        var organizationName = reporting.organizationName();
        StreamingResponseBody body = output -> workbooks.write(output, organizationName, selected, map, actual);
        var filename = "mapa-" + selected.value() + "-semana-" + map.weekStart() + ".xlsx";
        return ResponseEntity.ok()
                .contentType(XLSX)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename).build().toString())
                .body(body);
    }

    @PostMapping("/exports")
    ResponseEntity<ReportingViews.ExportJob> createExport(
            @PathVariable UUID orgId, @RequestBody ReportingViews.ExportRequest request) {
        var job = exports.create(request);
        return ResponseEntity.accepted()
                .location(URI.create("/api/orgs/" + orgId + "/reporting/exports/" + job.id()))
                .body(job);
    }

    @GetMapping("/exports/{exportId}")
    ReportingViews.ExportJob exportStatus(@PathVariable UUID orgId, @PathVariable UUID exportId) {
        return exports.get(exportId);
    }

    @GetMapping("/exports/{exportId}/download")
    ResponseEntity<byte[]> downloadExport(@PathVariable UUID orgId, @PathVariable UUID exportId) {
        var job = exports.get(exportId);
        var content = exports.download(exportId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(job.contentType()))
                .contentLength(content.length)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(job.filename()).build().toString())
                .body(content);
    }

    private WeeklyMapTemplate parseTemplate(String value) {
        return ReportExportService.parseTemplate(value);
    }

}
