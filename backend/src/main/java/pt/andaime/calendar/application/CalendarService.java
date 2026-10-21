package pt.andaime.calendar.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.calendar.application.CalendarViews.CalendarItem;
import pt.andaime.calendar.application.CalendarViews.CalendarMonth;
import pt.andaime.calendar.application.CalendarViews.EventInput;
import pt.andaime.calendar.domain.MonthGrid;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Agenda do mês: junta as camadas (ausências aprovadas, datas das obras, validades, feriados e eventos próprios) num
 * só formato, por ordem de início e com os itens de dia inteiro antes dos que têm hora. Os eventos próprios são
 * marcados e apagados pelo gestor.
 */
@Service
public class CalendarService {

    /** Validades: só até 60 dias a partir de hoje (spec V3.1 §4.3); as já expiradas continuam visíveis. */
    static final int EXPIRY_HORIZON_DAYS = 60;

    private static final Comparator<CalendarItem> ORDER = Comparator.comparing(CalendarItem::start)
            .thenComparing(item -> item.time() != null)
            .thenComparing(CalendarItem::time, Comparator.nullsFirst(Comparator.naturalOrder()))
            .thenComparing(CalendarItem::layer)
            .thenComparing(CalendarItem::title, String.CASE_INSENSITIVE_ORDER);

    private final CalendarSources sources;
    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final Clock clock;

    public CalendarService(CalendarSources sources, JdbcTemplate jdbcTemplate, AuditLog auditLog, Clock clock) {
        this.sources = sources;
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public CalendarMonth month(String month) {
        var today = TenantContext.today(clock);
        var grid = month == null || month.isBlank() ? MonthGrid.of(java.time.YearMonth.from(today))
                : MonthGrid.parse(month).orElseThrow(() -> invalid("month", "Indique o mês no formato AAAA-MM."));
        var viewer = new CalendarSources.Viewer(OrgRole.current(), TenantContext.employeeId().orElse(null));
        var horizon = today.plusDays(EXPIRY_HORIZON_DAYS);
        var items = new ArrayList<CalendarItem>();
        items.addAll(sources.absences(grid.from(), grid.to(), viewer));
        items.addAll(sources.siteDates(grid.from(), grid.to(), viewer));
        items.addAll(sources.expiries(grid.from(), grid.to().isAfter(horizon) ? horizon : grid.to(), today, viewer));
        items.addAll(sources.holidays(grid.from(), grid.to()));
        items.addAll(sources.events(grid.from(), grid.to()));
        items.sort(ORDER);
        return new CalendarMonth(grid.month().toString(), grid.from(), grid.to(), today, horizon, viewer.manager(), items);
    }

    @Transactional
    public CalendarItem createEvent(EventInput input) {
        OrgRole.require(OrgRole.MANAGER);
        var parsed = parse(input);
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO calendar_events (organization_id, title, starts_on, ends_on, start_time, location, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), parsed.title(), parsed.startsOn(), parsed.endsOn(),
                parsed.time(), parsed.location(), TenantContext.userId().orElseThrow());
        auditLog.record("calendar-event.created", "calendar_event", id, parsed.audit());
        return sources.event(id);
    }

    @Transactional
    public CalendarItem updateEvent(UUID id, EventInput input) {
        OrgRole.require(OrgRole.MANAGER);
        var parsed = parse(input);
        var updated = jdbcTemplate.update("""
                UPDATE calendar_events SET title = ?, starts_on = ?, ends_on = ?, start_time = ?, location = ?
                WHERE id = ?
                """, parsed.title(), parsed.startsOn(), parsed.endsOn(), parsed.time(), parsed.location(), id);
        if (updated == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "O evento não foi encontrado.");
        }
        auditLog.record("calendar-event.updated", "calendar_event", id, parsed.audit());
        return sources.event(id);
    }

    @Transactional
    public void deleteEvent(UUID id) {
        OrgRole.require(OrgRole.MANAGER);
        var removed = jdbcTemplate.query("DELETE FROM calendar_events WHERE id = ? RETURNING title, starts_on",
                (resultSet, rowNumber) -> Map.of("title", resultSet.getString(1),
                        "startsOn", resultSet.getObject(2, LocalDate.class).toString()), id);
        if (removed.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "O evento não foi encontrado.");
        }
        auditLog.record("calendar-event.deleted", "calendar_event", id, removed.getFirst());
    }

    private static ParsedEvent parse(EventInput input) {
        var title = input.title() == null ? "" : input.title().strip();
        if (title.length() < 2 || title.length() > 120) {
            throw invalid("title", "O título tem entre 2 e 120 caracteres.");
        }
        if (input.startsOn() == null) {
            throw invalid("startsOn", "Indique o dia do evento.");
        }
        var endsOn = input.endsOn() == null ? input.startsOn() : input.endsOn();
        if (endsOn.isBefore(input.startsOn())) {
            throw invalid("endsOn", "O fim não pode ser antes do início.");
        }
        if (ChronoUnit.DAYS.between(input.startsOn(), endsOn) > 366) {
            throw invalid("endsOn", "Um evento tem no máximo um ano.");
        }
        var location = input.location() == null || input.location().isBlank() ? null : input.location().strip();
        if (location != null && location.length() > 160) {
            throw invalid("location", "O local tem no máximo 160 caracteres.");
        }
        return new ParsedEvent(title, input.startsOn(), endsOn, input.time(), location);
    }

    private record ParsedEvent(String title, LocalDate startsOn, LocalDate endsOn, java.time.LocalTime time, String location) {
        Map<String, Object> audit() {
            var changes = new LinkedHashMap<String, Object>();
            changes.put("title", title);
            changes.put("startsOn", startsOn.toString());
            changes.put("endsOn", endsOn.toString());
            return changes;
        }
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
    }
}
