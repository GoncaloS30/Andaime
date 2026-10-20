package pt.andaime.timekeeping.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import pt.andaime.timekeeping.domain.HoursCalculator.Entry;
import pt.andaime.timekeeping.domain.HoursCalculator.Policy;

class HoursCalculatorTest {

    private static final ZoneId LISBON = ZoneId.of("Europe/Lisbon");
    private static final LocalDate MONDAY = LocalDate.of(2026, 10, 19);
    private static final Policy PT = new Policy(480, 2400, Set.of(6, 7), Set.of(), "START_DAY");

    private static Entry entry(LocalDate date, String start, String end, int breakMin) {
        var s = LocalTime.parse(start);
        var e = LocalTime.parse(end);
        return new Entry(date, date.atTime(s).atZone(LISBON).toInstant(),
                (e.isAfter(s) ? date : date.plusDays(1)).atTime(e).atZone(LISBON).toInstant(), LISBON, breakMin);
    }

    @Test
    void diaUtilNormalAteAoLimiteDiarioEExtraDepois() {
        var week = HoursCalculator.week(MONDAY, List.of(entry(MONDAY, "07:00", "18:00", 60)), PT);
        assertThat(week.days().getFirst()).satisfies(d -> {
            assertThat(d.workedMin()).isEqualTo(600);
            assertThat(d.normalMin()).isEqualTo(480);
            assertThat(d.overtimeMin()).isEqualTo(120);
        });
        assertThat(week.overtimeMin()).isEqualTo(120);
    }

    @Test
    void sabadoEFeriadoSaoTudoExtra() {
        var holiday = MONDAY.plusDays(1);
        var policy = new Policy(480, 2400, Set.of(6, 7), Set.of(holiday), "START_DAY");
        var week = HoursCalculator.week(MONDAY, List.of(entry(holiday, "08:00", "12:00", 0), entry(MONDAY.plusDays(5), "08:00", "12:00", 0)), policy);
        assertThat(week.normalMin()).isZero();
        assertThat(week.overtimeMin()).isEqualTo(480);
        assertThat(week.days().get(1).restDay()).isTrue();
    }

    @Test
    void feriadoDoPaisDaObraSoContaNosRegistosDessaObra() {
        // Terça é feriado no país da obra A: o registo nessa obra é todo extra; na quarta, noutra obra, é normal.
        var tuesday = MONDAY.plusDays(1);
        var wednesday = MONDAY.plusDays(2);
        var atSiteA = entry(tuesday, "08:00", "12:00", 0);
        var siteA = new Entry(atSiteA.workDate(), atSiteA.startedAt(), atSiteA.endedAt(), LISBON, 0, Set.of(tuesday, wednesday));
        var week = HoursCalculator.week(MONDAY, List.of(siteA, entry(wednesday, "08:00", "12:00", 0)), PT);
        assertThat(week.days().get(1)).satisfies(d -> {
            assertThat(d.restDay()).isTrue();
            assertThat(d.overtimeMin()).isEqualTo(240);
        });
        assertThat(week.days().get(2)).satisfies(d -> {
            assertThat(d.restDay()).isFalse();
            assertThat(d.normalMin()).isEqualTo(240);
        });
    }

    @Test
    void limiteSemanalPassaOExcessoAExtra() {
        var policy = new Policy(600, 2400, Set.of(6, 7), Set.of(), "START_DAY");
        var entries = List.of(0, 1, 2, 3, 4).stream().map(i -> entry(MONDAY.plusDays(i), "07:00", "17:00", 0)).toList();
        var week = HoursCalculator.week(MONDAY, entries, policy);
        assertThat(week.workedMin()).isEqualTo(3000);
        assertThat(week.normalMin()).isEqualTo(2400);
        assertThat(week.overtimeMin()).isEqualTo(600);
        assertThat(week.days().get(4).overtimeMin()).isEqualTo(600);
    }

    @Test
    void turnoNoturnoNoDiaDeInicioOuDivididoAMeiaNoite() {
        var night = entry(MONDAY, "22:00", "06:00", 60);
        var start = HoursCalculator.week(MONDAY, List.of(night), PT);
        assertThat(start.days().get(0).workedMin()).isEqualTo(420);
        assertThat(start.days().get(1).workedMin()).isZero();

        var split = HoursCalculator.week(MONDAY, List.of(night), new Policy(480, 2400, Set.of(6, 7), Set.of(), "SPLIT_MIDNIGHT"));
        assertThat(split.days().get(0).workedMin()).isEqualTo(105);
        assertThat(split.days().get(1).workedMin()).isEqualTo(315);
        assertThat(split.workedMin()).isEqualTo(420);
    }

    @Test
    void mudancaDeHoraContaAsHorasReais() {
        // Último domingo de março de 2027: às 01:00 passa a 02:00 em Lisboa.
        var sunday = LocalDate.of(2027, 3, 28);
        var week = HoursCalculator.week(sunday.minusDays(6), List.of(entry(sunday, "00:00", "06:00", 0)), PT);
        assertThat(week.days().get(6).workedMin()).isEqualTo(300);
    }
}
