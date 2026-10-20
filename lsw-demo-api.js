/* =====================================================================
   LSW_DashBi · SERVIDOR DE DEMONSTRAÇÃO (roda dentro do navegador)
   No sistema real, a página conversa com um servidor (Node + Express) que guarda tudo num banco (Supabase).
   Aqui, para a demonstração não precisar de servidor nem de banco, este arquivo "finge" ser o servidor:
   - toda chamada para  lsw-demo/api/...  é respondida aqui mesmo, com as mesmas regras do servidor real;
   - os dados ficam guardados NESTE navegador (IndexedDB, um "armazenamento local" maior que o localStorage);
   - as planilhas do Estúdio (arquivos Parquet) também ficam no navegador (endereços  lsw-arquivo://...).
   Não há segurança de verdade (não precisa: são dados fictícios). Para começar do zero: LSW_DEMO.zerar().
   ===================================================================== */
const LSW_DEMO = (() => {
  const BASE = 'lsw-demo/', ARQ = 'lsw-arquivo://';
  const fetchOriginal = window.fetch.bind(window);

  /* ---------- armazenamento no navegador (IndexedDB) ---------- */
  let idbP = null;
  function idb() {
    if (!idbP) idbP = new Promise((ok, falha) => {
      const req = indexedDB.open('lsw-dashbi', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); req.result.createObjectStore('arquivos'); };
      req.onsuccess = () => ok(req.result); req.onerror = () => falha(req.error);
    });
    return idbP;
  }
  const idbOp = (loja, modo, fn) => idb().then(d => new Promise((ok, falha) => { const tx = d.transaction(loja, modo); const r = fn(tx.objectStore(loja)); tx.oncomplete = () => ok(r && r.result); tx.onerror = () => falha(tx.error); }));
  const idbLer = (loja, k) => idbOp(loja, 'readonly', s => s.get(k));
  const idbGravar = (loja, k, v) => idbOp(loja, 'readwrite', s => s.put(v, k));

  let db = null, pronto = null, timer = null;
  const agora = () => new Date().toISOString();
  function salvar() { clearTimeout(timer); timer = setTimeout(() => idbGravar('kv', 'db', db).catch(() => {}), 150); }
  async function carregar() {
    db = await idbLer('kv', 'db').catch(() => null);
    if (!db || db.versao !== 1) { db = semente(); await idbGravar('kv', 'db', db); }
    if (!db.perfis_acesso) { semearAcessos(db); await idbGravar('kv', 'db', db); } // demonstração salva antes dos perfis
    if ((db.operacoes || []).some(o => o.ativo === undefined)) { db.operacoes.forEach(o => { if (o.ativo === undefined) o.ativo = true; }); await idbGravar('kv', 'db', db); }
  }
  // Perfis de acesso e operações da demonstração (o SUPERVISOR mostra um perfil com só parte do sistema)
  function semearAcessos(d) {
    d.seq.perfil = 4; d.seq.oper = 3;
    d.perfis_acesso = [
      { id: 1, nome: 'ADMINISTRADOR', permissoes: ['*'], sistema: true, criado_em: agora() },
      { id: 2, nome: 'USUÁRIO', permissoes: ['relatorios'], sistema: true, criado_em: agora() },
      { id: 3, nome: 'SUPERVISOR', permissoes: ['relatorios', 'quadro', 'quadro.atual', 'quadro.painel', 'quadro.solicitacoes', 'quadro.solicitar'], sistema: false, criado_em: agora() },
    ];
    d.operacoes = [{ id: 1, nome: 'CENTRAL ATENDE', cliente: 'CENTRAL ATENDE', ativo: true, criado_em: agora() }, { id: 2, nome: 'OUTRA OPERAÇÃO', cliente: 'OUTRO CLIENTE', ativo: true, criado_em: agora() }];
    (d.usuarios || []).forEach(u => { if (u.operacao_id === undefined) u.operacao_id = 1; });
  }
  pronto = carregar();

  /* ---------- dados iniciais da demonstração ---------- */
  function semente() {
    const d = { versao: 1, seq: { rel: 1, imp: 1, base: 1, carga: 1, erel: 1 },
      usuarios: [], relatorios: [], perfis_acesso: [], operacoes: [], csat_avaliacoes: [], csat_importacoes: [], estudio_bases: [], estudio_arquivos: [], estudio_cargas: [], estudio_relatorios: [] };
    const u = (id, email, nome, perfil, matricula, extra = {}) => d.usuarios.push({ id, email, senha: 'demo123', nome, perfil, matricula, ativo: true, troca_senha_obrigatoria: false, reset_solicitado_em: null, criado_em: agora(), ...extra });
    u('u-admin', 'admin@lsw.demo', 'ADMINISTRADOR DEMO', 'admin', 1001);
    u('u-usuario', 'usuario@lsw.demo', 'USUÁRIO DEMO', 'usuario', 1002);
    u('u-3', 'marina.costa@lsw.demo', 'MARINA COSTA', 'usuario', 1003, { reset_solicitado_em: agora() });
    u('u-4', 'otavio.lima@lsw.demo', 'OTÁVIO LIMA', 'usuario', 1004, { ativo: false });
    u('u-sup', 'supervisor@lsw.demo', 'SUPERVISORA DEMO', 'usuario', 1005, { perfil_acesso_id: 3 });
    semearAcessos(d);
    // Painel CSAT com avaliações fictícias
    const imp = { id: d.seq.imp++, importado_por: 'u-admin', importado_em: agora(), arquivo: 'base_intra_exemplo.xlsx', linhas_lidas: 0, ignoradas: 0, inseridas: 0, atualizadas: 0, sem_alteracao: 0, meta: 85 };
    d.csat_importacoes.push(imp);
    db = d; // as funções abaixo usam "db"
    const linhas = LSW_DADOS.avaliacoesCsat();
    imp.linhas_lidas = linhas.length;
    csatImportarLote(imp.id, linhas);
    d.relatorios.push({ id: d.seq.rel++, titulo: 'PAINEL CSAT', categoria: 'Operações', descricao: 'SATISFAÇÃO DOS CLIENTES · PAINEL FEITO EM CÓDIGO', link: null, tipo: 'csat', visivel: true, ativo: true, descontinuado_em: null, estudio_relatorio_id: null, criado_por: 'u-admin', criado_em: agora(), atualizado_em: agora() });
    // O mesmo painel, montado no Estúdio (base ligada ao banco) e publicado
    const { relatorio_id } = csatEditor('u-admin');
    const rel = d.estudio_relatorios.find(r => r.id === relatorio_id);
    rel.definicao_publicada = JSON.parse(JSON.stringify(rel.definicao)); rel.publicado_em = agora();
    d.relatorios.push({ id: d.seq.rel++, titulo: rel.nome, categoria: 'Operações', descricao: 'O PAINEL CSAT RECRIADO NO ESTÚDIO, SEM CÓDIGO', link: null, tipo: 'estudio', visivel: true, ativo: true, descontinuado_em: null, estudio_relatorio_id: rel.id, criado_por: 'u-admin', criado_em: agora(), atualizado_em: agora() });
    return d;
  }

  /* ---------- Painel CSAT (mesma lógica das funções do banco real) ---------- */
  function csatImportarLote(impId, linhasIn) {
    const entrada = new Map();
    for (const x of linhasIn) { const k = x.i + '|' + x.o, ex = entrada.get(k); if (!ex || (!ex.s && x.s)) entrada.set(k, x); }
    const porChave = new Map(db.csat_avaliacoes.map(a => [a.id_conversa + '|' + a.operador, a]));
    let ins = 0, upd = 0;
    for (const [k, x] of entrada) {
      const novo = { data: x.d, supervisor: x.s || null, operacao: x.p || null, local: x.l || null, nota: x.n, intervalo: x.h ?? null };
      const t = porChave.get(k);
      if (!t) { db.csat_avaliacoes.push({ id_conversa: x.i, operador: x.o, ...novo, importacao_id: impId }); ins++; continue; }
      const fim = { data: novo.data, supervisor: novo.supervisor ?? t.supervisor, operacao: novo.operacao ?? t.operacao, local: novo.local ?? t.local, nota: novo.nota, intervalo: novo.intervalo ?? t.intervalo ?? null };
      if (['data', 'supervisor', 'operacao', 'local', 'nota', 'intervalo'].some(c => fim[c] !== (t[c] ?? null))) { Object.assign(t, fim, { importacao_id: impId }); upd++; }
    }
    const imp = db.csat_importacoes.find(i => i.id === impId), sem = entrada.size - ins - upd;
    if (imp) { imp.inseridas += ins; imp.atualizadas += upd; imp.sem_alteracao += sem; }
    return { inseridas: ins, atualizadas: upd, sem_alteracao: sem };
  }
  function csatDados(mesPedido) {
    const todas = db.csat_avaliacoes;
    const meses = [...new Set(todas.map(a => a.data.slice(0, 7)))].sort().reverse();
    const mes = mesPedido || meses[0] || null;
    const base = todas.filter(a => a.data.slice(0, 7) === mes).map(a => ({ ...a, sup: a.supervisor || '', oper: a.operacao || '', loc: a.local || '' }));
    const dic = c => [...new Set(base.map(a => a[c]))].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    const op = dic('operador'), sup = dic('sup'), oper = dic('oper'), loc = dic('loc');
    const inv = [...db.csat_importacoes].reverse();
    const ult = inv.find(i => i.arquivo), meta = inv.find(i => i.meta != null);
    const idx = l => { const m = new Map(l.map((v, i) => [v, i])); return v => m.get(v); };
    const io = idx(op), is = idx(sup), ip = idx(oper), il = idx(loc);
    return { mes, meses, meta: meta ? meta.meta : null, ultima: ult ? { em: ult.importado_em, arquivo: ult.arquivo } : null, dic: { op, sup, oper, loc },
      linhas: base.map(a => [+a.data.slice(8), io(a.operador), is(a.sup), ip(a.oper), il(a.loc), a.nota, a.intervalo ?? null]) };
  }
  function csatDetalhe({ mes, tipo, operacoes, locais, supervisores, datas, intervalos }) {
    const ok = n => (tipo === 'P' ? n >= 4 : tipo === 'D' ? n <= 2 : n === 3);
    const lista = v => (Array.isArray(v) && v.length ? v : null);
    const [o, l, s, d, h] = [lista(operacoes), lista(locais), lista(supervisores), lista(datas), lista(intervalos)];
    const hh = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    return db.csat_avaliacoes.filter(a => a.data.slice(0, 7) === mes && ok(a.nota) && (!o || o.includes(a.operacao || '')) && (!l || l.includes(a.local || ''))
        && (!s || s.includes(a.supervisor || '')) && (!d || d.includes(a.data)) && (!h || h.includes(a.intervalo ?? -1)))
      .map(a => ({ id: a.id_conversa, data: a.data.split('-').reverse().join('/'), op: a.operador, sup: a.supervisor || 'Sem supervisor', oper: a.operacao || 'Sem operação', loc: a.local || 'Sem local', nota: a.nota, hora: a.intervalo == null ? 'Sem horário' : hh(a.intervalo) }));
  }

  /* ---------- Painel CSAT no Estúdio: base "ligada ao banco" + relatório-modelo (cópia do servidor real) ---------- */
  const CSAT_COLUNAS = [['data', 'DATA', 'data'], ['operador', 'OPERADOR', 'texto'], ['supervisor', 'SUPERVISOR', 'texto'], ['operacao', 'OPERAÇÃO', 'texto'],
    ['eps', 'EPS', 'texto'], ['local', 'LOCAL', 'texto'], ['nota', 'NOTA', 'inteiro'], ['hora', 'HORÁRIO', 'hora']]
    .map(([nome, rotulo, tipo]) => ({ origem: nome, nome, rotulo, tipo, manter: true, vazio: 'nulo', padrao: null }));
  const CSAT_MEDIDAS = [['csat_m_csat', 'CSAT', 'AVERAGE(dados[NOTA]) / 5', 'porcentagem'], ['csat_m_aval', 'AVALIAÇÕES', 'COUNTROWS(dados)', 'inteiro'],
    ['csat_m_prom', 'PROMOTORES', 'CALCULATE(COUNTROWS(dados), dados[NOTA] >= 4)', 'inteiro'], ['csat_m_neut', 'NEUTROS', 'CALCULATE(COUNTROWS(dados), dados[NOTA] = 3)', 'inteiro'],
    ['csat_m_detr', 'DETRATORES', 'CALCULATE(COUNTROWS(dados), dados[NOTA] <= 2)', 'inteiro'], ['csat_m_pdet', '% DETRATORES', 'DIVIDE([DETRATORES], [AVALIAÇÕES])', 'porcentagem'],
    ['csat_m_oper', 'OPERADORES', 'DISTINCTCOUNT(dados[OPERADOR])', 'inteiro']].map(([id, nome, formula, formato]) => ({ id, nome, tipo: 'dax', formula, formato }));
  function csatModeloDefinicao() {
    const med = (id, rotulo) => ({ tipo: 'medida', id, ...(rotulo ? { rotulo } : {}) });
    const col = (c, rotulo) => ({ tipo: 'col', col: c, ...(rotulo ? { rotulo } : {}) });
    const semMoldura = { titulo: { mostrar: false }, fundo: { cor: 'transparent', borda: false } };
    const filtros = g => [['oper', 'operacao', 'Todas as operações'], ['eps', 'eps', 'Todas as EPS'], ['loc', 'local', 'Todos os locais'],
      ['sup', 'supervisor', 'Todos os supervisores'], ['data', 'data', 'Todas as datas'], ['hora', 'hora', 'Todos os horários']]
      .map(([k, c, todos], i) => ({ id: `f_${k}_${g}`, tipo: 'filtro', titulo: todos.replace(/^Tod[ao]s? (as |os )?/, '').toUpperCase(), x: i * 4, y: 0, w: 4, h: 1,
        campos: { coluna: [col(c)] }, formato: { ...semMoldura, filtro: { alcance: 'relatorio', sinc: k, estilo: 'compacto', cascata: false, todos, ...(k === 'data' ? { modo: 'lista' } : {}) } } }));
    const card = (id, m, rotulo, sub, destaque, x, w) => ({ id, tipo: 'card', titulo: rotulo.toUpperCase(), x, y: 1, w, h: 3, campos: { valores: [med(m)] },
      formato: { titulo: { mostrar: false }, card: { rotuloTexto: rotulo, rotuloPos: 'acima', alinhar: 'esquerda', destaque, ...sub } } });
    const colunasPainel = [med('csat_m_aval', 'Avaliações'), med('csat_m_prom', 'Promotor'), med('csat_m_neut', 'Neutro'), med('csat_m_detr', 'Detrator'), med('csat_m_csat', 'CSAT')];
    const tabelaPainel = { layout: 'lista', status: true, metaMedida: 'csat_m_csat', totalLinhas: false, ordem: { i: 0, dir: 'desc' } };
    const matriz = (id, c, rotulo, titulo) => ({ id, tipo: 'tabela', titulo, x: 0, y: 14, w: 24, h: 13,
      campos: { linhas: [col(c, rotulo)], colunas: [col('hora')], valores: [med('csat_m_csat', 'CSAT'), med('csat_m_aval', 'aval')] },
      formato: { tabela: { subvalor: 1, metaMedida: 'csat_m_csat', metaEstilo: 'fundo', totalLinhas: false, totalColunas: true, zebra: false, ordem: { i: 1, dir: 'desc' } } } });
    return { grade: 24, menu: 'cabecalho', guias: [
      { id: 'g1', nome: 'Visão Geral', visuais: [...filtros('g1'),
        card('k_csat', 'csat_m_csat', 'CSAT global', { sub: 'meta' }, 'accent', 0, 5), card('k_p', 'csat_m_prom', 'Promotoras (4 e 5)', { sub: 'pct', subDe: 'csat_m_aval' }, 'success', 5, 5),
        card('k_n', 'csat_m_neut', 'Neutras (3)', { sub: 'pct', subDe: 'csat_m_aval' }, 'warning', 10, 5), card('k_d', 'csat_m_detr', 'Detratoras (1 e 2)', { sub: 'pct', subDe: 'csat_m_aval' }, 'danger', 15, 5),
        card('k_t', 'csat_m_aval', 'Notas avaliadas', { sub: 'mes' }, 'faint', 20, 4),
        { id: 'l_geral', tipo: 'linhas', titulo: 'Evolução do CSAT por dia', x: 0, y: 4, w: 24, h: 12, campos: { eixo: [
          { tipo: 'col', col: 'data', rotulo: 'Intraday', titulo: 'Evolução do CSAT por dia', dica: 'O filtro de datas não se aplica ao gráfico', ignora: ['data'] },
          { tipo: 'col', col: 'hora', rotulo: 'Intrahora', titulo: 'CSAT por intervalo de 30 minutos', dica: '{n} avaliações sem horário não entram nesta visão', dicaSem: 'Soma dos dias filtrados, por faixa de meia hora' },
        ], valores: [med('csat_m_csat')] }, formato: { grafico: { meta: true, suave: true, legenda: 'mostrar' } } },
        { id: 't_hora', tipo: 'tabela', titulo: 'Resultado por intervalo de 30 minutos', x: 0, y: 16, w: 24, h: 12, campos: { linhas: [col('hora', 'Intervalo')], valores: [med('csat_m_oper', 'Operadores'), ...colunasPainel] },
          formato: { visivelSe: { visual: 'l_geral', eixo: 1 }, tabela: { ...tabelaPainel, ordem: null, horaFaixa: true, semVazio: true } } }] },
      { id: 'g2', nome: 'Operador', visuais: [...filtros('g2'),
        { id: 't_op', tipo: 'tabela', titulo: 'Resultado do operador', x: 0, y: 1, w: 24, h: 13, campos: { linhas: [col('operador', 'Operador'), col('supervisor', 'Supervisor'), col('operacao', 'Operação'), col('local', 'Local')], valores: colunasPainel },
          formato: { tabela: { ...tabelaPainel, busca: 'Buscar operador ou supervisor...', situacao: [{ i: 3, rotulo: 'Com detratores' }, { i: 1, rotulo: 'Com promotores' }], extrair: true } } },
        matriz('m_op', 'operador', 'Operador', 'CSAT por operador e hora')] },
      { id: 'g3', nome: 'Supervisor', visuais: [...filtros('g3'),
        { id: 't_sup', tipo: 'tabela', titulo: 'Visão por supervisor', x: 0, y: 1, w: 24, h: 13, campos: { linhas: [col('supervisor', 'Supervisor')], valores: [med('csat_m_oper', 'Operadores'), ...colunasPainel] }, formato: { tabela: { ...tabelaPainel, busca: 'Buscar supervisor...' } } },
        matriz('m_sup', 'supervisor', 'Supervisor', 'CSAT por supervisor e hora')] },
      { id: 'g4', nome: 'Operação', visuais: [...filtros('g4'),
        { id: 't_oper', tipo: 'tabela', titulo: 'Visão por operação', x: 0, y: 1, w: 24, h: 13, campos: { linhas: [col('operacao', 'Operação')], valores: [med('csat_m_oper', 'Operadores'), ...colunasPainel] }, formato: { tabela: tabelaPainel } },
        matriz('m_oper', 'operacao', 'Operação', 'CSAT por operação e hora')] },
    ] };
  }
  const DEF_VAZIA = () => ({ guias: [{ id: 'g1', nome: 'VISÃO GERAL', visuais: [] }] });
  function csatEditor(usuarioId) {
    let base = db.estudio_bases.find(b => b.fonte === 'csat');
    if (!base) {
      base = { id: db.seq.base++, nome: 'PAINEL CSAT (BANCO)', descricao: 'AVALIAÇÕES DO PAINEL CSAT (LIDAS DIRETO DO BANCO, UM MÊS POR VEZ)', colunas: CSAT_COLUNAS, coluna_data: 'data', chave: null,
        medidas: CSAT_MEDIDAS, fonte: 'csat', criado_por: usuarioId, criado_em: agora(), atualizado_em: agora() };
      db.estudio_bases.push(base);
    } else {
      base.colunas = CSAT_COLUNAS;
      CSAT_MEDIDAS.forEach(m => { if (!base.medidas.some(x => x.id === m.id)) base.medidas.push(m); });
    }
    let rel = db.estudio_relatorios.find(r => r.base_id === base.id && r.nome === 'PAINEL CSAT (ESTÚDIO)'), criado = false;
    if (!rel) {
      rel = { id: db.seq.erel++, nome: 'PAINEL CSAT (ESTÚDIO)', base_id: base.id, definicao: csatModeloDefinicao(), definicao_publicada: null, publicado_em: null, arquivado: false, arquivado_em: null, criado_por: usuarioId, criado_em: agora(), atualizado_em: agora() };
      db.estudio_relatorios.push(rel); criado = true;
    }
    return { relatorio_id: rel.id, base_id: base.id, criado };
  }

  /* ---------- rotas (as mesmas do servidor real) ---------- */
  const rotas = [];
  const rota = (metodo, caminho, ...fns) => rotas.push({ metodo, partes: caminho.split('/').filter(Boolean), fns });
  class Resposta { constructor(status, corpo) { this.status = status; this.corpo = corpo; } }
  const r = (status, corpo) => new Resposta(status, corpo);
  const erro = (status, msg) => r(status, { erro: msg });
  // "crachá" de acesso: token = 'tok-' + id do usuário
  const auth = req => {
    const u = db.usuarios.find(x => 'tok-' + x.id === String(req.headers.authorization || '').replace('Bearer ', ''));
    if (!u) return erro(401, 'Token ausente ou inválido.');
    if (u.troca_senha_obrigatoria && req.caminho !== '/api/trocar-senha') return r(403, { erro: 'Troque a senha provisória para continuar.', trocarSenha: true });
    req.usuario = u;
  };
  // Permissões do perfil de acesso (sem perfil escolhido: admin = tudo, usuário = relatórios) — igual ao servidor real
  const acessoDe = u => {
    const pa = u.perfil_acesso_id ? (db.perfis_acesso || []).find(p => p.id === +u.perfil_acesso_id) : null;
    return { permissoes: pa ? pa.permissoes : (u.perfil === 'admin' ? ['*'] : ['relatorios']), perfilNome: pa ? pa.nome : (u.perfil === 'admin' ? 'ADMINISTRADOR' : 'USUÁRIO'), operacao_id: u.operacao_id || null };
  };
  const tem = (u, c) => { const p = acessoDe(u).permissoes; return p.includes('*') || p.includes(c); };
  const pode = (...chaves) => req => (chaves.some(c => tem(req.usuario, c)) ? undefined : erro(403, 'Acesso negado. O seu perfil não tem permissão para esta ação.'));
  const admin = pode('*');
  const daOperacao = (card, u) => !Array.isArray(card.operacoes) || !card.operacoes.length || card.operacoes.map(Number).includes(Number(u.operacao_id));
  const listaOps = v => { if (!Array.isArray(v)) return null; const ids = [...new Set(v.map(Number).filter(n => n > 0))]; return ids.length ? ids : null; };
  const perfilDoAcesso = id => { const pa = (db.perfis_acesso || []).find(p => p.id === +id); return pa ? (pa.permissoes.includes('*') ? 'admin' : 'usuario') : null; };
  const acessoCsat = req => {
    if (tem(req.usuario, 'relatorios.publicar') || tem(req.usuario, 'csat.importar')) return;
    const card = db.relatorios.find(x => x.tipo === 'csat');
    if (!card || !card.visivel || !card.ativo || !daOperacao(card, req.usuario)) return erro(403, 'O painel CSAT não está disponível para o seu perfil.');
  };
  const acessoPublicado = req => {
    if (tem(req.usuario, 'relatorios.publicar') || tem(req.usuario, 'estudio.relatorios')) return;
    const id = +req.params.id;
    // Quadro › Painel: quem vê o painel abre o relatório feito sobre a base ligada ao Quadro (mesmo com o card oculto)
    if (tem(req.usuario, 'quadro.painel')) { const rel = db.estudio_relatorios.find(x => x.id === id), b = rel && db.estudio_bases.find(x => x.id === rel.base_id); if (b && b.fonte === 'quadro') return; }
    if (!db.relatorios.some(x => x.estudio_relatorio_id === id && x.visivel && x.ativo && daOperacao(x, req.usuario))) return erro(403, 'Este relatório não está disponível.');
  };
  const perfilPublico = p => ({ id: p.id, matricula: p.matricula, nome: p.nome, email: p.email, perfil: p.perfil, ativo: p.ativo, criado_em: p.criado_em, troca_senha_obrigatoria: p.troca_senha_obrigatoria, reset_solicitado_em: p.reset_solicitado_em, perfil_acesso_id: p.perfil_acesso_id || null, operacao_id: p.operacao_id || null });

  rota('GET', '/api/health', () => r(200, { status: 'ok', modo: 'demonstração' }));
  rota('POST', '/api/login', req => {
    const { email, password } = req.body;
    if (!email || !password) return erro(400, 'E-mail e senha são obrigatórios.');
    const u = db.usuarios.find(x => x.email === String(email).trim().toLowerCase());
    if (!u || u.senha !== password) return erro(401, 'Invalid login credentials');
    if (!u.ativo) return erro(403, 'Este usuário está desativado. Contate o administrador.');
    u.reset_solicitado_em = null; salvar();
    const ac = acessoDe(u), op = (db.operacoes || []).find(o => o.id === +u.operacao_id) || null;
    return r(200, { mensagem: 'Login realizado com sucesso!', usuario: { id: u.id, email: u.email }, perfil: u.perfil, permissoes: ac.permissoes, perfilNome: ac.perfilNome, operacao: op && { id: op.id, nome: op.nome },
      trocarSenha: u.troca_senha_obrigatoria, token: 'tok-' + u.id });
  });
  rota('POST', '/api/solicitar-reset', req => {
    const u = db.usuarios.find(x => x.email === String(req.body.email || '').trim().toLowerCase() && x.ativo);
    if (u) { u.reset_solicitado_em = agora(); salvar(); }
    return r(200, { mensagem: 'Pedido registrado. Se o e-mail estiver cadastrado, o administrador foi avisado e entrará em contato.' });
  });
  rota('POST', '/api/trocar-senha', auth, req => {
    if (!req.body.novaSenha) return erro(400, 'Informe a nova senha.');
    req.usuario.senha = req.body.novaSenha; req.usuario.troca_senha_obrigatoria = false; salvar();
    return r(200, { mensagem: 'Senha alterada com sucesso!' });
  });
  rota('GET', '/api/usuarios', auth, pode('usuarios.gerenciar', 'usuarios.senha'), () => r(200, [...db.usuarios].sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1)).map(perfilPublico)));
  rota('POST', '/api/usuarios', auth, pode('usuarios.gerenciar'), req => {
    const { nome, email, senha, matricula, perfil_acesso_id, operacao_id } = req.body;
    let { perfil } = req.body;
    if (!email || !senha) return erro(400, 'E-mail e senha são obrigatórios.');
    if (perfil_acesso_id) { perfil = perfilDoAcesso(perfil_acesso_id); if (!perfil) return erro(400, 'Perfil de acesso inválido.'); }
    else if (!['usuario', 'admin'].includes(perfil)) return erro(400, 'Escolha o perfil de acesso.');
    if (!matricula) return erro(400, 'Matrícula é obrigatória.');
    if (db.usuarios.some(x => +x.matricula === +matricula)) return erro(409, `Já existe um usuário com a matrícula ${matricula}.`);
    if (db.usuarios.some(x => x.email === String(email).toLowerCase())) return erro(400, 'A user with this email address has already been registered');
    const novo = { id: 'u-' + Date.now().toString(36), email: String(email).toLowerCase(), senha, nome, perfil, matricula: +matricula, ativo: true, troca_senha_obrigatoria: true, reset_solicitado_em: null, criado_em: agora(),
      perfil_acesso_id: perfil_acesso_id ? +perfil_acesso_id : null, operacao_id: operacao_id ? +operacao_id : null };
    db.usuarios.push(novo); salvar();
    return r(201, { mensagem: 'Usuário criado com sucesso!', usuario: { id: novo.id, email: novo.email, perfil } });
  });
  rota('PATCH', '/api/usuarios/:id', auth, pode('usuarios.gerenciar'), req => {
    const u = db.usuarios.find(x => x.id === req.params.id); if (!u) return erro(404, 'Usuário não encontrado.');
    const { nome, matricula, ativo, perfil_acesso_id, operacao_id } = req.body;
    let { perfil } = req.body;
    if (req.body.email !== undefined) {
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro(400, 'E-mail inválido.');
      if (db.usuarios.some(x => x.id !== u.id && x.email === email)) return erro(409, `Já existe um usuário com o e-mail ${email}.`);
      u.email = email;
    }
    if (perfil_acesso_id) { perfil = perfilDoAcesso(perfil_acesso_id); if (!perfil) return erro(400, 'Perfil de acesso inválido.'); u.perfil_acesso_id = +perfil_acesso_id; }
    if (operacao_id !== undefined) u.operacao_id = operacao_id ? +operacao_id : null;
    if (matricula !== undefined && db.usuarios.some(x => x.id !== u.id && +x.matricula === +matricula)) return erro(409, `Já existe um usuário com a matrícula ${matricula}.`);
    if (nome !== undefined) u.nome = nome; if (perfil !== undefined) u.perfil = perfil; if (matricula !== undefined) u.matricula = +matricula; if (ativo !== undefined) u.ativo = ativo;
    salvar(); return r(200, { mensagem: 'Usuário atualizado com sucesso!', usuario: perfilPublico(u) });
  });
  rota('POST', '/api/usuarios/:id/resetar-senha', auth, pode('usuarios.senha', 'usuarios.gerenciar'), req => {
    const u = db.usuarios.find(x => x.id === req.params.id); if (!u) return erro(404, 'Usuário não encontrado.');
    if (!req.body.senha) return erro(400, 'Informe a senha provisória.');
    u.senha = req.body.senha; u.troca_senha_obrigatoria = true; u.reset_solicitado_em = null; salvar();
    return r(200, { mensagem: 'Senha resetada. O usuário deverá trocá-la no próximo login.' });
  });
  // Relatórios (cards)
  rota('GET', '/api/relatorios', auth, req => r(200, db.relatorios.filter(x => tem(req.usuario, 'relatorios.publicar') || (x.visivel && x.ativo && daOperacao(x, req.usuario))).sort((a, b) => (a.atualizado_em < b.atualizado_em ? 1 : -1))));
  rota('POST', '/api/relatorios', auth, pode('relatorios.publicar'), req => {
    const { titulo, categoria, descricao, link, visivel, operacoes } = req.body;
    if (!titulo || !categoria) return erro(400, 'Título e categoria são obrigatórios.');
    const novo = { id: db.seq.rel++, titulo, categoria, descricao, link, tipo: 'link', visivel: visivel ?? true, operacoes: listaOps(operacoes), ativo: true, descontinuado_em: null, estudio_relatorio_id: null, criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() };
    db.relatorios.push(novo); salvar(); return r(201, { mensagem: 'Relatório criado com sucesso!', relatorio: novo });
  });
  rota('PATCH', '/api/relatorios/:id', auth, pode('relatorios.publicar', 'quadro.estudio'), req => {
    const x = db.relatorios.find(y => y.id === +req.params.id); if (!x) return erro(404, 'Relatório não encontrado.');
    if (req.body.operacoes !== undefined) x.operacoes = listaOps(req.body.operacoes);
    ['titulo', 'categoria', 'descricao', 'link', 'visivel'].forEach(k => { if (req.body[k] !== undefined) x[k] = req.body[k]; });
    if (req.body.ativo !== undefined) { x.ativo = req.body.ativo; x.descontinuado_em = req.body.ativo ? null : agora(); }
    x.atualizado_em = agora(); salvar(); return r(200, { mensagem: 'Relatório atualizado com sucesso!', relatorio: x });
  });
  // Painel CSAT
  rota('GET', '/api/csat/dados', auth, acessoCsat, req => r(200, csatDados(req.query.mes || null)));
  rota('POST', '/api/csat/detalhe', auth, acessoCsat, req => r(200, csatDetalhe(req.body)));
  rota('GET', '/api/csat/historico', auth, pode('csat.importar'), () => r(200, [...db.csat_importacoes].reverse().slice(0, 30).map(h => ({ ...h, importado_por_nome: (db.usuarios.find(u => u.id === h.importado_por) || {}).nome || '—' }))));
  rota('POST', '/api/csat/importacoes', auth, pode('csat.importar'), req => {
    const meta = Number(req.body.meta);
    if (!Number.isInteger(meta) || meta < 0 || meta > 100) return erro(400, 'Meta inválida: use um número inteiro de 0 a 100.');
    const imp = { id: db.seq.imp++, importado_por: req.usuario.id, importado_em: agora(), arquivo: req.body.arquivo || null, linhas_lidas: +req.body.linhas_lidas || 0, ignoradas: +req.body.ignoradas || 0, inseridas: 0, atualizadas: 0, sem_alteracao: 0, meta };
    db.csat_importacoes.push(imp); salvar(); return r(201, { importacao: imp });
  });
  rota('POST', '/api/csat/importacoes/:id/lote', auth, pode('csat.importar'), req => {
    if (!Array.isArray(req.body.linhas) || !req.body.linhas.length) return erro(400, 'Nenhuma avaliação recebida.');
    const res = csatImportarLote(+req.params.id, req.body.linhas); salvar(); return r(200, res);
  });
  rota('POST', '/api/csat/importacoes/:id/concluir', auth, pode('csat.importar'), req => {
    const importacao = db.csat_importacoes.find(i => i.id === +req.params.id); if (!importacao) return erro(404, 'Salvamento não encontrado.');
    let card = db.relatorios.find(x => x.tipo === 'csat'), cardCriado = false;
    if (card) card.atualizado_em = agora();
    else { db.relatorios.push({ id: db.seq.rel++, titulo: 'PAINEL CSAT', categoria: 'Operações', descricao: 'SATISFAÇÃO DOS CLIENTES', link: null, tipo: 'csat', visivel: true, ativo: true, descontinuado_em: null, estudio_relatorio_id: null, criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() }); cardCriado = true; }
    salvar(); return r(200, { importacao, cardCriado });
  });
  // Estúdio · bases
  const resumoBase = b => { const arqs = db.estudio_arquivos.filter(a => a.base_id === b.id), dias = arqs.map(a => a.dia).sort(), carga = [...db.estudio_cargas].reverse().find(c => c.base_id === b.id);
    return { ...b, resumo: { dias: arqs.length, linhas: arqs.reduce((s, a) => s + a.linhas, 0), bytes: arqs.reduce((s, a) => s + a.bytes, 0), de: dias[0] || null, ate: dias[dias.length - 1] || null, ultima_carga: carga ? carga.carregado_em : null } }; };
  const arquivosDa = id => db.estudio_arquivos.filter(a => a.base_id === id).sort((a, b) => (a.dia < b.dia ? -1 : 1)).map(a => ({ dia: a.dia, linhas: a.linhas, bytes: a.bytes, atualizado_em: a.atualizado_em }));
  const caminho = (id, dia) => `${ARQ}estudio/bases/${id}/${dia}.parquet`;
  rota('GET', '/api/estudio/bases', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), () => r(200, [...db.estudio_bases].sort((a, b) => a.nome.localeCompare(b.nome)).map(resumoBase)));
  rota('GET', '/api/estudio/bases/:id', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => { const b = db.estudio_bases.find(x => x.id === +req.params.id); if (!b) return erro(404, 'Base não encontrada.');
    return r(200, { base: b, arquivos: arquivosDa(b.id), cargas: db.estudio_cargas.filter(c => c.base_id === b.id).reverse().slice(0, 30) }); });
  rota('POST', '/api/estudio/bases', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => {
    const { nome, descricao, colunas, coluna_data, chave } = req.body;
    if (!nome || !Array.isArray(colunas) || !colunas.length) return erro(400, 'Informe o nome e as colunas da base.');
    const n = String(nome).trim().toUpperCase();
    if (db.estudio_bases.some(b => b.nome === n)) return erro(409, `Já existe uma base chamada ${n}.`);
    const base = { id: db.seq.base++, nome: n, descricao: descricao ? String(descricao).trim().toUpperCase() : null, colunas, coluna_data, chave: chave && chave.length ? chave : null, medidas: [], fonte: 'arquivo', criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() };
    db.estudio_bases.push(base); salvar(); return r(201, { base });
  });
  rota('POST', '/api/estudio/bases/:id/links-download', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => { const links = {}; (req.body.dias || []).forEach(d => { if (db.estudio_arquivos.some(a => a.base_id === +req.params.id && a.dia === d)) links[d] = caminho(+req.params.id, d); }); return r(200, { links }); });
  rota('POST', '/api/estudio/bases/:id/links-upload', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => { const links = {}; (req.body.dias || []).forEach(d => { links[d] = caminho(+req.params.id, d); }); return r(200, { links }); });
  rota('POST', '/api/estudio/bases/:id/cargas', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => {
    const id = +req.params.id, { dias } = req.body;
    if (!Array.isArray(dias) || !dias.length) return erro(400, 'Resumo da carga inválido.');
    dias.forEach(d => { const ex = db.estudio_arquivos.find(a => a.base_id === id && a.dia === d.dia); const v = { base_id: id, dia: d.dia, linhas: d.linhas, bytes: d.bytes, atualizado_em: agora() }; if (ex) Object.assign(ex, v); else db.estudio_arquivos.push(v); });
    db.estudio_cargas.push({ id: db.seq.carga++, base_id: id, arquivo: req.body.arquivo || null, linhas_lidas: +req.body.linhas_lidas || 0, linhas_gravadas: +req.body.linhas_gravadas || 0, descartadas: +req.body.descartadas || 0, duplicadas: +req.body.duplicadas || 0, dias: dias.length, carregado_por: req.usuario.id, carregado_em: agora() });
    const b = db.estudio_bases.find(x => x.id === id); if (b) b.atualizado_em = agora();
    salvar(); return r(201, { mensagem: 'Carga registrada.' });
  });
  rota('PUT', '/api/estudio/bases/:id/medidas', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => {
    const b = db.estudio_bases.find(x => x.id === +req.params.id); if (!b) return erro(404, 'Base não encontrada.');
    const nomes = new Set();
    for (const m of req.body.medidas || []) {
      const n = String(m.nome || '').trim().toUpperCase();
      if (!n) return erro(400, 'Toda medida precisa de nome.');
      if (nomes.has(n)) return erro(400, `Já existe uma medida chamada ${n}.`); nomes.add(n);
      if (/[\[\]]/.test(n)) return erro(400, `O nome da medida não pode ter colchetes: ${n}.`);
    }
    b.medidas = (req.body.medidas || []).map(m => (m.tipo === 'dax' ? { id: m.id, nome: String(m.nome).trim().toUpperCase(), tipo: 'dax', formula: m.formula, formato: m.formato || 'auto' } : { ...m, nome: String(m.nome).trim().toUpperCase() }));
    b.atualizado_em = agora(); salvar(); return r(200, { base: b });
  });
  // Estúdio · relatórios
  rota('GET', '/api/estudio/relatorios', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), () => r(200, [...db.estudio_relatorios].sort((a, b) => (a.atualizado_em < b.atualizado_em ? 1 : -1)).map(x => ({
    id: x.id, nome: x.nome, base_id: x.base_id, base_nome: (db.estudio_bases.find(b => b.id === x.base_id) || {}).nome || '—', guias: x.definicao.guias.length,
    visuais: x.definicao.guias.reduce((s, g) => s + g.visuais.length, 0), atualizado_em: x.atualizado_em, publicado_em: x.publicado_em || null, arquivado: !!x.arquivado, arquivado_em: x.arquivado_em || null }))));
  rota('POST', '/api/estudio/relatorios', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => {
    const nome = String(req.body.nome || '').trim().toUpperCase(), baseId = +req.body.base_id;
    if (!nome) return erro(400, 'Informe o nome do relatório.');
    if (!db.estudio_bases.some(b => b.id === baseId)) return erro(400, 'Escolha uma base válida.');
    if (db.estudio_relatorios.some(x => x.nome === nome)) return erro(409, `Já existe um relatório chamado ${nome}.`);
    const rel = { id: db.seq.erel++, nome, base_id: baseId, definicao: DEF_VAZIA(), definicao_publicada: null, publicado_em: null, arquivado: false, arquivado_em: null, criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() };
    db.estudio_relatorios.push(rel); salvar(); return r(201, { relatorio: rel });
  });
  rota('GET', '/api/estudio/relatorios/:id', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => { const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    return r(200, { relatorio: rel, base: db.estudio_bases.find(b => b.id === rel.base_id), arquivos: arquivosDa(rel.base_id) }); });
  rota('PUT', '/api/estudio/relatorios/:id', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => {
    const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    const def = req.body.definicao;
    if (!def || !Array.isArray(def.guias) || !def.guias.length) return erro(400, 'O relatório precisa ter pelo menos uma guia.');
    if (req.body.nome !== undefined) { const n = String(req.body.nome).trim().toUpperCase(); if (!n) return erro(400, 'Informe o nome do relatório.'); if (db.estudio_relatorios.some(x => x.id !== rel.id && x.nome === n)) return erro(409, `Já existe um relatório chamado ${n}.`); rel.nome = n; }
    rel.definicao = def; rel.atualizado_em = agora(); salvar(); return r(200, { relatorio: rel });
  });
  rota('PATCH', '/api/estudio/relatorios/:id/arquivar', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => {
    const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    const arq = req.body.arquivado === true; rel.arquivado = arq; rel.arquivado_em = arq ? agora() : null;
    const card = db.relatorios.find(x => x.estudio_relatorio_id === rel.id);
    if (card) { card.ativo = !arq; card.descontinuado_em = arq ? agora() : null; card.atualizado_em = agora(); }
    salvar(); return r(200, { relatorio: { id: rel.id, nome: rel.nome, arquivado: rel.arquivado, arquivado_em: rel.arquivado_em }, cardAtualizado: !!card });
  });
  rota('POST', '/api/estudio/relatorios/:id/publicar', auth, pode('estudio.publicar', 'quadro.estudio'), req => {
    const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    if (!String(req.body.categoria || '').trim()) return erro(400, 'Escolha a categoria do card.');
    rel.definicao_publicada = JSON.parse(JSON.stringify(rel.definicao)); rel.publicado_em = agora();
    let card = db.relatorios.find(x => x.estudio_relatorio_id === rel.id), cardCriado = false;
    const descricao = req.body.descricao ? String(req.body.descricao).trim().toUpperCase() : null;
    const ops = req.body.operacoes !== undefined ? { operacoes: listaOps(req.body.operacoes) } : {};
    if (card) Object.assign(card, { titulo: rel.nome, categoria: req.body.categoria, descricao, ...ops, atualizado_em: agora() });
    else { card = { id: db.seq.rel++, titulo: rel.nome, categoria: req.body.categoria, descricao, link: null, tipo: 'estudio', estudio_relatorio_id: rel.id, visivel: true, ...ops, ativo: true, descontinuado_em: null, criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() }; db.relatorios.push(card); cardCriado = true; }
    salvar(); return r(200, { relatorio: rel, card, cardCriado });
  });
  rota('GET', '/api/estudio/publicados/:id', auth, acessoPublicado, req => {
    const rel = db.estudio_relatorios.find(x => x.id === +req.params.id);
    if (!rel || !rel.definicao_publicada) return erro(404, 'Este relatório ainda não foi publicado.');
    const base = db.estudio_bases.find(b => b.id === rel.base_id); if (!base) return erro(404, 'A base deste relatório não existe mais.');
    const relacionadas = (rel.definicao_publicada.relacoes || []).map(x => db.estudio_bases.find(b => b.id === +x.base_id)).filter(Boolean).map(b => ({ base: b, arquivos: arquivosDa(b.id) }));
    return r(200, { relatorio: { id: rel.id, nome: rel.nome, base_id: rel.base_id, definicao: rel.definicao_publicada, publicado_em: rel.publicado_em }, base, arquivos: arquivosDa(rel.base_id), relacionadas });
  });
  rota('POST', '/api/estudio/publicados/:id/links-download', auth, acessoPublicado, req => {
    const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    const alvo = +req.body.base_id || rel.base_id, rels = (rel.definicao_publicada && rel.definicao_publicada.relacoes) || [];
    if (alvo !== rel.base_id && !rels.some(x => +x.base_id === alvo)) return erro(403, 'Esta base não faz parte do relatório.');
    const links = {}; (req.body.dias || []).forEach(d => { links[d] = caminho(alvo, d); }); return r(200, { links });
  });
  rota('POST', '/api/estudio/csat/editor', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), req => { const res = csatEditor(req.usuario.id); salvar(); return r(200, res); });

  // Administração · perfis de acesso e operações
  const permOk = l => Array.isArray(l) ? [...new Set(l.map(String))].filter(p => /^[a-z_]+(\.[a-z_]+)?$/.test(p)) : null;
  rota('GET', '/api/perfis', auth, pode('admin.perfis', 'usuarios.gerenciar'), () => r(200, [...db.perfis_acesso].sort((a, b) => a.nome.localeCompare(b.nome)).map(p => ({ ...p, usuarios: db.usuarios.filter(u => +u.perfil_acesso_id === p.id).length }))));
  rota('POST', '/api/perfis', auth, pode('admin.perfis'), req => {
    const nome = String(req.body.nome || '').trim().toUpperCase(), permissoes = permOk(req.body.permissoes || []);
    if (!nome) return erro(400, 'Informe o nome do perfil.');
    if (db.perfis_acesso.some(p => p.nome === nome)) return erro(409, `Já existe um perfil chamado ${nome}.`);
    const p = { id: db.seq.perfil++, nome, permissoes, sistema: false, criado_em: agora() }; db.perfis_acesso.push(p); salvar(); return r(201, { perfil: p });
  });
  rota('PATCH', '/api/perfis/:id', auth, pode('admin.perfis'), req => {
    const p = db.perfis_acesso.find(x => x.id === +req.params.id); if (!p) return erro(404, 'Perfil não encontrado.');
    if (p.permissoes.includes('*')) return erro(400, 'O perfil ADMINISTRADOR tem acesso a tudo e não pode ser alterado.');
    if (req.body.nome !== undefined) { const n = String(req.body.nome).trim().toUpperCase(); if (!n) return erro(400, 'Informe o nome do perfil.'); if (db.perfis_acesso.some(x => x.id !== p.id && x.nome === n)) return erro(409, `Já existe um perfil chamado ${n}.`); p.nome = n; }
    if (req.body.permissoes !== undefined) p.permissoes = permOk(req.body.permissoes);
    p.atualizado_em = agora(); salvar(); return r(200, { perfil: p });
  });
  rota('DELETE', '/api/perfis/:id', auth, pode('admin.perfis'), req => {
    const p = db.perfis_acesso.find(x => x.id === +req.params.id); if (!p) return erro(404, 'Perfil não encontrado.');
    if (p.sistema) return erro(400, 'Este perfil é do sistema e não pode ser excluído.');
    const n = db.usuarios.filter(u => +u.perfil_acesso_id === p.id).length; if (n) return erro(400, `Há ${n} usuário(s) com este perfil. Troque o perfil deles antes de excluir.`);
    db.perfis_acesso = db.perfis_acesso.filter(x => x.id !== p.id); salvar(); return r(200, { mensagem: 'Perfil excluído.' });
  });
  rota('GET', '/api/operacoes', auth, pode('usuarios.gerenciar', 'admin.operacoes', 'relatorios.publicar', 'estudio.publicar'), () => r(200, [...db.operacoes].sort((a, b) => a.nome.localeCompare(b.nome)).map(o => ({ ...o, usuarios: db.usuarios.filter(u => +u.operacao_id === o.id).length }))));
  const camposOperacao = (b, novo) => {
    const o = {};
    if (novo || b.nome !== undefined) { o.nome = String(b.nome || '').trim().toUpperCase(); if (!o.nome) return { erro: 'Informe o nome da operação.' }; }
    if (b.cliente !== undefined) o.cliente = String(b.cliente || '').trim().toUpperCase() || null;
    if (b.ativo !== undefined) o.ativo = !!b.ativo;
    return { campos: o };
  };
  rota('POST', '/api/operacoes', auth, pode('usuarios.gerenciar', 'admin.operacoes'), req => {
    const { campos, erro: e } = camposOperacao(req.body, true); if (e) return erro(400, e);
    if (db.operacoes.some(o => o.nome === campos.nome)) return erro(409, `Já existe a operação ${campos.nome}.`);
    const o = { id: db.seq.oper++, ativo: true, cliente: null, ...campos, criado_em: agora() }; db.operacoes.push(o); salvar(); return r(201, { operacao: o });
  });
  rota('PATCH', '/api/operacoes/:id', auth, pode('admin.operacoes'), req => {
    const o = db.operacoes.find(x => x.id === +req.params.id); if (!o) return erro(404, 'Operação não encontrada.');
    const { campos, erro: e } = camposOperacao(req.body, false); if (e) return erro(400, e);
    if (campos.nome && db.operacoes.some(x => x.id !== o.id && x.nome === campos.nome)) return erro(409, `Já existe a operação ${campos.nome}.`);
    Object.assign(o, campos, { atualizado_em: agora() }); salvar(); return r(200, { operacao: o });
  });

  // Quadro no banco: gavetas guardadas no "banco" da demonstração (mesmas regras de permissão do servidor real)
  const QD_CAMPO = { config: 'chave', anexos: 'chave', dpo: 'matricula', funcionarios: 'matricula', wfm: 're', vinculos: 're', fotos: 'data', cargas: 'id', historico: 'id', tickets: 'id' };
  const qdBanco = () => { if (!db.quadro) { db.quadro = {}; db.quadroCont = {}; } return db.quadro; };
  const temAlgum = (u, ...c) => c.some(x => tem(u, x));
  const podeLerQuadro = u => { const p = acessoDe(u).permissoes; return p.includes('*') || p.some(x => x === 'quadro' || x.startsWith('quadro.')) || p.includes('admin.tickets'); };
  const refaz = u => temAlgum(u, 'quadro.cargas', 'quadro.vinculos', 'quadro.analisar');
  const recusa = (u, loja, itens) => {
    const nega = 'O seu perfil não tem permissão para gravar ' + loja + ' do Quadro.';
    if (['dpo', 'wfm', 'cargas'].includes(loja)) return tem(u, 'quadro.cargas') ? null : nega;
    if (loja === 'vinculos') return tem(u, 'quadro.vinculos') ? null : nega;
    if (['funcionarios', 'historico', 'fotos'].includes(loja)) return refaz(u) ? null : nega;
    if (loja === 'config') return itens.every(i => temAlgum(u, ...({ modelos: ['admin.tickets'], clientes: ['quadro.cargas'], pendentes: ['quadro.cargas', 'quadro.vinculos', 'quadro.analisar'], estudio: ['quadro.estudio'], migrado: ['quadro.cargas'], escalas: ['quadro.escalas'] }[i && i.chave] || ['*']))) ? null : nega;
    if (loja === 'tickets') return refaz(u) || (tem(u, 'quadro.solicitar') && itens.every(i => i && !i.id && i.status === 'aberto')) ? null : nega;
    if (loja === 'anexos') return refaz(u) || tem(u, 'quadro.solicitar') ? null : nega;
    return 'Gaveta desconhecida: ' + loja;
  };
  rota('GET', '/api/quadro/dados/:loja', auth, req => {
    const loja = req.params.loja, q = req.query;
    if (!QD_CAMPO[loja]) return erro(400, 'Gaveta desconhecida.');
    if (!podeLerQuadro(req.usuario)) return erro(403, 'Acesso negado. O seu perfil não tem permissão para o Quadro.');
    const b = qdBanco();
    return r(200, Object.keys(b).filter(k => k.startsWith(loja + '|')).sort().map(k => b[k])
      .filter(x => (!q.chave || String(x[QD_CAMPO[loja]]) === q.chave) && (!q.matricula || String(x.matricula) === q.matricula) && (!q.prefixo || String(x[QD_CAMPO[loja]]).startsWith(q.prefixo)))
      .map(x => JSON.parse(JSON.stringify(x))));
  });
  rota('POST', '/api/quadro/gravar', auth, req => {
    const mapa = req.body.mapa || {}, trocar = req.body.trocar || [];
    const lojas = [...new Set([...Object.keys(mapa), ...trocar])];
    if (!lojas.length) return erro(400, 'Nada para gravar.');
    for (const l of lojas) { const m = recusa(req.usuario, l, mapa[l] || []); if (m) return erro(m.startsWith('Gaveta') ? 400 : 403, m); }
    const b = qdBanco(), saida = {};
    trocar.forEach(l => Object.keys(b).forEach(k => { if (k.startsWith(l + '|')) delete b[k]; }));
    for (const [loja, itens] of Object.entries(mapa)) {
      const campo = QD_CAMPO[loja]; saida[loja] = [];
      for (let item of itens) {
        item = JSON.parse(JSON.stringify(item));
        if (campo === 'id') {
          if (item.id == null || item.id === '') { db.quadroCont[loja] = (db.quadroCont[loja] || 0) + 1; item.id = db.quadroCont[loja]; }
          else db.quadroCont[loja] = Math.max(db.quadroCont[loja] || 0, +item.id);
        }
        const chave = String(item[campo] ?? ''); if (!chave) return erro(400, `Item sem ${campo} na gaveta ${loja}`);
        b[loja + '|' + chave] = item; saida[loja].push(chave);
      }
    }
    salvar(); return r(200, { chaves: saida });
  });
  rota('POST', '/api/quadro/remover', auth, req => {
    const { loja, chaves, tudo } = req.body, b = qdBanco();
    if (tudo) { if (!tem(req.usuario, '*')) return erro(403, 'Só o perfil com acesso total pode apagar o Quadro inteiro.'); db.quadro = {}; db.quadroCont = {}; salvar(); return r(200, { removidos: 0 }); }
    if (!QD_CAMPO[loja] || !Array.isArray(chaves) || !chaves.length) return erro(400, 'Informe a gaveta e as chaves.');
    if (!(loja === 'vinculos' ? tem(req.usuario, 'quadro.vinculos') : tem(req.usuario, '*'))) return erro(403, 'Acesso negado. O seu perfil não tem permissão para esta ação.');
    let n = 0; chaves.forEach(c => { if (b[loja + '|' + c]) { delete b[loja + '|' + c]; n++; } }); salvar(); return r(200, { removidos: n });
  });

  // Base do Estúdio "ligada ao Quadro" (rotas 44–46 do servidor real): o relatório lê o Quadro, sem arquivo
  const quadroParaEstudio = () => {
    const b = qdBanco(), da = l => Object.keys(b).filter(k => k.startsWith(l + '|')).map(k => b[k]);
    const datas = da('cargas').filter(c => c.tipo === 'dpo').map(c => c.data_base).sort(), cfg = b['config|escalas'];
    return { data_base: datas[datas.length - 1] || null, escalas: cfg ? cfg.valor : null, funcionarios: da('funcionarios').filter(f => !f.fora_base).map(f => JSON.parse(JSON.stringify(f))) };
  };
  rota('GET', '/api/estudio/quadro/dados', auth, pode('estudio.bases', 'estudio.relatorios', 'quadro.estudio'), () => r(200, quadroParaEstudio()));
  rota('GET', '/api/estudio/publicados/:id/quadro', auth, acessoPublicado, req => {
    const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    const b = db.estudio_bases.find(x => x.id === rel.base_id); if (!b || b.fonte !== 'quadro') return erro(403, 'A base deste relatório não é a do Quadro.');
    return r(200, quadroParaEstudio());
  });
  rota('POST', '/api/estudio/quadro/base', auth, pode('quadro.estudio'), req => {
    const { nome, descricao, colunas, coluna_data, chave } = req.body;
    if (!nome || !Array.isArray(colunas) || !colunas.length) return erro(400, 'Informe o nome e as colunas da base.');
    const n = String(nome).trim().toUpperCase(), atual = db.estudio_bases.find(x => x.nome === n);
    if (atual) {
      if (atual.fonte === 'quadro') { atual.colunas = colunas.map(c => ({ ...c, ...((atual.colunas || []).find(x => x.nome === c.nome) || {}) })); salvar(); return r(200, { base: atual, ligada: false }); }
      if (atual.fonte !== 'arquivo') return erro(409, `A base ${n} já existe com outra origem.`);
      Object.assign(atual, { fonte: 'quadro', colunas, descricao: descricao ? String(descricao).trim().toUpperCase() : atual.descricao, atualizado_em: agora() }); salvar(); return r(200, { base: atual, ligada: true });
    }
    const base = { id: db.seq.base++, nome: n, descricao: descricao ? String(descricao).trim().toUpperCase() : null, colunas, coluna_data, chave: chave && chave.length ? chave : null, medidas: [], fonte: 'quadro', criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() };
    db.estudio_bases.push(base); salvar(); return r(201, { base, ligada: true });
  });

  /* ---------- atendimento das chamadas (no lugar da rede) ---------- */
  async function atender(url, opcoes = {}) {
    await pronto;
    const metodo = (opcoes.method || 'GET').toUpperCase();
    const [caminhoQ, consulta] = url.slice(BASE.length - 1).split('?');
    const partes = caminhoQ.split('/').filter(Boolean);
    const headers = {}; new Headers(opcoes.headers || {}).forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let body = {};
    try {
      if (opcoes.body instanceof Blob) body = JSON.parse(await new Response(opcoes.body.stream().pipeThrough(new DecompressionStream('gzip'))).text());
      else body = opcoes.body ? JSON.parse(opcoes.body) : {};
    } catch (e) {}
    const req = { metodo, caminho: '/' + partes.join('/'), headers, body, query: Object.fromEntries(new URLSearchParams(consulta || '')), params: {} };
    for (const rt of rotas) {
      if (rt.metodo !== metodo || rt.partes.length !== partes.length) continue;
      const params = {};
      if (!rt.partes.every((p, i) => (p[0] === ':' ? (params[p.slice(1)] = decodeURIComponent(partes[i]), true) : p === partes[i]))) continue;
      req.params = params;
      try {
        for (const fn of rt.fns) { const res = fn(req); if (res instanceof Resposta) return resposta(res); }
        return resposta(erro(500, 'Rota sem resposta.'));
      } catch (e) { console.error(e); return resposta(erro(500, 'Erro interno: ' + e.message)); }
    }
    return resposta(erro(404, 'Rota não encontrada: ' + metodo + ' ' + req.caminho));
  }
  const resposta = res => new Response(JSON.stringify(res.corpo), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  // Arquivos das bases do Estúdio (Parquet): guardados no IndexedDB, por endereço
  async function arquivo(url, opcoes = {}) {
    const metodo = (opcoes.method || 'GET').toUpperCase(), chave = url.slice(ARQ.length);
    if (metodo === 'PUT') {
      const b = opcoes.body, dados = b instanceof Blob ? new Uint8Array(await b.arrayBuffer()) : b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b);
      await idbGravar('arquivos', chave, dados);
      return new Response(JSON.stringify({ Key: chave }), { status: 200 });
    }
    const dados = await idbLer('arquivos', chave);
    return dados ? new Response(dados, { status: 200 }) : new Response('', { status: 404 });
  }
  window.fetch = (entrada, opcoes) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    if (url.startsWith(BASE)) return atender(url, opcoes);
    if (url.startsWith(ARQ)) return arquivo(url, opcoes);
    return fetchOriginal(entrada, opcoes);
  };

  return {
    pronto: () => pronto,
    // Apaga tudo o que foi feito na demonstração e volta aos dados iniciais
    async zerar() { await pronto; db = semente(); await idbGravar('kv', 'db', db); const d = await idb(); await new Promise(ok => { const tx = d.transaction('arquivos', 'readwrite'); tx.objectStore('arquivos').clear(); tx.oncomplete = ok; }); },
    _db: () => db,
  };
})();
