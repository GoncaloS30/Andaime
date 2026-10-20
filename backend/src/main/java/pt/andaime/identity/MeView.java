package pt.andaime.identity;

import java.util.List;
import java.util.UUID;

public record MeView(
        UserView user,
        List<MembershipView> memberships,
        UUID activeOrgId,
        boolean platformAdmin,
        boolean twoFactorEnabled,
        /*
         * Alguma empresa onde é OWNER/ADMIN exige verificação em dois passos e esta conta não a
         * tem ativa. O login continua a funcionar; o frontend mostra um aviso persistente que
         * encaminha para a configuração (a política não bloqueia a API).
         */
        boolean twoFactorSetupRequired) {

    public record UserView(UUID id, String email, String displayName, String locale) {
    }

    /** {@code supportUntil} preenchido = acesso de suporte temporário (só leitura), não uma membership. */
    public record MembershipView(UUID id, UUID orgId, String orgName, String role, java.time.Instant supportUntil) {
    }
}
