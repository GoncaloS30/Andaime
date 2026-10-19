package pt.andaime.timekeeping.application;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.timekeeping.application.TimekeepingViews.ClockRequest;
import pt.andaime.timekeeping.application.TimekeepingViews.ClockStatus;
import pt.andaime.timekeeping.application.TimekeepingViews.ConfirmResult;
import pt.andaime.timekeeping.application.TimekeepingViews.Correction;
import pt.andaime.timekeeping.application.TimekeepingViews.EntryView;
import pt.andaime.timekeeping.application.TimekeepingViews.ManualEntry;
import pt.andaime.timekeeping.application.TimekeepingViews.RevisionView;
import pt.andaime.timekeeping.domain.HoursCalculator;
import tools.jackson.databind.json.JsonMapper;

/**
 * Ponto do trabalhador e registos de horas.
 * <ul>
 * <li>Cada toque no ponto leva uma chave de idempotência: repetir o pedido (rede instável) não duplica nada.</li>
 * <li>A hora registada é a do servidor; a do dispositivo fica guardada para auditoria.</li>
 * <li>Correções nunca apagam o original: cada alteração fica numa revisão com motivo.</li>
 * <li>Semanas aprovadas estão fechadas na base de dados (trigger), até o gestor reabrir a folha.</li>
 * </ul>
 */
@Service
public class TimeEntryService {

    private final TimekeepingRepository repository;
    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public TimeEntryService(TimekeepingRepository repository, JdbcTemplate jdbcTemplate, AuditLog auditLog,
            JsonMapper jsonMapper, Clock clock) {
        this.repository = repository;
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    // --- ponto ------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ClockStatus status() {
        var me = myEmployee();
        var today = TenantContext.today(clock);
        var monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        var self = new TimekeepingRepository.Scope("entry.employee_id = ?", List.of(me));
        var week = repository.week(me, monday);
        return new ClockStatus(me, repository.openEntry(me).orElse(null), repository.planned(today, today, self, me),
                week.workedMin(), week.overtimeMin());
    }

    @Transactional
    public ClockStatus clock(String action, ClockRequest request) {
        var me = myEmployee();
        if (request == null || request.idempotencyKey() == null || request.idempotencyKey().length() < 8
                || request.idempotencyKey().length() > 100) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Pedido sem chave de idempotência válida.");
        }
        var kind = switch (action) {
            case "in" -> "IN";
            case "break-start" -> "BREAK_START";
            case "break-end" -> "BREAK_END";
            case "out" -> "OUT";
            default -> throw new ApiException(HttpStatus.NOT_FOUND, "not-found", "Ação desconhecida.");
        };
        // Serializa os toques do mesmo trabalhador (dois dispositivos, duplo clique).
        jdbcTemplate.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class,
                TenantContext.organizationId().orElseThrow() + ":clock:" + me);
        var repeated = jdbcTemplate.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM clock_events WHERE employee_id = ? AND idempotency_key = ?)
                """, Boolean.class, me, request.idempotencyKey());
        if (Boolean.TRUE.equals(repeated)) {
            return status();
        }
        var now = clock.instant();
        var open = repository.openEntry(me).orElse(null);
        UUID entryId;
        UUID siteId = null;
        switch (kind) {
            case "IN" -> {
                if (open != null) {
                    throw new ApiException(HttpStatus.CONFLICT, "already-clocked-in", "Já tem uma entrada registada em "
                            + open.siteCode() + " às " + open.startLocal() + ". Registe a saída primeiro.");
                }
                var today = TenantContext.today(clock);
                var planned = repository.planned(today, today, new TimekeepingRepository.Scope("entry.employee_id = ?", List.of(me)), me);
                siteId = request.siteId();
                UUID assignmentId = null;
                if (siteId == null) {
                    var next = planned.stream().filter(p -> !p.confirmed()).findFirst().orElseThrow(() -> new ApiException(
                            HttpStatus.BAD_REQUEST, "site-required", "Não tem obra planeada para hoje. Escolha a obra."));
                    siteId = next.siteId();
                    assignmentId = next.assignmentId();
                } else {
                    var chosen = siteId;
                    assignmentId = planned.stream().filter(p -> p.siteId().equals(chosen) && !p.confirmed())
                            .map(TimekeepingViews.PlannedView::assignmentId).findFirst().orElse(null);
                }
                var zone = ZoneId.of(repository.siteZone(siteId));
                entryId = jdbcTemplate.queryForObject("""
                        INSERT INTO time_entries (organization_id, employee_id, site_id, assignment_id, work_date, timezone,
                                                  started_at, status, source, created_by_user_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', 'CLOCK', ?) RETURNING id
                        """, UUID.class, TenantContext.organizationId().orElseThrow(), me, siteId, assignmentId,
                        now.atZone(zone).toLocalDate(), zone.getId(), java.sql.Timestamp.from(now), TenantContext.userId().orElseThrow());
            }
            case "BREAK_START" -> {
                var entry = requireOpen(open);
                if (entry.onBreak()) {
                    throw new ApiException(HttpStatus.CONFLICT, "already-on-break", "Já está em pausa.");
                }
                jdbcTemplate.update("UPDATE time_entries SET break_started_at = ?, version = version + 1 WHERE id = ?",
                        java.sql.Timestamp.from(now), entry.id());
                entryId = entry.id();
            }
            case "BREAK_END" -> {
                var entry = requireOpen(open);
                if (!entry.onBreak()) {
                    throw new ApiException(HttpStatus.CONFLICT, "not-on-break", "Não está em pausa.");
                }
                endBreak(entry.id(), now);
                entryId = entry.id();
            }
            default -> {
                var entry = requireOpen(open);
                if (entry.onBreak()) {
                    endBreak(entry.id(), now);
                }
                var recorded = jdbcTemplate.queryForObject("SELECT break_min FROM time_entries WHERE id = ?", Integer.class, entry.id());
                if (Duration.between(entry.startedAt(), now).toHours() >= 24) {
                    throw new ApiException(HttpStatus.CONFLICT, "entry-too-long",
                            "A entrada tem mais de 24 horas. Peça ao encarregado ou ao escritório para corrigir o registo.");
                }
                var pause = repository.breakFor(entry.startedAt(), now, recorded, entry.workDate());
                jdbcTemplate.update("""
                        UPDATE time_entries SET ended_at = ?, break_min = ?, worked_min = ?, status = 'CLOSED', version = version + 1
                        WHERE id = ?
                        """, java.sql.Timestamp.from(now), pause, HoursCalculator.workedMin(entry.startedAt(), now, pause), entry.id());
                entryId = entry.id();
            }
        }
        jdbcTemplate.update("""
                INSERT INTO clock_events (organization_id, employee_id, kind, occurred_at, device_time, idempotency_key,
                                          site_id, time_entry_id, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, TenantContext.organizationId().orElseThrow(), me, kind, java.sql.Timestamp.from(now),
                request.deviceTime() == null ? null : java.sql.Timestamp.from(request.deviceTime()), request.idempotencyKey(),
                siteId, entryId, TenantContext.userId().orElseThrow());
        return status();
    }

    private void endBreak(UUID entryId, Instant now) {
        jdbcTemplate.update("""
                UPDATE time_entries
                SET break_min = break_min + greatest(0, floor(extract(epoch FROM (? - break_started_at)) / 60)::int),
                    break_started_at = NULL, version = version + 1
                WHERE id = ?
                """, java.sql.Timestamp.from(now), entryId);
    }

    private static EntryView requireOpen(EntryView open) {
        if (open == null) {
            throw new ApiException(HttpStatus.CONFLICT, "not-clocked-in", "Não tem nenhuma entrada aberta.");
        }
        return open;
    }

    private static UUID myEmployee() {
        return TenantContext.employeeId().orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "no-employee",
                "A sua conta ainda não está ligada a uma ficha de trabalhador. Peça ao escritório para a ligar."));
    }

    // --- registos (encarregado e gestor) ---------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<EntryView> list(LocalDate from, LocalDate to, UUID employeeId, UUID siteId) {
        if (from == null || to == null || to.isBefore(from) || Duration.between(from.atStartOfDay(), to.atStartOfDay()).toDays() > 62) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Intervalo de datas inválido (máximo 62 dias).");
        }
        return repository.entries(from, to, TimekeepingRepository.scope(from, to), employeeId, siteId);
    }

    /** Planeado de um dia no âmbito do encarregado/gestor, com a presença já confirmada ou não. */
    @Transactional(readOnly = true)
    public List<TimekeepingViews.PlannedView> planned(LocalDate date) {
        OrgRole.require(OrgRole.FOREMAN);
        return repository.planned(date, date, TimekeepingRepository.scope(date, date), null);
    }

    @Transactional
    public EntryView create(ManualEntry input) {
        OrgRole.require(OrgRole.FOREMAN);
        requireText(input.reason(), "reason", "Indique o motivo do registo manual.");
        if (input.employeeId() == null || !repository.employeeExists(input.employeeId())
                || !repository.inScope(input.employeeId(), input.date(), input.date())) {
            throw TimekeepingRepository.notFound();
        }
        var times = times(input.siteId(), input.date(), input.start(), input.end());
        var pause = input.breakMin() != null ? input.breakMin() : repository.breakFor(times[0], times[1], 0, input.date());
        var worked = checkedWorked(times[0], times[1], pause);
        var source = OrgRole.current().atLeast(OrgRole.MANAGER) ? "MANAGER" : "FOREMAN";
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO time_entries (organization_id, employee_id, site_id, work_date, timezone, started_at, ended_at,
                                          break_min, worked_min, status, source, note, created_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLOSED', ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), input.employeeId(), input.siteId(), input.date(),
                repository.siteZone(input.siteId()), java.sql.Timestamp.from(times[0]), java.sql.Timestamp.from(times[1]), pause,
                worked, source, blank(input.note()), TenantContext.userId().orElseThrow());
        revision(id, null, repository.find(id).orElseThrow(), input.reason().strip());
        auditLog.record("time-entry.created", "time_entry", id, Map.of("employeeId", input.employeeId(), "workedMin", worked));
        return repository.find(id).orElseThrow();
    }

    /** O encarregado confirma a presença planeada: cria registos fechados com o horário planeado. */
    @Transactional
    public ConfirmResult confirmPlanned(List<UUID> assignmentIds) {
        OrgRole.require(OrgRole.FOREMAN);
        if (assignmentIds == null || assignmentIds.isEmpty() || assignmentIds.size() > 200) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique entre 1 e 200 atribuições.");
        }
        var today = TenantContext.today(clock);
        var created = 0;
        var skipped = new ArrayList<UUID>();
        for (var assignmentId : assignmentIds) {
            var row = jdbcTemplate.query("""
                    SELECT employee_id, site_id, work_date, lower(period) AS starts, upper(period) AS ends, break_min, site_timezone,
                           EXISTS (SELECT 1 FROM time_entries te WHERE te.assignment_id = assignments.id AND te.status <> 'CANCELLED') AS done
                    FROM assignments WHERE id = ?
                    """, (resultSet, rowNumber) -> new Object[] {resultSet.getObject(1, UUID.class), resultSet.getObject(2, UUID.class),
                    resultSet.getObject(3, LocalDate.class), resultSet.getObject(4, java.time.OffsetDateTime.class).toInstant(),
                    resultSet.getObject(5, java.time.OffsetDateTime.class).toInstant(), resultSet.getInt(6), resultSet.getString(7),
                    resultSet.getBoolean(8)}, assignmentId).stream().findFirst().orElse(null);
            if (row == null || (Boolean) row[7] || ((LocalDate) row[2]).isAfter(today)
                    || !repository.inScope((UUID) row[0], (LocalDate) row[2], (LocalDate) row[2])) {
                skipped.add(assignmentId);
                continue;
            }
            var start = (Instant) row[3];
            var end = (Instant) row[4];
            var conflict = jdbcTemplate.queryForObject("""
                    SELECT EXISTS (SELECT 1 FROM time_entries WHERE employee_id = ? AND status <> 'CANCELLED'
                                   AND period && tstzrange(?, ?, '[)'))
                    """, Boolean.class, row[0], java.sql.Timestamp.from(start), java.sql.Timestamp.from(end));
            if (Boolean.TRUE.equals(conflict)) {
                skipped.add(assignmentId);
                continue;
            }
            var pause = (Integer) row[5];
            var id = jdbcTemplate.queryForObject("""
                    INSERT INTO time_entries (organization_id, employee_id, site_id, assignment_id, work_date, timezone, started_at,
                                              ended_at, break_min, worked_min, status, source, created_by_user_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLOSED', ?, ?) RETURNING id
                    """, UUID.class, TenantContext.organizationId().orElseThrow(), row[0], row[1], assignmentId, row[2], row[6],
                    java.sql.Timestamp.from(start), java.sql.Timestamp.from(end), pause, HoursCalculator.workedMin(start, end, pause),
                    OrgRole.current().atLeast(OrgRole.MANAGER) ? "MANAGER" : "FOREMAN", TenantContext.userId().orElseThrow());
            auditLog.record("time-entry.presence-confirmed", "time_entry", id, Map.of("assignmentId", assignmentId));
            created++;
        }
        return new ConfirmResult(created, skipped);
    }

    @Transactional
    public EntryView correct(UUID entryId, Correction input) {
        OrgRole.require(OrgRole.FOREMAN);
        requireText(input.reason(), "reason", "Indique o motivo da correção.");
        var current = scoped(entryId);
        if (input.version() != null && input.version() != current.version()) {
            throw stale();
        }
        if (current.status().equals("CANCELLED")) {
            throw new ApiException(HttpStatus.CONFLICT, "cancelled", "O registo foi anulado.");
        }
        var siteId = Objects.requireNonNullElse(input.siteId(), current.siteId());
        var date = Objects.requireNonNullElse(input.date(), current.workDate());
        var start = Objects.requireNonNullElse(input.start(), current.startLocal());
        var end = input.end() != null ? input.end() : current.endLocal();
        if (end == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a hora de saída.");
        }
        var times = times(siteId, date, start, end);
        var pause = input.breakMin() != null ? input.breakMin() : current.breakMin();
        var worked = checkedWorked(times[0], times[1], pause);
        var updated = jdbcTemplate.update("""
                UPDATE time_entries SET site_id = ?, work_date = ?, timezone = ?, started_at = ?, ended_at = ?, break_started_at = NULL,
                       break_min = ?, worked_min = ?, status = 'CLOSED', note = ?, version = version + 1
                WHERE id = ? AND version = ?
                """, siteId, date, repository.siteZone(siteId), java.sql.Timestamp.from(times[0]), java.sql.Timestamp.from(times[1]),
                pause, worked, input.note() != null ? blank(input.note()) : current.note(), entryId, current.version());
        if (updated == 0) {
            throw stale();
        }
        var after = repository.find(entryId).orElseThrow();
        revision(entryId, current, after, input.reason().strip());
        var changes = new LinkedHashMap<String, Object>();
        changes.put("workedMin", Map.of("from", Objects.requireNonNullElse(current.workedMin(), 0), "to", worked));
        changes.put("reason", input.reason().strip());
        auditLog.record("time-entry.corrected", "time_entry", entryId, changes);
        return repository.find(entryId).orElseThrow();
    }

    @Transactional
    public EntryView cancel(UUID entryId, String reason, Integer version) {
        OrgRole.require(OrgRole.FOREMAN);
        requireText(reason, "reason", "Indique o motivo da anulação.");
        var current = scoped(entryId);
        if (version != null && version != current.version()) {
            throw stale();
        }
        jdbcTemplate.update("UPDATE time_entries SET status = 'CANCELLED', break_started_at = NULL, version = version + 1 WHERE id = ?",
                entryId);
        var after = repository.find(entryId).orElseThrow();
        revision(entryId, current, after, reason.strip());
        auditLog.record("time-entry.cancelled", "time_entry", entryId, Map.of("reason", reason.strip()));
        return repository.find(entryId).orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<RevisionView> revisions(UUID entryId) {
        scoped(entryId);
        return jdbcTemplate.query("""
                SELECT revision.id, revision.before::text, revision.after::text, revision.reason, person.display_name, revision.created_at
                FROM time_entry_revisions revision JOIN users person ON person.id = revision.user_id
                WHERE revision.time_entry_id = ? ORDER BY revision.created_at DESC
                """, (resultSet, rowNumber) -> new RevisionView(resultSet.getObject(1, UUID.class), resultSet.getString(2),
                resultSet.getString(3), resultSet.getString(4), resultSet.getString(5),
                resultSet.getObject(6, java.time.OffsetDateTime.class).toInstant()), entryId);
    }

    // --- auxiliares ----------------------------------------------------------------------------------

    private EntryView scoped(UUID entryId) {
        var entry = repository.find(entryId).orElseThrow(TimekeepingRepository::notFound);
        if (!repository.inScope(entry.employeeId(), entry.workDate(), entry.workDate())) {
            throw TimekeepingRepository.notFound();
        }
        return entry;
    }

    private Instant[] times(UUID siteId, LocalDate date, LocalTime start, LocalTime end) {
        if (siteId == null || date == null || start == null || end == null || start.equals(end)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique a obra, o dia e as horas de entrada e saída.");
        }
        if (date.isAfter(TenantContext.today(clock))) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "future-date", "Não é possível registar horas em dias futuros.");
        }
        var zone = ZoneId.of(repository.siteZone(siteId));
        var endDate = end.isAfter(start) ? date : date.plusDays(1);
        var rules = zone.getRules();
        if (rules.getValidOffsets(date.atTime(start)).isEmpty() || rules.getValidOffsets(endDate.atTime(end)).isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Essa hora não existe nesse dia (mudança para a hora de verão).");
        }
        return new Instant[] {date.atTime(start).atZone(zone).toInstant(), endDate.atTime(end).atZone(zone).toInstant()};
    }

    private static int checkedWorked(Instant start, Instant end, int pause) {
        var minutes = Duration.between(start, end).toMinutes();
        if (pause < 0 || pause >= minutes) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "A pausa tem de ser menor do que o período.");
        }
        return HoursCalculator.workedMin(start, end, pause);
    }

    private void revision(UUID entryId, EntryView before, EntryView after, String reason) {
        jdbcTemplate.update("""
                INSERT INTO time_entry_revisions (organization_id, time_entry_id, before, after, reason, user_id)
                VALUES (?, ?, ?::jsonb, ?::jsonb, ?, ?)
                """, TenantContext.organizationId().orElseThrow(), entryId, before == null ? null : jsonMapper.writeValueAsString(before),
                jsonMapper.writeValueAsString(after), reason, TenantContext.userId().orElseThrow());
    }

    private static void requireText(String value, String field, String message) {
        if (value == null || value.strip().length() < 3 || value.length() > 500) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                    .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
        }
    }

    private static String blank(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static ApiException stale() {
        return new ApiException(HttpStatus.CONFLICT, "stale", "O registo foi alterado entretanto. Recarregue e tente de novo.");
    }
}
