package pt.andaime.reporting.application;

import java.io.IOException;
import java.io.OutputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;

import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.stereotype.Component;

import pt.andaime.reporting.application.ReportingViews.WeeklyMap;
import pt.andaime.reporting.application.ReportingViews.ActualTimeRow;
import pt.andaime.reporting.application.ReportingViews.WeeklyMapTemplate;

/** Excel semanal gerado no servidor com uma janela de linhas limitada em memória. */
@Component
public class WeeklyMapWorkbook {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("EEE dd", Locale.forLanguageTag("pt-PT"));

    public void write(OutputStream output, String organizationName, WeeklyMapTemplate template, WeeklyMap map)
            throws IOException {
        write(output, organizationName, template, map, List.of());
    }

    public void write(OutputStream output, String organizationName, WeeklyMapTemplate template, WeeklyMap map,
            List<ActualTimeRow> actualRows) throws IOException {
        var workbook = new SXSSFWorkbook(100);
        workbook.setCompressTempFiles(true);
        try {
            workbook.getXSSFWorkbook().getProperties().getCoreProperties().setCreator("Andaime");
            var styles = new Styles(workbook);
            if (template == WeeklyMapTemplate.EQUIPA) {
                teamSheet(workbook, styles, organizationName, map);
            } else if (template == WeeklyMapTemplate.OBRA) {
                siteSheet(workbook, styles, organizationName, map);
            } else if (template == WeeklyMapTemplate.HORAS) {
                hoursSheet(workbook, styles, organizationName, map, actualRows);
            } else {
                erpSheet(workbook, styles, organizationName, map, actualRows);
            }
            workbook.write(output);
            output.flush();
        } finally {
            workbook.dispose();
            workbook.close();
        }
    }

    private void hoursSheet(SXSSFWorkbook workbook, Styles styles, String organizationName, WeeklyMap map,
            List<ActualTimeRow> actualRows) {
        var sheet = workbook.createSheet("Folha de horas");
        configure(sheet, new int[] {14, 30, 13, 18, 28, 12, 12, 12, 12, 12, 16});
        var row = reportHeader(sheet, styles, organizationName, map, "Folha de horas aprovada", 11);
        tableHeader(sheet.createRow(row++), styles, "N.º", "Trabalhador", "Data", "Obra", "Nome da obra",
                "Entrada", "Saída", "Trabalhado", "Normal", "Extra", "Estado");
        for (var entry : actualRows) {
            var body = sheet.createRow(row++);
            text(body, 0, entry.employeeNumber(), styles.body);
            text(body, 1, entry.employeeName(), styles.body);
            text(body, 2, entry.date().toString(), styles.body);
            text(body, 3, entry.siteCode(), styles.body);
            text(body, 4, entry.siteName(), styles.body);
            text(body, 5, time(entry.clockIn()), styles.body);
            text(body, 6, time(entry.clockOut()), styles.body);
            hours(body, 7, entry.workedMin(), styles.hours);
            hours(body, 8, entry.normalMin(), styles.hours);
            hours(body, 9, entry.overtimeMin(), styles.hours);
            text(body, 10, entry.status(), styles.body);
        }
        sheet.createFreezePane(0, 3);
        sheet.setAutoFilter(new CellRangeAddress(2, Math.max(2, row - 1), 0, 10));
    }

    private void erpSheet(SXSSFWorkbook workbook, Styles styles, String organizationName, WeeklyMap map,
            List<ActualTimeRow> actualRows) {
        var sheet = workbook.createSheet("ERP");
        configure(sheet, new int[] {14, 30, 13, 18, 20, 18, 14, 14, 14});
        var row = reportHeader(sheet, styles, organizationName, map, "Exportação ERP", 9);
        tableHeader(sheet.createRow(row++), styles, "N.º trabalhador", "Nome", "Data", "Obra", "Ordem ERP",
                "Código atividade", "Horas normais", "Horas extra", "Total");
        for (var entry : actualRows) {
            var body = sheet.createRow(row++);
            text(body, 0, entry.employeeNumber(), styles.body);
            text(body, 1, entry.employeeName(), styles.body);
            text(body, 2, entry.date().toString(), styles.body);
            text(body, 3, entry.siteCode(), styles.body);
            text(body, 4, entry.erpOrder(), styles.body);
            text(body, 5, entry.activityCode(), styles.body);
            hours(body, 6, entry.normalMin(), styles.hours);
            hours(body, 7, entry.overtimeMin(), styles.hours);
            hours(body, 8, entry.workedMin(), styles.hoursBold);
        }
        sheet.createFreezePane(0, 3);
        sheet.setAutoFilter(new CellRangeAddress(2, Math.max(2, row - 1), 0, 8));
    }

    private void teamSheet(SXSSFWorkbook workbook, Styles styles, String organizationName, WeeklyMap map) {
        var sheet = workbook.createSheet("Mapa por equipa");
        configure(sheet, new int[] {30, 22, 34, 38, 14, 13, 10});
        var row = reportHeader(sheet, styles, organizationName, map, "Mapa de trabalhos", 7);
        tableHeader(sheet.createRow(row++), styles,
                "Equipa / trabalhadores", "Dias", "Obra", "Trabalho", "Horário", "Viatura", "Horas");
        for (var group : map.groups()) {
            var groupRow = sheet.createRow(row++);
            text(groupRow, 0, group.teamName(), styles.group);
            text(groupRow, 1, days(group.dates()), styles.group);
            text(groupRow, 2, group.siteCode() + " — " + group.siteName(), styles.group);
            text(groupRow, 3, String.join(" · ", group.notes()), styles.group);
            text(groupRow, 4, group.schedule(), styles.group);
            text(groupRow, 5, String.join(", ", group.vehicles()), styles.group);
            hours(groupRow, 6, group.totalMin(), styles.groupHours);
            for (var worker : group.workers()) {
                var workerRow = sheet.createRow(row++);
                text(workerRow, 0, "   " + worker.name() + (worker.foreman() ? " (resp.)" : ""), styles.body);
                var ownDays = days(worker.minutesByDate().keySet().stream().sorted().toList());
                text(workerRow, 1, ownDays.equals(days(group.dates())) ? "" : ownDays, styles.body);
                hours(workerRow, 6, worker.totalMin(), styles.hours);
            }
            row++;
        }
        sheet.createFreezePane(0, 3);
        sheet.setAutoFilter(new CellRangeAddress(2, 2, 0, 6));
    }

    private void siteSheet(SXSSFWorkbook workbook, Styles styles, String organizationName, WeeklyMap map) {
        var sheet = workbook.createSheet("Mapa por obra");
        var widths = new int[10];
        widths[0] = 30;
        widths[1] = 18;
        java.util.Arrays.fill(widths, 2, 9, 10);
        widths[9] = 10;
        configure(sheet, widths);
        var row = reportHeader(sheet, styles, organizationName, map, "Mapa por obra", 10);
        var bySite = new LinkedHashMap<java.util.UUID, List<ReportingViews.WeeklyMapGroup>>();
        map.groups().forEach(group -> bySite.computeIfAbsent(group.siteId(), ignored -> new java.util.ArrayList<>()).add(group));
        for (var groups : bySite.values()) {
            var first = groups.getFirst();
            var site = sheet.createRow(row++);
            text(site, 0, first.siteCode() + " — " + first.siteName() + " · " + first.city()
                    + (first.clientName().isBlank() ? "" : " · " + first.clientName()), styles.section);
            sheet.addMergedRegion(new CellRangeAddress(site.getRowNum(), site.getRowNum(), 0, 9));
            var headings = new String[10];
            headings[0] = "Trabalhador";
            headings[1] = "Equipa";
            for (var index = 0; index < 7; index++) headings[index + 2] = map.days().get(index).format(DAY);
            headings[9] = "Total";
            tableHeader(sheet.createRow(row++), styles, headings);
            for (var group : groups) {
                for (var worker : group.workers()) {
                    var workerRow = sheet.createRow(row++);
                    text(workerRow, 0, worker.name(), styles.body);
                    text(workerRow, 1, group.teamName(), styles.body);
                    for (var index = 0; index < 7; index++) {
                        var minutes = worker.minutesByDate().get(map.days().get(index));
                        if (minutes != null) hours(workerRow, index + 2, minutes, styles.hours);
                    }
                    hours(workerRow, 9, worker.totalMin(), styles.hoursBold);
                }
            }
            row++;
        }
        sheet.createFreezePane(0, 2);
    }

    private int reportHeader(Sheet sheet, Styles styles, String organizationName, WeeklyMap map, String title, int columns) {
        var titleRow = sheet.createRow(0);
        titleRow.setHeightInPoints(26);
        text(titleRow, 0, title + " · Semana " + map.weekNumber() + " · " + map.weekStart() + " a "
                + map.weekStart().plusDays(6), styles.title);
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, columns - 1));
        var organization = sheet.createRow(1);
        text(organization, 0, organizationName, styles.subtitle);
        sheet.addMergedRegion(new CellRangeAddress(1, 1, 0, columns - 1));
        return 2;
    }

    private void configure(Sheet sheet, int[] widths) {
        for (var index = 0; index < widths.length; index++) sheet.setColumnWidth(index, widths[index] * 256);
        sheet.setAutobreaks(true);
        sheet.getPrintSetup().setLandscape(true);
        sheet.getPrintSetup().setFitWidth((short) 1);
        sheet.getPrintSetup().setFitHeight((short) 0);
    }

    private void tableHeader(Row row, Styles styles, String... values) {
        for (var index = 0; index < values.length; index++) text(row, index, values[index], styles.tableHeader);
        row.setHeightInPoints(19);
    }

    private static void text(Row row, int column, String value, CellStyle style) {
        var cell = row.createCell(column);
        cell.setCellValue(value == null ? "" : value);
        cell.setCellStyle(style);
    }

    private static void hours(Row row, int column, int minutes, CellStyle style) {
        var cell = row.createCell(column);
        cell.setCellValue(minutes / 60.0);
        cell.setCellStyle(style);
    }

    private static String days(List<LocalDate> dates) {
        return dates.stream().map(DAY::format).collect(java.util.stream.Collectors.joining(", "));
    }

    private static String time(java.time.LocalTime value) {
        return value == null ? "" : value.format(DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT));
    }

    private static final class Styles {
        final CellStyle title;
        final CellStyle subtitle;
        final CellStyle tableHeader;
        final CellStyle group;
        final CellStyle groupHours;
        final CellStyle section;
        final CellStyle body;
        final CellStyle hours;
        final CellStyle hoursBold;

        Styles(SXSSFWorkbook workbook) {
            title = style(workbook, true, IndexedColors.WHITE, IndexedColors.DARK_GREEN, HorizontalAlignment.LEFT);
            subtitle = style(workbook, false, IndexedColors.DARK_GREEN, IndexedColors.LIGHT_GREEN, HorizontalAlignment.LEFT);
            tableHeader = style(workbook, true, IndexedColors.GREY_80_PERCENT, null, HorizontalAlignment.LEFT);
            tableHeader.setBorderBottom(BorderStyle.THIN);
            group = style(workbook, true, IndexedColors.BLACK, IndexedColors.GREY_25_PERCENT, HorizontalAlignment.LEFT);
            groupHours = copy(workbook, group, true, false);
            section = style(workbook, true, IndexedColors.WHITE, IndexedColors.DARK_GREEN, HorizontalAlignment.LEFT);
            body = style(workbook, false, IndexedColors.BLACK, null, HorizontalAlignment.LEFT);
            hours = copy(workbook, body, true, false);
            hoursBold = copy(workbook, body, true, true);
        }

        private static CellStyle style(SXSSFWorkbook workbook, boolean bold, IndexedColors foreground,
                IndexedColors background, HorizontalAlignment alignment) {
            var style = workbook.createCellStyle();
            var font = workbook.createFont();
            font.setFontName("Arial");
            font.setFontHeightInPoints((short) 10);
            font.setBold(bold);
            font.setColor(foreground.getIndex());
            style.setFont(font);
            style.setAlignment(alignment);
            style.setVerticalAlignment(VerticalAlignment.CENTER);
            if (background != null) {
                style.setFillForegroundColor(background.getIndex());
                style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            }
            return style;
        }

        private static CellStyle copy(SXSSFWorkbook workbook, CellStyle source, boolean numeric, boolean bold) {
            var style = workbook.createCellStyle();
            style.cloneStyleFrom(source);
            if (numeric) {
                style.setDataFormat(workbook.createDataFormat().getFormat("0.##"));
                style.setAlignment(HorizontalAlignment.RIGHT);
            }
            if (bold) {
                Font font = workbook.createFont();
                font.setFontName("Arial");
                font.setFontHeightInPoints((short) 10);
                font.setBold(true);
                style.setFont(font);
            }
            return style;
        }
    }
}
