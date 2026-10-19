package pt.andaime.shared.tenant;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;

/**
 * Contexto do pedido corrente. Um contexto ausente nunca significa acesso global.
 */
public final class TenantContext {

    private static final ThreadLocal<State> CURRENT = new ThreadLocal<>();

    private TenantContext() {
    }

    public static Optional<UUID> organizationId() {
        return Optional.ofNullable(CURRENT.get()).map(State::organizationId);
    }

    public static Optional<UUID> userId() {
        return Optional.ofNullable(CURRENT.get()).map(State::userId);
    }

    /** Papel da membership na organização corrente (OWNER, ADMIN, MANAGER, FOREMAN, WORKER). */
    public static Optional<String> role() {
        return Optional.ofNullable(CURRENT.get()).map(State::role);
    }

    /** Ficha de trabalhador ligada à conta na organização corrente (âmbito de encarregado e trabalhador). */
    public static Optional<UUID> employeeId() {
        return Optional.ofNullable(CURRENT.get()).map(State::employeeId);
    }

    /** Fuso por omissão da organização corrente (Europe/Lisbon se desconhecido). */
    public static ZoneId zone() {
        return Optional.ofNullable(CURRENT.get()).map(State::zone).orElse(ZoneId.of("Europe/Lisbon"));
    }

    /** "Hoje" no fuso da organização, não no do servidor. */
    public static LocalDate today(Clock clock) {
        return LocalDate.now(clock.withZone(zone()));
    }

    public static Scope open(UUID organizationId, UUID userId) {
        return open(organizationId, userId, null, null);
    }

    public static Scope open(UUID organizationId, UUID userId, String role) {
        return open(organizationId, userId, role, null);
    }

    public static Scope open(UUID organizationId, UUID userId, String role, UUID employeeId) {
        return open(organizationId, userId, role, employeeId, null);
    }

    public static Scope open(UUID organizationId, UUID userId, String role, UUID employeeId, ZoneId zone) {
        if (organizationId == null || userId == null) {
            throw new IllegalArgumentException("O contexto de tenant exige organização e utilizador");
        }
        return push(new State(organizationId, userId, role, employeeId, zone));
    }

    public static Scope openForUser(UUID userId) {
        if (userId == null) {
            throw new IllegalArgumentException("O contexto exige um utilizador");
        }
        return push(new State(null, userId, null, null, null));
    }

    public static void clear() {
        CURRENT.remove();
    }

    private static Scope push(State state) {
        var previous = CURRENT.get();
        CURRENT.set(state);
        return () -> {
            if (previous == null) {
                CURRENT.remove();
            } else {
                CURRENT.set(previous);
            }
        };
    }

    private record State(UUID organizationId, UUID userId, String role, UUID employeeId, ZoneId zone) {
    }

    @FunctionalInterface
    public interface Scope extends AutoCloseable {
        @Override
        void close();
    }
}
