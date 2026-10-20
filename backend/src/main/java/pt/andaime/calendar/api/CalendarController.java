package pt.andaime.calendar.api;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.calendar.application.CalendarService;
import pt.andaime.calendar.application.CalendarViews.CalendarItem;
import pt.andaime.calendar.application.CalendarViews.CalendarMonth;
import pt.andaime.calendar.application.CalendarViews.EventInput;

@RestController
@RequestMapping("/api/orgs/{orgId}/calendar")
public class CalendarController {

    private final CalendarService calendar;

    public CalendarController(CalendarService calendar) {
        this.calendar = calendar;
    }

    /** Mês da agenda ({@code month=AAAA-MM}; sem mês, o mês corrente). */
    @GetMapping
    CalendarMonth month(@PathVariable UUID orgId, @RequestParam(required = false) String month) {
        return calendar.month(month);
    }

    @PostMapping("/events")
    @ResponseStatus(HttpStatus.CREATED)
    CalendarItem create(@PathVariable UUID orgId, @RequestBody EventInput input) {
        return calendar.createEvent(input);
    }

    @DeleteMapping("/events/{eventId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID orgId, @PathVariable UUID eventId) {
        calendar.deleteEvent(eventId);
    }
}
