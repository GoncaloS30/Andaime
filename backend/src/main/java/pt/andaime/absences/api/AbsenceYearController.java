package pt.andaime.absences.api;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.absences.application.AbsenceYearService;
import pt.andaime.absences.application.AbsenceYearService.YearMap;

/** Mapa de férias do ano (separador "Mapa do ano" das Ausências). */
@RestController
@RequestMapping("/api/orgs/{orgId}/absences/year")
public class AbsenceYearController {

    private final AbsenceYearService years;

    public AbsenceYearController(AbsenceYearService years) {
        this.years = years;
    }

    @GetMapping
    YearMap year(@PathVariable UUID orgId, @RequestParam(required = false) Integer year) {
        return years.year(year);
    }
}
