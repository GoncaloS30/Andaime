package pt.andaime.shared.storage;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import pt.andaime.shared.api.ApiException;

/**
 * Antivírus dos ficheiros carregados, pelo protocolo INSTREAM do clamd (ClamAV). Com {@code andaime.antivirus.mode=clamd}
 * cada ficheiro é analisado antes de ir para o armazenamento: infetado é recusado (422) e, se o clamd não responder, o
 * upload também é recusado (503) — falha fechada. Com {@code off} (desenvolvimento) nada é analisado e os documentos
 * ficam marcados {@code NOT_SCANNED}.
 */
@Component
public class FileScanner {

    private static final Logger log = LoggerFactory.getLogger(FileScanner.class);
    private static final int CHUNK = 64 * 1024;

    public enum Result { CLEAN, NOT_SCANNED }

    private final boolean enabled;
    private final String host;
    private final int port;
    private final int timeoutMs;

    public FileScanner(
            @Value("${andaime.antivirus.mode:off}") String mode,
            @Value("${andaime.antivirus.host:localhost}") String host,
            @Value("${andaime.antivirus.port:3310}") int port,
            @Value("${andaime.antivirus.timeout-ms:30000}") int timeoutMs) {
        this.enabled = "clamd".equalsIgnoreCase(mode);
        this.host = host;
        this.port = port;
        this.timeoutMs = timeoutMs;
        if (!enabled) {
            log.info("Antivírus desligado (andaime.antivirus.mode={}): os ficheiros carregados não são analisados.", mode);
        }
    }

    /** Analisa e lança {@link ApiException} se o ficheiro estiver infetado ou o antivírus não estiver disponível. */
    public Result requireClean(byte[] content) {
        if (!enabled) {
            return Result.NOT_SCANNED;
        }
        String reply;
        try {
            reply = scan(content);
        } catch (IOException exception) {
            log.error("Antivírus indisponível em {}:{}: {}", host, port, exception.getMessage());
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "antivirus-unavailable",
                    "Não foi possível verificar o ficheiro. Tente novamente dentro de momentos.");
        }
        if (reply.endsWith("OK") && !reply.contains("FOUND")) {
            return Result.CLEAN;
        }
        if (reply.endsWith("FOUND")) {
            log.warn("Ficheiro recusado pelo antivírus: {}", reply);
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "file-infected", "O ficheiro foi recusado pelo antivírus.");
        }
        // "INSTREAM size limit exceeded" e outros erros do clamd: não se aceita o que não foi analisado.
        log.error("Resposta inesperada do antivírus: {}", reply);
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "antivirus-unavailable",
                "Não foi possível verificar o ficheiro. Tente novamente dentro de momentos.");
    }

    private String scan(byte[] content) throws IOException {
        try (var socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs);
            var out = new DataOutputStream(socket.getOutputStream());
            out.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
            for (int offset = 0; offset < content.length; offset += CHUNK) {
                var length = Math.min(CHUNK, content.length - offset);
                out.writeInt(length);
                out.write(content, offset, length);
            }
            out.writeInt(0);
            out.flush();
            var reply = new ByteArrayOutputStream();
            var in = socket.getInputStream();
            int b;
            while ((b = in.read()) != -1 && b != 0) {
                reply.write(b);
            }
            return reply.toString(StandardCharsets.US_ASCII).strip();
        }
    }
}
