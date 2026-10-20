package pt.andaime.shared.config;

import java.time.Clock;

import jakarta.servlet.DispatcherType;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.header.writers.CrossOriginResourcePolicyHeaderWriter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

@Configuration(proxyBeanMethods = false)
class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            SecurityContextRepository securityContextRepository,
            @Value("${management.server.port:-1}") int managementPort,
            @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookies) throws Exception {
        // O SPA lê o token do cookie (por isso não é HttpOnly) e devolve-o no cabeçalho X-XSRF-TOKEN.
        var csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfTokens.setCookieCustomizer(cookie -> cookie.sameSite("Lax").secure(secureCookies));
        return http
                .csrf(csrf -> csrf.spa().csrfTokenRepository(csrfTokens))
                .authorizeHttpRequests(authorize -> authorize
                        // Erros do servlet (ex.: multipart mal formado) chegam ao tratamento de erros em JSON.
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers("/actuator/health/**").permitAll()
                        // Métricas e restantes endpoints de gestão nunca pela porta pública: em produção ficam
                        // numa porta de gestão interna (management.server.port), não exposta pelo proxy.
                        .requestMatchers(request -> request.getRequestURI().startsWith("/actuator/")
                                && request.getLocalPort() == managementPort).permitAll()
                        .requestMatchers("/actuator/**").denyAll()
                        .requestMatchers("/api/docs/**").permitAll()
                        .requestMatchers("/api/auth/csrf", "/api/auth/signup",
                                "/api/auth/verify-email", "/api/auth/login", "/api/auth/login/2fa",
                                "/api/auth/password/forgot", "/api/auth/password/reset").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/invitations/*").permitAll()
                        .anyRequest().authenticated())
                .securityContext(context -> context
                        .securityContextRepository(securityContextRepository)
                        .requireExplicitSave(true))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, exception) -> {
                            response.setStatus(401);
                            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                            response.getWriter().write("{\"title\":\"Sessão necessária\","
                                    + "\"status\":401,\"code\":\"unauthenticated\"}");
                        })
                        .accessDeniedHandler((request, response, exception) -> {
                            var code = exception instanceof CsrfException ? "csrf" : "forbidden";
                            response.setStatus(403);
                            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
                            response.setCharacterEncoding("UTF-8");
                            response.getWriter().write("{\"title\":\"Sem acesso\",\"status\":403,"
                                    + "\"code\":\"" + code + "\"}");
                        }))
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))
                        .referrerPolicy(referrer -> referrer
                                .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        .crossOriginResourcePolicy(policy -> policy
                                .policy(CrossOriginResourcePolicyHeaderWriter.CrossOriginResourcePolicy.SAME_ORIGIN)))
                .build();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    }

    @Bean
    AuthenticationManager authenticationManager(
            UserDetailsService userDetailsService,
            PasswordEncoder passwordEncoder) {
        var provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return new ProviderManager(provider);
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    CookieSerializer cookieSerializer(
            @Value("${server.servlet.session.cookie.secure:false}") boolean secure) {
        var serializer = new DefaultCookieSerializer();
        serializer.setCookieName("ANDAIME_SESSION");
        serializer.setCookiePath("/");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setUseSecureCookie(secure);
        serializer.setSameSite("Lax");
        return serializer;
    }
}
