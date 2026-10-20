package pt.andaime.shared.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

import pt.andaime.shared.api.ApiException;

/** Protocolo INSTREAM contra um clamd falso: limpo, infetado, indisponível e desligado. */
class FileScannerTest {

    private static final byte[] EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
            .getBytes(StandardCharsets.US_ASCII);

    /** Arranca um clamd falso que lê o pedido e responde {@code reply}; devolve a porta. */
    private static int fakeClamd(String reply, AtomicReference<byte[]> received) throws IOException {
        var server = new ServerSocket(0);
        Thread.ofVirtual().start(() -> {
            try (server; var socket = server.accept()) {
                var in = new DataInputStream(socket.getInputStream());
                var command = new byte[10];
                in.readFully(command);
                assertThat(new String(command, StandardCharsets.US_ASCII)).isEqualTo("zINSTREAM\0");
                var content = new ByteArrayOutputStream();
                int length;
                while ((length = in.readInt()) > 0) {
                    content.write(in.readNBytes(length));
                }
                received.set(content.toByteArray());
                socket.getOutputStream().write((reply + "\0").getBytes(StandardCharsets.US_ASCII));
            } catch (IOException ignored) {
                // o teste falha pelas asserções do lado do cliente
            }
        });
        return server.getLocalPort();
    }

    @Test
    void ficheiroLimpoPassaEOConteudoChegaInteiro() throws IOException {
        var received = new AtomicReference<byte[]>();
        var content = new byte[150_000];
        for (int i = 0; i < content.length; i++) {
            content[i] = (byte) i;
        }
        var scanner = new FileScanner("clamd", "localhost", fakeClamd("stream: OK", received), 5000);
        assertThat(scanner.requireClean(content)).isEqualTo(FileScanner.Result.CLEAN);
        assertThat(received.get()).isEqualTo(content);
    }

    @Test
    void ficheiroInfetadoERecusado() throws IOException {
        var scanner = new FileScanner("clamd", "localhost",
                fakeClamd("stream: Eicar-Test-Signature FOUND", new AtomicReference<>()), 5000);
        assertThatThrownBy(() -> scanner.requireClean(EICAR)).isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).code()).isEqualTo("file-infected");
    }

    @Test
    void semAntivirusOUploadERecusado() throws IOException {
        int port;
        try (var unused = new ServerSocket(0)) {
            port = unused.getLocalPort();
        }
        var scanner = new FileScanner("clamd", "localhost", port, 2000);
        assertThatThrownBy(() -> scanner.requireClean(EICAR)).isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).code()).isEqualTo("antivirus-unavailable");
    }

    @Test
    void desligadoNaoAnalisa() {
        assertThat(new FileScanner("off", "localhost", 1, 1000).requireClean(EICAR)).isEqualTo(FileScanner.Result.NOT_SCANNED);
    }
}
