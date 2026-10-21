package pt.andaime.absences.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class VacationCalendarTest {

    private static final UUID ID = UUID.fromString("0190a1b2-0000-7000-8000-000000000001");

    @Test
    void eventoDeDiaInteiroComFimExclusivoEUidEstavel() {
        var ics = VacationCalendar.render("Construções, Lda", List.of(new VacationCalendar.Vacation(ID, "Ana; Silva",
                LocalDate.of(2026, 8, 3), LocalDate.of(2026, 8, 14), Instant.parse("2026-07-01T10:15:00Z"), 1)));

        assertThat(ics).startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n").endsWith("END:VCALENDAR\r\n");
        assertThat(ics).contains("X-WR-CALNAME:Férias — Construções\\, Lda\r\n");
        assertThat(ics).contains("UID:" + ID + "@andaime.pt\r\n", "DTSTAMP:20260701T101500Z\r\n",
                "DTSTART;VALUE=DATE:20260803\r\n", "DTEND;VALUE=DATE:20260815\r\n", "SUMMARY:Férias — Ana\\; Silva\r\n",
                "SEQUENCE:1\r\n");
        // Sem linhas soltas: todas terminam em CRLF.
        assertThat(ics.replace("\r\n", "")).doesNotContain("\n").doesNotContain("\r");
        // Repetir dá exatamente o mesmo ficheiro.
        assertThat(VacationCalendar.render("Construções, Lda", List.of(new VacationCalendar.Vacation(ID, "Ana; Silva",
                LocalDate.of(2026, 8, 3), LocalDate.of(2026, 8, 14), Instant.parse("2026-07-01T10:15:00Z"), 1)))).isEqualTo(ics);
    }

    @Test
    void linhasLongasSaoDobradasA75OctetosSemPartirCaracteres() {
        var out = new StringBuilder();
        VacationCalendar.line(out, "SUMMARY:" + "ção".repeat(40));
        var lines = out.toString().split("\r\n");
        assertThat(lines).hasSizeGreaterThan(1);
        for (var line : lines) {
            assertThat(line.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(75);
        }
        assertThat(lines[1]).startsWith(" ");
        assertThat(String.join("", lines).replace("\r\n ", "")).contains("ção");
        var unfolded = out.toString().replace("\r\n ", "");
        assertThat(unfolded).isEqualTo("SUMMARY:" + "ção".repeat(40) + "\r\n");
    }

    @Test
    void textoEscapado() {
        assertThat(VacationCalendar.text("a\\b;c,d\ne")).isEqualTo("a\\\\b\\;c\\,d\\ne");
    }
}
