package pt.andaime.shared.api;

import java.util.List;

/** Página de resultados: {@code {items, page, size, total}}. */
public record PageView<T>(List<T> items, int page, int size, long total) {
}
