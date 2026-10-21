package pt.andaime.absences.application;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;

/**
 * Férias aprovadas em iCalendar (RFC 5545), para importar no Google Calendar ou no Outlook enquanto não há integração
 * real. Um evento de dia inteiro por ausência, com fim exclusivo; o UID é o id da ausência, por isso importar outra vez
 * atualiza o evento em vez de o duplicar (o SEQUENCE acompanha a versão).
 */
@Service
public class VacationCalendar {

    private static final DateTimeFormatter DATE = DateTimeFormatter.BASIC_ISO_DATE;
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'", Locale.ROOT)
            .withZone(ZoneOffset.UTC);

    private final JdbcTemplate jdbcTemplate;

    public VacationCalendar(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    record Vacation(UUID id, String employeeName, LocalDate startsOn, LocalDate endsOn, Instant stamp, int version) {
    }

    @Transactional(readOnly = true)
    public byte[] export(LocalDate from, LocalDate to) {
        OrgRole.require(OrgRole.MANAGER);
        if (from == null || to == null || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 400) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Intervalo de datas inválido (máximo 400 dias).");
        }
        var organization = jdbcTemplate.query("SELECT name FROM organizations WHERE id = app.current_org_id()",
                (resultSet, rowNumber) -> resultSet.getString(1)).stream().findFirst().orElse("Andaime");
        var vacations = jdbcTemplate.query("""
                SELECT absence.id, employee.full_name, absence.starts_on, absence.ends_on,
                       coalesce(absence.decided_at, absence.updated_at) stamp, absence.version
                FROM absences absence
                JOIN employees employee ON employee.organization_id = absence.organization_id AND employee.id = absence.employee_id
                WHERE absence.status = 'APPROVED' AND absence.kind = 'VACATION'
                  AND absence.starts_on <= ? AND absence.ends_on >= ?
                ORDER BY absence.starts_on, employee.full_name, absence.id
                """, (resultSet, rowNumber) -> new Vacation(resultSet.getObject("id", UUID.class),
                resultSet.getString("full_name"), resultSet.getObject("starts_on", LocalDate.class),
                resultSet.getObject("ends_on", LocalDate.class), resultSet.getTimestamp("stamp").toInstant(),
                resultSet.getInt("version")), to, from);
        return render(organization, vacations).getBytes(StandardCharsets.UTF_8);
    }

    static String render(String organization, List<Vacation> vacations) {
        var out = new StringBuilder();
        line(out, "BEGIN:VCALENDAR");
        line(out, "VERSION:2.0");
        line(out, "PRODID:-//Andaime//Ferias//PT");
        line(out, "CALSCALE:GREGORIAN");
        line(out, "METHOD:PUBLISH");
        line(out, "X-WR-CALNAME:" + text("Férias — " + organization));
        for (var vacation : vacations) {
            line(out, "BEGIN:VEVENT");
            line(out, "UID:" + vacation.id() + "@andaime.pt");
            line(out, "DTSTAMP:" + STAMP.format(vacation.stamp()));
            line(out, "DTSTART;VALUE=DATE:" + DATE.format(vacation.startsOn()));
            line(out, "DTEND;VALUE=DATE:" + DATE.format(vacation.endsOn().plusDays(1)));
            line(out, "SUMMARY:" + text("Férias — " + vacation.employeeName()));
            line(out, "SEQUENCE:" + vacation.version());
            line(out, "TRANSP:TRANSPARENT");
            line(out, "END:VEVENT");
        }
        line(out, "END:VCALENDAR");
        return out.toString();
    }

    /** Escapa texto (RFC 5545 §3.3.11). */
    static String text(String value) {
        return (value == null ? "" : value).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
                .replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "");
    }

    /** Linha terminada em CRLF e dobrada a 75 octetos sem partir caracteres UTF-8 (RFC 5545 §3.1). */
    static void line(StringBuilder out, String content) {
        var octets = 0;
        var limit = 75;
        for (var offset = 0; offset < content.length(); ) {
            var codePoint = content.codePointAt(offset);
            var size = new String(Character.toChars(codePoint)).getBytes(StandardCharsets.UTF_8).length;
            if (octets + size > limit) {
                out.append("\r\n ");
                octets = 1;
            }
            out.appendCodePoint(codePoint);
            octets += size;
            offset += Character.charCount(codePoint);
        }
        out.append("\r\n");
    }
}
