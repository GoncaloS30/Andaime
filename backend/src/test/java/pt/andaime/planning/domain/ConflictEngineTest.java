package pt.andaime.planning.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import pt.andaime.planning.domain.ConflictEngine.Assignment;
import pt.andaime.planning.domain.ConflictEngine.Conflict;
import pt.andaime.planning.domain.ConflictEngine.DateRange;
import pt.andaime.planning.domain.ConflictEngine.Employee;
import pt.andaime.planning.domain.ConflictEngine.Severity;
import pt.andaime.planning.domain.ConflictEngine.Site;
import pt.andaime.planning.domain.ConflictEngine.Snapshot;
import pt.andaime.planning.domain.ConflictEngine.Vehicle;

/** Mesmas regras de {@code src/domain/conflicts.test.ts}, com períodos absolutos e regras por empresa. */
class ConflictEngineTest {

    private static final ZoneId LISBON = ZoneId.of("Europe/Lisbon");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 15);

    private final UUID ana = UUID.randomUUID();
    private final UUID rui = UUID.randomUUID();
    private final UUID leader = UUID.randomUUID();
    private final UUID siteA = UUID.randomUUID();
    private final UUID siteB = UUID.randomUUID();
    private final UUID van = UUID.randomUUID();
    private final UUID spare = UUID.randomUUID();

    private final Map<UUID, Employee> employees = new HashMap<>(Map.of(
            ana, new Employee(ana, "Ana", "Pedreiro", true, 480),
            rui, new Employee(rui, "Rui", "Servente", true, 480),
            leader, new Employee(leader, "Joana", "Encarregado", true, 480)));
    private final Map<UUID, Site> sites = new HashMap<>(Map.of(
            siteA, new Site(siteA, "OB-26-001", "Edifício A", "ACTIVE", null, 0, 0),
            siteB, new Site(siteB, "OB-26-002", "Edifício B", "ACTIVE", null, 0, 0)));
    private final Map<UUID, Vehicle> vehicles = new HashMap<>(Map.of(
            van, new Vehicle(van, "AA-00-AA", 2, "OPERATIONAL", null, null, false, List.of()),
            spare, new Vehicle(spare, "BB-11-BB", 9, "OPERATIONAL", null, null, false, List.of())));
    private final Map<String, Severity> rules = new HashMap<>();

    private Assignment at(UUID employee, UUID site, LocalDate date, String start, String end, UUID vehicle, boolean foreman) {
        var s = LocalTime.parse(start);
        var e = LocalTime.parse(end);
        var startAt = date.atTime(s).atZone(LISBON).toInstant();
        var endAt = (e.isAfter(s) ? date : date.plusDays(1)).atTime(e).atZone(LISBON).toInstant();
        var minutes = (int) java.time.Duration.between(startAt, endAt).toMinutes();
        return new Assignment(UUID.randomUUID(), employee, site, date, s, e, minutes > 360 ? minutes - 60 : minutes,
                startAt, endAt, vehicle, foreman);
    }

    private List<Conflict> detect(Assignment... assignments) {
        return ConflictEngine.detect(new Snapshot(TODAY, List.of(assignments), employees, vehicles, sites, rules));
    }

    private static List<String> types(List<Conflict> conflicts) {
        return conflicts.stream().map(Conflict::type).toList();
    }

    @Test
    void duasObrasNoMesmoDiaSemSobreposicaoSaoPermitidas() {
        var conflicts = detect(at(ana, siteA, TODAY, "08:00", "12:00", null, false), at(ana, siteB, TODAY, "13:00", "17:00", null, false));
        assertThat(conflicts).isEmpty();
    }

    @Test
    void horariosSobrepostosBloqueiamMesmoQueAsRegrasEstejamDesligadas() {
        rules.put("EMPLOYEE_OVERLAP", Severity.OFF);
        var conflicts = detect(at(ana, siteA, TODAY, "08:00", "12:00", null, false), at(ana, siteB, TODAY, "11:00", "15:00", null, false));
        assertThat(conflicts).singleElement().satisfies(c -> {
            assertThat(c.type()).isEqualTo("EMPLOYEE_OVERLAP");
            assertThat(c.severity()).isEqualTo(Severity.BLOCK);
            assertThat(c.fixes()).hasSize(2).allMatch(f -> f.kind().equals("REMOVE_ASSIGNMENTS"));
        });
    }

    @Test
    void turnoNoturnoSobrepoeSeAoDiaSeguinte() {
        var night = at(ana, siteA, TODAY, "22:00", "06:00", null, false);
        var morning = at(ana, siteB, TODAY.plusDays(1), "05:00", "09:00", null, false);
        assertThat(types(detect(night, morning))).containsExactly("EMPLOYEE_OVERLAP");
        var later = at(ana, siteB, TODAY.plusDays(1), "07:00", "11:00", null, false);
        assertThat(detect(night, later)).isEmpty();
    }

    @Test
    void acimaDaCapacidadeDiariaEAvisoConfiguravel() {
        var a = at(ana, siteA, TODAY, "06:00", "12:00", null, false);
        var b = at(ana, siteB, TODAY, "12:00", "18:00", null, false);
        assertThat(detect(a, b)).singleElement().satisfies(c -> {
            assertThat(c.type()).isEqualTo("DAILY_CAPACITY");
            assertThat(c.severity()).isEqualTo(Severity.WARN);
        });
        rules.put("DAILY_CAPACITY", Severity.OFF);
        assertThat(detect(a, b)).isEmpty();
        rules.put("DAILY_CAPACITY", Severity.BLOCK);
        assertThat(detect(a, b).getFirst().severity()).isEqualTo(Severity.BLOCK);
    }

    @Test
    void trabalhadorInativoNaoPodeSerPlaneado() {
        employees.put(rui, new Employee(rui, "Rui", "Servente", false, 480));
        assertThat(types(detect(at(rui, siteA, TODAY, "08:00", "17:00", null, false)))).containsExactly("UNAVAILABLE");
    }

    @Test
    void diasPassadosNaoGeramConflitos() {
        employees.put(rui, new Employee(rui, "Rui", "Servente", false, 480));
        assertThat(detect(at(rui, siteA, TODAY.minusDays(1), "08:00", "17:00", null, false))).isEmpty();
    }

    @Test
    void viaturaEmDuasObrasAoMesmoTempoBloqueiaEPropoeAlternativas() {
        var conflicts = detect(at(ana, siteA, TODAY, "08:00", "17:00", van, false), at(rui, siteB, TODAY, "09:00", "16:00", van, false));
        var overlap = conflicts.stream().filter(c -> c.type().equals("VEHICLE_OVERLAP")).findFirst().orElseThrow();
        assertThat(overlap.severity()).isEqualTo(Severity.BLOCK);
        assertThat(overlap.fixes()).extracting(ConflictEngine.Fix::label).contains("Trocar para BB-11-BB (9 lugares)", "Retirar a viatura");
    }

    @Test
    void viaturaPodeServirDuasObrasEmHorasDiferentes() {
        assertThat(detect(at(ana, siteA, TODAY, "08:00", "12:00", van, false), at(rui, siteB, TODAY, "13:00", "17:00", van, false)))
                .extracting(Conflict::type).doesNotContain("VEHICLE_OVERLAP");
    }

    @Test
    void lotacaoEIndisponibilidadeDaViatura() {
        var three = detect(at(ana, siteA, TODAY, "08:00", "17:00", van, false), at(rui, siteA, TODAY, "08:00", "17:00", van, false),
                at(leader, siteA, TODAY, "08:00", "17:00", van, false));
        assertThat(types(three)).contains("VEHICLE_CAPACITY");

        vehicles.put(van, new Vehicle(van, "AA-00-AA", 9, "OPERATIONAL", null, TODAY.minusDays(1), false, List.of()));
        assertThat(detect(at(ana, siteA, TODAY, "08:00", "17:00", van, false)).getFirst().explanation()).contains("inspeção caducada");
        vehicles.put(van, new Vehicle(van, "AA-00-AA", 9, "OPERATIONAL", null, null, false, List.of(new DateRange(TODAY, TODAY))));
        assertThat(types(detect(at(ana, siteA, TODAY, "08:00", "17:00", van, false)))).containsExactly("VEHICLE_UNAVAILABLE");
    }

    @Test
    void obraComVariasPessoasPrecisaDeResponsavel() {
        assertThat(types(detect(at(ana, siteA, TODAY, "08:00", "17:00", null, false), at(rui, siteA, TODAY, "08:00", "17:00", null, false))))
                .containsExactly("MISSING_FOREMAN");
        assertThat(detect(at(ana, siteA, TODAY, "08:00", "17:00", null, true), at(rui, siteA, TODAY, "08:00", "17:00", null, false))).isEmpty();
        assertThat(detect(at(leader, siteA, TODAY, "08:00", "17:00", null, false), at(rui, siteA, TODAY, "08:00", "17:00", null, false))).isEmpty();
    }

    @Test
    void obraQueVaiExcederOLimite() {
        sites.put(siteA, new Site(siteA, "OB-26-001", "Edifício A", "ACTIVE", 6000, 5000, 1200));
        var conflicts = ConflictEngine.detect(new Snapshot(TODAY, new ArrayList<>(), employees, vehicles, sites, rules));
        assertThat(conflicts).singleElement().satisfies(c -> {
            assertThat(c.type()).isEqualTo("SITE_HOUR_LIMIT");
            assertThat(c.explanation()).contains("excede em 3 h 20");
        });
    }

    @Test
    void idsSaoEstaveisParaCompararAntesEDepois() {
        var a = at(ana, siteA, TODAY, "08:00", "12:00", null, false);
        var b = at(ana, siteB, TODAY, "11:00", "15:00", null, false);
        assertThat(detect(a, b).getFirst().id()).isEqualTo(detect(b, a).getFirst().id());
    }
}
