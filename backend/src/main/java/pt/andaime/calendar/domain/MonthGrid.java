package pt.andaime.calendar.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAdjusters;
import java.util.Optional;

/**
 * Grelha do mês corrida de segunda a domingo: começa na segunda-feira antes do dia 1 (ou no próprio dia 1) e acaba no
 * domingo depois do último dia. Porta de {@code monthGrid} do protótipo V3.1.
 */
public record MonthGrid(YearMonth month, LocalDate from, LocalDate to) {

    public static MonthGrid of(YearMonth month) {
        return new MonthGrid(month, month.atDay(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)),
                month.atEndOfMonth().with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY)));
    }

    /** {@code YYYY-MM} entre 2000 e 2100; vazio quando o texto não é um mês válido. */
    public static Optional<MonthGrid> parse(String text) {
        if (text == null || !text.matches("\\d{4}-\\d{2}")) {
            return Optional.empty();
        }
        try {
            var month = YearMonth.parse(text);
            return month.getYear() < 2000 || month.getYear() > 2100 ? Optional.empty() : Optional.of(of(month));
        } catch (DateTimeParseException exception) {
            return Optional.empty();
        }
    }

    /** Número de semanas (linhas) da grelha: 4 a 6. */
    public int weeks() {
        return (int) ((to.toEpochDay() - from.toEpochDay() + 1) / 7);
    }
}
