package pt.andaime.equipment.application;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.audit.AuditLog;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Fardamento, EPI e ferramentas. Artigos de stock têm saldo (nunca negativo); artigos com número de série têm
 * unidades com titular. Cada entrada, ajuste, entrega e devolução fica num registo só de acrescento, de onde se
 * calcula o que cada trabalhador tem em seu poder.
 */
@Service
public class EquipmentService {

    static final Set<String> CATEGORIES = Set.of("PPE", "UNIFORM", "TOOL");

    public record ItemView(UUID id, String name, String category, String tracking, String size, int minStock, int onHand,
            int assigned, boolean low, boolean archived, int version) {
    }

    public record ItemInput(String name, String category, String tracking, String size, Integer minStock, Integer version) {
    }

    public record UnitView(UUID id, UUID itemId, String serial, String status, UUID holderEmployeeId, String holderName) {
    }

    public record MovementView(UUID id, UUID itemId, String itemName, String kind, int quantity, String serial, UUID employeeId,
            String employeeName, String note, String userName, Instant occurredAt) {
    }

    public record Holding(UUID itemId, String itemName, String category, String size, int quantity, List<String> serials) {
    }

    public record Movement(UUID itemId, UUID employeeId, Integer quantity, UUID unitId, List<String> serials, String condition,
            String note) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final AuditLog auditLog;

    public EquipmentService(JdbcTemplate jdbcTemplate, AuditLog auditLog) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditLog = auditLog;
    }

    // --- catálogo -----------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<ItemView> items(boolean archived) {
        OrgRole.require(OrgRole.FOREMAN);
        return jdbcTemplate.query("""
                SELECT item.*,
                       CASE WHEN item.tracking = 'STOCK' THEN coalesce(balance.on_hand, 0)
                            ELSE (SELECT count(*) FROM equipment_units unit WHERE unit.item_id = item.id AND unit.status = 'IN_STOCK') END AS on_hand,
                       CASE WHEN item.tracking = 'STOCK' THEN
                            (SELECT coalesce(sum(CASE movement.kind WHEN 'DELIVER' THEN movement.quantity
                                                  WHEN 'RETURN' THEN -movement.quantity WHEN 'DAMAGED' THEN -movement.quantity
                                                  WHEN 'LOST' THEN -movement.quantity ELSE 0 END), 0)
                             FROM equipment_movements movement WHERE movement.item_id = item.id AND movement.employee_id IS NOT NULL)
                            ELSE (SELECT count(*) FROM equipment_units unit WHERE unit.item_id = item.id AND unit.status = 'ASSIGNED') END AS assigned
                FROM equipment_items item
                LEFT JOIN stock_balances balance ON balance.organization_id = item.organization_id AND balance.item_id = item.id
                WHERE\s""" + (archived ? "item.archived_at IS NOT NULL" : "item.archived_at IS NULL") + """
                 ORDER BY item.category, lower(item.name), item.size
                """, (resultSet, rowNumber) -> {
            var onHand = resultSet.getInt("on_hand");
            var min = resultSet.getInt("min_stock");
            return new ItemView(resultSet.getObject("id", UUID.class), resultSet.getString("name"), resultSet.getString("category"),
                    resultSet.getString("tracking"), resultSet.getString("size"), min, onHand, resultSet.getInt("assigned"),
                    min > 0 && onHand < min, resultSet.getObject("archived_at") != null, resultSet.getInt("version"));
        });
    }

    @Transactional
    public ItemView saveItem(UUID id, ItemInput input) {
        OrgRole.require(OrgRole.MANAGER);
        var name = input.name() == null ? "" : input.name().strip();
        if (name.length() < 2 || name.length() > 120) {
            throw invalid("name", "Indique o nome do artigo.");
        }
        var size = input.size() == null || input.size().isBlank() ? null : input.size().strip();
        var min = input.minStock() == null ? 0 : input.minStock();
        if (min < 0 || min > 100000) {
            throw invalid("minStock", "Stock mínimo inválido.");
        }
        try {
            if (id == null) {
                if (input.category() == null || !CATEGORIES.contains(input.category())) {
                    throw invalid("category", "Escolha a categoria.");
                }
                if (!"STOCK".equals(input.tracking()) && !"SERIAL".equals(input.tracking())) {
                    throw invalid("tracking", "Escolha se o artigo é por quantidade ou por número de série.");
                }
                id = jdbcTemplate.queryForObject("""
                        INSERT INTO equipment_items (organization_id, name, category, tracking, size, min_stock)
                        VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                        """, UUID.class, org(), name, input.category(), input.tracking(), size, min);
                if ("STOCK".equals(input.tracking())) {
                    jdbcTemplate.update("INSERT INTO stock_balances (organization_id, item_id, on_hand) VALUES (?, ?, 0)", org(), id);
                }
                auditLog.record("equipment.item-created", "equipment_item", id, Map.of("name", name));
            } else {
                var updated = jdbcTemplate.update("""
                        UPDATE equipment_items SET name = ?, size = ?, min_stock = ?, version = version + 1
                        WHERE id = ? AND archived_at IS NULL AND (?::int IS NULL OR version = ?)
                        """, name, size, min, id, input.version(), input.version());
                if (updated == 0) {
                    throw new ApiException(HttpStatus.CONFLICT, "stale", "O artigo foi alterado entretanto ou já não existe.");
                }
                auditLog.record("equipment.item-updated", "equipment_item", id, Map.of("name", name));
            }
        } catch (DuplicateKeyException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "name-taken", "Já existe um artigo com esse nome e tamanho.");
        }
        var saved = id;
        return items(false).stream().filter(i -> i.id().equals(saved)).findFirst().orElseThrow();
    }

    @Transactional
    public void archiveItem(UUID id) {
        OrgRole.require(OrgRole.MANAGER);
        if (jdbcTemplate.update("UPDATE equipment_items SET archived_at = now(), version = version + 1 WHERE id = ? AND archived_at IS NULL", id) == 0) {
            throw notFound();
        }
        auditLog.record("equipment.item-archived", "equipment_item", id);
    }

    @Transactional(readOnly = true)
    public List<UnitView> units(UUID itemId) {
        OrgRole.require(OrgRole.FOREMAN);
        return jdbcTemplate.query("""
                SELECT unit.id, unit.item_id, unit.serial, unit.status, unit.holder_employee_id, holder.full_name
                FROM equipment_units unit
                LEFT JOIN employees holder ON holder.organization_id = unit.organization_id AND holder.id = unit.holder_employee_id
                WHERE unit.item_id = ? ORDER BY unit.serial
                """, (resultSet, rowNumber) -> new UnitView(resultSet.getObject(1, UUID.class), resultSet.getObject(2, UUID.class),
                resultSet.getString(3), resultSet.getString(4), resultSet.getObject(5, UUID.class), resultSet.getString(6)), itemId);
    }

    // --- movimentos ----------------------------------------------------------------------------------------

    /** Entrada de stock (quantidade) ou de unidades novas (números de série). */
    @Transactional
    public ItemView receive(Movement input) {
        OrgRole.require(OrgRole.MANAGER);
        var item = item(input.itemId());
        if (item.tracking().equals("STOCK")) {
            var quantity = positive(input.quantity());
            lockBalance(item.id());
            jdbcTemplate.update("UPDATE stock_balances SET on_hand = on_hand + ? WHERE item_id = ?", quantity, item.id());
            movement(item.id(), null, "RECEIVE", quantity, null, input.note());
        } else {
            if (input.serials() == null || input.serials().isEmpty() || input.serials().size() > 500) {
                throw invalid("serials", "Indique os números de série (1 a 500).");
            }
            for (var raw : input.serials()) {
                var serial = raw == null ? "" : raw.strip();
                if (serial.isEmpty() || serial.length() > 60) {
                    throw invalid("serials", "Número de série inválido.");
                }
                UUID unit;
                try {
                    unit = jdbcTemplate.queryForObject("""
                            INSERT INTO equipment_units (organization_id, item_id, serial) VALUES (?, ?, ?) RETURNING id
                            """, UUID.class, org(), item.id(), serial);
                } catch (DuplicateKeyException exception) {
                    throw new ApiException(HttpStatus.CONFLICT, "serial-taken", "O número de série " + serial + " já existe.");
                }
                movement(item.id(), unit, "RECEIVE", 1, null, input.note());
            }
        }
        auditLog.record("equipment.received", "equipment_item", item.id(), Map.of("quantity",
                item.tracking().equals("STOCK") ? input.quantity() : input.serials().size()));
        return items(false).stream().filter(i -> i.id().equals(item.id())).findFirst().orElseThrow();
    }

    /** Acerto de inventário (contagem física), com motivo. */
    @Transactional
    public ItemView adjust(UUID itemId, int delta, String note) {
        OrgRole.require(OrgRole.MANAGER);
        var item = item(itemId);
        if (!item.tracking().equals("STOCK") || delta == 0) {
            throw invalid("delta", "Acertos só em artigos por quantidade e diferentes de zero.");
        }
        if (note == null || note.strip().length() < 3) {
            throw invalid("note", "Indique o motivo do acerto.");
        }
        lockBalance(itemId);
        try {
            jdbcTemplate.update("UPDATE stock_balances SET on_hand = on_hand + ? WHERE item_id = ?", delta, itemId);
        } catch (DataIntegrityViolationException exception) {
            throw insufficient();
        }
        movement(itemId, null, delta > 0 ? "ADJUST_IN" : "ADJUST_OUT", Math.abs(delta), null, note.strip());
        auditLog.record("equipment.adjusted", "equipment_item", itemId, Map.of("delta", delta, "note", note.strip()));
        return items(false).stream().filter(i -> i.id().equals(itemId)).findFirst().orElseThrow();
    }

    @Transactional
    public List<Holding> deliver(Movement input) {
        OrgRole.require(OrgRole.MANAGER);
        var item = item(input.itemId());
        requireEmployee(input.employeeId());
        if (item.tracking().equals("STOCK")) {
            var quantity = positive(input.quantity());
            lockBalance(item.id());
            var onHand = jdbcTemplate.queryForObject("SELECT on_hand FROM stock_balances WHERE item_id = ?", Integer.class, item.id());
            if (onHand < quantity) {
                throw insufficient();
            }
            jdbcTemplate.update("UPDATE stock_balances SET on_hand = on_hand - ? WHERE item_id = ?", quantity, item.id());
            movement(item.id(), null, "DELIVER", quantity, input.employeeId(), input.note());
        } else {
            var unit = unit(input.unitId(), item.id());
            if (!unit.status().equals("IN_STOCK")) {
                throw new ApiException(HttpStatus.CONFLICT, "unit-unavailable", "A unidade " + unit.serial() + " não está em armazém.");
            }
            jdbcTemplate.update("UPDATE equipment_units SET status = 'ASSIGNED', holder_employee_id = ?, version = version + 1 WHERE id = ?",
                    input.employeeId(), unit.id());
            movement(item.id(), unit.id(), "DELIVER", 1, input.employeeId(), input.note());
        }
        auditLog.record("equipment.delivered", "equipment_item", item.id(), Map.of("employeeId", input.employeeId()));
        return holdings(input.employeeId());
    }

    /** Devolução em bom estado (volta ao armazém), danificada ou perdida (sai do inventário). */
    @Transactional
    public List<Holding> giveBack(Movement input) {
        OrgRole.require(OrgRole.MANAGER);
        var item = item(input.itemId());
        requireEmployee(input.employeeId());
        var condition = input.condition() == null ? "OK" : input.condition();
        if (!Set.of("OK", "DAMAGED", "LOST").contains(condition)) {
            throw invalid("condition", "Estado inválido.");
        }
        var kind = condition.equals("OK") ? "RETURN" : condition;
        if (item.tracking().equals("STOCK")) {
            var quantity = positive(input.quantity());
            lockBalance(item.id());
            var held = holdings(input.employeeId()).stream().filter(h -> h.itemId().equals(item.id())).mapToInt(Holding::quantity).sum();
            if (held < quantity) {
                throw new ApiException(HttpStatus.CONFLICT, "not-held", "O trabalhador só tem " + held + " deste artigo.");
            }
            if (condition.equals("OK")) {
                jdbcTemplate.update("UPDATE stock_balances SET on_hand = on_hand + ? WHERE item_id = ?", quantity, item.id());
            }
            movement(item.id(), null, kind, quantity, input.employeeId(), input.note());
        } else {
            var unit = unit(input.unitId(), item.id());
            if (!unit.status().equals("ASSIGNED") || !input.employeeId().equals(unit.holderEmployeeId())) {
                throw new ApiException(HttpStatus.CONFLICT, "not-held", "A unidade " + unit.serial() + " não está com este trabalhador.");
            }
            jdbcTemplate.update("UPDATE equipment_units SET status = ?, holder_employee_id = NULL, version = version + 1 WHERE id = ?",
                    condition.equals("OK") ? "IN_STOCK" : condition, unit.id());
            movement(item.id(), unit.id(), kind, 1, input.employeeId(), input.note());
        }
        auditLog.record("equipment.returned", "equipment_item", item.id(), Map.of("employeeId", input.employeeId(), "condition", condition));
        return holdings(input.employeeId());
    }

    /** O que um trabalhador tem em seu poder (gestor: todos; encarregado: a sua equipa; trabalhador: ele próprio). */
    @Transactional(readOnly = true)
    public List<Holding> holdings(UUID employeeId) {
        var role = OrgRole.current();
        var me = TenantContext.employeeId().orElse(null);
        if (!role.atLeast(OrgRole.MANAGER)) {
            var allowed = employeeId.equals(me) || role == OrgRole.FOREMAN && me != null && Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                    SELECT EXISTS (SELECT 1 FROM team_members member JOIN teams led ON led.organization_id = member.organization_id
                                   AND led.id = member.team_id
                                   WHERE led.foreman_employee_id = ? AND member.employee_id = ? AND (member.left_on IS NULL OR member.left_on >= current_date))
                    """, Boolean.class, me, employeeId));
            if (!allowed) {
                throw notFound();
            }
        }
        var result = new ArrayList<Holding>();
        jdbcTemplate.query("""
                SELECT item.id, item.name, item.category, item.size,
                       sum(CASE movement.kind WHEN 'DELIVER' THEN movement.quantity ELSE -movement.quantity END) AS quantity
                FROM equipment_movements movement
                JOIN equipment_items item ON item.organization_id = movement.organization_id AND item.id = movement.item_id
                WHERE movement.employee_id = ? AND item.tracking = 'STOCK' AND movement.kind IN ('DELIVER', 'RETURN', 'DAMAGED', 'LOST')
                GROUP BY item.id, item.name, item.category, item.size
                HAVING sum(CASE movement.kind WHEN 'DELIVER' THEN movement.quantity ELSE -movement.quantity END) > 0
                ORDER BY item.name
                """, resultSet -> {
            result.add(new Holding(resultSet.getObject(1, UUID.class), resultSet.getString(2), resultSet.getString(3),
                    resultSet.getString(4), resultSet.getInt(5), List.of()));
        }, employeeId);
        var serials = new LinkedHashMap<UUID, Object[]>();
        jdbcTemplate.query("""
                SELECT item.id, item.name, item.category, item.size, unit.serial
                FROM equipment_units unit
                JOIN equipment_items item ON item.organization_id = unit.organization_id AND item.id = unit.item_id
                WHERE unit.holder_employee_id = ? AND unit.status = 'ASSIGNED' ORDER BY item.name, unit.serial
                """, resultSet -> {
            var entry = serials.computeIfAbsent(resultSet.getObject(1, UUID.class), k -> {
                try {
                    return new Object[] {resultSet.getString(2), resultSet.getString(3), resultSet.getString(4), new ArrayList<String>()};
                } catch (java.sql.SQLException exception) {
                    throw new IllegalStateException(exception);
                }
            });
            @SuppressWarnings("unchecked")
            var list = (List<String>) entry[3];
            list.add(resultSet.getString(5));
        }, employeeId);
        serials.forEach((id, entry) -> {
            @SuppressWarnings("unchecked")
            var list = (List<String>) entry[3];
            result.add(new Holding(id, (String) entry[0], (String) entry[1], (String) entry[2], list.size(), List.copyOf(list)));
        });
        return result;
    }

    @Transactional(readOnly = true)
    public List<MovementView> movements(UUID itemId, UUID employeeId, int limit) {
        OrgRole.require(OrgRole.MANAGER);
        var sql = new StringBuilder("""
                SELECT movement.id, movement.item_id, item.name, movement.kind, movement.quantity, unit.serial, movement.employee_id,
                       employee.full_name, movement.note, person.display_name, movement.occurred_at
                FROM equipment_movements movement
                JOIN equipment_items item ON item.organization_id = movement.organization_id AND item.id = movement.item_id
                LEFT JOIN equipment_units unit ON unit.organization_id = movement.organization_id AND unit.id = movement.unit_id
                LEFT JOIN employees employee ON employee.organization_id = movement.organization_id AND employee.id = movement.employee_id
                JOIN users person ON person.id = movement.user_id
                WHERE TRUE""");
        var params = new ArrayList<Object>();
        if (itemId != null) {
            sql.append(" AND movement.item_id = ?");
            params.add(itemId);
        }
        if (employeeId != null) {
            sql.append(" AND movement.employee_id = ?");
            params.add(employeeId);
        }
        sql.append(" ORDER BY movement.occurred_at DESC, movement.id DESC LIMIT ?");
        params.add(Math.clamp(limit, 1, 500));
        return jdbcTemplate.query(sql.toString(), (resultSet, rowNumber) -> new MovementView(resultSet.getObject(1, UUID.class),
                resultSet.getObject(2, UUID.class), resultSet.getString(3), resultSet.getString(4), resultSet.getInt(5),
                resultSet.getString(6), resultSet.getObject(7, UUID.class), resultSet.getString(8), resultSet.getString(9),
                resultSet.getString(10), resultSet.getObject(11, OffsetDateTime.class).toInstant()), params.toArray());
    }

    // --- auxiliares -----------------------------------------------------------------------------------------

    private ItemView item(UUID id) {
        if (id == null) {
            throw invalid("itemId", "Indique o artigo.");
        }
        return items(false).stream().filter(i -> i.id().equals(id)).findFirst().orElseThrow(EquipmentService::notFound);
    }

    private UnitView unit(UUID unitId, UUID itemId) {
        if (unitId == null) {
            throw invalid("unitId", "Indique a unidade (número de série).");
        }
        jdbcTemplate.query("SELECT 1 FROM equipment_units WHERE id = ? FOR UPDATE", resultSet -> { }, unitId);
        return units(itemId).stream().filter(u -> u.id().equals(unitId)).findFirst().orElseThrow(EquipmentService::notFound);
    }

    private void lockBalance(UUID itemId) {
        jdbcTemplate.query("SELECT 1 FROM stock_balances WHERE item_id = ? FOR UPDATE", resultSet -> { }, itemId);
    }

    private void requireEmployee(UUID employeeId) {
        if (employeeId == null || !Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM employees WHERE id = ? AND archived_at IS NULL)", Boolean.class, employeeId))) {
            throw invalid("employeeId", "Trabalhador inválido.");
        }
    }

    private void movement(UUID itemId, UUID unitId, String kind, int quantity, UUID employeeId, String note) {
        jdbcTemplate.update("""
                INSERT INTO equipment_movements (organization_id, item_id, unit_id, kind, quantity, employee_id, note, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, org(), itemId, unitId, kind, quantity, employeeId, note == null || note.isBlank() ? null : note.strip(),
                TenantContext.userId().orElseThrow());
    }

    private static int positive(Integer quantity) {
        if (quantity == null || quantity < 1 || quantity > 100000) {
            throw invalid("quantity", "Quantidade inválida.");
        }
        return quantity;
    }

    private static UUID org() {
        return TenantContext.organizationId().orElseThrow();
    }

    private static ApiException insufficient() {
        return new ApiException(HttpStatus.CONFLICT, "insufficient-stock", "Não há stock suficiente em armazém.");
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation", message)
                .with("errors", List.of(Map.of("field", field, "code", "invalid", "message", message)));
    }

    private static ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", "O artigo não foi encontrado.");
    }
}
