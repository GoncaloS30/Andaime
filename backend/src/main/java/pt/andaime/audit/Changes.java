package pt.andaime.audit;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Diferença entre dois estados para a auditoria. Campos com dados pessoais sensíveis
 * ficam registados só como "alterado", sem valores (minimização de dados).
 */
public final class Changes {

    private Changes() {
    }

    public static Map<String, Object> diff(Map<String, ?> before, Map<String, ?> after, Set<String> redacted) {
        var changes = new LinkedHashMap<String, Object>();
        for (var key : after.keySet()) {
            var from = before == null ? null : before.get(key);
            var to = after.get(key);
            if (Objects.equals(from, to)) {
                continue;
            }
            if (redacted.contains(key)) {
                changes.put(key, Map.of("changed", true));
            } else {
                var change = new LinkedHashMap<String, Object>();
                change.put("from", from);
                change.put("to", to);
                changes.put(key, change);
            }
        }
        return changes;
    }

    /** Estado inicial (criação): só valores não sensíveis. */
    public static Map<String, Object> created(Map<String, ?> after, Set<String> redacted) {
        var values = new LinkedHashMap<String, Object>();
        after.forEach((key, value) -> {
            if (value != null && !redacted.contains(key)) {
                values.put(key, value);
            }
        });
        return values;
    }
}
