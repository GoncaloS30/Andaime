package pt.andaime.workforce.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.api.PageView;
import pt.andaime.shared.api.PhotoResponses;
import pt.andaime.workforce.application.EmployeeService;
import pt.andaime.workforce.application.WorkforceViews.ContractView;
import pt.andaime.workforce.application.WorkforceViews.EmployeeDetail;
import pt.andaime.workforce.application.WorkforceViews.EmployeeInput;
import pt.andaime.workforce.application.WorkforceViews.EmployeeSummary;
import pt.andaime.workforce.application.WorkforceViews.TeamPeriod;

@RestController
@RequestMapping("/api/orgs/{orgId}/employees")
public class EmployeeController {

    private final EmployeeService employees;

    public EmployeeController(EmployeeService employees) {
        this.employees = employees;
    }

    @GetMapping
    PageView<EmployeeSummary> list(
            @PathVariable UUID orgId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @Pattern(regexp = "ACTIVE|INACTIVE") String status,
            @RequestParam(required = false) String team,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "false") boolean archived,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return employees.list(q, status, team, category, archived, page, size);
    }

    @GetMapping("/{employeeId}")
    EmployeeDetail get(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return employees.get(employeeId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    EmployeeDetail create(@PathVariable UUID orgId, @Valid @RequestBody EmployeeRequest request) {
        return employees.create(request.toInput());
    }

    @PatchMapping("/{employeeId}")
    EmployeeDetail update(
            @PathVariable UUID orgId, @PathVariable UUID employeeId, @Valid @RequestBody EmployeeRequest request) {
        if (request.version() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a versão da ficha que está a alterar.");
        }
        return employees.update(employeeId, request.toInput(), request.version());
    }

    @PostMapping("/{employeeId}/archive")
    EmployeeDetail archive(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return employees.archive(employeeId);
    }

    @PostMapping("/{employeeId}/anonymize")
    EmployeeDetail anonymize(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return employees.anonymize(employeeId);
    }

    @PostMapping("/{employeeId}/restore")
    EmployeeDetail restore(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return employees.restore(employeeId);
    }

    @PutMapping(path = "/{employeeId}/photo", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    EmployeeDetail setPhoto(@PathVariable UUID orgId, @PathVariable UUID employeeId,
            @org.springframework.web.bind.annotation.RequestPart("file") org.springframework.web.multipart.MultipartFile file) {
        return employees.setPhoto(employeeId, file);
    }

    @DeleteMapping("/{employeeId}/photo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removePhoto(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        employees.removePhoto(employeeId);
    }

    @GetMapping("/{employeeId}/photo")
    ResponseEntity<org.springframework.core.io.InputStreamResource> photo(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return PhotoResponses.of(employees.photo(employeeId));
    }

    @GetMapping("/{employeeId}/teams")
    List<TeamPeriod> teams(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return employees.teamHistory(employeeId);
    }

    @GetMapping("/{employeeId}/contracts")
    List<ContractView> contracts(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return employees.contracts(employeeId);
    }

    @PostMapping("/{employeeId}/contracts")
    @ResponseStatus(HttpStatus.CREATED)
    ContractView addContract(
            @PathVariable UUID orgId, @PathVariable UUID employeeId, @Valid @RequestBody ContractRequest request) {
        return employees.addContract(employeeId, request.kind(), request.startDate(), request.endDate(),
                request.weeklyMin(), request.notes());
    }

    @DeleteMapping("/{employeeId}/contracts/{contractId}")
    ResponseEntity<Void> removeContract(
            @PathVariable UUID orgId, @PathVariable UUID employeeId, @PathVariable UUID contractId) {
        employees.removeContract(employeeId, contractId);
        return ResponseEntity.noContent().build();
    }

    record EmployeeRequest(
            @Size(max = 20) @Pattern(regexp = "^[A-Za-z0-9-]*$", message = "Use só letras, números e hífen.") String number,
            @NotBlank @Size(min = 2, max = 160) String fullName,
            @NotBlank @Size(min = 2, max = 60) String category,
            @Size(max = 40) String phone,
            @Email @Size(max = 254) String email,
            @Size(max = 60) String nationality,
            @Size(max = 80) String homeCity,
            LocalDate hireDate,
            @Pattern(regexp = "ACTIVE|INACTIVE") String status,
            @Min(60) @Max(960) Integer dailyCapacityMin,
            @DecimalMin("0") BigDecimal hourlyCost,
            @Size(max = 30) List<@Size(max = 60) String> skills,
            @Size(max = 6) Map<String, @Size(max = 10) String> sizes,
            @Size(max = 2000) String notes,
            Integer version) {

        EmployeeInput toInput() {
            return new EmployeeInput(number, fullName, category, phone, email, nationality, homeCity, hireDate,
                    status, dailyCapacityMin, hourlyCost, skills, sizes, notes);
        }
    }

    record ContractRequest(
            @NotNull @Pattern(regexp = "PERMANENT|FIXED_TERM|TEMPORARY|POSTED|OTHER") String kind,
            @NotNull LocalDate startDate,
            LocalDate endDate,
            @Min(60) @Max(4800) Integer weeklyMin,
            @Size(max = 1000) String notes) {
    }
}
