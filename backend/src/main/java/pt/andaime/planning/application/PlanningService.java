package pt.andaime.planning.application;

import java.sql.SQLException;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.planning.application.PlanningViews.AssignmentView;
import pt.andaime.planning.application.PlanningViews.Board;
import pt.andaime.planning.application.PlanningViews.ChangeSetView;
import pt.andaime.planning.application.PlanningViews.Command;
import pt.andaime.planning.application.PlanningViews.CommandResult;
import pt.andaime.planning.application.PlanningViews.Item;
import pt.andaime.planning.application.PlanningViews.Skipped;
import pt.andaime.planning.domain.ConflictEngine;
import pt.andaime.planning.domain.ConflictEngine.Conflict;
import pt.andaime.planning.domain.ConflictEngine.Severity;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import tools.jackson.databind.json.JsonMapper;

/**
 * Comandos de planeamento. Todos seguem o mesmo pipeline, numa só transação:
 * <ol>
 * <li>bloqueios consultivos ordenados sobre os trabalhadores e viaturas afetados (serializa pedidos concorrentes);</li>
 * <li>conflitos "antes" no intervalo afetado;</li>
 * <li>aplicação das alterações (com change-set para "Anular");</li>
 * <li>conflitos "depois"; os novos decidem: bloqueantes → 409, avisos não reconhecidos → 409 a pedir confirmação;</li>
 * <li>verificação imediata das constraints da base de dados (sobreposições).</li>
 * </ol>
 * A pré-visualização faz exatamente o mesmo dentro de um savepoint e volta a ele no fim, sem marcar a transação
 * (que pode ser maior, como na semente de demonstração) para rollback.
 */
@Service
public class PlanningService {

    static final int MAX_DAYS = 92;
    static final int MAX_ASSIGNMENTS = 500;

    private final PlanningRepository repository;
    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public PlanningService(PlanningRepository repository, JdbcTemplate jdbcTemplate, AuditLog auditLog, JsonMapper jsonMapper,
            Clock clock) {
        this.repository = repository;
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    // --- leitura -------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Board board(LocalDate from, LocalDate to) {
        checkRange(from, to);
        var role = OrgRole.current();
        String scope;
        List<Object> params;
        if (role.atLeast(OrgRole.MANAGER)) {
            scope = "TRUE";
            params = List.of();
        } else {
            var me = TenantContext.employeeId().orElse(null);
            if (me == null) {
                scope = "FALSE";
                params = List.of();
            } else if (role == OrgRole.WORKER) {
                scope = "assignment.employee_id = ?";
                params = List.of(me);
            } else {
                // Encarregado: as suas atribuições, as das equipas que lidera e as das obras de que é encarregado.
                scope = "(assignment.employee_id = ? OR assignment.team_id IN (SELECT id FROM teams WHERE foreman_employee_id = ?)"
                        + " OR assignment.site_id IN (SELECT id FROM sites WHERE foreman_employee_id = ?))";
                params = List.of(me, me, me);
            }
        }
        var assignments = repository.inRange(from, to, scope, params);
        List<Conflict> conflicts = List.of();
        if (role.atLeast(OrgRole.MANAGER)) {
            conflicts = ConflictEngine.detect(repository.snapshot(from, to, today()));
        }
        return new Board(from, to, assignments, conflicts, !role.atLeast(OrgRole.MANAGER));
    }

    @Transactional(readOnly = true)
    public List<Conflict> conflicts(LocalDate from, LocalDate to) {
        OrgRole.require(OrgRole.MANAGER);
        checkRange(from, to);
        return ConflictEngine.detect(repository.snapshot(from, to, today()));
    }

    // --- comandos ------------------------------------------------------------------------------

    /** Uma alteração planeada sobre uma atribuição. */
    private record Op(String kind, AssignmentView before, AssignmentView after) {
    }

    private record Plan(String label, List<Op> ops, List<Skipped> skipped) {
    }

    @Transactional
    public CommandResult execute(Command command, boolean preview) {
        OrgRole.require(OrgRole.MANAGER);
        var plan = plan(command);
        return apply(command.kind(), plan, preview, command.acknowledgedConflictIds() == null ? Set.of()
                : new HashSet<>(command.acknowledgedConflictIds()), false);
    }

    private CommandResult apply(String kind, Plan plan, boolean preview, Set<String> acknowledged, boolean revert) {
        if (plan.ops().isEmpty() && !preview) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "nothing-to-do",
                    plan.skipped().isEmpty() ? "Não há alterações a fazer." : "Todas as atribuições foram ignoradas.")
                    .with("skipped", plan.skipped());
        }
        if (plan.ops().size() > MAX_ASSIGNMENTS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "too-many", "Um comando pode alterar no máximo "
                    + MAX_ASSIGNMENTS + " atribuições. Divida o período.");
        }
        var keys = new HashSet<String>();
        LocalDate min = null;
        LocalDate max = null;
        for (var op : plan.ops()) {
            for (var a : new AssignmentView[] {op.before(), op.after()}) {
                if (a == null) {
                    continue;
                }
                keys.add("employee:" + a.employeeId());
                if (a.vehicleId() != null) {
                    keys.add("vehicle:" + a.vehicleId());
                }
                min = min == null || a.date().isBefore(min) ? a.date() : min;
                max = max == null || a.date().isAfter(max) ? a.date() : max;
            }
        }
        repository.lock(keys);
        if (preview) {
            jdbcTemplate.execute("SAVEPOINT planning_preview");
        }
        var today = today();
        var from = min == null ? today : min;
        var to = max == null ? today : max;
        var before = ConflictEngine.detect(repository.snapshot(from, to, today));

        var userId = TenantContext.userId().orElseThrow();
        var changeSetId = jdbcTemplate.queryForObject("""
                INSERT INTO planning_change_sets (organization_id, actor_user_id, kind, label) VALUES (?, ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), userId, revert ? "REVERT" : kind, plan.label());
        int created = 0;
        int updated = 0;
        int deleted = 0;
        var createdIds = new ArrayList<UUID>();
        for (var op : plan.ops()) {
            switch (op.kind()) {
                case "CREATE" -> {
                    var id = repository.insert(op.after(), userId);
                    createdIds.add(id);
                    var saved = repository.find(id).orElseThrow();
                    item(changeSetId, id, "CREATE", null, saved);
                    created++;
                }
                case "UPDATE" -> {
                    var version = repository.update(op.after(), op.before().version());
                    if (version < 0) {
                        throw stale();
                    }
                    item(changeSetId, op.after().id(), "UPDATE", op.before(), repository.find(op.after().id()).orElseThrow());
                    updated++;
                }
                case "DELETE" -> {
                    if (!repository.delete(op.before().id(), op.before().version())) {
                        throw stale();
                    }
                    item(changeSetId, op.before().id(), "DELETE", op.before(), null);
                    deleted++;
                }
                default -> throw new IllegalStateException(op.kind());
            }
        }

        var beforeIds = new HashSet<String>();
        before.forEach(c -> beforeIds.add(c.id()));
        var newConflicts = ConflictEngine.detect(repository.snapshot(from, to, today)).stream()
                .filter(c -> !beforeIds.contains(c.id())).toList();

        var result = new CommandResult(preview, preview ? null : changeSetId, plan.label(), created, updated, deleted,
                createdIds, plan.skipped(), newConflicts);
        if (preview) {
            jdbcTemplate.execute("ROLLBACK TO SAVEPOINT planning_preview");
            jdbcTemplate.execute("RELEASE SAVEPOINT planning_preview");
            return result;
        }
        var blocking = newConflicts.stream().filter(c -> c.severity() == Severity.BLOCK).toList();
        if (!blocking.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "planning-conflicts",
                    "A alteração cria conflitos que não são permitidos: " + blocking.getFirst().title() + ".")
                    .with("conflicts", blocking);
        }
        var unconfirmed = newConflicts.stream()
                .filter(c -> c.severity() == Severity.WARN && !acknowledged.contains(c.id()) && !revert).toList();
        if (!unconfirmed.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "confirmation-required",
                    "A alteração cria avisos que precisam de confirmação.").with("conflicts", unconfirmed);
        }
        try {
            repository.constraintsNow();
        } catch (DataIntegrityViolationException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "planning-conflicts",
                    "Outra alteração simultânea ocupou o mesmo horário. Recarregue o planeamento.");
        }
        var changes = new LinkedHashMap<String, Object>();
        changes.put("kind", kind);
        changes.put("created", created);
        changes.put("updated", updated);
        changes.put("deleted", deleted);
        if (!acknowledged.isEmpty()) {
            changes.put("acknowledgedConflicts", acknowledged.size());
        }
        auditLog.record(revert ? "planning.reverted" : "planning.changed", "planning_change_set", changeSetId, changes);
        return result;
    }

    private void item(UUID changeSetId, UUID assignmentId, String op, AssignmentView before, AssignmentView after) {
        jdbcTemplate.update("""
                INSERT INTO planning_change_items (organization_id, change_set_id, assignment_id, op, before, after, after_version)
                VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
                """, TenantContext.organizationId().orElseThrow(), changeSetId, assignmentId, op,
                before == null ? null : jsonMapper.writeValueAsString(before),
                after == null ? null : jsonMapper.writeValueAsString(after),
                after == null ? null : after.version());
    }

    // --- planos por tipo de comando ------------------------------------------------------------

    private Plan plan(Command c) {
        var kind = c.kind() == null ? "" : c.kind();
        return switch (kind) {
            case "ASSIGN" -> {
                require(c.employeeId(), "employeeId");
                require(c.siteId(), "siteId");
                require(c.date(), "date");
                var after = build(null, c.employeeId(), c.siteId(), c.date(), c.start(), c.end(), c.breakMin(),
                        c.vehicleId(), Boolean.TRUE.equals(c.clearVehicle()), Boolean.TRUE.equals(c.foreman()), c.note(), null);
                yield new Plan("Atribuir " + c.date(), List.of(new Op("CREATE", null, after)), List.of());
            }
            case "SCHEDULE" -> schedule(c);
            case "UPDATE" -> {
                var item = single(c);
                var current = current(item);
                var moved = c.employeeId() != null || c.siteId() != null || c.date() != null;
                var vehicle = c.vehicleId() != null ? c.vehicleId() : moved ? null : current.vehicleId();
                var clear = Boolean.TRUE.equals(c.clearVehicle());
                var after = build(current.id(), or(c.employeeId(), current.employeeId()), or(c.siteId(), current.siteId()),
                        or(c.date(), current.date()), or(c.start(), current.start()), or(c.end(), current.end()),
                        c.breakMin() != null ? c.breakMin() : sameTimes(c, current) ? current.breakMin() : null,
                        vehicle, clear || (!moved && c.vehicleId() == null && current.vehicleId() == null),
                        c.foreman() != null ? c.foreman() : !Objects.equals(or(c.employeeId(), current.employeeId()), current.employeeId())
                                ? false : current.foreman(),
                        c.note() != null ? c.note() : current.note(), current.batchId());
                yield new Plan("Alterar atribuição", List.of(new Op("UPDATE", current, withVersion(after, current.version()))), List.of());
            }
            case "BULK_UPDATE" -> {
                var ops = new ArrayList<Op>();
                for (var item : items(c)) {
                    var current = current(item);
                    var clear = Boolean.TRUE.equals(c.clearVehicle());
                    var after = build(current.id(), current.employeeId(), or(c.siteId(), current.siteId()), current.date(),
                            or(c.start(), current.start()), or(c.end(), current.end()),
                            sameTimes(c, current) ? current.breakMin() : null,
                            c.vehicleId() != null ? c.vehicleId() : clear ? null : current.vehicleId(),
                            clear || (c.vehicleId() == null && current.vehicleId() == null),
                            current.foreman(), current.note(), current.batchId());
                    ops.add(new Op("UPDATE", current, withVersion(after, current.version())));
                }
                yield new Plan("Alterar " + ops.size() + " atribuições", ops, List.of());
            }
            case "DUPLICATE" -> {
                var current = current(single(c));
                var employee = or(c.employeeId(), current.employeeId());
                var site = or(c.siteId(), current.siteId());
                var keepVehicle = site.equals(current.siteId()) && employee.equals(current.employeeId());
                var after = build(null, employee, site, or(c.date(), current.date()), current.start(), current.end(),
                        current.breakMin(), keepVehicle ? current.vehicleId() : null,
                        keepVehicle && current.vehicleId() == null, false, current.note(), null);
                yield new Plan("Copiar atribuição", List.of(new Op("CREATE", null, after)), List.of());
            }
            case "DELETE" -> {
                var ops = items(c).stream().map(item -> new Op("DELETE", current(item), null)).toList();
                yield new Plan("Retirar " + ops.size() + (ops.size() == 1 ? " atribuição" : " atribuições"), ops, List.of());
            }
            case "TRANSFER" -> transfer(c);
            case "COPY_WEEK" -> copyWeek(c);
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "invalid-command", "Tipo de comando desconhecido: " + kind);
        };
    }

    private Plan schedule(Command c) {
        require(c.siteId(), "siteId");
        require(c.from(), "from");
        require(c.to(), "to");
        if (c.employeeIds() == null || c.employeeIds().isEmpty()) {
            throw invalid("employeeIds", "Escolha pelo menos um trabalhador.");
        }
        checkRange(c.from(), c.to());
        var weekdays = weekdays(c.weekdays());
        var batch = UUID.randomUUID();
        var ops = new ArrayList<Op>();
        var skipped = new ArrayList<Skipped>();
        var today = today();
        for (var date = c.from(); !date.isAfter(c.to()); date = date.plusDays(1)) {
            if (!weekdays.contains(date.getDayOfWeek().getValue())) {
                continue;
            }
            for (var employee : c.employeeIds()) {
                if (date.isBefore(today)) {
                    skipped.add(new Skipped(employee, date, "PAST"));
                    continue;
                }
                ops.add(new Op("CREATE", null, build(null, employee, c.siteId(), date, c.start(), c.end(), c.breakMin(),
                        c.vehicleId(), Boolean.TRUE.equals(c.clearVehicle()), employee.equals(c.foremanEmployeeId()),
                        c.note(), batch)));
            }
        }
        return new Plan("Escala de " + c.from() + " a " + c.to(), ops, skipped);
    }

    private Plan transfer(Command c) {
        require(c.employeeId(), "employeeId");
        require(c.siteId(), "siteId");
        require(c.from(), "from");
        require(c.to(), "to");
        checkRange(c.from(), c.to());
        var today = today();
        var from = c.from().isBefore(today) ? today : c.from();
        var ops = new ArrayList<Op>();
        for (var existing : repository.forEmployeeBetween(c.employeeId(), from, c.to())) {
            ops.add(new Op("DELETE", existing, null));
        }
        var weekdays = weekdays(c.weekdays());
        for (var date = from; !date.isAfter(c.to()); date = date.plusDays(1)) {
            if (weekdays.contains(date.getDayOfWeek().getValue())) {
                ops.add(new Op("CREATE", null, build(null, c.employeeId(), c.siteId(), date, c.start(), c.end(), c.breakMin(),
                        c.vehicleId(), Boolean.TRUE.equals(c.clearVehicle()), false, c.note(), null)));
            }
        }
        return new Plan("Transferir trabalhador", ops, List.of());
    }

    private Plan copyWeek(Command c) {
        require(c.sourceWeek(), "sourceWeek");
        require(c.targetWeek(), "targetWeek");
        if (c.sourceWeek().getDayOfWeek() != DayOfWeek.MONDAY || c.targetWeek().getDayOfWeek() != DayOfWeek.MONDAY) {
            throw invalid("sourceWeek", "As semanas começam à segunda-feira.");
        }
        if (c.sourceWeek().equals(c.targetWeek())) {
            throw invalid("targetWeek", "Escolha uma semana diferente da de origem.");
        }
        var shift = ChronoUnit.DAYS.between(c.sourceWeek(), c.targetWeek());
        var today = today();
        var occupied = new HashSet<String>();
        repository.forWeek(c.targetWeek(), null).forEach(a -> occupied.add(a.employeeId() + "|" + a.date()));
        var ops = new ArrayList<Op>();
        var skipped = new ArrayList<Skipped>();
        var inactive = new HashMap<UUID, Boolean>();
        var batch = UUID.randomUUID();
        for (var source : repository.forWeek(c.sourceWeek(), c.teamIds())) {
            var date = source.date().plusDays(shift);
            if (date.isBefore(today)) {
                skipped.add(new Skipped(source.employeeId(), date, "PAST"));
            } else if (!inactive.computeIfAbsent(source.employeeId(), repository::employeeActive)) {
                skipped.add(new Skipped(source.employeeId(), date, "INACTIVE"));
            } else if (occupied.contains(source.employeeId() + "|" + date)) {
                skipped.add(new Skipped(source.employeeId(), date, "ALREADY_PLANNED"));
            } else {
                ops.add(new Op("CREATE", null, build(null, source.employeeId(), source.siteId(), date, source.start(),
                        source.end(), source.breakMin(), source.vehicleId(), source.vehicleId() == null, source.foreman(),
                        source.note(), batch)));
            }
        }
        return new Plan("Copiar semana de " + c.sourceWeek(), ops, skipped);
    }

    /**
     * Constrói uma atribuição validada: obra e trabalhador existentes, horas locais válidas no fuso da obra
     * (incluindo a mudança de hora), pausa da política laboral, equipa e viatura por omissão.
     */
    private AssignmentView build(UUID id, UUID employeeId, UUID siteId, LocalDate date, LocalTime start, LocalTime end,
            Integer breakMin, UUID vehicleId, boolean noVehicle, boolean foreman, String note, UUID batchId) {
        require(start, "start");
        require(end, "end");
        if (start.equals(end)) {
            throw invalid("end", "A hora de fim tem de ser diferente da de início.");
        }
        var zone = repository.siteZone(siteId).orElseThrow(() -> invalid("siteId", "A obra não existe ou está arquivada."));
        if (!repository.employeeExists(employeeId)) {
            throw invalid("employeeId", "O trabalhador não existe ou está arquivado.");
        }
        var rules = ZoneId.of(zone).getRules();
        var endDate = end.isAfter(start) ? date : date.plusDays(1);
        if (rules.getValidOffsets(date.atTime(start)).isEmpty() || rules.getValidOffsets(endDate.atTime(end)).isEmpty()) {
            throw invalid("start", "Essa hora não existe nesse dia no fuso da obra (mudança para a hora de verão).");
        }
        var minutes = (int) Duration.between(date.atTime(start).atZone(ZoneId.of(zone)), endDate.atTime(end).atZone(ZoneId.of(zone)))
                .toMinutes();
        int pause;
        if (breakMin != null) {
            pause = breakMin;
        } else {
            var policy = repository.breakPolicy(date);
            pause = minutes > policy[0] ? policy[1] : 0;
        }
        if (pause < 0 || pause >= minutes) {
            throw invalid("breakMin", "A pausa tem de ser menor do que o período.");
        }
        var team = repository.teamOf(employeeId, date).orElse(null);
        UUID vehicle = vehicleId;
        if (vehicle == null && !noVehicle && team != null) {
            vehicle = repository.vehicleOfTeam(team, date).orElse(null);
        }
        if (vehicleId != null && !repository.vehicleExists(vehicleId)) {
            throw invalid("vehicleId", "A viatura não existe ou está arquivada.");
        }
        var cleanNote = note == null || note.isBlank() ? null : note.strip();
        if (cleanNote != null && cleanNote.length() > 500) {
            throw invalid("note", "A observação tem no máximo 500 caracteres.");
        }
        return new AssignmentView(id, employeeId, siteId, date, start, end, pause, minutes - pause, team, vehicle, foreman,
                cleanNote, batchId, 0);
    }

    // --- anular ---------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<ChangeSetView> recentChangeSets(int limit) {
        OrgRole.require(OrgRole.MANAGER);
        return jdbcTemplate.query("""
                SELECT id, kind, label, created_at, reverted_by_change_set_id
                FROM planning_change_sets WHERE actor_user_id = ? ORDER BY created_at DESC LIMIT ?
                """, (resultSet, rowNumber) -> new ChangeSetView(resultSet.getObject("id", UUID.class),
                resultSet.getString("kind"), resultSet.getString("label"),
                resultSet.getObject("created_at", java.time.OffsetDateTime.class).toInstant(),
                resultSet.getObject("reverted_by_change_set_id") != null,
                resultSet.getObject("reverted_by_change_set_id") == null),
                TenantContext.userId().orElseThrow(), Math.clamp(limit, 1, 50));
    }

    /**
     * Desfaz um change-set, só se nenhuma das atribuições tiver sido alterada depois (por esta ou por outra pessoa).
     * A reversão é ela própria um change-set auditado.
     */
    @Transactional
    public CommandResult revert(UUID changeSetId) {
        OrgRole.require(OrgRole.MANAGER);
        var set = jdbcTemplate.query("""
                SELECT label, reverted_by_change_set_id FROM planning_change_sets WHERE id = ? FOR UPDATE
                """, (resultSet, rowNumber) -> new Object[] {resultSet.getString(1), resultSet.getObject(2)}, changeSetId)
                .stream().findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "A alteração não foi encontrada."));
        if (set[1] != null) {
            throw new ApiException(HttpStatus.CONFLICT, "already-reverted", "Esta alteração já foi anulada.");
        }
        var items = jdbcTemplate.query("""
                SELECT assignment_id, op, before::text AS before, after::text AS after FROM planning_change_items
                WHERE change_set_id = ? ORDER BY id DESC
                """, (resultSet, rowNumber) -> new Object[] {resultSet.getObject(1, UUID.class), resultSet.getString(2),
                resultSet.getString(3), resultSet.getString(4)}, changeSetId);
        var ops = new ArrayList<Op>();
        var changedSince = new ArrayList<UUID>();
        for (var item : items) {
            var assignmentId = (UUID) item[0];
            var current = repository.find(assignmentId);
            var before = item[2] == null ? null : jsonMapper.readValue((String) item[2], AssignmentView.class);
            var after = item[3] == null ? null : jsonMapper.readValue((String) item[3], AssignmentView.class);
            switch ((String) item[1]) {
                case "CREATE" -> {
                    if (current.isEmpty() || current.get().version() != after.version()) {
                        changedSince.add(assignmentId);
                    } else {
                        ops.add(new Op("DELETE", current.get(), null));
                    }
                }
                case "UPDATE" -> {
                    if (current.isEmpty() || current.get().version() != after.version()) {
                        changedSince.add(assignmentId);
                    } else {
                        ops.add(new Op("UPDATE", current.get(), withVersion(before, current.get().version())));
                    }
                }
                case "DELETE" -> {
                    if (current.isPresent()) {
                        changedSince.add(assignmentId);
                    } else {
                        ops.add(new Op("CREATE", null, before));
                    }
                }
                default -> throw new IllegalStateException();
            }
        }
        if (!changedSince.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "stale",
                    "Não é possível anular: entretanto houve outras alterações nas mesmas atribuições.")
                    .with("assignmentIds", changedSince);
        }
        var result = apply("REVERT", new Plan("Anular: " + set[0], ops, List.of()), false, Set.of(), true);
        jdbcTemplate.update("UPDATE planning_change_sets SET reverted_by_change_set_id = ? WHERE id = ?", result.changeSetId(), changeSetId);
        jdbcTemplate.update("UPDATE planning_change_sets SET reverts_change_set_id = ? WHERE id = ?", changeSetId, result.changeSetId());
        return result;
    }

    // --- auxiliares ------------------------------------------------------------------------------

    private AssignmentView current(Item item) {
        if (item == null || item.assignmentId() == null) {
            throw invalid("items", "Indique a atribuição.");
        }
        var current = repository.find(item.assignmentId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not-found", "A atribuição já não existe."));
        if (item.version() != null && item.version() != current.version()) {
            throw stale();
        }
        return current;
    }

    private static Item single(Command c) {
        var items = items(c);
        if (items.size() != 1) {
            throw invalid("items", "Indique exatamente uma atribuição.");
        }
        return items.getFirst();
    }

    private static List<Item> items(Command c) {
        if (c.items() == null || c.items().isEmpty()) {
            throw invalid("items", "Indique as atribuições.");
        }
        return c.items();
    }

    private static boolean sameTimes(Command c, AssignmentView current) {
        return (c.start() == null || c.start().equals(current.start())) && (c.end() == null || c.end().equals(current.end()));
    }

    private static AssignmentView withVersion(AssignmentView a, int version) {
        return new AssignmentView(a.id(), a.employeeId(), a.siteId(), a.date(), a.start(), a.end(), a.breakMin(),
                a.plannedMin(), a.teamId(), a.vehicleId(), a.foreman(), a.note(), a.batchId(), version);
    }

    private static Set<Integer> weekdays(List<Integer> requested) {
        var days = requested == null || requested.isEmpty() ? Set.of(1, 2, 3, 4, 5) : Set.copyOf(requested);
        if (days.stream().anyMatch(d -> d < 1 || d > 7)) {
            throw invalid("weekdays", "Dias da semana entre 1 (segunda) e 7 (domingo).");
        }
        return days;
    }

    private static void checkRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw invalid("to", "O intervalo de datas é inválido.");
        }
        if (ChronoUnit.DAYS.between(from, to) > MAX_DAYS) {
            throw invalid("to", "O intervalo tem no máximo " + MAX_DAYS + " dias.");
        }
    }

    private static <T> T or(T value, T fallback) {
        return value != null ? value : fallback;
    }

    private static void require(Object value, String field) {
        if (value == null) {
            throw invalid(field, "Campo obrigatório: " + field + ".");
        }
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
    }

    private static ApiException stale() {
        return new ApiException(HttpStatus.CONFLICT, "stale",
                "O planeamento foi alterado por outra pessoa entretanto. Recarregue e tente de novo.");
    }

    private LocalDate today() {
        return TenantContext.today(clock);
    }

    static boolean isExclusion(Throwable exception) {
        for (var cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && "23P01".equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }
}
