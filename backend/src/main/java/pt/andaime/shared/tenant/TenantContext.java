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

    public static Scope open(UUID organizationId, UUID userId) {
        if (organizationId == null || userId == null) {
            throw new IllegalArgumentException("O contexto de tenant exige organização e utilizador");
        }
        var previous = CURRENT.get();
        CURRENT.set(new State(organizationId, userId));
        return () -> {
            if (previous == null) {
                CURRENT.remove();
            } else {
                CURRENT.set(previous);
            }
        };
    }

    public static Scope openForUser(UUID userId) {
        if (userId == null) {
            throw new IllegalArgumentException("O contexto exige um utilizador");
        }
        var previous = CURRENT.get();
        CURRENT.set(new State(null, userId));
        return () -> {
            if (previous == null) {
                CURRENT.remove();
            } else {
                CURRENT.set(previous);
            }
        };
    }

    public static void clear() {
        CURRENT.remove();
    }

    private record State(UUID organizationId, UUID userId) {
    }

    @FunctionalInterface
    public interface Scope extends AutoCloseable {
        @Override
        void close();
    }
}
