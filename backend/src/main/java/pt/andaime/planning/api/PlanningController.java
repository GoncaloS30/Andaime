package pt.andaime.planning.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.planning.application.PlanningService;
import pt.andaime.planning.application.PlanningViews.Board;
import pt.andaime.planning.application.PlanningViews.ChangeSetView;
import pt.andaime.planning.application.PlanningViews.Command;
import pt.andaime.planning.application.PlanningViews.CommandResult;
import pt.andaime.planning.domain.ConflictEngine.Conflict;

/**
 * Planeamento. Todas as alterações passam por {@code POST /planning/commands}; {@code /planning/preview} corre o
 * mesmo comando e desfaz tudo, devolvendo os conflitos novos que a alteração criaria.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/planning")
public class PlanningController {

    private final PlanningService planning;

    public PlanningController(PlanningService planning) {
        this.planning = planning;
    }

    @GetMapping("/board")
    Board board(@PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to) {
        return planning.board(from, to);
    }

    @GetMapping("/conflicts")
    List<Conflict> conflicts(@PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to) {
        return planning.conflicts(from, to);
    }

    @PostMapping("/preview")
    CommandResult preview(@PathVariable UUID orgId, @RequestBody Command command) {
        return planning.execute(command, true);
    }

    @PostMapping("/commands")
    CommandResult execute(@PathVariable UUID orgId, @RequestBody Command command) {
        return planning.execute(command, false);
    }

    @GetMapping("/change-sets")
    List<ChangeSetView> changeSets(@PathVariable UUID orgId, @RequestParam(defaultValue = "10") int limit) {
        return planning.recentChangeSets(limit);
    }

    @PostMapping("/change-sets/{changeSetId}/revert")
    CommandResult revert(@PathVariable UUID orgId, @PathVariable UUID changeSetId) {
        return planning.revert(changeSetId);
    }
}
