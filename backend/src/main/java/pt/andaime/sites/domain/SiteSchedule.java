package pt.andaime.sites.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;

/** Prazos da obra: fim contratual (o que foi acordado) face à previsão de fim (o que se espera agora). */
public final class SiteSchedule {

    private SiteSchedule() {
    }

    /**
     * Dias úteis (segunda a sexta) em que a previsão de fim passa o fim contratual; 0 quando não passa ou quando falta
     * uma das datas. Porta de {@code delayWorkdays} do protótipo V3.1. Os feriados não descontam: é um aviso, não um
     * cálculo de penalidades.
     */
    public static int delayWorkdays(LocalDate contractEnd, LocalDate forecastEnd) {
        if (contractEnd == null || forecastEnd == null || !forecastEnd.isAfter(contractEnd)) {
            return 0;
        }
        var days = 0;
        for (var day = contractEnd.plusDays(1); !day.isAfter(forecastEnd); day = day.plusDays(1)) {
            if (day.getDayOfWeek() != DayOfWeek.SATURDAY && day.getDayOfWeek() != DayOfWeek.SUNDAY) {
                days++;
            }
        }
        return days;
    }
}
