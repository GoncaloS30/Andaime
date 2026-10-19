package pt.andaime.timekeeping.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.timekeeping.application.TimeEntryService;
import pt.andaime.timekeeping.application.TimekeepingViews.ClockRequest;
import pt.andaime.timekeeping.application.TimekeepingViews.ClockStatus;
import pt.andaime.timekeeping.application.TimekeepingViews.ConfirmResult;
import pt.andaime.timekeeping.application.TimekeepingViews.Correction;
import pt.andaime.timekeeping.application.TimekeepingViews.EntryView;
import pt.andaime.timekeeping.application.TimekeepingViews.ManualEntry;
import pt.andaime.timekeeping.application.TimekeepingViews.PlannedView;
import pt.andaime.timekeeping.application.TimekeepingViews.RevisionView;
import pt.andaime.timekeeping.application.TimekeepingViews.TimesheetDetail;
import pt.andaime.timekeeping.application.TimekeepingViews.TimesheetSummary;
import pt.andaime.timekeeping.application.TimesheetService;

/** Ponto, registos de horas e folhas semanais. */
@RestController
@RequestMapping("/api/orgs/{orgId}")
public class TimekeepingController {

    private final TimeEntryService entries;
    private final TimesheetService timesheets;

    public TimekeepingController(TimeEntryService entries, TimesheetService timesheets) {
        this.entries = entries;
        this.timesheets = timesheets;
    }

    @GetMapping("/me/clock")
    ClockStatus clockStatus(@PathVariable UUID orgId) {
        return entries.status();
    }

    @PostMapping("/me/clock/{action}")
    ClockStatus clock(@PathVariable UUID orgId, @PathVariable String action, @RequestBody ClockRequest request) {
        return entries.clock(action, request);
    }

    @GetMapping("/time-entries")
    List<EntryView> list(@PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to,
            @RequestParam(required = false) UUID employeeId, @RequestParam(required = false) UUID siteId) {
        return entries.list(from, to, employeeId, siteId);
    }

    @PostMapping("/time-entries")
    @ResponseStatus(HttpStatus.CREATED)
    EntryView create(@PathVariable UUID orgId, @RequestBody ManualEntry input) {
        return entries.create(input);
    }

    @GetMapping("/time-entries/planned")
    List<PlannedView> planned(@PathVariable UUID orgId, @RequestParam LocalDate date) {
        return entries.planned(date);
    }

    @PostMapping("/time-entries/confirm-planned")
    ConfirmResult confirm(@PathVariable UUID orgId, @RequestBody ConfirmRequest request) {
        return entries.confirmPlanned(request.assignmentIds());
    }

    @PatchMapping("/time-entries/{entryId}")
    EntryView correct(@PathVariable UUID orgId, @PathVariable UUID entryId, @RequestBody Correction input) {
        return entries.correct(entryId, input);
    }

    @PostMapping("/time-entries/{entryId}/cancel")
    EntryView cancel(@PathVariable UUID orgId, @PathVariable UUID entryId, @RequestBody ReasonRequest request) {
        return entries.cancel(entryId, request.reason(), request.version());
    }

    @GetMapping("/time-entries/{entryId}/revisions")
    List<RevisionView> revisions(@PathVariable UUID orgId, @PathVariable UUID entryId) {
        return entries.revisions(entryId);
    }

    @GetMapping("/timesheets")
    List<TimesheetSummary> week(@PathVariable UUID orgId, @RequestParam LocalDate week, @RequestParam(required = false) String status) {
        return timesheets.week(week, status);
    }

    @GetMapping("/timesheets/{employeeId}/{week}")
    TimesheetDetail detail(@PathVariable UUID orgId, @PathVariable UUID employeeId, @PathVariable LocalDate week) {
        return timesheets.detail(employeeId, week);
    }

    @PostMapping("/timesheets/{employeeId}/{week}/{action}")
    TimesheetDetail transition(@PathVariable UUID orgId, @PathVariable UUID employeeId, @PathVariable LocalDate week,
            @PathVariable String action, @RequestBody(required = false) TransitionRequest request) {
        return timesheets.transition(employeeId, week, action, request == null ? null : request.note(),
                request == null ? null : request.version());
    }

    record ConfirmRequest(List<UUID> assignmentIds) {
    }

    record ReasonRequest(String reason, Integer version) {
    }

    record TransitionRequest(String note, Integer version) {
    }
}
