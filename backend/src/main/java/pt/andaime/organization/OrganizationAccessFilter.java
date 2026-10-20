package pt.andaime.organization;

import java.io.IOException;
import java.time.ZoneId;
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
    private final TransactionTemplate readWrite;

    OrganizationAccessFilter(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager) {
        this.jdbcTemplate = jdbcTemplate;
        this.readOnly = new TransactionTemplate(transactionManager);
        this.readOnly.setReadOnly(true);
        this.readWrite = new TransactionTemplate(transactionManager);
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
        if (access.isEmpty() && organizationId.isPresent()) {
            var grant = supportGrant(organizationId.get(), userId);
            if (grant.isPresent()) {
                support(request, response, chain, organizationId.get(), userId, grant.get());
                return;
            }
        }
        if (access.isEmpty()) {
            problem(response, 404, "not-found", "Não encontrado", "A organização não foi encontrada.");
            return;
        }
        if (!"ACTIVE".equals(access.get().organizationStatus())) {
            problem(response, 403, "organization-suspended", "Sem acesso",
                    "A organização está suspensa. Contacte o suporte.");
            return;
        }

        try (var ignored = TenantContext.open(
                organizationId.get(), userId, access.get().role(), access.get().employeeId(), access.get().zone())) {
            chain.doFilter(request, response);
        }
    }

    /**
     * Acesso de suporte: só leitura (GET/HEAD), papel de administrador para ver tudo, e cada pedido registado na
     * auditoria da empresa como ação da plataforma em nome dela.
     */
    private void support(HttpServletRequest request, HttpServletResponse response, FilterChain chain, UUID organizationId,
            UUID userId, UUID grantId) throws ServletException, IOException {
        var method = request.getMethod();
        var readOnlyRequest = "GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method);
        try (var ignored = TenantContext.open(organizationId, userId, "ADMIN")) {
            readWrite.executeWithoutResult(status -> jdbcTemplate.update("""
                    INSERT INTO audit_event (organization_id, actor_user_id, actor_role, on_behalf, action, entity_type,
                                             entity_id, changes, request_id)
                    VALUES (?, ?, 'PLATFORM_ADMIN', true, ?, 'support_access_grant', ?, jsonb_build_object('method', ?::text,
                            'path', ?::text), ?)
                    """, organizationId, userId, readOnlyRequest ? "support.viewed" : "support.blocked", grantId, method,
                    request.getRequestURI(), MDC.get("requestId")));
            if (!readOnlyRequest) {
                problem(response, 403, "support-read-only", "Sem acesso",
                        "O acesso de suporte é só de leitura.");
                return;
            }
            chain.doFilter(request, response);
        }
    }

    private Optional<UUID> supportGrant(UUID organizationId, UUID userId) {
        try (var ignored = TenantContext.openForUser(userId)) {
            return Optional.ofNullable(readOnly.execute(status -> jdbcTemplate.queryForObject(
                    "SELECT app.support_grant_active(?, ?)", UUID.class, organizationId, userId)));
        }
    }

    private Optional<Access> membership(UUID organizationId, UUID userId) {
        try (var ignored = TenantContext.openForUser(userId)) {
            return readOnly.execute(status -> jdbcTemplate.query("""
                    SELECT membership.role, membership.employee_id, organization.status, organization.default_timezone
                    FROM memberships membership
                    JOIN organizations organization ON organization.id = membership.organization_id
                    WHERE membership.organization_id = ?
                      AND membership.user_id = ?
                      AND membership.status = 'ACTIVE'
                    """, (resultSet, rowNumber) -> new Access(
                    resultSet.getString("role"), resultSet.getObject("employee_id", UUID.class),
                    resultSet.getString("status"), ZoneId.of(resultSet.getString("default_timezone"))),
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

    private record Access(String role, UUID employeeId, String organizationStatus, ZoneId zone) {
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
