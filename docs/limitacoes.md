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
- **Excel**: gerado no navegador com ExcelJS (≈ 0,9 MB, carregado só ao exportar). O `npm audit` reporta 2 vulnerabilidades moderadas numa dependência do ExcelJS (`uuid`); sem impacto nesta demo sem servidor, a rever antes de produção.
- Arrastar e largar não tem redimensionamento por arrasto: "Alterar período" faz-se no painel do bloco (com datas), com teclado ou rato.
- Textos de interface: glossário e textos partilhados estão centralizados; a maioria dos textos de ecrã está junto dos componentes (tradução exigiria extrair para ficheiros de mensagens).
- Pluralização feita em mais de um sítio (achado de revisão adiado; sem impacto funcional).
- Sem modo escuro.
- Lighthouse não foi executado (sem instalação local); performance avaliada por tamanho de bundles, carregamento por rota e testes com JavaScript lento.
- Testado em Microsoft Edge (Chromium) desktop, tablet e emulação de telemóvel; não testado em Safari/iOS real nem com leitores de ecrã reais (NVDA/VoiceOver).
