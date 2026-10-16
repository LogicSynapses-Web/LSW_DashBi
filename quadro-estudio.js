/* =====================================================================
   QUADRO → ESTÚDIO (fase 4 · 14/10/2026)
   Botão "Enviar ao Estúdio" (aba Painel): grava a base QUADRO no Estúdio
   (uma linha por pessoa, com as datas de cada situação e a escala) pelas
   mesmas rotas de carga do Estúdio. Na 1ª vez também cria as medidas DAX
   e o relatório-modelo "PAINEL DO QUADRO", e publica o card em Relatórios
   NÃO VISÍVEL para os usuários (o ADM decide quando liberar).
   O cálculo dia a dia (real e projeção) e o de 30 em 30 min ficam nas
   medidas DAX, com as tabelas de apoio CALENDARIO e FAIXAS do Estúdio.
   Datas sem valor viram 01/01/1900 (já aconteceu) ou 31/12/2999 (não
   acontece), para as comparações das medidas ficarem simples.
   Depende do script.js, estudio.js (estApi, estDuck, estSql), quadro*.js.
   ===================================================================== */

const QE_BASE = 'QUADRO', QE_REL = 'PAINEL DO QUADRO';
const QE_ANTES = '1900-01-01', QE_NUNCA = '2999-12-31';
// Molde da base: [nome interno, rótulo (usado no DAX), tipo]
const QE_COLUNAS = [
  ['data_base', 'DATA DA BASE', 'data'], ['matricula', 'MATRÍCULA', 'texto'], ['nome', 'NOME', 'texto'], ['situacao', 'SITUAÇÃO', 'texto'],
  ['admissao', 'ADMISSÃO', 'data'], ['saida', 'SAÍDA', 'data'], ['rescisao', 'INÍCIO RESCISÃO', 'data'],
  ['ferias_ini', 'INÍCIO FÉRIAS', 'data'], ['ferias_fim', 'FIM FÉRIAS', 'data'],
  ['afast_ini', 'INÍCIO AFASTAMENTO', 'data'], ['afast_fim', 'RETORNO AFASTAMENTO', 'data'], ['aviso_ini', 'INÍCIO AVISO', 'data'],
  ['turno', 'TURNO', 'texto'], ['entrada', 'ENTRADA', 'hora'], ['saida_turno', 'SAÍDA DO TURNO', 'hora'], ['ch', 'CARGA HORÁRIA', 'texto'],
  ['horas_dia', 'HORAS DIA', 'decimal'], ['escala', 'ESCALA', 'texto'], ['conta_escala', 'CONTA ESCALA', 'inteiro'],
  ['segmento', 'SEGMENTO', 'texto'], ['supervisor', 'SUPERVISOR', 'texto'], ['coordenador', 'COORDENADOR', 'texto'], ['site', 'SITE', 'texto'],
  ['regime', 'REGIME', 'texto'], ['nivel', 'NÍVEL', 'texto'], ['mat_wfm', 'MAT WFM', 'texto'], ['situacao_wfm', 'SITUAÇÃO WFM', 'texto'],
].map(([nome, rotulo, tipo]) => ({ origem: nome, nome, rotulo, tipo, manter: true, vazio: 'nulo', padrao: '' }));

/* ---------------- escala de cada pessoa (regras de negócio) ---------------- */
// Jornada do WFM ("6x1 - 06h20 - ...") manda; 6x1 vale como 7x1. Sem jornada no WFM: pela carga horária do DPO.
const QE_CH_ESCALA = { '06:00': '4X3', '06:20': '7X1', '08:12': '5X2', '08:20': '7X1', '10:00': '5X2' };
function qeEscala(f){
  const j = String((f.wfm && f.wfm.jornada) || '').match(/^\s*(\d)\s*x\s*(\d)/i);
  if (j) { const e = `${j[1]}X${j[2]}`; return e === '6X1' ? '7X1' : e; }
  return QE_CH_ESCALA[f.carga_horaria] || '';
}
// Só operação entra nas horas escaladas: jornadas da lista (06:00, 06:20, 08:12, 08:20, 10:00) e sem cargo de liderança
function qeContaEscala(f, escala){
  if (!escala || !QE_CH_ESCALA[f.carga_horaria]) return 0;
  return /SUPERVISOR|COORDENADOR|GERENTE/.test(qdNorm(f.nivel || f.funcao)) ? 0 : 1;
}
// Horas por dia: 10h = 9h de jornada (regra de negócio); demais = a própria carga horária
function qeHorasDia(ch){
  const m = String(ch || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return ch === '10:00' ? 9 : +m[1] + m[2] / 60;
}
const qeSomaHora = (h, ch) => {
  const a = String(h || '').match(/^(\d{1,2}):(\d{2})/), b = String(ch || '').match(/^(\d{1,2}):(\d{2})/);
  if (!a || !b) return '';
  const t = (+a[1] * 60 + +a[2] + +b[1] * 60 + +b[2]) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};

/* ---------------- linhas da base ---------------- */
function qeLinha(f, dataBase){
  const w = f.wfm || {}, st = f.status;
  const saidas = [f.desligamento, f.aviso_fim ? qpMaisDias(f.aviso_fim, 1) : ''].filter(Boolean).sort();
  const afIni = f.afast_ini || (st === 'afastado' ? (w.sit_ini || QE_ANTES) : '');
  const feIni = f.ferias_ini || w.ferias_ini || (st === 'ferias' ? QE_ANTES : '');
  const entrada = f.hora_entrada || w.hora_entrada || '', ch = f.carga_horaria || w.carga_horaria || '';
  const escala = qeEscala(f);
  return {
    data_base: dataBase, matricula: f.matricula, nome: f.nome, situacao: (QD_STATUS[st] || QD_STATUS.outro).nome.toUpperCase(),
    admissao: f.admissao || QE_ANTES,
    saida: saidas[0] || (st === 'desligado' ? QE_ANTES : QE_NUNCA),
    rescisao: st === 'rescisao' ? (w.sit_ini || w.dt_situacao || QE_ANTES) : QE_NUNCA,
    ferias_ini: feIni || QE_NUNCA, ferias_fim: feIni ? (f.ferias_fim || w.ferias_fim || QE_NUNCA) : QE_NUNCA,
    afast_ini: afIni || QE_NUNCA, afast_fim: afIni ? (f.afast_fim || (st === 'afastado' ? w.sit_fim : '') || QE_NUNCA) : QE_NUNCA,
    aviso_ini: f.aviso_ini || (st === 'aviso' ? QE_ANTES : QE_NUNCA),
    turno: (QD_TURNOS[f.turno] || '').split(' ')[0], entrada, saida_turno: f.hora_saida || qeSomaHora(entrada, ch), ch,
    horas_dia: qeHorasDia(ch), escala, conta_escala: qeContaEscala(f, escala),
    segmento: f.segmento, supervisor: f.gestor1, coordenador: f.gestor2, site: f.site, regime: f.regime || '', nivel: f.nivel || '',
    mat_wfm: w.re || '', situacao_wfm: w.situacao || '',
  };
}

/* ---------------- medidas DAX (dia a dia, projeção, escala e 30 em 30 min) ---------------- */
const QE_D = 'CALENDARIO[DATA]';
const QE_COND = {
  quadro: [`dados[ADMISSÃO] <= ${QE_D}`, `dados[SAÍDA] > ${QE_D}`],
  semResc: `dados[INÍCIO RESCISÃO] > ${QE_D}`,
  semAfast: `(dados[INÍCIO AFASTAMENTO] > ${QE_D} || dados[RETORNO AFASTAMENTO] <= ${QE_D})`,
  semFerias: `(dados[INÍCIO FÉRIAS] > ${QE_D} || dados[FIM FÉRIAS] < ${QE_D})`,
};
// Quem está trabalhando no dia (ativo ou de aviso) e conta para a escala
const QE_TRAB = ['(' + QE_COND.quadro.join(') && (') + ')', QE_COND.semResc, QE_COND.semAfast, QE_COND.semFerias, 'dados[CONTA ESCALA] = 1'].map(c => `(${c})`).join(' && ');
// Fator do dia: 4x3 seg–qui sem feriado · 5x2 seg–sex · 7x1 todos os dias, com 60% no sábado e 40% no domingo
const QE_FATOR = `SWITCH(TRUE(),
  dados[ESCALA] = "4X3", IF((CALENDARIO[DIA DA SEMANA] >= 2) && (CALENDARIO[DIA DA SEMANA] <= 5) && (CALENDARIO[FERIADO] = 0), 1, 0),
  dados[ESCALA] = "5X2", IF((CALENDARIO[DIA DA SEMANA] >= 2) && (CALENDARIO[DIA DA SEMANA] <= 6), 1, 0),
  dados[ESCALA] = "7X1", SWITCH(CALENDARIO[DIA DA SEMANA], 7, 0.6, 1, 0.4, 1),
  0)`;
// Na faixa: entrada ≤ faixa < saída (turno que vira a meia-noite: depois da entrada OU antes da saída)
const QE_NA_FAIXA = `((dados[ENTRADA] <= FAIXAS[INÍCIO] && FAIXAS[INÍCIO] < dados[SAÍDA DO TURNO]) || (dados[SAÍDA DO TURNO] < dados[ENTRADA] && (FAIXAS[INÍCIO] >= dados[ENTRADA] || FAIXAS[INÍCIO] < dados[SAÍDA DO TURNO])))`;
const qeMesmaFaixa = col => `(HOUR(${col}) = HOUR(FAIXAS[INÍCIO])) && (INT(MINUTE(${col}) / 30) = INT(MINUTE(FAIXAS[INÍCIO]) / 30))`;
const QE_DIA_BASE = `${QE_D} = dados[DATA DA BASE]`;
const QE_MEDIDAS = [
  // Rescisão indireta é desligamento (15/10/2026): fica fora do NO QUADRO; RESCISÃO INDIRETA conta à parte
  ['qd_m_quadro', 'NO QUADRO', `CALCULATE(COUNTROWS(dados), ${QE_COND.quadro.join(', ')}, ${QE_COND.semResc})`, 'inteiro'],
  ['qd_m_resc', 'RESCISÃO INDIRETA', `CALCULATE(COUNTROWS(dados), ${QE_COND.quadro.join(', ')}, dados[INÍCIO RESCISÃO] <= ${QE_D})`, 'inteiro'],
  ['qd_m_afast', 'AFASTADOS', `CALCULATE([NO QUADRO], ${QE_COND.semResc}, dados[INÍCIO AFASTAMENTO] <= ${QE_D}, dados[RETORNO AFASTAMENTO] > ${QE_D})`, 'inteiro'],
  ['qd_m_ferias', 'FÉRIAS', `CALCULATE([NO QUADRO], ${QE_COND.semResc}, ${QE_COND.semAfast}, dados[INÍCIO FÉRIAS] <= ${QE_D}, dados[FIM FÉRIAS] >= ${QE_D})`, 'inteiro'],
  ['qd_m_aviso', 'AVISO PRÉVIO', `CALCULATE([NO QUADRO], ${QE_COND.semResc}, ${QE_COND.semAfast}, ${QE_COND.semFerias}, dados[INÍCIO AVISO] <= ${QE_D})`, 'inteiro'],
  ['qd_m_ativos', 'ATIVOS', '[NO QUADRO] - [AFASTADOS] - [FÉRIAS] - [AVISO PRÉVIO]', 'inteiro'],
  ['qd_m_trab', 'TRABALHANDO', '[ATIVOS] + [AVISO PRÉVIO]', 'inteiro'],
  ['qd_m_entradas', 'ENTRADAS', `CALCULATE(COUNTROWS(dados), dados[ADMISSÃO] = ${QE_D})`, 'inteiro'],
  ['qd_m_saidas', 'SAÍDAS', `CALCULATE([NO QUADRO], (dados[INÍCIO FÉRIAS] = ${QE_D} || dados[INÍCIO AFASTAMENTO] = ${QE_D}))`, 'inteiro'],
  ['qd_m_voltas', 'VOLTAS', `CALCULATE([NO QUADRO], (dados[RETORNO AFASTAMENTO] = ${QE_D} || dados[FIM FÉRIAS] = ${QE_D} - 1))`, 'inteiro'],
  ['qd_m_deslig', 'DESLIGAMENTOS', `CALCULATE(COUNTROWS(dados), dados[SAÍDA] = ${QE_D}) + CALCULATE(COUNTROWS(dados), dados[INÍCIO RESCISÃO] = ${QE_D})`, 'inteiro'],
  ['qd_m_dia1', 'QUADRO NO DIA 1', `CALCULATE(COUNTROWS(dados), CALENDARIO[DIA] = 1, dados[ADMISSÃO] < ${QE_D}, dados[SAÍDA] >= ${QE_D}, dados[INÍCIO RESCISÃO] >= ${QE_D})`, 'inteiro'],
  ['qd_m_turn', 'TURNOVER PROJETADO DO MÊS', 'DIVIDE([DESLIGAMENTOS], [QUADRO NO DIA 1] + [ENTRADAS])', 'porcentagem'],
  ['qd_m_turn_base', 'TURNOVER ATÉ A BASE', `DIVIDE(CALCULATE([DESLIGAMENTOS], ${QE_D} <= dados[DATA DA BASE]), [QUADRO NO DIA 1] + CALCULATE([ENTRADAS], ${QE_D} <= dados[DATA DA BASE]))`, 'porcentagem'],
  ['qd_m_quadro_b', 'NO QUADRO · DIA DA BASE', `CALCULATE([NO QUADRO], ${QE_DIA_BASE})`, 'inteiro'],
  ['qd_m_ativos_b', 'ATIVOS · DIA DA BASE', `CALCULATE([ATIVOS], ${QE_DIA_BASE})`, 'inteiro'],
  ['qd_m_ferias_b', 'FÉRIAS · DIA DA BASE', `CALCULATE([FÉRIAS], ${QE_DIA_BASE})`, 'inteiro'],
  ['qd_m_afast_b', 'AFASTADOS · DIA DA BASE', `CALCULATE([AFASTADOS], ${QE_DIA_BASE})`, 'inteiro'],
  ['qd_m_aviso_b', 'AVISO PRÉVIO · DIA DA BASE', `CALCULATE([AVISO PRÉVIO], ${QE_DIA_BASE})`, 'inteiro'],
  ['qd_m_resc_b', 'RESCISÃO INDIRETA · DIA DA BASE', `CALCULATE([RESCISÃO INDIRETA], ${QE_DIA_BASE})`, 'inteiro'],
  ['qd_m_pessoas', 'PESSOAS ESCALADAS', `SUMX(FILTER(dados, ${QE_TRAB}), ${QE_FATOR})`, 'decimal'],
  ['qd_m_horas', 'HORAS ESCALADAS', `SUMX(FILTER(dados, ${QE_TRAB}), dados[HORAS DIA] * ${QE_FATOR})`, 'decimal'],
  ['qd_m_faixa', 'PESSOAS NA FAIXA', `DIVIDE(SUMX(FILTER(dados, ${QE_TRAB} && ${QE_NA_FAIXA}), ${QE_FATOR}), DISTINCTCOUNT(CALENDARIO[DATA]))`, 'decimal'],
  ['qd_m_entram', 'ENTRAM NA FAIXA', `DIVIDE(SUMX(FILTER(dados, ${QE_TRAB} && ${qeMesmaFaixa('dados[ENTRADA]')}), ${QE_FATOR}), DISTINCTCOUNT(CALENDARIO[DATA]))`, 'decimal'],
  ['qd_m_saem', 'SAEM NA FAIXA', `DIVIDE(SUMX(FILTER(dados, ${QE_TRAB} && ${qeMesmaFaixa('dados[SAÍDA DO TURNO]')}), ${QE_FATOR}), DISTINCTCOUNT(CALENDARIO[DATA]))`, 'decimal'],
].map(([id, nome, formula, formato]) => ({ id, nome, tipo: 'dax', formula, formato }));
// Fórmulas de versões anteriores: se a medida gravada ainda é uma delas (o ADM não mexeu), o reenvio atualiza para a nova
const QE_FORMULAS_ANTIGAS = {
  qd_m_quadro: [`CALCULATE(COUNTROWS(dados), ${QE_COND.quadro.join(', ')})`],
  qd_m_resc: [`CALCULATE([NO QUADRO], dados[INÍCIO RESCISÃO] <= ${QE_D})`],
  qd_m_ativos: ['[NO QUADRO] - [RESCISÃO INDIRETA] - [AFASTADOS] - [FÉRIAS] - [AVISO PRÉVIO]'],
  qd_m_dia1: [`CALCULATE(COUNTROWS(dados), CALENDARIO[DIA] = 1, dados[ADMISSÃO] < ${QE_D}, dados[SAÍDA] >= ${QE_D})`],
};

/* ---------------- relatório-modelo (grade de 24; o editor converte para 96) ---------------- */
function qeModelo(){
  const med = (id, rotulo) => ({ tipo: 'medida', id, ...(rotulo ? { rotulo } : {}) });
  const col = (c, rotulo) => ({ tipo: 'col', col: c, ...(rotulo ? { rotulo } : {}) });
  const semMoldura = { titulo: { mostrar: false }, fundo: { cor: 'transparent', borda: false } };
  const filtros = (g, lista) => lista.map(([k, c, todos], i) => ({ id: `qf_${k}_${g}`, tipo: 'filtro', titulo: todos.replace(/^Tod[ao]s? (as |os )?/, '').toUpperCase(),
    x: i * 6, y: 0, w: 6, h: 1, campos: { coluna: [col(c)] },
    formato: { ...semMoldura, filtro: { alcance: 'relatorio', sinc: k, estilo: 'compacto', cascata: false, todos, ...(c === 'cal__data' ? { modo: 'lista' } : {}) } } }));
  const padrao = [['seg', 'segmento', 'Todos os segmentos'], ['sup', 'supervisor', 'Todos os supervisores'], ['tur', 'turno', 'Todos os turnos'], ['esc', 'escala', 'Todas as escalas']];
  const card = (id, m, rotulo, destaque, x, y, w) => ({ id, tipo: 'card', titulo: rotulo.toUpperCase(), x, y, w, h: 3,
    campos: { valores: [med(m)] }, formato: { titulo: { mostrar: false }, card: { rotuloTexto: rotulo, rotuloPos: 'acima', alinhar: 'esquerda', destaque } } });
  const situacoes = [med('qd_m_quadro_b', 'No quadro'), med('qd_m_ativos_b', 'Ativos'), med('qd_m_ferias_b', 'Férias'), med('qd_m_afast_b', 'Afastados'), med('qd_m_aviso_b', 'Aviso'), med('qd_m_resc_b', 'Rescisão')];
  const abertura = (id, c, rotulo, x, y) => ({ id, tipo: 'tabela', titulo: `Por ${rotulo.toLowerCase()} (dia da base)`, x, y, w: 12, h: 12,
    campos: { linhas: [col(c, rotulo)], valores: situacoes }, formato: { tabela: { totalLinhas: true, ordem: { i: 0, dir: 'desc' } } } });
  return { grade: 24, menu: 'cabecalho', apoio: { calendario: true, faixas: true, ultimoDia: true }, guias: [
    { id: 'g1', nome: 'Visão do mês', visuais: [
      ...filtros('g1', padrao),
      card('qk_q', 'qd_m_quadro_b', 'No quadro', 'accent', 0, 1, 4), card('qk_a', 'qd_m_ativos_b', 'Ativos', 'success', 4, 1, 4),
      card('qk_f', 'qd_m_ferias_b', 'Férias', 'faint', 8, 1, 4), card('qk_af', 'qd_m_afast_b', 'Afastados', 'warning', 12, 1, 4),
      card('qk_av', 'qd_m_aviso_b', 'Aviso prévio', 'warning', 16, 1, 4), card('qk_r', 'qd_m_resc_b', 'Rescisão indireta', 'danger', 20, 1, 4),
      card('qk_tb', 'qd_m_turn_base', 'Turnover até a base', 'danger', 0, 4, 6), card('qk_tm', 'qd_m_turn', 'Turnover projetado do mês', 'danger', 6, 4, 6),
      card('qk_d', 'qd_m_deslig', 'Desligamentos no mês', 'faint', 12, 4, 6), card('qk_e', 'qd_m_entradas', 'Contratados no mês', 'success', 18, 4, 6),
      { id: 'ql_mes', tipo: 'linhas', titulo: 'Mês dia a dia (depois do dia da base = projeção)', x: 0, y: 7, w: 24, h: 10,
        campos: { eixo: [col('cal__data', 'Dia')], valores: [med('qd_m_quadro', 'No quadro'), med('qd_m_trab', 'Trabalhando'), med('qd_m_ferias', 'Férias'), med('qd_m_afast', 'Afastados')] },
        formato: { grafico: { suave: true, legenda: 'mostrar' } } },
      { id: 'qt_dia', tipo: 'tabela', titulo: 'Dia a dia: entradas, saídas e voltas', x: 0, y: 17, w: 24, h: 14,
        campos: { linhas: [col('cal__data', 'Dia'), col('cal__tipo', 'Tipo')], valores: [med('qd_m_quadro', 'No quadro'), med('qd_m_ativos', 'Ativos'), med('qd_m_ferias', 'Férias'),
          med('qd_m_afast', 'Afastados'), med('qd_m_aviso', 'Aviso'), med('qd_m_resc', 'Rescisão'), med('qd_m_entradas', 'Entradas'), med('qd_m_saidas', 'Saídas'),
          med('qd_m_voltas', 'Voltas'), med('qd_m_deslig', 'Deslig.')] },
        formato: { tabela: { totalLinhas: false, ordem: null } } },
    ] },
    { id: 'g2', nome: 'Escala', visuais: [
      ...filtros('g2', [['dia', 'cal__data', 'Todos os dias'], ['seg', 'segmento', 'Todos os segmentos'], ['tur', 'turno', 'Todos os turnos'], ['esc', 'escala', 'Todas as escalas']]),
      { id: 'qc_horas', tipo: 'colunas', titulo: 'Horas escaladas por dia', x: 0, y: 1, w: 24, h: 10,
        campos: { eixo: [col('cal__data', 'Dia')], valores: [med('qd_m_horas', 'Horas escaladas')] }, formato: { grafico: { legenda: 'ocultar' } } },
      { id: 'ql_faixa', tipo: 'linhas', titulo: 'Pessoas a cada 30 min (média dos dias filtrados)', x: 0, y: 11, w: 24, h: 10,
        campos: { eixo: [col('fx__inicio', 'Faixa')], valores: [med('qd_m_faixa', 'Pessoas na faixa')] }, formato: { grafico: { suave: false, legenda: 'ocultar' } } },
      { id: 'qt_esc', tipo: 'tabela', titulo: 'Por escala', x: 0, y: 21, w: 12, h: 12,
        campos: { linhas: [col('escala', 'Escala')], valores: [med('qd_m_pessoas', 'Pessoas (dia médio)'), med('qd_m_horas', 'Horas')] }, formato: { tabela: { totalLinhas: true } } },
      { id: 'qt_faixa', tipo: 'tabela', titulo: 'Entradas e saídas por faixa', x: 12, y: 21, w: 12, h: 12,
        campos: { linhas: [col('fx__faixa', 'Faixa')], valores: [med('qd_m_entram', 'Entram'), med('qd_m_saem', 'Saem'), med('qd_m_faixa', 'Na faixa')] }, formato: { tabela: { totalLinhas: false, ordem: null } } },
    ] },
    { id: 'g3', nome: 'Aberturas', visuais: [
      ...filtros('g3', padrao),
      abertura('qa_seg', 'segmento', 'Segmento', 0, 1), abertura('qa_sup', 'supervisor', 'Supervisor', 12, 1),
      abertura('qa_tur', 'turno', 'Turno', 0, 13), abertura('qa_ch', 'ch', 'Carga horária', 12, 13),
    ] },
  ] };
}

/* ---------------- enviar ---------------- */
async function qeEnviar(){
  if (qd.ocupado) return;
  const dataBase = qd.cargas.map(c => c.data_base).sort().pop();
  if (!dataBase || !qd.func.length) return showToast('Carregue o DPO antes de enviar ao Estúdio.', 'erro');
  qd.ocupado = true;
  const status = msg => { const s = qdEl('qe-status'); if (s) s.textContent = msg; };
  const btn = qdEl('qe-enviar'); if (btn) btn.disabled = true;
  try {
    // 1) base QUADRO (cria na 1ª vez)
    status('Preparando a base…');
    let base = (await estApi('GET', '/api/estudio/bases')).find(b => b.nome === QE_BASE);
    if (!base) base = (await estApi('POST', '/api/estudio/bases', {
      nome: QE_BASE, descricao: 'QUADRO DE FUNCIONÁRIOS (ENVIADO PELA SEÇÃO QUADRO · UMA LINHA POR PESSOA)', colunas: QE_COLUNAS, coluna_data: 'data_base', chave: ['matricula'],
    })).base;
    // 2) arquivo do dia da base (Parquet), igual a uma carga do Estúdio
    status('Gerando o arquivo…');
    const linhas = qd.func.filter(f => !f.fora_base).map(f => qeLinha(f, dataBase));
    const q = v => v == null || v === '' ? '' : '"' + String(v).replace(/"/g, '""') + '"';
    const csv = [QE_COLUNAS.map(c => c.nome).join(','), ...linhas.map(l => QE_COLUNAS.map(c => q(l[c.nome])).join(','))].join('\n');
    const { db } = await estDuck();
    await db.registerFileText('quadro_envio.csv', csv);
    const cast = c => c.tipo === 'data' ? `try_cast("${c.nome}" as date)` : c.tipo === 'hora' ? `try_cast(nullif("${c.nome}", '') || ':00' as time)`
      : c.tipo === 'decimal' ? `try_cast("${c.nome}" as double)` : c.tipo === 'inteiro' ? `try_cast("${c.nome}" as integer)` : `nullif("${c.nome}", '')`;
    await estSql(`create or replace table quadro_envio as select ${QE_COLUNAS.map(c => `${cast(c)} as "${c.nome}"`).join(', ')}
      from read_csv('quadro_envio.csv', header=true, all_varchar=true, delim=',', quote='"', escape='"')`);
    await db.dropFile('quadro_envio.csv');
    await estSql(`copy quadro_envio to 'quadro_envio.parquet' (format parquet, compression zstd)`);
    const arquivo = await db.copyFileToBuffer('quadro_envio.parquet');
    await db.dropFile('quadro_envio.parquet');
    status('Enviando…');
    const up = await estApi('POST', `/api/estudio/bases/${base.id}/links-upload`, { dias: [dataBase] });
    const envio = await fetch(up.links[dataBase], { method: 'PUT', body: arquivo,
      headers: { 'content-type': 'application/octet-stream', 'x-upsert': 'true', 'cache-control': 'max-age=3600', ...(up.apikey ? { apikey: up.apikey } : {}) } });
    if (!envio.ok) throw new Error(`o envio do arquivo falhou (${envio.status}).`);
    await estApi('POST', `/api/estudio/bases/${base.id}/cargas`, { arquivo: `Quadro do DashBI (base de ${qdDataBr(dataBase)})`,
      linhas_lidas: linhas.length, linhas_gravadas: linhas.length, descartadas: 0, duplicadas: 0, dias: [{ dia: dataBase, linhas: linhas.length, bytes: arquivo.byteLength }] });
    // 3) medidas: acrescenta as que faltam e atualiza as que ainda estão na versão antiga (as que o ADM mudou ficam como estão)
    const det = await estApi('GET', `/api/estudio/bases/${base.id}`);
    const atuais = det.base.medidas || [], faltam = QE_MEDIDAS.filter(m => !atuais.some(x => x.id === m.id));
    let trocadas = 0;
    const revisadas = atuais.map(x => {
      const nova = QE_MEDIDAS.find(m => m.id === x.id);
      if (nova && (QE_FORMULAS_ANTIGAS[x.id] || []).includes(x.formula)) { trocadas++; return { ...x, formula: nova.formula }; }
      return x;
    });
    if (faltam.length || trocadas) await estApi('PUT', `/api/estudio/bases/${base.id}/medidas`, { medidas: [...revisadas, ...faltam] });
    // 4) relatório-modelo e card (só na 1ª vez; depois o ADM mexe no Estúdio)
    let rel = (await estApi('GET', '/api/estudio/relatorios')).find(r => r.nome === QE_REL);
    let novo = false;
    if (!rel) {
      status('Criando o relatório no Estúdio…');
      rel = (await estApi('POST', '/api/estudio/relatorios', { nome: QE_REL, base_id: base.id })).relatorio;
      await estApi('PUT', `/api/estudio/relatorios/${rel.id}`, { definicao: qeModelo() });
      const pub = await estApi('POST', `/api/estudio/relatorios/${rel.id}/publicar`, { categoria: 'Operações', descricao: 'QUADRO DE FUNCIONÁRIOS · DIA A DIA, PROJEÇÃO E ESCALA (EM VALIDAÇÃO)' });
      if (pub.card) await estApi('PATCH', `/api/relatorios/${pub.card.id}`, { visivel: false }); // card só para o ADM até ele liberar
      novo = true;
      if (typeof carregarRelatorios === 'function') carregarRelatorios();
    }
    await qdGravar({ config: [{ chave: 'estudio', valor: { base_id: base.id, rel_id: rel.id, em: new Date().toISOString(), data_base: dataBase, linhas: linhas.length } }] });
    status('');
    showToast(`Base QUADRO enviada ao Estúdio (${qdNum(linhas.length)} pessoas, base de ${qdDataBr(dataBase)})${novo ? ' · relatório PAINEL DO QUADRO criado (card oculto em Relatórios)' : ''}.`, 'sucesso', 6000);
    qpDesenhar();
  } catch (erro) {
    status('');
    showToast('Erro ao enviar ao Estúdio: ' + erro.message, 'erro', 7000);
  } finally {
    qd.ocupado = false;
    if (qdEl('qe-enviar')) qdEl('qe-enviar').disabled = false;
  }
}
// Abre o relatório no editor do Estúdio
async function qeAbrirNoEstudio(){
  const info = await qdConfig('estudio', null);
  if (!info) return showToast('Envie ao Estúdio primeiro.', 'erro');
  edAbrir(info.rel_id);
}
