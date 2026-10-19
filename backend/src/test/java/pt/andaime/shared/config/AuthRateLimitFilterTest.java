package pt.andaime.shared.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class AuthRateLimitFilterTest {

    private final AuthRateLimitFilter filter =
            new AuthRateLimitFilter(3, Clock.fixed(Instant.parse("2026-10-19T10:00:10Z"), ZoneOffset.UTC));

    @Test
    void recusaAcimaDoLimitePorIpComRetryAfter() throws Exception {
        for (int attempt = 0; attempt < 3; attempt++) {
            assertThat(call("POST", "/api/auth/login", "10.0.0.1").getStatus()).isEqualTo(200);
        }
        var blocked = call("POST", "/api/auth/login", "10.0.0.1");
        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blocked.getHeader("Retry-After")).isEqualTo("50");
        assertThat(blocked.getContentAsString()).contains("rate-limited");

        assertThat(call("POST", "/api/auth/login", "10.0.0.2").getStatus())
                .as("outro IP não é afetado").isEqualTo(200);
        assertThat(call("GET", "/api/me", "10.0.0.1").getStatus())
                .as("rotas não sensíveis não são limitadas").isEqualTo(200);
    }

    private MockHttpServletResponse call(String method, String path, String ip) throws Exception {
        var request = new MockHttpServletRequest(method, path);
        request.setRemoteAddr(ip);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
