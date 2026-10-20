# Importação da aplicação Lyrical

O importador lê uma base SQLite da aplicação anterior e gera SQL transacional
para uma empresa nova no Andaime. A base original nunca é aberta diretamente:
`escala.db`, `escala.db-wal` e `escala.db-shm` são copiados para uma pasta
temporária, o WAL é consolidado nessa cópia e a pasta é eliminada no fim.

## Âmbito atual

São importados os módulos já disponíveis no backend:

- colaboradores e tamanhos de fardamento;
- equipas e a composição correspondente à semana mais recente;
- obras.

Os restantes dados são apenas contabilizados e permanecem na base original para
uma fase posterior: viaturas, planeamento semanal, horas, férias, ausências,
ferramentas, hotéis, dormidas, diário e ficheiros do RH.

As fotografias e as configurações de integrações são sempre excluídas. Tokens,
segredos e identificadores Google/Microsoft nunca entram no SQL gerado.

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

## Verificação

```powershell
npm run test:lyrical-import
```

Além dos testes, a execução deve terminar com a comparação das contagens por
empresa e com um evento de auditoria `legacy.import.completed`.
