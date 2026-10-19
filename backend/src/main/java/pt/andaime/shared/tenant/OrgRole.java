package pt.andaime.shared.tenant;

import org.springframework.http.HttpStatus;

import pt.andaime.shared.api.ApiException;

/**
 * Papéis de uma membership, do mais forte para o mais fraco. A verificação é feita
 * sempre no backend, a partir do papel resolvido pelo filtro de organização.
 */
public enum OrgRole {
    OWNER, ADMIN, MANAGER, FOREMAN, WORKER;

    public boolean atLeast(OrgRole minimum) {
        return ordinal() <= minimum.ordinal();
    }

    public boolean isPrivileged() {
        return this == OWNER || this == ADMIN;
    }

    /** Papel corrente; falha fechado se o pedido não passou pelo filtro de organização. */
    public static OrgRole current() {
        return TenantContext.role()
                .map(OrgRole::valueOf)
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Sem acesso."));
    }

    /** Exige pelo menos o papel indicado na organização corrente. */
    public static OrgRole require(OrgRole minimum) {
        var current = current();
        if (!current.atLeast(minimum)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden", "Não tem permissão para esta operação.");
        }
        return current;
    }
}
