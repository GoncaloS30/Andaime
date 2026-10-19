package pt.andaime.identity.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.stereotype.Service;

import pt.andaime.identity.SessionView;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.shared.api.ApiException;

@Service
public class SessionService {

    private final FindByIndexNameSessionRepository<? extends Session> sessions;

    public SessionService(FindByIndexNameSessionRepository<? extends Session> sessions) {
        this.sessions = sessions;
    }

    public List<SessionView> list(UserPrincipal principal, String currentSessionId) {
        return sessions.findByPrincipalName(principal.email()).values().stream()
                .filter(session -> !session.isExpired())
                .map(session -> new SessionView(
                        opaqueId(session.getId()),
                        session.getCreationTime(),
                        session.getLastAccessedTime(),
                        session.getLastAccessedTime().plus(session.getMaxInactiveInterval()),
                        session.getId().equals(currentSessionId)))
                .sorted(Comparator.comparing(SessionView::lastAccessedAt).reversed())
                .toList();
    }

    public boolean delete(UserPrincipal principal, String opaqueSessionId, String currentSessionId) {
        var session = sessions.findByPrincipalName(principal.email()).values().stream()
                .filter(candidate -> MessageDigest.isEqual(
                        opaqueId(candidate.getId()).getBytes(StandardCharsets.US_ASCII),
                        opaqueSessionId.getBytes(StandardCharsets.US_ASCII)))
                .findFirst()
                .orElseThrow(() -> new ApiException(
                        HttpStatus.NOT_FOUND, "not-found", "A sessão não foi encontrada."));
        if (session.getId().equals(currentSessionId)) {
            return true;
        }
        sessions.deleteById(session.getId());
        return false;
    }

    private String opaqueId(String sessionId) {
        try {
            var digest = MessageDigest.getInstance("SHA-256")
                    .digest(sessionId.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 indisponível", exception);
        }
    }
}
