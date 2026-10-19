package pt.andaime.sites.domain;

/**
 * Consumo de horas de uma obra face ao limite (porta de {@code src/domain/siteMetrics.ts}). Tudo em minutos.
 *
 * @param limitMin            limite contratado; {@code null} quando a obra não tem limite
 * @param realizedMin         horas realizadas (histórico importado + registos submetidos, revistos e aprovados)
 * @param approvedMin         subconjunto aprovado
 * @param plannedFutureMin    atribuições de hoje em diante ainda sem registo
 * @param includesTimeEntries {@code false} enquanto o registo de horas (F4) não existir: os valores vêm só
 *                            do histórico importado, e a interface diz isso mesmo
 */
public record SiteMetrics(
        Integer limitMin,
        int realizedMin,
        int approvedMin,
        int plannedFutureMin,
        Integer balanceMin,
        int projectionMin,
        double pctRealized,
        double pctProjection,
        Status status,
        int overByMin,
        boolean includesTimeEntries) {

    /** A partir de 85 % da projeção a obra entra em atenção. */
    public static final double WARN_AT = 0.85;

    public enum Status { NO_LIMIT, NORMAL, WARNING, EXCEEDS }

    public static SiteMetrics of(Integer limitMin, int realizedMin, int approvedMin, int plannedFutureMin,
            boolean includesTimeEntries) {
        if (approvedMin > realizedMin) {
            throw new IllegalArgumentException("As horas aprovadas não podem exceder as realizadas");
        }
        var projection = realizedMin + plannedFutureMin;
        if (limitMin == null || limitMin <= 0) {
            return new SiteMetrics(null, realizedMin, approvedMin, plannedFutureMin, null, projection, 0, 0,
                    Status.NO_LIMIT, 0, includesTimeEntries);
        }
        var pctRealized = (double) realizedMin / limitMin;
        var pctProjection = (double) projection / limitMin;
        var status = pctProjection > 1 || pctRealized > 1 ? Status.EXCEEDS
                : pctProjection >= WARN_AT ? Status.WARNING
                : Status.NORMAL;
        return new SiteMetrics(limitMin, realizedMin, approvedMin, plannedFutureMin, limitMin - realizedMin, projection,
                round3(pctRealized), round3(pctProjection), status, Math.max(0, projection - limitMin),
                includesTimeEntries);
    }

    private static double round3(double value) {
        return Math.round(value * 1000) / 1000.0;
    }
}
