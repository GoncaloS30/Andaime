package pt.andaime.identity.infrastructure;

import java.io.IOException;
import java.time.Clock;
import java.time.Duration;

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
 * Duração máxima absoluta de uma sessão (por omissão 7 dias), independentemente da
 * atividade. A inatividade (8 h) é tratada pelo Spring Session.
 */
final class SessionLifetimeFilter extends OncePerRequestFilter {

    private final Duration maximum;
    private final Clock clock;

    SessionLifetimeFilter(Duration maximum, Clock clock) {
        this.maximum = maximum;
        this.clock = clock;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        var session = request.getSession(false);
        if (session != null && clock.millis() - session.getCreationTime() > maximum.toMillis()) {
            session.invalidate();
            response.setStatus(401);
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"title\":\"Sessão necessária\",\"status\":401,"
                    + "\"code\":\"session-expired\",\"detail\":\"A sessão expirou. Entre novamente.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    @Configuration(proxyBeanMethods = false)
    static class Registration {

        @Bean
        FilterRegistrationBean<SessionLifetimeFilter> sessionLifetimeFilter(
                @Value("${andaime.session.absolute-timeout:7d}") Duration maximum, Clock clock) {
            var registration = new FilterRegistrationBean<>(new SessionLifetimeFilter(maximum, clock));
            // Depois do SessionRepositoryFilter do Spring Session e antes do Spring Security.
            registration.setOrder(-150);
            registration.addUrlPatterns("/api/*");
            return registration;
        }
    }
}
