package pt.andaime.absences.application;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.notifications.Notifier;
import pt.andaime.planning.application.PlanningService;
import pt.andaime.planning.application.PlanningViews.AssignmentView;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Ausências: o trabalhador (ou o encarregado/gestor por ele) pede; o gestor aprova ou recusa. Aprovar uma ausência
 * com trabalho planeado obriga a decidir explicitamente o que fazer às atribuições: retirá-las (change-set de
 * planeamento, que pode ser anulado) ou mantê-las (ficam como conflito no quadro). Nunca se apaga uma ausência.
 */
@Service
public class AbsenceService {

    static final Set<String> KINDS = Set.of("VACATION", "SICK", "TRAINING", "PERSONAL", "LEAVE", "OTHER");
    static final Map<String, String> KIND_LABEL = Map.of("VACATION", "Férias", "SICK", "Doença", "TRAINING", "Formação",
            "PERSONAL", "Assunto pessoal", "LEAVE", "Licença", "OTHER", "Outra");

    public record AbsenceView(UUID id, UUID employeeId, String employeeName, String kind, LocalDate startsOn, LocalDate endsOn,
            Integer partialMinutes, String status, String note, String requestedBy, String decidedBy, Instant decidedAt,
            String decisionNote, int days, int version) {
    }

    public record AbsenceInput(UUID employeeId, String kind, LocalDate startsOn, LocalDate endsOn, Integer partialMinutes,
            String note) {
    }

    public record ImpactItem(UUID assignmentId, LocalDate date, UUID siteId, LocalTime start, LocalTime end, int plannedMin) {
    }

    public record Impact(UUID absenceId, List<ImpactItem> assignments) {
    }

    private static final String SELECT = """
            SELECT absence.*, employee.full_name, requester.display_name AS requested_by, decider.display_name AS decided_by
            FROM absences absence
            JOIN employees employee ON employee.organization_id = absence.organization_id AND employee.id = absence.employee_id
            JOIN users requester ON requester.id = absence.requested_by_user_id
            LEFT JOIN users decider ON decider.id = absence.decided_by_user_id
            """;

    private final JdbcTemplate jdbcTemplate;
    private final PlanningService planning;
    private final AuditLog auditLog;
    private final Notifier notifier;
    private final Clock clock;

    public AbsenceService(JdbcTemplate jdbcTemplate, PlanningService planning, AuditLog auditLog, Notifier notifier, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.planning = planning;
        this.auditLog = auditLog;
        this.notifier = notifier;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<AbsenceView> list(LocalDate from, LocalDate to, String status, UUID employeeId) {
        if (from == null || to == null || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 400) {
            throw invalid("to", "Intervalo de datas inválido (máximo 400 dias).");
        }
        var scope = scope();
        var sql = new StringBuilder(SELECT).append(" WHERE absence.starts_on <= ? AND absence.ends_on >= ? AND ").append(scope.sql());
        var params = new ArrayList<Object>(List.of(to, from));
        params.addAll(scope.params());
        if (status != null && !status.isBlank()) {
            sql.append(" AND absence.status = ?");
            params.add(status);
        }
        if (employeeId != null) {
            sql.append(" AND absence.employee_id = ?");
            params.add(employeeId);
        }
        sql.append(" ORDER BY absence.starts_on, employee.full_name LIMIT 2000");
        return jdbcTemplate.query(sql.toString(), AbsenceService::view, params.toArray());
    }

    @Transactional
    public AbsenceView request(AbsenceInput input) {
        var employeeId = input.employeeId() != null ? input.employeeId() : TenantContext.employeeId().orElseThrow(() ->
                new ApiException(HttpStatus.CONFLICT, "no-employee", "A sua conta ainda não está ligada a uma ficha de trabalhador."));
        if (!inScope(employeeId)) {
            throw notFound();
        }
        if (input.kind() == null || !KINDS.contains(input.kind())) {
            throw invalid("kind", "Escolha o tipo de ausência.");
        }
        if (input.startsOn() == null || input.endsOn() == null || input.endsOn().isBefore(input.startsOn())) {
            throw invalid("endsOn", "As datas da ausência são inválidas.");
        }
        if (ChronoUnit.DAYS.between(input.startsOn(), input.endsOn()) > 366) {
            throw invalid("endsOn", "Uma ausência tem no máximo um ano.");
        }
        if (input.partialMinutes() != null && (!input.startsOn().equals(input.endsOn()) || input.partialMinutes() < 15
                || input.partialMinutes() > 600)) {
            throw invalid("partialMinutes", "Ausência parcial: um só dia, entre 15 minutos e 10 horas.");
        }
        // Pedidos do próprio trabalhador só para hoje em diante; o escritório pode registar ausências passadas (ex.: baixa).
        if (!OrgRole.current().atLeast(OrgRole.FOREMAN) && input.startsOn().isBefore(TenantContext.today(clock))) {
            throw invalid("startsOn", "Não é possível pedir ausências para dias passados. Fale com o escritório.");
        }
        var note = input.note() == null || input.note().isBlank() ? null : input.note().strip();
        if (note != null && note.length() > 500) {
            throw invalid("note", "A observação tem no máximo 500 caracteres.");
        }
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO absences (organization_id, employee_id, kind, starts_on, ends_on, partial_minutes, note, requested_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, TenantContext.organizationId().orElseThrow(), employeeId, input.kind(), input.startsOn(), input.endsOn(),
                input.partialMinutes(), note, TenantContext.userId().orElseThrow());
        var changes = new LinkedHashMap<String, Object>();
        changes.put("kind", input.kind());
        changes.put("startsOn", input.startsOn().toString());
        changes.put("endsOn", input.endsOn().toString());
        auditLog.record("absence.requested", "absence", id, changes);
        var view = get(id);
        notifier.notify(notifier.managers(), "absence.requested", "Pedido de ausência: " + view.employeeName(),
                KIND_LABEL.get(input.kind()) + " de " + input.startsOn() + " a " + input.endsOn() + ".", "/ausencias", null);
        return view;
    }

    @Transactional(readOnly = true)
    public Impact impact(UUID id) {
        var absence = get(id);
        return new Impact(id, affected(absence).stream().map(a -> new ImpactItem(a.id(), a.date(), a.siteId(), a.start(), a.end(),
                a.plannedMin())).toList());
    }

    /**
     * @param resolution {@code REMOVE} retira as atribuições afetadas; {@code KEEP} mantém-nas (ficam como conflito).
     *                   Obrigatória quando há trabalho planeado nos dias da ausência (409 {@code resolution-required}).
     */
    @Transactional
    public AbsenceView approve(UUID id, String resolution, Integer version) {
        OrgRole.require(OrgRole.MANAGER);
        var absence = lockRequested(id, version);
        var affected = affected(absence);
        if (!affected.isEmpty()) {
            if (resolution == null) {
                throw new ApiException(HttpStatus.CONFLICT, "resolution-required",
                        "Há trabalho planeado nesses dias. Escolha se retira as atribuições ou as mantém.")
                        .with("assignments", affected.stream().map(a -> new ImpactItem(a.id(), a.date(), a.siteId(), a.start(),
                                a.end(), a.plannedMin())).toList());
            }
            if ("REMOVE".equals(resolution)) {
                planning.removeAssignments(affected, "Ausência de " + absence.employeeName());
            } else if (!"KEEP".equals(resolution)) {
                throw invalid("resolution", "Resolução inválida.");
            }
        }
        decide(id, "APPROVED", null);
        auditLog.record("absence.approved", "absence", id, Map.of("resolution", resolution == null ? "NONE" : resolution,
                "affectedAssignments", affected.size()));
        notifyEmployee(absence, "Ausência aprovada", KIND_LABEL.get(absence.kind()) + " de " + absence.startsOn() + " a "
                + absence.endsOn() + " aprovada.");
        return get(id);
    }

    @Transactional
    public AbsenceView reject(UUID id, String note, Integer version) {
        OrgRole.require(OrgRole.MANAGER);
        if (note == null || note.strip().length() < 3) {
            throw invalid("note", "Indique o motivo da recusa.");
        }
        var absence = lockRequested(id, version);
        decide(id, "REJECTED", note.strip());
        auditLog.record("absence.rejected", "absence", id, Map.of("note", note.strip()));
        notifyEmployee(absence, "Ausência recusada", note.strip());
        return get(id);
    }

    /** Cancelar: o próprio enquanto está pedida; o gestor também depois de aprovada. O registo fica (nunca se apaga). */
    @Transactional
    public AbsenceView cancel(UUID id, Integer version) {
        var absence = get(id);
        var manager = OrgRole.current().atLeast(OrgRole.MANAGER);
        var own = TenantContext.employeeId().map(absence.employeeId()::equals).orElse(false)
                || OrgRole.current().atLeast(OrgRole.FOREMAN);
        if (!(absence.status().equals("REQUESTED") && own) && !(manager && absence.status().equals("APPROVED"))) {
            throw new ApiException(HttpStatus.CONFLICT, "invalid-transition", "Esta ausência já não pode ser cancelada.");
        }
        var updated = jdbcTemplate.update("""
                UPDATE absences SET status = 'CANCELLED', version = version + 1 WHERE id = ? AND (?::int IS NULL OR version = ?)
                """, id, version, version);
        if (updated == 0) {
            throw stale();
        }
        auditLog.record("absence.cancelled", "absence", id, Map.of("from", absence.status()));
        return get(id);
    }

    // --- auxiliares ------------------------------------------------------------------------------------

    private AbsenceView get(UUID id) {
        var scope = scope();
        var params = new ArrayList<Object>(List.of(id));
        params.addAll(scope.params());
        return jdbcTemplate.query(SELECT + " WHERE absence.id = ? AND " + scope.sql(), AbsenceService::view, params.toArray())
                .stream().findFirst().orElseThrow(AbsenceService::notFound);
    }

    private AbsenceView lockRequested(UUID id, Integer version) {
        var absence = get(id);
        jdbcTemplate.query("SELECT 1 FROM absences WHERE id = ? FOR UPDATE", resultSet -> { }, id);
        var current = get(id);
        if (version != null && version != current.version()) {
            throw stale();
        }
        if (!current.status().equals("REQUESTED")) {
            throw new ApiException(HttpStatus.CONFLICT, "invalid-transition", "Esta ausência já foi decidida.");
        }
        return absence;
    }

    private void decide(UUID id, String status, String note) {
        jdbcTemplate.update("""
                UPDATE absences SET status = ?, decided_by_user_id = ?, decided_at = now(), decision_note = ?, version = version + 1
                WHERE id = ?
                """, status, TenantContext.userId().orElseThrow(), note, id);
    }

    /** Atribuições de hoje em diante nos dias da ausência (ausências parciais não retiram ninguém). */
    private List<AssignmentView> affected(AbsenceView absence) {
        if (absence.partialMinutes() != null) {
            return List.of();
        }
        var today = TenantContext.today(clock);
        var from = absence.startsOn().isBefore(today) ? today : absence.startsOn();
        if (from.isAfter(absence.endsOn())) {
            return List.of();
        }
        return planning.assignmentsOf(absence.employeeId(), from, absence.endsOn());
    }

    private void notifyEmployee(AbsenceView absence, String title, String body) {
        notifier.notify(notifier.userOfEmployee(absence.employeeId()), "absence.decided", title, body, "/app", null);
    }

    private record Scope(String sql, List<Object> params) {
    }

    private static Scope scope() {
        var role = OrgRole.current();
        if (role.atLeast(OrgRole.MANAGER)) {
            return new Scope("TRUE", List.of());
        }
        var me = TenantContext.employeeId().orElse(null);
        if (me == null) {
            return new Scope("FALSE", List.of());
        }
        if (role == OrgRole.WORKER) {
            return new Scope("absence.employee_id = ?", List.of(me));
        }
        return new Scope("(absence.employee_id = ? OR absence.employee_id IN (SELECT member.employee_id FROM team_members member "
                + "JOIN teams led ON led.organization_id = member.organization_id AND led.id = member.team_id "
                + "WHERE led.foreman_employee_id = ? AND (member.left_on IS NULL OR member.left_on >= current_date - 31)))",
                List.of(me, me));
    }

    private boolean inScope(UUID employeeId) {
        var scope = scope();
        var params = new ArrayList<Object>(List.of(employeeId));
        params.addAll(scope.params());
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("SELECT EXISTS (SELECT 1 FROM (SELECT ?::uuid AS employee_id) absence "
                + "JOIN employees employee ON employee.id = absence.employee_id AND employee.archived_at IS NULL WHERE "
                + scope.sql() + ")", Boolean.class, params.toArray()));
    }

    private static AbsenceView view(ResultSet resultSet, int rowNumber) throws SQLException {
        var starts = resultSet.getObject("starts_on", LocalDate.class);
        var ends = resultSet.getObject("ends_on", LocalDate.class);
        return new AbsenceView(resultSet.getObject("id", UUID.class), resultSet.getObject("employee_id", UUID.class),
                resultSet.getString("full_name"), resultSet.getString("kind"), starts, ends,
                (Integer) resultSet.getObject("partial_minutes"), resultSet.getString("status"), resultSet.getString("note"),
                resultSet.getString("requested_by"), resultSet.getString("decided_by"),
                resultSet.getObject("decided_at") == null ? null : resultSet.getObject("decided_at", OffsetDateTime.class).toInstant(),
                resultSet.getString("decision_note"), (int) ChronoUnit.DAYS.between(starts, ends) + 1, resultSet.getInt("version"));
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "A ausência não foi encontrada.");
    }

    private static ApiException stale() {
        return new ApiException(HttpStatus.CONFLICT, "stale", "A ausência foi alterada entretanto. Recarregue e tente de novo.");
    }
}
