package pt.andaime.fleet.api;

import java.time.LocalDate;
import java.util.List;
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
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import pt.andaime.fleet.application.VehicleService;
import pt.andaime.fleet.application.VehicleService.VehicleDetail;
import pt.andaime.fleet.application.VehicleService.VehicleInput;
import pt.andaime.fleet.application.VehicleService.VehicleSummary;
import pt.andaime.shared.api.ApiException;

@RestController
@RequestMapping("/api/orgs/{orgId}")
public class VehicleController {

    private final VehicleService vehicles;

    public VehicleController(VehicleService vehicles) {
        this.vehicles = vehicles;
    }

    @GetMapping("/vehicles")
    List<VehicleSummary> list(@PathVariable UUID orgId, @RequestParam(required = false) String q,
            @RequestParam(required = false) @Pattern(regexp = "OPERATIONAL|WORKSHOP|INACTIVE") String status,
            @RequestParam(defaultValue = "false") boolean archived) {
        return vehicles.list(q, status, archived);
    }

    @GetMapping("/vehicles/{vehicleId}")
    VehicleDetail get(@PathVariable UUID orgId, @PathVariable UUID vehicleId) {
        return vehicles.get(vehicleId);
    }

    @PostMapping("/vehicles")
    @ResponseStatus(HttpStatus.CREATED)
    VehicleDetail create(@PathVariable UUID orgId, @Valid @RequestBody VehicleRequest request) {
        return vehicles.create(request.toInput());
    }

    @PatchMapping("/vehicles/{vehicleId}")
    VehicleDetail update(@PathVariable UUID orgId, @PathVariable UUID vehicleId, @Valid @RequestBody VehicleRequest request) {
        if (request.version() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a versão da viatura que está a alterar.");
        }
        return vehicles.update(vehicleId, request.toInput(), request.version());
    }

    @PostMapping("/vehicles/{vehicleId}/archive")
    VehicleDetail archive(@PathVariable UUID orgId, @PathVariable UUID vehicleId) {
        return vehicles.archive(vehicleId, true);
    }

    @PostMapping("/vehicles/{vehicleId}/restore")
    VehicleDetail restore(@PathVariable UUID orgId, @PathVariable UUID vehicleId) {
        return vehicles.archive(vehicleId, false);
    }

    @PostMapping("/vehicles/{vehicleId}/unavailability")
    VehicleDetail addUnavailability(@PathVariable UUID orgId, @PathVariable UUID vehicleId,
            @Valid @RequestBody UnavailabilityRequest request) {
        return vehicles.addUnavailability(vehicleId, request.startsOn(), request.endsOn(), request.reason());
    }

    @DeleteMapping("/vehicles/{vehicleId}/unavailability/{unavailabilityId}")
    VehicleDetail removeUnavailability(@PathVariable UUID orgId, @PathVariable UUID vehicleId, @PathVariable UUID unavailabilityId) {
        return vehicles.removeUnavailability(vehicleId, unavailabilityId);
    }

    @PutMapping("/teams/{teamId}/vehicle")
    ResponseEntity<Void> linkTeam(@PathVariable UUID orgId, @PathVariable UUID teamId, @RequestBody TeamVehicleRequest request) {
        vehicles.linkTeam(teamId, request.vehicleId(), request.from());
        return ResponseEntity.noContent().build();
    }

    record VehicleRequest(
            @NotBlank @Size(max = 15) @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9 -]{1,14}$") String plate,
            @Size(max = 60) String make,
            @Size(max = 60) String model,
            @NotNull @Min(1) @Max(60) Integer seats,
            @Pattern(regexp = "OPERATIONAL|WORKSHOP|INACTIVE") String status,
            @Min(0) Integer km,
            LocalDate insuranceUntil,
            LocalDate inspectionUntil,
            LocalDate maintenanceDue,
            @Size(max = 1000) String notes,
            Integer version) {

        VehicleInput toInput() {
            return new VehicleInput(plate, make, model, seats, status, km, insuranceUntil, inspectionUntil, maintenanceDue, notes);
        }
    }

    record UnavailabilityRequest(@NotNull LocalDate startsOn, @NotNull LocalDate endsOn, @NotBlank @Size(max = 300) String reason) {
    }

    record TeamVehicleRequest(UUID vehicleId, LocalDate from) {
    }
}
