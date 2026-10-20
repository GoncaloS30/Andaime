package pt.andaime.equipment.application;

import java.io.IOException;
import java.io.OutputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.PrintSetup;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import pt.andaime.equipment.application.EquipmentService.DeliverySheet;

/** Folha de entrega para assinar (A4 vertical): a pessoa, o que tem em seu poder e as linhas de assinatura. */
@Component
public class DeliverySheetWorkbook {

    static final List<String> HEADER = List.of("Data", "Artigo", "Categoria", "Tamanho", "Qtd.", "N.º de série");
    static final String DECLARATION = "Declaro que recebi os artigos acima, em bom estado, e que me comprometo a usá-los nas"
            + " tarefas a que se destinam e a devolvê-los quando me forem pedidos.";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    public void write(OutputStream output, DeliverySheet sheetData) throws IOException {
        try (var workbook = new XSSFWorkbook()) {
            workbook.getProperties().getCoreProperties().setCreator("Andaime");
            var sheet = workbook.createSheet("Folha de entrega");
            sheet.getPrintSetup().setPaperSize(PrintSetup.A4_PAPERSIZE);
            sheet.getPrintSetup().setLandscape(false);
            sheet.setFitToPage(true);
            sheet.getPrintSetup().setFitWidth((short) 1);
            sheet.getPrintSetup().setFitHeight((short) 0);
            int[] widths = {12, 36, 14, 10, 6, 22};
            for (int i = 0; i < widths.length; i++) {
                sheet.setColumnWidth(i, widths[i] * 256);
            }

            var bold = workbook.createFont();
            bold.setBold(true);
            var title = workbook.createFont();
            title.setBold(true);
            title.setFontHeightInPoints((short) 14);
            var white = workbook.createFont();
            white.setBold(true);
            white.setColor(IndexedColors.WHITE.getIndex());
            CellStyle titleStyle = workbook.createCellStyle();
            titleStyle.setFont(title);
            CellStyle boldStyle = workbook.createCellStyle();
            boldStyle.setFont(bold);
            CellStyle head = workbook.createCellStyle();
            head.setFont(white);
            head.setFillForegroundColor(IndexedColors.DARK_GREEN.getIndex());
            head.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            CellStyle line = workbook.createCellStyle();
            line.setBorderBottom(BorderStyle.THIN);
            CellStyle wrap = workbook.createCellStyle();
            wrap.setWrapText(true);

            int r = 0;
            sheet.createRow(r++).createCell(0).setCellValue(sheetData.organizationName());
            var titleCell = sheet.createRow(r++).createCell(0);
            titleCell.setCellValue("Folha de entrega de EPI, fardamento e ferramentas");
            titleCell.setCellStyle(titleStyle);
            r++;
            r = labelled(sheet, r, "Trabalhador", sheetData.employeeName(), boldStyle);
            r = labelled(sheet, r, "N.º", sheetData.employeeNumber(), boldStyle);
            r = labelled(sheet, r, "Categoria", sheetData.category(), boldStyle);
            r = labelled(sheet, r, "Emitida em", sheetData.issuedOn().format(DATE), boldStyle);
            r++;

            var header = sheet.createRow(r++);
            for (int i = 0; i < HEADER.size(); i++) {
                var cell = header.createCell(i);
                cell.setCellValue(HEADER.get(i));
                cell.setCellStyle(head);
            }
            for (var holding : sheetData.holdings()) {
                var row = sheet.createRow(r++);
                LocalDate on = holding.lastDeliveredOn();
                row.createCell(0).setCellValue(on == null ? "—" : on.format(DATE));
                row.createCell(1).setCellValue(holding.itemName());
                row.createCell(2).setCellValue(EquipmentService.CATEGORY_LABEL.getOrDefault(holding.category(), holding.category()));
                row.createCell(3).setCellValue(holding.size() == null ? "—" : holding.size());
                row.createCell(4).setCellValue(holding.quantity());
                row.createCell(5).setCellValue(holding.serials().isEmpty() ? "—" : String.join(", ", holding.serials()));
                for (int i = 0; i < HEADER.size(); i++) {
                    row.getCell(i).setCellStyle(line);
                }
            }
            if (sheetData.holdings().isEmpty()) {
                sheet.createRow(r++).createCell(1).setCellValue("Sem artigos em seu poder.");
            }

            r++;
            var declaration = sheet.createRow(r);
            declaration.setHeightInPoints(32);
            var declarationCell = declaration.createCell(0);
            declarationCell.setCellValue(DECLARATION);
            declarationCell.setCellStyle(wrap);
            sheet.addMergedRegion(new CellRangeAddress(r, r, 0, HEADER.size() - 1));
            r += 3;
            signature(sheet, r, "Assinatura do trabalhador");
            signature(sheet, r + 2, "Assinatura de quem entrega");
            workbook.write(output);
        }
    }

    private static int labelled(org.apache.poi.ss.usermodel.Sheet sheet, int r, String label, String value, CellStyle style) {
        var row = sheet.createRow(r);
        row.createCell(0).setCellValue(label);
        var cell = row.createCell(1);
        cell.setCellValue(value == null ? "—" : value);
        cell.setCellStyle(style);
        return r + 1;
    }

    private static void signature(org.apache.poi.ss.usermodel.Sheet sheet, int r, String label) {
        var row = sheet.createRow(r);
        row.createCell(0).setCellValue(label + ": ______________________________");
        row.createCell(4).setCellValue("Data: ___/___/______");
    }
}
