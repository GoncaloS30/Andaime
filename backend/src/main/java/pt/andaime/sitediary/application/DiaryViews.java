package pt.andaime.sitediary.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Contratos HTTP do diário de obra. */
public final class DiaryViews {

    private DiaryViews() {
    }

    /** Autor do registo e o papel que tinha na empresa quando o escreveu (OWNER, ADMIN, MANAGER ou FOREMAN). */
    public record Author(UUID userId, String name, String role) {
    }

    /** {@code url} é o endereço autorizado na API; a foto nunca muda (apagar e carregar outra dá outro id). */
    public record PhotoView(UUID id, int position, String url, String contentType, Integer width, Integer height) {
    }

    public record EntryView(
            UUID id,
            UUID siteId,
            LocalDate date,
            String title,
            String body,
            Author author,
            Instant createdAt,
            Instant updatedAt,
            int version,
            /** Quem pede pode editar e apagar (autor ou gestor). */
            boolean canEdit,
            List<PhotoView> photos) {
    }

    public record MonthCount(String month, int count) {
    }

    /**
     * Linha do tempo de uma obra com os filtros aplicados; {@code months} conta todos os registos da obra (atalhos por
     * mês) e {@code truncated} diz que há mais registos do que os devolvidos.
     */
    public record DiaryPage(List<EntryView> entries, List<MonthCount> months, int total, boolean truncated, boolean canWrite) {
    }

    public record EntryInput(LocalDate date, String title, String body, UUID clientKey) {
    }

    /** Registo recente de qualquer obra no âmbito (início do gestor), com as primeiras fotos. */
    public record RecentEntry(
            UUID id,
            UUID siteId,
            String siteCode,
            String siteName,
            String siteColor,
            LocalDate date,
            String title,
            String authorName,
            Instant createdAt,
            int photoCount,
            List<PhotoView> photos) {
    }

    /** Dados para as exportações (lidos na transação do pedido; as fotos são lidas do armazenamento ao escrever). */
    public record ExportEntry(LocalDate date, String title, String body, String authorName, String authorRole,
            Instant createdAt, Instant updatedAt, List<ExportPhoto> photos) {
    }

    public record ExportPhoto(String storageKey, String contentType, Integer width, Integer height) {
    }

    public record Export(String siteCode, String siteName, String scope, String filenameBase, List<ExportEntry> entries) {
    }
}
