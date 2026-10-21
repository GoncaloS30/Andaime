package pt.andaime.lodging.application;

import java.io.IOException;
import java.io.OutputStream;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import pt.andaime.lodging.application.LodgingViews.BoardLine;
import pt.andaime.lodging.application.LodgingViews.StayView;
import pt.andaime.lodging.application.LodgingViews.WeekBoard;

/** Quadro da semana de dormidas em Excel: uma linha por pessoa × obra, mais as estadias sem escala. */
@Component
public class LodgingWorkbook {

    static final List<String> HEADER = List.of("Pessoa", "Obra", "Longe de casa", "Entrada", "Saída", "Hotel", "Noites",
            "Notas");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;

    public void write(OutputStream output, WeekBoard board) throws IOException {
        try (var workbook = new XSSFWorkbook()) {
            workbook.getProperties().getCoreProperties().setCreator("Andaime");
            var sheet = workbook.createSheet("Dormidas");
            int[] widths = {28, 28, 16, 12, 12, 28, 10, 36};
            for (int i = 0; i < widths.length; i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }
            var titleFont = workbook.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 13);
            CellStyle titleStyle = workbook.createCellStyle();
            titleStyle.setFont(titleFont);
            var white = workbook.createFont();
            white.setBold(true);
            white.setColor(IndexedColors.WHITE.getIndex());
            CellStyle head = workbook.createCellStyle();
            head.setFont(white);
            head.setFillForegroundColor(IndexedColors.DARK_GREEN.getIndex());
            head.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            CellStyle top = workbook.createCellStyle();
            top.setVerticalAlignment(VerticalAlignment.TOP);

            var title = sheet.createRow(0).createCell(0);
            title.setCellValue("Dormidas · semana de " + ISO.format(board.week()) + " a "
                    + ISO.format(board.week().plusDays(6)));
            title.setCellStyle(titleStyle);
            var summary = board.summary();
            sheet.createRow(1).createCell(0).setCellValue(
                    summary.peopleAway() + " longe de casa · " + summary.nights() + " noites · "
                            + summary.undefinedHotel() + " hotel por definir · " + summary.withoutSchedule()
                            + " sem escala");
            var header = sheet.createRow(3);
            for (int i = 0; i < HEADER.size(); i++) {
                var cell = header.createCell(i);
                cell.setCellValue(HEADER.get(i));
                cell.setCellStyle(head);
            }
            var rowIndex = 4;
            for (var line : board.lines()) {
                writeRow(sheet.createRow(rowIndex++), cells(line), top);
            }
            for (var stay : board.staysWithoutSchedule()) {
                writeRow(sheet.createRow(rowIndex++), orphanCells(stay), top);
            }
            sheet.createFreezePane(0, 4);
            if (rowIndex > 4) {
                sheet.setAutoFilter(new CellRangeAddress(3, rowIndex - 1, 0, HEADER.size() - 1));
            }
            workbook.write(output);
        }
    }

    public static String filename(java.time.LocalDate week) {
        return "dormidas-semana-" + week + ".xlsx";
    }

    private static String[] cells(BoardLine line) {
        var stay = line.stay();
        var checkIn = stay != null ? stay.checkIn() : line.proposedCheckIn();
        var checkOut = stay != null ? stay.checkOut() : line.proposedCheckOut();
        var hotel = stay == null ? "" : stay.hotelName() == null ? "Por definir" : stay.hotelName();
        var nights = stay != null ? stay.nights() : line.proposedNights();
        var notes = stay == null ? "" : stay.notes() == null ? "" : stay.notes();
        return new String[] {line.employeeName(), line.siteCode() + " " + line.siteName(), awayLabel(line.away()),
                DATE.format(checkIn), DATE.format(checkOut), hotel, Integer.toString(nights), notes};
    }

    private static String[] orphanCells(StayView stay) {
        return new String[] {stay.employeeName(), stay.siteCode() + " " + stay.siteName(), "Sem escala",
                DATE.format(stay.checkIn()), DATE.format(stay.checkOut()),
                stay.hotelName() == null ? "Por definir" : stay.hotelName(), Integer.toString(stay.nights()),
                stay.notes() == null ? "" : stay.notes()};
    }

    private static String awayLabel(String away) {
        return switch (away) {
            case "FAR" -> "Sim";
            case "NEAR" -> "Não";
            default -> "Desconhecido";
        };
    }

    private static void writeRow(org.apache.poi.ss.usermodel.Row row, String[] values, CellStyle style) {
        for (int i = 0; i < values.length; i++) {
            var cell = row.createCell(i);
            cell.setCellValue(values[i]);
            cell.setCellStyle(style);
        }
    }
}
