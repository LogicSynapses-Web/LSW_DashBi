/* =====================================================================
   ESTÚDIO · EDITOR DE RELATÓRIOS (etapa E2a — esqueleto)
   Tela cheia com: Dados (esquerda) · Tela com guias (centro) · Propriedades (direita).
   Os visuais ficam numa grade de 12 colunas (biblioteca Gridstack): arrastar move,
   o canto inferior direito redimensiona. Clique numa área vazia da grade para
   escolher o tipo de visual. O desenho inteiro fica em JSON ("definicao").
   Próximas etapas: E2b campos e medidas · E2c tabela dinâmica e formatação · E2d filtros e publicar.
   Depende de: script.js (API_URL, showToast) e estudio.js (estApi, estEsc, est).
   ===================================================================== */

const LIB_GRADE_JS = 'https://cdn.jsdelivr.net/npm/gridstack@10.3.1/dist/gridstack-all.js';
const LIB_GRADE_CSS = 'https://cdn.jsdelivr.net/npm/gridstack@10.3.1/dist/gridstack.min.css';

// Grade: 96 colunas (largura da tela ÷ 96); a altura da linha acompanha a largura (proporção fixa), então o relatório
// mantém o mesmo desenho em qualquer largura de tela (editor, prévia e tela do usuário).
// No zoom 100% (página de 1200 px): coluna = 12,5 px e linha = 9 px.
const ED_COLUNAS = 96;
const ED_PROPORCAO = 0.72;        // altura da linha = 72% da largura da coluna
const ED_LARGURA_PAGINA = 1200;   // largura de referência da página (zoom 100%)
const ED_VERSAO_GRADE = 96;       // desenhos antigos (12 ou 24 colunas) são convertidos ao abrir
const ED_F = ED_COLUNAS / 24;     // os modelos (sugerido, em Z, Painel CSAT) são escritos na grade de 24: multiplica por 4

// Tipos de visual: rótulo, grupo do menu, tamanho inicial (colunas x linhas da grade de 96) e ícone
const ED_TIPOS = {
  card:    { rotulo: 'Card',             grupo: 'Card',    w: 24,  h: 16,  icone: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 13h4M7 10h10"/>' },
  colunas: { rotulo: 'Colunas',          grupo: 'Gráfico', w: 48, h: 32,  icone: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
  barras:  { rotulo: 'Barras',           grupo: 'Gráfico', w: 48, h: 32,  icone: '<path d="M4 4h10M4 10h16M4 16h7M2 2v20"/>' },
  linhas:  { rotulo: 'Linhas',           grupo: 'Gráfico', w: 48, h: 32,  icone: '<path d="M3 17l5-6 4 3 6-8 3 3"/><path d="M2 21h20"/>' },
  area:    { rotulo: 'Área',             grupo: 'Gráfico', w: 48, h: 32,  icone: '<path d="M3 18l5-7 4 3 6-8 3 3v9H3z"/>' },
  pizza:   { rotulo: 'Pizza',            grupo: 'Gráfico', w: 32,  h: 32,  icone: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>' },
  tabela:  { rotulo: 'Tabela dinâmica',  grupo: 'Tabela',  w: 40, h: 48, icone: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16"/>' },
  velocimetro:  { rotulo: 'Velocímetro', grupo: 'Análise', w: 32,  h: 28,  icone: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/>' },
  cascata:      { rotulo: 'Cascata',     grupo: 'Análise', w: 48, h: 32,  icone: '<path d="M3 20V12h4v8M9 12V6h4v6M15 6V3h4v17M2 21h20"/>' },
  tendencia:    { rotulo: 'Tendência e projeção', grupo: 'Análise', w: 48, h: 32, icone: '<path d="M3 17l6-6 4 3 7-8"/><path d="M16 6h4v4" stroke-dasharray="2 2"/>' },
  reincidencia: { rotulo: 'Reincidência', grupo: 'Análise', w: 32,  h: 24,  icone: '<path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/>' },
  filtro:  { rotulo: 'Filtro',           grupo: 'Filtro',  w: 24,  h: 12,  icone: '<path d="M3 4h18l-7 9v6l-4 2v-8z"/>' },
};
const ED_ICONE_TIPO_COLUNA = { texto: 'Aa', inteiro: '123', decimal: '1,5', data: '📅', data_hora: '📅', hora: '🕒' };

const ed = {
  rel: null, base: null, arquivos: [], def: null,
  guia: null,          // id da guia aberta
  sel: null,           // id do visual selecionado
  grade: null,         // instância do Gridstack
  historico: [], futuro: [], ultimo: '',
  sujo: false, carregandoGrade: false,
};

/* ---------------- ajudas ---------------- */
const edEl = id => document.getElementById(id);
const edNovoId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const edGuiaAtual = () => ed.def.guias.find(g => g.id === ed.guia);
const edVisual = id => edGuiaAtual().visuais.find(v => v.id === id);
const edIcone = (corpo, t = 18) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${corpo}</svg>`;

// O CSS do Gridstack 10 só traz larguras/posições prontas para até 12 colunas.
// Para a grade de 24, geramos aqui: gs-w="n" → largura n/24 · gs-x="n" → posição n/24.
function edCssColunas(){
  if (document.getElementById('ed-css-colunas')) return;
  let css = '';
  for (let i = 1; i <= ED_COLUNAS; i++) {
    const p = (i / ED_COLUNAS * 100).toFixed(4) + '%';
    css += `.gs-${ED_COLUNAS} > .grid-stack-item[gs-w="${i}"]{width:${p}}.gs-${ED_COLUNAS} > .grid-stack-item[gs-x="${i}"]{left:${p}}`;
  }
  const s = document.createElement('style');
  s.id = 'ed-css-colunas'; s.textContent = css;
  document.head.appendChild(s);
}
function edCarregarCss(url){
  if (document.querySelector(`link[href="${url}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = url; document.head.appendChild(l);
}

// Modelo sugerido para relatório novo (inspirado num painel de referência): cards no topo,
// gráficos à esquerda e tabela dinâmica à direita. É só um ponto de partida: tudo pode ser mudado.
function edModeloSugerido(){
  const v = (tipo, titulo, x, y, w, h) => ({ id: edNovoId('v'), tipo, titulo, x: x * ED_F, y: y * ED_F, w: w * ED_F, h: h * ED_F }); // posições escritas na grade de 24
  return { grade: ED_VERSAO_GRADE, guias: [{ id: 'g1', nome: 'VISÃO GERAL', visuais: [
    v('card', 'INDICADOR 1', 0, 0, 6, 4), v('card', 'INDICADOR 2', 6, 0, 6, 4), v('card', 'INDICADOR 3', 12, 0, 6, 4),
    v('linhas', 'EVOLUÇÃO POR DIA', 0, 4, 14, 8), v('colunas', 'COMPARATIVO POR DIA', 0, 12, 14, 8),
    v('tabela', 'RESULTADO POR OPERADOR', 14, 4, 10, 16),
  ] }] };
}
// E6 · Modelo em Z (storytelling do macro ao micro): o olho lê como um "Z" —
// 1-3 resultado (topo à esquerda) → 4 meta (topo à direita) → 5 tendência (diagonal) → 6 o que pesou → 7 detalhe (micro).
// Os títulos numerados guiam quem monta; basta arrastar as medidas e colunas para cada visual.
function edVisuaisZ(){
  const v = (tipo, titulo, x, y, w, h) => ({ id: edNovoId('v'), tipo, titulo, x: x * ED_F, y: y * ED_F, w: w * ED_F, h: h * ED_F }); // posições escritas na grade de 24
  return [
    v('filtro', 'PERÍODO', 0, 0, 8, 3), v('filtro', 'SEGMENTO', 8, 0, 7, 3),
    v('card', '1 · RESULTADO PRINCIPAL', 0, 3, 5, 4), v('card', '2 · VOLUME', 5, 3, 5, 4), v('card', '3 · QUALIDADE', 10, 3, 5, 4),
    v('velocimetro', '4 · META DO MÊS', 15, 0, 9, 7),
    v('tendencia', '5 · TENDÊNCIA E PROJEÇÃO', 0, 7, 24, 8),
    v('cascata', '6 · O QUE MAIS PESOU', 0, 15, 12, 9),
    v('tabela', '7 · DETALHE (MICRO)', 12, 15, 12, 9),
  ];
}
function edModeloZ(){ return { grade: ED_VERSAO_GRADE, guias: [{ id: 'g1', nome: 'VISÃO EM Z', visuais: edVisuaisZ() }] }; }
function edNovaGuiaZ(){
  const id = edNovoId('g');
  edMudar(() => ed.def.guias.push({ id, nome: 'VISÃO EM Z', visuais: edVisuaisZ() }));
  ed.guia = id; ed.sel = null;
  edRenderGuias(); edCarregarGuia(); edRenderProps();
}
// Desenho salvo numa grade mais grossa (12 ou 24 colunas): multiplica posições e tamanhos (×8 ou ×4)
// → o mesmo desenho, numa grade mais fina. Como a altura da linha também acompanha a largura, nada muda de tamanho.
function edMigrarGrade(def){
  if (def.grade === ED_VERSAO_GRADE) return false;
  const fator = ED_VERSAO_GRADE / (def.grade || 12);
  def.guias.forEach(g => g.visuais.forEach(v => { v.x *= fator; v.y *= fator; v.w *= fator; v.h *= fator; }));
  def.grade = ED_VERSAO_GRADE;
  return true;
}

/* ---------------- abrir / fechar ---------------- */
async function edAbrir(id, comModelo){
  try {
    edCarregarCss(LIB_GRADE_CSS);
    const [det] = await Promise.all([estApi('GET', '/api/estudio/relatorios/' + id), carregarLib(LIB_GRADE_JS)]);
    ed.rel = det.relatorio; ed.base = det.base; ed.arquivos = det.arquivos;
    ed.base.medidas = ed.base.medidas || [];
    ed.graficos = {}; ed.dadosProntos = false; ed.filtros = {}; ed.leitura = false; ed.colunasOriginais = null; ed.basesRel = {}; ed.eixoAtivo = {}; ed.tabEstado = {}; ed.metaAlterada = false; ed.csatUltima = null; ed.meta = det.relatorio.definicao.meta ?? null;
    ed.def = JSON.parse(JSON.stringify(det.relatorio.definicao));
    ed.historico = []; ed.futuro = []; ed.sel = null; ed.sujo = false;
    if (comModelo && ed.def.guias.length === 1 && !ed.def.guias[0].visuais.length) { ed.def = comModelo === 'z' ? edModeloZ() : edModeloSugerido(); ed.sujo = true; }
    else edMigrarGrade(ed.def); // não marca "sujo": a conversão só é gravada quando a pessoa salvar algo
    ed.previa = false; ed.zoom = ed.zoom || 'ajustar'; ed.aba = 'inicio';
    ed.guia = ed.def.guias[0].id;
    ed.ultimo = JSON.stringify(ed.def);
    edMontarTela();
    vzCarregarDados(); // estudio-visuais.js: baixa os dias da base e desenha os visuais
  } catch (erro) {
    showToast(erro.message, 'erro');
  }
}

// E4 · "Abrir no editor" no card do Painel CSAT: prepara (na 1ª vez) a base ligada ao banco e o relatório-modelo
async function edAbrirCsatNoEditor(){
  try {
    const r = await estApi('POST', '/api/estudio/csat/editor', {});
    if (r.criado) showToast('Criei o relatório PAINEL CSAT (EDITOR) com as visões do painel. O painel atual continua igual.');
    await edAbrir(r.relatorio_id);
  } catch (erro) {
    showToast(erro.message, 'erro');
  }
}

// Tela do USUÁRIO (etapa E2d): abre a versão publicada de um relatório do Estúdio, só para leitura.
// Usa a mesma tela do editor sempre em "Prévia": sem faixa de menus, sem painel de dados, sem salvar.
async function edAbrirLeitura(id){
  if (!id) { showToast('Este card não está ligado a um relatório do Estúdio.', 'erro'); return; }
  try {
    edCarregarCss(LIB_GRADE_CSS);
    const [det] = await Promise.all([estApi('GET', '/api/estudio/publicados/' + id), carregarLib(LIB_GRADE_JS)]);
    ed.rel = det.relatorio; ed.base = det.base; ed.arquivos = det.arquivos;
    ed.base.medidas = ed.base.medidas || [];
    ed.graficos = {}; ed.dadosProntos = false; ed.filtros = {}; ed.colunasOriginais = null; ed.eixoAtivo = {}; ed.tabEstado = {}; ed.metaAlterada = false; ed.csatUltima = null; ed.meta = det.relatorio.definicao.meta ?? null;
    // E5: bases relacionadas vêm junto da versão publicada
    ed.basesRel = Object.fromEntries((det.relacionadas || []).map(x => [x.base.id, x]));
    ed.def = JSON.parse(JSON.stringify(det.relatorio.definicao));
    edMigrarGrade(ed.def);
    ed.historico = []; ed.futuro = []; ed.sel = null; ed.sujo = false;
    ed.leitura = true; ed.previa = false; ed.zoom = 'ajustar'; ed.aba = 'inicio';
    ed.guia = ed.def.guias[0].id;
    ed.ultimo = JSON.stringify(ed.def);
    edMontarTela();
    edAlternarPrevia(); // fica sempre em prévia
    vzCarregarDados();
  } catch (erro) {
    showToast(erro.message, 'erro');
  }
}

function edFechar(){
  if (!ed.leitura && ed.sujo && !confirm('Há alterações não salvas no relatório. Fechar mesmo assim?')) return;
  if (typeof vzFecharListaFiltro === 'function') vzFecharListaFiltro();
  Object.keys(ed.graficos || {}).forEach(vzDescartarGrafico);
  if (ed.obsGrade) { ed.obsGrade.disconnect(); ed.obsGrade = null; }
  if (ed.grade) { ed.grade.destroy(false); ed.grade = null; }
  const ov = edEl('ed-overlay');
  if (ov) ov.remove();
  document.removeEventListener('keydown', edTeclas);
  document.removeEventListener('click', edFecharMenuFora, true);
  if (ed.leitura) { ed.leitura = false; ed.previa = false; return; } // usuário volta para a lista de Relatórios
  estAbrir(); // atualiza a lista do Estúdio
}

/* ---------------- estrutura da tela ---------------- */
function edMontarTela(){
  let ov = edEl('ed-overlay');
  if (ov) ov.remove();
  ov = document.createElement('div');
  ov.id = 'ed-overlay';
  ov.className = 'ed-overlay' + (ed.leitura ? ' ed-modo-leitura' : '') + (ed.def.menu === 'esquerda' ? ' menu-esquerda' : '');
  const subtitulo = ed.leitura
    ? `${ed.rel.publicado_em ? 'Publicado em ' + new Date(ed.rel.publicado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}`
    : `Base: <b>${estEsc(ed.base ? ed.base.nome : '—')}</b> · ${ed.base && ed.base.fonte === 'csat' ? 'ligada ao banco (Painel CSAT)' : ed.base && ed.base.fonte === 'quadro' ? 'ligada ao Quadro (sempre atualizada)' : ed.arquivos.length + ' dia(s) de dados'}`;
  ov.innerHTML = `
    <header class="ed-top">
      <button class="btn-icon" onclick="edFechar()" title="${ed.leitura ? 'Fechar o relatório' : 'Voltar ao Estúdio'}">${edIcone(ed.leitura ? '<path d="M18 6L6 18M6 6l12 12"/>' : '<path d="M15 18l-6-6 6-6"/>', 20)}</button>
      <div class="ed-nome-wrap">
        <input id="ed-nome" class="ed-nome caixa-alta" type="text" value="${estEsc(ed.rel.nome)}" ${ed.leitura ? 'readonly tabindex="-1"' : ''} oninput="ed.sujo = true; edAtualizarBotoes()" title="Nome do relatório">
        <div class="ed-base">${subtitulo}</div>
      </div>
      <div class="ed-acoes">
        <select class="ed-zoom" id="ed-zoom" onchange="edZoom(this.value)" title="Zoom da página">
          ${[['ajustar', 'Ajustar à tela'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%']].map(([v, r]) => `<option value="${v}" ${ed.zoom === v ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <button class="link-btn hidden" id="ed-limpar" onclick="vzLimparTodosFiltros()" title="Tira a escolha de todos os filtros">Limpar filtros</button>
        <!-- Meta (igual ao Painel CSAT): o admin ajusta no editor e grava ao Salvar; na tela do usuário só aparece -->
        <div class="csat-meta ed-meta hidden" id="ed-meta" title="Meta">
          <span class="csat-meta-label">Meta</span>
          <button class="ed-meta-btn" onclick="edMudarMeta(ed.meta - 1)" title="Diminuir">−</button>
          <input id="ed-meta-inp" type="number" min="0" max="100" onchange="edMudarMeta(+this.value)">
          <span>%</span>
          <button class="ed-meta-btn" onclick="edMudarMeta(ed.meta + 1)" title="Aumentar">+</button>
        </div>
        <select class="ed-zoom hidden" id="ed-mes" onchange="vzCarregarDadosCsat(this.value)" title="Mês das avaliações (base ligada ao banco)"></select>
        <button class="btn btn-ghost btn-small" id="ed-exportar" onclick="vzExportar()" title="Baixar os dados dos visuais desta guia em Excel (com os filtros aplicados)">${edIcone('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>', 16)} Exportar</button>
        <button class="btn btn-ghost btn-small ed-so-admin" id="ed-previa-btn" onclick="edAlternarPrevia()" title="Ver como o usuário final vai ver">${edIcone('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>', 16)} Prévia</button>
        <button class="btn btn-ghost btn-small ed-so-edicao" id="ed-desfazer" onclick="edDesfazer()" title="Desfazer (Ctrl+Z)">${edIcone('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', 16)}</button>
        <button class="btn btn-ghost btn-small ed-so-edicao" id="ed-refazer" onclick="edRefazer()" title="Refazer (Ctrl+Y)">${edIcone('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>', 16)}</button>
        <button class="btn btn-primary btn-small ed-so-admin" id="ed-salvar" onclick="edSalvar()">Salvar</button>
      </div>
    </header>
    <!-- Faixa de menus (como a do Excel): abas fixas + abas do visual selecionado (Visual, Formatar) -->
    <div class="ed-faixa-wrap ed-so-edicao">
      <nav class="ed-faixa-abas" id="ed-faixa-abas"></nav>
      <div class="ed-faixa" id="ed-faixa"></div>
    </div>
    <div class="ed-corpo ${edDadosFechado() ? 'dados-fechado' : ''}" id="ed-corpo">
      <aside class="ed-dados" id="ed-dados"></aside>
      <main class="ed-centro">
        <div class="ed-guias" id="ed-guias"></div>
        <div class="ed-tela" id="ed-tela"><div class="grid-stack" id="ed-grade"></div>
          <div class="ed-dica">Clique numa área vazia para adicionar um visual · arraste pelo título para mover · puxe o canto para redimensionar</div>
        </div>
      </main>
    </div>
    <div class="ed-menu hidden" id="ed-menu"></div>`;
  document.body.appendChild(ov);
  document.addEventListener('keydown', edTeclas);

  edCssColunas();
  edAplicarLarguraZoom();
  ed.cellH = edAlturaLinha();
  ed.grade = GridStack.init({ column: ED_COLUNAS, cellHeight: ed.cellH, margin: 4, float: true, animate: false, minRow: 28 * ED_F,
    handle: '.ed-vis-cab', resizable: { handles: 'se, e, s' } }, edEl('ed-grade'));
  // A largura mudou (janela, zoom, prévia): recalcula a altura das linhas para manter a proporção
  ed.obsGrade = new ResizeObserver(() => edAjustarProporcao());
  ed.obsGrade.observe(edEl('ed-grade'));
  edAjustarProporcao();
  // Vários selecionados: arrastar um leva os outros junto (mesmo deslocamento, mantendo o desenho)
  ed.grade.on('dragstart', (e, el) => {
    ed.talvezUnico = null;
    const id = el.gridstackNode && el.gridstackNode.id, sel = edSelecionados();
    ed.arrasto = sel.length > 1 && sel.includes(id)
      ? { id, x0: el.gridstackNode.x, y0: el.gridstackNode.y, outros: sel.filter(x => x !== id).map(x => { const v = edVisual(x); return { id: x, x: v.x, y: v.y, w: v.w }; }) }
      : null;
  });
  ed.grade.on('dragstop', (e, el) => {
    const a = ed.arrasto; ed.arrasto = null;
    if (!a) return;
    setTimeout(() => {
      const n = el.gridstackNode, dx = n.x - a.x0, dy = n.y - a.y0;
      if (!dx && !dy) return;
      const mapa = {};
      a.outros.forEach(o => { mapa[o.id] = { x: Math.min(ED_COLUNAS - o.w, Math.max(0, o.x + dx)), y: Math.max(0, o.y + dy) }; });
      edPosicionar(mapa, true); // entra no mesmo "desfazer" do arrasto
    }, 0);
  });
  ed.grade.on('change', (e, itens) => {
    if (ed.carregandoGrade || !Array.isArray(itens) || !itens.length) return; // a grade às vezes avisa sem itens (ex.: visual escondido)
    edMudar(() => itens.forEach(it => { const v = edVisual(it.id); if (v) Object.assign(v, { x: it.x, y: it.y, w: it.w, h: it.h }); }), true);
  });
  // Clique na área vazia da grade → menu de visuais naquela posição
  edEl('ed-grade').addEventListener('click', e => {
    if (e.target !== edEl('ed-grade') || ed.previa) return;
    const r = edEl('ed-grade').getBoundingClientRect();
    const cel = ed.grade.getCellFromPixel({ left: e.clientX - r.left, top: e.clientY - r.top });
    edSelecionar(null);
    edMenuVisual(cel, e.clientX, e.clientY);
  });
  document.addEventListener('click', edFecharMenuFora, true);

  edRenderDados();
  edRenderGuias();
  edCarregarGuia();
  edRenderProps();
  edAtualizarBotoes();
  edAtualizarMeta(); edAtualizarLimpar();
}

/* ---------------- proporção, zoom e prévia ---------------- */
function edAlturaLinha(){
  const w = edEl('ed-grade').clientWidth || ED_LARGURA_PAGINA;
  // sem arredondar para inteiro: com 96 colunas a linha tem poucos px (9 px no zoom 100%) e o arredondamento distorceria a proporção
  return Math.max(2, Math.round(w / ED_COLUNAS * ED_PROPORCAO * 100) / 100);
}
function edAjustarProporcao(){
  const el = edEl('ed-grade');
  if (!el || !ed.grade) return;
  const h = edAlturaLinha();
  if (h !== ed.cellH) { ed.cellH = h; ed.grade.cellHeight(h); }
  // pontinhos do fundo = um a cada 4 células (com 96 colunas, um ponto por célula ficaria denso demais);
  // ao arrastar, o visual anda de célula em célula: 4 passos entre um ponto e outro
  el.style.backgroundSize = `${el.clientWidth / ED_COLUNAS * ED_F}px ${h * ED_F}px`;
}
function edAplicarLarguraZoom(){
  const el = edEl('ed-grade');
  el.style.width = ed.zoom === 'ajustar' ? '' : Math.round(ED_LARGURA_PAGINA * Number(ed.zoom)) + 'px';
}
function edZoom(v){
  ed.zoom = v;
  edAplicarLarguraZoom();
  edAjustarProporcao();
}
// Prévia: esconde painéis e trava a grade — é o que o usuário final verá (mesma proporção)
function edAlternarPrevia(){
  ed.previa = !ed.previa;
  edSelecionar(null);
  edEl('ed-menu').classList.add('hidden');
  edEl('ed-overlay').classList.toggle('ed-modo-previa', ed.previa);
  ed.grade.setStatic(ed.previa);
  edEl('ed-previa-btn').innerHTML = ed.previa
    ? `${edIcone('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 16)} Voltar a editar`
    : `${edIcone('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>', 16)} Prévia`;
  edPosicionarGuias(); edAplicarVisibilidade(); edAtualizarMeta();
}

/* ---------------- meta, "Limpar filtros", guias no cabeçalho, visuais condicionais ---------------- */
// Meta do relatório: na base do Painel CSAT é a meta do banco (a mesma do painel em código)
function edAtualizarMeta(){
  const caixa = edEl('ed-meta'); if (!caixa) return;
  const tem = ed.meta != null && (ed.base.fonte === 'csat' || ed.def.meta != null);
  caixa.classList.toggle('hidden', !tem);
  const podeMudar = !ed.leitura && !ed.previa;
  caixa.classList.toggle('so-leitura', !podeMudar);
  const inp = edEl('ed-meta-inp');
  inp.value = ed.meta ?? ''; inp.readOnly = !podeMudar;
  // subtítulo do cabeçalho: na base do Painel CSAT, quando a base foi atualizada (como no painel)
  const sub = document.querySelector('#ed-overlay .ed-base');
  if (sub && ed.leitura && ed.base.fonte === 'csat' && ed.csatUltima) sub.textContent = 'Base atualizada em ' + new Date(ed.csatUltima.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function edMudarMeta(valor){
  if (ed.leitura || ed.previa) { edAtualizarMeta(); return; }
  ed.meta = Math.max(0, Math.min(100, Math.round(valor) || 0));
  if (ed.base.fonte === 'csat') ed.metaAlterada = ed.meta !== ed.metaSalva; // gravada no banco ao Salvar (igual ao painel)
  else edMudar(() => { ed.def.meta = ed.meta; });
  ed.sujo = ed.sujo || !!ed.metaAlterada;
  edAtualizarMeta(); edAtualizarBotoes();
  vzRenderTodos(); // cores, linha da meta e etiquetas "Dentro/Fora da meta"
}
// "Limpar filtros" aparece no cabeçalho quando há algum filtro escolhido
function edAtualizarLimpar(){ const b = edEl('ed-limpar'); if (b) b.classList.toggle('hidden', !vzTemFiltro()); }
// Guias no cabeçalho (como o Painel CSAT): na prévia e na tela do usuário, as guias vão para a barra de cima
function edPosicionarGuias(){
  const guias = edEl('ed-guias'), top = document.querySelector('#ed-overlay .ed-top'), centro = document.querySelector('#ed-overlay .ed-centro');
  if (!guias || !top || !centro) return;
  const noCabecalho = ed.previa && ed.def.menu === 'cabecalho';
  if (noCabecalho && guias.parentElement !== top) top.insertBefore(guias, top.querySelector('.ed-acoes'));
  else if (!noCabecalho && guias.parentElement !== centro) centro.insertBefore(guias, centro.firstChild);
  guias.classList.toggle('no-cabecalho', noCabecalho);
}
// Visual que só aparece com um botão de outro visual ativo (ex.: a tabela de intervalos só no "Intrahora")
function edAplicarVisibilidade(){
  if (!ed.def) return;
  for (const v of edGuiaAtual().visuais) {
    const se = vzF(v, 'visivelSe', 'visual', null) ? v.formato.visivelSe : null;
    const item = document.querySelector(`#ed-grade .grid-stack-item[gs-id="${v.id}"]`);
    if (!item) continue;
    let visivel = true;
    if (se) { const alvo = edVisual(se.visual); visivel = !!alvo && vzEixoAtivo(alvo) === se.eixo; }
    item.classList.toggle('vz-condicional', !!se);
    item.classList.toggle('vz-oculto', !visivel);
  }
}

/* ---------------- painel Dados ---------------- */
function edRenderDados(){
  const todas = ed.base ? ed.base.colunas.filter(c => c.manter) : [];
  const cols = todas.filter(c => !c._rel);
  const grupos = [
    ['Datas e horas', cols.filter(c => ['data', 'data_hora', 'hora'].includes(c.tipo))],
    ['Números', cols.filter(c => ['inteiro', 'decimal'].includes(c.tipo))],
    ['Textos', cols.filter(c => c.tipo === 'texto')],
    // E5: colunas que vieram de bases relacionadas, um grupo por base (📅 = tabela de apoio: Calendário, Faixas)
    ...[...new Set(todas.filter(c => c._rel).map(c => c._relBase))].map(b => [(todas.find(c => c._relBase === b)._apoio ? '📅 ' : '🔗 ') + b, todas.filter(c => c._relBase === b)]),
  ];
  const statusAnterior = edEl('ed-status-dados') ? edEl('ed-status-dados').textContent : 'Carregando dados…';
  const medidas = ed.base.medidas || [];
  edEl('ed-dados').innerHTML = `
    <button class="ed-dados-abrir" onclick="edAlternarDados()" title="Mostrar colunas e medidas">${edIcone('<path d="M9 18l6-6-6-6"/>', 16)}<span>DADOS</span></button>
    <div class="ed-painel-titulo ed-dados-cab">Dados <button class="ed-dados-rec" onclick="edAlternarDados()" title="Recolher o painel (mais espaço para a tela)">${edIcone('<path d="M15 18l-6-6 6-6"/>', 15)}</button></div>
    <div class="ed-periodo" id="ed-status-dados">${estEsc(statusAnterior)}</div>
    <div class="ed-grupo ed-grupo-med">Medidas <button class="vz-nova-med" onclick="vzAbrirMedida()" title="Criar medida">＋ Medida</button></div>
    ${medidas.length ? medidas.map(m => `<div class="ed-campo ed-medida" draggable="true" ondragstart='vzArrastar(event, {"tipo":"medida","id":"${m.id}"})' onclick="vzAbrirMedida('${m.id}')" title="${estEsc(m.nome)} = ${estEsc(m.formula || (VZ_TIPOS_MEDIDA[m.tipo] || {}).rotulo || '')} · clique para editar, arraste para um visual">
        <span class="ed-campo-ico">Σ</span><span class="ed-campo-nome">${estEsc(m.nome)}</span></div>`).join('')
      : '<div class="ed-em-breve">Nenhuma medida ainda. Crie uma (ex.: CSAT = média da pontuação) e arraste para um card ou gráfico.</div>'}
    <input class="ed-busca" style="margin-top:12px" type="text" placeholder="Buscar coluna…" oninput="edFiltrarColunas(this.value)">
    ${grupos.filter(g => g[1].length).map(([nome, lista]) => `
      <div class="ed-grupo">${nome}</div>
      ${lista.map(c => `<div class="ed-campo" draggable="true" ondragstart='vzArrastar(event, {"tipo":"col","col":"${c.nome}"})' data-busca="${estEsc(estSlug(c.rotulo))}" title="${estEsc(c.rotulo)} · ${EST_TIPOS[c.tipo]} · arraste para um visual">
        <span class="ed-campo-ico">${ED_ICONE_TIPO_COLUNA[c.tipo]}</span><span class="ed-campo-nome">${estEsc(c.rotulo)}</span></div>`).join('')}`).join('')}`;
}
// Painel Dados recolhível: a escolha fica guardada neste navegador
const ED_DADOS_CHAVE = 'dashbi-ed-dados-fechado';
function edDadosFechado(){ try { return localStorage.getItem(ED_DADOS_CHAVE) === '1'; } catch (e) { return false; } }
function edAlternarDados(){
  const fechado = !edEl('ed-corpo').classList.contains('dados-fechado');
  edEl('ed-corpo').classList.toggle('dados-fechado', fechado);
  try { localStorage.setItem(ED_DADOS_CHAVE, fechado ? '1' : '0'); } catch (e) {}
  if (ed.aba === 'exibir') edRenderFaixa();
}
function edFiltrarColunas(txt){
  const t = estSlug(txt);
  document.querySelectorAll('#ed-dados .ed-campo').forEach(el => el.classList.toggle('hidden', !!txt && !el.dataset.busca.includes(t)));
}

/* ---------------- guias ---------------- */
function edRenderGuias(){
  edEl('ed-guias').innerHTML = ed.def.guias.map(g => `
    <button class="ed-guia ${g.id === ed.guia ? 'ativa' : ''}" onclick="edTrocarGuia('${g.id}')" ondblclick="edRenomearGuiaInline('${g.id}', this)" title="Duplo clique para renomear">${estEsc(g.nome)}</button>`).join('')
    + `<button class="ed-guia ed-guia-nova" onclick="edNovaGuia()" title="Adicionar guia">${edIcone('<path d="M12 5v14M5 12h14"/>', 14)}</button>`;
}
function edTrocarGuia(id){
  if (id === ed.guia) return;
  ed.guia = id; ed.sel = null;
  edRenderGuias(); edCarregarGuia(); edRenderProps();
}
function edNovaGuia(){
  const id = edNovoId('g');
  edMudar(() => ed.def.guias.push({ id, nome: 'GUIA ' + (ed.def.guias.length + 1), visuais: [] }));
  ed.guia = id; ed.sel = null;
  edRenderGuias(); edCarregarGuia(); edRenderProps();
}
function edRenomearGuiaInline(id, botao){
  if (ed.previa) return; // na prévia e na tela do usuário as guias só navegam
  const g = ed.def.guias.find(x => x.id === id);
  const inp = document.createElement('input');
  inp.className = 'ed-guia-input caixa-alta'; inp.value = g.nome;
  botao.replaceWith(inp); inp.focus(); inp.select();
  let feito = false; // Enter e a perda de foco (blur) chegam juntos: só vale o primeiro
  const fim = salvar => { if (feito) return; feito = true; if (salvar && inp.value.trim() && inp.value.trim().toUpperCase() !== g.nome) edRenomearGuia(id, inp.value); else edRenderGuias(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') fim(true); if (e.key === 'Escape') fim(false); });
  inp.addEventListener('blur', () => fim(true));
}
function edRenomearGuia(id, nome){
  nome = String(nome).trim().toUpperCase();
  if (!nome) return;
  edMudar(() => { ed.def.guias.find(x => x.id === id).nome = nome; });
  edRenderGuias(); edRenderProps();
}
function edExcluirGuia(id){
  if (ed.def.guias.length === 1) { showToast('O relatório precisa ter pelo menos uma guia.', 'erro'); return; }
  const g = ed.def.guias.find(x => x.id === id);
  if (g.visuais.length && !confirm(`Excluir a guia "${g.nome}" e os ${g.visuais.length} visuais dela?`)) return;
  edMudar(() => { ed.def.guias = ed.def.guias.filter(x => x.id !== id); });
  ed.guia = ed.def.guias[0].id; ed.sel = null;
  edRenderGuias(); edCarregarGuia(); edRenderProps();
}

/* ---------------- grade de visuais ---------------- */
// Corpo de um visual ainda sem campos (o estudio-visuais.js troca pelo card/gráfico quando houver)
function edCorpoVazio(v){
  const t = ED_TIPOS[v.tipo];
  return v.tipo === 'card'
    ? `<div class="ed-card-valor">—</div><div class="ed-vazio-txt">arraste uma medida</div>`
    : v.tipo === 'filtro' ? `<div class="vz-filtro"><span class="vz-filtro-btn vazio">Filtro</span></div><div class="ed-vazio-txt">arraste uma coluna (ex.: operação, data)</div>`
    : `<div class="ed-vazio-ico">${edIcone(t.icone, 34)}</div><div class="ed-vazio-txt">${v.tipo === 'tabela' ? 'arraste colunas (Linhas) e medidas (Valores)' : 'arraste colunas e medidas para cá'}</div>`;
}
function edConteudoVisual(v){
  const t = ED_TIPOS[v.tipo];
  return `<div class="ed-vis ${v.id === ed.sel ? 'sel' : ''}" data-id="${v.id}" ondragover="vzSobre(event)" ondragleave="this.classList.remove('vz-alvo')" ondrop="vzSoltarNoVisual(event, '${v.id}')">
    <div class="ed-vis-cab"><span class="ed-vis-titulo">${estEsc(v.titulo || t.rotulo)}</span><span class="ed-vis-tipo">${t.rotulo}</span></div>
    <div class="ed-vis-corpo">${edCorpoVazio(v)}</div></div>`;
}
// Aplica a aba Formatar na "moldura" do visual: fundo, borda e título (sem recalcular os dados)
function edAplicarMoldura(id){
  const v = edVisual(id), el = document.querySelector(`#ed-grade .ed-vis[data-id="${id}"]`);
  if (!v || !el) return;
  const f = (sec, k, p) => vzF(v, sec, k, p);
  // variáveis CSS (e não cor direta) para a borda de "selecionado" continuar aparecendo por cima
  el.style.setProperty('--vis-fundo', f('fundo', 'cor', '') || null);
  // Borda: lados (t d b e), espessura, estilo e cor; sem borda = espessura 0
  const borda = f('fundo', 'borda', true), lados = f('fundo', 'lados', 'tdbe'), esp = f('fundo', 'esp', 1);
  [['t', '--vis-bt'], ['d', '--vis-bd'], ['b', '--vis-bb'], ['e', '--vis-be']].forEach(([l, var_]) => el.style.setProperty(var_, borda && lados.includes(l) ? esp + 'px' : '0px'));
  el.style.setProperty('--vis-borda', f('fundo', 'corBorda', '') || null);
  el.style.setProperty('--vis-bs', f('fundo', 'estilo', '') || null);
  el.style.setProperty('--vis-raio', f('fundo', 'raio', null) != null ? f('fundo', 'raio') + 'px' : null);
  // Sombra: intensidade + cor (padrão: preta)
  const sombra = { leve: '0 1px 4px', media: '0 4px 14px', forte: '0 10px 30px' }[f('fundo', 'sombra', '')];
  const corS = f('fundo', 'corSombra', '');
  el.style.setProperty('--vis-sombra', sombra ? `${sombra} ${corS && corS !== 'transparent' ? `color-mix(in srgb, ${corS} 45%, transparent)` : 'rgba(0,0,0,.28)'}` : null);
  el.classList.toggle('sem-titulo', !f('titulo', 'mostrar', true));
  const cab = el.querySelector('.ed-vis-cab'), tit = el.querySelector('.ed-vis-titulo');
  cab.style.justifyContent = { centro: 'center', direita: 'flex-end' }[f('titulo', 'alinhar', '')] || '';
  tit.style.color = f('titulo', 'cor', '');
  tit.style.fontSize = f('titulo', 'tamanho', null) ? `calc(${f('titulo', 'tamanho')}px * var(--escala-fonte))` : '';
  tit.style.fontWeight = f('titulo', 'negrito', true) ? '' : '400';
  // faixa colorida à esquerda do card (como os indicadores do Painel CSAT)
  const destaque = v.tipo === 'card' ? f('card', 'destaque', null) : null;
  const corDestaque = { accent: 'var(--accent)', success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', faint: 'var(--text-faint)' }[destaque] || destaque;
  el.classList.toggle('com-destaque', !!destaque);
  el.style.setProperty('--vis-destaque', corDestaque || null);
}
function edAdicionarNaGrade(v){
  // mínimo 2×2 da grade fina; filtro pode ter 1 linha de altura (faixa de filtros compacta)
  const el = ed.grade.addWidget({ id: v.id, x: v.x, y: v.y, w: v.w, h: v.h, minW: 2 * ED_F, minH: (v.tipo === 'filtro' ? 1 : 2) * ED_F });
  el.querySelector('.grid-stack-item-content').innerHTML = edConteudoVisual(v);
  edAplicarMoldura(v.id);
  el.addEventListener('mousedown', ev => {
    if (ev.target.closest('.ui-resizable-handle')) return;
    if (ed.pincel && !ed.leitura) { edAplicarPincel(v.id); return; }
    const somar = ev.ctrlKey || ev.metaKey || ev.shiftKey;
    // Clique (sem Ctrl) num visual de uma seleção múltipla: mantém o grupo (para arrastar junto); se não arrastar, fica só ele
    if (!somar && edSelecionados().length > 1 && edSelecionados().includes(v.id)) { ed.talvezUnico = v.id; edMarcarPrincipal(v.id); return; }
    edSelecionar(v.id, somar);
  });
  el.addEventListener('mouseup', () => { if (ed.talvezUnico === v.id) { ed.talvezUnico = null; edSelecionar(v.id); } });
  vzRender(v.id);
  return el;
}
function edCarregarGuia(){
  Object.keys(ed.graficos || {}).forEach(vzDescartarGrafico);
  ed.carregandoGrade = true;
  ed.grade.removeAll(true);
  ed.grade.batchUpdate();
  edGuiaAtual().visuais.forEach(edAdicionarNaGrade);
  ed.grade.batchUpdate(false);
  ed.carregandoGrade = false;
  edAplicarVisibilidade();
}
function edRedesenharVisual(id){
  const el = document.querySelector(`#ed-grade .grid-stack-item[gs-id="${id}"] .grid-stack-item-content`);
  const v = edVisual(id);
  if (el && v) { vzDescartarGrafico(id); el.innerHTML = edConteudoVisual(v); edAplicarMoldura(id); vzRender(id); }
}

// Menu de tipos de visual (posição = célula clicada; sem célula = primeiro espaço livre)
function edMenuVisual(cel, px, py){
  const m = edEl('ed-menu');
  const grupos = ['Card', 'Gráfico', 'Análise', 'Tabela', 'Filtro'];
  m.innerHTML = grupos.map(gr => `<div class="ed-menu-grupo">${gr}</div>` +
    Object.entries(ED_TIPOS).filter(([, t]) => t.grupo === gr).map(([k, t]) =>
      `<button class="ed-menu-item" onclick='edInserirVisual("${k}", ${cel ? JSON.stringify({ x: cel.x, y: cel.y }) : 'null'})'>${edIcone(t.icone)} ${t.rotulo}</button>`).join('')).join('');
  m.classList.remove('hidden');
  const ref = px == null ? edEl('ed-tela').getBoundingClientRect() : null;
  const x = px == null ? ref.left + 24 : px, y = py == null ? ref.top + 24 : py;
  m.style.left = Math.min(x, window.innerWidth - 230) + 'px';
  m.style.top = Math.min(y, window.innerHeight - m.offsetHeight - 10) + 'px';
}
function edFecharMenuFora(e){
  const m = edEl('ed-menu');
  if (m && !m.classList.contains('hidden') && !m.contains(e.target) && !e.target.closest('[onclick*="edMenuVisual"]') && e.target !== edEl('ed-grade')) m.classList.add('hidden');
}
function edInserirVisual(tipo, cel){
  edEl('ed-menu').classList.add('hidden');
  const t = ED_TIPOS[tipo];
  const v = { id: edNovoId('v'), tipo, titulo: t.rotulo.toUpperCase(), x: 0, y: 0, w: t.w, h: t.h };
  if (cel && ed.grade.isAreaEmpty(cel.x, cel.y, t.w, t.h) && cel.x + t.w <= ED_COLUNAS) { v.x = cel.x; v.y = cel.y; }
  else {
    // procura o primeiro espaço livre de cima para baixo
    let achou = false;
    for (let y = 0; y < 400 && !achou; y++) for (let x = 0; x + t.w <= ED_COLUNAS && !achou; x++) {
      if (ed.grade.isAreaEmpty(x, y, t.w, t.h)) { v.x = x; v.y = y; achou = true; }
    }
  }
  edMudar(() => edGuiaAtual().visuais.push(v));
  ed.carregandoGrade = true; edAdicionarNaGrade(v); ed.carregandoGrade = false;
  edSelecionar(v.id);
}
// Seleção: ed.sel = o visual "principal" (a faixa mostra os campos dele); ed.selMulti = todos os selecionados (Ctrl+clique)
const edSelecionados = () => !ed.sel ? [] : (ed.selMulti && ed.selMulti.length > 1 && ed.selMulti.includes(ed.sel) ? ed.selMulti.slice() : [ed.sel]);
function edSelecionar(id, somar){
  let lista;
  if (somar && id) {
    lista = edSelecionados();
    if (lista.includes(id)) { lista = lista.filter(x => x !== id); id = lista[lista.length - 1] || null; } // Ctrl+clique de novo tira
    else lista.push(id);
  } else lista = id ? [id] : [];
  // Selecionou um visual: a faixa vai para a aba Visual (campos), a não ser que já esteja numa aba do visual
  if (id && !ED_ABAS_VISUAL.some(a => a[0] === ed.aba)) ed.aba = lista.length > 1 ? 'formatar' : 'visual';
  else if (lista.length > 1 && ed.aba === 'visual') ed.aba = 'formatar'; // vários selecionados: a aba útil é Formatar (os campos são de um visual só)
  ed.selMulti = lista;
  ed.sel = id;
  edMarcarSelecao();
  edRenderProps();
}
function edMarcarSelecao(){
  const lista = edSelecionados();
  document.querySelectorAll('#ed-grade .ed-vis').forEach(el => {
    el.classList.toggle('sel', lista.includes(el.dataset.id));
    el.classList.toggle('sel-principal', lista.length > 1 && el.dataset.id === ed.sel);
  });
}
function edMarcarPrincipal(id){ ed.sel = id; edMarcarSelecao(); edRenderProps(); }
function edSelecionarTudo(){
  const ids = edGuiaAtual().visuais.map(v => v.id);
  if (!ids.length) return;
  ed.selMulti = ids; ed.sel = ids[0];
  if (!ED_ABAS_VISUAL.some(a => a[0] === ed.aba)) ed.aba = ids.length > 1 ? 'formatar' : 'visual';
  edMarcarSelecao(); edRenderProps();
}

/* ---------------- organizar: posição, alinhar, distribuir (na grade de 96 colunas) ---------------- */
const edItemEl = id => document.querySelector(`#ed-grade .grid-stack-item[gs-id="${id}"]`);
// Muda a posição/tamanho de vários visuais de uma vez (um só "desfazer"; juntar = soma ao último, ex.: arrasto em grupo)
function edPosicionar(mapa, juntar){
  const aplicar = () => Object.entries(mapa).forEach(([id, p]) => { const v = edVisual(id); if (v) Object.assign(v, p); });
  if (juntar) aplicar(); else edMudar(aplicar);
  ed.carregandoGrade = true;
  ed.grade.batchUpdate();
  Object.entries(mapa).forEach(([id, p]) => { const el = edItemEl(id); if (el) ed.grade.update(el, p); });
  ed.grade.batchUpdate(false);
  ed.carregandoGrade = false;
  // A grade não deixa um visual em cima do outro: se empurrou algum, o desenho guarda onde ele foi parar
  (ed.grade.engine.nodes || []).forEach(n => { const v = edVisual(n.id); if (v) Object.assign(v, { x: n.x, y: n.y, w: n.w, h: n.h }); });
  ed.ultimo = JSON.stringify(ed.def); ed.sujo = true;
  edAtualizarBotoes(); edRenderProps();
}
// Alinhar: com 1 visual, em relação à página; com vários, em relação ao conjunto (como no PowerPoint)
function edAlinhar(modo){
  const vs = edSelecionados().map(edVisual).filter(Boolean);
  if (!vs.length) return;
  const um = vs.length === 1;
  const minX = um ? 0 : Math.min(...vs.map(v => v.x)), maxX = um ? ED_COLUNAS : Math.max(...vs.map(v => v.x + v.w));
  const minY = Math.min(...vs.map(v => v.y)), maxY = Math.max(...vs.map(v => v.y + v.h));
  const mapa = {};
  vs.forEach(v => {
    let { x, y } = v;
    if (modo === 'esquerda') x = minX;
    else if (modo === 'direita') x = maxX - v.w;
    else if (modo === 'centro') x = Math.round((minX + maxX) / 2 - v.w / 2);
    else if (modo === 'topo') y = um ? 0 : minY;
    else if (modo === 'base') y = maxY - v.h;
    else if (modo === 'meio') y = Math.round((minY + maxY) / 2 - v.h / 2);
    mapa[v.id] = { x: Math.min(ED_COLUNAS - v.w, Math.max(0, x)), y: Math.max(0, y) };
  });
  edPosicionar(mapa);
}
// Distribuir: espaço igual entre os visuais (do primeiro ao último, na horizontal ou na vertical)
function edDistribuir(eixo){
  const vs = edSelecionados().map(edVisual).filter(Boolean);
  if (vs.length < 3) return showToast('Selecione 3 ou mais visuais para distribuir.', 'erro');
  const [p, t] = eixo === 'h' ? ['x', 'w'] : ['y', 'h'];
  vs.sort((a, b) => a[p] - b[p]);
  const ini = vs[0][p], fim = Math.max(...vs.map(v => v[p] + v[t]));
  const vao = (fim - ini - vs.reduce((s, v) => s + v[t], 0)) / (vs.length - 1);
  const mapa = {}; let pos = ini;
  vs.forEach(v => { mapa[v.id] = { [p]: Math.max(0, Math.round(pos)) }; pos += v[t] + Math.max(0, vao); });
  edPosicionar(mapa);
}
// Mesma largura / mesma altura do visual principal
function edMesmoTamanho(lado){
  const ids = edSelecionados(), base = edVisual(ed.sel);
  if (ids.length < 2 || !base) return;
  const mapa = {};
  ids.forEach(id => { const v = edVisual(id); mapa[id] = lado === 'w' ? { w: base.w, x: Math.min(v.x, ED_COLUNAS - base.w) } : { h: base.h }; });
  edPosicionar(mapa);
}
// Posição exata do visual principal (coluna/linha começam em 1 na tela)
function edPosicaoExata(campo, valor){
  const v = edVisual(ed.sel); if (!v) return;
  let n = Math.round(Number(valor)); if (!Number.isFinite(n)) return edRenderProps();
  const p = {};
  if (campo === 'x') p.x = Math.min(ED_COLUNAS - v.w, Math.max(0, n - 1));
  if (campo === 'y') p.y = Math.max(0, n - 1);
  if (campo === 'w') p.w = Math.min(ED_COLUNAS - v.x, Math.max(2 * ED_F, n));
  if (campo === 'h') p.h = Math.max((v.tipo === 'filtro' ? 1 : 2) * ED_F, n);
  edPosicionar({ [v.id]: p });
}
// Setas do teclado: move a seleção (Shift = passo maior)
function edMoverSelecao(dx, dy){
  const vs = edSelecionados().map(edVisual).filter(Boolean);
  if (!vs.length) return;
  const mapa = {};
  vs.forEach(v => { mapa[v.id] = { x: Math.min(ED_COLUNAS - v.w, Math.max(0, v.x + dx)), y: Math.max(0, v.y + dy) }; });
  edPosicionar(mapa);
}

/* ---------------- copiar e colar (vários de uma vez; vale entre guias e entre relatórios) ---------------- */
const ED_AREA = 'dashbi-estudio-copia';
function edCopiar(){
  const ids = edSelecionados();
  if (!ids.length) return;
  const visuais = ids.map(id => JSON.parse(JSON.stringify(edVisual(id))));
  ed.area = { base: ed.base && ed.base.id, visuais };
  try { localStorage.setItem(ED_AREA, JSON.stringify(ed.area)); } catch (e) {}
  showToast(`${visuais.length} visual(is) copiado(s). Ctrl+V cola (também em outra guia ou relatório).`);
}
function edColar(){
  let area = ed.area;
  if (!area) { try { area = JSON.parse(localStorage.getItem(ED_AREA) || 'null'); } catch (e) {} }
  if (!area || !area.visuais || !area.visuais.length) return showToast('Nada copiado ainda (selecione e use Ctrl+C).', 'erro');
  const outraBase = area.base !== (ed.base && ed.base.id);
  // Cola abaixo de tudo o que já está na guia, mantendo o desenho do grupo
  const fundo = Math.max(0, ...edGuiaAtual().visuais.map(v => v.y + v.h));
  const topo = Math.min(...area.visuais.map(v => v.y));
  const novos = area.visuais.map(o => {
    const v = { ...JSON.parse(JSON.stringify(o)), id: edNovoId('v'), y: o.y - topo + fundo };
    if (outraBase) delete v.campos; // campos de outra base não existem aqui: fica a formatação
    if (v.formato) delete v.formato.visivelSe;
    return v;
  });
  edMudar(() => edGuiaAtual().visuais.push(...novos));
  ed.carregandoGrade = true; novos.forEach(edAdicionarNaGrade); ed.carregandoGrade = false;
  ed.selMulti = novos.map(v => v.id); ed.sel = novos[0].id;
  edMarcarSelecao(); edRenderProps();
  const el = edItemEl(novos[0].id); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  showToast(`${novos.length} visual(is) colado(s)${outraBase ? ' (de outra base: só a formatação; arraste os campos de novo)' : ''}.`);
}

/* ---------------- pincel de formatação ----------------
   Copia a formatação do visual selecionado para o próximo visual clicado. Entre tipos diferentes vai o que é comum
   (título, fundo, borda, sombra, texto); entre visuais do mesmo tipo vai tudo. Duplo clique no pincel = fica ligado. */
const ED_FMT_COMUNS = ['titulo', 'fundo', 'texto'];
function edPincel(fixo){
  if (ed.pincel) return edPincelFim();
  const v = ed.sel && edVisual(ed.sel); if (!v) return;
  ed.pincel = { de: v.id, tipo: v.tipo, formato: JSON.parse(JSON.stringify(v.formato || {})), fixo: !!fixo };
  edEl('ed-overlay').classList.add('ed-pincel-ativo');
  showToast(fixo ? 'Pincel fixo: clique em cada visual que vai receber a formatação. Esc desliga.' : 'Pincel: clique no visual que vai receber a formatação (Esc cancela).', 'sucesso', 4000);
  edRenderFaixa();
}
function edPincelFim(){ ed.pincel = null; const ov = edEl('ed-overlay'); if (ov) ov.classList.remove('ed-pincel-ativo'); edRenderFaixa(); }
function edAplicarPincel(id){
  const p = ed.pincel; if (!p || id === p.de) return;
  edMudar(() => {
    const alvo = edVisual(id), f = alvo.formato = alvo.formato || {};
    const secoes = alvo.tipo === p.tipo ? [...new Set([...Object.keys(p.formato), ...Object.keys(f)])].filter(k => !['filtros', 'visivelSe'].includes(k)) : ED_FMT_COMUNS;
    secoes.forEach(k => { if (p.formato[k]) f[k] = JSON.parse(JSON.stringify(p.formato[k])); else delete f[k]; });
    if (!Object.keys(f).length) delete alvo.formato;
  });
  edRedesenharVisual(id);
  if (!p.fixo) edPincelFim();
}
function edExcluirVisual(id){
  const ids = edSelecionados().includes(id) ? edSelecionados() : [id]; // vários selecionados: exclui todos
  const chaves = ids.map(edVisual).filter(v => v && v.tipo === 'filtro').map(vzChaveFiltro);
  edMudar(() => { const g = edGuiaAtual(); g.visuais = g.visuais.filter(v => !ids.includes(v.id)); });
  ed.carregandoGrade = true; ids.forEach(i => { const el = edItemEl(i); if (el) ed.grade.removeWidget(el); }); ed.carregandoGrade = false;
  edSelecionar(null);
  let mudou = false;
  chaves.forEach(k => { if (ed.filtros && ed.filtros[k]) { delete ed.filtros[k]; mudou = true; } }); // eram filtros em uso
  if (mudou) vzAplicarFiltros();
}
function edDuplicarVisual(id){
  if (edSelecionados().length > 1 && edSelecionados().includes(id)) { const area = ed.area; edCopiar(); edColar(); ed.area = area; return; }
  const o = edVisual(id);
  const v = { ...JSON.parse(JSON.stringify(o)), id: edNovoId('v'), titulo: (o.titulo || '') + ' (CÓPIA)' };
  let achou = false;
  for (let y = 0; y < 400 && !achou; y++) for (let x = 0; x + v.w <= ED_COLUNAS && !achou; x++) if (ed.grade.isAreaEmpty(x, y, v.w, v.h)) { v.x = x; v.y = y; achou = true; }
  edMudar(() => edGuiaAtual().visuais.push(v));
  ed.carregandoGrade = true; edAdicionarNaGrade(v); ed.carregandoGrade = false;
  edSelecionar(v.id);
}

/* ---------------- faixa de menus (estilo Excel) ----------------
   Abas fixas: Página Inicial · Inserir · Cálculos · Exibir.
   Abas do visual (só aparecem com um visual selecionado): Visual (campos) · Formatar. */
const ED_ABAS = [['inicio', 'Página Inicial'], ['inserir', 'Inserir'], ['calculos', 'Cálculos'], ['exibir', 'Exibir']];
const ED_ABAS_VISUAL = [['visual', 'Visual'], ['formatar', 'Formatar']];
const ED_ICO = {
  novo: '<path d="M12 5v14M5 12h14"/>',
  duplicar: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  excluir: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  guia: '<path d="M3 7h6l2 2h10v10H3z"/>',
  previa: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>',
  painel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  publicar: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v5h16v-5"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
  colar: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
  tudo: '<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2"/><path d="M8 12l3 3 5-6"/>',
  pincel: '<path d="M4 4h12v5H4z"/><path d="M16 6h3v5h-8v3"/><path d="M10 14h2v7h-2z"/>',
  alEsq: '<path d="M4 3v18"/><rect x="7" y="6" width="11" height="4" rx="1"/><rect x="7" y="14" width="7" height="4" rx="1"/>',
  alCentro: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="8" y="14" width="8" height="4" rx="1"/>',
  alDir: '<path d="M20 3v18"/><rect x="6" y="6" width="11" height="4" rx="1"/><rect x="10" y="14" width="7" height="4" rx="1"/>',
  alTopo: '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="11" rx="1"/><rect x="14" y="7" width="4" height="7" rx="1"/>',
  alMeio: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="8" width="4" height="8" rx="1"/>',
  alBase: '<path d="M3 20h18"/><rect x="6" y="6" width="4" height="11" rx="1"/><rect x="14" y="10" width="4" height="7" rx="1"/>',
  distH: '<path d="M3 4v16M21 4v16"/><rect x="9" y="7" width="6" height="10" rx="1"/>',
  distV: '<path d="M4 3h16M4 21h16"/><rect x="7" y="9" width="10" height="6" rx="1"/>',
  mesmaL: '<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>',
  mesmaA: '<path d="M12 4v16M9 7l3-3 3 3M9 17l3 3 3-3"/>',
};
// Nome antigo mantido: várias partes do código pedem "redesenhe as propriedades" depois de uma mudança
function edRenderProps(){ edRenderFaixa(); }
const edGrupoFaixa = (rot, html, cls = '') => `<div class="ed-rib-grupo ${cls}"><div class="ed-rib-ctl">${html}</div><div class="ed-rib-rot">${rot}</div></div>`;
const edBotaoGrande = (ico, rot, acao, extra = '') => `<button class="ed-rib-btn" onclick="${acao}" ${extra}>${ico === 'fx' ? '<span class="ed-rib-txtico">fx</span>' : edIcone(ico, 22)}<span>${rot}</span></button>`;
const edBotaoPeq = (ico, rot, acao, extra = '') => `<button class="ed-rib-peq" onclick="${acao}" ${extra}>${edIcone(ico, 15)}<span>${rot}</span></button>`;
function edRenderFaixa(){
  const abasEl = edEl('ed-faixa-abas'), p = edEl('ed-faixa');
  if (!p) return;
  const v = ed.sel ? edVisual(ed.sel) : null;
  if (!ed.aba || (!v && ED_ABAS_VISUAL.some(a => a[0] === ed.aba))) ed.aba = 'inicio';
  const aba = ([k, r], ctx) => `<button class="ed-faixa-aba ${ctx ? 'ctx' : ''} ${ed.aba === k ? 'ativa' : ''}" data-aba="${k}" onclick="ed.aba='${k}'; edRenderFaixa()">${r}</button>`;
  abasEl.innerHTML = ED_ABAS.map(a => aba(a)).join('')
    + (v ? `<span class="ed-faixa-ctx-rot">${estEsc(ED_TIPOS[v.tipo].rotulo)}</span>${ED_ABAS_VISUAL.map(a => aba(a, true)).join('')}` : '');
  p.innerHTML = { inicio: edFaixaInicio, inserir: edFaixaInserir, calculos: edFaixaCalculos, exibir: edFaixaExibir, visual: edFaixaVisual, formatar: v => vzHtmlFormatar(v) }[ed.aba](v);
}
function edFaixaInicio(v){
  const g = edGuiaAtual(), semSel = v ? '' : 'disabled title="Selecione um visual na tela"';
  return edGrupoFaixa('Visual', edBotaoGrande(ED_ICO.novo, 'Novo visual', 'edMenuVisual(null)')
      + `<div class="ed-rib-col">${edBotaoPeq(ED_ICO.duplicar, 'Duplicar', v ? `edDuplicarVisual('${v.id}')` : '', semSel)}${edBotaoPeq(ED_ICO.excluir, 'Excluir', v ? `edExcluirVisual('${v.id}')` : '', semSel)}</div>
        <div class="ed-rib-col">${edBotaoPeq(ED_ICO.copiar, 'Copiar', 'edCopiar()', semSel + ' title="Ctrl+C"')}${edBotaoPeq(ED_ICO.colar, 'Colar', 'edColar()', 'title="Ctrl+V"')}${edBotaoPeq(ED_ICO.tudo, 'Selecionar tudo', 'edSelecionarTudo()', 'title="Ctrl+A"')}</div>`)
    + edFaixaPincel(v) + edFaixaOrganizar()
    + edGrupoFaixa('Guia', `<div class="ed-rib-col">
        <input id="ed-guia-nome" class="ed-inp caixa-alta ed-rib-inp" type="text" value="${estEsc(g.nome)}" title="Nome da guia aberta" onchange="edRenomearGuia('${g.id}', this.value)">
        <div class="ed-rib-lin">${edBotaoPeq(ED_ICO.novo, 'Nova guia', 'edNovaGuia()')}${edBotaoPeq(ED_ICO.excluir, 'Excluir guia', `edExcluirGuia('${g.id}')`, ed.def.guias.length === 1 ? 'disabled' : '')}</div></div>`)
    + edGrupoFaixa('Medidas', edBotaoGrande('fx', 'Nova medida', 'vzAbrirMedida()'))
    + edGrupoFaixa('Publicar', edBotaoGrande(ED_ICO.publicar, ed.rel.publicado_em ? 'Publicar de novo' : 'Publicar', 'edAbrirPublicar()')
      + `<div class="ed-rib-col"><span class="ed-rib-info" id="ed-pub-info">${ed.rel.publicado_em ? 'Publicado em ' + new Date(ed.rel.publicado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Ainda não publicado'}</span>
        <span class="ed-rib-info">Os usuários veem a versão publicada.<br>Editar não muda nada para eles até publicar de novo.</span></div>`)
    + edGrupoFaixa('Dica', `<div class="ed-rib-dica">Clique numa área vazia da tela para adicionar um visual. Clique num visual para ver as abas <b>Visual</b> e <b>Formatar</b>. <b>Delete</b> exclui o selecionado · <b>Ctrl+Z</b> desfaz.</div>`, 'ed-rib-largo');
}
function edFaixaInserir(){
  const botoes = gr => Object.entries(ED_TIPOS).filter(([, t]) => t.grupo === gr).map(([k, t]) => edBotaoGrande(t.icone, t.rotulo, `edInserirVisual('${k}', null)`)).join('');
  return edGrupoFaixa('Card', botoes('Card')) + edGrupoFaixa('Gráficos', botoes('Gráfico')) + edGrupoFaixa('Análise', botoes('Análise')) + edGrupoFaixa('Tabela', botoes('Tabela')) + edGrupoFaixa('Filtro', botoes('Filtro'))
    + edGrupoFaixa('Página', edBotaoGrande(ED_ICO.guia, 'Nova guia', 'edNovaGuia()') + edBotaoGrande('<path d="M4 5h16L4 19h16"/>', 'Guia em Z (macro → micro)', 'edNovaGuiaZ()'));
}
function edFaixaCalculos(){
  const medidas = ed.base.medidas || [];
  return edGrupoFaixa('Medidas', edBotaoGrande('fx', 'Nova medida', 'vzAbrirMedida()')
      + `<div class="ed-rib-col"><select class="ed-inp ed-rib-inp" onchange="if (this.value) vzAbrirMedida(this.value); this.value=''">
          <option value="">Editar medida…</option>${medidas.map(m => `<option value="${m.id}">${estEsc(m.nome)}</option>`).join('')}</select>
        <span class="ed-rib-info">${medidas.length} medida(s) nesta base</span></div>`)
    + edGrupoFaixa('Relações entre bases', edBotaoGrande('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', 'Relacionar base', 'edAbrirRelacao()')
      + `<div class="ed-rib-col ed-rib-rels">${(ed.def.relacoes || []).map(r => `<span class="ed-rib-rel" title="Cada linha desta base busca na base ${estEsc(r.base_nome || '')} a linha com o mesmo valor">
          ${estEsc(edRotuloColuna(r.coluna))} → ${estEsc(r.base_nome || 'base ' + r.base_id)}[${estEsc(r.coluna_rel_rotulo || r.coluna_rel)}]
          <button onclick="edRemoverRelacao('${r.id}')" title="Remover a relação">×</button></span>`).join('') || '<span class="ed-rib-info">Nenhuma relação. Ex.: buscar o TURNO de cada operador numa base do RH.</span>'}</div>`)
    + edGrupoFaixa('Linguagem', `<div class="ed-rib-dica">As medidas são escritas em <b>DAX</b>, como no Power BI. Na janela da medida há a lista de funções com explicação, e o resultado aparece enquanto você digita.</div>`, 'ed-rib-largo');
}
const edRotuloColuna = nome => { const c = (ed.colunasOriginais || ed.base.colunas).find(x => x.nome === nome); return c ? c.rotulo : nome; };

/* ---------------- relações entre bases (etapa E5) ---------------- */
async function edAbrirRelacao(){
  if (ed.base.fonte === 'csat' || ed.base.fonte === 'quadro') { showToast('A base ligada ao banco ainda não aceita relações.', 'erro'); return; }
  let bases;
  try { bases = (await estApi('GET', '/api/estudio/bases')).filter(b => b.id !== ed.base.id && b.fonte !== 'csat' && b.fonte !== 'quadro'); }
  catch (erro) { showToast(erro.message, 'erro'); return; }
  if (!bases.length) { showToast('Não há outra base para relacionar. Crie uma na aba Bases de dados.', 'erro'); return; }
  ed._basesParaRel = bases;
  const minhas = (ed.colunasOriginais || ed.base.colunas).filter(c => c.manter && !c._rel);
  const jan = document.createElement('div');
  jan.id = 'ed-rel'; jan.className = 'modal-overlay active vz-janela';
  jan.innerHTML = `<div class="modal">
    <div class="modal-head"><h3>Relacionar outra base</h3><button class="btn-icon" onclick="edEl('ed-rel').remove()">${edIcone('<path d="M18 6L6 18M6 6l12 12"/>', 18)}</button></div>
    <div class="modal-body">
      <div class="ed-info" style="margin-top:0">Como o <b>PROCV</b>: cada linha da base <b>${estEsc(ed.base.nome)}</b> busca na outra base a linha com o <b>mesmo valor</b> na coluna escolhida e ganha as colunas dela. Se a outra base repetir o valor, vale a primeira linha (a sua base nunca ganha linhas a mais).</div>
      <div class="field"><label>Coluna desta base (${estEsc(ed.base.nome)})</label><select id="ed-rel-col">${minhas.map(c => `<option value="${c.nome}">${estEsc(c.rotulo)}</option>`).join('')}</select></div>
      <div class="field"><label>Base relacionada</label><select id="ed-rel-base" onchange="edRelOpcoes()">${bases.map(b => `<option value="${b.id}">${estEsc(b.nome)}</option>`).join('')}</select></div>
      <div class="field"><label>Coluna da base relacionada com o mesmo valor</label><select id="ed-rel-col2"></select></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" style="width:auto" onclick="edEl('ed-rel').remove()">Cancelar</button>
      <button class="btn btn-primary" style="width:auto" id="ed-rel-ok" onclick="edSalvarRelacao()">Relacionar</button>
    </div></div>`;
  edEl('ed-overlay').appendChild(jan);
  edRelOpcoes();
}
// Ao trocar a base: lista as colunas dela, já sugerindo a de nome parecido com a coluna escolhida desta base
function edRelOpcoes(){
  const b = ed._basesParaRel.find(x => x.id === Number(edEl('ed-rel-base').value));
  const minha = edRotuloColuna(edEl('ed-rel-col').value), norm = s => estSlug(String(s));
  const cols = b.colunas.filter(c => c.manter);
  const sugerida = cols.find(c => norm(c.rotulo) === norm(minha)) || cols.find(c => norm(c.rotulo).includes(norm(minha)) || norm(minha).includes(norm(c.rotulo)));
  edEl('ed-rel-col2').innerHTML = cols.map(c => `<option value="${c.nome}" ${sugerida && sugerida.nome === c.nome ? 'selected' : ''}>${estEsc(c.rotulo)}</option>`).join('');
}
async function edSalvarRelacao(){
  const b = ed._basesParaRel.find(x => x.id === Number(edEl('ed-rel-base').value));
  const coluna = edEl('ed-rel-col').value, coluna_rel = edEl('ed-rel-col2').value;
  if (!coluna || !coluna_rel) { showToast('Escolha as duas colunas.', 'erro'); return; }
  if ((ed.def.relacoes || []).some(r => r.base_id === b.id)) { showToast(`A base ${b.nome} já está relacionada a este relatório.`, 'erro'); return; }
  const usados = new Set((ed.def.relacoes || []).map(r => r.id));
  let n = 1; while (usados.has('r' + n)) n++;
  const rotulo2 = (b.colunas.find(c => c.nome === coluna_rel) || {}).rotulo || coluna_rel;
  edMudar(() => { ed.def.relacoes = [...(ed.def.relacoes || []), { id: 'r' + n, base_id: b.id, base_nome: b.nome, coluna, coluna_rel, coluna_rel_rotulo: rotulo2 }]; });
  edEl('ed-rel').remove();
  showToast(`Relação criada: ${edRotuloColuna(coluna)} → ${b.nome}[${rotulo2}]. Carregando as colunas novas…`);
  edRenderFaixa();
  await vzCarregarDados();
}
async function edRemoverRelacao(id){
  const r = (ed.def.relacoes || []).find(x => x.id === id);
  const prefixo = id + '__';
  const usados = ed.def.guias.flatMap(g => g.visuais).filter(v => Object.values(v.campos || {}).flat().some(it => it.tipo === 'col' && String(it.col).startsWith(prefixo)));
  if (!confirm(`Remover a relação com a base ${r.base_nome}?${usados.length ? ` ${usados.length} visual(is) usam colunas dela e ficarão sem esses campos.` : ''}`)) return;
  edMudar(() => {
    ed.def.relacoes = ed.def.relacoes.filter(x => x.id !== id);
    if (!ed.def.relacoes.length) delete ed.def.relacoes;
    for (const v of ed.def.guias.flatMap(g => g.visuais)) for (const k in (v.campos || {})) v.campos[k] = v.campos[k].filter(it => !(it.tipo === 'col' && String(it.col).startsWith(prefixo)));
  });
  edRenderFaixa();
  await vzCarregarDados();
}
function edFaixaExibir(){
  const zooms = [['ajustar', 'Ajustar'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%'], ['1.25', '125%']];
  return edGrupoFaixa('Modo', edBotaoGrande(ED_ICO.previa, 'Prévia', 'edAlternarPrevia()'))
    + edGrupoFaixa('Zoom', `<div class="ed-rib-lin ed-rib-zoom">${zooms.map(([z, r]) => `<button class="ed-rib-peq ${ed.zoom === z ? 'ativo' : ''}" onclick="edEl('ed-zoom').value='${z}'; edZoom('${z}'); edRenderFaixa()">${r}</button>`).join('')}</div>`)
    + edGrupoFaixa('Menu das guias (tela do usuário)', `<div class="ed-rib-col"><select class="ed-inp ed-rib-inp" id="ed-menu-pos" onchange="edMudarMenu(this.value)">
        ${[['topo', 'Abas no topo'], ['esquerda', 'Menu à esquerda'], ['cabecalho', 'Guias no cabeçalho (como o Painel CSAT)']].map(([k, r]) => `<option value="${k}" ${(ed.def.menu || 'topo') === k ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <span class="ed-rib-info">Veja o resultado na Prévia.</span></div>`)
    + edGrupoFaixa('Meta do relatório', ed.base.fonte === 'csat'
      ? `<div class="ed-rib-dica">Base do Painel CSAT: a meta é a mesma do painel (ajuste no − / + do cabeçalho; grava ao Salvar).</div>`
      : `<div class="ed-rib-col"><input class="ed-inp ed-rib-inp" type="number" min="0" max="1000000" placeholder="sem meta" value="${ed.def.meta ?? ''}" onchange="edDefinirMeta(this.value)">
         <span class="ed-rib-info">Em % (ex.: 90). Usada nas cores "dentro / fora da meta" e em META() no DAX.</span></div>`, 'ed-rib-largo')
    + edGrupoFaixa('Painéis', `<label class="ed-rib-chk"><input type="checkbox" ${edEl('ed-corpo').classList.contains('dados-fechado') ? '' : 'checked'} onchange="edAlternarDados()"> Painel de dados (colunas e medidas)</label>`);
}
function edDefinirMeta(txt){
  const v = String(txt).trim() === '' ? null : Number(String(txt).replace(',', '.'));
  edMudar(() => { if (v == null || isNaN(v)) delete ed.def.meta; else ed.def.meta = v; });
  ed.meta = ed.def.meta ?? null;
  edAtualizarMeta(); vzRenderTodos();
}
// Pincel de formatação (como no Excel): clique = uma vez; duplo clique = fica ligado
function edFaixaPincel(v){
  return edGrupoFaixa('Formatação', `<button class="ed-rib-btn ${ed.pincel ? 'ativo' : ''}" onclick="edPincel()" ondblclick="edPincelFim(); edPincel(true)" ${v || ed.pincel ? '' : 'disabled'}
      title="Pincel: copia a formatação do visual selecionado para o próximo que você clicar (duplo clique = fica ligado; Esc desliga)">${edIcone(ED_ICO.pincel, 22)}<span>${ed.pincel ? 'Pincel ligado' : 'Pincel'}</span></button>`);
}
// Organizar: alinhar, distribuir, mesmo tamanho e posição exata
function edFaixaOrganizar(){
  const ids = edSelecionados(), n = ids.length, v = ed.sel ? edVisual(ed.sel) : null;
  const b = (ico, rot, acao, min, dica) => `<button class="ed-rib-ico" onclick="${acao}" ${n >= min ? '' : 'disabled'} title="${dica}">${edIcone(ico, 16)}<span class="sr">${rot}</span></button>`;
  const alinhar = `<div class="ed-rib-lin">
      ${b(ED_ICO.alEsq, 'Esquerda', "edAlinhar('esquerda')", 1, 'Alinhar à esquerda')}${b(ED_ICO.alCentro, 'Centro', "edAlinhar('centro')", 1, 'Centralizar na horizontal')}${b(ED_ICO.alDir, 'Direita', "edAlinhar('direita')", 1, 'Alinhar à direita')}
      ${b(ED_ICO.alTopo, 'Topo', "edAlinhar('topo')", 1, 'Alinhar em cima')}${b(ED_ICO.alMeio, 'Meio', "edAlinhar('meio')", 2, 'Centralizar na vertical')}${b(ED_ICO.alBase, 'Base', "edAlinhar('base')", 2, 'Alinhar embaixo')}</div>
    <div class="ed-rib-lin">
      ${b(ED_ICO.distH, 'Distribuir H', "edDistribuir('h')", 3, 'Distribuir na horizontal (espaço igual)')}${b(ED_ICO.distV, 'Distribuir V', "edDistribuir('v')", 3, 'Distribuir na vertical (espaço igual)')}
      ${b(ED_ICO.mesmaL, 'Mesma largura', "edMesmoTamanho('w')", 2, 'Mesma largura do visual principal')}${b(ED_ICO.mesmaA, 'Mesma altura', "edMesmoTamanho('h')", 2, 'Mesma altura do visual principal')}</div>`;
  const campo = (k, rot, val, dica) => `<label class="ed-pos" title="${dica}"><span>${rot}</span><input type="number" class="ed-inp" value="${val}" ${v ? '' : 'disabled'} onchange="edPosicaoExata('${k}', this.value)"></label>`;
  const posicao = `<div class="ed-rib-lin">${campo('x', 'Col.', v ? v.x + 1 : '', 'Coluna onde começa (1 a ' + ED_COLUNAS + ')')}${campo('y', 'Lin.', v ? v.y + 1 : '', 'Linha onde começa')}</div>
    <div class="ed-rib-lin">${campo('w', 'Larg.', v ? v.w : '', 'Largura em colunas (a página tem ' + ED_COLUNAS + ')')}${campo('h', 'Alt.', v ? v.h : '', 'Altura em linhas')}</div>`;
  return edGrupoFaixa(n > 1 ? `Organizar · ${n} selecionados` : 'Organizar', `<div class="ed-rib-col">${alinhar}</div>`)
    + edGrupoFaixa(n > 1 ? 'Posição do principal' : 'Posição e tamanho', `<div class="ed-rib-col">${posicao}</div>`);
}
function edFaixaVisual(v){
  return edGrupoFaixa('Visual', `<div class="ed-rib-col">
        <input id="ed-vis-titulo" class="ed-inp caixa-alta ed-rib-inp" type="text" value="${estEsc(v.titulo)}" title="Título do visual" oninput="edTituloAoVivo('${v.id}', this.value)" onchange="edMudar(() => { edVisual('${v.id}').titulo = this.value.trim().toUpperCase(); })">
        <select id="ed-vis-tipo" class="ed-inp ed-rib-inp" title="Tipo de visual" onchange="edTrocarTipo('${v.id}', this.value)">
          ${['Card', 'Gráfico', 'Análise', 'Tabela', 'Filtro'].map(gr => `<optgroup label="${gr}">${Object.entries(ED_TIPOS).filter(([, t]) => t.grupo === gr).map(([k, t]) => `<option value="${k}" ${k === v.tipo ? 'selected' : ''}>${t.rotulo}</option>`).join('')}</optgroup>`).join('')}
        </select></div>`)
    + edGrupoFaixa('Campos — arraste colunas e medidas do painel Dados para cá ou para o visual', `<div class="ed-slots">${vzHtmlSlots(v)}</div>`, 'ed-rib-campos')
    + edGrupoFaixa('Ações', `<div class="ed-rib-col">${edBotaoPeq(ED_ICO.duplicar, 'Duplicar', `edDuplicarVisual('${v.id}')`)}${edBotaoPeq(ED_ICO.excluir, 'Excluir', `edExcluirVisual('${v.id}')`)}
        <span class="ed-rib-info">coluna ${v.x + 1}, linha ${v.y + 1} · ${v.w} × ${v.h} (a página tem ${ED_COLUNAS} colunas)</span></div>`)
    + edFaixaPincel(v) + edFaixaOrganizar();
}
// Menu das guias na tela do usuário: abas no topo (padrão) ou lista à esquerda
function edMudarMenu(pos){
  edMudar(() => { if (pos === 'esquerda' || pos === 'cabecalho') ed.def.menu = pos; else delete ed.def.menu; });
  edAplicarMenu();
}
function edAplicarMenu(){ const ov = edEl('ed-overlay'); if (ov) ov.classList.toggle('menu-esquerda', ed.def.menu === 'esquerda'); edPosicionarGuias(); }

/* ---------------- publicar (etapa E2d) ----------------
   Cria (1ª vez) ou atualiza o card na seção Relatórios e copia o desenho atual para a "versão publicada". */
const ED_CATEGORIAS = ['Comercial', 'Financeiro', 'Operações', 'RH', 'Marketing'];
function edAbrirPublicar(){
  const card = (typeof reports !== 'undefined' ? reports : []).find(r => r.tipo === 'estudio' && r.estudioId === ed.rel.id);
  const jan = document.createElement('div');
  jan.id = 'ed-pub'; jan.className = 'modal-overlay active vz-janela';
  jan.innerHTML = `<div class="modal">
    <div class="modal-head"><h3>${ed.rel.publicado_em ? 'Publicar de novo' : 'Publicar relatório'}</h3>
      <button class="btn-icon" onclick="edEl('ed-pub').remove()">${edIcone('<path d="M18 6L6 18M6 6l12 12"/>', 18)}</button></div>
    <div class="modal-body">
      <div class="ed-info" style="margin-top:0">O relatório <b>${estEsc(ed.rel.nome)}</b> vira um card na seção <b>Relatórios</b> para todos os usuários (você pode ocultar ou descontinuar o card depois, como os outros).
        ${ed.sujo ? '<br><b>Há alterações não salvas: elas serão salvas antes de publicar.</b>' : ''}</div>
      <div class="field"><label>Categoria</label><select id="ed-pub-cat">${ED_CATEGORIAS.map(c => `<option ${card ? (card.category === c ? 'selected' : '') : (c === 'Operações' ? 'selected' : '')}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Descrição (opcional)</label><input id="ed-pub-desc" class="caixa-alta" type="text" value="${card && card.desc !== 'Sem descrição.' ? estEsc(card.desc) : ''}" placeholder="EX.: CSAT POR OPERAÇÃO E SUPERVISOR"></div>
      <!-- Operações que veem o card (nenhuma marcada = todas) — mesma lista da janela de relatório (script.js) -->
      <div class="field"><label>Visível para as operações</label><div class="ops-escolha" id="ed-pub-ops"><span class="field-hint">carregando…</span></div>
        <div class="field-hint">Nenhuma marcada = todas as operações.</div></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" style="width:auto" onclick="edEl('ed-pub').remove()">Cancelar</button>
      <button class="btn btn-primary" style="width:auto" id="ed-pub-ok" onclick="edPublicar()">Publicar</button>
    </div></div>`;
  edEl('ed-overlay').appendChild(jan);
  const marcadas = card && Array.isArray(card.operacoes) ? card.operacoes : [];
  (typeof carregarOperacoes === 'function' ? carregarOperacoes() : Promise.resolve([])).then(ops => {
    const alvo = edEl('ed-pub-ops'); if (!alvo) return;
    if (typeof operacoesParaEscolha === 'function') ops = operacoesParaEscolha(ops, marcadas); // inativas só se já marcadas
    alvo.innerHTML = ops.length ? ops.map(o => `<label class="ops-item"><input type="checkbox" value="${o.id}" ${marcadas.includes(Number(o.id)) ? 'checked' : ''}> ${estEsc(o.nome)}</label>`).join('')
      : '<span class="field-hint">Nenhuma operação cadastrada.</span>';
  });
}
async function edPublicar(){
  const botao = edEl('ed-pub-ok'); botao.disabled = true; botao.textContent = 'Publicando…';
  try {
    if (ed.sujo) { await edSalvar(); if (ed.sujo) throw new Error('não foi possível salvar as alterações antes de publicar'); }
    const r = await estApi('POST', `/api/estudio/relatorios/${ed.rel.id}/publicar`, {
      categoria: edEl('ed-pub-cat').value, descricao: edEl('ed-pub-desc').value.trim().toUpperCase() || null,
      operacoes: [...document.querySelectorAll('#ed-pub-ops input:checked')].map(i => Number(i.value)), // nenhuma = todas
    });
    ed.rel.publicado_em = r.relatorio.publicado_em;
    edEl('ed-pub').remove();
    showToast(r.cardCriado ? `Publicado! O card ${r.card.titulo} já está na seção Relatórios.` : 'Publicado! Os usuários já veem esta versão.');
    edRenderFaixa();
    if (typeof carregarRelatorios === 'function') carregarRelatorios();
  } catch (erro) {
    showToast('Não foi possível publicar: ' + erro.message, 'erro');
    botao.disabled = false; botao.textContent = 'Publicar';
  }
}

function edTituloAoVivo(id, txt){
  const el = document.querySelector(`#ed-grade .ed-vis[data-id="${id}"] .ed-vis-titulo`);
  if (el) el.textContent = txt.toUpperCase();
}
function edTrocarTipo(id, tipo){
  const eraFiltro = edVisual(id).tipo === 'filtro';
  edMudar(() => { edVisual(id).tipo = tipo; });
  edRedesenharVisual(id); edRenderProps();
  if (eraFiltro || tipo === 'filtro') { if (ed.filtros) delete ed.filtros[vzChaveDoId(id)]; vzAplicarFiltros(); }
}

/* ---------------- desfazer / refazer / salvar ---------------- */
// Toda alteração passa aqui: guarda o estado anterior para o Ctrl+Z
function edMudar(fn, daGrade){
  ed.historico.push(ed.ultimo);
  if (ed.historico.length > 100) ed.historico.shift();
  ed.futuro = [];
  fn();
  ed.ultimo = JSON.stringify(ed.def);
  ed.sujo = true;
  edAtualizarBotoes();
  if (daGrade && ed.sel) edRenderProps();
}
function edDesfazer(){
  if (!ed.historico.length) return;
  ed.futuro.push(ed.ultimo);
  edRestaurar(ed.historico.pop());
}
function edRefazer(){
  if (!ed.futuro.length) return;
  ed.historico.push(ed.ultimo);
  edRestaurar(ed.futuro.pop());
}
function edRestaurar(json){
  ed.def = JSON.parse(json);
  ed.ultimo = json;
  if (!ed.def.guias.some(g => g.id === ed.guia)) ed.guia = ed.def.guias[0].id;
  ed.sel = null; ed.sujo = true;
  edRenderGuias(); edCarregarGuia(); edRenderProps(); edAtualizarBotoes(); edAplicarMenu();
}
function edAtualizarBotoes(){
  const d = edEl('ed-desfazer'), r = edEl('ed-refazer'), s = edEl('ed-salvar');
  if (d) d.disabled = !ed.historico.length;
  if (r) r.disabled = !ed.futuro.length;
  if (s) s.classList.toggle('pendente', ed.sujo);
}
async function edSalvar(){
  const s = edEl('ed-salvar');
  s.disabled = true; s.textContent = 'Salvando…';
  try {
    const corpo = { definicao: ed.def };
    const nome = edEl('ed-nome').value.trim().toUpperCase();
    if (nome !== ed.rel.nome) corpo.nome = nome;
    const r = await estApi('PUT', '/api/estudio/relatorios/' + ed.rel.id, corpo);
    ed.rel = r.relatorio;
    // Meta do Painel CSAT alterada aqui: grava no banco do mesmo jeito que o "Salvar" do painel (vale para os dois)
    if (ed.metaAlterada && ed.base.fonte === 'csat') {
      const { importacao } = await estApi('POST', '/api/csat/importacoes', { arquivo: null, linhas_lidas: 0, ignoradas: 0, meta: ed.meta });
      await estApi('POST', `/api/csat/importacoes/${importacao.id}/concluir`);
      ed.metaSalva = ed.meta; ed.metaAlterada = false;
    }
    ed.sujo = false;
    showToast('Relatório salvo.');
  } catch (erro) {
    showToast(erro.message, 'erro');
  } finally {
    s.disabled = false; s.textContent = 'Salvar';
    edAtualizarBotoes();
  }
}

/* ---------------- atalhos de teclado ---------------- */
function edTeclas(e){
  if (!edEl('ed-overlay')) return;
  const digitando = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName);
  if (e.key === 'Escape') {
    if (ed.pincel) { edPincelFim(); return; }
    if (edEl('vz-filtro-pop')) { vzFecharListaFiltro(); return; }
    if (edEl('ed-pub') || edEl('vz-janela')) return; // janelas abertas fecham pelos botões
    edEl('ed-menu').classList.add('hidden');
    if (ed.leitura) edFechar(); // tela do usuário: Esc fecha o relatório
    return;
  }
  if (digitando || ed.previa) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); edDesfazer(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); edRefazer(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); edSalvar(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.sel) { e.preventDefault(); edExcluirVisual(ed.sel); }
  else if (ed.leitura) return;
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && ed.sel) { e.preventDefault(); edCopiar(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); edColar(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && ed.sel) { e.preventDefault(); edDuplicarVisual(ed.sel); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); edSelecionarTudo(); }
  else if (ed.sel && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const p = e.shiftKey ? ED_F : 1; // Shift: passo maior
    edMoverSelecao(e.key === 'ArrowLeft' ? -p : e.key === 'ArrowRight' ? p : 0, e.key === 'ArrowUp' ? -p : e.key === 'ArrowDown' ? p : 0);
  }
}
