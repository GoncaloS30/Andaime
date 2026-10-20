package pt.andaime.planning.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Deteção de conflitos de planeamento (porta de {@code src/domain/conflicts.ts}), pura e determinística:
 * recebe um retrato dos dados e devolve conflitos com explicação e correções sugeridas. Os ids dos
 * conflitos são estáveis (tipo + chaves), para se poder comparar "antes" e "depois" de um comando e
 * para o utilizador reconhecer avisos.
 * <p>
 * Ausências e documentos entram quando esses módulos existirem (F5).
 */
public final class ConflictEngine {

    public enum Severity { BLOCK, WARN, OFF }

    /** Regras que não são configuráveis: impossibilidades físicas, também garantidas pela base de dados. */
    public static final Set<String> HARD = Set.of("EMPLOYEE_OVERLAP", "VEHICLE_OVERLAP");

    static final Map<String, Severity> DEFAULTS = Map.of(
            "EMPLOYEE_OVERLAP", Severity.BLOCK,
            "VEHICLE_OVERLAP", Severity.BLOCK,
            "UNAVAILABLE", Severity.BLOCK,
            "DAILY_CAPACITY", Severity.WARN,
            "VEHICLE_UNAVAILABLE", Severity.BLOCK,
            "VEHICLE_CAPACITY", Severity.WARN,
            "MISSING_FOREMAN", Severity.WARN,
            "SITE_HOUR_LIMIT", Severity.WARN,
            "ABSENCE", Severity.BLOCK,
            "DOCUMENT_MISSING", Severity.WARN);

    static final Set<String> LEADER_CATEGORIES = Set.of("Encarregado", "Chefe de equipa");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE dd/MM", Locale.forLanguageTag("pt-PT"));

    public record Assignment(UUID id, UUID employeeId, UUID siteId, LocalDate date, LocalTime start, LocalTime end,
            int plannedMin, Instant periodStart, Instant periodEnd, UUID vehicleId, boolean foreman) {
    }

    public record Employee(UUID id, String name, String category, boolean active, int dailyCapacityMin) {
    }

    public record DateRange(LocalDate from, LocalDate to) {
        boolean contains(LocalDate date) {
            return !date.isBefore(from) && !date.isAfter(to);
        }
    }

    public record Vehicle(UUID id, String plate, int seats, String status, LocalDate insuranceUntil,
            LocalDate inspectionUntil, boolean archived, List<DateRange> unavailable) {
    }

    public record Site(UUID id, String code, String name, String status, Integer limitMin, int baselineRealizedMin,
            int plannedFromTodayMin, String country) {

        public Site(UUID id, String code, String name, String status, Integer limitMin, int baselineRealizedMin,
                int plannedFromTodayMin) {
            this(id, code, name, status, limitMin, baselineRealizedMin, plannedFromTodayMin, null);
        }
    }

    /** Documento obrigatório para trabalhar em obras de um país ({@code country} nulo = em todas). */
    public record Requirement(UUID typeId, String typeName, String country) {
    }

    /**
     * @param absences  ausências aprovadas de dia inteiro, por trabalhador
     * @param documents validade do documento atual por {@code trabalhador:tipo} ({@link LocalDate#MAX} sem validade)
     */
    public record Snapshot(LocalDate today, List<Assignment> assignments, Map<UUID, Employee> employees,
            Map<UUID, Vehicle> vehicles, Map<UUID, Site> sites, Map<String, Severity> rules,
            Map<UUID, List<DateRange>> absences, List<Requirement> requirements, Map<String, LocalDate> documents) {

        public Snapshot(LocalDate today, List<Assignment> assignments, Map<UUID, Employee> employees,
                Map<UUID, Vehicle> vehicles, Map<UUID, Site> sites, Map<String, Severity> rules) {
            this(today, assignments, employees, vehicles, sites, rules, Map.of(), List.of(), Map.of());
        }
    }

    public record Fix(String id, String label, String kind, Map<String, Object> params) {
    }

    public record Conflict(String id, String type, Severity severity, LocalDate date, String title, String explanation,
            List<UUID> employeeIds, List<UUID> siteIds, List<UUID> vehicleIds, List<UUID> assignmentIds, List<Fix> fixes) {
    }

    private ConflictEngine() {
    }

    public static List<Conflict> detect(Snapshot snapshot) {
        var out = new ArrayList<Conflict>();
        var upcoming = snapshot.assignments().stream().filter(a -> !a.date().isBefore(snapshot.today())).toList();
        byEmployee(snapshot, upcoming, out);
        byVehicle(snapshot, upcoming, out);
        bySite(snapshot, upcoming, out);
        siteLimits(snapshot, out);
        out.sort(Comparator.comparing((Conflict c) -> c.severity() == Severity.BLOCK ? 0 : 1)
                .thenComparing(c -> c.date() == null ? LocalDate.MIN : c.date())
                .thenComparing(Conflict::id));
        return out;
    }

    public static Severity severity(Snapshot snapshot, String rule) {
        if (HARD.contains(rule)) {
            return Severity.BLOCK;
        }
        return snapshot.rules().getOrDefault(rule, DEFAULTS.getOrDefault(rule, Severity.WARN));
    }

    // --- trabalhador -----------------------------------------------------------------------

    private static void byEmployee(Snapshot s, List<Assignment> upcoming, List<Conflict> out) {
        // Indexado por trabalhador uma vez: a procura de sobreposições fica linear no número de atribuições.
        var perEmployee = upcoming.stream().collect(Collectors.groupingBy(Assignment::employeeId));
        var byEmployeeDate = upcoming.stream().collect(Collectors.groupingBy(
                a -> a.employeeId() + "|" + a.date(), LinkedHashMap::new, Collectors.toList()));
        var overlapsReported = new LinkedHashSet<String>();
        for (var group : byEmployeeDate.values()) {
            var first = group.getFirst();
            var employee = s.employees().get(first.employeeId());
            var name = employee == null ? "Trabalhador" : employee.name();
            var date = first.date();

            if (employee != null && !employee.active()) {
                add(s, out, "UNAVAILABLE", key("UNAVAILABLE", first.employeeId(), date), date,
                        name + " está inativo",
                        name + " está inativo ou arquivado mas tem trabalho planeado a " + day(date) + ".",
                        List.of(first.employeeId()), sites(group), List.of(), ids(group), removeFixes(s, group));
            }

            var absent = s.absences().getOrDefault(first.employeeId(), List.of()).stream().anyMatch(r -> r.contains(date));
            if (absent) {
                add(s, out, "ABSENCE", key("ABSENCE", first.employeeId(), date), date,
                        name + " está ausente",
                        name + " tem uma ausência aprovada a " + day(date) + " mas tem trabalho planeado.",
                        List.of(first.employeeId()), sites(group), List.of(), ids(group), removeFixes(s, group));
            }

            var missing = missingDocuments(s, first.employeeId(), date, group);
            if (!missing.isEmpty()) {
                var fixes = new ArrayList<Fix>();
                fixes.add(new Fix("OPEN_DOCUMENTS:" + first.employeeId(), "Ver documentos", "OPEN_DOCUMENTS",
                        Map.of("employeeId", first.employeeId())));
                fixes.addAll(removeFixes(s, group));
                add(s, out, "DOCUMENT_MISSING", key("DOCUMENT_MISSING", first.employeeId(), date), date,
                        name + " tem documentos em falta",
                        name + " não tem válido a " + day(date) + ": " + String.join(", ", missing) + ".",
                        List.of(first.employeeId()), sites(group), List.of(), ids(group), fixes);
            }

            // Sobreposição: compara períodos absolutos (inclui turnos que passam a meia-noite).
            var sorted = new ArrayList<>(employeeAssignmentsAround(perEmployee.get(first.employeeId()), date));
            sorted.sort(Comparator.comparing(Assignment::periodStart));
            for (int i = 0; i < sorted.size(); i++) {
                for (int j = i + 1; j < sorted.size(); j++) {
                    var a = sorted.get(i);
                    var b = sorted.get(j);
                    if (b.periodStart().isBefore(a.periodEnd())) {
                        var conflictDate = a.date().isBefore(b.date()) ? a.date() : b.date();
                        var id = key("EMPLOYEE_OVERLAP", first.employeeId(), conflictDate);
                        if (overlapsReported.add(id)) {
                            var pair = List.of(a, b);
                            add(s, out, "EMPLOYEE_OVERLAP", id, conflictDate,
                                    name + " está em dois sítios ao mesmo tempo",
                                    name + " tem horários sobrepostos a " + day(conflictDate) + ": "
                                            + describe(s, a) + " e " + describe(s, b) + ".",
                                    List.of(first.employeeId()), sites(pair), List.of(), ids(pair), removeFixes(s, pair));
                        }
                    }
                }
            }

            var planned = group.stream().mapToInt(Assignment::plannedMin).sum();
            var capacity = employee == null ? 480 : employee.dailyCapacityMin();
            if (planned > capacity) {
                var last = group.stream().max(Comparator.comparing(Assignment::periodStart)).orElseThrow();
                add(s, out, "DAILY_CAPACITY", key("DAILY_CAPACITY", first.employeeId(), date), date,
                        name + " acima da capacidade diária",
                        name + " tem " + hours(planned) + " planeadas a " + day(date) + " para uma capacidade de "
                                + hours(capacity) + ".",
                        List.of(first.employeeId()), sites(group), List.of(), ids(group), removeFixes(s, List.of(last)));
            }
        }
    }

    private static List<Assignment> employeeAssignmentsAround(List<Assignment> ofEmployee, LocalDate date) {
        // Inclui a véspera e o dia seguinte por causa dos turnos noturnos.
        return ofEmployee.stream().filter(a -> !a.date().isBefore(date.minusDays(1)) && !a.date().isAfter(date.plusDays(1))).toList();
    }

    // --- viatura ---------------------------------------------------------------------------

    private static void byVehicle(Snapshot s, List<Assignment> upcoming, List<Conflict> out) {
        var byVehicleDate = upcoming.stream().filter(a -> a.vehicleId() != null).collect(Collectors.groupingBy(
                a -> a.vehicleId() + "|" + a.date(), LinkedHashMap::new, Collectors.toList()));
        var usedOn = new HashMap<LocalDate, Set<UUID>>();
        upcoming.stream().filter(a -> a.vehicleId() != null)
                .forEach(a -> usedOn.computeIfAbsent(a.date(), d -> new LinkedHashSet<>()).add(a.vehicleId()));

        for (var group : byVehicleDate.values()) {
            var first = group.getFirst();
            var vehicle = s.vehicles().get(first.vehicleId());
            var date = first.date();
            var plate = vehicle == null ? "Viatura" : vehicle.plate();
            var riders = group.stream().map(Assignment::employeeId).distinct().count();

            // Mesma viatura em obras diferentes com períodos sobrepostos.
            var bySite = group.stream().collect(Collectors.groupingBy(Assignment::siteId, LinkedHashMap::new, Collectors.toList()));
            if (bySite.size() > 1) {
                var siteGroups = new ArrayList<>(bySite.values());
                outer:
                for (int i = 0; i < siteGroups.size(); i++) {
                    for (int j = i + 1; j < siteGroups.size(); j++) {
                        for (var a : siteGroups.get(i)) {
                            for (var b : siteGroups.get(j)) {
                                if (a.periodStart().isBefore(b.periodEnd()) && b.periodStart().isBefore(a.periodEnd())) {
                                    var losers = siteGroups.get(j);
                                    var fixes = new ArrayList<Fix>();
                                    alternatives(s, usedOn, List.of(date), (int) losers.stream().map(Assignment::employeeId).distinct().count(), first.vehicleId())
                                            .forEach(v -> fixes.add(vehicleFix(losers, v)));
                                    fixes.add(vehicleFix(losers, null));
                                    add(s, out, "VEHICLE_OVERLAP", key("VEHICLE_OVERLAP", first.vehicleId(), date), date,
                                            plate + " em duas obras ao mesmo tempo",
                                            "A viatura " + plate + " está em " + siteName(s, a.siteId()) + " e em "
                                                    + siteName(s, b.siteId()) + " a " + day(date) + " em horários sobrepostos.",
                                            List.of(), new ArrayList<>(bySite.keySet()), List.of(first.vehicleId()), ids(group), fixes);
                                    break outer;
                                }
                            }
                        }
                    }
                }
            }

            if (vehicle != null) {
                var problem = vehicleProblem(vehicle, date);
                if (problem != null) {
                    var fixes = new ArrayList<Fix>();
                    alternatives(s, usedOn, List.of(date), (int) riders, vehicle.id()).forEach(v -> fixes.add(vehicleFix(group, v)));
                    fixes.add(vehicleFix(group, null));
                    add(s, out, "VEHICLE_UNAVAILABLE", key("VEHICLE_UNAVAILABLE", vehicle.id(), date), date,
                            plate + " indisponível",
                            "A viatura " + plate + " " + problem + " e está planeada para " + day(date) + ".",
                            List.of(), sites(group), List.of(vehicle.id()), ids(group), fixes);
                }
                if (riders > vehicle.seats()) {
                    var fixes = new ArrayList<Fix>();
                    alternatives(s, usedOn, List.of(date), (int) riders, vehicle.id()).forEach(v -> fixes.add(vehicleFix(group, v)));
                    add(s, out, "VEHICLE_CAPACITY", key("VEHICLE_CAPACITY", vehicle.id(), date), date,
                            plate + " com mais pessoas do que lugares",
                            riders + " pessoas planeadas na " + plate + " (" + vehicle.seats() + " lugares) a " + day(date) + ".",
                            List.of(), sites(group), List.of(vehicle.id()), ids(group), fixes);
                }
            }
        }
    }

    static String vehicleProblem(Vehicle v, LocalDate date) {
        if (v.archived() || "INACTIVE".equals(v.status())) {
            return "está inativa";
        }
        if ("WORKSHOP".equals(v.status())) {
            return "está na oficina";
        }
        if (v.inspectionUntil() != null && v.inspectionUntil().isBefore(date)) {
            return "tem a inspeção caducada desde " + v.inspectionUntil();
        }
        if (v.insuranceUntil() != null && v.insuranceUntil().isBefore(date)) {
            return "tem o seguro caducado desde " + v.insuranceUntil();
        }
        for (var range : v.unavailable()) {
            if (range.contains(date)) {
                return "está indisponível nesse dia";
            }
        }
        return null;
    }

    private static List<Vehicle> alternatives(Snapshot s, Map<LocalDate, Set<UUID>> usedOn, List<LocalDate> dates,
            int seatsNeeded, UUID exclude) {
        return s.vehicles().values().stream()
                .filter(v -> !v.id().equals(exclude) && v.seats() >= seatsNeeded)
                .filter(v -> dates.stream().allMatch(d -> vehicleProblem(v, d) == null
                        && !usedOn.getOrDefault(d, Set.of()).contains(v.id())))
                .sorted(Comparator.comparingInt(Vehicle::seats).thenComparing(Vehicle::plate))
                .limit(3)
                .toList();
    }

    private static Fix vehicleFix(List<Assignment> group, Vehicle vehicle) {
        var params = new LinkedHashMap<String, Object>();
        params.put("assignmentIds", ids(group));
        params.put("vehicleId", vehicle == null ? null : vehicle.id());
        return new Fix("SET_VEHICLE:" + (vehicle == null ? "none" : vehicle.id()),
                vehicle == null ? "Retirar a viatura" : "Trocar para " + vehicle.plate() + " (" + vehicle.seats() + " lugares)",
                "SET_VEHICLE", params);
    }

    // --- obra --------------------------------------------------------------------------------

    private static void bySite(Snapshot s, List<Assignment> upcoming, List<Conflict> out) {
        var bySiteDate = upcoming.stream().collect(Collectors.groupingBy(
                a -> a.siteId() + "|" + a.date(), LinkedHashMap::new, Collectors.toList()));
        for (var group : bySiteDate.values()) {
            var people = group.stream().map(Assignment::employeeId).distinct().toList();
            if (people.size() < 2) {
                continue;
            }
            var hasLeader = group.stream().anyMatch(a -> a.foreman() || isLeader(s, a.employeeId()));
            if (hasLeader) {
                continue;
            }
            var first = group.getFirst();
            var candidate = group.stream().min(Comparator.comparing(a -> name(s, a.employeeId()))).orElseThrow();
            var params = new LinkedHashMap<String, Object>();
            params.put("assignmentId", candidate.id());
            add(s, out, "MISSING_FOREMAN", key("MISSING_FOREMAN", first.siteId(), first.date()), first.date(),
                    "Sem encarregado em " + siteName(s, first.siteId()),
                    people.size() + " trabalhadores em " + siteName(s, first.siteId()) + " a " + day(first.date())
                            + " sem encarregado nem chefe de equipa.",
                    people, List.of(first.siteId()), List.of(), ids(group),
                    List.of(new Fix("SET_FOREMAN:" + candidate.id(), "Indicar " + name(s, candidate.employeeId()) + " como responsável",
                            "SET_FOREMAN", params)));
        }
    }

    private static void siteLimits(Snapshot s, List<Conflict> out) {
        for (var site : s.sites().values()) {
            if (!"ACTIVE".equals(site.status()) || site.limitMin() == null || site.limitMin() <= 0) {
                continue;
            }
            var projection = site.baselineRealizedMin() + site.plannedFromTodayMin();
            if (projection > site.limitMin()) {
                var params = new LinkedHashMap<String, Object>();
                params.put("siteId", site.id());
                add(s, out, "SITE_HOUR_LIMIT", "SITE_HOUR_LIMIT:" + site.id(), null,
                        site.code() + " vai exceder o limite de horas",
                        "Realizadas e planeadas somam " + hours(projection) + " para um limite de " + hours(site.limitMin())
                                + " (excede em " + hours(projection - site.limitMin()) + ").",
                        List.of(), List.of(site.id()), List.of(), List.of(),
                        List.of(new Fix("OPEN_SITE:" + site.id(), "Rever a obra", "OPEN_SITE", params)));
            }
        }
    }

    // --- auxiliares --------------------------------------------------------------------------

    private static void add(Snapshot s, List<Conflict> out, String rule, String id, LocalDate date, String title,
            String explanation, List<UUID> employees, List<UUID> sites, List<UUID> vehicles, List<UUID> assignments,
            List<Fix> fixes) {
        var severity = severity(s, rule);
        if (severity == Severity.OFF) {
            return;
        }
        out.add(new Conflict(id, rule, severity, date, title, explanation, List.copyOf(employees), List.copyOf(sites),
                List.copyOf(vehicles), List.copyOf(assignments), List.copyOf(fixes)));
    }

    private static List<String> missingDocuments(Snapshot s, UUID employeeId, LocalDate date, List<Assignment> group) {
        if (s.requirements().isEmpty()) {
            return List.of();
        }
        var countries = group.stream().map(a -> s.sites().get(a.siteId())).filter(java.util.Objects::nonNull)
                .map(Site::country).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        var missing = new ArrayList<String>();
        for (var requirement : s.requirements()) {
            if (requirement.country() != null && !countries.contains(requirement.country())) {
                continue;
            }
            var expires = s.documents().get(employeeId + ":" + requirement.typeId());
            if ((expires == null || expires.isBefore(date)) && !missing.contains(requirement.typeName())) {
                missing.add(requirement.typeName());
            }
        }
        return missing;
    }

    private static List<Fix> removeFixes(Snapshot s, List<Assignment> assignments) {
        var fixes = new ArrayList<Fix>();
        for (var a : assignments) {
            var params = new LinkedHashMap<String, Object>();
            params.put("assignmentIds", List.of(a.id()));
            fixes.add(new Fix("REMOVE:" + a.id(), "Retirar de " + siteName(s, a.siteId()) + " (" + a.start() + "–" + a.end() + ")",
                    "REMOVE_ASSIGNMENTS", params));
        }
        return fixes;
    }

    private static boolean isLeader(Snapshot s, UUID employeeId) {
        var employee = s.employees().get(employeeId);
        return employee != null && LEADER_CATEGORIES.contains(employee.category());
    }

    private static String name(Snapshot s, UUID employeeId) {
        var employee = s.employees().get(employeeId);
        return employee == null ? "Trabalhador" : employee.name();
    }

    private static String siteName(Snapshot s, UUID siteId) {
        var site = s.sites().get(siteId);
        return site == null ? "obra" : site.code() + " " + site.name();
    }

    private static String describe(Snapshot s, Assignment a) {
        return siteName(s, a.siteId()) + " " + a.start() + "–" + a.end();
    }

    private static List<UUID> ids(Collection<Assignment> assignments) {
        return assignments.stream().map(Assignment::id).distinct().toList();
    }

    private static List<UUID> sites(Collection<Assignment> assignments) {
        return assignments.stream().map(Assignment::siteId).distinct().toList();
    }

    private static String key(String type, UUID subject, LocalDate date) {
        return type + ":" + subject + ":" + date;
    }

    static String day(LocalDate date) {
        return DAY.format(date);
    }

    static String hours(int minutes) {
        var h = minutes / 60;
        var m = minutes % 60;
        return m == 0 ? h + " h" : h + " h " + String.format("%02d", m);
    }
}
