package pt.andaime.equipment.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import pt.andaime.equipment.application.DeliverySheetWorkbook;
import pt.andaime.equipment.application.EquipmentService;
import pt.andaime.equipment.application.EquipmentService.Holding;
import pt.andaime.equipment.application.EquipmentService.ItemInput;
import pt.andaime.equipment.application.EquipmentService.ItemView;
import pt.andaime.equipment.application.EquipmentService.Movement;
import pt.andaime.equipment.application.EquipmentService.MovementView;
import pt.andaime.equipment.application.EquipmentService.UnitView;

@RestController
@RequestMapping("/api/orgs/{orgId}/equipment")
public class EquipmentController {

    private final EquipmentService equipment;
    private final DeliverySheetWorkbook sheets;

    public EquipmentController(EquipmentService equipment, DeliverySheetWorkbook sheets) {
        this.sheets = sheets;
        this.equipment = equipment;
    }

    @GetMapping("/items")
    List<ItemView> items(@PathVariable UUID orgId, @RequestParam(defaultValue = "false") boolean archived) {
        return equipment.items(archived);
    }

    @PostMapping("/items")
    @ResponseStatus(HttpStatus.CREATED)
    ItemView create(@PathVariable UUID orgId, @RequestBody ItemInput input) {
        return equipment.saveItem(null, input);
    }

    @PatchMapping("/items/{itemId}")
    ItemView update(@PathVariable UUID orgId, @PathVariable UUID itemId, @RequestBody ItemInput input) {
        return equipment.saveItem(itemId, input);
    }

    @PostMapping("/items/{itemId}/archive")
    ResponseEntity<Void> archive(@PathVariable UUID orgId, @PathVariable UUID itemId) {
        equipment.archiveItem(itemId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/items/{itemId}/units")
    List<UnitView> units(@PathVariable UUID orgId, @PathVariable UUID itemId) {
        return equipment.units(itemId);
    }

    @PostMapping("/receive")
    ItemView receive(@PathVariable UUID orgId, @RequestBody Movement movement) {
        return equipment.receive(movement);
    }

    @PostMapping("/items/{itemId}/adjust")
    ItemView adjust(@PathVariable UUID orgId, @PathVariable UUID itemId, @RequestBody AdjustRequest request) {
        return equipment.adjust(itemId, request.delta() == null ? 0 : request.delta(), request.note());
    }

    @PostMapping("/deliver")
    List<Holding> deliver(@PathVariable UUID orgId, @RequestBody Movement movement) {
        return equipment.deliver(movement);
    }

    @PostMapping("/return")
    List<Holding> giveBack(@PathVariable UUID orgId, @RequestBody Movement movement) {
        return equipment.giveBack(movement);
    }

    @GetMapping("/holdings/{employeeId}")
    List<Holding> holdings(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return equipment.holdings(employeeId);
    }

    @GetMapping("/holdings/{employeeId}/sheet.xlsx")
    ResponseEntity<StreamingResponseBody> deliverySheet(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        var data = equipment.deliverySheet(employeeId);
        StreamingResponseBody body = output -> sheets.write(output, data);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("folha-entrega-" + data.employeeNumber() + "-" + data.issuedOn() + ".xlsx").build().toString())
                .body(body);
    }

    @GetMapping("/movements")
    List<MovementView> movements(@PathVariable UUID orgId, @RequestParam(required = false) UUID itemId,
            @RequestParam(required = false) UUID employeeId, @RequestParam(defaultValue = "100") int limit) {
        return equipment.movements(itemId, employeeId, limit);
    }

    record AdjustRequest(Integer delta, String note) {
    }
}
