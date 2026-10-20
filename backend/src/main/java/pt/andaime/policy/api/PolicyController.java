package pt.andaime.policy.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.policy.application.PolicyService;
import pt.andaime.policy.application.PolicyService.Holiday;
import pt.andaime.policy.application.PolicyService.LaborPolicy;

@RestController
@RequestMapping("/api/orgs/{orgId}")
public class PolicyController {

    private final PolicyService policy;

    public PolicyController(PolicyService policy) {
        this.policy = policy;
    }

    @GetMapping("/labor-policy")
    LaborPolicy current(@PathVariable UUID orgId) {
        return policy.current();
    }

    @PutMapping("/labor-policy")
    LaborPolicy update(@PathVariable UUID orgId, @RequestBody LaborPolicy input) {
        return policy.update(input);
    }

    @GetMapping("/holidays")
    List<Holiday> holidays(@PathVariable UUID orgId, @RequestParam int year) {
        return policy.holidays(year);
    }

    @PostMapping("/holidays")
    @ResponseStatus(HttpStatus.CREATED)
    Holiday add(@PathVariable UUID orgId, @RequestBody HolidayRequest request) {
        return policy.addHoliday(request.date(), request.name());
    }

    @DeleteMapping("/holidays/{holidayId}")
    ResponseEntity<Void> remove(@PathVariable UUID orgId, @PathVariable UUID holidayId) {
        policy.removeHoliday(holidayId);
        return ResponseEntity.noContent().build();
    }

    record HolidayRequest(LocalDate date, String name) {
    }
}
