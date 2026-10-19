package pt.andaime.organization;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.slf4j.MDC;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import pt.andaime.identity.UserPrincipal;
import pt.andaime.shared.tenant.TenantContext;

/**
 * Porta de entrada de todos os recursos de empresa ({@code /api/orgs/{orgId}/...}).
 * A organização vem do URL e é validada contra uma membership ativa em cada pedido;
 * quem não é membro recebe 404, sem revelar que a organização existe.
 * Corre depois do Spring Security (ordem 0 &gt; -100), com o utilizador já autenticado.
 */
public final class OrganizationAccessFilter extends OncePerRequestFilter {

    private static final Pattern ORG_PATH = Pattern.compile("^/api/orgs/([^/]+)(?:/.*)?$");

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate readOnly;

    OrganizationAccessFilter(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager) {
        this.jdbcTemplate = jdbcTemplate;
        this.readOnly = new TransactionTemplate(transactionManager);
        this.readOnly.setReadOnly(true);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        var principal = currentPrincipal();
        if (principal.isEmpty()) {
            chain.doFilter(request, response);
            return;
        }

        var userId = principal.get().id();
        var matcher = ORG_PATH.matcher(request.getRequestURI());
        if (!matcher.matches()) {
            try (var ignored = TenantContext.openForUser(userId)) {
                chain.doFilter(request, response);
            }
            return;
        }

        var organizationId = parse(matcher.group(1));
        var access = organizationId.flatMap(id -> membership(id, userId));
        if (access.isEmpty()) {
            problem(response, 404, "not-found", "Não encontrado", "A organização não foi encontrada.");
            return;
        }
        if (!"ACTIVE".equals(access.get().organizationStatus())) {
            problem(response, 403, "organization-suspended", "Sem acesso",
                    "A organização está suspensa. Contacte o suporte.");
            return;
        }

        try (var ignored = TenantContext.open(organizationId.get(), userId, access.get().role())) {
            chain.doFilter(request, response);
        }
    }

    private Optional<Access> membership(UUID organizationId, UUID userId) {
        try (var ignored = TenantContext.openForUser(userId)) {
            return readOnly.execute(status -> jdbcTemplate.query("""
                    SELECT membership.role, organization.status
                    FROM memberships membership
                    JOIN organizations organization ON organization.id = membership.organization_id
                    WHERE membership.organization_id = ?
                      AND membership.user_id = ?
                      AND membership.status = 'ACTIVE'
                    """, (resultSet, rowNumber) -> new Access(
                    resultSet.getString("role"), resultSet.getString("status")),
                    organizationId, userId).stream().findFirst());
        }
    }

    private static Optional<UserPrincipal> currentPrincipal() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof UserPrincipal principal) {
            return Optional.of(principal);
        }
        return Optional.empty();
    }

    private static Optional<UUID> parse(String value) {
        try {
            return Optional.of(UUID.fromString(value));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    private static void problem(HttpServletResponse response, int status, String code, String title, String detail)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        var requestId = MDC.get("requestId");
        response.getWriter().write("{\"type\":\"https://andaime.app/problems/" + code + "\",\"title\":\"" + title
                + "\",\"status\":" + status + ",\"code\":\"" + code + "\",\"detail\":\"" + detail + "\""
                + (requestId == null ? "" : ",\"requestId\":\"" + requestId + "\"") + "}");
    }

    private record Access(String role, String organizationStatus) {
    }

    @Configuration(proxyBeanMethods = false)
    static class Registration {

        @Bean
        FilterRegistrationBean<OrganizationAccessFilter> organizationAccessFilter(
                JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager) {
            var registration = new FilterRegistrationBean<>(
                    new OrganizationAccessFilter(jdbcTemplate, transactionManager));
            registration.setOrder(0);
            registration.addUrlPatterns("/api/*");
            return registration;
        }
    }
}
