package pt.andaime.absences.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.absences.application.AbsenceService;
import pt.andaime.absences.application.AbsenceService.AbsenceInput;
import pt.andaime.absences.application.AbsenceService.AbsenceView;
import pt.andaime.absences.application.AbsenceService.Impact;

@RestController
@RequestMapping("/api/orgs/{orgId}/absences")
public class AbsenceController {

    private final AbsenceService absences;

    public AbsenceController(AbsenceService absences) {
        this.absences = absences;
    }

    @GetMapping
    List<AbsenceView> list(@PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to,
            @RequestParam(required = false) String status, @RequestParam(required = false) UUID employeeId) {
        return absences.list(from, to, status, employeeId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    AbsenceView request(@PathVariable UUID orgId, @RequestBody AbsenceInput input) {
        return absences.request(input);
    }

    @GetMapping("/{absenceId}/impact")
    Impact impact(@PathVariable UUID orgId, @PathVariable UUID absenceId) {
        return absences.impact(absenceId);
    }

    @PostMapping("/{absenceId}/approve")
    AbsenceView approve(@PathVariable UUID orgId, @PathVariable UUID absenceId, @RequestBody(required = false) Decision decision) {
        return absences.approve(absenceId, decision == null ? null : decision.resolution(), decision == null ? null : decision.version());
    }

    @PostMapping("/{absenceId}/reject")
    AbsenceView reject(@PathVariable UUID orgId, @PathVariable UUID absenceId, @RequestBody Decision decision) {
        return absences.reject(absenceId, decision.note(), decision.version());
    }

    @PostMapping("/{absenceId}/cancel")
    AbsenceView cancel(@PathVariable UUID orgId, @PathVariable UUID absenceId, @RequestBody(required = false) Decision decision) {
        return absences.cancel(absenceId, decision == null ? null : decision.version());
    }

    record Decision(String resolution, String note, Integer version) {
    }
}
