package pt.andaime.workforce.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Contratos da API de trabalhadores e equipas. Nunca expõem linhas da base de dados diretamente. */
public final class WorkforceViews {

    private WorkforceViews() {
    }

    public record TeamRef(UUID id, String name, String color) {
    }

    public record EmployeeSummary(
            UUID id,
            String number,
            String fullName,
            String category,
            String status,
            boolean archived,
            TeamRef team) {
    }

    public record LinkedAccount(UUID membershipId, String displayName, String role) {
    }

    /**
     * Ficha completa. Para encarregados ({@code restricted = true}) os dados pessoais e de custo
     * vêm a {@code null}: só vêem o necessário para coordenar a equipa.
     */
    public record EmployeeDetail(
            UUID id,
            String number,
            String fullName,
            String category,
            String status,
            String phone,
            String email,
            String nationality,
            String homeCity,
            LocalDate hireDate,
            int dailyCapacityMin,
            BigDecimal hourlyCost,
            List<String> skills,
            Map<String, String> sizes,
            String notes,
            Instant archivedAt,
            TeamRef team,
            LinkedAccount account,
            boolean restricted,
            int version) {
    }

    public record EmployeeInput(
            String number,
            String fullName,
            String category,
            String phone,
            String email,
            String nationality,
            String homeCity,
            LocalDate hireDate,
            String status,
            Integer dailyCapacityMin,
            BigDecimal hourlyCost,
            List<String> skills,
            Map<String, String> sizes,
            String notes) {
    }

    public record ContractView(
            UUID id,
            String kind,
            LocalDate startDate,
            LocalDate endDate,
            Integer weeklyMin,
            String notes,
            Instant createdAt) {
    }

    public record TeamPeriod(UUID id, UUID teamId, String teamName, String teamColor, LocalDate joinedOn, LocalDate leftOn) {
    }

    public record MemberRow(
            UUID employeeId,
            String number,
            String fullName,
            String category,
            String status,
            LocalDate joinedOn,
            LocalDate leftOn) {
    }

    public record TeamSummary(
            UUID id,
            String name,
            String color,
            UUID foremanEmployeeId,
            String foremanName,
            int memberCount,
            List<String> memberNames,
            VehicleRef vehicle,
            boolean archived,
            int version) {
    }

    /** Viatura atual da equipa (ligação válida hoje). */
    public record VehicleRef(UUID id, String plate) {
    }

    public record TeamDetail(
            UUID id,
            String name,
            String color,
            UUID foremanEmployeeId,
            String foremanName,
            boolean archived,
            VehicleRef vehicle,
            List<MemberRow> members,
            List<MemberRow> history,
            int version) {
    }
}
