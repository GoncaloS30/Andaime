package pt.andaime.sitediary.application;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigInteger;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;

import org.apache.poi.util.Units;
import org.apache.poi.xwpf.usermodel.Borders;
import org.apache.poi.xwpf.usermodel.Document;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.openxml4j.exceptions.InvalidFormatException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import pt.andaime.sitediary.application.DiaryViews.Export;
import pt.andaime.sitediary.application.DiaryViews.ExportEntry;
import pt.andaime.sitediary.application.DiaryViews.ExportPhoto;
import pt.andaime.sitediary.domain.DiaryRules;

/**
 * Diário de obra em Word (.docx), gerado no servidor porque as fotos vivem no armazenamento privado. Feito para
 * imprimir, como no protótipo: A4, margens de 2 cm, letra pequena, fotos de 7 cm lado a lado sem deformar e uma linha
 * fina entre dias. As fotos são reduzidas (lado maior 1200 px, JPEG) para o ficheiro não crescer sem necessidade.
 */
@Component
public class DiaryDocument {

    private static final Logger log = LoggerFactory.getLogger(DiaryDocument.class);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final long BOX_EMU = 7L * Units.EMU_PER_CENTIMETER;
    private static final int MAX_PIXELS = 1200;
    /** 2 cm em vigésimos de ponto (twips). */
    private static final long MARGIN = 1134;
    private static final String GREY = "5C635E";
    private static final String PINE = "13342A";

    private final DiaryPhotoStore photos;

    DiaryDocument(DiaryPhotoStore photos) {
        this.photos = photos;
    }

    public void write(OutputStream output, Export export, ZoneId zone) throws IOException {
        try (var document = new XWPFDocument()) {
            document.getProperties().getCoreProperties().setCreator("Andaime");
            document.getProperties().getCoreProperties().setTitle("Diário de obra " + export.siteCode());
            page(document);
            var heading = document.createParagraph();
            run(heading, "Diário de obra · " + export.siteCode() + " " + export.siteName(), 16, true, null);
            var subtitle = document.createParagraph();
            subtitle.setSpacingAfter(240);
            var count = export.entries().size();
            run(subtitle, export.scope() + " · " + count + (count == 1 ? " registo" : " registos"), 9, false, GREY);

            var picture = 0;
            List<ExportEntry> entries = export.entries();
            for (int i = 0; i < entries.size(); i++) {
                var entry = entries.get(i);
                var title = document.createParagraph();
                // O espaçamento cria as propriedades do parágrafo; setKeepNext do POI falha sem elas.
                title.setSpacingAfter(40);
                title.setKeepNext(true);
                run(title, DATE.format(entry.date()), 10, true, PINE);
                run(title, "  ·  " + entry.title(), 10, true, null);
                var author = document.createParagraph();
                author.setSpacingAfter(60);
                author.setKeepNext(!entry.body().isBlank() || !entry.photos().isEmpty());
                run(author, entry.authorName() + " · " + roleLabel(entry.authorRole()) + " · "
                        + TIME.format(entry.createdAt().atZone(zone)), 8, false, GREY);
                // Um texto em três linhas aparece em três parágrafos.
                for (var line : entry.body().split("\n")) {
                    if (!line.isBlank()) {
                        var paragraph = document.createParagraph();
                        paragraph.setSpacingAfter(60);
                        run(paragraph, line, 9, false, null);
                    }
                }
                // Fotos duas a duas: 2 × 7 cm cabem nos 17 cm úteis da página.
                XWPFParagraph row = null;
                for (int k = 0; k < entry.photos().size(); k++) {
                    if (k % 2 == 0) {
                        row = document.createParagraph();
                        row.setSpacingAfter(80);
                    }
                    var added = addPicture(row, entry.photos().get(k), ++picture);
                    if (!added) {
                        run(row, "[foto " + (k + 1) + " em formato não suportado no Word]", 8, false, GREY);
                    }
                    if (k % 2 == 0 && k + 1 < entry.photos().size()) {
                        row.createRun().setText("  ");
                    }
                }
                var last = i == entries.size() - 1;
                if (!last) {
                    var separator = document.createParagraph();
                    if (!entries.get(i + 1).date().equals(entry.date())) {
                        // Linha fina entre dias.
                        separator.setBorderBottom(Borders.SINGLE);
                        separator.setSpacingAfter(200);
                    } else {
                        separator.setSpacingAfter(80);
                    }
                }
            }
            document.write(output);
        }
    }

    static String roleLabel(String role) {
        return "FOREMAN".equals(role) ? "Encarregado" : "Direção de obra";
    }

    private boolean addPicture(XWPFParagraph paragraph, ExportPhoto photo, int number) {
        byte[] bytes;
        try (var input = photos.open(photo.storageKey())) {
            bytes = input.readAllBytes();
        } catch (IOException | RuntimeException exception) {
            log.warn("Foto do diário indisponível no armazenamento: {}", exception.getMessage());
            return false;
        }
        var scaled = downscale(bytes);
        if (scaled == null) {
            return false;
        }
        var size = DiaryRules.fitBox(scaled.width(), scaled.height(), BOX_EMU);
        try {
            paragraph.createRun().addPicture(new ByteArrayInputStream(scaled.jpeg()), Document.PICTURE_TYPE_JPEG,
                    "foto" + number + ".jpg", (int) size[0], (int) size[1]);
            return true;
        } catch (InvalidFormatException | IOException exception) {
            log.warn("Não foi possível juntar a foto ao Word: {}", exception.getMessage());
            return false;
        }
    }

    record Scaled(byte[] jpeg, int width, int height) {
    }

    /** JPEG com o lado maior até 1200 px e fundo branco (PNG transparentes); {@code null} se o Java não ler o formato. */
    static Scaled downscale(byte[] bytes) {
        try {
            var source = ImageIO.read(new ByteArrayInputStream(bytes));
            if (source == null) {
                return null;
            }
            var scale = Math.min(1.0, (double) MAX_PIXELS / Math.max(source.getWidth(), source.getHeight()));
            var width = Math.max(1, (int) Math.round(source.getWidth() * scale));
            var height = Math.max(1, (int) Math.round(source.getHeight() * scale));
            var target = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            var graphics = target.createGraphics();
            try {
                graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                graphics.setColor(Color.WHITE);
                graphics.fillRect(0, 0, width, height);
                graphics.drawImage(source, 0, 0, width, height, null);
            } finally {
                graphics.dispose();
            }
            var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
            var buffer = new ByteArrayOutputStream();
            try (var stream = ImageIO.createImageOutputStream(buffer)) {
                writer.setOutput(stream);
                var params = writer.getDefaultWriteParam();
                params.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                params.setCompressionQuality(0.82f);
                writer.write(null, new IIOImage(target, null, null), params);
            } finally {
                writer.dispose();
            }
            return new Scaled(buffer.toByteArray(), width, height);
        } catch (IOException | RuntimeException exception) {
            return null;
        }
    }

    private static void page(XWPFDocument document) {
        var section = document.getDocument().getBody().addNewSectPr();
        var size = section.addNewPgSz();
        size.setW(BigInteger.valueOf(11906));
        size.setH(BigInteger.valueOf(16838));
        var margin = section.addNewPgMar();
        margin.setTop(BigInteger.valueOf(MARGIN));
        margin.setBottom(BigInteger.valueOf(MARGIN));
        margin.setLeft(BigInteger.valueOf(MARGIN));
        margin.setRight(BigInteger.valueOf(MARGIN));
        margin.setHeader(BigInteger.valueOf(567));
        margin.setFooter(BigInteger.valueOf(567));
    }

    private static XWPFRun run(XWPFParagraph paragraph, String text, int size, boolean bold, String color) {
        var run = paragraph.createRun();
        run.setText(text);
        run.setFontSize(size);
        run.setFontFamily("Calibri");
        run.setBold(bold);
        if (color != null) {
            run.setColor(color);
        }
        return run;
    }
}
