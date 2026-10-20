package pt.andaime.sites.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import pt.andaime.sites.domain.SiteMetrics;

/** Contratos da API de clientes, obras e ocorrências. */
public final class SiteViews {

    private SiteViews() {
    }

    public record Ref(UUID id, String name) {
    }

    public record ClientView(
            UUID id,
            String name,
            String taxId,
            String contactName,
            String email,
            String phone,
            String country,
            int activeSites,
            boolean archived,
            int version) {
    }

    public record ClientInput(String name, String taxId, String contactName, String email, String phone, String country) {
    }

    public record SiteSummary(
            UUID id,
            String code,
            String name,
            String status,
            String country,
            String city,
            BigDecimal latitude,
            BigDecimal longitude,
            String color,
            LocalDate startDate,
            LocalDate endDate,
            LocalDate contractEndDate,
            int delayWorkdays,
            Ref client,
            Ref foreman,
            int openIssues,
            boolean archived,
            SiteMetrics metrics,
            String photoUrl) {
    }

    public record SiteDetail(
            UUID id,
            String code,
            String name,
            String status,
            String country,
            String city,
            String address,
            BigDecimal latitude,
            BigDecimal longitude,
            String timezone,
            String color,
            LocalDate startDate,
            LocalDate endDate,
            LocalDate contractEndDate,
            int delayWorkdays,
            Integer hourLimitMin,
            int baselineRealizedMin,
            int baselineApprovedMin,
            String description,
            String erpOrder,
            Ref client,
            Ref director,
            Ref foreman,
            int openIssues,
            Instant archivedAt,
            SiteMetrics metrics,
            String photoUrl,
            int version) {
    }

    public record SiteInput(
            String code,
            String name,
            UUID clientId,
            String country,
            String city,
            String address,
            BigDecimal latitude,
            BigDecimal longitude,
            String timezone,
            String status,
            LocalDate startDate,
            LocalDate endDate,
            LocalDate contractEndDate,
            Integer hourLimitMin,
            Integer baselineRealizedMin,
            Integer baselineApprovedMin,
            UUID directorUserId,
            UUID foremanEmployeeId,
            String color,
            String description,
            String erpOrder) {
    }

    public record IssueView(
            UUID id,
            UUID siteId,
            String siteCode,
            String siteName,
            String category,
            String description,
            String status,
            String reportedBy,
            Instant reportedAt,
            String resolvedBy,
            Instant resolvedAt,
            String resolutionNote,
            int version) {
    }
}
