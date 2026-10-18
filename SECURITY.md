# Segurança

## Âmbito

O Andaime é, nesta fase, um **protótipo demonstrativo**: corre só no navegador, com dados fictícios, sem backend, autenticação nem dados pessoais reais (ver `docs/limitacoes.md`). As permissões por papel são simuladas na interface.

Mesmo assim, tratamos a sério:

- dependências com vulnerabilidades conhecidas (`npm audit` corre em cada PR e o Dependabot propõe atualizações semanais);
- código que possa executar conteúdo não confiável (ficheiros carregados, fotos, importações);
- qualquer dado real que tenha entrado no repositório por engano.

## Como reportar

Não abra uma issue pública para problemas de segurança. Envie um email para **goncalosilva18.st@gmail.com** com:

1. a descrição do problema e o impacto;
2. os passos para reproduzir;
3. a versão ou o commit afetado.

Resposta em até 5 dias úteis. Se o problema se confirmar, a correção sai numa versão de manutenção e o `CHANGELOG.md` regista-a.

## Dados reais

Este repositório não deve conter dados pessoais reais (nomes, contactos, documentos). Se encontrar algum, reporte pelo email acima: o histórico é limpo e as credenciais eventualmente expostas são revogadas.
