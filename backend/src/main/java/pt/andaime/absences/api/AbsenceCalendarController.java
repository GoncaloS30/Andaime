package pt.andaime.absences.api;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.absences.application.VacationCalendar;

/** Férias aprovadas em .ics (gestor), para importar num calendário. */
@RestController
@RequestMapping("/api/orgs/{orgId}/absences")
public class AbsenceCalendarController {

    private static final MediaType CALENDAR = MediaType.parseMediaType("text/calendar;charset=UTF-8");

    private final VacationCalendar calendar;

    public AbsenceCalendarController(VacationCalendar calendar) {
        this.calendar = calendar;
    }

    @GetMapping("/export.ics")
    ResponseEntity<byte[]> exportVacations(@PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to) {
        var content = calendar.export(from, to);
        return ResponseEntity.ok()
                .contentType(CALENDAR)
                .contentLength(content.length)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("ferias-" + from + "-a-" + to + ".ics").build().toString())
                .body(content);
    }
}
