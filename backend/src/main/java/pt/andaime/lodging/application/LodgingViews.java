package pt.andaime.lodging.application;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Contratos da API de dormidas e hotéis. Nunca expõem linhas da base de dados diretamente. */
public final class LodgingViews {

    private LodgingViews() {
    }

    /** Hotel de uma obra, com o uso: estadias, noites levadas e a última entrada. */
    public record HotelView(UUID id, UUID siteId, String name, String address, String contact, String notes, int stays,
            int nights, LocalDate lastCheckIn, int version) {
    }

    public record HotelInput(UUID siteId, String name, String address, String contact, String notes) {
    }

    public record HotelRef(UUID id, String name) {
    }

    /** Estadia marcada. {@code hotelId} nulo = "hotel por definir". */
    public record StayView(UUID id, UUID employeeId, String employeeName, UUID siteId, String siteCode, String siteName,
            String siteColor, LocalDate week, UUID hotelId, String hotelName, String hotelAddress, String hotelContact,
            LocalDate checkIn, LocalDate checkOut, int nights, String notes, int version) {
    }

    /** Marcar ou alterar a estadia de uma pessoa numa obra numa semana (idempotente pela chave pessoa × obra × semana). */
    public record StayInput(UUID employeeId, UUID siteId, LocalDate week, UUID hotelId, LocalDate checkIn, LocalDate checkOut,
            String notes) {
    }

    /**
     * Linha do quadro da semana: pessoa × obra escalada, com os dias reais (sem ausências aprovadas), as datas propostas,
     * a sugestão "longe de casa" ({@code FAR}, {@code NEAR} ou {@code UNKNOWN}), a estadia marcada e os hotéis da obra.
     */
    public record BoardLine(UUID employeeId, String employeeName, String employeeNumber, String homeCity, String photoUrl,
            UUID siteId, String siteCode, String siteName, String siteColor, List<LocalDate> days, LocalDate proposedCheckIn,
            LocalDate proposedCheckOut, int proposedNights, String away, Integer distanceKm, StayView stay,
            List<HotelRef> hotels) {
    }

    public record WeekSummary(int peopleAway, int nights, int undefinedHotel, int withoutSchedule) {
    }

    public record WeekBoard(LocalDate week, List<BoardLine> lines, WeekSummary summary, List<StayView> staysWithoutSchedule) {
    }
}
