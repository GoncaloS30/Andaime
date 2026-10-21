package pt.andaime.sitediary.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.YearMonth;

import org.junit.jupiter.api.Test;

class DiaryRulesTest {

    @Test
    void mesOpcionalNoFormatoAnoMes() {
        assertThat(DiaryRules.month(null)).isEmpty();
        assertThat(DiaryRules.month(" ")).isEmpty();
        assertThat(DiaryRules.month("2026-10")).contains(YearMonth.of(2026, 10));
        assertThatThrownBy(() -> DiaryRules.month("2026-13")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DiaryRules.month("out-2026")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void pesquisaEscapaOsCaracteresDoLike() {
        assertThat(DiaryRules.searchPattern("  Betão ")).contains("Betão");
        assertThat(DiaryRules.searchPattern("100%_a\\b")).contains("100\\%\\_a\\\\b");
        assertThat(DiaryRules.searchPattern("")).isEmpty();
    }

    @Test
    void dataAteHoje() {
        var today = LocalDate.of(2026, 10, 21);
        assertThat(DiaryRules.validDate(today, today)).isTrue();
        assertThat(DiaryRules.validDate(today.plusDays(1), today)).isFalse();
        assertThat(DiaryRules.validDate(null, today)).isFalse();
    }

    @Test
    void fotosEncaixadasSemDeformar() {
        assertThat(DiaryRules.fitBox(4000, 3000, 700)).containsExactly(700, 525);
        assertThat(DiaryRules.fitBox(30, 40, 700)).containsExactly(525, 700);
    }

    @Test
    void dimensoesDeWebpExtendido() {
        var b = new byte[30];
        System.arraycopy("RIFF".getBytes(), 0, b, 0, 4);
        System.arraycopy("WEBP".getBytes(), 0, b, 8, 4);
        System.arraycopy("VP8X".getBytes(), 0, b, 12, 4);
        // 1920 × 1080 (guardados como largura - 1 e altura - 1, 24 bits little-endian).
        b[24] = (byte) (1919 & 0xff);
        b[25] = (byte) (1919 >> 8);
        b[27] = (byte) (1079 & 0xff);
        b[28] = (byte) (1079 >> 8);
        assertThat(ImageSize.of(b, "image/webp")).contains(new ImageSize.Size(1920, 1080));
        assertThat(ImageSize.of(new byte[] {1, 2, 3}, "image/png")).isEmpty();
    }
}
