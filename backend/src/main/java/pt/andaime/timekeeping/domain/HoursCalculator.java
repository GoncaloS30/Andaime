package pt.andaime.timekeeping.domain;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Horas normais e extraordinárias de uma semana, a partir dos registos fechados e da política laboral da empresa.
 * <ul>
 * <li>Dia de descanso ou feriado: todo o tempo é extraordinário. São feriados os da política (feriados da empresa e
 * nacionais do país da empresa) e, para cada registo, os feriados nacionais do país da obra onde foi feito.</li>
 * <li>Dia útil: normal até ao limite diário; o excesso é extraordinário.</li>
 * <li>Semana: as horas normais acima do limite semanal passam a extraordinárias, pela ordem dos dias.</li>
 * <li>Turnos noturnos: contam no dia de início ({@code START_DAY}) ou são divididos à meia-noite local
 * ({@code SPLIT_MIDNIGHT}), com a pausa repartida proporcionalmente.</li>
 * </ul>
 * Substitui os valores fixos de 8 h/9 h do protótipo ({@code weeklyMap.ts}).
 */
public final class HoursCalculator {

    private HoursCalculator() {
    }

    public record Policy(int dailyNormalMin, int weeklyNormalMin, Set<Integer> restDays, Set<LocalDate> holidays,
            String overnightAttribution) {
    }

    /**
     * Registo fechado. {@code siteHolidays}: feriados no local de trabalho (nacionais do país da obra); só contam
     * nos dias a que este registo é atribuído.
     */
    public record Entry(LocalDate workDate, Instant startedAt, Instant endedAt, ZoneId zone, int breakMin,
            Set<LocalDate> siteHolidays) {

        public Entry {
            siteHolidays = siteHolidays == null ? Set.of() : Set.copyOf(siteHolidays);
        }

        public Entry(LocalDate workDate, Instant startedAt, Instant endedAt, ZoneId zone, int breakMin) {
            this(workDate, startedAt, endedAt, zone, breakMin, Set.of());
        }
    }

    public record Day(LocalDate date, int workedMin, int normalMin, int overtimeMin, boolean restDay) {
    }

    public record Week(LocalDate weekStart, List<Day> days, int workedMin, int normalMin, int overtimeMin) {
    }

    public static Week week(LocalDate monday, List<Entry> entries, Policy policy) {
        var worked = new LinkedHashMap<LocalDate, Integer>();
        for (int i = 0; i < 7; i++) {
            worked.put(monday.plusDays(i), 0);
        }
        var siteHolidays = new HashSet<LocalDate>();
        for (var entry : entries) {
            attribute(entry, policy, worked, siteHolidays);
        }
        var days = new ArrayList<Day>();
        int weekNormal = 0;
        int totalWorked = 0;
        int totalOvertime = 0;
        for (var day : worked.entrySet()) {
            var date = day.getKey();
            var minutes = day.getValue();
            var rest = policy.restDays().contains(date.getDayOfWeek().getValue()) || policy.holidays().contains(date)
                    || siteHolidays.contains(date);
            int normal = rest ? 0 : Math.min(minutes, policy.dailyNormalMin());
            int overtime = minutes - normal;
            var room = Math.max(0, policy.weeklyNormalMin() - weekNormal);
            if (normal > room) {
                overtime += normal - room;
                normal = room;
            }
            weekNormal += normal;
            totalWorked += minutes;
            totalOvertime += overtime;
            days.add(new Day(date, minutes, normal, overtime, rest));
        }
        return new Week(monday, days, totalWorked, weekNormal, totalOvertime);
    }

    /** Minutos trabalhados de um registo (duração menos pausa, nunca negativo). */
    public static int workedMin(Instant start, Instant end, int breakMin) {
        return (int) Math.max(0, Duration.between(start, end).toMinutes() - breakMin);
    }

    private static void attribute(Entry entry, Policy policy, Map<LocalDate, Integer> worked, Set<LocalDate> siteHolidays) {
        var total = workedMin(entry.startedAt(), entry.endedAt(), entry.breakMin());
        if (!"SPLIT_MIDNIGHT".equals(policy.overnightAttribution())) {
            worked.computeIfPresent(entry.workDate(), (d, m) -> m + total);
            if (entry.siteHolidays().contains(entry.workDate())) {
                siteHolidays.add(entry.workDate());
            }
            return;
        }
        // Divide pelos dias locais; a pausa é repartida pela proporção de tempo em cada dia.
        var duration = Duration.between(entry.startedAt(), entry.endedAt()).toMinutes();
        var segments = new ArrayList<Map.Entry<LocalDate, Long>>();
        var cursor = entry.startedAt();
        while (cursor.isBefore(entry.endedAt())) {
            var localDate = cursor.atZone(entry.zone()).toLocalDate();
            var midnight = localDate.plusDays(1).atStartOfDay(entry.zone()).toInstant();
            var segmentEnd = midnight.isBefore(entry.endedAt()) ? midnight : entry.endedAt();
            segments.add(Map.entry(localDate, Duration.between(cursor, segmentEnd).toMinutes()));
            cursor = segmentEnd;
        }
        int assigned = 0;
        segments.sort(Comparator.comparing(Map.Entry::getKey));
        for (int i = 0; i < segments.size(); i++) {
            var segment = segments.get(i);
            int share = i == segments.size() - 1 ? total - assigned
                    : (int) Math.round(total * (double) segment.getValue() / Math.max(1, duration));
            assigned += share;
            worked.computeIfPresent(segment.getKey(), (d, m) -> m + share);
            if (entry.siteHolidays().contains(segment.getKey())) {
                siteHolidays.add(segment.getKey());
            }
        }
    }
}
