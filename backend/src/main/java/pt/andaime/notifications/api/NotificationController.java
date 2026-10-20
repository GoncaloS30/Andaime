package pt.andaime.notifications.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import pt.andaime.notifications.application.NotificationService;
import pt.andaime.notifications.application.NotificationService.Inbox;
import pt.andaime.notifications.application.NotificationService.Preferences;

@RestController
@RequestMapping("/api/orgs/{orgId}/notifications")
public class NotificationController {

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    Inbox inbox(@PathVariable UUID orgId, @RequestParam(defaultValue = "30") int limit) {
        return notifications.inbox(limit);
    }

    @PostMapping("/read")
    Inbox read(@PathVariable UUID orgId, @RequestBody(required = false) ReadRequest request) {
        return notifications.markRead(request == null ? List.of() : request.ids());
    }

    @GetMapping("/preferences")
    Preferences preferences(@PathVariable UUID orgId) {
        return notifications.preferences();
    }

    @PutMapping("/preferences")
    Preferences updatePreferences(@PathVariable UUID orgId, @RequestBody Preferences preferences) {
        return notifications.updatePreferences(preferences);
    }

    /** Sinal em tempo real ("há novidades"); o cliente tem também consulta periódica de reserva. */
    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream(@PathVariable UUID orgId) {
        return notifications.subscribe();
    }

    record ReadRequest(List<UUID> ids) {
    }
}
