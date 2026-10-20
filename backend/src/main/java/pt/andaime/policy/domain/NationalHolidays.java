package pt.andaime.policy.domain;

import static java.time.DayOfWeek.FRIDAY;
import static java.time.DayOfWeek.MONDAY;
import static java.time.DayOfWeek.SATURDAY;
import static java.time.DayOfWeek.SUNDAY;
import static java.time.Month.APRIL;
import static java.time.Month.AUGUST;
import static java.time.Month.DECEMBER;
import static java.time.Month.FEBRUARY;
import static java.time.Month.JANUARY;
import static java.time.Month.JULY;
import static java.time.Month.JUNE;
import static java.time.Month.MARCH;
import static java.time.Month.MAY;
import static java.time.Month.NOVEMBER;
import static java.time.Month.OCTOBER;
import static java.time.Month.SEPTEMBER;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Month;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Calendário dos feriados <strong>nacionais</strong> de cada país suportado, calculado em Java para qualquer ano
 * (incluindo as festas móveis a partir da Páscoa, pelo algoritmo gregoriano anónimo de Meeus/Jones/Butcher).
 * <p>
 * Âmbito e limites (a validar juridicamente antes de depender destas listas para pagamentos):
 * <ul>
 * <li>Só feriados nacionais, comuns a todo o país. Ficam de fora os feriados regionais, de comunidades autónomas,
 * Länder, cantões ou províncias e os municipais — a empresa acrescenta-os como feriados próprios.</li>
 * <li>PT: os 13 feriados obrigatórios do Código do Trabalho (art. 234.º). O Carnaval e o feriado municipal não são
 * nacionais; a Sexta-feira Santa pode ser gozada noutro dia por tradição local (não modelado).</li>
 * <li>ES: só as festas comuns a todas as comunidades em quase todos os anos; quando uma cai ao domingo, cada
 * comunidade decide se a passa para segunda (não modelado).</li>
 * <li>FR: a Segunda-feira de Pentecostes pode ser a "journée de solidarité" trabalhada; a Alsácia-Mosela tem mais
 * dois feriados (Sexta-feira Santa e 26 de dezembro), regionais.</li>
 * <li>NL: inclui o Dia da Libertação (5 de maio) todos os anos; ser dia pago depende da convenção coletiva.</li>
 * <li>GB: só Inglaterra e País de Gales (Escócia e Irlanda do Norte têm outra lista), com os dias de substituição
 * quando o feriado cai ao fim de semana, como na lista oficial do governo, e os feriados extraordinários conhecidos.</li>
 * <li>IE: sem dias de substituição — a lei dá ao trabalhador uma compensação, não um feriado noutro dia.</li>
 * <li>CH: só o feriado federal (1 de agosto); todos os outros são cantonais.</li>
 * <li>BE: quando um feriado cai num dia de descanso, a empresa fixa um dia de substituição (não modelado).</li>
 * </ul>
 * Nomes em português para Portugal e na língua local nos restantes países (francês na Bélgica e no Luxemburgo,
 * alemão na Suíça). Dois feriados no mesmo dia ficam num só registo, com os nomes separados por " / ".
 */
public final class NationalHolidays {

    /** Países com calendário nacional, pela ordem em que aparecem na aplicação. */
    public static final List<String> SUPPORTED = List.of("PT", "ES", "FR", "BE", "LU", "NL", "DE", "AT", "IT", "IE", "GB", "CH");

    public record Holiday(LocalDate date, String name) {
    }

    private NationalHolidays() {
    }

    public static boolean supports(String country) {
        return country != null && SUPPORTED.contains(country);
    }

    /** Feriados nacionais do país no ano, por data. País não suportado → {@link IllegalArgumentException}. */
    public static List<Holiday> of(String country, int year) {
        if (!supports(country)) {
            throw new IllegalArgumentException("País sem calendário de feriados: " + country);
        }
        var calendar = new Calendar(year);
        switch (country) {
            case "PT" -> portugal(calendar);
            case "ES" -> spain(calendar);
            case "FR" -> france(calendar);
            case "BE" -> belgium(calendar);
            case "LU" -> luxembourg(calendar);
            case "NL" -> netherlands(calendar);
            case "DE" -> germany(calendar);
            case "AT" -> austria(calendar);
            case "IT" -> italy(calendar);
            case "IE" -> ireland(calendar);
            case "GB" -> englandAndWales(calendar);
            default -> switzerland(calendar);
        }
        return calendar.list();
    }

    /** Domingo de Páscoa (calendário gregoriano), algoritmo anónimo de Meeus/Jones/Butcher. */
    public static LocalDate easterSunday(int year) {
        int a = year % 19;
        int b = year / 100;
        int c = year % 100;
        int d = b / 4;
        int e = b % 4;
        int f = (b + 8) / 25;
        int g = (b - f + 1) / 3;
        int h = (19 * a + b - d - g + 15) % 30;
        int i = c / 4;
        int k = c % 4;
        int l = (32 + 2 * e + 2 * i - h - k) % 7;
        int m = (a + 11 * h + 22 * l) / 451;
        int month = (h + l - 7 * m + 114) / 31;
        int day = (h + l - 7 * m + 114) % 31 + 1;
        return LocalDate.of(year, month, day);
    }

    // --- países ---------------------------------------------------------------------------------

    private static void portugal(Calendar c) {
        c.fixed(JANUARY, 1, "Ano Novo");
        c.easter(-2, "Sexta-feira Santa");
        c.easter(0, "Páscoa");
        c.fixed(APRIL, 25, "Dia da Liberdade");
        c.fixed(MAY, 1, "Dia do Trabalhador");
        c.easter(60, "Corpo de Deus");
        c.fixed(JUNE, 10, "Dia de Portugal, de Camões e das Comunidades Portuguesas");
        c.fixed(AUGUST, 15, "Assunção de Nossa Senhora");
        c.fixed(OCTOBER, 5, "Implantação da República");
        c.fixed(NOVEMBER, 1, "Dia de Todos os Santos");
        c.fixed(DECEMBER, 1, "Restauração da Independência");
        c.fixed(DECEMBER, 8, "Imaculada Conceição");
        c.fixed(DECEMBER, 25, "Natal");
    }

    private static void spain(Calendar c) {
        c.fixed(JANUARY, 1, "Año Nuevo");
        c.fixed(JANUARY, 6, "Epifanía del Señor");
        c.easter(-2, "Viernes Santo");
        c.fixed(MAY, 1, "Fiesta del Trabajo");
        c.fixed(AUGUST, 15, "Asunción de la Virgen");
        c.fixed(OCTOBER, 12, "Fiesta Nacional de España");
        c.fixed(NOVEMBER, 1, "Todos los Santos");
        c.fixed(DECEMBER, 6, "Día de la Constitución Española");
        c.fixed(DECEMBER, 8, "Inmaculada Concepción");
        c.fixed(DECEMBER, 25, "Natividad del Señor");
    }

    private static void france(Calendar c) {
        c.fixed(JANUARY, 1, "Jour de l'an");
        c.easter(1, "Lundi de Pâques");
        c.fixed(MAY, 1, "Fête du Travail");
        c.fixed(MAY, 8, "Victoire 1945");
        c.easter(39, "Ascension");
        c.easter(50, "Lundi de Pentecôte");
        c.fixed(JULY, 14, "Fête nationale");
        c.fixed(AUGUST, 15, "Assomption");
        c.fixed(NOVEMBER, 1, "Toussaint");
        c.fixed(NOVEMBER, 11, "Armistice 1918");
        c.fixed(DECEMBER, 25, "Noël");
    }

    private static void belgium(Calendar c) {
        c.fixed(JANUARY, 1, "Jour de l'an");
        c.easter(1, "Lundi de Pâques");
        c.fixed(MAY, 1, "Fête du Travail");
        c.easter(39, "Ascension");
        c.easter(50, "Lundi de Pentecôte");
        c.fixed(JULY, 21, "Fête nationale");
        c.fixed(AUGUST, 15, "Assomption");
        c.fixed(NOVEMBER, 1, "Toussaint");
        c.fixed(NOVEMBER, 11, "Armistice");
        c.fixed(DECEMBER, 25, "Noël");
    }

    private static void luxembourg(Calendar c) {
        c.fixed(JANUARY, 1, "Jour de l'an");
        c.easter(1, "Lundi de Pâques");
        c.fixed(MAY, 1, "Fête du Travail");
        if (c.year >= 2019) {
            c.fixed(MAY, 9, "Journée de l'Europe");
        }
        c.easter(39, "Ascension");
        c.easter(50, "Lundi de Pentecôte");
        c.fixed(JUNE, 23, "Fête nationale");
        c.fixed(AUGUST, 15, "Assomption");
        c.fixed(NOVEMBER, 1, "Toussaint");
        c.fixed(DECEMBER, 25, "Noël");
        c.fixed(DECEMBER, 26, "Saint-Étienne");
    }

    private static void netherlands(Calendar c) {
        c.fixed(JANUARY, 1, "Nieuwjaarsdag");
        c.easter(0, "Eerste Paasdag");
        c.easter(1, "Tweede Paasdag");
        if (c.year >= 2014) {
            // Koningsdag: 27 de abril; quando calha a um domingo, passa para sábado, 26.
            var kingsDay = LocalDate.of(c.year, APRIL, 27);
            c.add(kingsDay.getDayOfWeek() == SUNDAY ? kingsDay.minusDays(1) : kingsDay, "Koningsdag");
        } else {
            var queensDay = LocalDate.of(c.year, APRIL, 30);
            c.add(queensDay.getDayOfWeek() == SUNDAY ? queensDay.minusDays(1) : queensDay, "Koninginnedag");
        }
        c.fixed(MAY, 5, "Bevrijdingsdag");
        c.easter(39, "Hemelvaartsdag");
        c.easter(49, "Eerste Pinksterdag");
        c.easter(50, "Tweede Pinksterdag");
        c.fixed(DECEMBER, 25, "Eerste Kerstdag");
        c.fixed(DECEMBER, 26, "Tweede Kerstdag");
    }

    private static void germany(Calendar c) {
        c.fixed(JANUARY, 1, "Neujahr");
        c.easter(-2, "Karfreitag");
        c.easter(1, "Ostermontag");
        c.fixed(MAY, 1, "Tag der Arbeit");
        c.easter(39, "Christi Himmelfahrt");
        c.easter(50, "Pfingstmontag");
        c.fixed(OCTOBER, 3, "Tag der Deutschen Einheit");
        if (c.year == 2017) {
            c.fixed(OCTOBER, 31, "Reformationstag (500 Jahre)");
        }
        c.fixed(DECEMBER, 25, "1. Weihnachtstag");
        c.fixed(DECEMBER, 26, "2. Weihnachtstag");
    }

    private static void austria(Calendar c) {
        c.fixed(JANUARY, 1, "Neujahr");
        c.fixed(JANUARY, 6, "Heilige Drei Könige");
        c.easter(1, "Ostermontag");
        c.fixed(MAY, 1, "Staatsfeiertag");
        c.easter(39, "Christi Himmelfahrt");
        c.easter(50, "Pfingstmontag");
        c.easter(60, "Fronleichnam");
        c.fixed(AUGUST, 15, "Mariä Himmelfahrt");
        c.fixed(OCTOBER, 26, "Nationalfeiertag");
        c.fixed(NOVEMBER, 1, "Allerheiligen");
        c.fixed(DECEMBER, 8, "Mariä Empfängnis");
        c.fixed(DECEMBER, 25, "Christtag");
        c.fixed(DECEMBER, 26, "Stefanitag");
    }

    private static void italy(Calendar c) {
        c.fixed(JANUARY, 1, "Capodanno");
        c.fixed(JANUARY, 6, "Epifania");
        c.easter(0, "Pasqua");
        c.easter(1, "Lunedì dell'Angelo");
        c.fixed(APRIL, 25, "Festa della Liberazione");
        c.fixed(MAY, 1, "Festa del Lavoro");
        c.fixed(JUNE, 2, "Festa della Repubblica");
        c.fixed(AUGUST, 15, "Ferragosto");
        if (c.year >= 2026) {
            // Reposto como feriado nacional a partir de 2026 (São Francisco de Assis, padroeiro de Itália).
            c.fixed(OCTOBER, 4, "San Francesco d'Assisi");
        }
        c.fixed(NOVEMBER, 1, "Ognissanti");
        c.fixed(DECEMBER, 8, "Immacolata Concezione");
        c.fixed(DECEMBER, 25, "Natale");
        c.fixed(DECEMBER, 26, "Santo Stefano");
    }

    private static void ireland(Calendar c) {
        c.fixed(JANUARY, 1, "New Year's Day");
        if (c.year >= 2023) {
            // Primeira segunda-feira de fevereiro; se 1 de fevereiro for sexta-feira, é esse o dia.
            var first = LocalDate.of(c.year, FEBRUARY, 1);
            c.add(first.getDayOfWeek() == FRIDAY ? first : firstWeekday(c.year, FEBRUARY, MONDAY), "St Brigid's Day");
        }
        c.fixed(MARCH, 17, "St Patrick's Day");
        c.easter(1, "Easter Monday");
        c.add(firstWeekday(c.year, MAY, MONDAY), "May Bank Holiday");
        c.add(firstWeekday(c.year, JUNE, MONDAY), "June Bank Holiday");
        c.add(firstWeekday(c.year, AUGUST, MONDAY), "August Bank Holiday");
        c.add(lastWeekday(c.year, OCTOBER, MONDAY), "October Bank Holiday");
        c.fixed(DECEMBER, 25, "Christmas Day");
        c.fixed(DECEMBER, 26, "St Stephen's Day");
    }

    private static void englandAndWales(Calendar c) {
        int year = c.year;
        var weekend = new TreeMap<LocalDate, String>();
        // Ano Novo, Natal e Boxing Day ao fim de semana passam para o dia útil seguinte livre ("substitute day").
        weekdayOrSubstitute(c, weekend, LocalDate.of(year, JANUARY, 1), "New Year's Day");
        c.easter(-2, "Good Friday");
        c.easter(1, "Easter Monday");
        // Exceções históricas: o feriado de maio passou para o Dia da Vitória (1995, 2020) e o da primavera mudou
        // por causa dos jubileus (2002, 2012, 2022).
        c.add(switch (year) {
            case 1995, 2020 -> LocalDate.of(year, MAY, 8);
            default -> firstWeekday(year, MAY, MONDAY);
        }, "Early May bank holiday");
        c.add(switch (year) {
            case 2002 -> LocalDate.of(year, JUNE, 4);
            case 2012 -> LocalDate.of(year, JUNE, 4);
            case 2022 -> LocalDate.of(year, JUNE, 2);
            default -> lastWeekday(year, MAY, MONDAY);
        }, "Spring bank holiday");
        switch (year) {
            case 2002 -> c.fixed(JUNE, 3, "Golden Jubilee bank holiday");
            case 2011 -> c.fixed(APRIL, 29, "Royal wedding bank holiday");
            case 2012 -> c.fixed(JUNE, 5, "Diamond Jubilee bank holiday");
            case 2022 -> {
                c.fixed(JUNE, 3, "Platinum Jubilee bank holiday");
                c.fixed(SEPTEMBER, 19, "State Funeral of Queen Elizabeth II");
            }
            case 2023 -> c.fixed(MAY, 8, "Bank holiday for the coronation of King Charles III");
            default -> {
                // sem feriados extraordinários conhecidos
            }
        }
        c.add(lastWeekday(year, AUGUST, MONDAY), "Summer bank holiday");
        weekdayOrSubstitute(c, weekend, LocalDate.of(year, DECEMBER, 25), "Christmas Day");
        weekdayOrSubstitute(c, weekend, LocalDate.of(year, DECEMBER, 26), "Boxing Day");
        for (var entry : weekend.entrySet()) {
            var day = entry.getKey().plusDays(1);
            while (isWeekend(day) || c.contains(day)) {
                day = day.plusDays(1);
            }
            c.add(day, entry.getValue() + " (substitute day)");
        }
    }

    private static void switzerland(Calendar c) {
        c.fixed(AUGUST, 1, "Bundesfeiertag");
    }

    // --- auxiliares ------------------------------------------------------------------------------

    private static void weekdayOrSubstitute(Calendar c, Map<LocalDate, String> weekend, LocalDate date, String name) {
        if (isWeekend(date)) {
            weekend.put(date, name);
        } else {
            c.add(date, name);
        }
    }

    private static boolean isWeekend(LocalDate date) {
        return date.getDayOfWeek() == SATURDAY || date.getDayOfWeek() == SUNDAY;
    }

    private static LocalDate firstWeekday(int year, Month month, DayOfWeek day) {
        return LocalDate.of(year, month, 1).with(TemporalAdjusters.firstInMonth(day));
    }

    private static LocalDate lastWeekday(int year, Month month, DayOfWeek day) {
        return LocalDate.of(year, month, 1).with(TemporalAdjusters.lastInMonth(day));
    }

    /** Acumula os feriados de um ano, juntando os nomes quando dois calham no mesmo dia. */
    private static final class Calendar {

        private final int year;
        private final LocalDate easter;
        private final TreeMap<LocalDate, String> days = new TreeMap<>();

        Calendar(int year) {
            this.year = year;
            this.easter = easterSunday(year);
        }

        void fixed(Month month, int day, String name) {
            add(LocalDate.of(year, month, day), name);
        }

        void easter(int offset, String name) {
            add(easter.plusDays(offset), name);
        }

        void add(LocalDate date, String name) {
            days.merge(date, name, (a, b) -> a + " / " + b);
        }

        boolean contains(LocalDate date) {
            return days.containsKey(date);
        }

        List<Holiday> list() {
            var result = new ArrayList<Holiday>();
            days.forEach((date, name) -> result.add(new Holiday(date, name)));
            return List.copyOf(result);
        }
    }
}
