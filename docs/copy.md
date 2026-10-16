# Guia de textos (pt-PT)

## Glossário fixo

| Termo | Significado | Nunca usar |
|---|---|---|
| **Obra** | Local de trabalho com cliente, localização e limite de horas | Projeto |
| **Trabalhador** | Pessoa planeada e com horas | Colaborador |
| **Equipa** | Grupo com responsável e viatura | — |
| **Limite de horas** | Horas contratadas ou o máximo definido | "Horas planeadas" para o limite |
| **Planeadas** | Atribuições de hoje em diante ainda sem registo | — |
| **Realizadas** | Registos submetidos, revistos ou aprovados | — |
| **Aprovadas** | Realizadas aprovadas pelo gestor | — |
| **Saldo** | Limite − realizadas | — |
| **Projeção** | Realizadas + planeadas | — |
| **Folha** | Registos de um trabalhador numa semana | — |

Estados de registo: *Em curso* (entrada sem saída) → *Por rever* (encarregado) → *Por aprovar* (gestor) → *Aprovada*; ou *Devolvida* com motivo.

## Regras

- **Botões dizem o que acontece**, com a mesma palavra no toast: "Aprovar" → "3 registos aprovados"; "Transferir" → "… transferido para OB-25-012".
- **Destrutivo nomeia o objeto**: "Remover atribuições", "Repor dados" / "Manter alterações", nunca "OK/Cancelar".
- **Erros**: o que falhou + como resolver, sem pedir desculpa ("A data de fim é anterior à de início.").
- **Vazios**: o que é + porque está vazio + como começar.
- **Conflitos**: título curto com a pessoa/viatura/obra, explicação com datas e obras, correções como ações ("Substituir por …", "Usar PT-12-WO em OB-25-012").
- **Neutro em género** quando se fala de pessoas: "tem trabalho atribuído", "mantém-se no planeamento" (não "escalado/atribuído" com flexão).
- **Concordância de número** nos contadores (`plural()` em `src/store/helpers.ts`).
- **Demonstração sempre identificada**: "Demonstração · dados fictícios"; requisitos documentais "ilustrativos, não constituem aconselhamento jurídico".
- Datas: "qui 15 out", "quinta-feira, 15 de outubro", "15/10/2026" em tabelas; horas "8 h", "7,5 h", "12 345 h" com espaços não separáveis.

Textos partilhados em `src/copy/index.ts` (papéis, rótulo de demonstração, glossário); rótulos de domínio em `src/domain/labels.ts`. Os restantes textos estão junto dos componentes (ver limitações).
