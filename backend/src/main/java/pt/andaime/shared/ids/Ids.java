package pt.andaime.shared.ids;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.UUID;

import org.springframework.stereotype.Component;

@Component
public final class Ids {

    private final SecureRandom random = new SecureRandom();
    private final Clock clock;

    public Ids(Clock clock) {
        this.clock = clock;
    }

    public UUID next() {
        var bytes = new byte[16];
        random.nextBytes(bytes);
        var millis = clock.millis();
        for (int index = 5; index >= 0; index--) {
            bytes[index] = (byte) millis;
            millis >>>= 8;
        }
        bytes[6] = (byte) ((bytes[6] & 0x0f) | 0x70);
        bytes[8] = (byte) ((bytes[8] & 0x3f) | 0x80);
        var buffer = ByteBuffer.wrap(bytes);
        return new UUID(buffer.getLong(), buffer.getLong());
    }
}
