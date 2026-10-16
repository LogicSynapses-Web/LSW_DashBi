/* =====================================================================
   QUADRO (fase 4 · protótipo P1) — seção "Quadro" do sistema
   Fluxo: carregar DPO (csv) e WFM (xls) → ligar os cadastros (nome +
   admissão) → montar o quadro (o DPO vale) → foto do dia + trajetória.
   Tudo no navegador (IndexedDB, ver quadro-base.js); banco depois.
   Abas: Quadro atual · Cargas · Confirmar vínculos.
   Depende do script.js (showToast, session, carregarLib, LIB_PLANILHA)
   e do quadro-base.js.
   ===================================================================== */

const qd = {
  aba: 'quadro',      // 'quadro' | 'cargas' | 'vinculos'
  func: [],           // funcionários do quadro (gaveta "funcionarios")
  cargas: [],         // histórico de cargas
  pend: [],           // ligações a confirmar (nome igual, admissão diferente)
  vinc: [],           // decisões já tomadas pelo ADM
  clientes: (typeof QD_CLIENTES_PADRAO !== 'undefined' && QD_CLIENTES_PADRAO) || ['CENTRAL ATENDE'], // a demonstração (LSW) define outro cliente
  filtro: { texto: '', status: 'nao_desligados', turno: '', segmento: '', gestor: '', conferir: '' },
  limite: 100,        // linhas mostradas na tabela (botão "Mostrar mais")
  limitePend: 30,
  limiteDec: 50,      // linhas de "Decisões já tomadas"
  planilha: null,     // planilha de vínculos lida, esperando confirmação
  ocupado: false,     // uma carga em andamento
  dataBase: '',       // data da base escolhida na aba Cargas (vazio = hoje)
  sel: null,          // matrícula da pessoa escolhida (cartão no topo do Quadro atual)
  verFiltros: false,  // filtros extras abertos
  tickets: [],        // solicitações de ajuste (quadro-solicitacoes.js)
};
const qdEl = id => document.getElementById(id);

/* ---------------- colunas usadas de cada base ---------------- */
// Só estes campos são guardados. CPF, salário, endereço, telefone e e-mail ficam de fora.
const QD_COL_DPO = {
  matricula: 'Matricula', nome: 'Nome Colaborador', admissao: 'Admissao', desligamento: 'Desligamento',
  motivo_deslig: 'Motivo do Desligamento', gestor1: 'Nome Gestor 1', gestor2: 'Nome Gestor 2',
  situacao: 'Situação Oficial', funcao: 'Função', nivel: 'Nivel Hierarquico', hora_entrada: 'Hora Entrada', hora_saida: 'Hora Saida',
  segmento: 'Segmento', cliente: 'Cliente', site: 'Site', ferias_ini: 'Inicio Férias', ferias_fim: 'Fim de Férias',
  afast_ini: 'Afastamento', afast_fim: 'Retorno Afastamento', motivo_afast: 'Motivo Afastamento',
  carga_horaria: 'Carga Horaria', jornada: 'Jornada', aviso_ini: 'Aviso Previo Inicio', aviso_fim: 'Aviso Previo Fim',
  // Logins dos sistemas (AVAYA, SALESFORCE, MUTANT_ADHERE, LOGIN_REDE…): viram a lista "logins" na carga
  sis0: 'Sistema0', log0: 'Login Sistema0', sis1: 'Sistema1', log1: 'Login Sistema1', sis2: 'Sistema2', log2: 'Login Sistema2',
  sis3: 'Sistema3', log3: 'Login Sistema3', sis4: 'Sistema4', log4: 'Login Sistema4', sis5: 'Sistema5', log5: 'Login Sistema5',
};
const QD_COL_WFM = {
  re: 'Cód. RE', nome: 'Nome', admissao: 'Dt. Admissão', cargo: 'Cargo', centro_custo: 'Centro Custo',
  carga_horaria: 'Carga Horária', situacao: 'Situação', sit_ini: 'Dt. Ini Situação', sit_fim: 'Dt. Fim Situação',
  ferias_ini: 'Dt. Ini Férias', ferias_fim: 'Dt. Fim Férias', motivo_deslig: 'Motivo Deslig.', dt_situacao: 'Dt. Situação',
  operacao: 'Descrição da Operação', operacao2: 'Operação', jornada: 'Jornada', hora_entrada: 'Horário de Entrada',
};
const QD_OBRIG = { dpo: ['matricula', 'nome', 'admissao', 'situacao', 'cliente'], wfm: ['re', 'nome', 'admissao', 'situacao'] };
// Campos acompanhados na trajetória (mudou de uma carga para outra → vira uma linha no histórico)
const QD_CAMPOS_HIST = ['status', 'situacao', 'wfm_situacao', 'gestor1', 'segmento', 'turno', 'hora_entrada', 'carga_horaria',
  'jornada', 'funcao', 'site', 'wfm_operacao', 'ferias_ini', 'afast_ini', 'aviso_ini', 'desligamento'];

/* ---------------- leitura dos arquivos ---------------- */
// Texto do arquivo: tenta UTF-8; se tiver acento "quebrado", lê como Windows-1252 (padrão do Excel antigo)
function qdDecodificar(buf){
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}
// CSV com aspas (o DPO tem campos com quebra de linha dentro de aspas)
function qdLerCsv(txt){
  const l1 = txt.slice(0, txt.indexOf('\n'));
  const sep = (l1.match(/;/g) || []).length >= (l1.match(/,/g) || []).length ? ';' : ',';
  const linhas = [];
  let linha = [], campo = '', aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c !== '"') campo += c;
      else if (txt[i + 1] === '"') { campo += '"'; i++; }
      else aspas = false;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && txt[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.length > 1 || linha[0] !== '') linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}
// "xls" do WFM: na verdade é uma página HTML. As células do cabeçalho não têm a tag de abertura,
// por isso cada célula é cortada pelo FECHAMENTO (</td> ou </th>).
function qdLerHtml(txt){
  const ent = s => s.replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/gi, '&');
  return [...txt.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(m => m[1].split(/<\/t[dh]>/i).slice(0, -1).map(c => ent(c.replace(/<[^>]+>/g, '')).trim()));
}
// Qualquer um dos formatos → lista de linhas (cada linha = lista de células)
async function qdLerArquivo(arq){
  const buf = await arq.arrayBuffer();
  // Página HTML disfarçada de .xls: começa com "<" (o cabeçalho de estilos pode ser longo, então não procura "<table")
  const inicio = new TextDecoder('latin1').decode(buf.slice(0, 512)).replace(/^﻿|^ï»¿/, '').trimStart();
  if (/\.(csv|txt)$/i.test(arq.name)) return qdLerCsv(qdDecodificar(buf));
  if (inicio.startsWith('<')) return qdLerHtml(qdDecodificar(buf));
  // Planilha de verdade (.xlsx/.xls): usa a mesma biblioteca do painel CSAT
  await carregarLib(LIB_PLANILHA);
  const wb = XLSX.read(buf, { type: 'array', raw: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
}
// Linhas → objetos só com os campos do mapa (acha as colunas pelo nome, sem ligar para acento)
function qdMontarRegistros(linhas, mapa, tipo){
  const iCab = linhas.findIndex(l => l.length > 10);
  if (iCab < 0) throw new Error('Não encontrei o cabeçalho da planilha. Confira se é o arquivo certo.');
  const cab = linhas[iCab].map(qdNorm);
  const idx = {};
  for (const [campo, nome] of Object.entries(mapa)) idx[campo] = cab.indexOf(qdNorm(nome));
  const faltam = QD_OBRIG[tipo].filter(c => idx[c] < 0).map(c => `"${mapa[c]}"`);
  if (faltam.length) throw new Error(`Este arquivo não parece ser o ${tipo.toUpperCase()}: faltam as colunas ${faltam.join(', ')}.`);
  const regs = [];
  for (let i = iCab + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l || l.length < 5) continue;
    const r = {};
    for (const [campo, j] of Object.entries(idx)) {
      const v = j < 0 ? '' : String(l[j] ?? '').replace(/\s+/g, ' ').trim();
      if (/^(admissao|desligamento|dt_situacao)$|_ini$|_fim$/.test(campo)) r[campo] = qdIso(v);
      else if (/^hora_|^carga_horaria$/.test(campo)) r[campo] = qdHora(v);
      else r[campo] = v === 'NULL' ? '' : v;
    }
    regs.push(r);
  }
  return regs;
}

/* ---------------- carga de uma base ---------------- */
async function qdCarregar(tipo){
  if (qd.ocupado) return;
  const arq = qdEl('qd-arq-' + tipo).files[0];
  const dataBase = qdEl('qd-data-base').value;
  if (!arq) return showToast('Escolha o arquivo primeiro.', 'erro');
  if (!dataBase) return showToast('Informe a data da base.', 'erro');
  qd.dataBase = dataBase; // a tela é redesenhada depois da carga: mantém a data escolhida
  qd.ocupado = true;
  const status = msg => { const s = qdEl('qd-status-' + tipo); if (s) s.textContent = msg; };
  document.querySelectorAll('.qd-btn-carga').forEach(b => b.disabled = true);
  try {
    status('Lendo o arquivo…');
    await new Promise(r => setTimeout(r, 30)); // deixa a mensagem aparecer antes do trabalho pesado
    const linhas = await qdLerArquivo(arq);
    let regs = qdMontarRegistros(linhas, tipo === 'dpo' ? QD_COL_DPO : QD_COL_WFM, tipo);
    const total = regs.length;
    if (tipo === 'dpo') {
      // Quadro = só os clientes escolhidos (o cliente do DPO que forma a operação)
      const clientes = new Set(qd.clientes.map(qdNorm));
      regs = regs.filter(r => r.matricula && clientes.has(qdNorm(r.cliente)));
      if (!regs.length) throw new Error(`Nenhuma linha do cliente ${qd.clientes.join(', ')} neste arquivo.`);
      regs.forEach(r => {
        r.logins = [0, 1, 2, 3, 4, 5].filter(i => r['log' + i]).map(i => ({ sistema: r['sis' + i], login: r['log' + i] }));
        for (let i = 0; i <= 5; i++) { delete r['sis' + i]; delete r['log' + i]; }
      });
    } else {
      // Coluna "Operação" às vezes vem colada com outras; a "Descrição da Operação" é a mais limpa
      regs = regs.filter(r => r.re).map(r => {
        if (!r.operacao && r.operacao2.length < 60) r.operacao = r.operacao2;
        delete r.operacao2;
        return r;
      });
    }
    status('Montando o quadro…');
    await qdGravar({ [tipo]: regs }, [tipo]);
    const res = await qdRecalcular({ tipo, dataBase, arquivo: arq.name, total, usados: regs.length });
    status('');
    qdEl('qd-arq-' + tipo).value = '';
    await qdAbrir(false);
    showToast(`${tipo.toUpperCase()} carregado: ${qdNum(regs.length)} registros · ${qdNum(res.mudancas)} mudanças na trajetória` +
      (res.pendentes ? ` · ${qdNum(res.pendentes)} vínculos para confirmar` : ''), 'sucesso', 5000);
  } catch (erro) {
    status('');
    showToast(erro.message, 'erro', 6000);
  } finally {
    qd.ocupado = false;
    document.querySelectorAll('.qd-btn-carga').forEach(b => b.disabled = false);
  }
}

/* ---------------- montar o quadro (DPO + WFM) ---------------- */
// origem = { tipo: 'dpo'|'wfm'|'vinculo'|'solicitacao', dataBase, arquivo?, total?, usados?, texto? }
async function qdRecalcular(origem){
  const [dpo, wfm, vinc, antes, cargas, tickets] = await Promise.all([
    qdTodos('dpo'), qdTodos('wfm'), qdTodos('vinculos'), qdTodos('funcionarios'), qdTodos('cargas'), qdTodos('tickets')]);
  const decisao = new Map(vinc.map(v => [v.re, v]));
  const dpoMat = new Map(dpo.map(d => [d.matricula, d]));

  // 1) Liga cada cadastro do WFM a uma matrícula do DPO
  //    nome + admissão iguais → automático; só o nome igual → fila "Confirmar vínculos"
  const porChave = new Map(), porNome = new Map();
  dpo.forEach(d => {
    const n = qdNorm(d.nome), k = n + '|' + d.admissao;
    porChave.set(k, porChave.has(k) ? null : d.matricula); // null = duas pessoas iguais: não liga sozinho
    if (!porNome.has(n)) porNome.set(n, []);
    porNome.get(n).push(d);
  });
  const ligados = new Map(), pendentes = [];
  const ligar = (m, w, modo) => { if (!ligados.has(m)) ligados.set(m, []); ligados.get(m).push({ w, modo }); };
  wfm.forEach(w => {
    const n = qdNorm(w.nome);
    const d = decisao.get(w.re);
    // Ligação dita pelo ADM (na tela ou pela planilha de vínculos) vale mais que a automática
    if (d && d.matricula && dpoMat.has(d.matricula)) return ligar(d.matricula, w, d.origem === 'planilha' ? 'planilha' : 'confirmado');
    const exato = porChave.get(n + '|' + w.admissao);
    if (exato) return ligar(exato, w, 'auto');
    if (d) return; // "não ligar", ou matrícula que ainda não está no quadro
    const cands = porNome.get(n);
    if (cands) pendentes.push({
      re: w.re, nome: w.nome, admissao: w.admissao, situacao: w.situacao, operacao: w.operacao,
      candidatos: cands.map(c => ({ matricula: c.matricula, admissao: c.admissao, situacao: c.situacao, segmento: c.segmento })),
    });
  });
  // Fila em ordem de importância: primeiro quem está no quadro hoje (não desligado no DPO), depois quem está ativo no WFM
  const peso = p => (p.candidatos.some(c => qdStatusDpo(c.situacao) !== 'desligado') ? 0 : 2) + (qdStatusWfm(p.situacao) === 'desligado' ? 1 : 0);
  pendentes.forEach(p => p.relevante = peso(p) < 2);
  pendentes.sort((a, b) => peso(a) - peso(b) || qdNorm(a.nome).localeCompare(qdNorm(b.nome)));
  // Mais de um cadastro do WFM para a mesma pessoa (ex.: "cadastro duplicado"): vale o não desligado, depois o mais novo
  const melhor = lista => lista.slice().sort((a, b) =>
    (qdStatusWfm(a.w.situacao) === 'desligado') - (qdStatusWfm(b.w.situacao) === 'desligado') ||
    (b.w.admissao || '').localeCompare(a.w.admissao || ''))[0];

  // 2) Monta cada funcionário: dados do DPO + WFM ligado + status, turno e divergências
  const novos = new Map();
  dpo.forEach(d => {
    const l = ligados.get(d.matricula), esc = l && melhor(l), w = esc ? esc.w : null;
    const sd = qdStatusDpo(d.situacao), sw = w ? qdStatusWfm(w.situacao) : '';
    const f = { ...d, wfm: w, vinculo: esc ? esc.modo : '', wfm_extras: l ? l.length - 1 : 0 };
    // Rescisão indireta: ativo no DPO e desligado no WFM
    f.status = (sd === 'ativo' || sd === 'aviso') && w && qdNorm(w.situacao) === 'DESLIGADO' ? 'rescisao' : sd;
    f.turno = qdTurno(d.hora_entrada || (w && w.hora_entrada));
    f.wfm_situacao = w ? w.situacao : '';
    f.wfm_operacao = w ? w.operacao : '';
    f.divergencias = [];
    if (w) {
      // Aviso prévio conta como ativo; a rescisão indireta já é sinalizada à parte
      const comoAtivo = sd === 'aviso' ? 'ativo' : sd;
      if (f.status !== 'rescisao' && sw && sw !== comoAtivo) f.divergencias.push({ campo: 'status', dpo: sd, wfm: sw });
      if (d.carga_horaria && w.carga_horaria && d.carga_horaria !== w.carga_horaria) f.divergencias.push({ campo: 'carga_horaria', dpo: d.carga_horaria, wfm: w.carga_horaria });
      if (d.hora_entrada && w.hora_entrada && d.hora_entrada !== w.hora_entrada) f.divergencias.push({ campo: 'hora_entrada', dpo: d.hora_entrada, wfm: w.hora_entrada });
    }
    novos.set(d.matricula, f);
  });

  // 2b) Solicitações aprovadas valem por cima das bases (a partir da data de início).
  //     Carga do DPO igual ao pedido → "confirmada pela carga". Diferente → fica em VERMELHO até o ADM decidir
  //     (enquanto isso vale o pedido; "vale a carga nova" faz a base voltar a valer).
  const ticketsMudados = qsAplicarAprovados(tickets, novos, dpoMat, origem);

  // 3) Trajetória: compara com o quadro anterior. A PRIMEIRA carga de cada base só cria o ponto de partida.
  const quem = (typeof session !== 'undefined' && session) ? session.name : '';
  const textoOrigem = origem.texto || (origem.tipo === 'vinculo' ? 'Vínculo DPO × WFM decidido pelo ADM'
    : `Carga ${origem.tipo.toUpperCase()} de ${qdDataBr(origem.dataBase)}`);
  const semCarga = origem.tipo === 'vinculo' || origem.tipo === 'solicitacao';
  const registrarHist = antes.length > 0 && (semCarga || cargas.some(c => c.tipo === origem.tipo));
  const hist = [], fora = [];
  const antesMap = new Map(antes.map(a => [a.matricula, a]));
  const novaLinha = (matricula, campo, de, para) => hist.push({ matricula, data: origem.dataBase, campo, de, para, origem: textoOrigem, quem });
  for (const f of novos.values()) {
    const a = antesMap.get(f.matricula);
    if (!registrarHist) continue;
    if (!a) { novaLinha(f.matricula, 'base', '', 'Entrou no quadro'); continue; }
    if (a.fora_base) novaLinha(f.matricula, 'base', 'Fora da base', 'Voltou ao quadro');
    QD_CAMPOS_HIST.forEach(c => { if ((a[c] || '') !== (f[c] || '')) novaLinha(f.matricula, c, a[c] || '', f[c] || ''); });
  }
  // Quem estava no quadro e não veio nesta carga do DPO continua guardado, marcado como "fora da base"
  for (const a of antes) {
    if (novos.has(a.matricula)) continue;
    if (!a.fora_base) {
      a.fora_base = origem.dataBase;
      if (registrarHist) novaLinha(a.matricula, 'base', 'No quadro', 'Saiu da base do DPO');
    }
    fora.push(a);
  }

  // 4) Foto do dia: como cada pessoa estava ao fim da última carga daquela data (nova carga no mesmo dia substitui)
  const registros = {}, totais = {};
  for (const f of novos.values()) {
    registros[f.matricula] = { s: f.status, t: f.turno, g: f.gestor1, sg: f.segmento, ch: f.carga_horaria, he: f.hora_entrada, op: f.wfm_operacao };
    totais[f.status] = (totais[f.status] || 0) + 1;
  }
  const gravar = {
    funcionarios: [...novos.values(), ...fora],
    historico: hist,
    fotos: [{ data: origem.dataBase, atualizada_em: new Date().toISOString(), registros, totais }],
    config: [{ chave: 'pendentes', valor: pendentes }],
    tickets: ticketsMudados,
  };
  if (!semCarga) gravar.cargas = [{
    tipo: origem.tipo, arquivo: origem.arquivo, data_base: origem.dataBase, em: new Date().toISOString(),
    total: origem.total, usados: origem.usados, quem,
  }];
  await qdGravar(gravar, ['funcionarios']);
  return { mudancas: hist.length, pendentes: pendentes.length };
}

/* ---------------- abrir a seção ---------------- */
async function qdAbrir(mostrarCarregando = true){
  const alvo = qdEl('quadro-conteudo');
  if (mostrarCarregando && alvo && !alvo.innerHTML) alvo.innerHTML = '<div class="empty-state"><p>Carregando o quadro…</p></div>';
  try {
    [qd.func, qd.cargas, qd.pend, qd.vinc, qd.clientes, qd.tickets] = await Promise.all([
      qdTodos('funcionarios'), qdTodos('cargas'), qdConfig('pendentes', []), qdTodos('vinculos'), qdConfig('clientes', qd.clientes), qdTodos('tickets')]);
    qd.func.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    // Solicitação aprovada com data de início que chegou hoje (estava agendada): aplica agora
    const hoje = qdHoje();
    const refaz = pode('quadro.cargas') || pode('quadro.vinculos') || pode('quadro.analisar');
    if (refaz && !qd.aplicandoAgendadas && qd.func.length && qd.tickets.some(t => t.status === 'aprovado' && t.mudancas.length && !t.aplicado_em && t.data_inicio <= hoje)) {
      qd.aplicandoAgendadas = true;
      try { await qdRecalcularSemCarga('solicitacao', 'Solicitação aprovada entrou em vigor'); return; }
      finally { qd.aplicandoAgendadas = false; }
    }
    // Quadro vazio no banco: confere se ficaram dados do protótipo NESTE navegador (antes de 16/10/2026) para enviar
    qd.local = !qd.func.length && pode('*') ? await qdLocalResumo() : null;
  } catch (erro) {
    showToast(erro.message, 'erro', 6000);
  }
  qdRender();
}
// Aviso: "este navegador tem os dados do protótipo — enviar para o banco"
function qdHtmlMigrar(){
  const l = qd.local;
  if (!l) return '';
  return `<div class="panel qd-migrar">
    <div><b>Este navegador tem os dados do protótipo do Quadro</b>
      <div class="qd-fraco">${qdNum(l.pessoas)} pessoas · ${qdNum(l.vinculos)} decisões de vínculo · ${qdNum(l.tickets)} solicitações · ${qdNum(l.fotos)} fotos diárias · ${qdNum(l.cargas)} cargas.
      Envie uma vez para o banco: assim todos os perfis passam a ver o mesmo quadro e nada se perde (vínculos confirmados, trajetória, solicitações).</div>
      <div class="qd-fraco" id="qd-migrar-status"></div></div>
    <button class="btn btn-primary btn-small" id="qd-migrar-btn" onclick="qdMigrar()">Enviar para o banco</button>
  </div>`;
}
async function qdMigrar(){
  const btn = qdEl('qd-migrar-btn'), st = qdEl('qd-migrar-status');
  if (btn) btn.disabled = true;
  try {
    const c = await qdMigrarLocal(msg => { if (st) st.textContent = msg; });
    qd.local = null;
    await qdAbrir(false);
    showToast(`Dados enviados ao banco: ${qdNum(c.pessoas)} pessoas, ${qdNum(c.vinculos)} vínculos, ${qdNum(c.tickets)} solicitações.`, 'sucesso', 6000);
  } catch (erro) {
    if (btn) btn.disabled = false;
    if (st) st.textContent = '';
    showToast(erro.message, 'erro', 7000);
  }
}
// Contador vermelho no menu lateral: vínculos esperando confirmação
async function qdAtualizarBadge(){
  try { qd.pend = await qdConfig('pendentes', []); } catch (e) {}
  const b = qdEl('nav-quadro-badge');
  if (b) { b.textContent = qd.pend.length; b.style.display = qd.pend.length ? 'inline-flex' : 'none'; }
  // Subseção Solicitações: quantas estão abertas ou em andamento
  try { qd.tickets = qd.tickets && qd.tickets.length ? qd.tickets : await qdTodos('tickets'); } catch (e) {}
  const s = qdEl('nav-solic-badge'), n = (qd.tickets || []).filter(t => t.status === 'aberto' || t.status === 'andamento').length;
  if (s) { s.textContent = n; s.style.display = n ? 'inline-flex' : 'none'; }
}
// Troca de subseção pelo menu lateral (atalhos dentro das telas também passam por aqui, para o menu acompanhar)
function qdTrocarAba(aba){ if (typeof switchView === 'function') switchView('quadro', aba, true); else { qd.aba = aba; qdRender(); } }

// As subseções ficam no menu lateral (Quadro › …; Administração › Tickets = modelos). Aqui só a barra de filtros do Quadro atual.
function qdRender(){
  const alvo = qdEl('quadro-conteudo');
  if (!alvo) return;
  alvo.innerHTML = `
    ${qd.aba === 'quadro' && qd.func.length ? `<div class="qd-barra-topo">${qdHtmlFiltros()}</div>` : ''}
    <div id="qd-corpo"></div>`;
  ({ quadro: qdRenderQuadro, painel: qpRender, solicitacoes: qsRenderLista, modelos: qmRender, cargas: qdRenderCargas, vinculos: qdRenderVinculos })[qd.aba]();
  qdAtualizarBadge();
}
// Filtros na linha das abas: fechados = botão "Filtros"; abertos = as listas ao lado + "›" para recolher
function qdHtmlFiltros(){
  if (!qd.verFiltros) {
    const n = ['turno', 'segmento', 'gestor', 'conferir'].filter(c => qd.filtro[c]).length;
    return `<button class="btn btn-ghost btn-small qd-abas-filtros" onclick="qd.verFiltros = true; qdRender()">Filtros${n ? ` (${n})` : ''}</button>`;
  }
  const base = qd.func.filter(f => !f.fora_base);
  const opcoes = (campo, lista, rotulo) => `<select onchange="qdFiltrar('${campo}', this.value)"><option value="">${rotulo}</option>` +
    lista.map(([v, n]) => `<option value="${qdEsc(v)}"${qd.filtro[campo] === v ? ' selected' : ''}>${qdEsc(n)}</option>`).join('') + '</select>';
  const distintos = campo => [...new Set(base.map(f => f[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(v => [v, v]);
  return `<div class="qd-filtros qd-abas-filtros">
      ${opcoes('status', [['nao_desligados', 'No quadro (sem desligados)'], ...Object.entries(QD_STATUS).filter(([k]) => k !== 'outro' || base.some(f => f.status === 'outro')).map(([k, s]) => [k, s.nome]), ['fora_base', 'Fora da base do DPO']], 'Todas as situações')}
      ${opcoes('turno', Object.entries(QD_TURNOS), 'Todos os turnos')}
      ${opcoes('segmento', distintos('segmento'), 'Todos os segmentos')}
      ${opcoes('gestor', distintos('gestor1'), 'Todos os supervisores')}
      ${opcoes('conferir', [['div', 'Com divergência DPO × WFM'], ['semwfm', 'Sem cadastro no WFM']], 'Sem conferência')}
      <button class="btn btn-ghost btn-small" onclick="qdLimparFiltros()">Limpar</button>
      <button class="btn btn-ghost btn-small qd-recolher" title="Recolher filtros" onclick="qd.verFiltros = false; qdRender()">›</button>
    </div>`;
}

/* ---------------- aba QUADRO ATUAL ---------------- */
// Leitura: pesquisa em cima → cartão da pessoa (com "Solicitar ajuste") → contagens → tabela no formato da planilha do quadro
function qdRenderQuadro(){
  const corpo = qdEl('qd-corpo');
  if (!qd.func.length) {
    // Só quem tem a permissão de Cargas vê o atalho; os demais só recebem o aviso
    corpo.innerHTML = qdHtmlMigrar() + (pode('quadro.cargas')
      ? `<div class="empty-state"><p>Nenhuma base carregada ainda.<br>Comece pela aba <b>Cargas</b>: primeiro o DPO, depois o WFM.</p>
        <button class="btn btn-primary" style="width:auto;margin-top:16px" onclick="qdTrocarAba('cargas')">Ir para Cargas</button></div>`
      : `<div class="empty-state"><p>O quadro ainda não foi carregado.<br>As bases DPO e WFM são carregadas por quem tem a permissão <b>Cargas</b>.</p></div>`);
    return;
  }
  const base = qd.func.filter(f => !f.fora_base);
  const cont = {};
  base.forEach(f => cont[f.status] = (cont[f.status] || 0) + 1);
  const vivos = base.filter(f => !qdForaDoQuadro(f.status));
  const nDiv = vivos.filter(f => f.divergencias.length).length;
  const nSemWfm = vivos.filter(f => !f.wfm).length;
  const ultima = tipo => qd.cargas.filter(c => c.tipo === tipo).sort((a, b) => b.em.localeCompare(a.em))[0];
  const uD = ultima('dpo'), uW = ultima('wfm');
  const chip = (filtro, rotulo, valor, cor) => `
    <button class="qd-contador${qd.filtro.status === filtro ? ' ativo' : ''}" onclick="qdFiltrar('status','${filtro}', true)">
      ${cor ? `<i class="qd-ponto qd-selo-${cor}"></i>` : ''}${rotulo} <b>${qdNum(valor)}</b></button>`;
  corpo.innerHTML = `
    <div class="qd-contadores">
      ${chip('nao_desligados', 'No quadro', vivos.length)}
      ${chip('ativo', 'Ativos', cont.ativo || 0, 'ok')}
      ${chip('ferias', 'Férias', cont.ferias || 0, 'info')}
      ${chip('afastado', 'Afastados', cont.afastado || 0, 'alerta')}
      ${chip('aviso', 'Aviso prévio', cont.aviso || 0, 'alerta')}
      ${chip('rescisao', 'Rescisão indireta', cont.rescisao || 0, 'perigo')}
      ${chip('desligado', 'Desligados', (cont.desligado || 0) + (cont.rescisao || 0), 'apagado')}
      <span class="qd-contadores-sep"></span>
      ${pode('quadro.localizar') ? `<!-- Pesquisa compacta: caixa pequena + lupa (nome, matrícula, mat. WFM, login ou supervisor) -->
      <div class="qd-busca-mini">
        <input type="text" id="qd-busca" placeholder="Pesquisar…" title="Nome, matrícula, mat. WFM, login ou supervisor"
          value="${qdEsc(qd.filtro.texto)}" oninput="qdFiltrar('texto', this.value)" autocomplete="off">
        <button class="qd-busca-lupa" title="Pesquisar" onclick="qdEl('qd-busca').focus()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>
      <!-- Card da pessoa encontrada: abre no canto superior direito, por cima da pesquisa -->
      <div id="qd-pessoa"></div>` : ''}
    </div>
    <div class="panel tela-tabela"><div id="qd-tabela" class="tela-col"></div></div>
    <p class="qd-fonte qd-fonte-rodape">DPO de ${uD ? qdDataBr(uD.data_base) : '—'} · WFM de ${uW ? qdDataBr(uW.data_base) : '<b>não carregado</b>'}
      ${nDiv ? ` · <a href="#" onclick="qdFiltrar('conferir','div', true); return false">${qdNum(nDiv)} com divergência DPO × WFM</a>` : ''}
      ${nSemWfm ? ` · <a href="#" onclick="qdFiltrar('conferir','semwfm', true); return false">${qdNum(nSemWfm)} sem WFM</a>` : ''}</p>`;
  qdRenderTabela();
}
function qdFiltrar(campo, valor, redesenharTudo){
  // Clicar de novo no contador já escolhido volta para "No quadro"
  if (campo === 'status' && redesenharTudo && qd.filtro.status === valor && valor !== 'nao_desligados') valor = 'nao_desligados';
  qd.filtro[campo] = valor;
  qd.limite = 100;
  if (campo === 'texto') qd.cartaoFechado = false; // pesquisa nova: o cartão pode abrir de novo
  // Filtros extras mudam o contador do botão "Filtros" (na linha das abas): redesenha a seção toda
  if (redesenharTudo || ['turno', 'segmento', 'gestor', 'conferir'].includes(campo)) qdRender(); else qdRenderTabela();
}
function qdLimparFiltros(){
  qd.filtro = { texto: '', status: 'nao_desligados', turno: '', segmento: '', gestor: '', conferir: '' };
  qd.limite = 100;
  qdRender();
}
// ✕ do cartão: fecha sempre, mesmo com a pesquisa preenchida (o texto continua no campo)
function qdFecharCartao(){
  qd.sel = null;
  qd.cartaoFechado = true;
  qdRenderTabela();
}
// A pesquisa procura em todo mundo (inclusive desligados); os demais filtros valem como de costume
function qdFiltrados(){
  const f = qd.filtro, t = qdNorm(f.texto);
  return qd.func.filter(x => {
    if (t) {
      const achou = qdNorm(x.nome).includes(t) || x.matricula.includes(t) || (x.wfm && x.wfm.re.includes(t)) ||
        qdNorm(x.gestor1).includes(t) || (x.logins || []).some(l => qdNorm(l.login).includes(t));
      if (!achou) return false;
    } else if (f.status === 'fora_base') { if (!x.fora_base) return false; }
    else if (x.fora_base) return false;
    else if (f.status === 'nao_desligados') { if (qdForaDoQuadro(x.status)) return false; }
    else if (f.status === 'desligado') { if (!qdForaDoQuadro(x.status)) return false; } // desligados = desligado + rescisão indireta
    else if (f.status && x.status !== f.status) return false;
    if (f.turno && x.turno !== f.turno) return false;
    if (f.segmento && x.segmento !== f.segmento) return false;
    if (f.gestor && x.gestor1 !== f.gestor) return false;
    if (f.conferir === 'div' && !x.divergencias.length) return false;
    if (f.conferir === 'semwfm' && x.wfm) return false;
    return true;
  }).sort((a, b) => qdForaDoQuadro(a.status) - qdForaDoQuadro(b.status) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
function qdRenderTabela(){
  const alvo = qdEl('qd-tabela');
  if (!alvo) return;
  const lista = qdFiltrados();
  // Pesquisa que achou uma pessoa só: o cartão dela aparece sozinho no topo
  if (pode('quadro.localizar') && qd.filtro.texto && lista.length === 1 && !qd.cartaoFechado) qd.sel = lista[0].matricula;
  qdRenderPessoa();
  if (!lista.length) { alvo.innerHTML = '<div class="empty-state"><p>Ninguém encontrado.</p></div>'; return; }
  const d = v => v ? qdDataBr(v) : '';
  const localizar = pode('quadro.localizar'); // sem a permissão: a linha não abre o cartão da pessoa
  const linhas = lista.slice(0, qd.limite).map(f => {
    const alerta = f.status === 'rescisao' || f.divergencias.length || f.pedido_divergente;
    const dica = [f.pedido_divergente ? `Carga do DPO diferente da solicitação nº ${f.pedido_divergente}` : '',
      f.status === 'rescisao' ? 'Rescisão indireta' : '', ...f.divergencias.map(x => QD_CAMPOS_NOME[x.campo] + ' diferente')].filter(Boolean).join(' · ');
    const [ini, fim] = qdPeriodo(f);
    const lg = f.logins || [];
    const login = i => lg[i] ? `<span title="${qdEsc(lg[i].sistema)}">${qdEsc(lg[i].login)}</span>` : '<span class="qd-fraco">-</span>';
    return `<tr class="${f.matricula === qd.sel ? 'qd-linha-sel' : ''}${f.status === 'desligado' ? ' qd-linha-apagada' : ''}${f.pedido_divergente ? ' qd-linha-vermelha' : ''}${localizar ? '' : ' qd-linha-fixa'}"${localizar ? ` onclick="qdSelecionar('${qdEsc(f.matricula)}')"` : ''}>
      <td class="qd-fixa1">${qdEsc(f.matricula)}</td>
      <td class="qd-fixa2 qd-nome" title="${qdEsc(f.nome)}">${qdEsc(f.nome)}</td>
      <td>${d(f.admissao)}</td>
      <td>${qdSelo(f.status)}${alerta ? ` <span class="qd-alerta" title="${qdEsc(dica)}">!</span>` : ''}</td>
      <td>${d(ini)}</td><td>${d(fim)}</td>
      <td class="qd-corta" title="${qdEsc(f.segmento)}">${qdEsc(f.segmento || '—')}</td>
      <td>${qdEsc(f.hora_entrada || '—')}</td>
      <td>${qdEsc(f.carga_horaria || '—')}</td>
      <td>${qdEsc(f.regime || '—')}</td>
      <td class="qd-corta" title="${qdEsc(f.gestor1)}">${qdEsc(f.gestor1 || '—')}</td>
      <td>${f.wfm ? qdEsc(f.wfm.re) : '<span class="qd-fraco">—</span>'}</td>
      <td>${login(0)}</td><td>${login(1)}</td><td>${login(2)}</td><td>${login(3)}</td>
    </tr>`;
  }).join('');
  alvo.innerHTML = `
    <div class="table-wrap qd-tabela">
      <table>
        <thead><tr><th class="qd-fixa1">Matr.</th><th class="qd-fixa2">Nome</th><th>Admissão</th><th>Situação</th><th>Início sit.</th><th>Fim sit.</th><th>Segmento</th>
          <th>Entrada</th><th>CH</th><th>Regime</th><th>Supervisor</th><th>Mat. WFM</th><th>Login 1</th><th>Login 2</th><th>Login 3</th><th>Login 4</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    <div class="qd-rodape-tabela">
      <span>${qdNum(Math.min(qd.limite, lista.length))} de ${qdNum(lista.length)} pessoas${localizar ? ' · clique numa linha para ver a pessoa' + (pode('quadro.solicitar') ? ' e solicitar ajuste' : '') : ''}</span>
      ${lista.length > qd.limite ? '<button class="btn btn-ghost btn-small" onclick="qd.limite += 100; qdRenderTabela()">Mostrar mais 100</button>' : ''}
    </div>`;
}
function qdSelecionar(matricula){
  if (!pode('quadro.localizar')) return;
  qd.sel = matricula;
  qd.cartaoFechado = false;
  document.querySelectorAll('#qd-tabela tr.qd-linha-sel').forEach(tr => tr.classList.remove('qd-linha-sel'));
  qdRenderTabela();
}
// Cartão da pessoa encontrada: resumo + "Solicitar ajuste" + solicitações dela
function qdRenderPessoa(){
  const alvo = qdEl('qd-pessoa');
  if (!alvo) return;
  const f = qd.sel && pode('quadro.localizar') && qd.func.find(x => x.matricula === qd.sel);
  if (!f) { alvo.innerHTML = ''; return; }
  const [ini, fim] = qdPeriodo(f);
  const item = (rot, val) => `<div class="qd-pessoa-item"><span>${rot}</span><b>${qdEsc(val || '—')}</b></div>`;
  const tickets = (qd.tickets || []).filter(t => t.matricula === f.matricula).sort((a, b) => b.id - a.id);
  // Card flutuante (fica por cima da tabela, no canto; fecha no ✕)
  alvo.innerHTML = `
    <div class="qd-pessoa">
      <div class="qd-pessoa-cabeca">
        <div>
          <div class="qd-pessoa-nome">${qdEsc(f.nome)} ${qdSelo(f.status)}</div>
          <div class="qd-fraco">Matrícula ${qdEsc(f.matricula)}${f.wfm ? ' · Mat. WFM ' + qdEsc(f.wfm.re) : ''} · ${qdEsc(QD_TURNOS[f.turno] || 'turno não informado')}
            ${ini ? ` · situação de ${qdDataBr(ini)}${fim ? ' a ' + qdDataBr(fim) : ''}` : ''}</div>
        </div>
        <div class="qd-pessoa-acoes">
          ${pode('quadro.solicitar') ? `<button class="btn btn-primary" style="width:auto" onclick="qsAbrir('${qdEsc(f.matricula)}')">Solicitar ajuste</button>` : ''}
          <button class="btn btn-ghost" onclick="qdAbrirFicha('${qdEsc(f.matricula)}')">Ficha completa</button>
          <button class="btn-icon" title="Fechar" onclick="qdFecharCartao()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      </div>
      <div class="qd-pessoa-grade">
        ${item('Admissão', qdDataBr(f.admissao))}${item('Segmento', f.segmento)}${item('Supervisor', f.gestor1)}
        ${item('Entrada / CH', [f.hora_entrada, f.carga_horaria].filter(Boolean).join(' · '))}${item('Regime', f.regime)}
        ${item('Logins', (f.logins || []).map(l => l.login).join(' · '))}
      </div>
      ${tickets.length ? `<div class="qd-pessoa-tickets"><span class="qd-fraco">Solicitações desta pessoa:</span>
        ${tickets.map(t => `<button class="qd-chip" onclick="qsVer(${t.id})">nº ${t.id} · ${qdEsc(qsTipoNome(t))} ·${qsSelo(t.status)}</button>`).join('')}</div>` : ''}
    </div>`;
}

/* ---------------- ficha (janela) ---------------- */
async function qdAbrirFicha(matricula){
  const f = qd.func.find(x => x.matricula === matricula);
  if (!f) return;
  let hist = [];
  try { hist = await qdPorIndice('historico', 'matricula', matricula); } catch (e) {}
  qdModal('Ficha do funcionário', qdFichaHtml(f, hist));
}
function qdModal(titulo, html){
  let m = qdEl('qd-modal');
  if (!m) { m = document.createElement('div'); m.className = 'modal-overlay'; m.id = 'qd-modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal wide qd-modal">
    <div class="modal-head"><h3>${qdEsc(titulo)}</h3>
      <button class="btn-icon" onclick="qdFecharModal()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="modal-body">${html}</div></div>`;
  m.classList.add('active');
}
function qdFecharModal(){ const m = qdEl('qd-modal'); if (m) m.classList.remove('active'); }
const qdModalAberto = () => !!document.querySelector('#qd-modal.active');

/* ---------------- aba CARGAS ---------------- */
function qdRenderCargas(){
  const corpo = qdEl('qd-corpo');
  const ultima = tipo => qd.cargas.filter(c => c.tipo === tipo).sort((a, b) => b.em.localeCompare(a.em))[0];
  const quando = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const bloco = (tipo, titulo, arquivoEx, aceita, explica) => {
    const u = ultima(tipo);
    return `<div class="panel qd-painel">
      <h3>${titulo}</h3>
      <p class="qd-fraco">${explica} Ex.: <i>${arquivoEx}</i></p>
      <div class="qd-ultima">${u ? `Última carga: <b>${qdEsc(u.arquivo)}</b> · base de ${qdDataBr(u.data_base)} · ${qdNum(u.usados)} registros usados (de ${qdNum(u.total)}) · ${quando(u.em)}` : 'Ainda não carregado.'}</div>
      <input type="file" id="qd-arq-${tipo}" accept="${aceita}" class="qd-arquivo">
      <div class="qd-linha-botao">
        <button class="btn btn-primary qd-btn-carga" style="width:auto" onclick="qdCarregar('${tipo}')">Carregar ${tipo.toUpperCase()}</button>
        <span class="qd-status" id="qd-status-${tipo}"></span>
      </div>
    </div>`;
  };
  const hist = qd.cargas.slice().sort((a, b) => b.em.localeCompare(a.em)).map(c => `<tr>
    <td>${quando(c.em)}</td><td>${c.tipo.toUpperCase()}</td><td class="qd-corta" title="${qdEsc(c.arquivo)}">${qdEsc(c.arquivo)}</td>
    <td>${qdDataBr(c.data_base)}</td><td>${qdNum(c.total)}</td><td>${qdNum(c.usados)}</td></tr>`).join('');
  corpo.innerHTML = `
    ${qdHtmlMigrar()}
    <div class="panel qd-painel">
      <h3>Antes de carregar</h3>
      <div class="field-row">
        <div class="field">
          <label>Data da base (foto do dia)</label>
          <input type="date" id="qd-data-base" value="${qd.dataBase || qdHoje()}" onchange="qd.dataBase = this.value">
          <small class="qd-fraco">A data a que os arquivos se referem. Carregar de novo na mesma data substitui a foto daquele dia.</small>
        </div>
        <div class="field">
          <label>Clientes do DPO que formam o quadro</label>
          <input type="text" class="caixa-alta" id="qd-clientes" value="${qdEsc(qd.clientes.join(', '))}" onchange="qdSalvarClientes(this.value)">
          <small class="qd-fraco">Separe por vírgula. Vale a partir da próxima carga do DPO.</small>
        </div>
      </div>
      ${typeof lswBasesExemplo === 'function' ? `<div class="lsw-exemplo"><span>Não tem as bases à mão?</span>
        <button class="btn btn-ghost btn-small qd-btn-carga" style="width:auto" onclick="lswBasesExemplo()">Usar bases de exemplo</button></div>` : ''}
    </div>
    <div class="qd-duas">
      ${bloco('dpo', '1. DPO — estrutura oficial', 'relatorio_estrutura.csv', '.csv,.txt,.xlsx,.xls', 'É a base que vale. O quadro é formado por ela.')}
      ${bloco('wfm', '2. WFM — relatório de funcionários', 'Relatório de Funcionários.xls', '.xls,.xlsx,.htm,.html,.csv', 'Usado para comparar com o DPO e achar a rescisão indireta.')}
    </div>
    <div class="panel qd-painel">
      <h3>Histórico de cargas</h3>
      ${hist ? `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Base</th><th>Arquivo</th><th>Data da base</th><th>No arquivo</th><th>Usados</th></tr></thead><tbody>${hist}</tbody></table></div>`
        : '<p class="qd-fraco">Nenhuma carga ainda.</p>'}
    </div>
    ${pode('*') ? `<div class="qd-zona-perigo">
      <div><b>Apagar o Quadro do banco</b><br><span class="qd-fraco">Apaga, para todos, o quadro, as fotos diárias, a trajetória, os vínculos e as solicitações. Os arquivos originais não são afetados.</span></div>
      <button class="btn btn-danger-ghost btn-small" onclick="qdConfirmarApagar()">Apagar dados</button>
    </div>` : ''}`;
}
async function qdSalvarClientes(texto){
  const lista = texto.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!lista.length) return showToast('Informe ao menos um cliente.', 'erro');
  qd.clientes = lista;
  try { await qdGravar({ config: [{ chave: 'clientes', valor: lista }] }); showToast('Clientes salvos. Carregue o DPO de novo para aplicar.'); }
  catch (erro) { showToast(erro.message, 'erro'); }
}
function qdConfirmarApagar(){
  qdModal('Apagar o Quadro do banco?', `
    <p class="modal-text">Isto apaga <b>do banco, para todos os usuários</b>, o quadro montado, as fotos diárias, a trajetória, as decisões de vínculo e as solicitações.
    Não dá para desfazer: para voltar, é preciso carregar os arquivos de novo (a trajetória, as fotos e as solicitações se perdem).</p>
    <div class="modal-foot qd-foot-solto">
      <button class="btn btn-ghost" onclick="qdFecharModal()">Cancelar</button>
      <button class="btn btn-danger-ghost" onclick="qdApagar()">Apagar tudo</button>
    </div>`);
}
async function qdApagar(){
  try {
    await qdApagarTudo();
    if (typeof qm !== 'undefined') Object.assign(qm, { modelos: [], sel: null, edit: null, sujo: false, lido: false });
    qdFecharModal();
    qd.filtro = { texto: '', status: 'nao_desligados', turno: '', segmento: '', gestor: '', conferir: '' };
    await qdAbrir(false);
    showToast('Quadro apagado do banco.');
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}

/* ---------------- aba CONFIRMAR VÍNCULOS ---------------- */
function qdRenderVinculos(){
  const corpo = qdEl('qd-corpo');
  const porMat = new Map(qd.func.map(f => [f.matricula, f]));
  const lote = qdLoteSeguro();
  const cartoes = qd.pend.slice(0, qd.limitePend).map(p => `
    <div class="panel qd-vinc">
      <div class="qd-vinc-wfm">
        <span class="qd-etq">WFM</span>
        <div class="qd-vinc-dados"><b>${qdEsc(p.nome)}</b><div class="qd-fraco">Cód. RE ${qdEsc(p.re)} · admissão ${qdDataBr(p.admissao)} · ${qdEsc(p.situacao || '—')}${p.operacao ? ' · ' + qdEsc(p.operacao) : ''}</div></div>
        <button class="btn btn-ghost btn-small" onclick="qdDecidir('${qdEsc(p.re)}', '')">Nenhuma — não ligar</button>
      </div>
      <div class="qd-vinc-cands">
        ${p.candidatos.map(c => {
          const f = porMat.get(c.matricula), jaLigado = f && f.wfm && f.wfm.re !== p.re;
          return `<div class="qd-vinc-cand">
            <span class="qd-etq qd-etq-dpo">DPO</span>
            <div class="qd-vinc-dados">Matrícula <b>${qdEsc(c.matricula)}</b> · admissão ${qdDataBr(c.admissao)} · ${qdEsc(c.situacao)} · ${qdEsc(c.segmento || '—')}
              ${jaLigado ? `<div class="qd-aviso-mini">Já ligada ao Cód. RE ${qdEsc(f.wfm.re)} (${qdEsc(f.wfm.situacao)})</div>` : ''}</div>
            <button class="btn btn-ghost btn-small" onclick="qdDecidir('${qdEsc(p.re)}','${qdEsc(c.matricula)}')">É esta pessoa</button>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
  const todas = qd.vinc.slice().sort((a, b) => b.em.localeCompare(a.em));
  const decisoes = todas.slice(0, qd.limiteDec).map(v => `<tr>
    <td>${qdEsc(v.re)}</td><td class="qd-corta">${qdEsc(v.nome || '')}</td>
    <td>${v.matricula ? 'Ligado à matrícula <b>' + qdEsc(v.matricula) + '</b>' : '<span class="qd-fraco">Não ligar</span>'}</td>
    <td>${v.origem === 'planilha' ? 'Planilha' : v.lote ? 'Lote' : 'Tela'}</td>
    <td>${new Date(v.em).toLocaleDateString('pt-BR')}</td>
    <td><button class="btn btn-ghost btn-small" onclick="qdDesfazer('${qdEsc(v.re)}')">Desfazer</button></td></tr>`).join('');
  // Cada planilha carregada pode ser desfeita inteira
  const planilhas = {};
  qd.vinc.filter(v => v.origem === 'planilha').forEach(v => {
    const p = planilhas[v.carga] || (planilhas[v.carga] = { carga: v.carga, arquivo: v.arquivo, em: v.em, n: 0 });
    p.n++;
  });
  const listaPlanilhas = Object.values(planilhas).sort((a, b) => b.em.localeCompare(a.em)).map(p => `
    <div class="qd-planilha-item"><span><b>${qdEsc(p.arquivo)}</b> · ${new Date(p.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${qdNum(p.n)} vínculos</span>
      <button class="btn btn-ghost btn-small" onclick="qdDesfazerPlanilha('${qdEsc(p.carga)}')">Desfazer esta planilha</button></div>`).join('');
  corpo.innerHTML = `
    <div class="panel qd-painel">
      <h3>Planilha de vínculos (em lote)</h3>
      <p class="qd-fraco">Diz de uma vez qual <b>Matrícula do DPO</b> é qual <b>Cód. RE do WFM</b>. Baixe a planilha atual, preencha ou corrija a coluna
        "Cod RE" (vale .csv ou .xlsx) e carregue de volta. Vale para esta e para as próximas cargas, inclusive de quem ainda vai entrar no quadro.</p>
      <div class="qd-linha-botao qd-planilha-acoes">
        <button class="btn btn-ghost btn-small" onclick="qdBaixarPlanilhaVinculos()">Baixar planilha atual</button>
        <input type="file" id="qd-arq-vinculos" accept=".csv,.txt,.xlsx,.xls" class="qd-arquivo">
        <button class="btn btn-primary btn-small" style="width:auto" onclick="qdLerPlanilhaVinculos()">Carregar planilha</button>
      </div>
      ${listaPlanilhas ? `<div class="qd-planilhas">${listaPlanilhas}</div>` : ''}
    </div>
    <p class="qd-explica">Cadastros do WFM com o <b>mesmo nome</b> de alguém do quadro, mas com <b>data de admissão diferente</b>
      (recontratação, transferência ou erro de digitação). Confirme uma vez: a decisão vale para as próximas cargas.</p>
    ${qd.pend.length ? `<p class="qd-explica">Em ordem de importância: <b>${qdNum(qd.pend.filter(p => p.relevante).length)}</b> envolvem alguém que está no quadro hoje;
      os outros <b>${qdNum(qd.pend.filter(p => !p.relevante).length)}</b> são de pessoas já desligadas no DPO (só afetam o histórico).</p>` : ''}
    ${lote.length ? `<div class="qd-lote"><div><b>${qdNum(lote.length)}</b> casos seguros: nome único no quadro e mesma situação nas duas bases.</div>
      <button class="btn btn-primary btn-small" style="width:auto" onclick="qdPerguntarLote()">Confirmar em lote…</button></div>` : ''}
    ${cartoes || '<div class="empty-state"><p>Nenhum vínculo esperando confirmação.</p></div>'}
    ${qd.pend.length > qd.limitePend ? `<div class="qd-rodape-tabela"><span>${qdNum(qd.limitePend)} de ${qdNum(qd.pend.length)}</span>
      <button class="btn btn-ghost btn-small" onclick="qd.limitePend += 30; qdRenderVinculos()">Mostrar mais 30</button></div>` : ''}
    ${decisoes ? `<div class="panel qd-painel"><h3>Decisões já tomadas <span class="qd-fraco">(${qdNum(todas.length)})</span></h3><div class="table-wrap"><table>
      <thead><tr><th>Cód. RE</th><th>Nome no WFM</th><th>Decisão</th><th>Como</th><th>Em</th><th></th></tr></thead><tbody>${decisoes}</tbody></table></div>
      ${todas.length > qd.limiteDec ? `<div class="qd-rodape-tabela"><span>${qdNum(qd.limiteDec)} de ${qdNum(todas.length)}</span>
        <button class="btn btn-ghost btn-small" onclick="qd.limiteDec += 100; qdRenderVinculos()">Mostrar mais 100</button></div>` : ''}</div>` : ''}`;
}

/* ---------------- planilha de vínculos (Matrícula DPO × Cód. RE WFM) ---------------- */
// Excel costuma comer os zeros à esquerda: compara sem eles
const qdSemZeros = v => String(v ?? '').trim().replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');
// Baixa o quadro com o Cód. RE de quem já está ligado; as linhas vazias são as que faltam preencher
function qdBaixarPlanilhaVinculos(){
  const lista = qd.func.filter(f => !f.fora_base)
    .sort((a, b) => (a.status === 'desligado') - (b.status === 'desligado') || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!lista.length) return showToast('Carregue o DPO primeiro.', 'erro');
  const cel = v => /[;"\n]/.test(String(v ?? '')) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v ?? '');
  const origem = { auto: 'Automático', confirmado: 'Confirmado na tela', planilha: 'Planilha' };
  const linhas = [['Matricula', 'Nome', 'Situacao DPO', 'Admissao DPO', 'Cod RE', 'Situacao WFM', 'Origem do vinculo'],
    ...lista.map(f => [f.matricula, f.nome, f.situacao, qdDataBr(f.admissao), f.wfm ? f.wfm.re : '', f.wfm ? f.wfm.situacao : '', origem[f.vinculo] || ''])];
  const blob = new Blob(['﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vinculos_dpo_wfm_${qdHoje()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// Lê a planilha, confere e mostra o resumo antes de gravar
async function qdLerPlanilhaVinculos(){
  const arq = qdEl('qd-arq-vinculos').files[0];
  if (!arq) return showToast('Escolha a planilha primeiro.', 'erro');
  try {
    const linhas = await qdLerArquivo(arq);
    const ehRe = h => /(^|[^A-Z])RE($|[^A-Z])/.test(h) && !h.includes('SITUACAO');
    const iCab = linhas.slice(0, 15).findIndex(l => l.some(c => qdNorm(c).includes('MATRIC')) && l.some(c => ehRe(qdNorm(c))));
    if (iCab < 0) throw new Error('Não achei as colunas "Matricula" e "Cod RE" na planilha.');
    const cab = linhas[iCab].map(qdNorm);
    const iM = cab.findIndex(c => c.includes('MATRIC')), iR = cab.findIndex(ehRe);
    const wfm = await qdTodos('wfm');
    const matReal = new Map(qd.func.map(f => [qdSemZeros(f.matricula), f.matricula]));
    const reReal = new Map(wfm.map(w => [qdSemZeros(w.re), w]));
    const porMat = new Map(qd.func.map(f => [f.matricula, f]));
    const porRe = new Map(), conflitos = new Set();
    let vazias = 0, jaLigados = 0;
    for (const l of linhas.slice(iCab + 1)) {
      const m0 = qdSemZeros(l[iM]), r0 = qdSemZeros(l[iR]);
      if (!m0 || !r0) { if (m0 || r0) vazias++; continue; }
      const m = matReal.get(m0) || m0, w = reReal.get(r0), re = w ? w.re : r0;
      if (porRe.has(re) && porRe.get(re).matricula !== m) conflitos.add(re);
      porRe.set(re, { re, matricula: m, nome: w ? w.nome : '' });
    }
    const itens = [...porRe.values()].filter(v => {
      const f = porMat.get(v.matricula);
      if (f && f.wfm && f.wfm.re === v.re) { jaLigados++; return false; } // já estava assim: não precisa gravar
      return true;
    });
    const agora = itens.filter(v => porMat.has(v.matricula) && reReal.has(qdSemZeros(v.re))).length;
    const trocas = itens.filter(v => { const f = porMat.get(v.matricula); return f && f.wfm; }).length;
    qd.planilha = { itens, arquivo: arq.name };
    qdModal('Carregar planilha de vínculos', `
      <p class="modal-text">Li a planilha <b>${qdEsc(arq.name)}</b>:</p>
      <ul class="qd-lista-regra">
        <li><b>${qdNum(itens.length)}</b> vínculos novos ou diferentes do que já existe;</li>
        <li><b>${qdNum(agora)}</b> valem já nesta base${itens.length - agora ? `; os outros <b>${qdNum(itens.length - agora)}</b> ficam guardados para quando a matrícula ou o Cód. RE aparecerem nas próximas cargas` : ''};</li>
        ${trocas ? `<li><b>${qdNum(trocas)}</b> trocam um Cód. RE que já estava ligado (a planilha passa a valer);</li>` : ''}
        <li>${qdNum(jaLigados)} já estavam ligados exatamente assim (nada muda).</li>
        ${vazias ? `<li>${qdNum(vazias)} linhas com só um dos dois campos preenchido foram ignoradas.</li>` : ''}
        ${conflitos.size ? `<li class="qd-aviso-mini">${qdNum(conflitos.size)} Cód. RE aparecem com matrículas diferentes; valeu a última linha.</li>` : ''}
      </ul>
      <p class="modal-text">Tudo pode ser desfeito depois com "Desfazer esta planilha".</p>
      <div class="modal-foot qd-foot-solto">
        <button class="btn btn-ghost" onclick="qdFecharModal()">Cancelar</button>
        <button class="btn btn-primary" style="width:auto"${itens.length ? '' : ' disabled'} onclick="qdGravarPlanilhaVinculos()">Gravar ${qdNum(itens.length)} vínculos</button>
      </div>`);
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}
async function qdGravarPlanilhaVinculos(){
  const p = qd.planilha;
  if (!p) return;
  const em = new Date().toISOString(), quem = session ? session.name : '';
  try {
    await qdGravar({ vinculos: p.itens.map(v => ({ ...v, em, quem, origem: 'planilha', carga: em, arquivo: p.arquivo })) });
    qd.planilha = null;
    qdFecharModal();
    await qdRecalcularPorVinculo();
    showToast(`${qdNum(p.itens.length)} vínculos gravados pela planilha.`);
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}
async function qdDesfazerPlanilha(carga){
  try {
    const alvo = qd.vinc.filter(v => v.carga === carga);
    await qdRemover('vinculos', alvo.map(v => v.re));
    await qdRecalcularPorVinculo();
    showToast(`Planilha desfeita: ${qdNum(alvo.length)} vínculos removidos.`);
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}
// Casos "seguros" para confirmar de uma vez: só UMA pessoa com aquele nome no quadro, ainda sem outro
// cadastro do WFM ligado, e a mesma situação nas duas bases (aviso prévio conta como ativo)
function qdLoteSeguro(){
  const porMat = new Map(qd.func.map(f => [f.matricula, f]));
  const lote = qd.pend.filter(p => {
    if (p.candidatos.length !== 1) return false;
    const c = p.candidatos[0], f = porMat.get(c.matricula);
    if (f && f.wfm) return false;
    const sd = qdStatusDpo(c.situacao);
    return (sd === 'aviso' ? 'ativo' : sd) === qdStatusWfm(p.situacao);
  });
  // Dois cadastros do WFM disputando a mesma pessoa não entram no lote (ficam para decidir um a um)
  const vezes = {};
  lote.forEach(p => vezes[p.candidatos[0].matricula] = (vezes[p.candidatos[0].matricula] || 0) + 1);
  return lote.filter(p => vezes[p.candidatos[0].matricula] === 1);
}
function qdPerguntarLote(){
  const lote = qdLoteSeguro();
  qdModal('Confirmar vínculos em lote', `
    <p class="modal-text">Vou ligar <b>${qdNum(lote.length)}</b> cadastros do WFM ao DPO. Em todos eles:</p>
    <ul class="qd-lista-regra">
      <li>só existe <b>uma pessoa</b> com aquele nome no quadro;</li>
      <li>essa pessoa ainda <b>não tem</b> outro cadastro do WFM ligado;</li>
      <li>a <b>situação é a mesma</b> nas duas bases (ex.: ativo e ativo).</li>
    </ul>
    <p class="modal-text">Só a data de admissão é diferente. Cada decisão pode ser desfeita depois, em "Decisões já tomadas".</p>
    <div class="modal-foot qd-foot-solto">
      <button class="btn btn-ghost" onclick="qdFecharModal()">Cancelar</button>
      <button class="btn btn-primary" style="width:auto" onclick="qdConfirmarLote()">Confirmar ${qdNum(lote.length)}</button>
    </div>`);
}
async function qdConfirmarLote(){
  const lote = qdLoteSeguro(), em = new Date().toISOString(), quem = session ? session.name : '';
  try {
    await qdGravar({ vinculos: lote.map(p => ({ re: p.re, matricula: p.candidatos[0].matricula, nome: p.nome, em, quem, lote: true })) });
    qdFecharModal();
    await qdRecalcularPorVinculo();
    showToast(`${qdNum(lote.length)} vínculos confirmados.`);
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}
async function qdDecidir(re, matricula){
  const p = qd.pend.find(x => x.re === re);
  try {
    await qdGravar({ vinculos: [{ re, matricula, nome: p ? p.nome : '', em: new Date().toISOString(), quem: session ? session.name : '' }] });
    await qdRecalcularPorVinculo();
    showToast(matricula ? `Cód. RE ${re} ligado à matrícula ${matricula}.` : `Cód. RE ${re} não será ligado.`);
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}
async function qdDesfazer(re){
  try {
    await qdRemover('vinculos', [re]);
    await qdRecalcularPorVinculo();
    showToast('Decisão desfeita. O cadastro voltou para a fila.');
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}
// Decisão de vínculo refaz o quadro sem nova carga; a mudança entra na foto da última data carregada
async function qdRecalcularPorVinculo(){ await qdRecalcularSemCarga('vinculo'); }
async function qdRecalcularSemCarga(tipo, texto){
  const datas = qd.cargas.map(c => c.data_base).sort();
  await qdRecalcular({ tipo, texto, dataBase: datas[datas.length - 1] || qdHoje() });
  await qdAbrir(false);
}
