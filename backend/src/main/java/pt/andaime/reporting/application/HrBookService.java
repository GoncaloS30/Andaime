package pt.andaime.reporting.application;

import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pt.andaime.policy.PublicHolidays;
import pt.andaime.reporting.domain.HrBook;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.tenant.OrgRole;

/**
 * Livro de horas do RH (F8.7): horas aprovadas do mês e ausências aprovadas, com os códigos de atividade dos escalões
 * da política laboral. A pré-visualização e o Excel saem do mesmo {@link HrBook.Book}.
 */
@Service
public class HrBookService {

    private final HrBookRepository repository;
    private final PublicHolidays publicHolidays;

    public HrBookService(HrBookRepository repository, PublicHolidays publicHolidays) {
        this.repository = repository;
        this.publicHolidays = publicHolidays;
    }

    public record HrBookSheetSummary(UUID employeeId, String employeeName, String employeeNumber, String sheetName, int rows,
            int workedMin, int absenceDays) {
    }

    /** Contagens do livro antes de o descarregar; {@code pendingDays} são dias com horas por aprovar (ficam de fora). */
    public record HrBookPreview(String month, int sheets, int rows, int workedMin, int absenceDays, int pendingDays,
            List<HrBook.ActivityCode> activityCodes, List<HrBookSheetSummary> people) {
    }

    @Transactional(readOnly = true)
    public HrBookPreview preview(String month) {
        var book = book(month);
        var first = book.month().atDay(1);
        var last = book.month().atEndOfMonth();
        return new HrBookPreview(book.month().toString(), book.sheets().size(), book.rows(), book.workedMin(),
                book.absenceDays(), repository.pendingDays(first, last), book.activities().codes(),
                book.sheets().stream().map(sheet -> new HrBookSheetSummary(sheet.employeeId(), sheet.employeeName(),
                        sheet.employeeNumber(), sheet.name(), sheet.rows().size(), sheet.workedMin(), sheet.absenceDays()))
                        .toList());
    }

    @Transactional(readOnly = true)
    public HrBook.Book book(String month) {
        OrgRole.require(OrgRole.MANAGER);
        var yearMonth = parseMonth(month);
        var first = yearMonth.atDay(1);
        var last = yearMonth.atEndOfMonth();
        var policy = repository.policy(last);
        var holidays = new HashSet<>(repository.organizationHolidays(first, last));
        var country = repository.organizationCountry();
        if (country != null && !country.isBlank()) {
            holidays.addAll(publicHolidays.dates(List.of(country), first, last).getOrDefault(country, java.util.Set.of()));
        }
        var worked = repository.worked(first, last);
        var absences = repository.approvedAbsences(first, last);
        var ids = new HashSet<UUID>();
        worked.forEach(day -> ids.add(day.employeeId()));
        absences.forEach(absence -> ids.add(absence.employeeId()));
        return HrBook.build(yearMonth, policy.activities(), repository.employees(ids), worked, absences, policy.restDays(),
                holidays);
    }

    /** {@code YYYY-MM}, entre 2000 e 2100. */
    public static YearMonth parseMonth(String month) {
        try {
            var parsed = YearMonth.parse(month == null ? "" : month.strip());
            if (parsed.getYear() < 2000 || parsed.getYear() > 2100) throw new DateTimeParseException("ano", month, 0);
            return parsed;
        } catch (DateTimeParseException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "validation", "Indique o mês no formato AAAA-MM.");
        }
    }

    public static String filename(YearMonth month) {
        return "livro-horas-rh-" + month + ".xlsx";
    }
}
