# Regras por país — o que é configurável e o que falta validar

> As regras abaixo vêm configuradas como **exemplo**. Antes de vender num país, um jurista laboral desse país tem de
> validar os valores por omissão e os documentos exigidos. O Andaime não substitui processamento salarial nem
> aconselhamento jurídico.

## Política laboral (por empresa, com data de início)

Configurável em Definições → Regras: horas normais por dia e por semana, dias de descanso, pausa automática (depois de
quantos minutos e quanto tempo), atribuição dos turnos que passam a meia-noite e feriados da empresa. Os feriados
**nacionais** de PT, ES, FR, BE, LU, NL, DE, AT, IT, IE, GB (Inglaterra e País de Gales) e CH (só federal) são
calculados pelo sistema e contam no cálculo de horas (do país da empresa e do país de cada obra); regionais e
municipais registam-se como feriados da empresa.

Pontos a validar nos feriados nacionais: Itália (4 de outubro a partir de 2026), Países Baixos (5 de maio e
Sexta-feira Santa dependem da convenção), Espanha (6 de janeiro substituível pelas regiões; feriados ao domingo),
Irlanda e Bélgica (dias de substituição não modelados), Reino Unido (feriados pontuais futuros), França (segunda-feira de
Pentecostes como dia de solidariedade; Alsácia-Mosela), Portugal (Sexta-feira Santa noutro dia por costume local).

| País | Por omissão hoje | A validar |
|---|---|---|
| Todos (uma política por empresa, sem distinção de país) | 8 h/dia, 40 h/semana, sábado e domingo de descanso, pausa de 60 min após 6 h | Se é preciso uma política por país da obra (a tabela já tem a coluna `country`, sem uso na interface) |
| Portugal | — | Convenção coletiva da construção civil (limites, trabalho suplementar, banco de horas), regras de pausa, trabalho noturno, feriados nacionais e municipais |
| Espanha, França, Bélgica, Luxemburgo, Países Baixos, Alemanha, Suíça, Reino Unido, Irlanda, Áustria, Itália (países com fuso pré-definido nas obras) | — | Limites diários/semanais, horas extra e convenções de cada país; registo de horas obrigatório (ex.: Espanha) e formato exigido; feriados |

**Horas extra:** calculadas a partir da política (acima do normal diário/semanal e em dias de descanso). Não há regras
de majoração salarial — o Andaime exporta as horas com o código ERP e o cálculo do valor fica no processamento salarial.

## Documentos e destacamento

Catálogo inicial (cada empresa decide onde é exigido): documento de identificação, ficha de aptidão médica, formação em
segurança na construção, certificado A1, carta de condução; nas viaturas, seguro e inspeção periódica.

| Situação | O que o sistema permite | A validar |
|---|---|---|
| Destacamento na UE/EEE/Suíça | Exigir A1 por país da obra; alertas de validade | Declarações prévias de destacamento de cada país (ex.: SIPSI em França, Limosa na Bélgica, declaração na Alemanha), representante no país, documentos a manter disponíveis na obra e por quanto tempo |
| Cartão profissional da construção | Tipo de documento à medida (ex.: carte BTP em França) | Obrigatoriedade e formato por país |
| Formação de segurança | Tipo de documento com validade | Formações obrigatórias e validade por país |
| Aptidão médica | Tipo com validade e alerta | Periodicidade e quem guarda o documento |

## Fusos e feriados

Cada obra tem o seu fuso (IANA). Os registos de tempo guardam o instante (UTC) e o fuso da obra; os dias são calculados
no fuso da obra. Quando a obra e a empresa são de países diferentes, contam os feriados nacionais de ambos — **a
confirmar** (ex.: trabalhador de empresa portuguesa numa obra em Espanha a 10 de junho).
