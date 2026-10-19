package pt.andaime.shared.api;

import java.time.Duration;

import org.springframework.http.HttpStatus;

public final class RateLimitedException extends ApiException {

    private final Duration retryAfter;

    public RateLimitedException(Duration retryAfter) {
        super(HttpStatus.TOO_MANY_REQUESTS, "rate-limited", "Demasiadas tentativas. Tente novamente mais tarde.");
        this.retryAfter = retryAfter;
    }

    public Duration retryAfter() {
        return retryAfter;
    }
}
