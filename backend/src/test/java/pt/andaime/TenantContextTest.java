package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import pt.andaime.shared.tenant.TenantContext;

class TenantContextTest {

    @AfterEach
    void limpaContexto() {
        TenantContext.clear();
    }

    @Test
    void falhaAoAbrirUmContextoIncompleto() {
        assertThatThrownBy(() -> TenantContext.open(null, UUID.randomUUID()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void restauraOContextoAnteriorAoFecharUmScope() {
        var orgA = UUID.randomUUID();
        var orgB = UUID.randomUUID();
        var user = UUID.randomUUID();

        try (var ignored = TenantContext.open(orgA, user)) {
            assertThat(TenantContext.organizationId()).contains(orgA);
            try (var nested = TenantContext.open(orgB, user)) {
                assertThat(TenantContext.organizationId()).contains(orgB);
            }
            assertThat(TenantContext.organizationId()).contains(orgA);
        }

        assertThat(TenantContext.organizationId()).isEmpty();
    }
}
