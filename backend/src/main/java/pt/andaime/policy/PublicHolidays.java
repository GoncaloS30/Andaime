package pt.andaime.policy;

import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import pt.andaime.policy.domain.NationalHolidays;

/**
 * Contrato público do módulo: feriados nacionais por país, para o cálculo de horas e para as Definições.
 * <p>
 * A tabela global {@code public_holidays} é a fonte de verdade; cada (país, ano) é carregado do calendário em Java
 * ({@link NationalHolidays}) na primeira vez que é preciso, de forma idempotente, através da função
 * {@code app.ensure_public_holidays} (V25). O carregamento corre numa transação própria porque é muitas vezes pedido
 * a partir de leituras ({@code readOnly}); depois de feito, fica memorizado neste processo.
 * Países sem calendário devolvem só o que já estiver na tabela.
 * <p>
 * {@code andaime.holidays.national-in-hours=false} tira os feriados nacionais do cálculo de horas (a lista continua
 * disponível). Os testes de integração usam-no porque trabalham com datas relativas a hoje.
 */
@Component
public class PublicHolidays {

    public record Holiday(LocalDate date, String name) {
    }

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate loader;
    private final Set<String> loaded = ConcurrentHashMap.newKeySet();
    private final boolean inHours;

    PublicHolidays(JdbcTemplate jdbcTemplate, PlatformTransactionManager transactionManager,
            @Value("${andaime.holidays.national-in-hours:true}") boolean inHours) {
        this.jdbcTemplate = jdbcTemplate;
        this.inHours = inHours;
        this.loader = new TransactionTemplate(transactionManager);
        this.loader.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Países com calendário nacional. */
    public static List<String> supportedCountries() {
        return NationalHolidays.SUPPORTED;
    }

    /** Feriados nacionais de um país num ano, por data. */
    public List<Holiday> national(String country, int year) {
        ensure(country, year);
        return jdbcTemplate.query("""
                SELECT holiday_date, name FROM public_holidays
                WHERE country = ? AND region = '' AND holiday_date BETWEEN ? AND ? ORDER BY holiday_date
                """, (resultSet, rowNumber) -> new Holiday(resultSet.getObject(1, LocalDate.class), resultSet.getString(2)),
                country, LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
    }

    /** Datas dos feriados nacionais de cada país entre {@code from} e {@code to} (inclusive). */
    public Map<String, Set<LocalDate>> dates(Collection<String> countries, LocalDate from, LocalDate to) {
        var result = new HashMap<String, Set<LocalDate>>();
        var wanted = countries.stream().filter(c -> c != null && !c.isBlank()).map(String::strip).distinct().toList();
        if (!inHours) {
            wanted.forEach(country -> result.put(country, new HashSet<>()));
            return result;
        }
        if (wanted.isEmpty()) {
            return result;
        }
        for (var country : wanted) {
            result.put(country, new HashSet<>());
            for (int year = from.getYear(); year <= to.getYear(); year++) {
                ensure(country, year);
            }
        }
        jdbcTemplate.query("""
                SELECT country, holiday_date FROM public_holidays
                WHERE region = '' AND country = ANY (?::char(2)[]) AND holiday_date BETWEEN ? AND ?
                """, resultSet -> {
            result.get(resultSet.getString(1).strip()).add(resultSet.getObject(2, LocalDate.class));
        }, (Object) wanted.toArray(String[]::new), from, to);
        return result;
    }

    /** Garante que os feriados nacionais do país e ano estão na tabela (sem efeito para países sem calendário). */
    public void ensure(String country, int year) {
        if (!NationalHolidays.supports(country) || year < 1900 || year > 2200 || loaded.contains(country + year)) {
            return;
        }
        var json = new StringBuilder("[");
        for (var holiday : NationalHolidays.of(country, year)) {
            if (json.length() > 1) {
                json.append(',');
            }
            json.append("{\"date\":\"").append(holiday.date()).append("\",\"name\":\"")
                    .append(holiday.name().replace("\\", "\\\\").replace("\"", "\\\"")).append("\"}");
        }
        json.append(']');
        loader.executeWithoutResult(status -> jdbcTemplate.queryForObject(
                "SELECT app.ensure_public_holidays(?::char(2), ?, ?::jsonb)", Integer.class, country, year, json.toString()));
        loaded.add(country + year);
    }
}
