package pt.andaime.reporting.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import pt.andaime.reporting.domain.HrBook.Absence;
import pt.andaime.reporting.domain.HrBook.ActivityTable;
import pt.andaime.reporting.domain.HrBook.Employee;
import pt.andaime.reporting.domain.HrBook.Row;
import pt.andaime.reporting.domain.HrBook.Tier;
import pt.andaime.reporting.domain.HrBook.WorkedDay;

class HrBookTest {

    private static final YearMonth MARCH = YearMonth.of(2026, 3);
    private static final Set<Integer> WEEKEND = Set.of(6, 7);
    private static final ActivityTable CODES = new ActivityTable("800", List.of(new Tier(null, "802"), new Tier(60, "801")));
    private static final UUID ANA = UUID.fromString("00000000-0000-0000-0000-00000000000a");
    private static final UUID BRUNO = UUID.fromString("00000000-0000-0000-0000-00000000000b");
    private static final List<Employee> PEOPLE = List.of(new Employee(BRUNO, "Bruno Álvares", "7"), new Employee(ANA, "Ana Silva", "12"));

    private static LocalDate day(int dayOfMonth) {
        return MARCH.atDay(dayOfMonth);
    }

    @Test
    void nomeDaFolhaSemCaracteresProibidosAte31EComNumeroInteiro() {
        var used = new HashSet<String>();
        assertThat(HrBook.sheetName("Ana Silva", "12", used)).isEqualTo("Ana Silva-12");
        assertThat(HrBook.sheetName("  João: [O] / Pedreiro*?\\  ", "3", used)).isEqualTo("João O Pedreiro-3");
        var longName = HrBook.sheetName("Maria da Conceição Fernandes Albuquerque", "10045", used);
        assertThat(longName).hasSizeLessThanOrEqualTo(31).endsWith("-10045").startsWith("Maria da Conceição");
        assertThat(HrBook.sheetName("'Citação'", "", used)).isEqualTo("Citação");
        assertThat(HrBook.sheetName("[]", null, used)).isEqualTo("Trabalhador");
    }

    @Test
    void nomesRepetidosFicamUnicosSemDistinguirMaiusculas() {
        var used = new HashSet<String>();
        assertThat(HrBook.sheetName("Rui Costa", "1", used)).isEqualTo("Rui Costa-1");
        assertThat(HrBook.sheetName("RUI COSTA", "1", used)).isEqualTo("RUI COSTA-1 (2)");
        assertThat(HrBook.sheetName("Rui Costa", "1", used)).isEqualTo("Rui Costa-1 (3)");
        var a = HrBook.sheetName("Abcdefghijklmnopqrstuvwxyz Abcdef", "99", used);
        var b = HrBook.sheetName("Abcdefghijklmnopqrstuvwxyz Abcdeg", "99", used);
        assertThat(a).hasSize(31);
        assertThat(b).hasSizeLessThanOrEqualTo(31).isNotEqualToIgnoringCase(a).endsWith("-99 (2)");
    }

    @Test
    void codigosDeAtividadeVemDosEscaloesDaPolitica() {
        assertThat(CODES.codes()).extracting(HrBook.ActivityCode::code).containsExactly("800", "801", "802");
        assertThat(CODES.codes()).extracting(HrBook.ActivityCode::label)
                .containsExactly("Normal", "Extra até 1 h", "Extra acima de 1 h");
        assertThat(CODES.indexFor(0, 0)).isZero();
        assertThat(CODES.indexFor(30, 30)).isEqualTo(1);
        assertThat(CODES.indexFor(60, 60)).isEqualTo(1);
        assertThat(CODES.indexFor(61, 61)).isEqualTo(2);
        // Numa obra só com horas normais, a linha é normal mesmo que o dia tenha extra noutra obra.
        assertThat(CODES.indexFor(0, 180)).isZero();
        assertThat(CODES.indexFor(20, 180)).isEqualTo(2);
        // Política sem escalões: sugestão 801/802, como o código normal 800.
        assertThat(new ActivityTable(null, List.of()).codes()).extracting(HrBook.ActivityCode::code)
                .containsExactly("800", "801", "802");
        var three = new ActivityTable("N", List.of(new Tier(60, "E1"), new Tier(120, "E2"), new Tier(null, "E3")));
        assertThat(three.indexFor(90, 90)).isEqualTo(2);
        assertThat(three.indexFor(500, 500)).isEqualTo(3);
    }

    @Test
    void ausenciasEntramComZeroHorasSoEmDiasUteisEOMotivoNaColunaAusencia() {
        var book = HrBook.build(MARCH, CODES, PEOPLE,
                List.of(new WorkedDay(ANA, day(2), "OB-1", "OC-42", 480, 480, 0)),
                // Férias de quinta a terça (5 a 10): sábado, domingo e o feriado de segunda (9) não entram.
                List.of(new Absence(ANA, "VACATION", day(5), day(10), null),
                        new Absence(BRUNO, "PERSONAL", day(4), day(4), 120)),
                WEEKEND, Set.of(day(9)));

        var ana = book.sheets().stream().filter(s -> s.employeeId().equals(ANA)).findFirst().orElseThrow();
        assertThat(ana.rows()).extracting(Row::date).containsExactly(day(2), day(5), day(6), day(10));
        var vacation = ana.rows().get(1);
        assertThat(vacation.minutes()).isZero();
        assertThat(vacation.absence()).isEqualTo("Férias");
        assertThat(vacation.activityIndex()).isNull();
        assertThat(vacation.siteCode()).isEmpty();
        assertThat(vacation.erpOrder()).isEmpty();
        assertThat(ana.absenceDays()).isEqualTo(3);
        var bruno = book.sheets().stream().filter(s -> s.employeeId().equals(BRUNO)).findFirst().orElseThrow();
        assertThat(bruno.rows()).singleElement().extracting(Row::absence).isEqualTo("Assunto pessoal (2 h)");
        assertThat(book.absenceDays()).isEqualTo(4);
        assertThat(book.rows()).isEqualTo(5);
    }

    @Test
    void diaComHorasEAusenciaFicaComAsHorasEANotaNaPrimeiraLinha() {
        var book = HrBook.build(MARCH, CODES, PEOPLE,
                List.of(new WorkedDay(ANA, day(3), "OB-2", "", 120, 120, 0), new WorkedDay(ANA, day(3), "OB-1", "OC-1", 240, 240, 0)),
                List.of(new Absence(ANA, "SICK", day(3), day(3), 120)), WEEKEND, Set.of());

        var rows = book.sheets().getFirst().rows();
        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(Row::siteCode).containsExactly("OB-1", "OB-2");
        assertThat(rows).extracting(Row::absence).containsExactly("Doença (2 h)", "");
        assertThat(book.absenceDays()).isZero();
    }

    @Test
    void folhasPorNomeLinhasPorDiaEObraECodigoDoDia() {
        var book = HrBook.build(MARCH, CODES, PEOPLE, List.of(
                        new WorkedDay(BRUNO, day(10), "OB-1", "OC-1", 480, 480, 0),
                        new WorkedDay(ANA, day(4), "OB-9", "OC-9", 90, 0, 90),
                        new WorkedDay(ANA, day(4), "OB-1", "OC-1", 480, 480, 0),
                        new WorkedDay(ANA, day(3), "OB-1", "OC-1", 510, 480, 30),
                        new WorkedDay(ANA, day(7), "OB-1", "OC-1", 240, 0, 240),
                        // Fora do mês e dias sem minutos não entram.
                        new WorkedDay(ANA, day(31).plusDays(1), "OB-1", "OC-1", 480, 480, 0),
                        new WorkedDay(ANA, day(20), "OB-1", "OC-1", 0, 0, 0)),
                List.of(), WEEKEND, Set.of());

        assertThat(book.sheets()).extracting(HrBook.Sheet::name).containsExactly("Ana Silva-12", "Bruno Álvares-7");
        var ana = book.sheets().getFirst().rows();
        assertThat(ana).extracting(Row::date).containsExactly(day(3), day(4), day(4), day(7));
        assertThat(ana).extracting(Row::siteCode).containsExactly("OB-1", "OB-1", "OB-9", "OB-1");
        assertThat(ana).extracting(Row::activityCode).containsExactly("801", "800", "802", "802");
        assertThat(ana).extracting(Row::erpOrder).containsExactly("OC-1", "OC-1", "OC-9", "OC-1");
        assertThat(book.sheets().getFirst().workedMin()).isEqualTo(510 + 480 + 90 + 240);
    }

    @Test
    void horasEmTextoPortugues() {
        assertThat(HrBook.hours(60)).isEqualTo("1");
        assertThat(HrBook.hours(90)).isEqualTo("1,5");
        assertThat(HrBook.hours(100)).isEqualTo("1,67");
    }
}
