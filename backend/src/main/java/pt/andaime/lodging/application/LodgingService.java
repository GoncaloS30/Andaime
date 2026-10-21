package pt.andaime.lodging.application;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.text.Collator;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.lodging.application.LodgingViews.BoardLine;
import pt.andaime.lodging.application.LodgingViews.HotelInput;
import pt.andaime.lodging.application.LodgingViews.HotelRef;
import pt.andaime.lodging.application.LodgingViews.HotelView;
import pt.andaime.lodging.application.LodgingViews.StayInput;
import pt.andaime.lodging.application.LodgingViews.StayView;
import pt.andaime.lodging.application.LodgingViews.WeekBoard;
import pt.andaime.lodging.application.LodgingViews.WeekSummary;
import pt.andaime.lodging.domain.StayRules;
import pt.andaime.lodging.domain.StayRules.AbsentDay;
import pt.andaime.lodging.domain.StayRules.Point;
import pt.andaime.lodging.domain.StayRules.StayFact;
import pt.andaime.lodging.domain.StayRules.WorkDay;
import pt.andaime.notifications.Notifier;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.storage.PhotoStorage;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Dormidas e hotéis. O quadro da semana parte da escala ({@code assignments}) e das ausências aprovadas; as estadias
 * são o que o gestor decidiu (hotel ou "por definir", entrada e saída). Estadias cuja linha da escala desapareceu nunca
 * se apagam sozinhas: aparecem em "Estadias sem escala" até alguém decidir.
 */
@Service
public class LodgingService {

    private static final DateTimeFormatter DAY_MONTH = DateTimeFormatter.ofPattern("dd/MM");

    private static final String STAY_SELECT = """
            SELECT stay.*, employee.full_name, site.code AS site_code, site.name AS site_name, site.color AS site_color,
                   hotel.name AS hotel_name, hotel.address AS hotel_address, hotel.contact AS hotel_contact
            FROM stays stay
            JOIN employees employee ON employee.organization_id = stay.organization_id AND employee.id = stay.employee_id
            JOIN sites site ON site.organization_id = stay.organization_id AND site.id = stay.site_id
            LEFT JOIN hotels hotel ON hotel.organization_id = stay.organization_id AND hotel.id = stay.hotel_id
            """;

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final Notifier notifier;
    private final Clock clock;

    public LodgingService(JdbcTemplate jdbcTemplate, AuditLog auditLog, Notifier notifier, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.notifier = notifier;
        this.clock = clock;
    }

    // --- hotéis -----------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<HotelView> hotels(UUID siteId) {
        OrgRole.require(OrgRole.MANAGER);
        if (siteId == null) {
            throw invalid("siteId", "Indique a obra.");
        }
        return jdbcTemplate.query("""
                SELECT hotel.*, count(stay.id) AS stay_count, coalesce(sum(stay.check_out - stay.check_in), 0) AS nights,
                       max(stay.check_in) AS last_check_in
                FROM hotels hotel
                LEFT JOIN stays stay ON stay.organization_id = hotel.organization_id AND stay.hotel_id = hotel.id
                WHERE hotel.site_id = ? AND hotel.archived_at IS NULL
                GROUP BY hotel.id
                ORDER BY app.fold_name(hotel.name), hotel.id
                """, LodgingService::hotel, siteId);
    }

    @Transactional
    public HotelView createHotel(HotelInput input) {
        OrgRole.require(OrgRole.MANAGER);
        if (input.siteId() == null) {
            throw invalid("siteId", "Indique a obra.");
        }
        var archived = jdbcTemplate.query("SELECT archived_at IS NOT NULL FROM sites WHERE id = ?",
                (resultSet, rowNumber) -> resultSet.getBoolean(1), input.siteId()).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "A obra não foi encontrada."));
        if (archived) {
            throw new ApiException(HttpStatus.CONFLICT, "site-archived", "A obra está arquivada.");
        }
        var values = normalize(input);
        ensureNameFree(input.siteId(), values.get("name"), null);
        UUID id;
        try {
            id = jdbcTemplate.queryForObject("""
                    INSERT INTO hotels (organization_id, site_id, name, address, contact, notes) VALUES (?, ?, ?, ?, ?, ?)
                    RETURNING id
                    """, UUID.class, organization(), input.siteId(), values.get("name"), values.get("address"),
                    values.get("contact"), values.get("notes"));
        } catch (DuplicateKeyException exception) {
            throw nameTaken();
        }
        auditLog.record("lodging.hotel-created", "hotel", id, Map.of("siteId", input.siteId(), "name", values.get("name")));
        return hotel(id);
    }

    @Transactional
    public HotelView updateHotel(UUID id, HotelInput input, Integer version) {
        OrgRole.require(OrgRole.MANAGER);
        var before = hotel(id);
        var values = normalize(input);
        ensureNameFree(before.siteId(), values.get("name"), id);
        int updated;
        try {
            updated = jdbcTemplate.update("""
                    UPDATE hotels SET name = ?, address = ?, contact = ?, notes = ?, version = version + 1
                    WHERE id = ? AND archived_at IS NULL AND (?::int IS NULL OR version = ?)
                    """, values.get("name"), values.get("address"), values.get("contact"), values.get("notes"), id, version,
                    version);
        } catch (DuplicateKeyException exception) {
            throw nameTaken();
        }
        if (updated == 0) {
            throw new ApiException(HttpStatus.CONFLICT, "stale", "O hotel foi alterado entretanto. Recarregue e tente de novo.");
        }
        auditLog.record("lodging.hotel-updated", "hotel", id, Map.of("name", values.get("name")));
        return hotel(id);
    }

    /**
     * Remover um hotel não apaga estadias: as que ainda não terminaram passam a "hotel por definir" (e aparecem como tal
     * no quadro); as passadas guardam o hotel, para o histórico continuar a dizer onde a pessoa dormiu.
     */
    @Transactional
    public void removeHotel(UUID id) {
        OrgRole.require(OrgRole.MANAGER);
        hotel(id);
        var today = TenantContext.today(clock);
        var cleared = jdbcTemplate.update("""
                UPDATE stays SET hotel_id = NULL, version = version + 1 WHERE hotel_id = ? AND check_out >= ?
                """, id, today);
        jdbcTemplate.update("UPDATE hotels SET archived_at = now(), version = version + 1 WHERE id = ? AND archived_at IS NULL", id);
        auditLog.record("lodging.hotel-removed", "hotel", id, Map.of("staysUndefined", cleared));
    }

    // --- quadro da semana ---------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public WeekBoard week(LocalDate requested) {
        OrgRole.require(OrgRole.MANAGER);
        var week = monday(requested == null ? TenantContext.today(clock) : requested);
        var sunday = week.plusDays(6);

        var workDays = jdbcTemplate.query("""
                SELECT DISTINCT employee_id, site_id, work_date FROM assignments WHERE work_date BETWEEN ? AND ?
                """, (resultSet, rowNumber) -> new WorkDay(resultSet.getObject(1, UUID.class), resultSet.getObject(2, UUID.class),
                resultSet.getObject(3, LocalDate.class)), week, sunday);
        // Só ausências de dia inteiro: com uma ausência parcial a pessoa continua a ir à obra nesse dia.
        var absences = jdbcTemplate.query("""
                SELECT absence.employee_id, day::date
                FROM absences absence
                CROSS JOIN LATERAL generate_series(greatest(absence.starts_on, ?::date), least(absence.ends_on, ?::date),
                                                   interval '1 day') AS day
                WHERE absence.status = 'APPROVED' AND absence.partial_minutes IS NULL
                  AND absence.starts_on <= ? AND absence.ends_on >= ?
                """, (resultSet, rowNumber) -> new AbsentDay(resultSet.getObject(1, UUID.class),
                resultSet.getObject(2, LocalDate.class)), week, sunday, sunday, week);
        var stays = jdbcTemplate.query(STAY_SELECT + " WHERE stay.week = ? ORDER BY stay.check_in, employee.full_name",
                LodgingService::stay, week);
        var facts = stays.stream().map(LodgingService::fact).toList();
        var staysById = stays.stream().collect(Collectors.toMap(StayView::id, Function.identity()));

        var lines = StayRules.board(workDays, absences, facts);
        var summary = StayRules.summary(lines, facts);

        var homeCountry = jdbcTemplate.queryForObject("SELECT country FROM organizations WHERE id = ?", String.class, organization());
        var people = people(week, sunday);
        var places = places(week, sunday);
        var hotelsBySite = activeHotels(week, sunday);
        var collator = Collator.getInstance(Locale.forLanguageTag("pt-PT"));

        var board = new ArrayList<BoardLine>();
        for (var line : lines) {
            var person = people.get(line.employeeId());
            var place = places.get(line.siteId());
            if (person == null || place == null) {
                continue;
            }
            var away = StayRules.away(homeCountry, place.country(), person.home(), place.point());
            Integer distance = person.home() != null && place.point() != null
                    ? (int) Math.round(StayRules.distanceKm(person.home(), place.point())) : null;
            board.add(new BoardLine(line.employeeId(), person.name(), person.number(), person.homeCity(), person.photoUrl(),
                    line.siteId(), place.code(), place.name(), place.color(), line.days(), line.proposed().checkIn(),
                    line.proposed().checkOut(), StayRules.nights(line.proposed().checkIn(), line.proposed().checkOut()),
                    away.name(), distance, line.stay() == null ? null : staysById.get(line.stay().id()),
                    hotelsBySite.getOrDefault(line.siteId(), List.of())));
        }
        board.sort(Comparator.<BoardLine>comparingInt(line -> StayRules.Away.valueOf(line.away()).rank())
                .thenComparing(BoardLine::siteCode)
                .thenComparing(BoardLine::employeeName, collator));
        var orphans = summary.withoutSchedule().stream().map(fact -> staysById.get(fact.id())).toList();
        return new WeekBoard(week, board, new WeekSummary(summary.peopleAway(), summary.nights(), summary.undefinedHotel(),
                orphans.size()), orphans);
    }

    // --- estadias ---------------------------------------------------------------------------------------

    /** Marca ou altera (idempotente por pessoa × obra × semana). Avisa o trabalhador quando algo muda para ele. */
    @Transactional
    public StayView putStay(StayInput input) {
        OrgRole.require(OrgRole.MANAGER);
        if (input.employeeId() == null) {
            throw invalid("employeeId", "Indique o trabalhador.");
        }
        if (input.siteId() == null) {
            throw invalid("siteId", "Indique a obra.");
        }
        if (input.week() == null) {
            throw invalid("week", "Indique a semana.");
        }
        var week = monday(input.week());
        if (input.checkIn() == null || input.checkOut() == null || !input.checkOut().isAfter(input.checkIn())) {
            throw invalid("checkOut", "A saída tem de ser depois da entrada.");
        }
        if (ChronoUnit.DAYS.between(input.checkIn(), input.checkOut()) > 14) {
            throw invalid("checkOut", "Uma estadia tem no máximo 14 noites.");
        }
        if (input.checkIn().isBefore(week.minusDays(7)) || input.checkIn().isAfter(week.plusDays(6))) {
            throw invalid("checkIn", "A entrada tem de ser nesta semana (ou na anterior).");
        }
        var notes = blankToNull(input.notes());
        if (notes != null && notes.length() > 500) {
            throw invalid("notes", "As notas têm no máximo 500 caracteres.");
        }
        if (!exists("SELECT EXISTS (SELECT 1 FROM employees WHERE id = ? AND archived_at IS NULL)", input.employeeId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "O trabalhador não foi encontrado.");
        }
        if (!exists("SELECT EXISTS (SELECT 1 FROM sites WHERE id = ?)", input.siteId())) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "A obra não foi encontrada.");
        }
        // Serializa marcações concorrentes da mesma linha.
        jdbcTemplate.query("SELECT pg_advisory_xact_lock(hashtextextended('stay:' || ? || ':' || ? || ':' || ?, 0))",
                (resultSet, rowNumber) -> null, input.employeeId().toString(), input.siteId().toString(), week.toString());
        var existing = jdbcTemplate.query(STAY_SELECT + " WHERE stay.employee_id = ? AND stay.site_id = ? AND stay.week = ?",
                LodgingService::stay, input.employeeId(), input.siteId(), week).stream().findFirst().orElse(null);
        var keepsArchivedHotel = existing != null && Objects.equals(existing.hotelId(), input.hotelId());
        if (input.hotelId() != null && !keepsArchivedHotel && !exists("""
                SELECT EXISTS (SELECT 1 FROM hotels WHERE id = ? AND site_id = ? AND archived_at IS NULL)
                """, input.hotelId(), input.siteId())) {
            throw invalid("hotelId", "Esse hotel não é desta obra.");
        }

        UUID id;
        if (existing == null) {
            id = jdbcTemplate.queryForObject("""
                    INSERT INTO stays (organization_id, employee_id, site_id, week, hotel_id, check_in, check_out, notes,
                        created_by_user_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
                    """, UUID.class, organization(), input.employeeId(), input.siteId(), week, input.hotelId(), input.checkIn(),
                    input.checkOut(), notes, TenantContext.userId().orElse(null));
        } else {
            id = existing.id();
            var unchanged = Objects.equals(existing.hotelId(), input.hotelId()) && existing.checkIn().equals(input.checkIn())
                    && existing.checkOut().equals(input.checkOut()) && Objects.equals(existing.notes(), notes);
            if (unchanged) {
                return existing;
            }
            jdbcTemplate.update("""
                    UPDATE stays SET hotel_id = ?, check_in = ?, check_out = ?, notes = ?, version = version + 1 WHERE id = ?
                    """, input.hotelId(), input.checkIn(), input.checkOut(), notes, id);
        }
        var saved = stay(id);
        var changes = new LinkedHashMap<String, Object>();
        changes.put("employeeId", saved.employeeId());
        changes.put("siteId", saved.siteId());
        changes.put("week", week.toString());
        changes.put("hotelId", saved.hotelId() == null ? "UNDEFINED" : saved.hotelId());
        changes.put("checkIn", saved.checkIn().toString());
        changes.put("checkOut", saved.checkOut().toString());
        auditLog.record(existing == null ? "lodging.stay-marked" : "lodging.stay-updated", "stay", id, changes);
        var changedForWorker = existing == null || !Objects.equals(existing.hotelId(), saved.hotelId())
                || !existing.checkIn().equals(saved.checkIn()) || !existing.checkOut().equals(saved.checkOut());
        if (changedForWorker) {
            notifier.notify(notifier.userOfEmployee(saved.employeeId()), "stay.marked",
                    existing == null ? "Estadia marcada" : "Estadia alterada", describe(saved), "/app", null);
        }
        return saved;
    }

    @Transactional
    public void deleteStay(UUID id) {
        OrgRole.require(OrgRole.MANAGER);
        var stay = stay(id);
        jdbcTemplate.update("DELETE FROM stays WHERE id = ?", id);
        auditLog.record("lodging.stay-removed", "stay", id, Map.of("employeeId", stay.employeeId(), "siteId", stay.siteId(),
                "week", stay.week().toString()));
        notifier.notify(notifier.userOfEmployee(stay.employeeId()), "stay.removed", "Estadia cancelada",
                "Já não tem dormida marcada na obra " + stay.siteCode() + " de " + DAY_MONTH.format(stay.checkIn()) + " a "
                        + DAY_MONTH.format(stay.checkOut()) + ".", "/app", null);
    }

    /** As estadias da própria pessoa numa semana (app do trabalhador). Sem ficha ligada: lista vazia. */
    @Transactional(readOnly = true)
    public List<StayView> mine(LocalDate requested) {
        var me = TenantContext.employeeId().orElse(null);
        if (me == null) {
            return List.of();
        }
        var week = monday(requested == null ? TenantContext.today(clock) : requested);
        return jdbcTemplate.query(STAY_SELECT + " WHERE stay.employee_id = ? AND stay.week = ? ORDER BY stay.check_in",
                LodgingService::stay, me, week);
    }

    /** Histórico de estadias de uma pessoa: gestores, ou a própria pessoa. */
    @Transactional(readOnly = true)
    public List<StayView> ofEmployee(UUID employeeId) {
        var own = TenantContext.employeeId().map(employeeId::equals).orElse(false);
        if (!own) {
            OrgRole.require(OrgRole.MANAGER);
        }
        return jdbcTemplate.query(STAY_SELECT + " WHERE stay.employee_id = ? ORDER BY stay.check_in DESC LIMIT 200",
                LodgingService::stay, employeeId);
    }

    // --- auxiliares ---------------------------------------------------------------------------------------

    private record Person(String name, String number, String homeCity, String photoUrl, Point home) {
    }

    private record Place(String code, String name, String color, String country, Point point) {
    }

    /** Pessoas escaladas ou com estadia na semana. */
    private Map<UUID, Person> people(LocalDate week, LocalDate sunday) {
        var people = new HashMap<UUID, Person>();
        jdbcTemplate.query("""
                SELECT id, full_name, number, home_city, home_latitude, home_longitude, photo_updated_at FROM employees
                WHERE id IN (SELECT employee_id FROM assignments WHERE work_date BETWEEN ? AND ?
                             UNION SELECT employee_id FROM stays WHERE week = ?)
                """, resultSet -> {
            var id = resultSet.getObject("id", UUID.class);
            people.put(id, new Person(resultSet.getString("full_name"), resultSet.getString("number"),
                    resultSet.getString("home_city"), PhotoStorage.url("employees", id, resultSet.getTimestamp("photo_updated_at")),
                    point(resultSet.getBigDecimal("home_latitude"), resultSet.getBigDecimal("home_longitude"))));
        }, week, sunday, week);
        return people;
    }

    private Map<UUID, Place> places(LocalDate week, LocalDate sunday) {
        var places = new HashMap<UUID, Place>();
        jdbcTemplate.query("""
                SELECT id, code, name, color, country, latitude, longitude FROM sites
                WHERE id IN (SELECT site_id FROM assignments WHERE work_date BETWEEN ? AND ?
                             UNION SELECT site_id FROM stays WHERE week = ?)
                """, resultSet -> {
            places.put(resultSet.getObject("id", UUID.class), new Place(resultSet.getString("code"), resultSet.getString("name"),
                    resultSet.getString("color"), resultSet.getString("country"),
                    point(resultSet.getBigDecimal("latitude"), resultSet.getBigDecimal("longitude"))));
        }, week, sunday, week);
        return places;
    }

    private Map<UUID, List<HotelRef>> activeHotels(LocalDate week, LocalDate sunday) {
        var hotels = new LinkedHashMap<UUID, List<HotelRef>>();
        jdbcTemplate.query("""
                SELECT id, site_id, name FROM hotels
                WHERE archived_at IS NULL AND site_id IN (SELECT site_id FROM assignments WHERE work_date BETWEEN ? AND ?)
                ORDER BY app.fold_name(name), id
                """, resultSet -> {
            hotels.computeIfAbsent(resultSet.getObject("site_id", UUID.class), key -> new ArrayList<>())
                    .add(new HotelRef(resultSet.getObject("id", UUID.class), resultSet.getString("name")));
        }, week, sunday);
        return hotels;
    }

    private HotelView hotel(UUID id) {
        return jdbcTemplate.query("""
                SELECT hotel.*, count(stay.id) AS stay_count, coalesce(sum(stay.check_out - stay.check_in), 0) AS nights,
                       max(stay.check_in) AS last_check_in
                FROM hotels hotel
                LEFT JOIN stays stay ON stay.organization_id = hotel.organization_id AND stay.hotel_id = hotel.id
                WHERE hotel.id = ? AND hotel.archived_at IS NULL
                GROUP BY hotel.id
                """, LodgingService::hotel, id).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "O hotel não foi encontrado."));
    }

    private StayView stay(UUID id) {
        return jdbcTemplate.query(STAY_SELECT + " WHERE stay.id = ?", LodgingService::stay, id).stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "A estadia não foi encontrada."));
    }

    private void ensureNameFree(UUID siteId, String name, UUID except) {
        if (exists("""
                SELECT EXISTS (SELECT 1 FROM hotels WHERE site_id = ? AND app.fold_name(name) = app.fold_name(?)
                               AND archived_at IS NULL AND id IS DISTINCT FROM ?)
                """, siteId, name, except)) {
            throw nameTaken();
        }
    }

    private Map<String, String> normalize(HotelInput input) {
        var name = blankToNull(input.name());
        if (name == null || name.length() < 2 || name.length() > 120) {
            throw invalid("name", "Indique o nome do hotel (2 a 120 caracteres).");
        }
        var values = new HashMap<String, String>();
        values.put("name", name);
        values.put("address", limited("address", input.address(), 300, "A morada tem no máximo 300 caracteres."));
        values.put("contact", limited("contact", input.contact(), 120, "O contacto tem no máximo 120 caracteres."));
        values.put("notes", limited("notes", input.notes(), 1000, "As notas têm no máximo 1000 caracteres."));
        return values;
    }

    private static String limited(String field, String value, int max, String message) {
        var normalized = blankToNull(value);
        if (normalized != null && normalized.length() > max) {
            throw invalid(field, message);
        }
        return normalized;
    }

    private static String describe(StayView stay) {
        var nights = stay.nights() == 1 ? "1 noite" : stay.nights() + " noites";
        var hotel = stay.hotelName() == null ? "Hotel por definir" : stay.hotelName();
        return hotel + " · entrada " + DAY_MONTH.format(stay.checkIn()) + ", saída " + DAY_MONTH.format(stay.checkOut()) + " ("
                + nights + ") · obra " + stay.siteCode() + ".";
    }

    private boolean exists(String sql, Object... params) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(sql, Boolean.class, params));
    }

    private static LocalDate monday(LocalDate date) {
        return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    private static Point point(BigDecimal latitude, BigDecimal longitude) {
        return latitude == null || longitude == null ? null : new Point(latitude.doubleValue(), longitude.doubleValue());
    }

    private static StayFact fact(StayView stay) {
        return new StayFact(stay.id(), stay.employeeId(), stay.siteId(), stay.hotelId(), stay.checkIn(), stay.checkOut());
    }

    private static HotelView hotel(ResultSet resultSet, int rowNumber) throws SQLException {
        return new HotelView(resultSet.getObject("id", UUID.class), resultSet.getObject("site_id", UUID.class),
                resultSet.getString("name"), resultSet.getString("address"), resultSet.getString("contact"),
                resultSet.getString("notes"), resultSet.getInt("stay_count"), resultSet.getInt("nights"),
                resultSet.getObject("last_check_in", LocalDate.class), resultSet.getInt("version"));
    }

    private static StayView stay(ResultSet resultSet, int rowNumber) throws SQLException {
        var checkIn = resultSet.getObject("check_in", LocalDate.class);
        var checkOut = resultSet.getObject("check_out", LocalDate.class);
        return new StayView(resultSet.getObject("id", UUID.class), resultSet.getObject("employee_id", UUID.class),
                resultSet.getString("full_name"), resultSet.getObject("site_id", UUID.class), resultSet.getString("site_code"),
                resultSet.getString("site_name"), resultSet.getString("site_color"), resultSet.getObject("week", LocalDate.class),
                resultSet.getObject("hotel_id", UUID.class), resultSet.getString("hotel_name"),
                resultSet.getString("hotel_address"), resultSet.getString("hotel_contact"), checkIn, checkOut,
                StayRules.nights(checkIn, checkOut), resultSet.getString("notes"), resultSet.getInt("version"));
    }

    private static UUID organization() {
        return TenantContext.organizationId().orElseThrow();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static ApiException nameTaken() {
        return new ApiException(HttpStatus.CONFLICT, "name-taken", "Já existe um hotel com esse nome nesta obra.");
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
    }
}
