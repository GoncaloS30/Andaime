package pt.andaime.sitediary.application;

import java.io.IOException;
import java.io.OutputStream;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import pt.andaime.sitediary.application.DiaryViews.Export;

/** Diário de obra em Excel: uma linha por registo, com os mesmos filtros do ecrã. */
@Component
public class DiaryWorkbook {

    static final List<String> HEADER = List.of("Data", "Obra", "Título", "Texto", "Autor", "Papel", "Fotos", "Criado em",
            "Alterado em");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    public void write(OutputStream output, Export export, ZoneId zone) throws IOException {
        try (var workbook = new XSSFWorkbook()) {
            workbook.getProperties().getCoreProperties().setCreator("Andaime");
            var sheet = workbook.createSheet("Diário");
            int[] widths = {12, 12, 36, 70, 22, 16, 7, 17, 17};
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
            CellStyle wrap = workbook.createCellStyle();
            wrap.setWrapText(true);
            wrap.setVerticalAlignment(VerticalAlignment.TOP);

            var title = sheet.createRow(0).createCell(0);
            title.setCellValue("Diário de obra · " + export.siteCode() + " " + export.siteName());
            title.setCellStyle(titleStyle);
            sheet.createRow(1).createCell(0).setCellValue(export.scope());
            var header = sheet.createRow(3);
            for (int i = 0; i < HEADER.size(); i++) {
                var cell = header.createCell(i);
                cell.setCellValue(HEADER.get(i));
                cell.setCellStyle(head);
            }
            var rowIndex = 4;
            for (var entry : export.entries()) {
                var row = sheet.createRow(rowIndex++);
                String[] values = {
                        DATE.format(entry.date()), export.siteCode(), entry.title(), entry.body(), entry.authorName(),
                        DiaryDocument.roleLabel(entry.authorRole()), null,
                        DATE_TIME.format(entry.createdAt().atZone(zone)), DATE_TIME.format(entry.updatedAt().atZone(zone))};
                for (int i = 0; i < values.length; i++) {
                    var cell = row.createCell(i);
                    if (i == 6) {
                        cell.setCellValue(entry.photos().size());
                    } else {
                        cell.setCellValue(values[i]);
                    }
                    cell.setCellStyle(i == 3 || i == 2 ? wrap : top);
                }
            }
            sheet.createFreezePane(0, 4);
            if (rowIndex > 4) {
                sheet.setAutoFilter(new CellRangeAddress(3, rowIndex - 1, 0, HEADER.size() - 1));
            }
            workbook.write(output);
        }
    }
}
