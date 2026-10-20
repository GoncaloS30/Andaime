package pt.andaime.absences.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Dias úteis de uma ausência contados só dentro de um ano civil (uma passagem de ano reparte-se pelos dois anos).
 * <p>
 * Um dia é útil quando não é dia de descanso da política laboral em vigor nesse dia nem feriado (da empresa ou
 * nacional). É mais correto do que o protótipo V3.1 ({@code workdaysInYear}), que só descontava sábados e domingos.
 * Um feriado que calha num dia de descanso não desconta duas vezes.
 */
public final class WorkingDays {

    /** Dias de descanso por omissão quando nenhuma política cobre a data (sábado e domingo, ISO 6 e 7). */
    public static final Set<Integer> DEFAULT_REST_DAYS = Set.of(6, 7);

    private WorkingDays() {
    }

    /**
     * Dias de descanso (ISO 1 = segunda … 7 = domingo) em vigor de {@code from} (inclusive, nulo = desde sempre) até
     * {@code until} (exclusive, nulo = sem fim), como em {@code labor_policies.effective_during}.
     */
    public record RestRule(LocalDate from, LocalDate until, Set<Integer> restDays) {

        boolean covers(LocalDate date) {
            return (from == null || !date.isBefore(from)) && (until == null || date.isBefore(until));
        }
    }

    /** Calendário de trabalho: regras de descanso por período e feriados (da empresa e nacionais). */
    public record Calendar(List<RestRule> rules, Set<LocalDate> holidays) {

        public Calendar {
            rules = List.copyOf(rules);
            holidays = Set.copyOf(holidays);
        }

        public boolean isWorkingDay(LocalDate date) {
            if (holidays.contains(date)) {
                return false;
            }
            var rest = rules.stream().filter(rule -> rule.covers(date)).map(RestRule::restDays).findFirst()
                    .orElse(DEFAULT_REST_DAYS);
            return !rest.contains(date.getDayOfWeek().getValue());
        }
    }

    /** Período recortado ao ano. */
    public record Period(LocalDate start, LocalDate end) {
    }

    /** O período {@code [start, end]} recortado ao ano; vazio quando não toca o ano. */
    public static Optional<Period> clip(LocalDate start, LocalDate end, int year) {
        var first = LocalDate.of(year, 1, 1);
        var last = LocalDate.of(year, 12, 31);
        if (start == null || end == null || end.isBefore(start) || end.isBefore(first) || start.isAfter(last)) {
            return Optional.empty();
        }
        return Optional.of(new Period(start.isBefore(first) ? first : start, end.isAfter(last) ? last : end));
    }

    /** Dias úteis de {@code [start, end]} que caem dentro do ano. */
    public static int inYear(LocalDate start, LocalDate end, int year, Calendar calendar) {
        return clip(start, end, year).map(period -> {
            var days = 0;
            for (var day = period.start(); !day.isAfter(period.end()); day = day.plusDays(1)) {
                if (calendar.isWorkingDay(day)) {
                    days++;
                }
            }
            return days;
        }).orElse(0);
    }
}
