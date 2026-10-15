# ADR-0003: A atribuição diária por trabalhador é a unidade do planeamento

**Estado:** Aceite · **Data:** 2026-10-15

## Contexto
No Lyrical Design a unidade era a "linha de equipa" (equipa + obra + dias + trabalhadores) e as horas tinham `UNIQUE(trabalhador, data)`. As folhas reais mostram dias repartidos (4h numa obra + 4h noutra), que esse modelo não representa. As linhas também não eram editáveis.

## Decisão
`Assignment = { workerId, siteId, date, hours, start, end, teamId?, vehicleId?, isForeman, batchId? }`.
- Várias atribuições por trabalhador/dia são permitidas; conflito quando a soma excede a capacidade diária ou os horários se sobrepõem.
- A "escala" (equipa × obra × semana) é uma **vista derivada** agrupando por `batchId`/`teamId`/`siteId`.
- Viaturas têm reservas próprias (`VehicleBooking` por dia), para detetar dupla reserva e lotação.
- Horas realizadas (`TimeEntry`) são entidade separada: o planeado nunca se converte silenciosamente em realizado.

## Consequências
- Mais fácil: transferências parciais, arrastar blocos, dias repartidos, perspetivas por obra/equipa/viatura.
- Mais difícil: a vista "linha de equipa" para os mapas semanais tem de ser reconstruída (feito em `domain/weeklyMap`).
