package pt.andaime.policy.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import pt.andaime.policy.domain.NationalHolidays.Holiday;

class NationalHolidaysTest {

    private static List<LocalDate> dates(String country, int year) {
        return NationalHolidays.of(country, year).stream().map(Holiday::date).toList();
    }

    private static Map<LocalDate, String> byDate(String country, int year) {
        return NationalHolidays.of(country, year).stream().collect(Collectors.toMap(Holiday::date, Holiday::name));
    }

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    @Test
    void pascoaPeloAlgoritmoGregoriano() {
        assertThat(NationalHolidays.easterSunday(2024)).isEqualTo(d("2024-03-31"));
        assertThat(NationalHolidays.easterSunday(2025)).isEqualTo(d("2025-04-20"));
        assertThat(NationalHolidays.easterSunday(2026)).isEqualTo(d("2026-04-05"));
        assertThat(NationalHolidays.easterSunday(2027)).isEqualTo(d("2027-03-28"));
        assertThat(NationalHolidays.easterSunday(2038)).isEqualTo(d("2038-04-25"));
        assertThat(NationalHolidays.easterSunday(2285)).isEqualTo(d("2285-03-22"));
        assertThat(NationalHolidays.easterSunday(2000)).isEqualTo(d("2000-04-23"));
    }

    @Test
    void portugal2026TemOs13FeriadosObrigatorios() {
        assertThat(dates("PT", 2026)).containsExactly(
                d("2026-01-01"), d("2026-04-03"), d("2026-04-05"), d("2026-04-25"), d("2026-05-01"), d("2026-06-04"),
                d("2026-06-10"), d("2026-08-15"), d("2026-10-05"), d("2026-11-01"), d("2026-12-01"), d("2026-12-08"),
                d("2026-12-25"));
        var names = byDate("PT", 2026);
        assertThat(names.get(d("2026-04-03"))).isEqualTo("Sexta-feira Santa");
        assertThat(names.get(d("2026-06-04"))).isEqualTo("Corpo de Deus");
        assertThat(names.get(d("2026-06-10"))).startsWith("Dia de Portugal");
        // Carnaval (17 de fevereiro de 2026) não é feriado nacional.
        assertThat(dates("PT", 2026)).doesNotContain(d("2026-02-17"));
    }

    @Test
    void espanha2026SoAsFestasComuns() {
        assertThat(dates("ES", 2026)).containsExactly(
                d("2026-01-01"), d("2026-01-06"), d("2026-04-03"), d("2026-05-01"), d("2026-08-15"), d("2026-10-12"),
                d("2026-11-01"), d("2026-12-06"), d("2026-12-08"), d("2026-12-25"));
    }

    @Test
    void franca2026ComAscensaoEPentecostes() {
        assertThat(dates("FR", 2026)).containsExactly(
                d("2026-01-01"), d("2026-04-06"), d("2026-05-01"), d("2026-05-08"), d("2026-05-14"), d("2026-05-25"),
                d("2026-07-14"), d("2026-08-15"), d("2026-11-01"), d("2026-11-11"), d("2026-12-25"));
        assertThat(byDate("FR", 2026).get(d("2026-05-14"))).isEqualTo("Ascension");
        assertThat(byDate("FR", 2026).get(d("2026-05-25"))).isEqualTo("Lundi de Pentecôte");
    }

    @Test
    void alemanha2026SoFeriadosFederais() {
        assertThat(dates("DE", 2026)).containsExactly(
                d("2026-01-01"), d("2026-04-03"), d("2026-04-06"), d("2026-05-01"), d("2026-05-14"), d("2026-05-25"),
                d("2026-10-03"), d("2026-12-25"), d("2026-12-26"));
    }

    @Test
    void reinoUnidoComDiasDeSubstituicao() {
        // 2027: Natal ao sábado e Boxing Day ao domingo → segunda 27 e terça 28.
        var gb2027 = byDate("GB", 2027);
        assertThat(gb2027).containsKeys(d("2027-12-27"), d("2027-12-28")).doesNotContainKeys(d("2027-12-25"), d("2027-12-26"));
        assertThat(gb2027.get(d("2027-12-27"))).isEqualTo("Christmas Day (substitute day)");
        assertThat(gb2027.get(d("2027-12-28"))).isEqualTo("Boxing Day (substitute day)");
        assertThat(dates("GB", 2027)).containsExactly(
                d("2027-01-01"), d("2027-03-26"), d("2027-03-29"), d("2027-05-03"), d("2027-05-31"), d("2027-08-30"),
                d("2027-12-27"), d("2027-12-28"));
        // 2022: Natal ao domingo → Boxing Day segunda 26 e Natal na terça 27; Ano Novo ao sábado → segunda 3.
        assertThat(byDate("GB", 2022)).containsEntry(d("2022-12-26"), "Boxing Day")
                .containsEntry(d("2022-12-27"), "Christmas Day (substitute day)")
                .containsEntry(d("2022-01-03"), "New Year's Day (substitute day)")
                .containsKeys(d("2022-06-02"), d("2022-06-03"), d("2022-09-19"));
        // 2026: Boxing Day ao sábado → segunda 28.
        assertThat(dates("GB", 2026)).contains(d("2026-12-25"), d("2026-12-28")).doesNotContain(d("2026-12-26"));
    }

    @Test
    void paisesBaixosKoningsdagPassaParaSabadoQuandoCaiAoDomingo() {
        assertThat(byDate("NL", 2025)).containsEntry(d("2025-04-26"), "Koningsdag").doesNotContainKey(d("2025-04-27"));
        assertThat(byDate("NL", 2026)).containsEntry(d("2026-04-27"), "Koningsdag");
        // 2016: Bevrijdingsdag e Hemelvaartsdag no mesmo dia ficam num só registo.
        assertThat(byDate("NL", 2016)).containsEntry(d("2016-05-05"), "Bevrijdingsdag / Hemelvaartsdag");
    }

    @Test
    void irlandaStBrigidsDay() {
        assertThat(byDate("IE", 2026)).containsEntry(d("2026-02-02"), "St Brigid's Day");
        assertThat(byDate("IE", 2024)).containsEntry(d("2024-02-05"), "St Brigid's Day");
        // 1 de fevereiro de 2030 é sexta-feira: o feriado é nesse dia.
        assertThat(byDate("IE", 2030)).containsEntry(d("2030-02-01"), "St Brigid's Day");
        assertThat(dates("IE", 2022)).doesNotContain(d("2022-02-07"));
        assertThat(dates("IE", 2026)).hasSize(10).contains(d("2026-10-26"), d("2026-03-17"), d("2026-04-06"));
    }

    @Test
    void restantesPaises() {
        assertThat(dates("LU", 2026)).hasSize(11).contains(d("2026-05-09"), d("2026-06-23"), d("2026-12-26"));
        assertThat(dates("LU", 2018)).doesNotContain(d("2018-05-09"));
        assertThat(dates("BE", 2026)).hasSize(10).contains(d("2026-07-21"), d("2026-11-11"));
        assertThat(dates("AT", 2026)).hasSize(13).contains(d("2026-06-04"), d("2026-10-26"), d("2026-01-06"));
        assertThat(dates("IT", 2026)).hasSize(13).contains(d("2026-04-25"), d("2026-06-02"), d("2026-10-04"), d("2026-12-26"));
        assertThat(dates("IT", 2025)).doesNotContain(d("2025-10-04"));
        assertThat(dates("CH", 2026)).containsExactly(d("2026-08-01"));
    }

    @Test
    void todosOsPaisesSuportadosDaoListasOrdenadasSemRepetidosEmVariosAnos() {
        for (var country : NationalHolidays.SUPPORTED) {
            for (int year = 2000; year <= 2100; year++) {
                var list = dates(country, year);
                assertThat(list).as("%s %d", country, year).isSorted().doesNotHaveDuplicates().isNotEmpty();
                final int y = year;
                assertThat(list).as("%s %d no próprio ano", country, year).allMatch(date -> date.getYear() == y);
            }
        }
    }

    @Test
    void paisSemCalendarioERecusado() {
        assertThat(NationalHolidays.supports("PL")).isFalse();
        assertThat(NationalHolidays.supports(null)).isFalse();
        assertThatThrownBy(() -> NationalHolidays.of("PL", 2026)).isInstanceOf(IllegalArgumentException.class);
    }
}
