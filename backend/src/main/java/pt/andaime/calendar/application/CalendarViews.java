package pt.andaime.calendar.application;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/** Contrato da Agenda: itens já normalizados, de qualquer camada, prontos a desenhar na grelha do mês. */
public final class CalendarViews {

    private CalendarViews() {
    }

    /** Camadas que a agenda liga e desliga. */
    public enum Layer {
        ABSENCE, SITE, EXPIRY, HOLIDAY, EVENT
    }

    /**
     * Entidade que um item abre. {@code type}: {@code EMPLOYEE} (ficha do trabalhador), {@code SITE}, {@code VEHICLE},
     * {@code EMPLOYEE_DOCUMENTS} (documentos do trabalhador) ou {@code EVENT}.
     */
    public record Link(String type, UUID id) {
    }

    /**
     * Um item da agenda.
     *
     * @param kind  subtipo da camada: o tipo de ausência ({@code VACATION}, {@code SICK}, … ou {@code ABSENCE} quando o
     *              tipo não pode ser mostrado), {@code SITE_START}, {@code SITE_CONTRACT_END}, {@code SITE_FORECAST_END},
     *              {@code DOCUMENT}, {@code INSURANCE}, {@code INSPECTION}, {@code PUBLIC_HOLIDAY},
     *              {@code COMPANY_HOLIDAY}, {@code EVENT}
     * @param tone  sugestão de cor: {@code vacation}, {@code absence}, {@code site}, {@code late}, {@code expired},
     *              {@code expiring}, {@code valid}, {@code holiday}, {@code event}
     * @param color cor própria quando existe (a cor da obra), senão nula
     * @param late  datas de obra cuja previsão de fim passa o fim contratual
     */
    public record CalendarItem(String id, Layer layer, String kind, String title, String detail, LocalDate start, LocalDate end,
            LocalTime time, String tone, String color, boolean late, Link link) {
    }

    /**
     * Mês da agenda: a grelha completa de segunda a domingo ({@code from}–{@code to}, com os dias dos meses vizinhos) e
     * os itens que a tocam, com os de dia inteiro primeiro. As validades só entram até {@code expiryHorizon} (hoje + 60
     * dias), como na spec.
     */
    public record CalendarMonth(String month, LocalDate from, LocalDate to, LocalDate today, LocalDate expiryHorizon,
            boolean canManageEvents, List<CalendarItem> items) {
    }

    public record EventInput(String title, LocalDate startsOn, LocalDate endsOn, LocalTime time, String location) {
    }
}
