package pt.andaime.shared.config;

import java.io.IOException;
import java.time.Clock;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Limite por IP nos endpoints públicos sensíveis (janela fixa de um minuto, em memória).
 * Complementa o bloqueio por email do login. Com várias instâncias, cada uma aplica o seu
 * limite; um armazenamento partilhado fica para quando houver mais de uma instância.
 */
final class AuthRateLimitFilter extends OncePerRequestFilter {

    private static final Set<String> LIMITED = Set.of(
            "/api/auth/signup", "/api/auth/login", "/api/auth/verify-email",
            "/api/auth/password/forgot", "/api/auth/password/reset");

    private final int perMinute;
    private final Clock clock;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    AuthRateLimitFilter(int perMinute, Clock clock) {
        this.perMinute = perMinute;
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        var path = request.getRequestURI();
        return !"POST".equals(request.getMethod())
                || !(LIMITED.contains(path) || path.startsWith("/api/invitations/"));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        var minute = clock.millis() / 60_000;
        var window = windows.compute(request.getRemoteAddr(), (ip, current) ->
                current == null || current.minute() != minute ? new Window(minute, 1) : current.increment());
        if (windows.size() > 10_000) {
            windows.entrySet().removeIf(entry -> entry.getValue().minute() != minute);
        }
        if (window.count() > perMinute) {
            var retryAfter = 60 - (clock.millis() / 1000) % 60;
            response.setStatus(429);
            response.setHeader("Retry-After", Long.toString(retryAfter));
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"title\":\"Demasiados pedidos\",\"status\":429,"
                    + "\"code\":\"rate-limited\",\"detail\":\"Demasiadas tentativas. Tente novamente mais tarde.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private record Window(long minute, int count) {
        Window increment() {
            return new Window(minute, count + 1);
        }
    }

    @Configuration(proxyBeanMethods = false)
    static class Registration {

        @Bean
        FilterRegistrationBean<AuthRateLimitFilter> authRateLimitFilter(
                @Value("${andaime.rate-limit.auth-per-minute:30}") int perMinute, Clock clock) {
            var registration = new FilterRegistrationBean<>(new AuthRateLimitFilter(perMinute, clock));
            // Antes do Spring Security (-100): pedidos em excesso nem chegam a ser processados.
            registration.setOrder(-200);
            registration.addUrlPatterns("/api/*");
            return registration;
        }
    }
}
