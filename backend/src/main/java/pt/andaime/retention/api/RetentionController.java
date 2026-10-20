package pt.andaime.retention.api;

import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import pt.andaime.retention.application.RetentionService;
import pt.andaime.retention.application.RetentionService.RetentionInput;
import pt.andaime.retention.application.RetentionService.RetentionPolicy;

@RestController
@RequestMapping("/api/orgs/{orgId}/retention")
public class RetentionController {

    private final RetentionService retention;

    public RetentionController(RetentionService retention) {
        this.retention = retention;
    }

    @GetMapping
    RetentionPolicy current(@PathVariable UUID orgId) {
        return retention.current();
    }

    @PutMapping
    RetentionPolicy update(@PathVariable UUID orgId, @RequestBody RetentionInput input) {
        return retention.update(input);
    }
}
