package pt.andaime.notifications.application;

import java.io.IOException;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Ligações SSE abertas nesta instância, por empresa e utilizador. Só enviam um sinal ("há novidades");
 * o cliente volta a pedir a lista pela API normal, com as mesmas regras de acesso. Com várias instâncias,
 * quem estiver ligado a outra instância recebe as novidades pela consulta periódica de reserva.
 */
@Component
public class NotificationStream {

    static final Duration TIMEOUT = Duration.ofMinutes(30);
    /** Ligações abertas por utilizador (separadores); as mais antigas fecham primeiro. */
    static final int MAX_PER_USER = 5;

    private final Map<String, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    SseEmitter open(UUID organizationId, UUID userId) {
        var key = organizationId + ":" + userId;
        var emitter = new SseEmitter(TIMEOUT.toMillis());
        var list = emitters.computeIfAbsent(key, k -> new CopyOnWriteArrayList<>());
        while (list.size() >= MAX_PER_USER) {
            list.removeFirst().complete();
        }
        list.add(emitter);
        Runnable remove = () -> list.remove(emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(error -> remove.run());
        send(emitter, "ready");
        return emitter;
    }

    public void changed(UUID organizationId, Collection<UUID> userIds) {
        for (var userId : userIds) {
            var list = emitters.get(organizationId + ":" + userId);
            if (list != null) {
                list.forEach(emitter -> send(emitter, "changed"));
            }
        }
    }

    private static void send(SseEmitter emitter, String name) {
        try {
            emitter.send(SseEmitter.event().name(name).data("{}"));
        } catch (IOException | IllegalStateException exception) {
            emitter.completeWithError(exception);
        }
    }
}
