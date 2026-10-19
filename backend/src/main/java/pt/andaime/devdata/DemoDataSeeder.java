package pt.andaime.devdata;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pt.andaime.absences.application.AbsenceService;
import pt.andaime.absences.application.AbsenceService.AbsenceInput;
import pt.andaime.documents.application.DocumentService;
import pt.andaime.equipment.application.EquipmentService;
import pt.andaime.equipment.application.EquipmentService.ItemInput;
import pt.andaime.equipment.application.EquipmentService.Movement;
import pt.andaime.fleet.application.VehicleService;
import pt.andaime.fleet.application.VehicleService.VehicleInput;
import pt.andaime.organization.application.OrganizationService;
import pt.andaime.planning.application.PlanningService;
import pt.andaime.planning.application.PlanningViews.Command;
import pt.andaime.planning.domain.ConflictEngine.Severity;
import pt.andaime.shared.ids.Ids;
import pt.andaime.shared.tenant.TenantContext;
import pt.andaime.sites.application.ClientService;
import pt.andaime.sites.application.SiteService;
import pt.andaime.sites.application.SiteViews.ClientInput;
import pt.andaime.sites.application.SiteViews.SiteInput;
import pt.andaime.timekeeping.application.TimeEntryService;
import pt.andaime.timekeeping.application.TimekeepingViews.ManualEntry;
import pt.andaime.timekeeping.application.TimesheetService;
import pt.andaime.workforce.application.EmployeeService;
import pt.andaime.workforce.application.TeamService;
import pt.andaime.workforce.application.WorkforceViews.EmployeeInput;

/**
 * Empresa de demonstração para desenvolvimento e apresentações comerciais.
 * <p>
 * Só corre com {@code andaime.seed.demo.enabled=true}, nunca no perfil {@code prod}, e é idempotente:
 * se a empresa já existir para o dono indicado, não faz nada. Os dados passam pelos mesmos serviços da API
 * (validações, auditoria e RLS). Todos os nomes são fictícios.
 * <pre>
 * ./mvnw spring-boot:run -Dspring-boot.run.profiles=local -Dspring-boot.run.arguments="
 *   --andaime.seed.demo.enabled=true --andaime.seed.demo.owner-email=demo@andaime.test
 *   --andaime.seed.demo.owner-password=…"
 * </pre>
 */
@Component
@ConditionalOnProperty(name = "andaime.seed.demo.enabled", havingValue = "true")
class DemoDataSeeder implements ApplicationRunner {

    static final String COMPANY = "Construções Ribeira Alta (demonstração)";
    private static final Logger log = LoggerFactory.getLogger(DemoDataSeeder.class);

    private static final String[] FIRST = {"Tiago", "Rui", "Nuno", "Pedro", "João", "Miguel", "André", "Bruno", "Carlos",
        "Daniel", "Diogo", "Eduardo", "Fábio", "Filipe", "Gonçalo", "Hugo", "Ivo", "Jorge", "José", "Luís", "Marco", "Mário",
        "Paulo", "Ricardo", "Rodrigo", "Samuel", "Sérgio", "Vítor", "Joaquim", "Manuel", "Ana", "Sara", "Patrícia"};
    private static final String[] LAST = {"Moreira", "Fonseca", "Carvalho", "Teixeira", "Pacheco", "Antunes", "Barbosa",
        "Cardoso", "Correia", "Cunha", "Esteves", "Faria", "Figueiredo", "Freitas", "Gaspar", "Leal", "Macedo", "Matos",
        "Monteiro", "Neves", "Pinheiro", "Rebelo", "Sampaio", "Simões", "Soares", "Tavares", "Valente", "Vieira", "Pires"};
    private static final String[] TRADES = {"Pedreiro", "Carpinteiro de cofragem", "Armador de ferro", "Eletricista",
        "Canalizador", "Manobrador", "Serralheiro", "Servente"};
    private static final String[] CITIES = {"Braga", "Guimarães", "Barcelos", "Vila Verde", "Famalicão", "Amares", "Fafe"};

    record SiteSeed(String code, String name, String client, String clientCountry, String country, String city,
            String address, double lat, double lng, int limitHours, double done, String color, String team,
            int startOffsetDays, int durationDays) {
    }

    record TeamSeed(String name, String color, int size, String leader) {
    }

    static final List<TeamSeed> TEAMS = List.of(
            new TeamSeed("Estrutura Lisboa", "#2a78d6", 6, "Encarregado"),
            new TeamSeed("Cofragem Norte", "#d4652f", 5, "Encarregado"),
            new TeamSeed("Acabamentos Douro", "#1a9e72", 5, "Encarregado"),
            new TeamSeed("Algarve", "#8a4fc7", 5, "Chefe de equipa"),
            new TeamSeed("França Sul", "#c0457f", 5, "Encarregado"),
            new TeamSeed("França Norte", "#3f8a2a", 5, "Chefe de equipa"),
            new TeamSeed("Benelux", "#4a3aa7", 4, "Encarregado"),
            new TeamSeed("Baviera", "#8f8a14", 5, "Encarregado"));

    static final List<SiteSeed> SITES = List.of(
            new SiteSeed("OB-24-031", "Edifício Atlântida", "Atlântida Investimentos Imobiliários, S.A.", "PT", "PT", "Lisboa",
                    "Rua do Mar Vermelho, lote 2.14, 1990-000 Lisboa", 38.7685, -9.0975, 18000, 0.62, "#2a78d6",
                    "Estrutura Lisboa", -590, 860),
            new SiteSeed("OB-25-004", "Escola Básica de Gualtar", "EducaNorte — Gestão de Equipamentos, E.M.", "PT", "PT",
                    "Braga", "Rua da Escola Nova, 4710-000 Braga", 41.5655, -8.3975, 9000, 0.48, "#d4652f",
                    "Cofragem Norte", -250, 420),
            new SiteSeed("OB-25-012", "Hotel Ribeira Douro", "Douro Hospitality Group, Lda.", "PT", "PT", "Porto",
                    "Cais das Pedras, 4050-000 Porto", 41.1408, -8.6135, 9500, 0.71, "#1a9e72", "Acabamentos Douro", -310, 520),
            new SiteSeed("OB-25-019", "Centro Logístico Algarve", "LogiSul — Plataformas Logísticas, S.A.", "PT", "PT", "Loulé",
                    "Zona Industrial do Cadoiço, 8100-000 Loulé", 37.129, -8.04, 12000, 0.35, "#8a4fc7", "Algarve", -140, 480),
            new SiteSeed("OB-25-022", "Résidence Les Terrasses", "Immobilière Rhône Confluence SAS", "FR", "FR", "Lyon",
                    "18 quai Perrache, 69002 Lyon", 45.7485, 4.8167, 7000, 0.58, "#c0457f", "França Sul", -200, 380),
            new SiteSeed("OB-25-027", "Immeuble Voltaire", "Voltaire Patrimoine SCI", "FR", "FR", "Paris",
                    "112 boulevard Voltaire, 75011 Paris", 48.86, 2.379, 5200, 0.81, "#3f8a2a", "França Norte", -180, 260),
            new SiteSeed("OB-25-030", "Kanaal Kantoren", "Kanaal Offices NV", "BE", "BE", "Bruxelas",
                    "Quai des Usines 40, 1000 Bruxelles", 50.866, 4.35, 6400, 0.40, "#4a3aa7", "Benelux", -110, 330),
            new SiteSeed("OB-26-002", "Wohnanlage Isarpark", "Isar Wohnbau GmbH", "DE", "DE", "Munique",
                    "Isarauen 7, 81379 München", 48.111, 11.565, 4800, 0.965, "#8f8a14", "Baviera", -160, 230),
            new SiteSeed("OB-26-005", "Moradias Quinta da Lage", "Quinta da Lage Desenvolvimento, Lda.", "PT", "PT", "Sintra",
                    "Estrada da Lage, 2710-000 Sintra", 38.798, -9.39, 6000, 0, "#2196a8", null, 21, 300));

    private final Environment environment;
    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate transaction;
    private final Ids ids;
    private final Clock clock;
    private final OrganizationService organizations;
    private final EmployeeService employees;
    private final TeamService teams;
    private final ClientService clients;
    private final SiteService sites;
    private final VehicleService vehicles;
    private final PlanningService planning;
    private final TimeEntryService timeEntries;
    private final TimesheetService timesheets;
    private final DocumentService documents;
    private final EquipmentService equipment;
    private final AbsenceService absences;

    DemoDataSeeder(Environment environment, JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder,
            PlatformTransactionManager transactionManager, Ids ids, Clock clock, OrganizationService organizations,
            EmployeeService employees, TeamService teams, ClientService clients, SiteService sites,
            VehicleService vehicles, PlanningService planning, TimeEntryService timeEntries, TimesheetService timesheets,
            DocumentService documents, EquipmentService equipment, AbsenceService absences) {
        this.environment = environment;
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.transaction = new TransactionTemplate(transactionManager);
        this.ids = ids;
        this.clock = clock;
        this.organizations = organizations;
        this.employees = employees;
        this.teams = teams;
        this.clients = clients;
        this.sites = sites;
        this.vehicles = vehicles;
        this.planning = planning;
        this.timeEntries = timeEntries;
        this.timesheets = timesheets;
        this.documents = documents;
        this.equipment = equipment;
        this.absences = absences;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (environment.acceptsProfiles(Profiles.of("prod"))) {
            throw new IllegalStateException("A semente de demonstração nunca corre em produção.");
        }
        var email = environment.getRequiredProperty("andaime.seed.demo.owner-email").strip().toLowerCase();
        var password = environment.getRequiredProperty("andaime.seed.demo.owner-password");
        if (password.length() < 12) {
            throw new IllegalArgumentException("andaime.seed.demo.owner-password tem de ter pelo menos 12 caracteres.");
        }
        var userId = ensureOwner(email, password);
        try (var ignored = TenantContext.openForUser(userId)) {
            var exists = transaction.execute(status -> jdbcTemplate.queryForObject("""
                    SELECT EXISTS (SELECT 1 FROM memberships membership
                                   JOIN organizations organization ON organization.id = membership.organization_id
                                   WHERE membership.user_id = ? AND organization.name = ?)
                    """, Boolean.class, userId, COMPANY));
            if (Boolean.TRUE.equals(exists)) {
                log.info("Semente de demonstração: a empresa já existe para {}; nada a fazer.", email);
                return;
            }
        }
        var organizationId = ids.next();
        try (var ignored = TenantContext.open(organizationId, userId, "OWNER", null, ZoneId.of("Europe/Lisbon"))) {
            transaction.executeWithoutResult(status -> {
                organizations.create(organizationId, userId, COMPANY, "Construções Ribeira Alta, S.A. (fictícia)",
                        null, "PT", "Europe/Lisbon");
                seed();
            });
        }
        log.info("Semente de demonstração criada: {} (dono {}).", COMPANY, email);
    }

    private UUID ensureOwner(String email, String password) {
        return transaction.execute(status -> {
            var existing = jdbcTemplate.query("SELECT id FROM users WHERE email = ?",
                    (resultSet, rowNumber) -> resultSet.getObject(1, UUID.class), email);
            if (!existing.isEmpty()) {
                return existing.getFirst();
            }
            return jdbcTemplate.queryForObject("""
                    INSERT INTO users (email, password_hash, display_name, email_verified_at)
                    VALUES (?, ?, 'Marta Albuquerque (demo)', now()) RETURNING id
                    """, UUID.class, email, passwordEncoder.encode(password));
        });
    }

    private void seed() {
        var random = new Random(20261015);
        var today = TenantContext.today(clock);
        var number = 7100;

        Map<String, UUID> teamIds = new java.util.HashMap<>();
        Map<String, UUID> leaders = new java.util.HashMap<>();
        Map<String, List<UUID>> teamMembers = new java.util.HashMap<>();
        for (var team : TEAMS) {
            var members = new ArrayList<UUID>();
            for (int i = 0; i < team.size(); i++) {
                number += 3 + random.nextInt(9);
                var category = i == 0 ? team.leader() : TRADES[random.nextInt(TRADES.length)];
                var name = FIRST[random.nextInt(FIRST.length)] + " " + LAST[random.nextInt(LAST.length)] + " "
                        + LAST[random.nextInt(LAST.length)];
                members.add(employee(Integer.toString(number), name, category, random, today).id());
            }
            var created = teams.create(team.name(), team.color(), members.getFirst());
            teamIds.put(team.name(), created.id());
            leaders.put(team.name(), members.getFirst());
            teamMembers.put(team.name(), members);
            for (var member : members) {
                teams.addMember(created.id(), member, today);
            }
        }
        // Dois trabalhadores sem equipa (reserva).
        for (int i = 0; i < 2; i++) {
            number += 5;
            employee(Integer.toString(number), FIRST[random.nextInt(FIRST.length)] + " " + LAST[random.nextInt(LAST.length)],
                    "Servente", random, today);
        }

        // Uma carrinha por equipa (as letras da matrícula são fictícias) e uma de reserva na oficina.
        int plate = 10;
        for (var team : TEAMS) {
            plate += 7;
            var vehicle = vehicles.create(new VehicleInput("%02d-ZZ-%02d".formatted(plate, 90 - plate), "Renault", "Master",
                    team.size() + 1, "OPERATIONAL", 40000 + plate * 1500, today.plusDays(40 + plate * 5),
                    today.plusDays(plate == 24 ? 12 : 120 + plate), null, null));
            vehicles.linkTeam(teamIds.get(team.name()), vehicle.id(), today);
        }
        vehicles.create(new VehicleInput("99-ZZ-01", "Ford", "Transit", 9, "WORKSHOP", 182000, today.plusDays(90),
                today.plusDays(200), today.plusDays(5), "Embraiagem."));

        Map<String, UUID> siteIds = new java.util.HashMap<>();
        for (var site : SITES) {
            var client = clients.create(new ClientInput(site.client(), null, null, null, null, site.clientCountry()));
            var limitMin = site.limitHours() * 60;
            var realized = (int) Math.round(limitMin * site.done());
            var start = today.plusDays(site.startOffsetDays());
            var created = sites.create(new SiteInput(site.code(), site.name(), client.id(), site.country(), site.city(), site.address(),
                    BigDecimal.valueOf(site.lat()), BigDecimal.valueOf(site.lng()), null,
                    site.startOffsetDays() > 0 ? "PLANNED" : "ACTIVE", start, start.plusDays(site.durationDays()),
                    limitMin, realized, (int) Math.round(realized * 0.85), null,
                    site.team() == null ? null : leaders.get(site.team()), site.color(),
                    "Obra fictícia de demonstração.", null));
            if (site.team() != null && site.startOffsetDays() <= 0) {
                siteIds.put(site.team(), created.id());
            }
        }

        // Esta semana e a próxima: cada equipa na sua obra, de segunda a sexta, pelos mesmos comandos da API.
        var monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        for (var team : TEAMS) {
            var site = siteIds.get(team.name());
            if (site == null) {
                continue;
            }
            var command = new Command("SCHEDULE", null, null, teamMembers.get(team.name()), site, null,
                    today, monday.plusDays(11), List.of(1, 2, 3, 4, 5), LocalTime.of(8, 0), LocalTime.of(17, 0), null,
                    null, null, null, leaders.get(team.name()), null, null, null, null, List.of());
            var preview = planning.execute(command, true);
            var warnings = preview.newConflicts().stream().filter(c -> c.severity() == Severity.WARN).map(c -> c.id()).toList();
            planning.execute(new Command("SCHEDULE", null, null, command.employeeIds(), site, null, command.from(),
                    command.to(), command.weekdays(), command.start(), command.end(), null, null, null, null,
                    command.foremanEmployeeId(), null, null, null, null, warnings), false);
        }

        // Semana passada com horas registadas: quase todas aprovadas, uma equipa submetida e outra por submeter.
        var lastMonday = monday.minusDays(7);
        int index = 0;
        for (var team : TEAMS) {
            var site = siteIds.get(team.name());
            if (site == null) {
                continue;
            }
            for (var member : teamMembers.get(team.name())) {
                for (int day = 0; day < 5; day++) {
                    var late = random.nextInt(5) == 0;
                    timeEntries.create(new ManualEntry(member, site, lastMonday.plusDays(day), LocalTime.of(8, 0),
                            late ? LocalTime.of(18, 30) : LocalTime.of(17, 0), null, null, "Registo de demonstração"));
                }
                if (index == 0) {
                    continue;
                }
                timesheets.transition(member, lastMonday, "submit", null, null);
                if (index > 1) {
                    timesheets.transition(member, lastMonday, "approve", null, null);
                }
            }
            index++;
        }

        // Documentos: o A1 é exigido nas obras em França, Bélgica e Alemanha (aparece como aviso no planeamento).
        documents.types().stream().filter(t -> t.name().startsWith("Certificado A1")).findFirst()
                .ifPresent(a1 -> documents.setRequirements(a1.id(), false, List.of("FR", "BE", "DE")));

        // Fardamento e EPI com entregas à primeira equipa.
        var boots = equipment.saveItem(null, new ItemInput("Botas de segurança S3", "PPE", "STOCK", "42", 10, null));
        var vest = equipment.saveItem(null, new ItemInput("Colete refletor", "PPE", "STOCK", "L", 10, null));
        var helmet = equipment.saveItem(null, new ItemInput("Capacete com francalete", "PPE", "SERIAL", null, 0, null));
        equipment.receive(new Movement(boots.id(), null, 14, null, null, null, "Fornecedor — guia 2041"));
        equipment.receive(new Movement(vest.id(), null, 30, null, null, null, "Fornecedor — guia 2041"));
        equipment.receive(new Movement(helmet.id(), null, null, null,
                java.util.stream.IntStream.rangeClosed(1, 8).mapToObj(n -> "CAP-%03d".formatted(n)).toList(), null, null));
        var units = equipment.units(helmet.id());
        var crew = teamMembers.get(TEAMS.getFirst().name());
        for (int i = 0; i < crew.size(); i++) {
            equipment.deliver(new Movement(boots.id(), crew.get(i), 1, null, null, null, null));
            equipment.deliver(new Movement(vest.id(), crew.get(i), 1, null, null, null, null));
            equipment.deliver(new Movement(helmet.id(), crew.get(i), null, units.get(i).id(), null, null, null));
        }

        // Ausências: uma aprovada (com as atribuições retiradas) e um pedido por decidir.
        var second = teamMembers.get(TEAMS.get(1).name());
        var vacation = absences.request(new AbsenceInput(second.get(2), "VACATION", monday.plusDays(10), monday.plusDays(11), null,
                "Férias marcadas no início do ano"));
        absences.approve(vacation.id(), "REMOVE", null);
        absences.request(new AbsenceInput(second.get(3), "PERSONAL", monday.plusDays(9), monday.plusDays(9), null, "Consulta médica"));
    }

    private pt.andaime.workforce.application.WorkforceViews.EmployeeDetail employee(
            String number, String name, String category, Random random, LocalDate today) {
        var slug = java.text.Normalizer.normalize(name.toLowerCase(), java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").replaceAll("[^a-z ]", "").replace(' ', '.');
        return employees.create(new EmployeeInput(number, name, category,
                "+351 910 000 %03d".formatted(random.nextInt(1000)), slug + "@ribeira-alta.example", "Portuguesa",
                CITIES[random.nextInt(CITIES.length)], today.minusDays(200 + random.nextInt(3000)), "ACTIVE", 480,
                BigDecimal.valueOf(11 + random.nextInt(7)), List.of(), Map.of("tshirt", "L", "botas", "42"), null));
    }
}
