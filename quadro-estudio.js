/* =====================================================================
   QUADRO → ESTÚDIO (fase 4 · 14/10/2026; ligada ao Quadro desde 19/10/2026)
   A base QUADRO do Estúdio é "ligada ao Quadro" (como a do Painel CSAT):
   quando o relatório abre, lê o Quadro direto do banco e monta uma linha
   por pessoa (qeLinha), sempre atualizada — sem arquivo e sem reenviar.
   O botão "Preparar no Estúdio" (aba Painel) liga/cria a base, acrescenta
   as medidas DAX que faltam e, na 1ª vez, cria o relatório-modelo
   "PAINEL DO QUADRO" com o card em Relatórios NÃO VISÍVEL (o ADM libera).
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
  // Escalas sem código (19/10/2026): quanto a pessoa conta em cada dia da semana (0 a 1) e se folga no feriado — vêm de Quadro › Escalas
  ['peso_dom', 'PESO DOM', 'decimal'], ['peso_seg', 'PESO SEG', 'decimal'], ['peso_ter', 'PESO TER', 'decimal'], ['peso_qua', 'PESO QUA', 'decimal'],
  ['peso_qui', 'PESO QUI', 'decimal'], ['peso_sex', 'PESO SEX', 'decimal'], ['peso_sab', 'PESO SÁB', 'decimal'], ['folga_feriado', 'FOLGA NO FERIADO', 'inteiro'],
].map(([nome, rotulo, tipo]) => ({ origem: nome, nome, rotulo, tipo, manter: true, vazio: 'nulo', padrao: '' }));

/* ---------------- escala de cada pessoa (regras na tela Quadro › Escalas · quadro-escalas.js) ---------------- */
// Jornada do WFM ("6x1 - 06h20 - ...") manda: vale a escala com esse nome (ou que a tenha em "também vale para").
// Jornada que não está cadastrada fica com o próprio nome (não conta horas até ser cadastrada). Sem jornada no WFM: pela carga horária do DPO.
function qeEscala(f, regras = qxRegras()){
  const j = String((f.wfm && f.wfm.jornada) || '').match(/^\s*(\d{1,2})\s*x\s*(\d{1,2})/i);
  if (j) { const e = `${j[1]}X${j[2]}`, esc = regras.escalas.find(x => x.nome === e || qxApelidos(x).includes(e)); return esc ? esc.nome : e; }
  const c = regras.cargas.find(x => x.ch === f.carga_horaria);
  return c ? c.escala || '' : '';
}
// Só operação entra nas horas escaladas: carga horária cadastrada e sem cargo de liderança (lista na tela de Escalas)
function qeContaEscala(f, escala, regras = qxRegras()){
  if (!escala || !regras.cargas.some(x => x.ch === f.carga_horaria)) return 0;
  const cargos = String(regras.lideranca || '').split(',').map(s => qdNorm(s)).filter(Boolean);
  const nivel = qdNorm(f.nivel || f.funcao);
  return cargos.some(c => nivel.includes(c)) ? 0 : 1;
}
// Horas por dia: as da tabela de cargas horárias (ex.: 10:00 = 9h); sem cadastro, a própria carga horária
function qeHorasDia(ch, regras = qxRegras()){
  const c = regras.cargas.find(x => x.ch === ch);
  return qxHoras(c && c.horas ? c.horas : ch);
}
const qeSomaHora = (h, ch) => {
  const a = String(h || '').match(/^(\d{1,2}):(\d{2})/), b = String(ch || '').match(/^(\d{1,2}):(\d{2})/);
  if (!a || !b) return '';
  const t = (+a[1] * 60 + +a[2] + +b[1] * 60 + +b[2]) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
};

/* ---------------- situação de uma pessoa num dia, pelas datas (veio do painel em código, aposentado em 20/10/2026) ---------------- */
const qeMaisDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// null = ainda não entrou (ou já saiu da base do DPO). Usada para conferir as medidas DAX nos testes.
function qeStatusNoDia(f, dia){
  if (f.admissao && f.admissao > dia) return null; // sem data de admissão: considera que já estava
  if (f.fora_base && dia >= f.fora_base) return null;
  const w = f.wfm || {};
  if (f.status === 'desligado' && !f.desligamento) return 'desligado';
  if (f.desligamento && dia >= f.desligamento) return 'desligado';
  if (f.aviso_fim && dia > f.aviso_fim) return 'desligado';           // fim do aviso = saída prevista
  if (f.status === 'rescisao') { const r = w.sit_ini || w.dt_situacao; if (!r || dia >= r) return 'rescisao'; }
  const afIni = f.afast_ini || (f.status === 'afastado' ? w.sit_ini : ''), afFim = f.afast_fim || (f.status === 'afastado' ? w.sit_fim : '');
  if (afIni && dia >= afIni && (!afFim || dia < afFim)) return 'afastado'; // retorno = já volta naquele dia
  const feIni = f.ferias_ini || w.ferias_ini, feFim = f.ferias_fim || w.ferias_fim;
  if (feIni && dia >= feIni && (!feFim || dia <= feFim)) return 'ferias';
  if (f.aviso_ini && dia >= f.aviso_ini) return 'aviso';
  // Situação atual sem datas nas bases: vale como está
  if (f.status === 'afastado' && !afIni) return 'afastado';
  if (f.status === 'ferias' && !feIni) return 'ferias';
  if (f.status === 'aviso' && !f.aviso_ini) return 'aviso';
  return 'ativo';
}

/* ---------------- linhas da base ---------------- */
function qeLinha(f, dataBase, regras = qxRegras()){
  const w = f.wfm || {}, st = f.status;
  const saidas = [f.desligamento, f.aviso_fim ? qeMaisDias(f.aviso_fim, 1) : ''].filter(Boolean).sort();
  const afIni = f.afast_ini || (st === 'afastado' ? (w.sit_ini || QE_ANTES) : '');
  const feIni = f.ferias_ini || w.ferias_ini || (st === 'ferias' ? QE_ANTES : '');
  const entrada = f.hora_entrada || w.hora_entrada || '', ch = f.carga_horaria || w.carga_horaria || '';
  const escala = qeEscala(f, regras), esc = regras.escalas.find(x => x.nome === escala), peso = d => esc ? Number(esc.pesos[d]) || 0 : 0;
  return {
    data_base: dataBase, matricula: f.matricula, nome: f.nome, situacao: (QD_STATUS[st] || QD_STATUS.outro).nome.toUpperCase(),
    admissao: f.admissao || QE_ANTES,
    saida: saidas[0] || (st === 'desligado' ? QE_ANTES : QE_NUNCA),
    rescisao: st === 'rescisao' ? (w.sit_ini || w.dt_situacao || QE_ANTES) : QE_NUNCA,
    ferias_ini: feIni || QE_NUNCA, ferias_fim: feIni ? (f.ferias_fim || w.ferias_fim || QE_NUNCA) : QE_NUNCA,
    afast_ini: afIni || QE_NUNCA, afast_fim: afIni ? (f.afast_fim || (st === 'afastado' ? w.sit_fim : '') || QE_NUNCA) : QE_NUNCA,
    aviso_ini: f.aviso_ini || (st === 'aviso' ? QE_ANTES : QE_NUNCA),
    turno: (QD_TURNOS[f.turno] || '').split(' ')[0], entrada, saida_turno: f.hora_saida || qeSomaHora(entrada, ch), ch,
    horas_dia: qeHorasDia(ch, regras), escala, conta_escala: qeContaEscala(f, escala, regras),
    segmento: f.segmento, supervisor: f.gestor1, coordenador: f.gestor2, site: f.site, regime: f.regime || '', nivel: f.nivel || '',
    mat_wfm: w.re || '', situacao_wfm: w.situacao || '',
    peso_dom: peso('dom'), peso_seg: peso('seg'), peso_ter: peso('ter'), peso_qua: peso('qua'), peso_qui: peso('qui'), peso_sex: peso('sex'), peso_sab: peso('sab'),
    folga_feriado: esc && esc.folgaFeriado ? 1 : 0,
  };
}

// Linhas → tabela do motor do navegador (DuckDB), com o tipo certo de cada coluna
async function qeMontarTabela(linhas, tabela){
  const q = v => v == null || v === '' ? '' : '"' + String(v).replace(/"/g, '""') + '"';
  const csv = [QE_COLUNAS.map(c => c.nome).join(','), ...linhas.map(l => QE_COLUNAS.map(c => q(l[c.nome])).join(','))].join('\n');
  const { db } = await estDuck();
  await db.registerFileText(tabela + '.csv', csv);
  const cast = c => c.tipo === 'data' ? `try_cast("${c.nome}" as date)` : c.tipo === 'hora' ? `try_cast(nullif("${c.nome}", '') || ':00' as time)`
    : c.tipo === 'decimal' ? `try_cast("${c.nome}" as double)` : c.tipo === 'inteiro' ? `try_cast("${c.nome}" as integer)` : `nullif("${c.nome}", '')`;
  await estSql(`create or replace table ${tabela} as select ${QE_COLUNAS.map(c => `${cast(c)} as "${c.nome}"`).join(', ')}
    from read_csv('${tabela}.csv', header=true, all_varchar=true, delim=',', quote='"', escape='"')`);
  await db.dropFile(tabela + '.csv');
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
// Fator do dia: o peso da pessoa no dia da semana (Quadro › Escalas), zero no feriado para quem folga em feriado
const QE_FATOR = `SWITCH(CALENDARIO[DIA DA SEMANA], 1, dados[PESO DOM], 2, dados[PESO SEG], 3, dados[PESO TER], 4, dados[PESO QUA], 5, dados[PESO QUI], 6, dados[PESO SEX], dados[PESO SÁB]) * IF((CALENDARIO[FERIADO] = 1) && (dados[FOLGA NO FERIADO] = 1), 0, 1)`;
// Versão de 14/10/2026 (escalas escritas na fórmula): as medidas que ainda estão nela são trocadas pela nova
const QE_FATOR_V1 = `SWITCH(TRUE(),
  dados[ESCALA] = "4X3", IF((CALENDARIO[DIA DA SEMANA] >= 2) && (CALENDARIO[DIA DA SEMANA] <= 5) && (CALENDARIO[FERIADO] = 0), 1, 0),
  dados[ESCALA] = "5X2", IF((CALENDARIO[DIA DA SEMANA] >= 2) && (CALENDARIO[DIA DA SEMANA] <= 6), 1, 0),
  dados[ESCALA] = "7X1", SWITCH(CALENDARIO[DIA DA SEMANA], 7, 0.6, 1, 0.4, 1),
  0)`;
// Na faixa: entrada ≤ faixa < saída (turno que vira a meia-noite: depois da entrada OU antes da saída)
const QE_NA_FAIXA = `((dados[ENTRADA] <= FAIXAS[INÍCIO] && FAIXAS[INÍCIO] < dados[SAÍDA DO TURNO]) || (dados[SAÍDA DO TURNO] < dados[ENTRADA] && (FAIXAS[INÍCIO] >= dados[ENTRADA] || FAIXAS[INÍCIO] < dados[SAÍDA DO TURNO])))`;
const qeMesmaFaixa = col => `(HOUR(${col}) = HOUR(FAIXAS[INÍCIO])) && (INT(MINUTE(${col}) / 30) = INT(MINUTE(FAIXAS[INÍCIO]) / 30))`;
const QE_DIA_BASE = `${QE_D} = dados[DATA DA BASE]`;
// As 5 medidas de escala (pessoas, horas, faixas): o "fator" é quanto a pessoa conta naquele dia
const qeMedidasEscala = fator => [
  ['qd_m_pessoas', 'PESSOAS ESCALADAS', `SUMX(FILTER(dados, ${QE_TRAB}), ${fator})`, 'decimal'],
  ['qd_m_horas', 'HORAS ESCALADAS', `SUMX(FILTER(dados, ${QE_TRAB}), dados[HORAS DIA] * ${fator})`, 'decimal'],
  ['qd_m_faixa', 'PESSOAS NA FAIXA', `DIVIDE(SUMX(FILTER(dados, ${QE_TRAB} && ${QE_NA_FAIXA}), ${fator}), DISTINCTCOUNT(CALENDARIO[DATA]))`, 'decimal'],
  ['qd_m_entram', 'ENTRAM NA FAIXA', `DIVIDE(SUMX(FILTER(dados, ${QE_TRAB} && ${qeMesmaFaixa('dados[ENTRADA]')}), ${fator}), DISTINCTCOUNT(CALENDARIO[DATA]))`, 'decimal'],
  ['qd_m_saem', 'SAEM NA FAIXA', `DIVIDE(SUMX(FILTER(dados, ${QE_TRAB} && ${qeMesmaFaixa('dados[SAÍDA DO TURNO]')}), ${fator}), DISTINCTCOUNT(CALENDARIO[DATA]))`, 'decimal'],
];
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
  ...qeMedidasEscala(QE_FATOR),
].map(([id, nome, formula, formato]) => ({ id, nome, tipo: 'dax', formula, formato }));
// Fórmulas de versões anteriores: se a medida gravada ainda é uma delas (o ADM não mexeu), o reenvio atualiza para a nova
const QE_FORMULAS_ANTIGAS = {
  qd_m_quadro: [`CALCULATE(COUNTROWS(dados), ${QE_COND.quadro.join(', ')})`],
  qd_m_resc: [`CALCULATE([NO QUADRO], dados[INÍCIO RESCISÃO] <= ${QE_D})`],
  qd_m_ativos: ['[NO QUADRO] - [RESCISÃO INDIRETA] - [AFASTADOS] - [FÉRIAS] - [AVISO PRÉVIO]'],
  qd_m_dia1: [`CALCULATE(COUNTROWS(dados), CALENDARIO[DIA] = 1, dados[ADMISSÃO] < ${QE_D}, dados[SAÍDA] >= ${QE_D})`],
};
qeMedidasEscala(QE_FATOR_V1).forEach(([id, , formula]) => (QE_FORMULAS_ANTIGAS[id] = QE_FORMULAS_ANTIGAS[id] || []).push(formula));

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

/* ---------------- preparar no Estúdio ---------------- */
// Base QUADRO ligada ao Quadro (cria na 1ª vez; a antiga, de arquivos, passa a ser ligada; colunas sempre na versão atual)
// + medidas: acrescenta as que faltam e atualiza as que ainda estão na versão antiga (as que o ADM mudou ficam como estão)
async function qePrepararBase(){
  const { base, ligada } = await estApi('POST', '/api/estudio/quadro/base', {
    nome: QE_BASE, descricao: 'QUADRO DE FUNCIONÁRIOS (LIGADA AO QUADRO · UMA LINHA POR PESSOA, SEMPRE ATUALIZADA)', colunas: QE_COLUNAS, coluna_data: 'data_base', chave: ['matricula'],
  });
  const det = await estApi('GET', `/api/estudio/bases/${base.id}`);
  const atuais = det.base.medidas || [], faltam = QE_MEDIDAS.filter(m => !atuais.some(x => x.id === m.id));
  let trocadas = 0;
  const revisadas = atuais.map(x => {
    const nova = QE_MEDIDAS.find(m => m.id === x.id);
    if (nova && (QE_FORMULAS_ANTIGAS[x.id] || []).includes(x.formula)) { trocadas++; return { ...x, formula: nova.formula }; }
    return x;
  });
  if (faltam.length || trocadas) await estApi('PUT', `/api/estudio/bases/${base.id}/medidas`, { medidas: [...revisadas, ...faltam] });
  return { base, ligada, faltam: faltam.length, trocadas };
}
// (o nome qeEnviar ficou por compatibilidade: botões e testes antigos chamam por ele)
async function qeEnviar(){
  if (qd.ocupado) return;
  if (!qd.func.length) return showToast('Carregue o DPO antes de preparar o painel no Estúdio.', 'erro');
  qd.ocupado = true;
  const status = msg => { const s = qdEl('qe-status'); if (s) s.textContent = msg; };
  const btn = qdEl('qe-enviar'); if (btn) btn.disabled = true;
  try {
    // 1) base QUADRO ligada ao Quadro + medidas
    status('Preparando a base…');
    const { base, ligada } = await qePrepararBase();
    // 2) relatório-modelo e card (só na 1ª vez; depois o ADM mexe no Estúdio)
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
    await qdGravar({ config: [{ chave: 'estudio', valor: { base_id: base.id, rel_id: rel.id, em: new Date().toISOString(), ligada: true } }] });
    status('');
    showToast(`Base QUADRO ${ligada ? 'ligada ao Quadro' : 'já estava ligada ao Quadro'}: o painel no Estúdio lê o Quadro sempre atualizado${novo ? ' · relatório PAINEL DO QUADRO criado (card oculto em Relatórios)' : ''}.`, 'sucesso', 6000);
    if (qd.aba === 'painel') qeRenderPainel();
  } catch (erro) {
    status('');
    showToast('Erro ao preparar no Estúdio: ' + erro.message, 'erro', 7000);
  } finally {
    qd.ocupado = false;
    if (qdEl('qe-enviar')) qdEl('qe-enviar').disabled = false;
  }
}
/* ---------------- Quadro › Painel (20/10/2026) ----------------
   O painel em código (quadro-painel.js) foi aposentado: o painel do mês é o relatório PAINEL DO QUADRO do Estúdio,
   que lê este Quadro direto do banco. Aqui ficam só os atalhos: abrir (leitura), editar e preparar. */
async function qeRenderPainel(){
  const corpo = qdEl('qd-corpo');
  let info = null;
  try { info = await qdConfig('estudio', null); } catch (erro) { showToast(erro.message, 'erro'); return; }
  if (qd.aba !== 'painel' || qdEl('qd-corpo') !== corpo) return; // saiu da tela enquanto lia do banco
  const ultima = qd.cargas.filter(c => c.tipo === 'dpo').map(c => c.data_base).sort().pop();
  const prepara = pode('quadro.estudio');
  corpo.innerHTML = `<div class="panel qe-painel">
    <h3>Painel do Quadro</h3>
    <p>O mês dia a dia, a projeção, o turnover, as escalas e as aberturas ficam no relatório <b>PAINEL DO QUADRO</b> do Estúdio.
      Ele lê este Quadro direto do banco: ${ultima ? `última carga do DPO em <b>${qdDataBr(ultima)}</b>` : 'o DPO ainda não foi carregado'}.</p>
    ${info ? '' : `<p class="qe-aviso">${prepara ? 'O painel ainda não foi preparado: clique em <b>Preparar no Estúdio</b> (só uma vez).' : 'O painel ainda não foi preparado. Quem tem a permissão "Preparar no Estúdio" faz isso uma vez.'}</p>`}
    <div class="qe-painel-botoes">
      ${info ? '<button class="btn btn-primary" style="width:auto" onclick="qeAbrirPainel()">Abrir o painel</button>' : ''}
      ${info && pode('estudio.relatorios') ? '<button class="btn btn-ghost" style="width:auto" onclick="qeAbrirNoEstudio()" title="Abre o relatório no editor do Estúdio (o que mudar só aparece aqui depois de publicar)">Editar no Estúdio</button>' : ''}
      ${prepara ? `<button class="btn ${info ? 'btn-ghost' : 'btn-primary'}" style="width:auto" id="qe-enviar" onclick="qeEnviar()" title="Liga a base QUADRO do Estúdio a este Quadro, acrescenta as medidas que faltam e, na 1ª vez, cria o relatório e o card oculto em Relatórios">Preparar no Estúdio</button>` : ''}
      <span class="qd-fraco" id="qe-status"></span>
    </div>
    ${info ? '<p class="qd-fraco">O painel mostra a versão publicada do relatório. Dias e pesos de cada escala: Quadro › Escalas.</p>' : ''}
  </div>`;
}
// Abre a versão publicada, só leitura (a mesma tela de quem abre o card em Relatórios)
async function qeAbrirPainel(){
  const info = await qdConfig('estudio', null);
  if (!info) return showToast('Use "Preparar no Estúdio" primeiro.', 'erro');
  edAbrirLeitura(info.rel_id);
}
// Abre o relatório no editor do Estúdio
async function qeAbrirNoEstudio(){
  const info = await qdConfig('estudio', null);
  if (!info) return showToast('Use "Preparar no Estúdio" primeiro.', 'erro');
  edAbrir(info.rel_id);
}
