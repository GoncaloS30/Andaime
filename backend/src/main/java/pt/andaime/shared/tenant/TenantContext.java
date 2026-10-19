package pt.andaime.shared.tenant;

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

    public static Scope open(UUID organizationId, UUID userId) {
        return open(organizationId, userId, null);
    }

    public static Scope open(UUID organizationId, UUID userId, String role) {
        if (organizationId == null || userId == null) {
            throw new IllegalArgumentException("O contexto de tenant exige organização e utilizador");
        }
        return push(new State(organizationId, userId, role));
    }

    public static Scope openForUser(UUID userId) {
        if (userId == null) {
            throw new IllegalArgumentException("O contexto exige um utilizador");
        }
        return push(new State(null, userId, null));
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

    private record State(UUID organizationId, UUID userId, String role) {
    }

    @FunctionalInterface
    public interface Scope extends AutoCloseable {
        @Override
        void close();
    }
}
