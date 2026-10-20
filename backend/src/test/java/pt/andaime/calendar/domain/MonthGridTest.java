package pt.andaime.calendar.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.YearMonth;

import org.junit.jupiter.api.Test;

class MonthGridTest {

    @Test
    void grelhaVaiDeSegundaADomingoComOsDiasDosMesesVizinhos() {
        // Outubro de 2026 começa a uma quinta e acaba a um sábado.
        var october = MonthGrid.of(YearMonth.of(2026, 10));
        assertThat(october.from()).isEqualTo(LocalDate.of(2026, 9, 28));
        assertThat(october.to()).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(october.weeks()).isEqualTo(5);
        // Fevereiro de 2027 começa a uma segunda e acaba a um domingo: 4 semanas certas.
        var february = MonthGrid.of(YearMonth.of(2027, 2));
        assertThat(february.from()).isEqualTo(LocalDate.of(2027, 2, 1));
        assertThat(february.to()).isEqualTo(LocalDate.of(2027, 2, 28));
        assertThat(february.weeks()).isEqualTo(4);
        // Agosto de 2026 começa a um sábado: 6 semanas.
        assertThat(MonthGrid.of(YearMonth.of(2026, 8)).weeks()).isEqualTo(6);
    }

    @Test
    void soAceitaMesesValidos() {
        assertThat(MonthGrid.parse("2026-10")).isPresent();
        assertThat(MonthGrid.parse("2026-13")).isEmpty();
        assertThat(MonthGrid.parse("2026-1")).isEmpty();
        assertThat(MonthGrid.parse("1999-12")).isEmpty();
        assertThat(MonthGrid.parse(null)).isEmpty();
    }
}
