package pt.andaime.planning.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.planning.application.MyScheduleService;
import pt.andaime.planning.application.MyScheduleService.MyAssignment;

/** As atribuições da própria pessoa (app do trabalhador e do encarregado). */
@RestController
@RequestMapping("/api/orgs/{orgId}/me")
public class MyScheduleController {

    private final MyScheduleService schedule;

    public MyScheduleController(MyScheduleService schedule) {
        this.schedule = schedule;
    }

    @GetMapping("/assignments")
    List<MyAssignment> assignments(@PathVariable UUID orgId, @RequestParam LocalDate from, @RequestParam LocalDate to) {
        return schedule.mine(from, to);
    }
}
