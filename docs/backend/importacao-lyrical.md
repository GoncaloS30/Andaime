# Importação da aplicação Lyrical

O importador lê uma base SQLite da aplicação anterior e gera SQL transacional
para uma empresa nova no Andaime. A base original nunca é aberta diretamente:
`escala.db`, `escala.db-wal` e `escala.db-shm` são copiados para uma pasta
temporária, o WAL é consolidado nessa cópia e a pasta é eliminada no fim.

## Âmbito atual

São importados os módulos já disponíveis no backend:

- colaboradores e tamanhos de fardamento;
- equipas e a composição correspondente à semana mais recente;
- obras;
- férias e ausências, como ausências aprovadas (F8.9);
- hotéis de cada obra e dormidas, como estadias semanais (F8.9);
- diário de obra, só o texto (F8.9).

As tabelas dos módulos novos (`ferias`, `ausencias`, `hoteis`, `dormidas`,
`relatorios`, `relatorio_fotos`) são opcionais: uma base antiga sem elas importa
o resto e indica zero.

Os restantes dados são apenas contabilizados e permanecem na base original para
uma fase posterior: viaturas, planeamento semanal, horas, ferramentas e
ficheiros do RH.

Ficam sempre de fora:

- as fotografias do diário (`relatorio_fotos`) e os ficheiros na pasta
  `relatorios/`; a simulação diz quantas foram ignoradas e em quantos registos;
- as configurações de integrações: tokens, segredos e identificadores
  Google/Microsoft nunca entram no SQL gerado;
- eventos da agenda: o Lyrical não tem eventos próprios (a agenda é calculada a
  partir das férias e das obras), por isso `calendar_events` fica vazia.

## Simulação

```powershell
npm run importar:lyrical -- --db "C:\caminho\escala.db"
```

A simulação verifica a integridade SQLite e as chaves estrangeiras, apresenta as
contagens e descreve as transformações sem criar qualquer ficheiro de importação.

## Gerar a transação

```powershell
npm run importar:lyrical -- `
  --db "C:\caminho\escala.db" `
  --email "utilizador@example.com" `
  --org "Empresa — Testes" `
  --display-name "Nome do utilizador" `
  --output "$env:TEMP\andaime-lyrical.sql"
```

O SQL recusa executar se o email ou o nome da empresa já existirem. Cria a
conta com a palavra-passe bloqueada (`!RESET_REQUIRED!`), marca o email como
verificado, cria a empresa e grava toda a importação entre `BEGIN` e `COMMIT`.
Depois da execução deve ser pedido um email de reposição de palavra-passe pela
API; em desenvolvimento, esse email fica no Mailpit.

O ficheiro SQL contém os dados pessoais a importar. Deve ficar apenas numa pasta
temporária e ser eliminado imediatamente depois da execução e validação.

## Regras de transformação

- números de colaborador e códigos de obra são normalizados para letras,
  números e hífen, com sufixos determinísticos em caso de colisão;
- categorias vazias passam a `Sem categoria`;
- limites de horas negativos ou nulos passam a obra sem limite;
- horas são convertidas para minutos;
- país e fuso horário das obras ficam, por omissão, em `PT` e
  `Europe/Lisbon`;
- a equipa atual de cada pessoa é obtida da semana mais recente; quando existem
  várias equipas nessa semana, vence a que cobre mais dias e o relatório assinala
  a decisão;
- dados sem módulo de destino não são descartados nem simulados.

### Férias e ausências

Todas entram com o estado `APPROVED`, pedidas e decididas pelo dono que importa.

| Lyrical | Andaime | Nota |
| --- | --- | --- |
| `ferias` (tabela própria) | `VACATION` | observações na nota |
| `baixa` | `SICK` | |
| `formacao` | `TRAINING` | |
| `licenca` | `LEAVE` | |
| `falta_justificada` | `PERSONAL` | a nota começa por "Falta justificada" |
| `falta_injustificada` | `OTHER` | a nota começa por "Falta injustificada" |
| `outra` | `OTHER` | |
| tipo desconhecido | `OTHER` | a nota começa por "Tipo no Lyrical: …" |

- A nota fica com 500 caracteres no máximo (cortada com "…", e contada).
- Datas inválidas, fim antes do início e períodos com mais de 366 dias são
  recusados.
- O Andaime não aceita ausências de dia inteiro sobrepostas. Como no Lyrical, o
  dia fica com a primeira (início, depois `ausencias` antes de `ferias`, depois
  id); a seguinte passa a começar no dia a seguir e, se ficar coberta por
  inteiro, é recusada.

### Hotéis e dormidas

- Cada hotel fica na sua obra. Nomes repetidos na mesma obra, sem olhar a
  acentos, maiúsculas nem espaços repetidos (o mesmo critério de
  `app.fold_name`), juntam-se no primeiro, que herda a morada, o contacto e as
  notas que lhe faltem. Nomes com menos de 2 caracteres são recusados.
- Cada dormida passa a estadia pessoa × obra × semana. A semana é a
  segunda-feira ISO de `semana_inicio` (ou da entrada, se `semana_inicio` for
  inválida).
- As datas nunca são corrigidas. São recusadas as estadias em que a saída não é
  depois da entrada, as que têm mais de 14 noites, as que têm a entrada fora da
  semana (da segunda anterior ao domingo) e uma segunda estadia da mesma
  pessoa, obra e semana.
- Um hotel recusado, apagado ou de outra obra deixa a estadia com o hotel "por
  definir". A simulação conta estes casos.

### Diário de obra

- Cada registo de `relatorios` passa a um registo do diário da obra, com a
  mesma data e a hora de criação original quando é válida.
- Um título vazio passa a "Registo do diário". Títulos acima de 160 caracteres
  e textos acima de 10 000 são cortados com "…" e contados.
- O autor do Lyrical é texto livre, sem conta. O registo fica do dono que
  importa, com o papel `MANAGER` ("Direção de obra"), e o nome original vai para
  o fim do texto ("— Autor no Lyrical: …").
- As fotografias não são importadas.

### Linhas recusadas

Nenhuma linha é descartada em silêncio. A simulação mostra em `notImported`,
por tabela do Lyrical e por motivo, o número de linhas recusadas e os ids do
Lyrical (até 50 por motivo, sem nomes nem textos). O evento
`legacy.import.completed` guarda as mesmas contagens.

## Verificação

```powershell
npm run test:lyrical-import
```

Os testes usam só bases SQLite sintéticas, criadas em memória, e nunca dados
reais.

Antes do `COMMIT`, o SQL confirma as contagens de cada tabela da empresa nova
(colaboradores, equipas, membros, obras, ausências, hotéis, estadias e diário).
Se alguma contagem não bater, a transação falha. A execução termina com essas
contagens e com um evento de auditoria `legacy.import.completed`.
