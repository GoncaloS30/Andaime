package pt.andaime.shared.api;

import java.net.URI;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
final class ApiExceptionHandler {

    @ExceptionHandler(ApiException.class)
    ProblemDetail handleApiException(ApiException exception, jakarta.servlet.http.HttpServletResponse response) {
        if (exception instanceof RateLimitedException rateLimited) {
            response.setHeader(HttpHeaders.RETRY_AFTER,
                    Long.toString(Math.max(1, rateLimited.retryAfter().toSeconds())));
        }
        var problem = problem(exception.status(), exception.code(), exception.getMessage());
        exception.properties().forEach(problem::setProperty);
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail handleValidation(MethodArgumentNotValidException exception) {
        var problem = problem(HttpStatus.BAD_REQUEST, "validation", "Existem campos inválidos.");
        List<FieldProblem> errors = exception.getBindingResult().getFieldErrors().stream()
                .map(this::fieldProblem)
                .toList();
        problem.setProperty("errors", errors);
        return problem;
    }

    /** JSON malformado ou valor inválido (ex.: estado que não existe). */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail handleUnreadable(HttpMessageNotReadableException exception) {
        return problem(HttpStatus.BAD_REQUEST, "bad-request", "O pedido tem dados em formato inválido.");
    }

    /** Identificador malformado no caminho ou parâmetro com tipo errado. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ProblemDetail handleTypeMismatch(MethodArgumentTypeMismatchException exception) {
        return UUID.class.equals(exception.getRequiredType())
                ? problem(HttpStatus.NOT_FOUND, "not-found", "Não encontrado.")
                : problem(HttpStatus.BAD_REQUEST, "bad-request", "O parâmetro " + exception.getName() + " é inválido.");
    }

    /**
     * Invariantes garantidas pela base de dados (unicidade, sobreposição de períodos, referências).
     * Os serviços validam antes com mensagens próprias; isto cobre corridas entre pedidos simultâneos.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail handleIntegrity(DataIntegrityViolationException exception) {
        var state = sqlState(exception);
        return switch (state == null ? "" : state) {
            case "23505" -> problem(HttpStatus.CONFLICT, "duplicate", "Já existe um registo com estes dados.");
            case "23P01" -> problem(HttpStatus.CONFLICT, "overlap", "O período sobrepõe-se a outro já registado.");
            case "23503" -> problem(HttpStatus.NOT_FOUND, "not-found", "Um dos registos indicados não existe.");
            default -> problem(HttpStatus.BAD_REQUEST, "invalid-data", "Os dados não respeitam as regras da aplicação.");
        };
    }

    private static String sqlState(Throwable exception) {
        for (var cause = exception; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && sql.getSQLState() != null) {
                return sql.getSQLState();
            }
        }
        return null;
    }

    private FieldProblem fieldProblem(FieldError error) {
        return new FieldProblem(error.getField(), error.getCode(), error.getDefaultMessage());
    }

    private ProblemDetail problem(HttpStatus status, String code, String detail) {
        var problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("https://andaime.app/problems/" + code));
        problem.setTitle(title(status));
        problem.setProperty("code", code);
        problem.setProperty("requestId", MDC.get("requestId"));
        return problem;
    }

    private String title(HttpStatus status) {
        return switch (status) {
            case BAD_REQUEST -> "Dados inválidos";
            case UNAUTHORIZED -> "Sessão necessária";
            case FORBIDDEN -> "Sem acesso";
            case NOT_FOUND -> "Não encontrado";
            case CONFLICT -> "Conflito";
            case TOO_MANY_REQUESTS -> "Demasiados pedidos";
            default -> "Erro";
        };
    }

    record FieldProblem(String field, String code, String message) {
    }
}
