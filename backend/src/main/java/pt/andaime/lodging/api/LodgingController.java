package pt.andaime.lodging.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import pt.andaime.lodging.application.LodgingService;
import pt.andaime.lodging.application.LodgingWorkbook;
import pt.andaime.lodging.application.LodgingViews.HotelInput;
import pt.andaime.lodging.application.LodgingViews.HotelView;
import pt.andaime.lodging.application.LodgingViews.StayInput;
import pt.andaime.lodging.application.LodgingViews.StayView;
import pt.andaime.lodging.application.LodgingViews.WeekBoard;

/** Dormidas e hotéis: hotéis por obra, quadro da semana, estadias, as minhas estadias e o histórico por pessoa. */
@RestController
@RequestMapping("/api/orgs/{orgId}")
public class LodgingController {

    private static final MediaType XLSX = MediaType.parseMediaType(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final LodgingService lodging;
    private final LodgingWorkbook workbooks;

    public LodgingController(LodgingService lodging, LodgingWorkbook workbooks) {
        this.lodging = lodging;
        this.workbooks = workbooks;
    }

    @GetMapping("/lodging/hotels")
    List<HotelView> hotels(@PathVariable UUID orgId, @RequestParam UUID siteId) {
        return lodging.hotels(siteId);
    }

    @PostMapping("/lodging/hotels")
    @ResponseStatus(HttpStatus.CREATED)
    HotelView createHotel(@PathVariable UUID orgId, @RequestBody HotelInput input) {
        return lodging.createHotel(input);
    }

    @PatchMapping("/lodging/hotels/{hotelId}")
    HotelView updateHotel(@PathVariable UUID orgId, @PathVariable UUID hotelId, @RequestBody HotelRequest request) {
        return lodging.updateHotel(hotelId, new HotelInput(null, request.name(), request.address(), request.contact(),
                request.notes()), request.version());
    }

    @DeleteMapping("/lodging/hotels/{hotelId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeHotel(@PathVariable UUID orgId, @PathVariable UUID hotelId) {
        lodging.removeHotel(hotelId);
    }

    @GetMapping("/lodging/week")
    WeekBoard week(@PathVariable UUID orgId, @RequestParam(required = false) LocalDate week) {
        return lodging.week(week);
    }

    @GetMapping("/lodging/week.xlsx")
    ResponseEntity<StreamingResponseBody> weekExcel(@PathVariable UUID orgId, @RequestParam(required = false) LocalDate week) {
        var board = lodging.week(week);
        StreamingResponseBody body = output -> workbooks.write(output, board);
        return ResponseEntity.ok()
                .contentType(XLSX)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(LodgingWorkbook.filename(board.week())).build().toString())
                .body(body);
    }

    @PutMapping("/lodging/stays")
    StayView putStay(@PathVariable UUID orgId, @RequestBody StayInput input) {
        return lodging.putStay(input);
    }

    @DeleteMapping("/lodging/stays/{stayId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteStay(@PathVariable UUID orgId, @PathVariable UUID stayId) {
        lodging.deleteStay(stayId);
    }

    @GetMapping("/me/stays")
    List<StayView> mine(@PathVariable UUID orgId, @RequestParam(required = false) LocalDate week) {
        return lodging.mine(week);
    }

    @GetMapping("/employees/{employeeId}/stays")
    List<StayView> ofEmployee(@PathVariable UUID orgId, @PathVariable UUID employeeId) {
        return lodging.ofEmployee(employeeId);
    }

    record HotelRequest(String name, String address, String contact, String notes, Integer version) {
    }
}
