/* =====================================================================
   QUADRO — PAINEL DO MÊS (fase 4 · protótipo P2 + P3)
   O mês inteiro, dia a dia, mesmo que a base só tenha sido carregada hoje:
     · dias com carga → "foto" (como o dia fechou)
     · dias anteriores sem carga → remontados pelas datas das bases (real)
     · dias depois da última carga → projeção (pelas mesmas datas)
   Datas usadas: admissão, desligamento, férias (início/fim), afastamento
   (início/retorno), aviso prévio (início/fim) e, no WFM, a situação.
   Movimentos do dia = comparação com o dia anterior:
     entrada (contratado) · saída (férias, afastamento, aviso→desligamento,
     desligamento, rescisão) · volta (de férias ou afastamento).
   Depende do quadro-base.js, quadro.js e script.js (carregarLib, LIB_GRAFICO).
   ===================================================================== */

const qp = {
  mes: '',        // 'AAAA-MM'
  dia: '',        // dia escolhido ('AAAA-MM-DD')
  abertura: 't',  // t = turno · sg = segmento · ch = carga horária · g = supervisor
  fotos: [], hist: [],
  dias: [],       // [{ dia, tipo: 'foto'|'real'|'projecao', reg: Map(matrícula → {s,t,g,sg,ch}) }]
  antes: null,    // o dia anterior ao dia 1 (para os movimentos do dia 1)
  ultimaCarga: '',
  grafico: null,
};
const QP_COLUNAS = ['ativo', 'ferias', 'afastado', 'aviso', 'rescisao'];
const QP_ABERTURAS = { t: 'Turno', sg: 'Segmento', ch: 'Carga horária', g: 'Supervisor' };
const QP_TIPO = { foto: 'carga do dia', real: 'remontado', projecao: 'projeção' };
const qpMaisDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/* ---------------- situação de uma pessoa num dia, pelas datas ---------------- */
// null = ainda não entrou (ou já saiu da base do DPO)
function qpStatusNoDia(f, dia){
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
function qpRegistro(f, s){ return { s, t: f.turno, g: f.gestor1, sg: f.segmento, ch: f.carga_horaria }; }

// Monta os dias do mês (e o dia anterior ao dia 1)
function qpMontarMes(){
  const [a, m] = qp.mes.split('-').map(Number), ultimo = new Date(a, m, 0).getDate();
  const fotos = new Map(qp.fotos.map(f => [f.data, f]));
  const remontar = dia => { const reg = new Map(); qd.func.forEach(f => { const s = qpStatusNoDia(f, dia); if (s) reg.set(f.matricula, qpRegistro(f, s)); }); return reg; };
  const doDia = dia => {
    const foto = fotos.get(dia);
    if (foto) return { dia, tipo: 'foto', reg: new Map(Object.entries(foto.registros)) };
    return { dia, tipo: dia <= qp.ultimaCarga ? 'real' : 'projecao', reg: remontar(dia) };
  };
  qp.dias = Array.from({ length: ultimo }, (_, i) => doDia(`${qp.mes}-${String(i + 1).padStart(2, '0')}`));
  qp.antes = doDia(qpMaisDias(`${qp.mes}-01`, -1));
  // Movimentos: compara cada dia com o anterior
  let ant = qp.antes;
  qp.dias.forEach(d => {
    const mv = { entradas: [], saidas: [], voltas: [], deslig: [] };
    const fora = s => !s || s === 'desligado';
    d.reg.forEach((r, mat) => {
      const s0 = ant.reg.get(mat)?.s, s1 = r.s;
      if (fora(s0) && !fora(s1) && !s0) mv.entradas.push(mat);
      const trabalhando = x => x === 'ativo' || x === 'aviso';
      if (trabalhando(s0) && s1 && !trabalhando(s1)) mv.saidas.push(mat);
      if ((s0 === 'ferias' || s0 === 'afastado') && trabalhando(s1)) mv.voltas.push(mat);
      if (s0 && s0 !== 'desligado' && s0 !== 'rescisao' && (s1 === 'desligado' || s1 === 'rescisao')) mv.deslig.push(mat);
    });
    d.mv = mv;
    ant = d;
  });
}

/* ---------------- abrir ---------------- */
async function qpRender(){
  const corpo = qdEl('qd-corpo');
  if (!qd.func.length) { corpo.innerHTML = `<div class="empty-state"><p>${pode('quadro.cargas') ? 'Carregue as bases na aba Cargas para ver o painel.' : 'O quadro ainda não foi carregado. As bases DPO e WFM são carregadas por quem tem a permissão <b>Cargas</b>.'}</p></div>`; return; }
  try { [qp.fotos, qp.hist] = await Promise.all([qdTodos('fotos'), qdTodos('historico')]); }
  catch (erro) { showToast(erro.message, 'erro'); return; }
  // Enquanto lia do banco a pessoa pode ter ido para outra subseção: não desenha por cima dela
  if (qd.aba !== 'painel' || qdEl('qd-corpo') !== corpo) return;
  qp.ultimaCarga = qd.cargas.map(c => c.data_base).sort().pop() || qdHoje();
  if (!qp.mes) qp.mes = qp.ultimaCarga.slice(0, 7);
  qpTrocarMes(qp.mes);
}
function qpTrocarMes(mes){
  qp.mes = mes;
  qpMontarMes();
  if (!qp.dia || qp.dia.slice(0, 7) !== mes) qp.dia = qp.ultimaCarga.slice(0, 7) === mes ? qp.ultimaCarga : `${mes}-01`;
  qpDesenhar();
}
const qpDiaAtual = () => qp.dias.find(d => d.dia === qp.dia) || qp.dias[0];
const qpNoQuadro = d => [...d.reg.values()].filter(r => !qdForaDoQuadro(r.s)).length; // rescisão indireta = desligado

// Turnover = (desligados + rescisão indireta no mês) ÷ (quadro no dia 1 + contratados no mês)
// "até hoje" usa só os dias reais; "projetado" usa o mês inteiro
function qpTurnover(ate){
  const dias = qp.dias.filter(d => !ate || d.dia <= ate);
  const deslig = dias.flatMap(d => d.mv.deslig), contrat = dias.flatMap(d => d.mv.entradas);
  const dia1 = qpNoQuadro(qp.antes.reg.size ? qp.antes : qp.dias[0]);
  const den = dia1 + contrat.length;
  return { deslig, contrat, dia1, pct: den ? deslig.length / den * 100 : 0 };
}
const qpPct = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

/* ---------------- tela ---------------- */
function qpDesenhar(){
  const corpo = qdEl('qd-corpo');
  const d = qpDiaAtual();
  const cont = {}; d.reg.forEach(r => cont[r.s] = (cont[r.s] || 0) + 1);
  const toReal = qpTurnover(qp.ultimaCarga), toMes = qpTurnover();
  const nomeMes = new Date(qp.mes + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const card = (rot, val, sub, cor, acao) => `<button class="stat-card qp-card" ${acao ? `onclick="${acao}"` : 'disabled'}>
      <div class="label">${cor ? `<i class="qd-ponto qd-selo-${cor}"></i>` : ''}${rot}</div><div class="value">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</button>`;
  corpo.innerHTML = `
    <div class="qp-barra">
      <label>Mês <input type="month" value="${qp.mes}" onchange="qpTrocarMes(this.value)"></label>
      <label>Dia
        <select onchange="qp.dia = this.value; qpDesenhar()">${qp.dias.map(x => `<option value="${x.dia}"${x.dia === qp.dia ? ' selected' : ''}>${qdDataBr(x.dia)} · ${QP_TIPO[x.tipo]}</option>`).join('')}</select>
      </label>
      <span class="qd-fraco">Última carga: ${qdDataBr(qp.ultimaCarga)}. Antes dela, os dias são remontados pelas datas das bases; depois, é projeção.</span>
      <span class="qp-estudio" style="${pode('quadro.estudio') ? '' : 'display:none'}">
        <span class="qd-fraco" id="qe-status"></span>
        <button class="btn btn-ghost btn-small" onclick="qeAbrirNoEstudio()" title="Abre o relatório PAINEL DO QUADRO no editor do Estúdio">Abrir no Estúdio</button>
        <button class="btn btn-primary btn-small" style="width:auto" id="qe-enviar" onclick="qeEnviar()" title="Grava a base QUADRO no Estúdio (e, na 1ª vez, cria o relatório e o card oculto em Relatórios)">Enviar ao Estúdio</button>
      </span>
    </div>

    <h4 class="qp-titulo">Quadro em ${qdDataBr(d.dia)} <span class="qp-tipo qp-tipo-${d.tipo}">${QP_TIPO[d.tipo]}</span></h4>
    <div class="stat-grid qp-cards">
      ${card('No quadro', qdNum(qpNoQuadro(d)), 'sem desligados nem rescisões', '', `qpListaDia('', 'No quadro')`)}
      ${card('Ativos', qdNum(cont.ativo || 0), '', 'ok', `qpListaDia('ativo', 'Ativos')`)}
      ${card('Férias', qdNum(cont.ferias || 0), '', 'info', `qpListaDia('ferias', 'Férias')`)}
      ${card('Afastados', qdNum(cont.afastado || 0), '', 'alerta', `qpListaDia('afastado', 'Afastados')`)}
      ${card('Aviso prévio', qdNum(cont.aviso || 0), 'contam como ativos', 'alerta', `qpListaDia('aviso', 'Aviso prévio')`)}
      ${card('Rescisão indireta', qdNum(cont.rescisao || 0), 'conta como desligado (ativo no DPO, desligado no WFM)', 'perigo', `qpListaDia('rescisao', 'Rescisão indireta')`)}
    </div>

    <h4 class="qp-titulo">Turnover de ${nomeMes}</h4>
    <div class="stat-grid qp-cards">
      ${qp.dias.some(x => x.tipo === 'projecao')
        ? card('Turnover até ' + qdDataBr(qp.ultimaCarga).slice(0, 5), qpPct(toReal.pct), `(${qdNum(toReal.deslig.length)}) ÷ (${qdNum(toReal.dia1)} + ${qdNum(toReal.contrat.length)})`, 'perigo')
          + card('Turnover projetado do mês', qpPct(toMes.pct), `(${qdNum(toMes.deslig.length)}) ÷ (${qdNum(toMes.dia1)} + ${qdNum(toMes.contrat.length)})`, 'perigo')
        : card('Turnover do mês', qpPct(toMes.pct), `(${qdNum(toMes.deslig.length)}) ÷ (${qdNum(toMes.dia1)} + ${qdNum(toMes.contrat.length)})`, 'perigo')}
      ${card('Desligamentos + rescisões', qdNum(toMes.deslig.length), 'no mês (com os previstos)', 'apagado', `qpListaMov('deslig', 'Desligamentos e rescisões no mês')`)}
      ${card('Quadro no dia 1', qdNum(toMes.dia1), 'sem desligados nem rescisões', '')}
      ${card('Contratados no mês', qdNum(toMes.contrat.length), 'pela data de admissão', 'ok', `qpListaMov('entradas', 'Contratados no mês')`)}
    </div>

    <div class="qp-duas">
      <div class="panel qp-painel">
        <div class="qp-painel-topo"><h4>Mês dia a dia</h4><span class="qd-fraco">linha cheia = real · tracejada = projeção</span></div>
        <div class="qp-grafico"><canvas id="qp-grafico"></canvas></div>
      </div>
      <div class="panel qp-painel">
        <div class="qp-painel-topo"><h4>DPO × WFM</h4><span class="qd-fraco">hoje · vale o DPO</span></div>
        ${qpHtmlDpoWfm()}
      </div>
    </div>

    <div class="panel qp-painel">
      <div class="qp-painel-topo"><h4>Dia a dia: entradas, saídas e voltas</h4><span class="qd-fraco">clique num número para ver as pessoas</span></div>
      ${qpHtmlDiaADia()}
    </div>

    <div class="panel qp-painel">
      <div class="qp-painel-topo">
        <h4>Aberturas em ${qdDataBr(d.dia)}</h4>
        <div class="seg">${Object.entries(QP_ABERTURAS).map(([k, n]) => `<button class="seg-btn${qp.abertura === k ? ' active' : ''}" onclick="qp.abertura = '${k}'; qpDesenhar()">${n}</button>`).join('')}</div>
      </div>
      ${qpHtmlAbertura(d)}
    </div>`;
  qpGrafico();
}

function qpHtmlDiaADia(){
  const num = (dia, chave, n, titulo) => n ? `<button class="qp-num" onclick="qpListaMov('${chave}', '${titulo} em ${qdDataBr(dia)}', '${dia}')">${qdNum(n)}</button>` : '<span class="qd-fraco">·</span>';
  const st = (d, s) => { let n = 0; d.reg.forEach(r => { if (r.s === s) n++; }); return n; };
  return `<div class="table-wrap qp-tabela qp-diaadia"><table>
    <thead><tr><th>Dia</th><th></th><th>No quadro</th><th>Ativos</th><th>Férias</th><th>Afastados</th><th>Aviso</th><th>Rescisão</th><th>Entradas</th><th>Saídas</th><th>Voltas</th><th>Deslig.</th></tr></thead>
    <tbody>${qp.dias.map(d => `<tr class="${d.dia === qp.dia ? 'qd-linha-sel' : ''} qp-linha-${d.tipo}" onclick="if (event.target.tagName !== 'BUTTON') { qp.dia = '${d.dia}'; qpDesenhar(); }">
      <td>${qdDataBr(d.dia).slice(0, 5)} <small class="qd-fraco">${new Date(d.dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small></td>
      <td><span class="qp-tipo qp-tipo-${d.tipo}">${QP_TIPO[d.tipo]}</span></td>
      <td><b>${qdNum(qpNoQuadro(d))}</b></td>
      ${QP_COLUNAS.map(s => `<td>${qdNum(st(d, s))}</td>`).join('')}
      <td>${num(d.dia, 'entradas', d.mv.entradas.length, 'Entradas')}</td>
      <td>${num(d.dia, 'saidas', d.mv.saidas.length, 'Saídas')}</td>
      <td>${num(d.dia, 'voltas', d.mv.voltas.length, 'Voltas')}</td>
      <td>${num(d.dia, 'deslig', d.mv.deslig.length, 'Desligamentos')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

// Tabela de abertura do dia escolhido: linhas = turno / segmento / CH / supervisor; colunas = situações
function qpHtmlAbertura(d){
  const dim = qp.abertura, grupos = {};
  d.reg.forEach(r => {
    if (r.s === 'desligado') return;
    const k = r[dim] || '(sem informação)';
    const g = grupos[k] || (grupos[k] = { total: 0 });
    g[r.s] = (g[r.s] || 0) + 1; if (r.s !== 'rescisao') g.total++; // rescisão aparece na coluna dela, mas não soma no quadro
  });
  const nomeLinha = k => dim === 't' ? (QD_TURNOS[k] || k) : k;
  const ordem = dim === 't' ? ['manha', 'tarde', 'noite', 'madrugada'] : null;
  const linhas = Object.keys(grupos).sort((a, b) => ordem ? ordem.indexOf(a) - ordem.indexOf(b) : grupos[b].total - grupos[a].total);
  const cel = (k, s, n) => n ? `<button class="qp-num" onclick='qpListaDia(${JSON.stringify(s)}, ${JSON.stringify(nomeLinha(k) + ' · ' + (s ? QD_STATUS[s].nome : 'No quadro'))}, ${JSON.stringify(dim)}, ${JSON.stringify(k)})'>${qdNum(n)}</button>` : '<span class="qd-fraco">·</span>';
  const tot = s => linhas.reduce((x, k) => x + (grupos[k][s] || 0), 0);
  return `<div class="table-wrap qp-tabela"><table>
    <thead><tr><th>${QP_ABERTURAS[dim]}</th>${QP_COLUNAS.map(s => `<th>${QD_STATUS[s].nome}</th>`).join('')}<th>No quadro</th></tr></thead>
    <tbody>${linhas.map(k => `<tr><td class="qd-corta" title="${qdEsc(nomeLinha(k))}">${qdEsc(nomeLinha(k))}</td>${QP_COLUNAS.map(s => `<td>${cel(k, s, grupos[k][s])}</td>`).join('')}<td><b>${cel(k, '', grupos[k].total)}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td>${QP_COLUNAS.map(s => `<td>${qdNum(tot(s))}</td>`).join('')}<td>${qdNum(tot('total'))}</td></tr></tfoot>
  </table></div>`;
}

// DPO × WFM (situação de hoje): só quem está ligado aos dois sistemas; diferença = WFM − DPO
function qpHtmlDpoWfm(){
  const vivos = qd.func.filter(f => !f.fora_base && f.status !== 'desligado');
  const lig = vivos.filter(f => f.wfm);
  const sts = ['ativo', 'ferias', 'afastado', 'desligado'];
  const cd = {}, cw = {};
  lig.forEach(f => {
    const sd = qdStatusDpo(f.situacao) === 'aviso' ? 'ativo' : qdStatusDpo(f.situacao), sw = qdStatusWfm(f.wfm.situacao);
    cd[sd] = (cd[sd] || 0) + 1; cw[sw] = (cw[sw] || 0) + 1;
  });
  const nDiv = vivos.filter(f => f.divergencias.length).length;
  return `<div class="table-wrap"><table class="qp-dpowfm">
      <thead><tr><th>Situação</th><th>DPO</th><th>WFM</th><th>Diferença</th></tr></thead>
      <tbody>${sts.map(s => { const d = (cw[s] || 0) - (cd[s] || 0); return `<tr><td>${QD_STATUS[s].nome}</td><td>${qdNum(cd[s] || 0)}</td><td>${qdNum(cw[s] || 0)}</td>
        <td class="${d ? 'qp-dif' : 'qd-fraco'}">${d > 0 ? '+' : ''}${qdNum(d)}</td></tr>`; }).join('')}</tbody>
    </table></div>
    <p class="qp-nota">${qdNum(lig.length)} pessoas do quadro ligadas aos dois sistemas · ${qdNum(vivos.length - lig.length)} sem WFM ·
      ${pode('quadro.atual') ? `<a href="#" onclick="qd.filtro.conferir = 'div'; qdTrocarAba('quadro'); return false">${qdNum(nDiv)} com divergência →</a>` : `<span>${qdNum(nDiv)} com divergência</span>`}</p>`;
}

/* ---------------- gráfico do mês (Chart.js, como no painel CSAT) ---------------- */
async function qpGrafico(){
  try { await carregarLib(LIB_GRAFICO); } catch (erro) { return; }
  const tela = qdEl('qp-grafico');
  if (!tela) return;
  const cor = nome => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const texto = cor('--text-dim'), grade = cor('--border'), fundo = cor('--surface');
  const conta = fn => qp.dias.map(d => { let n = 0; d.reg.forEach(r => { if (fn(r.s)) n++; }); return n; });
  const iProj = qp.dias.findIndex(d => d.tipo === 'projecao'); // a partir daqui a linha fica tracejada
  const ds = (label, data, c) => ({ label, data, borderColor: c, backgroundColor: c, borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 6,
    pointBorderWidth: 1.5, pointBorderColor: fundo, cubicInterpolationMode: 'monotone',
    segment: { borderDash: s => iProj >= 0 && s.p1DataIndex >= iProj ? [6, 5] : undefined } });
  if (qp.grafico) qp.grafico.destroy();
  qp.grafico = new Chart(tela, {
    type: 'line',
    data: { labels: qp.dias.map(d => d.dia.slice(8)), datasets: [
      ds('No quadro', conta(s => !qdForaDoQuadro(s)), cor('--accent')),
      ds('Ativos', conta(s => s === 'ativo' || s === 'aviso'), cor('--success')),
      ds('Férias + afastados', conta(s => s === 'ferias' || s === 'afastado'), cor('--qd-info')),
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      onClick: (e, itens) => { if (itens.length) { qp.dia = qp.dias[itens[0].index].dia; qpDesenhar(); } },
      scales: { y: { beginAtZero: true, ticks: { color: texto, precision: 0 }, grid: { color: grade }, border: { display: false } }, x: { ticks: { color: texto }, grid: { display: false } } },
      plugins: { legend: { position: 'top', align: 'end', labels: { color: texto, boxWidth: 26, boxHeight: 2 } },
        tooltip: { callbacks: { title: i => `${qdDataBr(qp.dias[i[0].dataIndex].dia)} · ${QP_TIPO[qp.dias[i[0].dataIndex].tipo]}`, label: c => `${c.dataset.label}: ${qdNum(c.parsed.y)}` } } },
    },
  });
}

/* ---------------- listas de pessoas (janela) ---------------- */
function qpListaDia(status, titulo, dim, valor){
  const d = qpDiaAtual(), porMat = new Map(qd.func.map(f => [f.matricula, f])), itens = [];
  d.reg.forEach((r, m) => {
    if (status ? r.s !== status : qdForaDoQuadro(r.s)) return;
    if (dim && (r[dim] || '(sem informação)') !== valor) return;
    const f = porMat.get(m); if (f) itens.push({ f, s: r.s });
  });
  qpJanela(`${titulo} · ${qdDataBr(d.dia)}`, itens, d.tipo === 'foto' ? d.dia : '');
}
// Movimentos (entradas, saídas, voltas, desligamentos) de um dia ou do mês inteiro
function qpListaMov(chave, titulo, dia){
  const porMat = new Map(qd.func.map(f => [f.matricula, f])), itens = [];
  qp.dias.filter(d => !dia || d.dia === dia).forEach(d => d.mv[chave].forEach(m => {
    const f = porMat.get(m); if (f) itens.push({ f, s: d.reg.get(m).s, quando: d.dia, tipo: d.tipo });
  }));
  qpJanela(titulo, itens, '');
}
// Janela com a lista. Numa foto (dia com carga): quem mudou DEPOIS dela ganha a marca (hover = o que mudou; clique = ficha)
function qpJanela(titulo, itens, dataFoto){
  const depois = {};
  if (dataFoto) qp.hist.filter(h => h.data > dataFoto).forEach(h => (depois[h.matricula] = depois[h.matricula] || []).push(h));
  const comData = itens.some(i => i.quando);
  itens.sort((a, b) => (a.quando || '').localeCompare(b.quando || '') || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
  const linhas = itens.map(({ f, s, quando, tipo }) => {
    const mud = depois[f.matricula];
    const dica = mud ? mud.sort((a, b) => a.data.localeCompare(b.data)).map(h =>
      `${qdDataBr(h.data)}: ${QD_CAMPOS_NOME[h.campo] || h.campo} ${qdValorCampo(h.campo, h.de)} → ${qdValorCampo(h.campo, h.para)} (${h.origem}${h.quem ? ' · ' + h.quem : ''})`).join('\n') : '';
    return `<tr onclick="qdAbrirFicha('${qdEsc(f.matricula)}')">
      ${comData ? `<td>${qdDataBr(quando)} <small class="qd-fraco">${QP_TIPO[tipo]}</small></td>` : ''}
      <td>${qdEsc(f.matricula)}</td><td class="qd-nome">${qdEsc(f.nome)}</td><td>${qdSelo(s)}</td>
      <td class="qd-corta">${qdEsc(f.segmento || '—')}</td><td class="qd-corta">${qdEsc(f.gestor1 || '—')}</td>
      <td>${mud ? `<span class="qp-mudou" title="${qdEsc(dica)}">mudou depois (${mud.length})</span>` : ''}</td></tr>`;
  }).join('');
  qdModal(`${titulo} · ${qdNum(itens.length)}`, itens.length ? `
    ${dataFoto ? `<p class="qd-fraco" style="margin-bottom:10px">Como o dia ${qdDataBr(dataFoto)} fechou. "Mudou depois" = passe o mouse para ver data, o que mudou e quem pediu. Clique numa pessoa para abrir a ficha.</p>` : ''}
    <div class="table-wrap qd-tabela qp-lista"><table>
      <thead><tr>${comData ? '<th>Quando</th>' : ''}<th>Matr.</th><th>Nome</th><th>Situação</th><th>Segmento</th><th>Supervisor</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table></div>` : '<p class="qd-fraco">Ninguém.</p>');
}
