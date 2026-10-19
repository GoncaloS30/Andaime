# Limitações conhecidas

## Natureza do protótipo
- **Sem backend, autenticação nem segurança.** Papéis e âmbitos (gestor, encarregado, trabalhador) são simulados na interface; qualquer pessoa pode mudar de papel.
- **Dados só neste navegador** (`localStorage`, com interruptor). Não há sincronização entre dispositivos nem pessoas. Mudar a forma dos dados repõe a semente (versão da store).
- **Offline simulado**: o interruptor "Sem rede" guarda as operações numa caixa de saída e aplica-as ao sincronizar. Não há service worker nem funcionamento offline real.
- **Dados fictícios**: empresa, pessoas, clientes, obras, matrículas e números de documento são inventados. Os telefones usam o formato `+351 910 000 xxx`.
- **Requisitos documentais por país** (A1, SIPSI, Carte BTP, Limosa, Meldung…) são ilustrativos e **não constituem aconselhamento jurídico**.
- O protótipo **não substitui processamento salarial, contabilidade nem faturação**. O "custo estimado" dos relatórios é uma aproximação de demonstração.

## Regras simplificadas
- Horas extra: acima do normal diário (8 h, configurável) e todas as horas de fim de semana. Não há feriados, banco de horas, turnos noturnos nem regras por convenção coletiva/país.
- Pausa descontada só em períodos acima de 6 h. O ponto usa a hora do dispositivo; o guião de apresentação simula um fim de dia às 17:05.
- Um registo de ponto por dia e por trabalhador na app; dias repartidos entre obras são suportados no planeamento e por registo manual/correção.
- Códigos de atividade ERP (800/801/802) e "ordem" seguem o formato da folha de horas do Lyrical, configuráveis apenas na demonstração.

## Técnicas
- **Mapa**: os mosaicos vêm do OpenStreetMap e precisam de internet; sem ligação aparece um aviso e os pinos mantêm-se.
- **Excel**: gerado no navegador com ExcelJS (≈ 0,9 MB, carregado só ao exportar). O `uuid` usado pelo ExcelJS é forçado a ≥ 11.1.1 (`overrides` no `package.json`); `npm audit` reporta 0 vulnerabilidades.
- Redimensionar por arrasto (pega no fim do bloco) altera o período só para dias de hoje em diante; o passado altera-se no painel do bloco ("Alterar período").
- Textos de interface: glossário e textos partilhados estão centralizados; a maioria dos textos de ecrã está junto dos componentes (tradução exigiria extrair para ficheiros de mensagens).
- Sem modo escuro.
- **Fotos carregadas** ficam só neste navegador (IndexedDB); numa janela privada ficam em memória e desaparecem ao fechar o separador (a app avisa). Os pinos do mapa só mostram miniatura das fotos de banco; as carregadas aparecem no painel da obra.
- As fotos de banco são ilustrativas (Pexels); as pessoas não correspondem aos nomes fictícios.
- **Desempenho em telemóvel** (Lighthouse, 4G lento simulado + CPU 4×): primeira pintura ≈ 2,2 s (ecrã de arranque estático), mas a página interativa demora ≈ 4 s e o planeamento e a ficha da obra têm 300–1150 ms de bloqueio (pontuação 61–83, variável entre execuções). A semente e a store correm no arranque, no navegador; com backend real os dados chegariam por página. Em desktop: 98–99.
- Testado em Microsoft Edge (Chromium) desktop, tablet e emulação de telemóvel; não testado em Safari/iOS real nem com leitores de ecrã reais (NVDA/VoiceOver).

## V3.1 (funcionalidades do Lyrical e fotos)
- **Integrações simuladas.** O Google Calendar e o OneDrive não ligam a nenhuma conta, nunca pedem credenciais e não enviam nada. "Ligar" acrescenta eventos de exemplo à Agenda; "sincronizar" regista localmente o que seria enviado (férias aprovadas, livro do RH do mês). Repetir não duplica.
- **Livro de horas do RH:** segue o formato das folhas por pessoa do Lyrical (Data, Horas, Obra, Atividade, Ordem) com a coluna Ausência acrescentada no fim. A fórmula de atividade usa `WEEKDAY` e a folha "Tabelas" e não trata feriados.
- **Dormidas:** "longe de casa" quer dizer outro país ou mais de 100 km entre a cidade de residência e a obra, numa linha reta calculada a partir de uma tabela de cidades. Uma cidade que não está na tabela fica "desconhecido". Não há reservas reais, preços nem disponibilidade de hotéis.
- **Diário de obra:**
  - no máximo 20 fotos por registo;
  - a exportação Word é um `.docx` gerado no navegador, com as fotos convertidas de WebP para JPEG a 7 cm de largura. Abre no Word e no LibreOffice, mas não foi testada no Pages.
- **Mapa de férias:** conta os dias úteis de segunda a sexta, sem feriados nacionais nem municipais.
- **Folha de entrega de EPI:**
  - a impressão usa uma página A4 vertical própria (`@page folha`), que o Chromium e o Edge respeitam; o Safari e o Firefox podem usar a orientação da impressora;
  - a assinatura é feita em papel, sem assinatura digital.
- **Cópia da demonstração:**
  - o JSON só se importa na mesma versão dos dados;
  - importar substitui tudo, sem juntar com o que já existe;
  - as fotos carregadas vão dentro do ficheiro só se se escolher, em base64, que ocupa mais cerca de 37 %;
  - não há encriptação: o ficheiro tem todos os dados da demonstração, que são fictícios.
- **Fotos de banco:** 100 fotos do Pexels (créditos em Definições → Créditos das fotos e em `public/fotos/CREDITOS.md`). Ocupam cerca de 8 MB em `public/fotos`, mas cada ecrã só descarrega os tamanhos de que precisa.
