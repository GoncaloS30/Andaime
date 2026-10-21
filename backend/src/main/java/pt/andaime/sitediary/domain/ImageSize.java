package pt.andaime.sitediary.domain;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Optional;

import javax.imageio.ImageIO;

/**
 * Largura e altura de uma imagem JPEG, PNG ou WebP, lidas do cabeçalho (sem descodificar os píxeis). Servem para
 * reservar o espaço na interface e para encaixar as fotos no Word sem as deformar.
 */
public final class ImageSize {

    public record Size(int width, int height) {
    }

    private ImageSize() {
    }

    public static Optional<Size> of(byte[] content, String contentType) {
        try {
            return "image/webp".equals(contentType) ? webp(content) : imageIo(content);
        } catch (IOException | RuntimeException exception) {
            return Optional.empty();
        }
    }

    private static Optional<Size> imageIo(byte[] content) throws IOException {
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(content))) {
            if (input == null) {
                return Optional.empty();
            }
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                return Optional.empty();
            }
            var reader = readers.next();
            try {
                reader.setInput(input, true, true);
                return valid(reader.getWidth(0), reader.getHeight(0));
            } finally {
                reader.dispose();
            }
        }
    }

    /** RIFF....WEBP seguido de VP8 (com perdas), VP8L (sem perdas) ou VP8X (extendido). */
    static Optional<Size> webp(byte[] b) {
        if (b.length < 30 || !ascii(b, 0, "RIFF") || !ascii(b, 8, "WEBP")) {
            return Optional.empty();
        }
        if (ascii(b, 12, "VP8 ")) {
            // Quadro-chave: 3 bytes de etiqueta, assinatura 9d 01 2a, depois 14 bits de largura e de altura.
            return valid(u16(b, 26) & 0x3fff, u16(b, 28) & 0x3fff);
        }
        if (ascii(b, 12, "VP8L")) {
            var bits = (b[21] & 0xff) | (b[22] & 0xff) << 8 | (b[23] & 0xff) << 16 | (b[24] & 0xff) << 24;
            return valid((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
        }
        if (ascii(b, 12, "VP8X")) {
            return valid(u24(b, 24) + 1, u24(b, 27) + 1);
        }
        return Optional.empty();
    }

    private static Optional<Size> valid(int width, int height) {
        return width > 0 && height > 0 ? Optional.of(new Size(width, height)) : Optional.empty();
    }

    private static boolean ascii(byte[] b, int offset, String text) {
        for (int i = 0; i < text.length(); i++) {
            if (b[offset + i] != text.charAt(i)) {
                return false;
            }
        }
        return true;
    }

    private static int u16(byte[] b, int offset) {
        return (b[offset] & 0xff) | (b[offset + 1] & 0xff) << 8;
    }

    private static int u24(byte[] b, int offset) {
        return (b[offset] & 0xff) | (b[offset + 1] & 0xff) << 8 | (b[offset + 2] & 0xff) << 16;
    }
}
