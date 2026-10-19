package pt.andaime.workforce.api;

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

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import pt.andaime.workforce.application.TeamService;
import pt.andaime.workforce.application.WorkforceViews.TeamDetail;
import pt.andaime.workforce.application.WorkforceViews.TeamSummary;

@RestController
@RequestMapping("/api/orgs/{orgId}/teams")
public class TeamController {

    private final TeamService teams;

    public TeamController(TeamService teams) {
        this.teams = teams;
    }

    @GetMapping
    List<TeamSummary> list(@PathVariable UUID orgId, @RequestParam(defaultValue = "false") boolean archived) {
        return teams.list(archived);
    }

    @GetMapping("/{teamId}")
    TeamDetail get(@PathVariable UUID orgId, @PathVariable UUID teamId) {
        return teams.get(teamId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    TeamDetail create(@PathVariable UUID orgId, @Valid @RequestBody TeamRequest request) {
        return teams.create(request.name(), request.color(), request.foremanEmployeeId());
    }

    @PatchMapping("/{teamId}")
    TeamDetail update(@PathVariable UUID orgId, @PathVariable UUID teamId, @Valid @RequestBody TeamRequest request) {
        return teams.update(teamId, request.name(), request.color(), request.foremanEmployeeId(),
                request.version() == null ? -1 : request.version());
    }

    @PostMapping("/{teamId}/members")
    TeamDetail addMember(@PathVariable UUID orgId, @PathVariable UUID teamId, @Valid @RequestBody JoinRequest request) {
        return teams.addMember(teamId, request.employeeId(), request.joinedOn());
    }

    @PostMapping("/{teamId}/members/{employeeId}/leave")
    TeamDetail removeMember(
            @PathVariable UUID orgId,
            @PathVariable UUID teamId,
            @PathVariable UUID employeeId,
            @RequestBody(required = false) LeaveRequest request) {
        return teams.removeMember(teamId, employeeId, request == null ? null : request.lastDay());
    }

    @PostMapping("/{teamId}/archive")
    TeamDetail archive(@PathVariable UUID orgId, @PathVariable UUID teamId) {
        return teams.archive(teamId);
    }

    record TeamRequest(
            @NotBlank @Size(min = 2, max = 80) String name,
            @NotBlank @Pattern(regexp = "^#[0-9a-fA-F]{6}$") String color,
            UUID foremanEmployeeId,
            Integer version) {
    }

    record JoinRequest(@NotNull UUID employeeId, LocalDate joinedOn) {
    }

    record LeaveRequest(LocalDate lastDay) {
    }
}
