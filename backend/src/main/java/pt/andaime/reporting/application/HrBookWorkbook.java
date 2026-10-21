package pt.andaime.reporting.application;

import java.io.IOException;
import java.io.OutputStream;

import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Component;

import pt.andaime.reporting.domain.HrBook;

/**
 * Excel do livro de horas do RH: a folha "Tabelas" com os códigos de atividade da política e uma folha por pessoa com
 * as colunas {@link HrBook#HEADER}. A Atividade é uma fórmula para a folha "Tabelas" com o valor já calculado em cache
 * (abre sem recalcular e acompanha uma mudança de código feita pelo RH na tabela).
 */
@Component
public class HrBookWorkbook {

    static final String TABLES = "Tabelas";

    public void write(OutputStream output, HrBook.Book book) throws IOException {
        var workbook = new SXSSFWorkbook(200);
        workbook.setCompressTempFiles(true);
        try {
            var properties = workbook.getXSSFWorkbook().getProperties().getCoreProperties();
            properties.setCreator("Andaime");
            properties.setTitle("Livro de horas " + book.month());
            var styles = new Styles(workbook);

            var tables = workbook.createSheet(TABLES);
            tables.setColumnWidth(0, 28 * 256);
            tables.setColumnWidth(1, 14 * 256);
            header(tables.createRow(0), styles, "Atividade", "Código");
            var codes = book.activities().codes();
            for (var index = 0; index < codes.size(); index++) {
                var row = tables.createRow(index + 1);
                text(row, 0, codes.get(index).label(), styles.body);
                text(row, 1, codes.get(index).code(), styles.body);
            }
            tables.createFreezePane(0, 1);

            for (var person : book.sheets()) {
                var sheet = workbook.createSheet(person.name());
                var widths = new int[] {12, 8, 14, 11, 16, 24};
                for (var index = 0; index < widths.length; index++) sheet.setColumnWidth(index, widths[index] * 256);
                header(sheet.createRow(0), styles, HrBook.HEADER.toArray(String[]::new));
                var number = 1;
                for (var line : person.rows()) {
                    var row = sheet.createRow(number++);
                    var date = row.createCell(0);
                    date.setCellValue(line.date());
                    date.setCellStyle(styles.date);
                    var hours = row.createCell(1);
                    hours.setCellValue(line.minutes() / 60.0);
                    hours.setCellStyle(styles.hours);
                    text(row, 2, line.siteCode(), styles.body);
                    var activity = row.createCell(3);
                    activity.setCellStyle(styles.body);
                    if (line.activityIndex() != null) {
                        // Linha 1 da folha Tabelas é o cabeçalho; o índice 0 (normal) está na linha 2.
                        activity.setCellFormula(TABLES + "!$B$" + (line.activityIndex() + 2));
                        activity.setCellValue(line.activityCode());
                    } else {
                        activity.setCellValue("");
                    }
                    text(row, 4, line.erpOrder(), styles.body);
                    text(row, 5, line.absence(), styles.body);
                }
                sheet.createFreezePane(0, 1);
            }
            workbook.write(output);
            output.flush();
        } finally {
            workbook.dispose();
            workbook.close();
        }
    }

    private static void header(Row row, Styles styles, String... values) {
        for (var index = 0; index < values.length; index++) text(row, index, values[index], styles.header);
    }

    private static void text(Row row, int column, String value, CellStyle style) {
        var cell = row.createCell(column);
        cell.setCellValue(value == null ? "" : value);
        cell.setCellStyle(style);
    }

    private static final class Styles {
        final CellStyle header;
        final CellStyle body;
        final CellStyle date;
        final CellStyle hours;

        Styles(SXSSFWorkbook workbook) {
            var bold = workbook.createFont();
            bold.setFontName("Arial");
            bold.setFontHeightInPoints((short) 10);
            bold.setBold(true);
            var plain = workbook.createFont();
            plain.setFontName("Arial");
            plain.setFontHeightInPoints((short) 10);

            header = workbook.createCellStyle();
            header.setFont(bold);
            header.setBorderBottom(BorderStyle.THIN);
            header.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            body = workbook.createCellStyle();
            body.setFont(plain);
            date = workbook.createCellStyle();
            date.cloneStyleFrom(body);
            date.setDataFormat(workbook.createDataFormat().getFormat("dd/mm/yyyy"));
            date.setAlignment(HorizontalAlignment.LEFT);
            hours = workbook.createCellStyle();
            hours.cloneStyleFrom(body);
            hours.setDataFormat(workbook.createDataFormat().getFormat("0.00"));
            hours.setAlignment(HorizontalAlignment.RIGHT);
        }
    }
}
