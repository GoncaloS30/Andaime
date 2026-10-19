package pt.andaime.shared.api;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> properties = new LinkedHashMap<>();

    public ApiException(HttpStatus status, String code, String detail) {
        super(detail);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    /** Dados adicionais devolvidos no ProblemDetail (ex.: a lista de conflitos de planeamento). */
    public ApiException with(String name, Object value) {
        properties.put(name, value);
        return this;
    }

    public Map<String, Object> properties() {
        return properties;
    }
}
