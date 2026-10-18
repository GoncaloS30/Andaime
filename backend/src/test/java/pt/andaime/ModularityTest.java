package pt.andaime;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

class ModularityTest {

    @Test
    void respeitaOsLimitesDoMonolitoModular() {
        ApplicationModules.of(AndaimeApplication.class).verify();
    }
}
