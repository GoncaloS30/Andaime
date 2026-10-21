package pt.andaime.sitediary.domain;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.Optional;

/** Regras do diário de obra, sem infraestrutura (portadas do protótipo {@code diary.ts}). */
public final class DiaryRules {

    /** Um registo leva no máximo 20 fotos: chega para um dia de obra e trava um disparate. */
    public static final int MAX_PHOTOS = 20;
    public static final int MAX_TITLE = 160;
    public static final int MAX_BODY = 10_000;

    private DiaryRules() {
    }

    /** Mês "AAAA-MM" opcional; vazio = todos. Lança {@link IllegalArgumentException} se for inválido. */
    public static Optional<YearMonth> month(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        if (!value.strip().matches("\\d{4}-\\d{2}")) {
            throw new IllegalArgumentException(value);
        }
        try {
            return Optional.of(YearMonth.parse(value.strip()));
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException(value, exception);
        }
    }

    /** Texto da pesquisa pronto para {@code LIKE}: sem espaços à volta e com {@code %}, {@code _} e {@code \} escapados. */
    public static Optional<String> searchPattern(String query) {
        if (query == null || query.isBlank()) {
            return Optional.empty();
        }
        var text = query.strip();
        if (text.length() > 100) {
            text = text.substring(0, 100);
        }
        return Optional.of(text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_"));
    }

    /** O diário regista o que aconteceu: a data não pode ser depois de hoje (no fuso da empresa). */
    public static boolean validDate(LocalDate date, LocalDate today) {
        return date != null && !date.isAfter(today) && date.getYear() >= 2000;
    }

    /**
     * Dimensões (em EMU, 1 cm = 360 000) de uma foto encaixada numa caixa quadrada de {@code box}, sem deformar: o
     * lado maior fica com o tamanho da caixa (fotos pequenas também são ampliadas, como no protótipo).
     */
    public static long[] fitBox(int width, int height, long box) {
        if (width <= 0 || height <= 0) {
            return new long[] {box, Math.round(box * 0.75)};
        }
        var scale = (double) box / Math.max(width, height);
        return new long[] {Math.round(width * scale), Math.round(height * scale)};
    }
}
