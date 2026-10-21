package pt.andaime.reporting.domain;

import java.text.Collator;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Livro de horas do RH de um mês: uma folha por pessoa ("Nome-Número") com uma linha por dia trabalhado em cada obra e
 * uma linha de 0 h por dia de ausência aprovada, com o motivo na coluna Ausência. Dias sem nada não entram.
 * <ul>
 * <li>Horas: as aprovadas, já divididas em normais e extra pela política laboral (projeção de reporting).</li>
 * <li>Atividade: o código do escalão de horas extra da política ({@code overtime_tiers}, ADR 0010) em que cai o total
 * de horas extra do dia; uma linha sem horas extra leva o código normal.</li>
 * <li>Ausências: dias de descanso da política e feriados não entram; num dia com horas, o motivo vai para a coluna
 * Ausência da primeira linha desse dia (as horas prevalecem).</li>
 * </ul>
 * Puro e sem dependências de infraestrutura: os testes unitários cobrem os nomes das folhas, as ausências e a ordem.
 */
public final class HrBook {

    /** O Excel não aceita nomes de folha com mais de 31 caracteres. */
    public static final int MAX_SHEET_NAME = 31;
    public static final List<String> HEADER = List.of("Data", "Horas", "Obra", "Atividade", "Ordem", "Ausência");

    static final Map<String, String> ABSENCE_LABEL = Map.of("VACATION", "Férias", "SICK", "Doença", "TRAINING", "Formação",
            "PERSONAL", "Assunto pessoal", "LEAVE", "Licença", "OTHER", "Outra");

    /** Escalões usados quando a política da empresa ainda não define nenhum (sugestão, como o {@code normal_code} 800). */
    public static final List<Tier> DEFAULT_TIERS = List.of(new Tier(60, "801"), new Tier(null, "802"));

    private HrBook() {
    }

    /** Escalão de horas extra: até {@code upToMin} minutos extra no dia (acumulado); o último pode não ter limite. */
    public record Tier(Integer upToMin, String code) {
    }

    /** Uma linha da folha "Tabelas": a descrição da atividade e o código ERP. */
    public record ActivityCode(String label, String code) {
    }

    /** Códigos de atividade: o normal e os escalões de horas extra, por ordem crescente de limite. */
    public record ActivityTable(String normalCode, List<Tier> tiers) {

        public ActivityTable {
            normalCode = normalCode == null || normalCode.isBlank() ? "800" : normalCode.strip();
            var valid = tiers == null ? List.<Tier>of() : tiers.stream()
                    .filter(tier -> tier != null && tier.code() != null && !tier.code().isBlank())
                    .map(tier -> new Tier(tier.upToMin() == null || tier.upToMin() <= 0 ? null : tier.upToMin(), tier.code().strip()))
                    .sorted(Comparator.comparing(Tier::upToMin, Comparator.nullsLast(Comparator.naturalOrder())))
                    .toList();
            tiers = valid.isEmpty() ? DEFAULT_TIERS : valid;
        }

        /** Linhas da folha "Tabelas" (a primeira é a normal). */
        public List<ActivityCode> codes() {
            var codes = new ArrayList<ActivityCode>();
            codes.add(new ActivityCode("Normal", normalCode));
            Integer previous = null;
            for (var tier : tiers) {
                String label;
                if (tier.upToMin() != null) {
                    label = "Extra até " + hours(tier.upToMin()) + " h";
                } else if (previous != null) {
                    label = "Extra acima de " + hours(previous) + " h";
                } else {
                    label = "Extra";
                }
                codes.add(new ActivityCode(label, tier.code()));
                if (tier.upToMin() != null) previous = tier.upToMin();
            }
            return codes;
        }

        /**
         * Índice em {@link #codes()} para uma linha: 0 (normal) sem horas extra na linha; senão o primeiro escalão cujo
         * limite cobre o total de horas extra do dia, ou o último.
         */
        public int indexFor(int rowOvertimeMin, int dayOvertimeMin) {
            if (rowOvertimeMin <= 0) return 0;
            var overtime = Math.max(rowOvertimeMin, dayOvertimeMin);
            for (var index = 0; index < tiers.size(); index++) {
                var limit = tiers.get(index).upToMin();
                if (limit == null || overtime <= limit) return index + 1;
            }
            return tiers.size();
        }
    }

    public record Employee(UUID id, String name, String number) {
    }

    /** Horas aprovadas de uma pessoa numa obra e num dia (soma dos registos). */
    public record WorkedDay(UUID employeeId, LocalDate date, String siteCode, String erpOrder, int workedMin, int normalMin,
            int overtimeMin) {
    }

    /** Ausência aprovada; {@code partialMinutes} só nas parciais de um dia. */
    public record Absence(UUID employeeId, String kind, LocalDate startsOn, LocalDate endsOn, Integer partialMinutes) {
    }

    /**
     * Linha de uma folha. {@code activityIndex} aponta para {@link ActivityTable#codes()} (nulo nas linhas de ausência);
     * {@code activityCode} é o valor já calculado que fica em cache na fórmula.
     */
    public record Row(LocalDate date, int minutes, String siteCode, Integer activityIndex, String activityCode, String erpOrder,
            String absence) {

        public boolean absenceOnly() {
            return activityIndex == null;
        }
    }

    public record Sheet(UUID employeeId, String employeeName, String employeeNumber, String name, List<Row> rows) {

        public int workedMin() {
            return rows.stream().mapToInt(Row::minutes).sum();
        }

        public int absenceDays() {
            return (int) rows.stream().filter(Row::absenceOnly).count();
        }
    }

    public record Book(YearMonth month, ActivityTable activities, List<Sheet> sheets) {

        public int rows() {
            return sheets.stream().mapToInt(sheet -> sheet.rows().size()).sum();
        }

        public int absenceDays() {
            return sheets.stream().mapToInt(Sheet::absenceDays).sum();
        }

        public int workedMin() {
            return sheets.stream().mapToInt(Sheet::workedMin).sum();
        }
    }

    /**
     * Monta o livro do mês.
     *
     * @param restDays dias de descanso da política (ISO 1–7); as ausências não contam nesses dias
     * @param holidays feriados (da empresa e nacionais); as ausências também não contam nesses dias
     */
    public static Book build(YearMonth month, ActivityTable activities, List<Employee> employees, List<WorkedDay> worked,
            List<Absence> absences, Set<Integer> restDays, Set<LocalDate> holidays) {
        var first = month.atDay(1);
        var last = month.atEndOfMonth();
        var rows = new HashMap<UUID, List<Row>>();

        // Horas: o total extra do dia decide o escalão.
        var dayOvertime = new HashMap<String, Integer>();
        for (var day : worked) {
            if (day.date().isBefore(first) || day.date().isAfter(last)) continue;
            dayOvertime.merge(day.employeeId() + "|" + day.date(), day.overtimeMin(), Integer::sum);
        }
        var workedDays = new HashSet<String>();
        var codes = activities.codes();
        for (var day : worked) {
            if (day.date().isBefore(first) || day.date().isAfter(last) || day.workedMin() <= 0) continue;
            var key = day.employeeId() + "|" + day.date();
            workedDays.add(key);
            var index = activities.indexFor(day.overtimeMin(), dayOvertime.getOrDefault(key, 0));
            rows.computeIfAbsent(day.employeeId(), ignored -> new ArrayList<>()).add(new Row(day.date(), day.workedMin(),
                    value(day.siteCode()), index, codes.get(index).code(), value(day.erpOrder()), ""));
        }

        // Ausências: um dia de 0 h por dia útil; num dia com horas, só a nota.
        var notes = new HashMap<String, String>();
        for (var absence : absences) {
            var from = absence.startsOn().isBefore(first) ? first : absence.startsOn();
            var to = absence.endsOn().isAfter(last) ? last : absence.endsOn();
            for (var date = from; !date.isAfter(to); date = date.plusDays(1)) {
                var key = absence.employeeId() + "|" + date;
                var label = label(absence);
                if (workedDays.contains(key)) {
                    notes.merge(key, label, (a, b) -> a + "; " + b);
                    continue;
                }
                if (restDays.contains(date.getDayOfWeek().getValue()) || holidays.contains(date)) continue;
                rows.computeIfAbsent(absence.employeeId(), ignored -> new ArrayList<>())
                        .add(new Row(date, 0, "", null, "", "", label));
            }
        }

        var byId = new LinkedHashMap<UUID, Employee>();
        employees.forEach(employee -> byId.put(employee.id(), employee));
        var collator = Collator.getInstance(Locale.forLanguageTag("pt-PT"));
        collator.setStrength(Collator.SECONDARY);
        var ordered = rows.keySet().stream()
                .map(id -> byId.getOrDefault(id, new Employee(id, id.toString(), "")))
                .sorted(Comparator.comparing((Employee employee) -> employee.name(), collator)
                        .thenComparing(employee -> value(employee.number()))
                        .thenComparing(Employee::id))
                .toList();

        var used = new HashSet<String>();
        var sheets = new ArrayList<Sheet>();
        for (var employee : ordered) {
            var list = new ArrayList<>(rows.get(employee.id()));
            // Por dia; no mesmo dia, as obras por código e a ausência no fim.
            list.sort(Comparator.comparing(Row::date).thenComparing(Row::absenceOnly).thenComparing(Row::siteCode));
            annotate(list, employee.id(), notes);
            sheets.add(new Sheet(employee.id(), employee.name(), value(employee.number()),
                    sheetName(employee.name(), employee.number(), used), List.copyOf(list)));
        }
        return new Book(month, activities, List.copyOf(sheets));
    }

    /**
     * "Nome-Número" válido no Excel: sem {@code : \ / ? * [ ]}, sem apóstrofo no início ou no fim, no máximo 31
     * caracteres (o número nunca é cortado) e único no livro, sem distinguir maiúsculas (acrescenta " (2)", " (3)"…).
     * Regista o nome escolhido em {@code used}.
     */
    public static String sheetName(String name, String number, Set<String> used) {
        var clean = clean(name);
        var cleanNumber = clean(number);
        var suffix = cleanNumber.isEmpty() ? "" : "-" + cleanNumber;
        if (suffix.length() > MAX_SHEET_NAME - 1) suffix = suffix.substring(0, MAX_SHEET_NAME - 1);
        if (clean.isEmpty()) clean = "Trabalhador";
        var candidate = fit(clean, suffix);
        for (var attempt = 2; used.contains(candidate.toLowerCase(Locale.ROOT)); attempt++) {
            candidate = fit(clean, suffix + " (" + attempt + ")");
        }
        used.add(candidate.toLowerCase(Locale.ROOT));
        return candidate;
    }

    private static String fit(String name, String suffix) {
        var room = Math.max(1, MAX_SHEET_NAME - suffix.length());
        var head = name.length() > room ? name.substring(0, room).strip() : name;
        var result = head + suffix;
        return result.length() > MAX_SHEET_NAME ? result.substring(result.length() - MAX_SHEET_NAME) : result;
    }

    private static String clean(String value) {
        if (value == null) return "";
        var clean = value.replaceAll("[:\\\\/?*\\[\\]]", "").replaceAll("\\s+", " ").strip();
        while (clean.startsWith("'")) clean = clean.substring(1).strip();
        while (clean.endsWith("'")) clean = clean.substring(0, clean.length() - 1).strip();
        return clean;
    }

    private static void annotate(List<Row> rows, UUID employeeId, Map<String, String> notes) {
        LocalDate previous = null;
        for (var index = 0; index < rows.size(); index++) {
            var row = rows.get(index);
            if (row.date().equals(previous)) continue;
            previous = row.date();
            var note = notes.get(employeeId + "|" + row.date());
            if (note != null && !row.absenceOnly()) {
                rows.set(index, new Row(row.date(), row.minutes(), row.siteCode(), row.activityIndex(), row.activityCode(),
                        row.erpOrder(), note));
            }
        }
    }

    static String label(Absence absence) {
        var label = ABSENCE_LABEL.getOrDefault(absence.kind(), "Ausência");
        return absence.partialMinutes() == null ? label : label + " (" + hours(absence.partialMinutes()) + " h)";
    }

    /** Minutos em horas no formato português: 60 → "1", 90 → "1,5", 100 → "1,67". */
    static String hours(int minutes) {
        var value = Math.round(minutes / 60.0 * 100) / 100.0;
        var text = value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
        return text.replace('.', ',');
    }

    private static String value(String value) {
        return value == null ? "" : value;
    }
}
