# Teste de carga

## Método

- Dados: empresa de demonstração + `scripts/carga/dados-carga.sql` → **1053 trabalhadores, 50 equipas, 29 obras,
  65 364 atribuições (90 dias úteis) e 21 204 registos de horas**.
- Carga: `scripts/carga/carga.js` (k6) — 20 gestores em simultâneo durante 60 s, cada um a abrir o quadro de
  planeamento de uma semana (entre −2 e +3 semanas), as folhas de horas da semana anterior, uma página de trabalhadores
  e a lista de obras; sessão real com CSRF.
- Ambiente: portátil de desenvolvimento, API e PostgreSQL 18 no WSL2 (um só processo, pool de 10 ligações). Em
  produção os números devem ser melhores; servem para comparar versões.

```bash
docker exec -i andaime-postgres psql -U postgres -d andaime < scripts/carga/dados-carga.sql   # só desenvolvimento
docker run --rm --network host -e BASE=http://localhost:8088 -i grafana/k6 run - < scripts/carga/carga.js
```

## Resultados (2026-10-20)

| Pedido | p95 antes | p95 depois | Limite |
|---|---|---|---|
| Quadro de planeamento (semana, ~5000 atribuições + conflitos) | 1,53 s ✗ | **0,35 s** | 1,5 s |
| Folhas de horas (semana, ~1000 pessoas) | 1,45–1,56 s ✗ | **0,30 s** | 1,5 s |
| Trabalhadores (página de 50) | 0,49 s | **0,12 s** | 0,5 s |
| Obras | 0,42 s | **0,14 s** | 0,5 s |
| Erros | 0 % | 0 % | < 1 % |
| Iterações/s | 6,8 | **12,3** | — |

Correções feitas a partir do teste:

1. **Deteção de conflitos quadrática**: a procura de sobreposições percorria todas as atribuições para cada
   trabalhador e dia; passou a indexar por trabalhador (0,33 s → 0,10 s por pedido de conflitos).
2. **Folhas de horas quadráticas**: o mesmo padrão ao agrupar registos e planeado por trabalhador.
3. **Compressão gzip** das respostas JSON: o quadro passou de 1,9 MB para 210 KB.
4. **Índices** em falta (V18_2): revisões por registo, último toque de ponto, registos por atribuição, versões de
   documentos, ausências por trabalhador.
