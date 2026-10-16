/* =====================================================================
   LSW_DashBi — JAVASCRIPT (todo o comportamento da página)
   Versão de demonstração: o "servidor" é o lsw-demo-api.js, que roda dentro do navegador.
   Seções com o título no formato  "/* ---------------- nome ---------------- *\/".
   ===================================================================== */

/* ---------------- marca (logo LSW, uma por paleta) ---------------- */
// O ícone do menu acompanha a paleta escolhida em Configurações (aurora, brasa ou oceano)
function updateSidebarLogo(){
  const img = document.getElementById('sidebar-logo');
  if(!img) return;
  img.src = `img/logo-icone-${(typeof prefs !== 'undefined' && prefs.paleta) || 'aurora'}.png`;
}

/* ---------------- endereço do servidor (back-end) ---------------- */
// Na demonstração não existe servidor de verdade: tudo que começa com "lsw-demo" é respondido
// pelo lsw-demo-api.js, aqui mesmo no navegador, e os dados ficam guardados neste computador.
const API_URL = 'lsw-demo';

/* ---------------- state ---------------- */
let session = null; // {name, role}
let sidebarCollapsed = false;
let editingReportId = null;
let editingUserId = null;

let reports = [];

let users = [];

let nextUserId = 4;

/* ---------------- helpers ---------------- */
function initials(name){
  const parts = name.trim().split(" ");
  return ((parts[0]?.[0]||"") + (parts[1]?.[0]||"")).toUpperCase();
}
// tipo: 'sucesso' (padrão, ícone ✓ verde) ou 'erro' (ícone ! vermelho)
// duracao: tempo na tela em milissegundos (mensagens longas podem pedir mais)
function showToast(msg, tipo = 'sucesso', duracao = 2400){
  const t = document.getElementById('toast');
  document.getElementById('toast-text').textContent = msg;
  t.classList.toggle('erro', tipo === 'erro');
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), duracao);
}

/* ---------------- maiúsculas / minúsculas nos campos ---------------- */
// Campos com class="caixa-alta" viram MAIÚSCULOS e com class="caixa-baixa" viram minúsculos
// enquanto a pessoa digita ou cola. Link e senha ficam de fora de propósito.
document.addEventListener('input', (e) => {
  const campo = e.target;
  if (campo.classList.contains('caixa-alta')) ajustarCaixa(campo, campo.value.toUpperCase());
  else if (campo.classList.contains('caixa-baixa')) ajustarCaixa(campo, campo.value.toLowerCase());
});
function ajustarCaixa(campo, novoValor){
  if (campo.value === novoValor) return;
  // Guarda a posição do cursor para ele não pular para o fim ao trocar o texto
  let inicio = null, fim = null;
  try { inicio = campo.selectionStart; fim = campo.selectionEnd; } catch(e) {}
  campo.value = novoValor;
  if (inicio !== null) campo.setSelectionRange(inicio, fim);
}

/* ---------------- auth ---------------- */
function togglePassword(){
  const p = document.getElementById('login-pass');
  p.type = p.type === 'password' ? 'text' : 'password';
}

// O login real (doLogin) fica no script.js
function doLogout(){
  // Apaga o "crachá" de acesso; sem ele, nenhuma rota protegida responde
  localStorage.removeItem('token');
  try { sessionStorage.setItem('lsw-ir-login', '1'); } catch (e) {} // LSW: ao recarregar, volta para a tela de entrada
  // Recarrega a página do zero: apaga da memória TUDO da sessão anterior
  // (listas de relatórios e usuários, janelas abertas). Sem isso, quem entrasse
  // depois no mesmo navegador poderia ver a lista do usuário anterior.
  location.reload();
}


/* ---------------- nav / theme -------------- */
// sub = subseção (Quadro: quadro · painel · solicitacoes · cargas · vinculos · modelos [Administração › Tickets])
const QD_SUBSECOES = { quadro: 'Quadro atual', painel: 'Painel', solicitacoes: 'Solicitações', cargas: 'Cargas', vinculos: 'Vínculos' };
// Permissão de cada subseção do Quadro (mesmas chaves do data-perm do menu e da árvore de Perfis)
const QD_PERM_SUB = { quadro: 'quadro.atual', painel: 'quadro.painel', solicitacoes: 'quadro.solicitacoes,quadro.analisar', cargas: 'quadro.cargas', vinculos: 'quadro.vinculos', modelos: 'admin.tickets' };
// semRecarregar: atalho dentro do próprio Quadro — só troca a subseção, sem reler os dados do armazenamento
function switchView(view, sub, semRecarregar){
  ['dashboard','reports','users','estudio','quadro','perfis','operacoes','settings','apresentacao','tutorial'].forEach(v=>{
    document.getElementById('view-'+v).classList.toggle('hidden', v!==view);
  });
  // Quadro: abre a subseção pedida se o perfil puder; senão, a primeira que ele pode ver
  if (view === 'quadro') {
    qd.aba = sub || qd.aba || 'quadro';
    if (!podeAlgum(QD_PERM_SUB[qd.aba] || 'quadro.atual')) qd.aba = Object.keys(QD_PERM_SUB).find(k => k !== 'modelos' && podeAlgum(QD_PERM_SUB[k])) || 'quadro';
  }
  // Estúdio: Bases de dados | Relatórios (subseções do menu). Clicar no menu sai do assistente de carga (se não estiver gravando)
  if (view === 'estudio') {
    if (sub && !semRecarregar && est.assist && !est.assist.gravando) est.assist = null;
    if (sub) { est.aba = sub; est.novoRel = false; }
    if (est.aba === 'relatorios' && !pode('estudio.relatorios')) est.aba = 'bases';
  }
  // Item ativo no menu: a seção e, nas subseções, a subseção (o grupo dela abre sozinho)
  const subAtual = view === 'quadro' ? qd.aba : view === 'estudio' ? est.aba : null;
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>{
    b.classList.toggle('active', b.dataset.view===view && (!b.dataset.sub || b.dataset.sub === subAtual));
  });
  document.querySelectorAll('.nav-grupo').forEach(g => { if (g.querySelector('.nav-item.active')) g.classList.add('aberto'); });
  // Cada tela começa do topo (a rolagem agora é da seção, não da página)
  { const sec = document.getElementById('view-' + view); if (sec) sec.scrollTop = 0; }
  // estudio.js e quadro.js carregam depois do script.js: só lê o estado deles quando a tela é deles
  const titles = { dashboard:'Dashboard', reports:'Relatórios', users:'Usuários', estudio: view === 'estudio' ? 'Estúdio · ' + (est.aba === 'relatorios' ? 'Relatórios' : 'Bases de dados') : '', perfis:'Administração · Perfis', operacoes:'Administração · Operações', settings:'Configurações', apresentacao:'Apresentação', tutorial:'Tutorial do Estúdio',
    quadro: view !== 'quadro' ? '' : qd.aba === 'modelos' ? 'Administração · Tickets' : 'Quadro · ' + (QD_SUBSECOES[qd.aba] || 'Quadro atual') };
  if (typeof lswAoTrocarTela === 'function') lswAoTrocarTela(view);
  // Estúdio (estudio.js): busca a lista de bases ao abrir
  if (view === 'estudio' && (pode('estudio.bases') || pode('estudio.relatorios'))) { if (semRecarregar) estRender(); else estAbrir(); }
  // Quadro (quadro.js): lê o quadro guardado neste navegador
  if (view === 'quadro' && session) { if (semRecarregar) qdRender(); else qdAbrir(); }
  // Administração › Perfis (admin-perfis.js)
  if (view === 'perfis' && pode('admin.perfis')) apAbrir();
  // Administração › Operações (admin-perfis.js)
  if (view === 'operacoes' && pode('admin.operacoes')) aoAbrir();
  if (view === 'settings') marcarPrefsNaTela();
  document.getElementById('session-title').textContent = titles[view];
  // Ao abrir Usuários, busca a lista de novo: assim pedidos de reset recentes aparecem
  if (view === 'users' && (pode('usuarios.gerenciar') || pode('usuarios.senha'))) carregarUsuarios();
}
// Grupo do menu (Quadro, Administração): abre/fecha as subseções. Com o menu recolhido, primeiro expande o menu.
function navGrupo(id){
  const g = document.getElementById(id);
  if (sidebarCollapsed) { toggleSidebar(); g.classList.add('aberto'); return; }
  g.classList.toggle('aberto');
}

/* ---------------- permissões do perfil de acesso (15/10/2026) ---------------- */
// session.perms vem do login (perfil de acesso). "*" = tudo. "quadro.*" = qualquer permissão do Quadro.
function pode(chave){
  if (!session || !session.perms) return false;
  if (session.perms.includes('*') || session.perms.includes(chave)) return true;
  if (chave.endsWith('.*')) { const g = chave.slice(0, -2); return session.perms.some(p => p === g || p.startsWith(g + '.')); }
  return false;
}
const podeAlgum = lista => String(lista).split(',').some(c => pode(c.trim()));
// Mostra no menu só o que o perfil pode usar (data-perm nos itens; grupo some se nenhuma subseção sobrar)
function aplicarPermissoesNoMenu(){
  document.querySelectorAll('.sidebar [data-perm]').forEach(el => {
    el.style.display = podeAlgum(el.dataset.perm) ? (el.classList.contains('nav-grupo') ? 'block' : 'flex') : 'none';
  });
  document.querySelectorAll('.sidebar .nav-grupo').forEach(g => {
    if (g.style.display !== 'none' && ![...g.querySelectorAll('.nav-subitem')].some(i => i.style.display !== 'none')) g.style.display = 'none';
  });
}
function toggleSidebar(){
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  document.getElementById('topbar').classList.toggle('collapsed', sidebarCollapsed);
  document.getElementById('main-area').classList.toggle('collapsed', sidebarCollapsed);
  updateSidebarLogo();
}
// Botão sol/lua do cabeçalho: alterna e GUARDA a escolha (igual a Configurações → Tema)
function toggleTheme(){
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  salvarPref('tema', isDark ? 'claro' : 'escuro');
}
// Aplica um tema na página ('dark' ou 'light'): cores, ícone sol/lua e logo
function aplicarTema(tema){
  const isDark = tema === 'dark';
  document.documentElement.setAttribute('data-theme', tema);
  document.getElementById('theme-icon-sun').classList.toggle('hidden', !isDark);
  document.getElementById('theme-icon-moon').classList.toggle('hidden', isDark);
  updateSidebarLogo();
  // O gráfico do painel CSAT pega as cores do tema na hora de desenhar: redesenha se estiver aberto
  if (csatAberto()) csatGrafico();
  // Editor do Estúdio aberto: redesenha os gráficos com as cores do tema novo
  if (document.getElementById('ed-overlay') && typeof vzRenderTodos === 'function') vzRenderTodos();
}

/* ---------------- configurações (preferências pessoais) ---------------- */
// Ficam salvas no localStorage DESTE navegador. Só mudam a aparência, nunca dados.
const PREFS_PADRAO = { tema: 'escuro', fonte: 'padrao', menu: 'expandido', paleta: 'aurora' };
const ESCALA_FONTE = { pequena: 0.8, padrao: 0.9, grande: 1 }; // 1 = tamanho original
let prefs = lerPrefs();

function lerPrefs(){
  try {
    return { ...PREFS_PADRAO, ...JSON.parse(localStorage.getItem('lsw-prefs') || '{}') };
  } catch (e) {
    return { ...PREFS_PADRAO }; // se o navegador bloquear o armazenamento, usa o padrão
  }
}

function salvarPref(chave, valor){
  prefs[chave] = valor;
  try { localStorage.setItem('lsw-prefs', JSON.stringify(prefs)); } catch (e) {}
  aplicarPrefs();
  marcarPrefsNaTela();
}

function restaurarPrefs(){
  prefs = { ...PREFS_PADRAO };
  try { localStorage.removeItem('lsw-prefs'); } catch (e) {}
  aplicarPrefs();
  marcarPrefsNaTela();
  showToast('Configurações restauradas.');
}

// Coloca as preferências em prática (o "menu ao entrar" é aplicado no entrarNoSistema)
function aplicarPrefs(){
  const sistemaEscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const tema = prefs.tema === 'automatico' ? (sistemaEscuro ? 'dark' : 'light')
             : prefs.tema === 'claro' ? 'light' : 'dark';
  // Paleta de cores (aurora, brasa ou oceano): o lsw.css troca as cores de destaque conforme este atributo
  document.documentElement.setAttribute('data-paleta', prefs.paleta || 'aurora');
  aplicarTema(tema);
  document.documentElement.style.setProperty('--escala-fonte', ESCALA_FONTE[prefs.fonte] || ESCALA_FONTE.padrao);
}

// Destaca, na tela de Configurações, os botões das opções escolhidas
function marcarPrefsNaTela(){
  document.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.toggle('active', prefs[b.dataset.pref] === b.dataset.valor);
  });
}

// "Automático": se o Windows trocar de tema com a página aberta, acompanha na hora
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (prefs.tema === 'automatico') aplicarPrefs();
});

/* ---------------- dashboard ---------------- */
function renderDashboard(){
  const visibleReports = reports.filter(r=>r.visible).length;
  const grid = document.getElementById('stat-grid');
  const isAdmin = session.role === 'admin';
  grid.innerHTML = `
    <div class="stat-card"><div class="label">Relatórios publicados</div><div class="value">${reports.length}</div><div class="sub pos">${visibleReports} visíveis para usuários</div></div>
    <div class="stat-card"><div class="label">Relatórios visíveis para mim</div><div class="value">${isAdmin? reports.length : visibleReports}</div><div class="sub">Acesse em "Relatórios"</div></div>
    ${isAdmin ? `<div class="stat-card"><div class="label">Usuários cadastrados</div><div class="value">${users.length}</div><div class="sub">${users.filter(u=>u.active).length} ativos</div></div>` : ''}
    <div class="stat-card"><div class="label">Seu perfil</div><div class="value" style="font-size:18px;">${isAdmin?'Administrador':'Usuário'}</div><div class="sub">${isAdmin?'Acesso completo ao portal':'Acesso de leitura'}</div></div>
  `;

  const activity = [
    { text: 'Relatório "Vendas · Visão mensal" atualizado', who:'Ana Beatriz Souza', when:'há 2 dias', on:true },
    { text: 'Novo usuário criado', who:'Carlos Menezes', when:'há 5 dias', on:true },
    { text: 'Relatório "Indicadores de RH" ocultado', who:'Ana Beatriz Souza', when:'há 1 semana', on:false },
  ];
  document.getElementById('activity-list').innerHTML = activity.map(a=>`
    <div class="row-item">
      <div class="who"><span class="dot" style="background:${a.on? 'var(--success)':'var(--text-faint)'}"></span>
        <div class="rt"><div class="t1">${a.text}</div><div class="t2">por ${a.who}</div></div>
      </div>
      <div class="when">${a.when}</div>
    </div>
  `).join('');
}

/* ---------------- reports ---------------- */
function renderReports(filter){
  filter = (filter||'').toLowerCase();
  const isAdmin = pode('relatorios.publicar'); // quem gerencia relatórios (perfil de acesso)
  // Descontinuados nunca aparecem na tela principal (ficam só na janela "Descontinuados")
  const list = reports.filter(r => r.active && (isAdmin || r.visible) && r.title.toLowerCase().includes(filter));
  const grid = document.getElementById('reports-grid');

  // Botão "Descontinuados (n)": só para o admin
  document.getElementById('btn-discontinued').style.display = isAdmin || pode('relatorios.descontinuados') ? 'inline-flex' : 'none';
  document.getElementById('discontinued-count').textContent = reports.filter(r => !r.active).length;
  // Botão "Criar painel CSAT": só para o admin e só enquanto o card CSAT não existe (nem descontinuado)
  const temCardCsat = reports.some(r => r.tipo === 'csat');
  document.getElementById('btn-csat-novo').style.display = pode('csat.importar') && !temCardCsat ? 'inline-flex' : 'none';

  if(list.length===0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 19V9M10 19V5M16 19v-7"/></svg>
      <p>Nenhum relatório encontrado.</p>
    </div>`;
    return;
  }

  grid.innerHTML = list.map(r=>`
    <div class="report-card">
      <div class="report-thumb">
        <div class="bars"><i style="height:18px"></i><i style="height:30px"></i><i style="height:22px"></i><i style="height:36px"></i></div>
        ${r.tipo === 'csat' ? '<span class="thumb-tag">Painel do sistema</span>' : r.tipo === 'estudio' ? '<span class="thumb-tag">Estúdio</span>' : ''}
      </div>
      <div class="rc-body">
        <div class="rc-top">
          <h4>${r.title}</h4>
          ${isAdmin ? `<span class="badge ${r.visible?'badge-on':'badge-off'}">${r.visible?'Visível':'Oculto'}</span>` : ''}
        </div>
        <div class="rc-desc">${r.desc}</div>
        <div class="rc-meta"><span>${r.category}</span><span>Atualizado ${r.updated}</span></div>
      </div>
      <div class="rc-actions">
        <button class="btn btn-primary btn-small" onclick="openViewer(${r.id})">Abrir relatório</button>
        ${isAdmin ? `<button class="btn btn-ghost btn-small" onclick="editReport(${r.id})">Editar</button>` : ''}        ${isAdmin ? `<button class="btn btn-danger-ghost btn-small" onclick="setReportActive(${r.id}, false)">Descontinuar</button>` : ''}
      </div>
    </div>
  `).join('');
}

/* ---------------- relatórios descontinuados ---------------- */
function openDiscontinuedModal(){
  renderDiscontinued();
  openModal('modal-discontinued');
}

function renderDiscontinued(){
  const list = reports.filter(r => !r.active);
  const body = document.getElementById('discontinued-body');

  if(list.length === 0){
    body.innerHTML = `<div class="empty-state"><p>Nenhum relatório descontinuado.</p></div>`;
    return;
  }

  body.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Relatório</th><th>Categoria</th><th>Descontinuado em</th><th></th></tr>
        </thead>
        <tbody>
          ${list.map(r => `
            <tr>
              <td>${r.title}</td>
              <td style="color:var(--text-faint)">${r.category}</td>
              <td style="color:var(--text-faint)">${r.discontinued}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-ghost btn-small" onclick="openViewer(${r.id})">Visualizar</button>
                  <button class="btn btn-ghost btn-small" onclick="setReportActive(${r.id}, true)">Reativar</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

// ativo = false → descontinua; ativo = true → reativa
async function setReportActive(id, ativo){
  const r = reports.find(x => x.id === id);
  if(!ativo && !confirm(`Descontinuar o relatório "${r.title}"?\n\nEle sairá da tela de todos, mas poderá ser reativado em "Descontinuados".`)) return;

  try {
    const resposta = await fetch(`${API_URL}/api/relatorios/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ ativo })
    });
    const resultado = await resposta.json();

    if(!resposta.ok){
      showToast(resultado.erro || 'Erro ao atualizar o relatório.', 'erro');
      return;
    }

    showToast(ativo ? 'Relatório reativado.' : 'Relatório descontinuado.');
    await carregarRelatorios();
    // Se a janela "Descontinuados" estiver aberta, atualiza a tabela dela também
    if(document.getElementById('modal-discontinued').classList.contains('active')) renderDiscontinued();

  } catch (erro) {
    showToast('Erro de conexão ao atualizar o relatório.', 'erro');
  }
}

function openReportModal(){
  editingReportId = null;
  document.getElementById('report-modal-title').textContent = 'Publicar relatório';
  document.getElementById('rp-title').value = '';
  document.getElementById('rp-category').value = 'Comercial';
  document.getElementById('rp-link').value = '';
  document.getElementById('rp-desc').value = '';
  document.getElementById('rp-visible').checked = true;
  document.getElementById('rp-link-field').style.display = '';
  document.getElementById('rp-abrir-estudio').style.display = 'none';
  preencherOperacoesRelatorio([]);
  openModal('modal-report');
}
/* ---------------- perfis de acesso e operações (listas usadas nas janelas) ---------------- */
const acessos = { perfis: [], operacoes: [] };
async function apiJson(metodo, caminho, corpo){
  const r = await fetch(`${API_URL}${caminho}`, { method: metodo, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` }, body: corpo ? JSON.stringify(corpo) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((j && j.erro) || `Erro ${r.status} no servidor.`);
  return j;
}
async function carregarOperacoes(){ try { acessos.operacoes = await apiJson('GET', '/api/operacoes'); } catch (e) { acessos.operacoes = []; } return acessos.operacoes; }
async function carregarPerfisAcesso(){ try { acessos.perfis = await apiJson('GET', '/api/perfis'); } catch (e) { acessos.perfis = []; } return acessos.perfis; }
// Caixinhas das operações na janela do relatório (marcadas = operações que veem o card)
async function preencherOperacoesRelatorio(marcadas){
  const alvo = document.getElementById('rp-operacoes');
  alvo.innerHTML = '<span class="field-hint">carregando…</span>';
  const ops = await carregarOperacoes();
  const lista = operacoesParaEscolha(ops, marcadas);
  alvo.innerHTML = lista.length ? lista.map(o => `<label class="ops-item"><input type="checkbox" value="${o.id}" ${marcadas.includes(Number(o.id)) ? 'checked' : ''}> ${o.nome}</label>`).join('')
    : '<span class="field-hint">Nenhuma operação ativa (Administração › Operações).</span>';
}
// Operações oferecidas para escolher: só as ativas, mais as que já estão escolhidas (mesmo inativas)
const operacoesParaEscolha = (ops, escolhidas = []) => ops.filter(o => o.ativo !== false || escolhidas.map(Number).includes(Number(o.id)));
const operacoesMarcadas = () => [...document.querySelectorAll('#rp-operacoes input:checked')].map(i => Number(i.value));
// "+ Nova" operação (janela do usuário): cadastra e já deixa escolhida
async function novaOperacao(){
  const nome = (prompt('Nome da nova operação (ex.: CENTRAL ATENDE):') || '').trim().toUpperCase();
  if (!nome) return;
  try {
    const { operacao } = await apiJson('POST', '/api/operacoes', { nome });
    await carregarOperacoes();
    preencherSelectsUsuario(document.getElementById('us-role').value, operacao.id);
    showToast(`Operação ${operacao.nome} cadastrada.`);
  } catch (erro) { showToast(erro.message, 'erro'); }
}
// Listas da janela do usuário: perfis de acesso e operações
function preencherSelectsUsuario(perfilId, operacaoId){
  const sel = document.getElementById('us-role');
  sel.innerHTML = acessos.perfis.map(p => `<option value="${p.id}">${p.nome}${(p.permissoes || []).includes('*') ? ' — acesso total' : ''}</option>`).join('');
  if (perfilId) sel.value = String(perfilId);
  const op = document.getElementById('us-operacao');
  op.innerHTML = '<option value="">— sem operação —</option>' + operacoesParaEscolha(acessos.operacoes, operacaoId ? [operacaoId] : []).map(o => `<option value="${o.id}">${o.nome}</option>`).join('');
  op.value = operacaoId ? String(operacaoId) : '';
}
// Perfil de acesso de um usuário (os antigos, sem perfil escolhido, seguem a coluna "perfil")
function perfilDoUsuario(u){
  const porId = acessos.perfis.find(p => Number(p.id) === Number(u.perfilAcessoId));
  if (porId) return porId;
  return acessos.perfis.find(p => (p.permissoes || []).includes('*') === (u.role === 'admin') && p.sistema) || null;
}
function editReport(id){
  const r = reports.find(x=>x.id===id);
  editingReportId = id;
  document.getElementById('report-modal-title').textContent = 'Editar relatório';
  document.getElementById('rp-title').value = r.title;
  document.getElementById('rp-category').value = r.category;
  document.getElementById('rp-link').value = r.link;
  document.getElementById('rp-desc').value = r.desc;
  document.getElementById('rp-visible').checked = r.visible;
  // O Painel CSAT é feito no próprio sistema: não tem link de Power BI
  document.getElementById('rp-link-field').style.display = r.tipo === 'link' ? '' : 'none';
  // Painel CSAT e relatórios do Estúdio podem ser abertos no editor (Estúdio)
  document.getElementById('rp-abrir-estudio').style.display = r.tipo === 'csat' || r.tipo === 'estudio' ? '' : 'none';
  preencherOperacoesRelatorio(r.operacoes || []);
  openModal('modal-report');
}
function abrirNoEstudioDoModal(){
  const r = reports.find(x => x.id === editingReportId);
  closeModal('modal-report');
  if (r.tipo === 'csat') edAbrirCsatNoEditor();       // cria/abre o PAINEL CSAT (EDITOR) com a base ligada ao banco
  else if (r.tipo === 'estudio') edAbrir(r.estudioId); // abre o desenho em edição (não a versão publicada)
}
async function saveReport(){
  const title = document.getElementById('rp-title').value.trim().toUpperCase();
  if(!title){ showToast('Informe o nome do relatório.', 'erro'); return; }

  const corpo = {
    titulo: title,
    categoria: document.getElementById('rp-category').value,
    link: document.getElementById('rp-link').value.trim(),
    descricao: document.getElementById('rp-desc').value.trim().toUpperCase(),
    visivel: document.getElementById('rp-visible').checked,
    operacoes: operacoesMarcadas() // nenhuma = todas
  };

  // Se editingReportId tem um número, estamos EDITANDO; se é null, estamos CRIANDO
  const editando = editingReportId !== null;
  // Painel CSAT não usa link: não mexe nesse campo
  if (editando && reports.find(x => x.id === editingReportId)?.tipo !== 'link') delete corpo.link;
  const url = editando
    ? `${API_URL}/api/relatorios/${editingReportId}`
    : `${API_URL}/api/relatorios`;
  const metodo = editando ? 'PATCH' : 'POST';

  try {
    const resposta = await fetch(url, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(corpo)
    });
    const resultado = await resposta.json();

    if(!resposta.ok){
      showToast(resultado.erro || 'Erro ao salvar relatório.', 'erro');
      return;
    }

    showToast(editando ? 'Relatório atualizado.' : 'Relatório publicado.');
    closeModal('modal-report');
    await carregarRelatorios();

  } catch (erro) {
    showToast('Erro de conexão ao salvar o relatório.', 'erro');
  }
}

function openViewer(id){
  const r = reports.find(x=>x.id===id);
  // Painel CSAT: abre a tela própria do sistema em vez do visualizador de link
  if (r.tipo === 'csat') { closeModal('modal-discontinued'); abrirPainelCsat(); return; }
  // Relatório do Estúdio: abre a versão publicada, só para leitura (estudio-editor.js)
  if (r.tipo === 'estudio') { closeModal('modal-discontinued'); edAbrirLeitura(r.estudioId); return; }
  const iframe = document.getElementById('viewer-iframe');
  const placeholder = document.getElementById('viewer-placeholder');

  document.getElementById('viewer-title').textContent = r.title;
  document.getElementById('viewer-sub').textContent = r.category + ' · Power BI';

  if(r.link){
    // Tem link: carrega a página dentro do iframe e esconde o quadro tracejado
    iframe.src = r.link;
    iframe.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    // Sem link: mantém o quadro com a mensagem
    iframe.removeAttribute('src');
    iframe.style.display = 'none';
    placeholder.style.display = 'flex';
    document.getElementById('viewer-desc').textContent = 'Nenhum link de publicação foi configurado para este relatório ainda.';
  }
  document.getElementById('viewer-menu').classList.remove('open'); // o menu sempre começa fechado
  document.getElementById('viewer-overlay').classList.add('active');
}
function closeViewer(){
  // Limpa o iframe para o relatório parar de carregar em segundo plano
  document.getElementById('viewer-iframe').removeAttribute('src');
  document.getElementById('viewer-overlay').classList.remove('active');
}
function toggleViewerMenu(){
  document.getElementById('viewer-menu').classList.toggle('open');
}
// Atalho: a tecla Esc fecha o relatório aberto (no painel CSAT, primeiro fecha uma lista de filtro aberta)
// Página "Sobre o sistema" (ícone (i) no cabeçalho e link na tela de login): autoria e direitos
function abrirSobre(){ document.getElementById('sobre-overlay').classList.add('active'); }
function fecharSobre(){ document.getElementById('sobre-overlay').classList.remove('active'); }
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('sobre-overlay') && document.getElementById('sobre-overlay').classList.contains('active')) fecharSobre();
  else if (typeof qdModalAberto === 'function' && qdModalAberto()) qdFecharModal();
  else if (document.querySelector('#qd-pessoa .qd-pessoa')) qdFecharCartao(); // card flutuante do Quadro
  else if (document.getElementById('viewer-overlay').classList.contains('active')) closeViewer();
  else if (csatAberto()) {
    const listaAberta = document.querySelector('#csat-overlay .ms-pan:not(.hidden)');
    if (listaAberta) listaAberta.classList.add('hidden');
    else fecharPainelCsat();
  }
});

async function carregarRelatorios(){
  try {
    const resposta = await fetch(`${API_URL}/api/relatorios`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const dados = await resposta.json();

    if(!resposta.ok){
      console.error('Erro ao carregar relatórios:', dados.erro);
      return;
    }

    reports = dados.map(r => ({
      id: r.id,
      title: r.titulo,
      category: r.categoria,
      desc: r.descricao || 'Sem descrição.',
      link: r.link || '',
      tipo: r.tipo || 'link',   // 'csat' = Painel CSAT · 'estudio' = relatório montado no Estúdio (telas próprias do sistema)
      estudioId: r.estudio_relatorio_id || null,
      visible: r.visivel,
      operacoes: Array.isArray(r.operacoes) ? r.operacoes.map(Number) : [], // vazio = todas as operações
      active: r.ativo,
      discontinued: r.descontinuado_em ? new Date(r.descontinuado_em).toLocaleDateString('pt-BR') : '—',
      updated: new Date(r.atualizado_em).toLocaleDateString('pt-BR')
    }));

    renderReports();
    renderDashboard();
  } catch (erro) {
    console.error('Erro de conexão ao carregar relatórios:', erro);
  }
}

/* ---------------- users ---------------- */
async function carregarUsuarios(){
  try {
    const resposta = await fetch(`${API_URL}/api/usuarios`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const dados = await resposta.json();

    if(!resposta.ok){
      console.error('Erro ao carregar usuários:', dados.erro);
      return;
    }

    users = dados.map(u => ({
      id: u.id,
      name: u.nome || u.email.split('@')[0],
      email: u.email,
      role: u.perfil,
      perfilAcessoId: u.perfil_acesso_id || null,
      operacaoId: u.operacao_id || null,
      matricula: u.matricula,
      active: u.ativo,
      created: new Date(u.criado_em).toLocaleDateString('pt-BR'),
      provisoria: u.troca_senha_obrigatoria,   // ainda não trocou a senha provisória
      resetPedido: u.reset_solicitado_em ? new Date(u.reset_solicitado_em).toLocaleString('pt-BR') : null
    }));

    await Promise.all([carregarPerfisAcesso(), carregarOperacoes()]);
    renderUsers();
  } catch (erro) {
    console.error('Erro de conexão ao carregar usuários:', erro);
  }
}
function renderUsers(){
  document.getElementById('users-tbody').innerHTML = users.map(u=>`
    <tr>
      <td><div class="cell-user"><div class="avatar">${initials(u.name)}</div><div><div class="u-name">${u.name}</div><div class="u-email">${u.email}</div></div></div></td>
      <td style="color:var(--text-faint)">${u.matricula ?? '—'}</td>
      <td><span class="badge ${u.role==='admin'?'badge-admin':'badge-user'}">${(perfilDoUsuario(u) || {}).nome || (u.role==='admin'?'Administrador':'Usuário')}</span></td>
      <td>${(acessos.operacoes.find(o => Number(o.id) === Number(u.operacaoId)) || {}).nome || '<span style="color:var(--text-faint)">—</span>'}</td>
      <td>
        <div class="cell-status">
          <span class="badge ${u.active?'badge-on':'badge-off'}">${u.active?'Ativo':'Inativo'}</span>
          ${u.resetPedido ? `<span class="badge badge-reset" title="Pedido em ${u.resetPedido}">Reset solicitado</span>` : ''}
          ${u.provisoria && !u.resetPedido ? `<span class="badge badge-provisoria" title="Ainda não trocou a senha provisória">Senha provisória</span>` : ''}
        </div>
      </td>
      <td class="col-criado" style="color:var(--text-faint)">${u.created}</td>
      <td>
        <div class="row-actions">
          <!-- Resetar senha: em destaque (laranja) quando o usuário pediu -->
          <button class="btn ${u.resetPedido?'btn-primary':'btn-ghost'} btn-small" style="width:auto;" onclick="abrirResetSenha('${u.id}')">Resetar senha</button>
          <button class="btn btn-ghost btn-small" onclick="editUser('${u.id}')">Editar</button>
          <button class="btn ${u.active?'btn-danger-ghost':'btn-ghost'} btn-small" onclick="toggleUserStatus('${u.id}')">${u.active?'Desativar':'Ativar'}</button>        </div>
      </td>
    </tr>
  `).join('');

  // Contador no menu lateral: quantos pediram reset
  const pedidos = users.filter(u => u.resetPedido).length;
  const badge = document.getElementById('nav-reset-badge');
  badge.textContent = pedidos;
  badge.style.display = pedidos > 0 ? 'inline-flex' : 'none';
}

/* ---------------- senha: reset pelo admin ---------------- */
let resetUserId = null;

function abrirResetSenha(id){
  const u = users.find(x => x.id === id);
  resetUserId = id;
  document.getElementById('reset-modal-title').textContent = 'Resetar senha';
  document.getElementById('reset-modal-text').textContent = u.resetPedido
    ? `${u.name} pediu o reset em ${u.resetPedido}. Defina uma senha provisória e informe-a ao usuário.`
    : `Defina uma senha provisória para ${u.name} e informe-a ao usuário.`;
  document.getElementById('rs-senha').value = '';
  openModal('modal-reset');
}

async function confirmarResetSenha(){
  const senha = document.getElementById('rs-senha').value;
  if(!senha){ showToast('Informe a senha provisória.', 'erro'); return; }

  try {
    const resposta = await fetch(`${API_URL}/api/usuarios/${resetUserId}/resetar-senha`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ senha })
    });
    const resultado = await resposta.json();

    if(!resposta.ok){
      showToast(resultado.erro || 'Erro ao resetar a senha.', 'erro');
      return;
    }

    showToast('Senha resetada. O usuário deverá trocá-la no próximo login.');
    closeModal('modal-reset');
    await carregarUsuarios();

  } catch (erro) {
    showToast('Erro de conexão ao resetar a senha.', 'erro');
  }
}

/* ---------------- senha: "esqueci minha senha" (tela de login) ---------------- */
function abrirEsqueciSenha(){
  // Já traz o e-mail que a pessoa digitou no login, se houver
  document.getElementById('esq-email').value = document.getElementById('login-user').value.trim().toLowerCase();
  openModal('modal-esqueci');
}

async function solicitarReset(){
  const email = document.getElementById('esq-email').value.trim().toLowerCase();
  if(!email){ showToast('Informe o seu e-mail.', 'erro'); return; }

  try {
    const resposta = await fetch(`${API_URL}/api/solicitar-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const resultado = await resposta.json();

    if(!resposta.ok){
      showToast(resultado.erro || 'Erro ao enviar o pedido.', 'erro');
      return;
    }

    closeModal('modal-esqueci');
    showToast('Pedido enviado ao administrador.');

  } catch (erro) {
    showToast('Erro de conexão ao enviar o pedido.', 'erro');
  }
}

/* ---------------- senha: troca obrigatória no 1º login ---------------- */
let loginPendente = null; // resposta do login, guardada até a pessoa trocar a senha provisória

async function salvarNovaSenha(){
  const nova = document.getElementById('ts-nova').value;
  const confirma = document.getElementById('ts-confirma').value;

  if(!nova){ showToast('Informe a nova senha.', 'erro'); return; }
  if(nova !== confirma){ showToast('As duas senhas não são iguais.', 'erro'); return; }

  try {
    const resposta = await fetch(`${API_URL}/api/trocar-senha`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ novaSenha: nova })
    });
    const resultado = await resposta.json();

    if(!resposta.ok){
      showToast(resultado.erro || 'Erro ao trocar a senha.', 'erro');
      return;
    }

    closeModal('modal-trocar-senha');
    showToast('Senha alterada com sucesso!');
    entrarNoSistema(loginPendente);
    loginPendente = null;

  } catch (erro) {
    showToast('Erro de conexão ao trocar a senha.', 'erro');
  }
}

// "Sair" na janela de troca: desiste do login e volta para a tela inicial
function cancelarTrocaSenha(){
  localStorage.removeItem('token');
  loginPendente = null;
  closeModal('modal-trocar-senha');
}
//modal de criação de usuário
function openUserModal(){
  editingUserId = null;
  document.getElementById('user-modal-title').textContent = 'Novo usuário';
  document.getElementById('us-name').value = '';
  document.getElementById('us-matricula').value = '';
  document.getElementById('us-email').value = '';
  document.getElementById('us-email').disabled = false;
  document.getElementById('us-pass').value = '';
  document.getElementById('us-pass').disabled = false;
  preencherSelectsUsuario((acessos.perfis.find(p => p.sistema && !(p.permissoes || []).includes('*')) || acessos.perfis[0] || {}).id, null);
  document.getElementById('us-active').checked = true;
  openModal('modal-user');
}
function editUser(id){
  const u = users.find(x=>x.id===id);
  editingUserId = id;
  document.getElementById('user-modal-title').textContent = 'Editar usuário';
  document.getElementById('us-name').value = u.name;
  document.getElementById('us-matricula').value = u.matricula ?? '';
  document.getElementById('us-email').value = u.email;
  document.getElementById('us-email').disabled = false; // dá para corrigir um e-mail digitado errado (é o login dele)
  document.getElementById('us-pass').value = '';
  document.getElementById('us-pass').disabled = true;
  preencherSelectsUsuario((perfilDoUsuario(u) || {}).id, u.operacaoId);
  document.getElementById('us-active').checked = u.active;
  openModal('modal-user');
}
async function saveUser(){
  const name = document.getElementById('us-name').value.trim().toUpperCase();
  const email = document.getElementById('us-email').value.trim().toLowerCase();
  const perfilAcessoId = Number(document.getElementById('us-role').value) || null; // perfil de acesso (Administração › Perfis)
  const operacaoId = Number(document.getElementById('us-operacao').value) || null;
  const pass = document.getElementById('us-pass').value;
  if(!perfilAcessoId){ showToast('Escolha o perfil de acesso.', 'erro'); return; }

  if(!name || !email){ showToast('Preencha nome e e-mail.', 'erro'); return; }

  // EDITAR: agora chama o back-end de verdade (PATCH)
  if(editingUserId){
    const matriculaEdit = document.getElementById('us-matricula').value;
    if(!matriculaEdit){ showToast('Informe a matrícula do funcionário.', 'erro'); return; }

    try {
      const resposta = await fetch(`${API_URL}/api/usuarios/${editingUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          nome: name,
          perfil_acesso_id: perfilAcessoId,
          operacao_id: operacaoId,
          matricula: Number(matriculaEdit),
          ativo: document.getElementById('us-active').checked,
          // e-mail só vai quando mudou (o servidor troca também o login)
          ...(email !== (users.find(x => x.id === editingUserId) || {}).email ? { email } : {})
        })
      });
      const resultado = await resposta.json();

      if(!resposta.ok){
        showToast(resultado.erro || 'Erro ao atualizar usuário.', 'erro');
        return;
      }

      showToast('Usuário atualizado com sucesso!');
      closeModal('modal-user');
      await carregarUsuarios();
      renderDashboard();

    } catch (erro) {
      showToast('Erro de conexão ao atualizar o usuário.', 'erro');
    }
    return;
  }

  // CRIAR: agora chama o back-end de verdade
  const matricula = document.getElementById('us-matricula').value;
  if(!pass){ showToast('Defina uma senha provisória.', 'erro'); return; }
  if(!matricula){ showToast('Informe a matrícula do funcionário.', 'erro'); return; }

  try {
    const resposta = await fetch(`${API_URL}/api/usuarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ nome: name, email, senha: pass, perfil_acesso_id: perfilAcessoId, operacao_id: operacaoId, matricula: Number(matricula) })
    });
    const resultado = await resposta.json();

    if(!resposta.ok){
      showToast(resultado.erro || 'Erro ao criar usuário.', 'erro');
      return;
    }

    showToast('Usuário criado com sucesso!');
    closeModal('modal-user');

    // Agora que "Listar" está pronto, buscamos a lista de verdade de novo,
    // em vez de fingir localmente que o usuário foi adicionado.
    await carregarUsuarios();
    renderDashboard();

  } catch (erro) {
    showToast('Erro de conexão ao tentar criar o usuário.', 'erro');
  }
}
async function toggleUserStatus(id){
  const u = users.find(x=>x.id===id);
  const novoStatus = !u.active;

  try {
    const resposta = await fetch(`${API_URL}/api/usuarios/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ ativo: novoStatus })
    });
    const resultado = await resposta.json();

    if(!resposta.ok){
      showToast(resultado.erro || 'Erro ao atualizar status.', 'erro');
      return;
    }

    u.active = novoStatus;
    renderUsers();
    showToast(novoStatus ? 'Usuário ativado.' : 'Usuário desativado.');

  } catch (erro) {
    showToast('Erro de conexão ao atualizar status.', 'erro');
  }
}
/* ---------------- painel CSAT (versão 2.0) ---------------- */
// Tela própria do sistema (não é iframe). Origem: FrontEnd/dashboards/csat.html.
// Os dados vêm do banco, UM MÊS por vez (GET /api/csat/dados) num formato compacto;
// filtros, contas e tabelas são feitos aqui no navegador, como no HTML original.
// Importação (só admin): o arquivo é lido aqui; "Salvar" envia em lotes de 2.000 e,
// na 1ª vez, o servidor cria o card "PAINEL CSAT" na seção Relatórios.

// Bibliotecas externas, carregadas só quando precisar (não pesam na abertura do sistema)
const LIB_GRAFICO = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
const LIB_PLANILHA = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const _libs = {};
function carregarLib(url){
  if (!_libs[url]) {
    _libs[url] = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = ok;
      s.onerror = () => { delete _libs[url]; falha(new Error('Não foi possível carregar um componente da internet. Verifique a conexão.')); };
      document.head.appendChild(s);
    });
  }
  return _libs[url];
}

const CSAT_LOTE = 2000; // avaliações por envio ao servidor
// Colunas da planilha: nome do cabeçalho e, se não achar, a posição (0 = coluna A)
// (-1 = coluna opcional: bases antigas não têm horário, e aí a visão Intrahora fica vazia)
const CSAT_COLS = { id:['ID CONVERSA',2], date:['DATA ATENDIMENTO',18], op:['NOME OPERADOR',23], sup:['NOME AVALIADOR',29],
  oper:['GRUPO OPTIMUS',31], loc:['LOCAL',32], sc:['PONTUACAO CSAT',40], ev:['CONT PES',41],
  hora:['HORA ATENDIMENTO',-1], dataHora:['DATA',-1], int30:['INTERVALOS 30MIN',-1] };
// EPS: SEDE, FILIAL RJ e FILIAL BH viram "PRÓPRIA"; os parceiros mantêm o próprio nome
const CSAT_LOCAIS_ELO = ['SEDE', 'FILIAL RJ', 'FILIAL BH'];
const CSAT_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const CSAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const csatFiltrosVazios = () => ({ oper:[], eps:[], loc:[], sup:[], date:[], hora:[] });
const csat = {
  dados: null,          // resposta do servidor (mês carregado)
  regs: [],             // avaliações do mês: {date, op, sup, oper, loc, n, t, h (minutos do intervalo ou null), hora (rótulo)}
  visao: 'dia',         // Visão Geral: 'dia' = Intraday (por dia) · 'hora' = Intrahora (por meia hora)
  filtrado: [],         // avaliações que passam nos filtros (usado nas exportações)
  f: csatFiltrosVazios(),
  meta: 90,             // meta na tela (o admin pode mudar)
  metaSalva: 90,        // meta gravada no banco
  aba: 'geral',
  pendente: null,       // base lida do arquivo, esperando "Salvar"
  previa: false,        // true = a tela mostra os dados do ARQUIVO (ainda não gravados), não os do banco
  grafico: null,
  salvando: false,
};

// ---- pequenas ajudas
const csatEl = id => document.getElementById(id);
const csatNorm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const csatEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csatPct = v => v.toFixed(1).replace('.', ',') + '%';
const csatNum = v => v.toLocaleString('pt-BR');
const csatEps = loc => CSAT_LOCAIS_ELO.includes(loc) ? 'PRÓPRIA' : loc;
const csatDiaChave = d => d.split('/').reverse().join(''); // DD/MM/AAAA → AAAAMMDD (para ordenar)
const csatNomeMes = m => { const [a, n] = m.split('-'); return CSAT_MESES[+n - 1] + '/' + a; };
// Intervalo de meia hora: minutos desde 00:00 → "08:30"; sem horário → "Sem horário"
const CSAT_SEM_HORA = 'Sem horário';
const csatHoraRotulo = m => m == null ? CSAT_SEM_HORA : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const csatHoraMinutos = rot => { if (rot === CSAT_SEM_HORA) return -1; const [h, m] = rot.split(':'); return +h * 60 + +m; };
const csatAdmin = () => pode('csat.importar'); // importar avaliações e meta (perfil de acesso)
function csatAberto(){ return csatEl('csat-overlay').classList.contains('active'); }

// Chamada ao servidor: devolve o JSON ou lança um erro com a mensagem do servidor
async function csatApi(metodo, caminho, corpo){
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

// ---- abrir / fechar / guias
async function abrirPainelCsat(){
  const admin = csatAdmin();
  const ov = csatEl('csat-overlay');
  ov.classList.toggle('modo-admin', admin);
  csatEl('csat-meta').readOnly = !admin;
  ov.classList.add('active');
  csatAba('geral');
  await csatCarregar(null);
  if (admin) csatCarregarHistorico();
  // Admin abrindo o painel pela 1ª vez (banco vazio): já vai para a Importação
  if (admin && !csat.regs.length && !csat.pendente) csatAba('imp');
}
function fecharPainelCsat(){
  if (csat.salvando) return; // não fecha no meio do envio
  if (csat.pendente) {
    if (!confirm('A base importada ainda não foi salva. Fechar e descartar a prévia?')) return;
    csatLimparPendente();
  }
  csatEl('csat-overlay').classList.remove('active');
}
function csatAba(aba){
  if (aba === 'imp' && !csatAdmin()) aba = 'geral';
  csat.aba = aba;
  document.querySelectorAll('.csat-tab').forEach(b => b.classList.toggle('active', b.dataset.aba === aba));
  document.querySelectorAll('.csat-aba').forEach(s => s.classList.toggle('active', s.id === 'csat-aba-' + aba));
  csatEl('csat-filtros').classList.toggle('hidden', aba === 'imp');
  csatAtualizarVazio();
  if (aba === 'geral' && csat.regs.length) csatGrafico(); // o gráfico só mede o espaço quando a guia está visível
}
function csatAtualizarVazio(){
  const semDados = !csat.regs.length;
  csatEl('csat-vazio').classList.toggle('hidden', !(semDados && csat.aba !== 'imp'));
  csatEl('csat-overlay').classList.toggle('sem-dados', semDados);
}

// Seletor de Mês: na prévia troca o mês DO ARQUIVO; fora dela, busca o mês no banco
function csatTrocarMes(mes){
  if (csat.previa) csatMostrarPrevia(mes);
  else csatCarregar(mes);
}

// ---- carregar um mês do banco
async function csatCarregar(mes){
  csat.previa = false;
  csatEl('csat-previa').classList.add('hidden');
  csatEl('csat-atualizado').textContent = 'Carregando...';
  try {
    const j = await csatApi('GET', '/api/csat/dados' + (mes ? '?mes=' + mes : ''));
    const metaAlterada = csat.meta !== csat.metaSalva; // meta mexida e ainda não salva: não desfaz
    csat.dados = j;
    csat.regs = csatDecodificar(j);
    csat.metaSalva = j.meta ?? 90;
    if (!metaAlterada) csat.meta = csat.metaSalva;
    csatEl('csat-meta').value = csat.meta;
    csatMarcarPendente();
    csat.f = csatFiltrosVazios();
    csatMontarFiltros();
    csatEl('csat-atualizado').textContent = j.ultima
      ? 'Base atualizada em ' + new Date(j.ultima.em).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' })
      : 'Nenhuma base salva ainda';
    csatEl('csat-vazio-texto').textContent = csatAdmin()
      ? 'Nenhuma avaliação salva ainda. Use a guia Importação para carregar a base.'
      : 'Nenhuma avaliação disponível ainda.';
    csatRender();
    csatAtualizarVazio();
  } catch (erro) {
    csatEl('csat-atualizado').textContent = 'Erro ao carregar';
    showToast(erro.message, 'erro');
  }
}

// Formato compacto do servidor → lista de avaliações. "" na lista de nomes = vazio no banco.
function csatDecodificar(j){
  if (!j || !j.mes || !j.linhas) return [];
  const [ano, mes] = j.mes.split('-');
  const sem = (lista, texto) => lista.map(v => v === '' ? texto : v);
  const sup = sem(j.dic.sup, 'Sem supervisor'), oper = sem(j.dic.oper, 'Sem operação'), loc = sem(j.dic.loc, 'Sem local');
  return j.linhas.map(([d, o, s, p, l, n, h]) => ({
    date: String(d).padStart(2, '0') + '/' + mes + '/' + ano,
    op: j.dic.op[o], sup: sup[s], oper: oper[p], loc: loc[l],
    n, t: n >= 4 ? 'P' : n === 3 ? 'N' : 'D',
    h: h ?? null, hora: csatHoraRotulo(h ?? null),
  }));
}

// ---- meta
function csatSetMeta(v){
  if (!csatAdmin()) { csatEl('csat-meta').value = csat.meta; return; }
  csat.meta = Math.max(0, Math.min(100, Math.round(v) || 0));
  csatEl('csat-meta').value = csat.meta;
  csatMarcarPendente();
  csatRender();
}
// Destaca o botão Salvar quando há algo para gravar (base nova ou meta alterada)
function csatMarcarPendente(){
  csatEl('csat-salvar').classList.toggle('pendente', !!csat.pendente || csat.meta !== csat.metaSalva);
}

// ---- filtros com várias escolhas (lista vazia = todos)
function csatMontarFiltros(){
  const uniq = f => [...new Set(csat.regs.map(f))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  csatMs('cf-oper', 'Todas as operações', uniq(r => r.oper), 'oper');
  csatMs('cf-eps', 'Todas as EPS', uniq(r => csatEps(r.loc)), 'eps');
  csatMs('cf-loc', 'Todos os locais', uniq(r => r.loc), 'loc');
  csatMs('cf-sup', 'Todos os supervisores', uniq(r => r.sup), 'sup');
  csatMs('cf-date', 'Todas as datas', [...new Set(csat.regs.map(r => r.date))].sort((a, b) => csatDiaChave(a).localeCompare(csatDiaChave(b))), 'date');
  // Horários em ordem do dia; "Sem horário" (bases antigas) por último
  csatMs('cf-hora', 'Todos os horários', [...new Set(csat.regs.map(r => r.hora))].sort((a, b) => (csatHoraMinutos(a) < 0 ? 1e4 : csatHoraMinutos(a)) - (csatHoraMinutos(b) < 0 ? 1e4 : csatHoraMinutos(b))), 'hora');
  // Mês: lista vinda do banco (mais recente primeiro)
  const meses = (csat.dados && csat.dados.meses) || [];
  csatEl('csat-mes').innerHTML = meses.length
    ? meses.map(m => `<option value="${m}" ${csat.dados.mes === m ? 'selected' : ''}>${csatNomeMes(m)}</option>`).join('')
    : '<option value="">—</option>';
}
function csatMs(id, rotulo, valores, chave){
  const el = csatEl(id);
  el._vals = valores; el._rot = rotulo; el._key = chave;
  const sel = new Set(csat.f[chave]);
  el.innerHTML = `<button type="button" class="ms-btn" onclick="csatMsAbrir('${id}')"></button>
    <div class="ms-pan hidden">
      <div class="ms-act"><a onclick="csatMsLimpar('${id}')">Limpar seleção</a></div>
      ${valores.map((v, i) => `<label><input type="checkbox" data-i="${i}" ${sel.has(v) ? 'checked' : ''} onchange="csatMsMudou('${id}')"> ${csatEsc(v)}</label>`).join('')}
    </div>`;
  csatMsRotulo(id);
}
function csatMsRotulo(id){
  const el = csatEl(id), sel = csat.f[el._key];
  el.querySelector('.ms-btn').textContent = sel.length === 0 ? el._rot : sel.length === 1 ? sel[0] : sel.length + ' selecionados';
  el.classList.toggle('ms-on', sel.length > 0);
}
function csatMsAbrir(id){
  document.querySelectorAll('#csat-overlay .ms-pan').forEach(p => { if (p.parentElement.id !== id) p.classList.add('hidden'); });
  csatEl(id).querySelector('.ms-pan').classList.toggle('hidden');
}
function csatMsMudou(id){
  const el = csatEl(id);
  csat.f[el._key] = [...el.querySelectorAll('input:checked')].map(c => el._vals[+c.dataset.i]);
  csatMsRotulo(id);
  csatRender();
}
function csatMsLimpar(id){
  const el = csatEl(id);
  csat.f[el._key] = [];
  el.querySelectorAll('input').forEach(c => c.checked = false);
  csatMsRotulo(id);
  csatRender();
}
function csatLimparFiltros(){
  csat.f = csatFiltrosVazios();
  csatMontarFiltros();
  csatRender();
}
// Clicar fora de uma lista de filtro fecha a lista
document.addEventListener('click', e => {
  document.querySelectorAll('#csat-overlay .ms-pan').forEach(p => { if (!p.parentElement.contains(e.target)) p.classList.add('hidden'); });
});

function csatFiltrar(ignorarData){
  const F = csat.f, tem = (lista, v) => !lista.length || lista.includes(v);
  return csat.regs.filter(r => tem(F.oper, r.oper) && tem(F.loc, r.loc) && tem(F.eps, csatEps(r.loc)) && tem(F.sup, r.sup) && tem(F.hora, r.hora) && (ignorarData || tem(F.date, r.date)));
}

// ---- contas
// CSAT = média ponderada das notas: 1=20%, 2=40%, 3=60%, 4=80%, 5=100%
function csatAgrupar(lista, chave){
  const g = {};
  for (const r of lista) {
    const x = g[r[chave]] || (g[r[chave]] = { k: r[chave], p:0, n:0, d:0, t:0, s:0, ops: new Set(), r });
    x.t++; x.s += r.n * 20; x[r.t.toLowerCase()]++; x.ops.add(r.op);
  }
  return Object.values(g).sort((a, b) => b.t - a.t);
}
const csatValor = o => o.t ? o.s / o.t : 0;

// ---- desenhar tudo (KPIs, tabelas e gráfico)
function csatRender(){
  const lista = csatFiltrar(false);
  csat.filtrado = lista;
  const T = lista.length, P = lista.filter(r => r.t === 'P').length, N = lista.filter(r => r.t === 'N').length, D = T - P - N;
  const valor = T ? lista.reduce((a, r) => a + r.n * 20, 0) / T : 0;
  const pctDe = q => T ? csatPct(q / T * 100) + ' do total' : '';

  csatEl('k-csat').textContent = T ? csatPct(valor) : '—';
  csatEl('k-csat-sub').innerHTML = T ? csatEtiqueta(valor) : '';
  csatEl('k-p').textContent = csatNum(P); csatEl('k-p-sub').textContent = pctDe(P);
  csatEl('k-n').textContent = csatNum(N); csatEl('k-n-sub').textContent = pctDe(N);
  csatEl('k-d').textContent = csatNum(D); csatEl('k-d-sub').textContent = pctDe(D);
  csatEl('k-t').textContent = csatNum(T);
  csatEl('k-t-sub').textContent = csat.dados && csat.dados.mes ? csatNomeMes(csat.dados.mes) : '';

  // Operadores
  const busca = csatNorm(csatEl('csat-b-op').value), st = csatEl('csat-st-op').value;
  const ops = csatAgrupar(lista, 'op').filter(o => {
    const c = csatValor(o);
    if (busca && !csatNorm(o.k + ' ' + o.r.sup).includes(busca)) return false;
    return !(st === 'IN' && c < csat.meta || st === 'OUT' && c >= csat.meta || st === 'D' && !o.d || st === 'P' && !o.p);
  });
  csatEl('csat-tb-op').innerHTML = ops.map(o => `<tr>
      <td class="forte">${csatEsc(o.k)}</td><td class="fraco">${csatEsc(o.r.sup)}</td><td class="fraco">${csatEsc(o.r.oper)}</td><td class="fraco">${csatEsc(o.r.loc)}</td>
      ${csatColunas(o)}</tr>`).join('') || csatLinhaVazia(10);

  // Supervisores e operações
  const grupo = (tbody, chave, buscaGrupo) => {
    csatEl(tbody).innerHTML = csatAgrupar(lista, chave)
      .filter(o => !buscaGrupo || csatNorm(o.k).includes(buscaGrupo))
      .map(o => `<tr><td class="forte">${csatEsc(o.k)}</td><td class="num fraco">${o.ops.size}</td>${csatColunas(o)}</tr>`).join('') || csatLinhaVazia(8);
  };
  grupo('csat-tb-sup', 'sup', csatNorm(csatEl('csat-b-sup').value));
  grupo('csat-tb-oper', 'oper', '');

  // Intrahora: uma linha por meia hora (soma dos dias filtrados), na ordem do dia
  const faixas = csatAgrupar(lista.filter(r => r.h != null), 'h').sort((a, b) => a.k - b.k);
  csatEl('csat-tb-hora').innerHTML = faixas.map(o => `<tr>
      <td class="forte">${csatHoraRotulo(o.k)} – ${csatHoraRotulo((o.k + 30) % 1440)}</td><td class="num fraco">${o.ops.size}</td>${csatColunas(o)}</tr>`).join('')
    || `<tr><td colspan="8" class="csat-sem-linhas">${csatSemHorarioTexto(lista)}</td></tr>`;

  if (csat.aba === 'geral' && csatAberto()) csatGrafico();
}
// Mensagem quando não há horário para a visão Intrahora
function csatSemHorarioTexto(lista){
  return lista.length && lista.every(r => r.h == null)
    ? 'Esta base não tem horário de atendimento. Importe a base com as colunas HORA_ATENDIMENTO / INTERVALOS_30MIN.'
    : 'Nenhum resultado para os filtros escolhidos.';
}

// ---- botão Intraday / Intrahora (Visão Geral)
function csatVisao(v){
  csat.visao = v;
  document.querySelectorAll('#csat-visao .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.visao === v));
  csatEl('csat-grafico-titulo').textContent = v === 'hora' ? 'CSAT por intervalo de 30 minutos' : 'Evolução do CSAT por dia';
  csatEl('csat-intra-panel').classList.toggle('hidden', v !== 'hora');
  csatGrafico();
}
// Colunas comuns das tabelas: avaliações, promotor, neutro, detrator, CSAT e status
function csatColunas(o){
  const c = csatValor(o);
  return `<td class="num">${csatNum(o.t)}</td><td class="num">${csatNum(o.p)}</td><td class="num">${csatNum(o.n)}</td><td class="num">${csatNum(o.d)}</td>
    <td class="num csat-valor ${c >= csat.meta ? 'ok' : 'fora'}">${csatPct(c)}</td><td>${csatEtiqueta(c)}</td>`;
}
function csatEtiqueta(c){
  return c >= csat.meta ? '<span class="badge badge-on">✓ Dentro da meta</span>' : '<span class="badge badge-fora">! Fora da meta</span>';
}
const csatLinhaVazia = cols => `<tr><td colspan="${cols}" class="csat-sem-linhas">Nenhum resultado para os filtros escolhidos.</td></tr>`;

// ---- gráfico + linha da meta
//   Intraday: CSAT por dia (ignora o filtro de datas, como no original)
//   Intrahora: CSAT por meia hora, somando os dias filtrados (respeita o filtro de datas)
async function csatGrafico(){
  if (!csat.regs.length) return;
  try { await carregarLib(LIB_GRAFICO); } catch (erro) { showToast(erro.message, 'erro'); return; }

  const porHora = csat.visao === 'hora';
  const base = porHora ? csatFiltrar(false) : csatFiltrar(true);
  const grupos = {};
  for (const r of base) {
    if (porHora && r.h == null) continue;
    const k = porHora ? r.h : r.date;
    const g = grupos[k] || (grupos[k] = { s:0, t:0 }); g.t++; g.s += r.n * 20;
  }
  let chaves = Object.keys(grupos).sort(porHora ? (a, b) => a - b : (a, b) => csatDiaChave(a).localeCompare(csatDiaChave(b)));
  // Intrahora: eixo com TODAS as meias horas entre a primeira e a última com dados.
  // Faixa sem avaliação fica como vão na linha (em vez de sumir e "colar" 10:30 com 23:30)
  if (porHora && chaves.length) {
    const ini = +chaves[0], fim = +chaves[chaves.length - 1];
    chaves = []; for (let m = ini; m <= fim; m += 30) chaves.push(String(m));
  }
  const rotulos = porHora ? chaves.map(k => csatHoraRotulo(+k)) : chaves;
  const dias = {}; chaves.forEach((k, i) => dias[rotulos[i]] = grupos[k]); // contagem por rótulo (para a dica do gráfico)
  const valores = chaves.map(k => grupos[k] ? +(grupos[k].s / grupos[k].t).toFixed(1) : null);

  // Dica ao lado do título: quantas avaliações ficaram de fora por não terem horário
  const semHora = porHora ? base.filter(r => r.h == null).length : 0;
  csatEl('csat-grafico-dica').textContent = porHora
    ? (semHora ? `${csatNum(semHora)} avaliações sem horário não entram nesta visão` : 'Soma dos dias filtrados, por faixa de meia hora')
    : 'O filtro de datas não se aplica ao gráfico';
  csatEl('csat-grafico-vazio').classList.toggle('hidden', !!chaves.length);
  csatEl('csat-grafico-vazio').textContent = csatSemHorarioTexto(base);
  if (!chaves.length) { if (csat.grafico) { csat.grafico.destroy(); csat.grafico = null; } return; }
  // Eixo de 65% a 100% para realçar a tendência; desce se algum dia ficar abaixo de 65%
  const minimo = Math.max(0, Math.min(65, Math.floor(Math.min(...valores.filter(v => v != null), csat.meta) / 5) * 5 - 5));

  const cor = nome => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  const ok = cor('--success'), fora = cor('--danger'), linha = cor('--accent'), texto = cor('--text-dim'), grade = cor('--border'), fundo = cor('--surface');

  if (csat.grafico) csat.grafico.destroy();
  csat.grafico = new Chart(csatEl('csat-grafico'), {
    type: 'line',
    data: {
      labels: porHora ? rotulos : rotulos.map(d => d.slice(0, 5)),
      datasets: [
        // monotone: a curva nunca passa do valor real entre dois pontos; spanGaps false: faixa sem dados = vão
        { label: 'CSAT', data: valores, borderColor: linha, backgroundColor: linha, borderWidth: 2, cubicInterpolationMode: 'monotone', spanGaps: false,
          pointRadius: 4, pointHoverRadius: 6, pointBorderWidth: 2, pointBorderColor: fundo,
          pointBackgroundColor: valores.map(v => v >= csat.meta ? ok : fora) },
        { label: `Meta (${csat.meta}%)`, data: rotulos.map(() => csat.meta), borderColor: texto, backgroundColor: texto, borderDash: [6, 5],
          borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { min: minimo, max: 100, ticks: { color: texto, callback: v => v + '%' }, grid: { color: grade }, border: { display: false } },
        x: { ticks: { color: texto }, grid: { display: false } },
      },
      plugins: {
        // Legenda desenhada como linha (cheia = CSAT, tracejada = meta), na cor de cada série
        legend: { position: 'top', align: 'end', labels: { color: texto, boxWidth: 26, boxHeight: 2 } },
        tooltip: {
          callbacks: {
            title: itens => porHora
              ? `${rotulos[itens[0].dataIndex]} – ${csatHoraRotulo((+chaves[itens[0].dataIndex] + 30) % 1440)}`
              : rotulos[itens[0].dataIndex],
            label: c => c.datasetIndex === 0
              ? (dias[rotulos[c.dataIndex]]
                  ? `CSAT ${csatPct(c.parsed.y)} · ${csatNum(dias[rotulos[c.dataIndex]].t)} avaliações · ${c.parsed.y >= csat.meta ? 'dentro da meta' : 'fora da meta'}`
                  : 'Sem avaliações nesta faixa')
              : `Meta ${csat.meta}%`,
          },
        },
      },
    },
  });
}

// ---- exportações (todos os perfis)
async function csatExportarExcel(){
  if (!csat.regs.length) { showToast('Não há dados para exportar.', 'erro'); return; }
  try { await carregarLib(LIB_PLANILHA); } catch (erro) { showToast(erro.message, 'erro'); return; }
  const lista = csat.filtrado, wb = XLSX.utils.book_new();
  const linha = (o, extra) => Object.assign({}, extra, { 'Avaliações': o.t, 'Promotores': o.p, 'Neutros': o.n, 'Detratores': o.d,
    'CSAT %': +csatValor(o).toFixed(1), 'Meta alcançada': csatValor(o) >= csat.meta ? 'Sim' : 'Não' });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(csatAgrupar(lista, 'op').map(o => linha(o, { 'Operador': o.k, 'Supervisor': o.r.sup, 'Operação': o.r.oper, 'Local': o.r.loc }))), 'Operadores');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(csatAgrupar(lista, 'sup').map(o => linha(o, { 'Supervisor': o.k, 'Operadores': o.ops.size }))), 'Supervisores');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(csatAgrupar(lista, 'oper').map(o => linha(o, { 'Operação': o.k, 'Operadores': o.ops.size }))), 'Operações');
  // Intrahora: só as avaliações com horário, na ordem do dia
  const faixas = csatAgrupar(lista.filter(r => r.h != null), 'h').sort((a, b) => a.k - b.k);
  if (faixas.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(faixas.map(o => linha(o, { 'Intervalo': csatHoraRotulo(o.k) + ' – ' + csatHoraRotulo((o.k + 30) % 1440), 'Operadores': o.ops.size }))), 'Intrahora');
  XLSX.writeFile(wb, `Relatorio_CSAT_${csat.dados.mes}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// Extrair detratores/promotores: o ID da conversa não vem no carregamento do mês (economia),
// então a lista é pedida ao servidor com os mesmos filtros da tela.
async function csatExportarDetalhe(tipo){
  if (!csat.regs.length) { showToast('Não há dados para exportar.', 'erro'); return; }
  const nome = { P: 'PROMOTOR', D: 'DETRATOR' }[tipo];
  const F = csat.f;
  const banco = (lista, texto) => lista.length ? lista.map(v => v === texto ? '' : v) : null; // "Sem ..." = vazio no banco
  // EPS e Local viram uma única lista de locais permitidos
  let locais = null;
  if (F.loc.length || F.eps.length) {
    const todos = [...new Set(csat.regs.map(r => r.loc))];
    locais = todos.filter(l => (!F.loc.length || F.loc.includes(l)) && (!F.eps.length || F.eps.includes(csatEps(l))))
                  .map(l => l === 'Sem local' ? '' : l);
    if (!locais.length) { showToast(`Nenhuma avaliação ${nome} para os filtros atuais.`, 'erro'); return; }
  }
  try {
    // Prévia: os dados ainda não estão no banco, então a lista sai do próprio arquivo (já tem o ID)
    const daPrevia = () => csat.filtrado.filter(r => r.t === tipo)
      .map(r => ({ id: r.id, data: r.date, hora: r.hora, op: r.op, sup: r.sup, oper: r.oper, loc: r.loc, nota: r.n }));
    const [, lista] = await Promise.all([
      carregarLib(LIB_PLANILHA),
      csat.previa ? daPrevia() : csatApi('POST', '/api/csat/detalhe', {
        mes: csat.dados.mes, tipo,
        operacoes: banco(F.oper, 'Sem operação'),
        supervisores: banco(F.sup, 'Sem supervisor'),
        locais,
        datas: F.date.length ? F.date.map(d => d.split('/').reverse().join('-')) : null,
        intervalos: F.hora.length ? F.hora.map(csatHoraMinutos) : null, // -1 = "Sem horário"
      }),
    ]);
    if (!lista.length) { showToast(`Nenhuma avaliação ${nome} para os filtros atuais.`, 'erro'); return; }
    const linhas = lista.map(r => ({ 'ID da conversa': r.id, 'Data': r.data, 'Intervalo (30 min)': r.hora || CSAT_SEM_HORA, 'Operador': r.op, 'Supervisor': r.sup,
      'Operação': r.oper, 'Local': r.loc, 'Nota (1 a 5)': r.nota, 'Classificação': nome }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Base_' + nome);
    XLSX.writeFile(wb, `Base_${nome}_CSAT_${csat.dados.mes}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (erro) {
    showToast(erro.message, 'erro');
  }
}

// ---- importação (só admin): lê o arquivo aqui no navegador; nada vai ao banco até clicar em Salvar
function csatImportar(ev){
  const arquivo = ev.target.files[0];
  ev.target.value = ''; // permite escolher o mesmo arquivo de novo
  if (arquivo) csatLerArquivo(arquivo);
}
async function csatLerArquivo(arquivo){
  const status = csatEl('csat-status');
  status.className = 'csat-status lendo';
  status.textContent = 'Lendo "' + arquivo.name + '"... aguarde';
  try {
    await carregarLib(LIB_PLANILHA);
    const buffer = await arquivo.arrayBuffer();
    await new Promise(r => setTimeout(r, 30)); // deixa a mensagem "Lendo..." aparecer antes do trabalho pesado
    let wb;
    if (/\.csv$/i.test(arquivo.name)) {
      // CSV: lido como texto puro (raw), senão a biblioteca entende 01/11/2026 como 11 de janeiro (padrão americano).
      // Aceita UTF-8 e também o formato do Excel brasileiro (Windows-1252), para os acentos não virarem "?"
      let textoCsv;
      try { textoCsv = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch (e) { textoCsv = new TextDecoder('windows-1252').decode(buffer); }
      wb = XLSX.read(textoCsv.replace(/^﻿/, ''), { type: 'string', raw: true, dense: true });
    } else {
      // Sem cellDates: datas e horas chegam como número do Excel. Isso evita o erro de fuso das horas
      // (datas "puras" de horário, em 1899, ganham minutos a mais no fuso do Brasil)
      wb = XLSX.read(new Uint8Array(buffer), { type: 'array', dense: true });
    }
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    if (linhas.length < 2) throw new Error('o arquivo está vazio');
    csat.pendente = csatTratarBase(linhas, arquivo.name);
    if (!csat.pendente.regs.length) throw new Error('nenhuma avaliação válida encontrada (confira as colunas e o "cont pes")');
    // Desde 09/10/2026 só entra a BASE INTRA (diária, com HORA_ATENDIMENTO / INTERVALOS_30MIN preenchidos)
    if (!csat.pendente.comHorario) {
      csat.pendente = null;
      throw new Error('esta não é a base intra. A base precisa ter a coluna HORA_ATENDIMENTO (ou INTERVALOS_30MIN) preenchida. Bases no formato antigo, sem horário, não são mais aceitas.');
    }
    csatMostrarPendente();
    csatMarcarPendente();
    // Mostra o relatório do arquivo ANTES de gravar: o admin confere e só então salva
    csatMostrarPrevia(null);
    csatAba('geral');
  } catch (erro) {
    csat.pendente = null;
    csatMarcarPendente();
    status.className = 'csat-status erro';
    status.textContent = 'Erro ao ler o arquivo: ' + erro.message;
  }
}

// Converte as linhas da planilha em avaliações prontas para o banco
function csatTratarBase(linhas, nomeArquivo){
  const cab = linhas[0].map(csatNorm), ix = {};
  for (const k in CSAT_COLS) { const i = cab.indexOf(CSAT_COLS[k][0]); ix[k] = i >= 0 ? i : CSAT_COLS[k][1]; }
  const txt = v => String(v ?? '').trim();
  const numero = v => parseFloat(String(v).replace(',', '.'));
  const porChave = new Map();
  let lidas = 0, ignoradas = 0, duplicadas = 0, comHorario = 0;

  for (let i = 1; i < linhas.length; i++) {
    const r = linhas[i];
    if (numero(r[ix.ev]) !== 1) continue; // só notas avaliadas ("cont pes" = 1)
    lidas++;
    const id = txt(r[ix.id]).toLowerCase();
    const data = csatDataIso(r[ix.date]);
    const sc = numero(r[ix.sc]);
    const nota = sc > 1 ? Math.round(sc) : Math.round(sc * 5); // aceita 0,2…1 (original) ou 1…5
    if (!CSAT_UUID.test(id) || !data || !(nota >= 1 && nota <= 5)) { ignoradas++; continue; }
    // Intervalo de 30 min = hora exata arredondada para baixo (09:24 → 09:00, 09:47 → 09:30).
    // Ordem: HORA_ATENDIMENTO → hora da coluna "Data" do Genesys ("05/10/26 12:04") → INTERVALOS_30MIN.
    // (Na base de 09/10/2026 a INTERVALOS_30MIN veio de hora em hora, por isso ela é só o último recurso.)
    const horaPropria = csatMinutos(r[ix.hora]) ?? csatMinutos(r[ix.int30]); // colunas da base intra
    if (horaPropria != null) comHorario++;
    const minutos = horaPropria ?? csatMinutos(r[ix.dataHora]);
    const h = minutos != null ? Math.floor(minutos / 30) * 30 : null;
    const reg = { i: id, o: txt(r[ix.op]) || 'Sem operador', d: data, s: txt(r[ix.sup]), p: txt(r[ix.oper]), l: txt(r[ix.loc]), n: nota, h };
    // Duplicidade: mesma conversa + mesmo operador. Fica a linha que tem supervisor.
    const chave = reg.i + '|' + reg.o, existente = porChave.get(chave);
    if (existente) { duplicadas++; if (!existente.s && reg.s) porChave.set(chave, reg); }
    else porChave.set(chave, reg);
  }
  const regs = [...porChave.values()];
  const datas = regs.map(r => r.d).sort();
  return { nome: nomeArquivo, regs, lidas, ignoradas, duplicadas, comHorario, de: datas[0], ate: datas[datas.length - 1] };
}
// Horário → minutos desde 00:00 (ou null). Aceita fração do dia do Excel (0,35 = 08:24),
// data+hora do Excel (46303,35), Date e texto "08:23" / "08/10/26 08:23".
function csatMinutos(v){
  if (v === '' || v == null) return null;
  if (v instanceof Date && !isNaN(v)) return v.getHours() * 60 + v.getMinutes();
  if (typeof v === 'number' && v >= 0) return Math.round((v % 1) * 1440) % 1440;
  const s = String(v).trim();
  const g = s.match(/(\d{1,2}):(\d{2})/);
  if (g) return (+g[1] * 60 + +g[2]) % 1440;
  // Só número puro ("0,35"); uma data sem hora ("05/10/26") NÃO vira meia-noite
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  return Math.round((parseFloat(s.replace(',', '.')) % 1) * 1440) % 1440;
}
// Aceita data do Excel (número ou Date), "AAAA-MM-DD..." e "DD/MM/AAAA ..." → "AAAA-MM-DD" (ou null)
function csatDataIso(v){
  const p2 = n => String(n).padStart(2, '0');
  let a, m, d;
  if (v instanceof Date && !isNaN(v)) {
    // cellDates do Excel vem na meia-noite local; somar 12h evita "voltar um dia" pelo fuso
    const x = new Date(v.getTime() + 12 * 3600e3); a = x.getFullYear(); m = x.getMonth() + 1; d = x.getDate();
  } else if (typeof v === 'number' && v > 0) {
    const x = new Date(Math.round((v - 25569) * 864e5)); a = x.getUTCFullYear(); m = x.getUTCMonth() + 1; d = x.getUTCDate();
  } else {
    const s = String(v || '').trim().split(/[ T]/)[0];
    let g;
    if ((g = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, a, m, d] = g;
    else if ((g = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [, d, m, a] = g;
    else return null;
  }
  a = +a; m = +m; d = +d;
  if (!(a > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return a + '-' + p2(m) + '-' + p2(d);
}
function csatMostrarPendente(){
  const p = csat.pendente, status = csatEl('csat-status');
  const br = iso => iso.split('-').reverse().join('/');
  status.className = 'csat-status ok';
  status.innerHTML = `<b>${csatEsc(p.nome)}</b> lido: <b>${csatNum(p.regs.length)}</b> avaliações prontas para salvar
    (${br(p.de)} a ${br(p.ate)}).<br>
    ${csatNum(p.duplicadas)} duplicidades removidas · ${csatNum(p.ignoradas)} linhas ignoradas (sem ID da conversa, data ou nota válidos).<br>
    A prévia está aberta nas outras guias. Confira e clique em <b>Salvar</b> para gravar no banco.`;
}

// ---- prévia: monta o painel com os dados do arquivo (um mês por vez, como no banco)
function csatMostrarPrevia(mes){
  const p = csat.pendente;
  if (!p) return;
  const meses = [...new Set(p.regs.map(r => r.d.slice(0, 7)))].sort().reverse();
  if (!meses.includes(mes)) mes = meses[0];
  csat.previa = true;
  csat.dados = { mes, meses, ultima: null };
  csat.regs = p.regs.filter(r => r.d.startsWith(mes)).map(r => ({
    id: r.i, date: r.d.split('-').reverse().join('/'), op: r.o,
    sup: r.s || 'Sem supervisor', oper: r.p || 'Sem operação', loc: r.l || 'Sem local',
    n: r.n, t: r.n >= 4 ? 'P' : r.n === 3 ? 'N' : 'D',
    h: r.h, hora: csatHoraRotulo(r.h),
  }));
  csat.f = csatFiltrosVazios();
  csatMontarFiltros();
  csatEl('csat-atualizado').textContent = 'Prévia do arquivo · não salva';
  csatEl('csat-previa-texto').innerHTML = `<b>Prévia</b> de "${csatEsc(p.nome)}": ${csatNum(p.regs.length)} avaliações que <b>ainda não estão no banco</b>. Confira as guias e salve.`;
  csatEl('csat-previa').classList.remove('hidden');
  csatRender();
  csatAtualizarVazio();
}
// Descartar: joga fora o arquivo lido e volta a mostrar o que está no banco
function csatDescartarPrevia(){
  csatLimparPendente();
  csatCarregar(null);
}
function csatLimparPendente(){
  csat.pendente = null;
  csat.previa = false;
  csatEl('csat-previa').classList.add('hidden');
  csatEl('csat-status').textContent = '';
  csatEl('csat-status').className = 'csat-status';
  csatMarcarPendente();
}
// Arrastar e soltar o arquivo na área de importação
(() => {
  const area = csatEl('csat-drop');
  ['dragenter', 'dragover'].forEach(t => area.addEventListener(t, e => { e.preventDefault(); area.classList.add('arrastando'); }));
  ['dragleave', 'drop'].forEach(t => area.addEventListener(t, e => { e.preventDefault(); area.classList.remove('arrastando'); }));
  area.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) csatLerArquivo(f); });
})();

// ---- Salvar (só admin): grava base + meta, cria o card na 1ª vez e volta para Relatórios
async function csatSalvar(){
  if (csat.salvando) return;
  const p = csat.pendente;
  if (!p && csat.meta === csat.metaSalva) {
    showToast('Nada para salvar: importe uma base ou altere a meta.', 'erro');
    return;
  }
  if (p && !p.regs.length) { showToast('A base lida não tem nenhuma avaliação válida.', 'erro'); return; }

  const botao = csatEl('csat-salvar');
  csat.salvando = true;
  botao.disabled = true;
  const total = { inseridas: 0, atualizadas: 0, sem_alteracao: 0 };
  let enviados = 0;
  try {
    botao.textContent = 'Salvando...';
    const { importacao } = await csatApi('POST', '/api/csat/importacoes', {
      arquivo: p ? p.nome : null, linhas_lidas: p ? p.lidas : 0, ignoradas: p ? p.ignoradas : 0, meta: csat.meta,
    });
    if (p) {
      for (let i = 0; i < p.regs.length; i += CSAT_LOTE) {
        botao.textContent = `Salvando ${Math.round(i / p.regs.length * 100)}%`;
        const r = await csatApi('POST', `/api/csat/importacoes/${importacao.id}/lote`, { linhas: p.regs.slice(i, i + CSAT_LOTE) });
        total.inseridas += r.inseridas; total.atualizadas += r.atualizadas; total.sem_alteracao += r.sem_alteracao;
        enviados = Math.min(i + CSAT_LOTE, p.regs.length);
      }
    }
    const fim = await csatApi('POST', `/api/csat/importacoes/${importacao.id}/concluir`);

    csatLimparPendente();
    csat.metaSalva = csat.meta;
    csat.salvando = false;
    fecharPainelCsat();
    switchView('reports');
    await carregarRelatorios();
    const resumo = p
      ? `${csatNum(total.inseridas)} novas, ${csatNum(total.atualizadas)} atualizadas, ${csatNum(total.sem_alteracao)} sem alteração.`
      : `Meta de ${csat.meta}% gravada.`;
    showToast((fim.cardCriado ? 'Card "PAINEL CSAT" criado em Relatórios. ' : 'Painel CSAT atualizado. ') + resumo, 'sucesso', 6000);
  } catch (erro) {
    const parcial = enviados ? ` ${csatNum(enviados)} de ${csatNum(p.regs.length)} avaliações já foram gravadas; clique em Salvar de novo para completar (nada será duplicado).` : '';
    showToast(erro.message + parcial, 'erro', 8000);
  } finally {
    csat.salvando = false;
    botao.disabled = false;
    botao.textContent = 'Salvar';
    csatMarcarPendente();
  }
}

// ---- histórico de salvamentos (só admin)
async function csatCarregarHistorico(){
  try {
    const lista = await csatApi('GET', '/api/csat/historico');
    csatEl('csat-tb-hist').innerHTML = lista.map(h => `<tr>
        <td>${new Date(h.importado_em).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' })}</td>
        <td class="fraco">${csatEsc(h.importado_por_nome)}</td>
        <td class="fraco" title="${csatEsc(h.arquivo || '')}">${h.arquivo ? csatEsc(h.arquivo) : '<i>só a meta</i>'}</td>
        <td class="num">${csatNum(h.inseridas)}</td><td class="num">${csatNum(h.atualizadas)}</td><td class="num">${csatNum(h.sem_alteracao)}</td>
        <td class="num">${h.meta ?? '—'}%</td></tr>`).join('')
      || '<tr><td colspan="7" class="csat-sem-linhas">Nenhum salvamento ainda.</td></tr>';
  } catch (erro) {
    csatEl('csat-tb-hist').innerHTML = `<tr><td colspan="7" class="csat-sem-linhas">${csatEsc(erro.message)}</td></tr>`;
  }
}

/* ---------------- modal utils ---------------- */
function openModal(id){ document.getElementById(id).classList.add('active'); }
function closeModal(id){ document.getElementById(id).classList.remove('active'); }
// Clicar fora de uma janela NÃO a fecha (evita perder o que foi digitado por um clique acidental).
// Fechar só pelo X ou pelos botões da própria janela (Cancelar, Salvar...).
document.getElementById('login-user').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
document.getElementById('login-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });

/* ---------------- login (POST /api/login) ---------------- */
async function doLogin() {
  const emailInput = document.getElementById('login-user').value.trim().toLowerCase();
  const passwordInput = document.getElementById('login-pass').value;
  const errorBox = document.getElementById('login-error');

  // Esconde caixa de erro caso estivesse visível
  if (errorBox) errorBox.style.display = 'none';

  try {
    const resposta = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: emailInput,
        password: passwordInput
      })
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      // Se a resposta for erro (400, 401, 500)
      console.error('Erro no login:', resultado.erro);
      if (errorBox) {
        errorBox.style.display = 'flex';
      }
      return;
    }

    // Sucesso!
    // Não mostramos o "resultado" inteiro aqui, porque ele contém o token
    console.log('Login efetuado com sucesso.');

    // 1. Guarda o token no localStorage, para usar nas próximas requisições
    localStorage.setItem('token', resultado.token);

    // 2. Senha provisória? Então a pessoa precisa criar a senha definitiva ANTES de entrar
    if (resultado.trocarSenha) {
      loginPendente = resultado;
      document.getElementById('ts-nova').value = '';
      document.getElementById('ts-confirma').value = '';
      openModal('modal-trocar-senha');
      return;
    }

    entrarNoSistema(resultado);

  } catch (erro) {
    console.error('Erro de conexão:', erro);
  }
}

// Monta a tela do sistema para o usuário que acabou de entrar
// (chamada pelo doLogin, ou depois da troca obrigatória de senha)
function entrarNoSistema(resultado) {
    // 1. Define quem é o usuário logado, usando o perfil de verdade vindo do banco
    // Permissões do perfil de acesso (servidor antigo, sem perfis: admin = tudo, usuário = relatórios)
    const perms = Array.isArray(resultado.permissoes) && resultado.permissoes.length ? resultado.permissoes : (resultado.perfil === 'admin' ? ['*'] : ['relatorios']);
    const isAdmin = perms.includes('*');
    session = { name: resultado.usuario.email, role: isAdmin ? 'admin' : 'usuario', perms, perfilNome: resultado.perfilNome || (isAdmin ? 'Administrador' : 'Usuário'), operacao: resultado.operacao || null };

    // 3. Troca a tela de login pela tela do sistema
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').classList.add('active');

    // 4. Preenche as informações do usuário na barra superior
    document.getElementById('user-name').textContent = session.name;
    document.getElementById('user-avatar').textContent = initials(session.name);
    document.getElementById('user-role-label').textContent = 'Perfil: ' + session.perfilNome + (session.operacao ? ' · ' + session.operacao.nome : '');
    document.getElementById('dash-greeting').textContent = 'Olá, ' + session.name.split('@')[0];

    // 5. Menu e botões conforme as permissões do perfil de acesso
    aplicarPermissoesNoMenu();
    // Contador de vínculos DPO × WFM. O quadro.js é carregado depois do script.js: se a pessoa entrar antes de ele terminar, conta no próximo instante
    if (pode('quadro.vinculos')) { const contar = () => typeof qdAtualizarBadge === 'function' ? qdAtualizarBadge() : setTimeout(contar, 300); contar(); }
    const gerenciaRel = pode('relatorios.publicar');
    document.getElementById('btn-new-report').style.display = gerenciaRel ? 'inline-flex' : 'none';
    document.getElementById('reports-sub').textContent = gerenciaRel
      ? 'Publique e gerencie a visibilidade dos relatórios.'
      : 'Relatórios disponíveis para você.';

    // 6. Abre direto em Relatórios (o Dashboard fica escondido até a versão 2.0)
    switchView('reports');
    if (typeof lswAoEntrar === 'function') lswAoEntrar(isAdmin);
    renderDashboard();
    renderReports();
    if (pode('usuarios.gerenciar') || pode('usuarios.senha')) carregarUsuarios(); // contador de pedidos de reset no menu
    carregarRelatorios();
    updateSidebarLogo();
    // Preferência "Menu lateral ao entrar: Recolhido"
    if (prefs.menu === 'recolhido' && !sidebarCollapsed) toggleSidebar();
}

// Aplica as preferências salvas assim que a página abre (tema e tamanho da fonte)
aplicarPrefs();
