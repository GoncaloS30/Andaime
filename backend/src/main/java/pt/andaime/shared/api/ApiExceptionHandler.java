package pt.andaime.shared.api;

import java.net.URI;
import java.util.List;

import org.slf4j.MDC;
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
        return problem(exception.status(), exception.code(), exception.getMessage());
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
