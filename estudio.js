/* =====================================================================
   ESTÚDIO (fase 3 · etapa E1) — bases de dados para os relatórios
   Fluxo: escolher planilha → dizer o tipo de cada coluna → prévia → gravar.
   Tudo é tratado AQUI no navegador com o DuckDB (um "mini banco de análise"
   que roda dentro da página). O resultado vira um arquivo Parquet por dia,
   enviado direto ao Storage do Supabase por link assinado do servidor.
   Depende do script.js: API_URL, showToast, session, carregarLib, LIB_PLANILHA.
   ===================================================================== */

const LIB_DUCKDB = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm';

const EST_TIPOS = {
  texto: 'Texto',
  inteiro: 'Número inteiro',
  decimal: 'Número decimal',
  data: 'Data',
  data_hora: 'Data e hora',
  hora: 'Hora',
};

const est = {
  aba: 'bases',    // 'bases' ou 'relatorios'
  relatorios: [],  // relatórios do editor (estudio-editor.js)
  novoRel: false,  // formulário "Novo relatório" aberto
  bases: [],       // lista vinda do servidor
  duck: null,      // { duckdb, db, con } depois de carregado
  assist: null,    // assistente aberto: { modo, passo, base, arquivo, cols, linhas, previa, ... }
};

/* ---------------- ajudas ---------------- */
const estEl = id => document.getElementById(id);
const estEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const estNum = v => Number(v || 0).toLocaleString('pt-BR');
const estMb = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const estPct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
const estDataBr = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const estSqlTexto = s => "'" + String(s).replace(/'/g, "''") + "'";
// Nome interno de coluna: minúsculo, sem acento, só letras/números/_ (ex.: "cont pes" → cont_pes)
function estSlug(s){
  let n = String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!n) n = 'coluna';
  if (/^[0-9]/.test(n)) n = 'c_' + n;
  return n;
}

async function estApi(metodo, caminho, corpo){
  const resposta = await fetch(`${API_URL}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let json = null;
  try { json = await resposta.json(); } catch (e) {}
  if (!resposta.ok) throw new Error((json && json.erro) || `Erro ${resposta.status} no servidor.`);
  return json;
}

/* ---------------- DuckDB no navegador ---------------- */
// Funções de conversão (aceitam formatos do Brasil e números/datas do Excel).
// Importante para a velocidade: cada coluna vira NÚMERO uma vez só (n = est_num(v), etapa 1);
// data e hora recebem esse número pronto (etapa 2), em vez de recalcular dentro de cada função.
const EST_MACROS = String.raw`
create or replace macro est_txt(v) as nullif(trim(v), '');
create or replace macro est_num(v) as case
  when regexp_matches(v, '^\s*-?\d{1,3}(\.\d{3})+(,\d+)?\s*$') then try_cast(replace(replace(trim(v), '.', ''), ',', '.') as double)
  when regexp_matches(v, '^\s*-?\d+,\d+\s*$') then try_cast(replace(trim(v), ',', '.') as double)
  when regexp_matches(v, '^\s*-?\d+(\.\d+)?([eE]-?\d+)?\s*$') then try_cast(trim(v) as double)
  end;
create or replace macro est_data_n(v, n) as coalesce(
  -- ano com 2 dígitos ("08/10/26") usa %y; senão "26" seria lido como o ano 0026
  case when regexp_matches(regexp_extract(trim(v), '^[^ T]+'), '^\d{1,2}/\d{1,2}/\d{2}$')
       then try_strptime(regexp_extract(trim(v), '^[^ T]+'), '%d/%m/%y')::date
       else try_strptime(regexp_extract(trim(v), '^[^ T]+'), ['%d/%m/%Y', '%Y-%m-%d'])::date end,
  case when n between 20000 and 80000 then date '1899-12-30' + cast(floor(n) as integer) end);
create or replace macro est_min_n(v, n) as case
  when regexp_matches(v, '\d{1,2}:\d{2}') then (cast(regexp_extract(v, '(\d{1,2}):(\d{2})', 1) as integer) * 60 + cast(regexp_extract(v, '(\d{1,2}):(\d{2})', 2) as integer)) % 1440
  when n >= 0 then cast(round((n - floor(n)) * 1440) as integer) % 1440
  end;
create or replace macro est_hora_n(v, n) as time '00:00:00' + to_minutes(cast(est_min_n(v, n) as bigint));
create or replace macro est_data_hora_n(v, n) as est_data_n(v, n) + coalesce(
  case when regexp_matches(v, '\d{1,2}:\d{2}') or n <> floor(n) then est_hora_n(v, n) end, time '00:00:00');
`;

/* ---------------- análise das colunas (em JavaScript: uma passada só, rápida) ---------------- */
// Mesmas regras das funções SQL acima, para a SUGESTÃO de tipo bater com a conversão
const EST_RX = {
  milhar: /^-?\d{1,3}(\.\d{3})+(,\d+)?$/, virgula: /^-?\d+,\d+$/, ponto: /^-?\d+(\.\d+)?([eE]-?\d+)?$/,
  data: /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$|^(\d{4})-(\d{1,2})-(\d{1,2})$/, hora: /\d{1,2}:\d{2}/, soHora: /^\d{1,2}:\d{2}(:\d{2})?$/,
};
function estJsNum(s){
  if (EST_RX.milhar.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (EST_RX.virgula.test(s)) return parseFloat(s.replace(',', '.'));
  if (EST_RX.ponto.test(s)) return parseFloat(s);
  return null;
}
function estAnalisarJs(linhas, nCols){
  const z = () => ({ ne: 0, num: 0, int: 0, dtxt: 0, dnum: 0, dhTxt: 0, dhNum: 0, htxt: 0, hnum: 0, dist: 0, _d: new Set() });
  const st = Array.from({ length: nCols }, z);
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l) continue;
    for (let j = 0; j < nCols; j++) {
      const bruto = l[j];
      if (bruto === '' || bruto == null) continue;
      const s = typeof bruto === 'number' ? String(bruto) : String(bruto).trim();
      if (!s) continue;
      const x = st[j];
      x.ne++;
      if (x._d.size < 5000) x._d.add(s);
      const n = typeof bruto === 'number' ? bruto : estJsNum(s);
      if (n != null && !isNaN(n)) {
        x.num++;
        if (n === Math.floor(n)) x.int++;
        if (n >= 20000 && n <= 80000) { x.dnum++; if (n !== Math.floor(n)) x.dhNum++; }
        if (n >= 0 && n < 1) x.hnum++;
        continue;
      }
      const inicio = s.split(/[ T]/)[0];
      const temData = EST_RX.data.test(inicio), temHora = EST_RX.hora.test(s);
      if (temData && temHora) x.dhTxt++;
      else if (temData) x.dtxt++;
      if (EST_RX.soHora.test(s)) x.htxt++;
    }
  }
  return st.map(x => { x.dist = x._d.size; delete x._d; return x; });
}

async function estDuck(){
  if (est.duck) return est.duck;
  if (!est._duckP) {
    est._duckP = (async () => {
      const duckdb = await import(LIB_DUCKDB);
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(workerUrl));
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      const con = await db.connect();
      await con.query(EST_MACROS);
      return { duckdb, db, con };
    })().catch(e => { est._duckP = null; throw new Error('Não foi possível carregar o motor de dados (DuckDB). Verifique a internet. ' + e.message); });
  }
  est.duck = await est._duckP;
  return est.duck;
}
// Roda SQL e devolve linhas como objetos simples (números grandes viram Number)
async function estSql(sql){
  const { con } = await estDuck();
  const r = await con.query(sql);
  return r.toArray().map(linha => {
    const o = linha.toJSON();
    for (const k in o) if (typeof o[k] === 'bigint') o[k] = Number(o[k]);
    return o;
  });
}

/* ---------------- lista de bases ---------------- */
async function estAbrir(){
  if (!est.assist) estRender();
  try {
    [est.bases, est.relatorios] = await Promise.all([estApi('GET', '/api/estudio/bases'), estApi('GET', '/api/estudio/relatorios')]);
  } catch (erro) {
    showToast(erro.message, 'erro');
    est.bases = est.bases || []; est.relatorios = est.relatorios || [];
  }
  if (!est.assist) estRender();
}
// Bases de dados e Relatórios são subseções do menu lateral (Estúdio › …); trocar por aqui faz o menu acompanhar
function estTrocarAba(aba){ est.novoRel = false; if (typeof switchView === 'function') switchView('estudio', aba, true); else { est.aba = aba; estRender(); } }

// Botões que ficam no cabeçalho da tabela (canto direito), no lugar da antiga linha de título
const EST_ICONE_MAIS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

function estHtmlRelatorios(){
  const form = est.novoRel ? `
    <div class="panel est-painel est-novo-rel">
      <div class="field-row">
        <div class="field"><label>Nome do relatório</label><input id="est-rel-nome" class="caixa-alta" type="text" placeholder="Ex.: CSAT OPERAÇÃO"></div>
        <div class="field"><label>Base de dados</label>
          <select id="est-rel-base">${est.bases.map(b => `<option value="${b.id}">${estEsc(b.nome)} (${estNum(b.resumo.linhas)} linhas)</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Começar com</label>
        <select id="est-rel-modelo">
          <option value="sugerido">Modelo sugerido (cards no topo, gráficos à esquerda e tabela à direita)</option>
          <option value="z">Modelo em Z — do macro ao micro (resultado → meta → tendência → o que pesou → detalhe)</option>
          <option value="">Tela vazia</option>
        </select></div>
      <div class="est-rodape">
        <button class="btn btn-ghost" style="width:auto" onclick="est.novoRel=false; estRender()">Cancelar</button>
        <button class="btn btn-primary" style="width:auto" onclick="estCriarRelatorio()">Criar e abrir o editor</button>
      </div>
    </div>` : '';
  const ativos = est.relatorios.filter(r => !r.arquivado), nArq = est.relatorios.length - ativos.length;
  const linhas = ativos.map(r => `
    <tr>
      <td><div class="est-base-nome">${estEsc(r.nome)}</div></td>
      <td>${estEsc(r.base_nome)}</td>
      <td class="num">${r.guias}</td>
      <td class="num">${r.visuais}</td>
      <td>${new Date(r.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${r.publicado_em ? `<span class="badge badge-on">Publicado ${new Date(r.publicado_em).toLocaleDateString('pt-BR')}</span>` : '<span class="badge badge-off">Não publicado</span>'}</td>
      <td><div class="row-actions"><button class="btn btn-primary btn-small" style="width:auto" onclick="edAbrir(${r.id})">Editar</button>
        <button class="btn btn-danger-ghost btn-small" style="width:auto" onclick="estArquivarRelatorio(${r.id}, true)">Arquivar</button></div></td>
    </tr>`).join('');
  const botoes = `<span class="th-botoes">
      <button class="btn btn-ghost btn-small" onclick="estAbrirArquivados()" title="Relatórios arquivados (podem ser reativados)">Arquivados (${nArq})</button>
      <button class="btn btn-primary btn-small" onclick="estNovoRelatorio()" ${est.bases.length ? '' : 'disabled title="Crie uma base primeiro"'}>${EST_ICONE_MAIS} Novo relatório</button></span>`;
  return `
    ${form}
    <div class="panel tela-tabela">
      ${ativos.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Relatório</th><th>Base</th><th class="num">Guias</th><th class="num">Visuais</th><th>Atualizado</th><th>Publicação</th><th class="th-acao">${botoes}</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>`
      : `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
         <p>${est.bases.length ? (nArq ? 'Nenhum relatório ativo. Veja os <b>Arquivados</b> ou clique em <b>Novo relatório</b>.' : 'Nenhum relatório ainda. Clique em <b>Novo relatório</b>.') : 'Primeiro crie uma base em <b>Estúdio › Bases de dados</b>.'}</p>
         <div class="empty-acoes">${botoes}</div></div>`}
    </div>`;
}
// Arquivar = como "Descontinuar" em Relatórios: sai da lista (fica em Arquivados) e, se publicado, o card some para os usuários
async function estArquivarRelatorio(id, arquivar){
  const r = est.relatorios.find(x => x.id === id);
  if (arquivar && !confirm(`Arquivar o relatório "${r.nome}"?\n\nEle sai desta lista e pode ser reativado em "Arquivados".${r.publicado_em ? '\nComo está publicado, o card dele em Relatórios também será descontinuado (os usuários deixam de ver).' : ''}`)) return;
  try {
    const resp = await estApi('PATCH', `/api/estudio/relatorios/${id}/arquivar`, { arquivado: arquivar });
    showToast(arquivar ? `Relatório ${r.nome} arquivado.${resp.cardAtualizado ? ' O card foi descontinuado.' : ''}` : `Relatório ${r.nome} reativado.${resp.cardAtualizado ? ' O card voltou para Relatórios.' : ''}`);
    est.relatorios = await estApi('GET', '/api/estudio/relatorios');
    estRender();
    if (estEl('est-arquivados')) estAbrirArquivados();
    if (resp.cardAtualizado && typeof carregarRelatorios === 'function') carregarRelatorios();
  } catch (erro) { showToast(erro.message, 'erro'); }
}
function estAbrirArquivados(){
  let jan = estEl('est-arquivados');
  if (!jan) { jan = document.createElement('div'); jan.id = 'est-arquivados'; jan.className = 'modal-overlay active'; document.body.appendChild(jan); }
  const lista = est.relatorios.filter(r => r.arquivado);
  jan.innerHTML = `<div class="modal wide">
    <div class="modal-head"><h3>Relatórios arquivados</h3>
      <button class="btn-icon" onclick="estEl('est-arquivados').remove()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <div class="modal-body">${lista.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Relatório</th><th>Base</th><th>Arquivado em</th><th></th></tr></thead>
      <tbody>${lista.map(r => `<tr><td>${estEsc(r.nome)}</td><td style="color:var(--text-faint)">${estEsc(r.base_nome)}</td>
        <td style="color:var(--text-faint)">${r.arquivado_em ? new Date(r.arquivado_em).toLocaleDateString('pt-BR') : '—'}</td>
        <td><div class="row-actions"><button class="btn btn-ghost btn-small" onclick="estEl('est-arquivados').remove(); edAbrir(${r.id})">Editar</button>
          <button class="btn btn-ghost btn-small" onclick="estArquivarRelatorio(${r.id}, false)">Reativar</button></div></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty-state"><p>Nenhum relatório arquivado.</p></div>'}</div></div>`;
}
function estNovoRelatorio(){ est.novoRel = true; estRender(); setTimeout(() => { const i = estEl('est-rel-nome'); if (i) i.focus(); }, 0); }
async function estCriarRelatorio(){
  const nome = estEl('est-rel-nome').value.trim().toUpperCase();
  const base_id = Number(estEl('est-rel-base').value);
  const modelo = estEl('est-rel-modelo').value; // 'sugerido', 'z' ou '' (vazio)
  if (!nome) { showToast('Informe o nome do relatório.', 'erro'); return; }
  try {
    const { relatorio } = await estApi('POST', '/api/estudio/relatorios', { nome, base_id });
    est.novoRel = false;
    await edAbrir(relatorio.id, modelo);
  } catch (erro) { showToast(erro.message, 'erro'); }
}

function estRender(){
  const alvo = estEl('estudio-conteudo');
  if (!alvo) return;
  alvo.innerHTML = est.assist ? estHtmlAssistente()
    : (est.aba === 'relatorios' ? estHtmlRelatorios() : estHtmlLista());
  if (est.assist) estDepoisRender();
}

function estHtmlLista(){
  const linhas = est.bases.map(b => `
    <tr>
      <td><div class="est-base-nome">${estEsc(b.nome)}</div><div class="est-base-desc">${estEsc(b.descricao || '')}</div></td>
      <td class="num">${b.colunas.filter(c => c.manter).length}</td>
      <td>${b.resumo.dias ? estDataBr(b.resumo.de) + ' a ' + estDataBr(b.resumo.ate) : '—'}</td>
      <td class="num">${estNum(b.resumo.dias)}</td>
      <td class="num">${estNum(b.resumo.linhas)}</td>
      <td class="num">${b.resumo.bytes ? estMb(b.resumo.bytes) : '—'}</td>
      <td>${b.resumo.ultima_carga ? new Date(b.resumo.ultima_carga).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
      <td><div class="row-actions">${b.fonte === 'quadro'
        ? '<span class="badge badge-on" title="Lê o Quadro direto do banco (sempre atualizada); os dados entram pelas cargas do Quadro">Ligada ao Quadro</span>'
        : b.fonte === 'csat'
        ? '<span class="badge badge-on" title="Lê as avaliações do Painel CSAT direto do banco (um mês por vez); os dados entram pela importação do Painel CSAT">Ligada ao banco</span>'
        : `<button class="btn btn-primary btn-small" style="width:auto" onclick="estCarregarDados(${b.id})">Carregar dados</button>`}</div></td>
    </tr>`).join('');
  const botao = `<button class="btn btn-primary btn-small" onclick="estNovaBase()" title="Cada carga é tratada no seu navegador e guardada compactada, um arquivo por dia">${EST_ICONE_MAIS} Nova base</button>`;
  return `
    <div class="panel tela-tabela">
      ${est.bases.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Base</th><th class="num">Colunas</th><th>Período</th><th class="num">Dias</th><th class="num">Linhas</th><th class="num">Tamanho</th><th>Última carga</th><th class="th-acao">${botao}</th></tr></thead>
        <tbody>${linhas}</tbody></table></div>`
      : `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>
         <p>Nenhuma base ainda. Clique em <b>Nova base</b> e escolha uma planilha.</p><div class="empty-acoes">${botao}</div></div>`}
    </div>`;
}

/* ---------------- assistente (Nova base / Carregar dados) ---------------- */
function estNovaBase(){
  est.assist = { modo: 'nova', passo: 1, nome: '', descricao: '' };
  estRender();
}
async function estCarregarDados(id){
  try {
    const det = await estApi('GET', '/api/estudio/bases/' + id);
    est.assist = { modo: 'carga', passo: 1, base: det.base, diasExistentes: new Set(det.arquivos.map(a => a.dia)) };
    estRender();
  } catch (erro) { showToast(erro.message, 'erro'); }
}
function estCancelar(){
  if (est.assist && est.assist.gravando) return;
  est.assist = null;
  estRender();
  estAbrir();
}
function estIrPasso(p){
  est.assist.passo = p;
  estRender();
}

function estHtmlAssistente(){
  const a = est.assist;
  const passos = a.modo === 'nova' ? ['Arquivo', 'Colunas', 'Prévia', 'Gravar'] : ['Arquivo', 'Prévia', 'Gravar'];
  const atual = a.modo === 'nova' ? a.passo : ({ 1: 1, 3: 2, 4: 3 })[a.passo];
  const titulo = a.modo === 'nova' ? 'Nova base' : 'Carregar dados em ' + estEsc(a.base.nome);
  let corpo = '';
  if (a.passo === 1) corpo = estHtmlPasso1();
  if (a.passo === 2) corpo = estHtmlPasso2();
  if (a.passo === 3) corpo = estHtmlPasso3();
  if (a.passo === 4) corpo = estHtmlPasso4();
  return `
    <div class="est-topo">
      <div><h3>${titulo}</h3>
        <div class="est-passos">${passos.map((p, i) => `<span class="est-passo ${i + 1 === atual ? 'atual' : i + 1 < atual ? 'feito' : ''}">${i + 1}. ${p}</span>`).join('')}</div>
      </div>
      <button class="btn btn-ghost btn-small" style="width:auto" onclick="estCancelar()" ${a.gravando ? 'disabled' : ''}>Cancelar</button>
    </div>
    ${corpo}`;
}

// Passo 1: nome (base nova) e arquivo
function estHtmlPasso1(){
  const a = est.assist;
  const campos = a.modo === 'nova' ? `
    <div class="field-row est-campos">
      <div class="field"><label>Nome da base</label><input id="est-nome" class="caixa-alta" type="text" value="${estEsc(a.nome)}" placeholder="Ex.: CSAT GENESYS" oninput="est.assist.nome=this.value.toUpperCase()"></div>
      <div class="field"><label>Descrição (opcional)</label><input id="est-desc" class="caixa-alta" type="text" value="${estEsc(a.descricao)}" placeholder="Ex.: Pesquisas de satisfação, uma base por dia" oninput="est.assist.descricao=this.value.toUpperCase()"></div>
    </div>` : `
    <p class="modal-text">A planilha precisa ter as mesmas colunas da primeira carga (${a.base.colunas.filter(c => c.manter).length} colunas guardadas).
      ${a.base.chave ? 'Linhas repetidas (mesma chave) são atualizadas, sem duplicar.' : 'Esta base não tem chave: o dia enviado <b>substitui</b> o que já existe naquele dia.'}</p>`;
  return `
    <div class="panel est-painel">
      ${campos}
      <label class="csat-drop" id="est-drop">
        <input type="file" id="est-arquivo" accept=".xlsx,.xlsb,.xls,.csv" onchange="estEscolheuArquivo(event)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>
        <span class="btn btn-ghost btn-small">Selecionar planilha</span>
        <span class="csat-drop-sub">.xlsx, .xlsb ou .csv · ou arraste o arquivo para cá</span>
      </label>
      ${typeof LSW_DADOS !== 'undefined' ? `<div class="lsw-exemplo"><span>Não tem uma planilha à mão?</span>
        <button class="btn btn-ghost btn-small" id="lsw-usar-exemplo" style="width:auto" onclick="lswUsarPlanilhaExemplo()">Usar planilha de exemplo</button>
        <button class="link-btn" onclick="LSW_DADOS.baixarExemplo()">baixar para ver no Excel</button></div>` : ''}
      <div class="csat-status ${a.statusClasse || ''}" id="est-status">${a.status || ''}</div>
    </div>`;
}

function estDepoisRender(){
  const area = estEl('est-drop');
  if (area && !area._ok) {
    area._ok = true;
    ['dragenter', 'dragover'].forEach(t => area.addEventListener(t, e => { e.preventDefault(); area.classList.add('arrastando'); }));
    ['dragleave', 'drop'].forEach(t => area.addEventListener(t, e => { e.preventDefault(); area.classList.remove('arrastando'); }));
    area.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) estLerArquivo(f); });
  }
}
function estStatus(texto, classe){
  est.assist.status = texto; est.assist.statusClasse = classe || '';
  const el = estEl('est-status');
  if (el) { el.innerHTML = texto; el.className = 'csat-status ' + (classe || ''); }
}
function estEscolheuArquivo(ev){
  const f = ev.target.files[0];
  ev.target.value = '';
  if (f) estLerArquivo(f);
}

// Lê a planilha, carrega no DuckDB (tudo como texto) e analisa cada coluna
async function estLerArquivo(arquivo){
  const a = est.assist;
  if (a.modo === 'nova' && !String(a.nome).trim()) { showToast('Dê um nome para a base antes de escolher a planilha.', 'erro'); return; }
  try {
    estStatus(`Lendo "${estEsc(arquivo.name)}"…`, 'lendo');
    const [, buffer] = await Promise.all([carregarLib(LIB_PLANILHA), arquivo.arrayBuffer(), estDuck()]);
    await new Promise(r => setTimeout(r, 30));
    let wb;
    if (/\.csv$/i.test(arquivo.name)) {
      let texto;
      try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (e) { texto = new TextDecoder('windows-1252').decode(buffer); }
      wb = XLSX.read(texto.replace(/^﻿/, ''), { type: 'string', raw: true, dense: true });
    } else {
      wb = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true });
    }
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
    if (linhas.length < 2) throw new Error('a planilha está vazia.');
    const cab = linhas[0].map((c, i) => String(c ?? '').trim() || `Coluna ${i + 1}`);
    const nCols = Math.max(...linhas.slice(0, 200).map(l => l.length), cab.length);
    while (cab.length < nCols) cab.push(`Coluna ${cab.length + 1}`);

    // CSV interno com cabeçalho c0..cN (os nomes originais ficam guardados aqui no navegador)
    estStatus(`Carregando ${estNum(linhas.length - 1)} linhas no motor de dados…`, 'lendo');
    // Número que já veio como número do Excel: escrito de um jeito que NUNCA pareça milhar brasileiro.
    // Ex.: 411.883 (TMA com 3 casas) viraria "411 mil" → escrevemos "411.8830", que continua valendo 411,883.
    const celula = v => {
      let s = typeof v === 'number' ? String(v) : String(v ?? '');
      if (typeof v === 'number' && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s += '0';
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const partes = [cab.map((_, i) => 'c' + i).join(',')];
    for (let i = 1; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l || l.every(v => v === '' || v == null)) continue; // linha totalmente vazia
      const campos = new Array(nCols);
      for (let j = 0; j < nCols; j++) campos[j] = celula(l[j]);
      partes.push(campos.join(','));
    }
    const { db, con } = await estDuck();
    await db.registerFileText('bruta.csv', partes.join('\n'));
    await con.query(`create or replace table bruta as select row_number() over () as _linha, * from read_csv('bruta.csv', header=true, all_varchar=true, delim=',', quote='"', escape='"', null_padding=true)`);
    await db.dropFile('bruta.csv');
    const total = (await estSql('select count(*) n from bruta'))[0].n;

    a.arquivo = arquivo.name;
    a.cabecalho = cab;
    a.linhas = total;
    a.exemplos = cab.map((_, j) => {
      const vistos = [];
      for (let i = 1; i < linhas.length && vistos.length < 3; i++) {
        const v = String(linhas[i]?.[j] ?? '').trim();
        if (v && !vistos.includes(v)) vistos.push(v);
      }
      return vistos;
    });

    if (a.modo === 'nova') {
      estStatus(`Analisando o tipo de cada coluna (${cab.length} colunas)…`, 'lendo');
      await new Promise(r => setTimeout(r, 30));
      a.cols = estAnalisar(cab, linhas);
      a.colunaData = (a.cols.find(c => c.manter && c.tipo === 'data') || a.cols.find(c => c.manter && c.tipo === 'data_hora') || {}).nome || '';
      a.status = ''; a.passo = 2;
      estRender();
    } else {
      // Carga numa base existente: localiza cada coluna guardada pelo nome original
      const norm = s => estSlug(s);
      const faltando = [];
      a.cols = a.base.colunas.map(c => {
        let i = cab.indexOf(c.origem);
        if (i < 0) i = cab.findIndex(h => norm(h) === norm(c.origem));
        if (i < 0 && c.manter) faltando.push(c.origem);
        return { ...c, i };
      });
      if (faltando.length) throw new Error('a planilha não tem estas colunas da base: ' + faltando.join(', ') + '.');
      a.colunaData = a.base.coluna_data;
      await estMontarPrevia();
    }
  } catch (erro) {
    estStatus('Erro ao ler a planilha: ' + estEsc(erro.message), 'erro');
  }
}

// Sugere o tipo de cada coluna olhando a base INTEIRA (não só as primeiras linhas)
function estAnalisar(cab, linhas){
  const stats = estAnalisarJs(linhas, cab.length);
  const usados = new Set();
  return cab.map((origem, i) => {
    const s = stats[i];
    let nome = estSlug(origem), k = 2;
    while (usados.has(nome)) nome = estSlug(origem) + '_' + k++;
    usados.add(nome);
    const tipo = estSugerirTipo(origem, s);
    return { i, origem, nome, rotulo: origem, tipo, sugerido: tipo, manter: s.ne > 0, vazio: 'nulo', padrao: '', chave: false, s };
  });
}
function estSugerirTipo(origem, s){
  if (!s.ne) return 'texto';
  const N = String(origem).toUpperCase();
  const quase = n => n >= s.ne * 0.95;
  const pareceCodigo = /(^|[^A-Z])(ID|COD|CODIGO|MAT|MATRICULA|CPF|CNPJ|TEL|TELEFONE|ANI|DNIS|LOGIN|PROTOCOLO)([^A-Z]|$)/.test(N);
  const pareceData = /DATA|DT_|^DT|DIA/.test(N);
  const pareceHora = /HORA|HR_|INTERVAL|TURNO/.test(N);
  // números do Excel só contam como data quando o nome da coluna sugere data (senão um código 45000 viraria data)
  if (quase(s.dhTxt) || (pareceData && s.dhNum && quase(s.dhTxt + s.dhNum))) return 'data_hora';
  if (quase(s.dtxt) || (pareceData && quase(s.dtxt + s.dnum))) return 'data';
  if (quase(s.htxt) || (pareceHora && quase(s.htxt + s.hnum))) return 'hora';
  if (pareceCodigo) return 'texto';
  if (quase(s.int)) return 'inteiro';
  if (quase(s.num)) return 'decimal';
  return 'texto';
}
// Quantos valores (não vazios) de uma coluna servem no tipo escolhido
function estValidos(c){
  const s = c.s;
  const datas = s.dtxt + s.dhTxt + s.dnum; // data pura, data com hora em texto e número de série do Excel
  return { texto: s.ne, inteiro: s.int, decimal: s.num, data: datas, data_hora: datas, hora: s.htxt + s.hnum }[c.tipo];
}

// Expressão SQL (etapa 2) que converte a coluna no tipo escolhido, aplicando a regra de vazios.
// Usa c<i> (texto bruto) e n<i> (o mesmo valor já convertido em número na etapa 1, tabela "etapa1")
function estExpr(c){
  const v = `c${c.i}`, n = `n${c.i}`;
  const conv = {
    texto: `est_txt(${v})`,
    inteiro: `cast(round(${n}) as bigint)`,
    decimal: `${n}`,
    data: `est_data_n(${v}, ${n})`,
    data_hora: `est_data_hora_n(${v}, ${n})`,
    hora: `est_hora_n(${v}, ${n})`,
  }[c.tipo];
  if (c.vazio === 'zero' && ['inteiro', 'decimal'].includes(c.tipo)) return `coalesce(${conv}, 0)`;
  if (c.vazio === 'texto' && c.tipo === 'texto') return `coalesce(${conv}, ${estSqlTexto(c.padrao || 'SEM INFORMAÇÃO')})`;
  return conv;
}

// Passo 2: tabela de colunas (só base nova)
function estHtmlPasso2(){
  const a = est.assist;
  const opcoesData = a.cols.filter(c => c.manter && ['data', 'data_hora'].includes(c.tipo));
  const linhas = a.cols.map((c, k) => {
    const validos = estValidos(c), invalidos = c.s.ne - validos;
    const diag = c.s.ne === 0 ? '<span class="est-aviso">coluna vazia</span>'
      : `${estPct(validos, c.s.ne)} válidos${invalidos > 0 ? ` · <span class="est-aviso" title="Viram vazio ao gravar">${estNum(invalidos)} inválidos</span>` : ''}${c.s.ne < a.linhas ? ` · ${estNum(a.linhas - c.s.ne)} vazios` : ''}`;
    const vazioSel = ['inteiro', 'decimal'].includes(c.tipo)
      ? `<select onchange="estMudaCol(${k},'vazio',this.value)"><option value="nulo" ${c.vazio === 'nulo' ? 'selected' : ''}>Deixar vazio</option><option value="zero" ${c.vazio === 'zero' ? 'selected' : ''}>Virar 0</option></select>`
      : c.tipo === 'texto'
        ? `<select onchange="estMudaCol(${k},'vazio',this.value)"><option value="nulo" ${c.vazio === 'nulo' ? 'selected' : ''}>Deixar vazio</option><option value="texto" ${c.vazio === 'texto' ? 'selected' : ''}>Virar texto…</option></select>
           ${c.vazio === 'texto' ? `<input class="est-padrao" type="text" value="${estEsc(c.padrao)}" placeholder="Ex.: SEM SUPERVISOR" onchange="estMudaCol(${k},'padrao',this.value)">` : ''}`
        : '<span class="est-fraco">fica vazio</span>';
    return `<tr class="${c.manter ? '' : 'est-desligada'}">
      <td class="est-ck"><input type="checkbox" ${c.manter ? 'checked' : ''} onchange="estMudaCol(${k},'manter',this.checked)" title="Guardar esta coluna"></td>
      <td><div class="est-origem">${estEsc(c.origem)}</div><div class="est-exemplos">${a.exemplos[c.i].map(estEsc).join(' · ') || '—'}</div></td>
      <td><input class="est-rotulo" type="text" value="${estEsc(c.rotulo)}" onchange="estMudaCol(${k},'rotulo',this.value)"></td>
      <td><select onchange="estMudaCol(${k},'tipo',this.value)">${Object.entries(EST_TIPOS).map(([v, t]) => `<option value="${v}" ${c.tipo === v ? 'selected' : ''}>${t}${v === c.sugerido ? ' ✓' : ''}</option>`).join('')}</select></td>
      <td class="est-ck"><input type="checkbox" ${c.chave ? 'checked' : ''} ${c.manter ? '' : 'disabled'} onchange="estMudaCol(${k},'chave',this.checked)" title="Faz parte da chave"></td>
      <td>${vazioSel}</td>
      <td class="est-diag">${diag}</td>
    </tr>`;
  }).join('');
  return `
    <div class="panel est-painel">
      <p class="modal-text"><b>${estEsc(a.arquivo)}</b>: ${estNum(a.linhas)} linhas e ${a.cols.length} colunas. O tipo marcado com ✓ é a sugestão do sistema (ele leu a base inteira).
        Desmarque as colunas que não precisa guardar: a base fica menor e os relatórios abrem mais rápido.</p>
      <div class="field-row est-campos">
        <div class="field"><label>Coluna que define o dia</label>
          <select id="est-coluna-data" onchange="est.assist.colunaData=this.value">
            ${opcoesData.length ? opcoesData.map(c => `<option value="${c.nome}" ${c.nome === a.colunaData ? 'selected' : ''}>${estEsc(c.rotulo)} (${EST_TIPOS[c.tipo]})</option>`).join('') : '<option value="">Nenhuma coluna do tipo Data</option>'}
          </select>
          <div class="field-hint">A base é guardada em um arquivo por dia, usando esta coluna.</div></div>
        <div class="field"><label>Chave (opcional)</label>
          <div class="est-chave-resumo">${a.cols.filter(c => c.chave && c.manter).map(c => estEsc(c.rotulo)).join(' + ') || 'Nenhuma: ao carregar um dia de novo, ele é substituído inteiro.'}</div>
          <div class="field-hint">Marque na coluna "Chave" o que identifica uma linha (ex.: ID da conversa + operador). Repetidas são atualizadas, sem duplicar.</div></div>
      </div>
      <div class="est-tabela"><table>
        <thead><tr><th>Guardar</th><th>Coluna da planilha · exemplos</th><th>Nome no Estúdio</th><th>Tipo</th><th>Chave</th><th>Vazios e inválidos</th><th>Diagnóstico</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
      <div class="est-rodape">
        <button class="btn btn-ghost" style="width:auto" onclick="estIrPasso(1)">Voltar</button>
        <button class="btn btn-primary" style="width:auto" onclick="estContinuarColunas()">Ver prévia</button>
      </div>
    </div>`;
}
function estMudaCol(k, campo, valor){
  const a = est.assist, c = a.cols[k];
  c[campo] = valor;
  if (campo === 'manter' && !valor) c.chave = false;
  if (campo === 'tipo' || campo === 'manter') {
    const ok = a.cols.filter(x => x.manter && ['data', 'data_hora'].includes(x.tipo));
    if (!ok.some(x => x.nome === a.colunaData)) a.colunaData = (ok[0] || {}).nome || '';
  }
  if (campo === 'rotulo' || campo === 'padrao') return; // texto livre: não precisa redesenhar
  const rolagem = (document.querySelector('.est-tabela') || {}).scrollTop;
  estRender();
  if (rolagem) document.querySelector('.est-tabela').scrollTop = rolagem;
}
async function estContinuarColunas(){
  const a = est.assist;
  const sel = estEl('est-coluna-data');
  if (sel) a.colunaData = sel.value;
  if (!a.cols.some(c => c.manter)) { showToast('Escolha pelo menos uma coluna para guardar.', 'erro'); return; }
  if (!a.colunaData) { showToast('Escolha a coluna que define o dia (tipo Data ou Data e hora).', 'erro'); return; }
  try { await estMontarPrevia(); } catch (erro) { showToast(erro.message, 'erro'); }
}

// Monta a base tratada (tabela "tratada") e os números da prévia
async function estMontarPrevia(){
  const a = est.assist;
  estStatus('Montando a prévia…', 'lendo');
  const mantidas = a.cols.filter(c => c.manter);
  const chave = mantidas.filter(c => c.chave).map(c => `"${c.nome}"`);
  const colDia = mantidas.find(c => c.nome === a.colunaData);
  const exprDia = colDia.tipo === 'data_hora' ? `cast("${colDia.nome}" as date)` : `"${colDia.nome}"`;
  a.exprDia = exprDia;

  // Etapa 1: cada coluna não-texto vira número UMA vez (n<i>)
  const numericas = mantidas.filter(c => c.tipo !== 'texto');
  await estSql(`create or replace table etapa1 as select _linha, ${mantidas.map(c => `c${c.i}`).join(', ')}
    ${numericas.length ? ', ' + numericas.map(c => `est_num(c${c.i}) as n${c.i}`).join(', ') : ''} from bruta`);
  // Etapa 2: tipos finais
  await estSql(`create or replace table convertida as select _linha, ${mantidas.map(c => `${estExpr(c)} as "${c.nome}"`).join(', ')} from etapa1`);
  const sem = (await estSql(`select count(*) n from convertida where ${exprDia} is null`))[0].n;
  await estSql(`create or replace table tratada as select * from convertida where ${exprDia} is not null
    ${chave.length ? `qualify row_number() over (partition by ${chave.join(', ')} order by _linha desc) = 1` : ''}`);
  const gravadas = (await estSql('select count(*) n from tratada'))[0].n;
  const dias = await estSql(`select strftime(${exprDia}, '%Y-%m-%d') dia, count(*) n from tratada group by 1 order by 1`);

  // Inválidos por coluna (tinha valor, mas não serviu no tipo escolhido)
  const inv = mantidas.filter(c => c.tipo !== 'texto');
  let invalidos = [];
  if (inv.length) {
    // compara o texto bruto (etapa1) com o valor convertido (convertida), linha a linha
    const r = (await estSql(`select ${inv.map((c, k) => `count(case when est_txt(e.c${c.i}) is not null and v."${c.nome}" is null then 1 end) k${k}`).join(', ')}
      from etapa1 e join convertida v using (_linha)`))[0];
    invalidos = inv.map((c, k) => ({ c, n: r['k' + k] })).filter(x => x.n > 0);
    for (const x of invalidos) {
      x.ex = (await estSql(`select distinct e.c${x.c.i} v from etapa1 e join convertida v using (_linha)
        where est_txt(e.c${x.c.i}) is not null and v."${x.c.nome}" is null limit 3`)).map(o => o.v);
    }
  }
  const amostra = await estSql(`select ${mantidas.map(c => `cast("${c.nome}" as varchar) "${c.nome}"`).join(', ')} from tratada order by _linha limit 50`);
  a.previa = { lidas: a.linhas, semData: sem, duplicadas: a.linhas - sem - gravadas, gravadas, dias, invalidos, amostra, mantidas };
  a.status = '';
  a.passo = 3;
  estRender();
}

// Formata um valor da prévia conforme o tipo
function estFmt(v, tipo){
  if (v == null || v === '') return '<span class="est-fraco">vazio</span>';
  if (tipo === 'data') return estDataBr(v);
  if (tipo === 'data_hora') return estDataBr(v) + ' ' + v.slice(11, 16);
  if (tipo === 'hora') return v.slice(0, 5);
  if (tipo === 'decimal') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  if (tipo === 'inteiro') return Number(v).toLocaleString('pt-BR');
  return estEsc(v);
}

// Passo 3: prévia
function estHtmlPasso3(){
  const a = est.assist, p = a.previa;
  const existentes = a.diasExistentes || new Set();
  const temChave = a.modo === 'nova' ? a.cols.some(c => c.manter && c.chave) : !!(a.base.chave && a.base.chave.length);
  const cartao = (rot, val, sub, cls) => `<div class="csat-kpi ${cls || ''}"><div class="label">${rot}</div><div class="value">${val}</div><div class="sub">${sub || ''}</div></div>`;
  return `
    <div class="panel est-painel">
      <p class="modal-text"><b>${estEsc(a.arquivo)}</b> · prévia da base tratada. <b>Nada foi gravado ainda.</b></p>
      <div class="csat-kpis">
        ${cartao('Linhas lidas', estNum(p.lidas), '', 'k-t')}
        ${cartao('Serão gravadas', estNum(p.gravadas), `${p.dias.length} dia(s)`, 'k-p')}
        ${cartao('Sem data (descartadas)', estNum(p.semData), 'a coluna do dia veio vazia ou inválida', p.semData ? 'k-d' : '')}
        ${cartao('Repetidas (mesma chave)', estNum(p.duplicadas), temChave ? 'fica a última linha de cada chave' : 'sem chave definida', p.duplicadas ? 'k-n' : '')}
        ${cartao('Colunas', p.mantidas.length, 'guardadas', 'k-csat')}
      </div>
      ${p.invalidos.length ? `<div class="est-alerta"><b>Valores que não serviram no tipo escolhido</b> (serão gravados como vazio):
        <ul>${p.invalidos.map(x => `<li><b>${estEsc(x.c.rotulo)}</b> (${EST_TIPOS[x.c.tipo]}): ${estNum(x.n)} linha(s) · ex.: ${x.ex.map(v => '"' + estEsc(v) + '"').join(', ')}</li>`).join('')}</ul>
        ${a.modo === 'nova' ? 'Se estiver errado, volte e troque o tipo da coluna.' : ''}</div>` : ''}
      <div class="est-duas">
        <div>
          <h4>Dias desta carga</h4>
          <div class="est-tabela est-dias"><table><thead><tr><th>Dia</th><th class="num">Linhas</th><th>No banco</th></tr></thead><tbody>
            ${p.dias.map(d => `<tr><td>${estDataBr(d.dia)}</td><td class="num">${estNum(d.n)}</td><td>${existentes.has(d.dia)
              ? `<span class="badge ${temChave ? 'badge-admin' : 'badge-fora'}">${temChave ? 'já existe · será mesclado' : 'já existe · será substituído'}</span>`
              : '<span class="badge badge-on">novo</span>'}</td></tr>`).join('')}
          </tbody></table></div>
        </div>
        <div>
          <h4>Amostra (primeiras 50 linhas)</h4>
          <div class="est-tabela est-amostra"><table><thead><tr>${p.mantidas.map(c => `<th>${estEsc(c.rotulo)}<div class="est-tipo">${EST_TIPOS[c.tipo]}</div></th>`).join('')}</tr></thead><tbody>
            ${p.amostra.map(l => `<tr>${p.mantidas.map(c => `<td>${estFmt(l[c.nome], c.tipo)}</td>`).join('')}</tr>`).join('')}
          </tbody></table></div>
        </div>
      </div>
      <div class="est-rodape">
        <button class="btn btn-ghost" style="width:auto" onclick="estIrPasso(${a.modo === 'nova' ? 2 : 1})">Voltar</button>
        <button class="btn btn-primary" style="width:auto" onclick="estGravar()" ${p.gravadas ? '' : 'disabled'}>Gravar ${estNum(p.gravadas)} linhas</button>
      </div>
    </div>`;
}

// Passo 4: gravação
function estHtmlPasso4(){
  const a = est.assist;
  return `<div class="panel est-painel">
    <div class="csat-status ${a.statusClasse || ''}" id="est-status">${a.status || ''}</div>
    ${a.concluido ? `<div class="est-rodape"><button class="btn btn-primary" style="width:auto" onclick="estCancelar()">Voltar para as bases</button></div>` : ''}
  </div>`;
}

// Grava: cria a base (se nova) e envia um Parquet por dia (mesclando com o que já existe, se houver chave)
async function estGravar(){
  const a = est.assist, p = a.previa;
  a.gravando = true; a.passo = 4; a.concluido = false;
  estRender();
  const resumoDias = [];
  try {
    let base = a.base;
    if (a.modo === 'nova') {
      estStatus('Criando a base…', 'lendo');
      const colunas = a.cols.map(c => ({ origem: c.origem, nome: c.nome, rotulo: String(c.rotulo || c.origem).trim(), tipo: c.tipo, manter: !!c.manter, vazio: c.vazio, padrao: c.padrao || '' }));
      const chave = a.cols.filter(c => c.manter && c.chave).map(c => c.nome);
      base = (await estApi('POST', '/api/estudio/bases', { nome: a.nome, descricao: a.descricao, colunas, coluna_data: a.colunaData, chave })).base;
      a.base = base; a.modo = 'carga'; a.diasExistentes = new Set();
    }
    const chave = (base.chave || []).map(k => `"${k}"`);
    const dias = p.dias.map(d => d.dia);
    const existentes = dias.filter(d => a.diasExistentes.has(d));
    const [up, down] = await Promise.all([
      estApi('POST', `/api/estudio/bases/${base.id}/links-upload`, { dias }),
      chave.length && existentes.length ? estApi('POST', `/api/estudio/bases/${base.id}/links-download`, { dias: existentes }) : Promise.resolve({ links: {} }),
    ]);
    const { db } = await estDuck();
    const colsGravar = p.mantidas.map(c => `"${c.nome}"`).join(', ');

    for (let k = 0; k < dias.length; k++) {
      const dia = dias[k];
      estStatus(`Gravando dia ${estDataBr(dia)} (${k + 1} de ${dias.length})…`, 'lendo');
      await estSql(`create or replace table dia_novo as select ${colsGravar}, 1 as _o, _linha from tratada where ${a.exprDia} = date '${dia}'`);
      if (chave.length && down.links[dia]) {
        // Já existe arquivo deste dia: baixa, junta e fica a versão nova de cada chave
        const resp = await fetch(down.links[dia]);
        if (!resp.ok) throw new Error(`não foi possível baixar o dia ${estDataBr(dia)} já gravado (${resp.status}).`);
        await db.registerFileBuffer('existente.parquet', new Uint8Array(await resp.arrayBuffer()));
        await estSql(`create or replace table dia_final as select ${colsGravar} from (
            select * from dia_novo
            union all by name
            select *, 0 as _o, 0 as _linha from read_parquet('existente.parquet'))
          qualify row_number() over (partition by ${chave.join(', ')} order by _o desc, _linha desc) = 1`);
        await db.dropFile('existente.parquet');
      } else {
        await estSql(`create or replace table dia_final as select ${colsGravar} from dia_novo`);
      }
      const linhasDia = (await estSql('select count(*) n from dia_final'))[0].n;
      await estSql(`copy dia_final to 'saida.parquet' (format parquet, compression zstd)`);
      const arquivo = await db.copyFileToBuffer('saida.parquet');
      await db.dropFile('saida.parquet');
      const envio = await fetch(up.links[dia], {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream', 'x-upsert': 'true', 'cache-control': 'max-age=3600', ...(up.apikey ? { apikey: up.apikey } : {}) },
        body: arquivo,
      });
      if (!envio.ok) throw new Error(`o envio do dia ${estDataBr(dia)} falhou (${envio.status}).`);
      resumoDias.push({ dia, linhas: linhasDia, bytes: arquivo.byteLength });
    }
    await estApi('POST', `/api/estudio/bases/${base.id}/cargas`, {
      arquivo: a.arquivo, linhas_lidas: p.lidas, linhas_gravadas: p.gravadas, descartadas: p.semData, duplicadas: p.duplicadas, dias: resumoDias,
    });
    const total = resumoDias.reduce((s, d) => s + d.bytes, 0);
    a.concluido = true;
    estStatus(`<b>Pronto!</b> ${resumoDias.length} dia(s) gravado(s) na base <b>${estEsc(base.nome)}</b> · ${estNum(p.gravadas)} linhas desta carga · ${estMb(total)} no total enviado.`, 'ok');
    showToast(`Base ${base.nome} atualizada.`, 'sucesso', 4000);
  } catch (erro) {
    // Se a falha foi no meio, os dias já enviados e registrados continuam válidos; carregar de novo não duplica (com chave) ou substitui (sem chave)
    if (resumoDias.length && a.base) {
      try { await estApi('POST', `/api/estudio/bases/${a.base.id}/cargas`, { arquivo: a.arquivo + ' (incompleta)', linhas_lidas: p.lidas, linhas_gravadas: resumoDias.reduce((s, d) => s + d.linhas, 0), descartadas: p.semData, duplicadas: p.duplicadas, dias: resumoDias }); } catch (e) {}
    }
    a.concluido = true;
    estStatus(`Erro ao gravar: ${estEsc(erro.message)}${resumoDias.length ? ` · ${resumoDias.length} dia(s) já foram gravados; carregue a planilha de novo para completar.` : ''}`, 'erro');
  } finally {
    a.gravando = false;
    estRender();
  }
}
