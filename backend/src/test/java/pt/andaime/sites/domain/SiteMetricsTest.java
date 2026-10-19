package pt.andaime.sites.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import pt.andaime.sites.domain.SiteMetrics.Status;

/** Mesmos casos que {@code src/domain/siteMetrics.test.ts}, em minutos. */
class SiteMetricsTest {

    @Test
    void semLimiteNaoTemSaldoNemPercentagens() {
        var m = SiteMetrics.of(null, 600, 300, 120, false);
        assertThat(m.status()).isEqualTo(Status.NO_LIMIT);
        assertThat(m.balanceMin()).isNull();
        assertThat(m.projectionMin()).isEqualTo(720);
        assertThat(SiteMetrics.of(0, 10, 0, 0, false).status()).isEqualTo(Status.NO_LIMIT);
    }

    @Test
    void dentroDoLimiteEstaNormal() {
        var m = SiteMetrics.of(60_000, 30_000, 20_000, 10_000, true);
        assertThat(m.status()).isEqualTo(Status.NORMAL);
        assertThat(m.balanceMin()).isEqualTo(30_000);
        assertThat(m.pctProjection()).isEqualTo(0.667);
        assertThat(m.overByMin()).isZero();
    }

    @Test
    void projecaoAPartirDe85PorCentoEntraEmAtencao() {
        assertThat(SiteMetrics.of(1000, 800, 0, 49, true).status()).isEqualTo(Status.NORMAL);
        assertThat(SiteMetrics.of(1000, 800, 0, 50, true).status()).isEqualTo(Status.WARNING);
    }

    @Test
    void projecaoOuRealizadasAcimaDoLimiteExcedem() {
        var projected = SiteMetrics.of(1000, 900, 0, 200, true);
        assertThat(projected.status()).isEqualTo(Status.EXCEEDS);
        assertThat(projected.overByMin()).isEqualTo(100);

        var realized = SiteMetrics.of(1000, 1001, 1001, 0, true);
        assertThat(realized.status()).isEqualTo(Status.EXCEEDS);
        assertThat(realized.balanceMin()).isEqualTo(-1);
    }

    @Test
    void aprovadasNuncaExcedemRealizadas() {
        assertThatThrownBy(() -> SiteMetrics.of(1000, 100, 101, 0, true)).isInstanceOf(IllegalArgumentException.class);
    }
}
