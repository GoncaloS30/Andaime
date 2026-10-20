package pt.andaime.absences.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import pt.andaime.absences.domain.WorkingDays.Calendar;
import pt.andaime.absences.domain.WorkingDays.Period;
import pt.andaime.absences.domain.WorkingDays.RestRule;

/** Dias úteis de férias por ano: fins de semana e feriados da política laboral, recorte ao ano. */
class WorkingDaysTest {

    private static final Calendar WEEKENDS = new Calendar(List.of(), Set.of());

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    @Test
    void semanaInteiraSemFeriadosTemCincoDiasUteis() {
        // 2026-10-19 é segunda-feira.
        assertThat(WorkingDays.inYear(d("2026-10-19"), d("2026-10-25"), 2026, WEEKENDS)).isEqualTo(5);
        assertThat(WorkingDays.inYear(d("2026-10-23"), d("2026-10-26"), 2026, WEEKENDS)).isEqualTo(2);
        assertThat(WorkingDays.inYear(d("2026-10-24"), d("2026-10-25"), 2026, WEEKENDS)).isZero();
    }

    @Test
    void passagemDeAnoRepartePelosDoisAnos() {
        var holidays = new Calendar(List.of(), Set.of(d("2026-12-25"), d("2027-01-01")));
        // 28 a 31 de dezembro de 2026 (segunda a quinta) e 1 a 8 de janeiro de 2027 (sexta, feriado, e a semana seguinte).
        assertThat(WorkingDays.inYear(d("2026-12-28"), d("2027-01-08"), 2026, holidays)).isEqualTo(4);
        assertThat(WorkingDays.inYear(d("2026-12-28"), d("2027-01-08"), 2027, holidays)).isEqualTo(5);
        assertThat(WorkingDays.inYear(d("2026-12-28"), d("2027-01-08"), 2027, WEEKENDS)).isEqualTo(6);
        assertThat(WorkingDays.clip(d("2026-12-28"), d("2027-01-08"), 2027)).contains(new Period(d("2027-01-01"), d("2027-01-08")));
    }

    @Test
    void foraDoAnoNaoConta() {
        assertThat(WorkingDays.inYear(d("2025-07-01"), d("2025-07-31"), 2026, WEEKENDS)).isZero();
        assertThat(WorkingDays.clip(d("2025-07-01"), d("2025-07-31"), 2026)).isEmpty();
        assertThat(WorkingDays.clip(d("2026-07-10"), d("2026-07-01"), 2026)).isEmpty();
    }

    @Test
    void feriadoNumDiaUtilDescontaENumFimDeSemanaNaoDescontaDuasVezes() {
        // Semana de 8 a 14 de junho de 2026: 10 de junho (quarta) é feriado; 13 de junho (sábado) também marcado.
        var calendar = new Calendar(List.of(), Set.of(d("2026-06-10"), d("2026-06-13")));
        assertThat(WorkingDays.inYear(d("2026-06-08"), d("2026-06-14"), 2026, calendar)).isEqualTo(4);
    }

    @Test
    void diasDeDescansoVemDaPoliticaEmVigorEmCadaDia() {
        // Até 15 de junho descansa ao sábado e domingo; a partir daí só ao domingo (semana de seis dias).
        var calendar = new Calendar(List.of(
                new RestRule(null, d("2026-06-15"), Set.of(6, 7)),
                new RestRule(d("2026-06-15"), null, Set.of(7))), Set.of());
        // 8 a 14 de junho: 5 dias; 15 a 21 de junho: 6 dias.
        assertThat(WorkingDays.inYear(d("2026-06-08"), d("2026-06-21"), 2026, calendar)).isEqualTo(11);
        assertThat(calendar.isWorkingDay(d("2026-06-13"))).isFalse();
        assertThat(calendar.isWorkingDay(d("2026-06-20"))).isTrue();
    }

    @Test
    void semPoliticaQueCubraADataUsaSabadoEDomingo() {
        var calendar = new Calendar(List.of(new RestRule(d("2027-01-01"), null, Set.of(5, 6, 7))), Set.of());
        assertThat(calendar.isWorkingDay(d("2026-12-31"))).isTrue();
        assertThat(calendar.isWorkingDay(d("2026-12-26"))).isFalse();
        assertThat(calendar.isWorkingDay(d("2027-01-01"))).isFalse();
    }
}
