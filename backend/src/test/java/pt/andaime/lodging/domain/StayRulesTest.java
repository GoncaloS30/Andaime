package pt.andaime.lodging.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import pt.andaime.lodging.domain.StayRules.AbsentDay;
import pt.andaime.lodging.domain.StayRules.Away;
import pt.andaime.lodging.domain.StayRules.Dates;
import pt.andaime.lodging.domain.StayRules.Line;
import pt.andaime.lodging.domain.StayRules.Point;
import pt.andaime.lodging.domain.StayRules.StayFact;
import pt.andaime.lodging.domain.StayRules.WorkDay;

/** Mesmos casos que {@code src/domain/stays.test.ts} do protótipo V3.1. */
class StayRulesTest {

    private static final LocalDate WEEK = LocalDate.parse("2026-10-12"); // segunda
    private static final Point BRAGA = new Point(41.5454, -8.4265);
    private static final Point MUNIQUE = new Point(48.11, 11.56);
    private static final Point PERTO_DE_BRAGA = new Point(41.56, -8.4);

    private final UUID w1 = UUID.randomUUID();
    private final UUID w2 = UUID.randomUUID();
    private final UUID w3 = UUID.randomUUID();
    private final UUID s1 = UUID.randomUUID();
    private final UUID s2 = UUID.randomUUID();
    private final UUID h1 = UUID.randomUUID();

    private static LocalDate day(int dayOfMonth) {
        return LocalDate.of(2026, 10, dayOfMonth);
    }

    private List<WorkDay> schedule() {
        var days = new ArrayList<WorkDay>();
        for (int d = 12; d <= 16; d++) {
            days.add(new WorkDay(w1, s1, day(d)));
        }
        days.add(new WorkDay(w2, s2, day(13)));
        days.add(new WorkDay(w3, s1, day(14)));
        days.add(new WorkDay(w3, s1, day(15)));
        return days;
    }

    private List<AbsentDay> absences() {
        return List.of(new AbsentDay(w3, day(15)));
    }

    private static Line line(List<Line> lines, UUID employee) {
        return lines.stream().filter(l -> l.employeeId().equals(employee)).findFirst().orElseThrow();
    }

    @Test
    void asNoitesContamSeDaEntradaASaida() {
        assertThat(StayRules.nights(day(12), day(16))).isEqualTo(4);
        assertThat(StayRules.nights(day(12), day(12))).isZero();
    }

    @Test
    void datasPropostasEntraNoPrimeiroDiaSaiNoUltimoUmSoDiaLevaUmaNoite() {
        assertThat(StayRules.proposedDates(day(12), day(16))).isEqualTo(new Dates(day(12), day(16)));
        assertThat(StayRules.proposedDates(day(14), day(14))).isEqualTo(new Dates(day(14), day(15)));
    }

    @Test
    void distanciaEntreCidadesBragaPorto() {
        var km = Math.round(StayRules.distanceKm(new Point(41.55, -8.42), new Point(41.15, -8.61)));
        assertThat(km).isBetween(41L, 59L);
    }

    @Test
    void quadroUmaLinhaPorPessoaEObraSoComOsDiasEmQueLaVaiMesmo() {
        var lines = StayRules.board(schedule(), absences(), List.of());
        assertThat(lines).hasSize(3);
        var first = line(lines, w1);
        assertThat(first.days()).hasSize(5);
        assertThat(first.proposed()).isEqualTo(new Dates(day(12), day(16)));
        // w3 tem ausência aprovada no dia 15: fica só o dia 14 (e uma noite proposta).
        assertThat(line(lines, w3).days()).containsExactly(day(14));
        assertThat(line(lines, w3).proposed()).isEqualTo(new Dates(day(14), day(15)));
    }

    @Test
    void longeDeCasaOutroPaisOuMaisDe100KmSemCoordenadasNaoSugereNada() {
        assertThat(StayRules.away("PT", "DE", BRAGA, MUNIQUE)).isEqualTo(Away.FAR);
        assertThat(StayRules.away("PT", "PT", BRAGA, PERTO_DE_BRAGA)).isEqualTo(Away.NEAR);
        // Residência sem coordenadas: outro país chega para sugerir.
        assertThat(StayRules.away("PT", "DE", null, MUNIQUE)).isEqualTo(Away.FAR);
        assertThat(StayRules.away("PT", "PT", null, PERTO_DE_BRAGA)).isEqualTo(Away.UNKNOWN);
        assertThat(StayRules.away("PT", "PT", BRAGA, new Point(38.7223, -9.1393))).isEqualTo(Away.FAR); // Lisboa
    }

    @Test
    void ligaAEstadiaMarcadaALinhaEEncontraAsEstadiasSemEscala() {
        var st1 = new StayFact(UUID.randomUUID(), w1, s1, h1, day(12), day(16));
        var st2 = new StayFact(UUID.randomUUID(), w2, s1, null, day(12), day(16));
        var stays = List.of(st1, st2);
        var lines = StayRules.board(schedule(), absences(), stays);
        assertThat(line(lines, w1).stay()).isEqualTo(st1);
        assertThat(line(lines, w2).stay()).isNull(); // w2 está escalado na s2, não na s1
        var summary = StayRules.summary(lines, stays);
        assertThat(summary.withoutSchedule()).containsExactly(st2);
        assertThat(summary.peopleAway()).isEqualTo(1);
        assertThat(summary.nights()).isEqualTo(8);
        assertThat(summary.undefinedHotel()).isEqualTo(1);
    }
}
