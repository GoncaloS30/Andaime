package pt.andaime.sites.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

/** Mesmos casos que {@code delayWorkdays} em {@code src/domain/planning.test.ts} do protótipo V3.1. */
class SiteScheduleTest {

    private static final LocalDate CONTRACT = LocalDate.parse("2026-10-16"); // sexta-feira

    @Test
    void contaOsDiasUteisEntreOFimContratualEAPrevisao() {
        assertThat(SiteSchedule.delayWorkdays(CONTRACT, LocalDate.parse("2026-10-23"))).isEqualTo(5);
    }

    @Test
    void semAtrasoQuandoAPrevisaoNaoPassaOFimContratual() {
        assertThat(SiteSchedule.delayWorkdays(CONTRACT, CONTRACT)).isZero();
        assertThat(SiteSchedule.delayWorkdays(CONTRACT, LocalDate.parse("2026-10-10"))).isZero();
    }

    @Test
    void semAtrasoQuandoFaltaUmaDasDatas() {
        assertThat(SiteSchedule.delayWorkdays(null, CONTRACT)).isZero();
        assertThat(SiteSchedule.delayWorkdays(CONTRACT, null)).isZero();
    }

    @Test
    void fimDeSemanaNaoContaComoAtraso() {
        // Previsão no domingo a seguir ao fim contratual: nenhum dia útil de atraso.
        assertThat(SiteSchedule.delayWorkdays(CONTRACT, LocalDate.parse("2026-10-18"))).isZero();
    }
}
