package pt.andaime.lodging.domain;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/**
 * Dormidas: nesta semana, quem não vai dormir a casa? A resposta começa na escala (quem está em que obra e em que dias)
 * e acaba numa escolha de quem manda. A aplicação propõe; não decide por ninguém. Porta de {@code stays.ts} do
 * protótipo V3.1, com os mesmos testes.
 */
public final class StayRules {

    /** Limite para sugerir "longe de casa". É só uma sugestão: quem marca é que decide. */
    public static final double FAR_KM = 100;

    private static final double EARTH_RADIUS_KM = 6371;

    private StayRules() {
    }

    public enum Away {
        FAR, NEAR, UNKNOWN;

        /** Ordem do quadro: primeiro quem está longe, depois quem não se sabe, por fim quem está perto. */
        public int rank() {
            return switch (this) {
                case FAR -> 0;
                case UNKNOWN -> 1;
                case NEAR -> 2;
            };
        }
    }

    public record Dates(LocalDate checkIn, LocalDate checkOut) {
    }

    /** Coordenadas em graus decimais. */
    public record Point(double latitude, double longitude) {
    }

    /** Um dia de escala de uma pessoa numa obra. */
    public record WorkDay(UUID employeeId, UUID siteId, LocalDate date) {
    }

    /** Um dia de ausência aprovada (de dia inteiro) de uma pessoa. */
    public record AbsentDay(UUID employeeId, LocalDate date) {
    }

    /** Estadia marcada, só com o que as regras precisam. */
    public record StayFact(UUID id, UUID employeeId, UUID siteId, UUID hotelId, LocalDate checkIn, LocalDate checkOut) {
    }

    /** Uma linha do quadro: pessoa × obra, com os dias em que lá está mesmo e a estadia marcada (se houver). */
    public record Line(UUID employeeId, UUID siteId, List<LocalDate> days, Dates proposed, StayFact stay) {
    }

    public record Summary(int peopleAway, int nights, int undefinedHotel, List<StayFact> withoutSchedule) {
    }

    /** Entrar segunda e sair sexta são quatro noites: conta-se de uma data à outra, não os dias tocados. */
    public static int nights(LocalDate checkIn, LocalDate checkOut) {
        return (int) Math.max(0, ChronoUnit.DAYS.between(checkIn, checkOut));
    }

    /** Entra na noite do primeiro dia de trabalho e sai na manhã do último; quem só lá vai um dia leva uma noite. */
    public static Dates proposedDates(LocalDate first, LocalDate last) {
        return new Dates(first, last.equals(first) ? first.plusDays(1) : last);
    }

    /** Distância em linha reta (haversine), em km. */
    public static double distanceKm(Point a, Point b) {
        var dLat = Math.toRadians(b.latitude() - a.latitude());
        var dLng = Math.toRadians(b.longitude() - a.longitude());
        var h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(a.latitude())) * Math.cos(Math.toRadians(b.latitude())) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
    }

    /**
     * Longe de casa: obra noutro país (face ao país da empresa) chega; senão, mais de {@link #FAR_KM} km entre a residência
     * e a obra. Sem coordenadas da residência (ou da obra) não há sugestão.
     */
    public static Away away(String homeCountry, String siteCountry, Point home, Point site) {
        if (homeCountry != null && siteCountry != null && !homeCountry.equalsIgnoreCase(siteCountry)) {
            return Away.FAR;
        }
        if (home == null || site == null) {
            return Away.UNKNOWN;
        }
        return distanceKm(home, site) > FAR_KM ? Away.FAR : Away.NEAR;
    }

    /**
     * O quadro da semana: uma linha por pessoa e obra escalada (dias de ausência aprovada não contam), ligada à estadia
     * marcada dessa pessoa nessa obra. Linhas sem nenhum dia real desaparecem. A ordem é a de chegada; quem chama ordena.
     */
    public static List<Line> board(Collection<WorkDay> workDays, Collection<AbsentDay> absences, Collection<StayFact> stays) {
        var absent = new HashSet<>(absences);
        var groups = new LinkedHashMap<List<UUID>, TreeSet<LocalDate>>();
        for (var day : workDays) {
            if (absent.contains(new AbsentDay(day.employeeId(), day.date()))) {
                continue;
            }
            groups.computeIfAbsent(List.of(day.employeeId(), day.siteId()), key -> new TreeSet<>()).add(day.date());
        }
        var byKey = new LinkedHashMap<List<UUID>, StayFact>();
        for (var stay : stays) {
            byKey.putIfAbsent(List.of(stay.employeeId(), stay.siteId()), stay);
        }
        var lines = new ArrayList<Line>();
        for (Map.Entry<List<UUID>, TreeSet<LocalDate>> group : groups.entrySet()) {
            var days = List.copyOf(group.getValue());
            lines.add(new Line(group.getKey().get(0), group.getKey().get(1), days,
                    proposedDates(days.getFirst(), days.getLast()), byKey.get(group.getKey())));
        }
        return lines;
    }

    /**
     * Resumo: pessoas da escala com estadia marcada, noites marcadas, estadias com o hotel por definir e estadias sem
     * escala por trás (a linha foi apagada ou a pessoa mudou de obra). Estas não se apagam sozinhas.
     */
    public static Summary summary(List<Line> board, Collection<StayFact> stays) {
        Set<UUID> matched = new HashSet<>();
        Set<UUID> people = new HashSet<>();
        for (var line : board) {
            if (line.stay() != null) {
                matched.add(line.stay().id());
                people.add(line.employeeId());
            }
        }
        var nights = stays.stream().mapToInt(stay -> nights(stay.checkIn(), stay.checkOut())).sum();
        var undefined = (int) stays.stream().filter(stay -> stay.hotelId() == null).count();
        var orphans = stays.stream().filter(stay -> !matched.contains(stay.id()))
                .sorted((a, b) -> a.checkIn().compareTo(b.checkIn()))
                .toList();
        return new Summary(people.size(), nights, undefined, orphans);
    }
}
