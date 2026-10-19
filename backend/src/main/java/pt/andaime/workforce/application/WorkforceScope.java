package pt.andaime.workforce.application;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Âmbito de visibilidade por papel (ABAC), sempre calculado no servidor:
 * <ul>
 * <li>gestor e acima: toda a organização;</li>
 * <li>encarregado: ele próprio e os membros atuais das equipas de que é responsável;</li>
 * <li>trabalhador: só a sua ficha.</li>
 * </ul>
 * Sem ficha ligada à conta, encarregados e trabalhadores não vêem trabalhadores.
 */
final class WorkforceScope {

    private WorkforceScope() {
    }

    record Filter(String sql, List<Object> params) {
    }

    static boolean seesAll() {
        return OrgRole.current().atLeast(OrgRole.MANAGER);
    }

    /** Condição SQL sobre {@code alias.id} (trabalhador) que aplica o âmbito do utilizador corrente. */
    static Filter employees(String alias, LocalDate today) {
        if (seesAll()) {
            return new Filter("TRUE", List.of());
        }
        var me = TenantContext.employeeId().orElse(null);
        if (me == null) {
            return new Filter("FALSE", List.of());
        }
        if (OrgRole.current() == OrgRole.WORKER) {
            return new Filter(alias + ".id = ?", List.of(me));
        }
        return new Filter("(" + alias + ".id = ? OR " + alias + ".id IN ("
                + "SELECT member.employee_id FROM team_members member "
                + "JOIN teams led ON led.organization_id = member.organization_id AND led.id = member.team_id "
                + "WHERE led.foreman_employee_id = ? AND led.archived_at IS NULL "
                + "AND member.joined_on <= ? AND (member.left_on IS NULL OR member.left_on >= ?)))",
                List.of(me, me, today, today));
    }

    /** Condição SQL sobre {@code alias.foreman_employee_id} para equipas visíveis. */
    static Filter teams(String alias) {
        if (seesAll()) {
            return new Filter("TRUE", List.of());
        }
        var me = TenantContext.employeeId().orElse(null);
        if (me == null || OrgRole.current() == OrgRole.WORKER) {
            return new Filter("FALSE", List.of());
        }
        return new Filter(alias + ".foreman_employee_id = ?", List.<Object>of(me));
    }

    static UUID currentEmployee() {
        return TenantContext.employeeId().orElse(null);
    }
}
