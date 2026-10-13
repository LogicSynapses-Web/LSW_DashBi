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
  }
  pronto = carregar();

  /* ---------- dados iniciais da demonstração ---------- */
  function semente() {
    const d = { versao: 1, seq: { rel: 1, imp: 1, base: 1, carga: 1, erel: 1 },
      usuarios: [], relatorios: [], csat_avaliacoes: [], csat_importacoes: [], estudio_bases: [], estudio_arquivos: [], estudio_cargas: [], estudio_relatorios: [] };
    const u = (id, email, nome, perfil, matricula, extra = {}) => d.usuarios.push({ id, email, senha: 'demo123', nome, perfil, matricula, ativo: true, troca_senha_obrigatoria: false, reset_solicitado_em: null, criado_em: agora(), ...extra });
    u('u-admin', 'admin@lsw.demo', 'ADMINISTRADOR DEMO', 'admin', 1001);
    u('u-usuario', 'usuario@lsw.demo', 'USUÁRIO DEMO', 'usuario', 1002);
    u('u-3', 'marina.costa@lsw.demo', 'MARINA COSTA', 'usuario', 1003, { reset_solicitado_em: agora() });
    u('u-4', 'otavio.lima@lsw.demo', 'OTÁVIO LIMA', 'usuario', 1004, { ativo: false });
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
  const admin = req => (req.usuario.perfil !== 'admin' ? erro(403, 'Acesso negado. Esta ação é restrita a administradores.') : undefined);
  const acessoCsat = req => {
    if (req.usuario.perfil === 'admin') return;
    const card = db.relatorios.find(x => x.tipo === 'csat');
    if (!card || !card.visivel || !card.ativo) return erro(403, 'O painel CSAT não está disponível para o seu perfil.');
  };
  const acessoPublicado = req => {
    if (req.usuario.perfil === 'admin') return;
    const id = +req.params.id;
    if (!db.relatorios.some(x => x.estudio_relatorio_id === id && x.visivel && x.ativo)) return erro(403, 'Este relatório não está disponível.');
  };
  const perfilPublico = p => ({ id: p.id, matricula: p.matricula, nome: p.nome, email: p.email, perfil: p.perfil, ativo: p.ativo, criado_em: p.criado_em, troca_senha_obrigatoria: p.troca_senha_obrigatoria, reset_solicitado_em: p.reset_solicitado_em });

  rota('GET', '/api/health', () => r(200, { status: 'ok', modo: 'demonstração' }));
  rota('POST', '/api/login', req => {
    const { email, password } = req.body;
    if (!email || !password) return erro(400, 'E-mail e senha são obrigatórios.');
    const u = db.usuarios.find(x => x.email === String(email).trim().toLowerCase());
    if (!u || u.senha !== password) return erro(401, 'Invalid login credentials');
    if (!u.ativo) return erro(403, 'Este usuário está desativado. Contate o administrador.');
    u.reset_solicitado_em = null; salvar();
    return r(200, { mensagem: 'Login realizado com sucesso!', usuario: { id: u.id, email: u.email }, perfil: u.perfil, trocarSenha: u.troca_senha_obrigatoria, token: 'tok-' + u.id });
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
  rota('GET', '/api/usuarios', auth, admin, () => r(200, [...db.usuarios].sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1)).map(perfilPublico)));
  rota('POST', '/api/usuarios', auth, admin, req => {
    const { nome, email, senha, perfil, matricula } = req.body;
    if (!email || !senha) return erro(400, 'E-mail e senha são obrigatórios.');
    if (!['usuario', 'admin'].includes(perfil)) return erro(400, 'Perfil inválido. Use "usuario" ou "admin".');
    if (!matricula) return erro(400, 'Matrícula é obrigatória.');
    if (db.usuarios.some(x => +x.matricula === +matricula)) return erro(409, `Já existe um usuário com a matrícula ${matricula}.`);
    if (db.usuarios.some(x => x.email === String(email).toLowerCase())) return erro(400, 'A user with this email address has already been registered');
    const novo = { id: 'u-' + Date.now().toString(36), email: String(email).toLowerCase(), senha, nome, perfil, matricula: +matricula, ativo: true, troca_senha_obrigatoria: true, reset_solicitado_em: null, criado_em: agora() };
    db.usuarios.push(novo); salvar();
    return r(201, { mensagem: 'Usuário criado com sucesso!', usuario: { id: novo.id, email: novo.email, perfil } });
  });
  rota('PATCH', '/api/usuarios/:id', auth, admin, req => {
    const u = db.usuarios.find(x => x.id === req.params.id); if (!u) return erro(404, 'Usuário não encontrado.');
    const { nome, perfil, matricula, ativo } = req.body;
    if (matricula !== undefined && db.usuarios.some(x => x.id !== u.id && +x.matricula === +matricula)) return erro(409, `Já existe um usuário com a matrícula ${matricula}.`);
    if (nome !== undefined) u.nome = nome; if (perfil !== undefined) u.perfil = perfil; if (matricula !== undefined) u.matricula = +matricula; if (ativo !== undefined) u.ativo = ativo;
    salvar(); return r(200, { mensagem: 'Usuário atualizado com sucesso!', usuario: perfilPublico(u) });
  });
  rota('POST', '/api/usuarios/:id/resetar-senha', auth, admin, req => {
    const u = db.usuarios.find(x => x.id === req.params.id); if (!u) return erro(404, 'Usuário não encontrado.');
    if (!req.body.senha) return erro(400, 'Informe a senha provisória.');
    u.senha = req.body.senha; u.troca_senha_obrigatoria = true; u.reset_solicitado_em = null; salvar();
    return r(200, { mensagem: 'Senha resetada. O usuário deverá trocá-la no próximo login.' });
  });
  // Relatórios (cards)
  rota('GET', '/api/relatorios', auth, req => r(200, db.relatorios.filter(x => req.usuario.perfil === 'admin' || (x.visivel && x.ativo)).sort((a, b) => (a.atualizado_em < b.atualizado_em ? 1 : -1))));
  rota('POST', '/api/relatorios', auth, admin, req => {
    const { titulo, categoria, descricao, link, visivel } = req.body;
    if (!titulo || !categoria) return erro(400, 'Título e categoria são obrigatórios.');
    const novo = { id: db.seq.rel++, titulo, categoria, descricao, link, tipo: 'link', visivel: visivel ?? true, ativo: true, descontinuado_em: null, estudio_relatorio_id: null, criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() };
    db.relatorios.push(novo); salvar(); return r(201, { mensagem: 'Relatório criado com sucesso!', relatorio: novo });
  });
  rota('PATCH', '/api/relatorios/:id', auth, admin, req => {
    const x = db.relatorios.find(y => y.id === +req.params.id); if (!x) return erro(404, 'Relatório não encontrado.');
    ['titulo', 'categoria', 'descricao', 'link', 'visivel'].forEach(k => { if (req.body[k] !== undefined) x[k] = req.body[k]; });
    if (req.body.ativo !== undefined) { x.ativo = req.body.ativo; x.descontinuado_em = req.body.ativo ? null : agora(); }
    x.atualizado_em = agora(); salvar(); return r(200, { mensagem: 'Relatório atualizado com sucesso!', relatorio: x });
  });
  // Painel CSAT
  rota('GET', '/api/csat/dados', auth, acessoCsat, req => r(200, csatDados(req.query.mes || null)));
  rota('POST', '/api/csat/detalhe', auth, acessoCsat, req => r(200, csatDetalhe(req.body)));
  rota('GET', '/api/csat/historico', auth, admin, () => r(200, [...db.csat_importacoes].reverse().slice(0, 30).map(h => ({ ...h, importado_por_nome: (db.usuarios.find(u => u.id === h.importado_por) || {}).nome || '—' }))));
  rota('POST', '/api/csat/importacoes', auth, admin, req => {
    const meta = Number(req.body.meta);
    if (!Number.isInteger(meta) || meta < 0 || meta > 100) return erro(400, 'Meta inválida: use um número inteiro de 0 a 100.');
    const imp = { id: db.seq.imp++, importado_por: req.usuario.id, importado_em: agora(), arquivo: req.body.arquivo || null, linhas_lidas: +req.body.linhas_lidas || 0, ignoradas: +req.body.ignoradas || 0, inseridas: 0, atualizadas: 0, sem_alteracao: 0, meta };
    db.csat_importacoes.push(imp); salvar(); return r(201, { importacao: imp });
  });
  rota('POST', '/api/csat/importacoes/:id/lote', auth, admin, req => {
    if (!Array.isArray(req.body.linhas) || !req.body.linhas.length) return erro(400, 'Nenhuma avaliação recebida.');
    const res = csatImportarLote(+req.params.id, req.body.linhas); salvar(); return r(200, res);
  });
  rota('POST', '/api/csat/importacoes/:id/concluir', auth, admin, req => {
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
  rota('GET', '/api/estudio/bases', auth, admin, () => r(200, [...db.estudio_bases].sort((a, b) => a.nome.localeCompare(b.nome)).map(resumoBase)));
  rota('GET', '/api/estudio/bases/:id', auth, admin, req => { const b = db.estudio_bases.find(x => x.id === +req.params.id); if (!b) return erro(404, 'Base não encontrada.');
    return r(200, { base: b, arquivos: arquivosDa(b.id), cargas: db.estudio_cargas.filter(c => c.base_id === b.id).reverse().slice(0, 30) }); });
  rota('POST', '/api/estudio/bases', auth, admin, req => {
    const { nome, descricao, colunas, coluna_data, chave } = req.body;
    if (!nome || !Array.isArray(colunas) || !colunas.length) return erro(400, 'Informe o nome e as colunas da base.');
    const n = String(nome).trim().toUpperCase();
    if (db.estudio_bases.some(b => b.nome === n)) return erro(409, `Já existe uma base chamada ${n}.`);
    const base = { id: db.seq.base++, nome: n, descricao: descricao ? String(descricao).trim().toUpperCase() : null, colunas, coluna_data, chave: chave && chave.length ? chave : null, medidas: [], fonte: 'arquivo', criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() };
    db.estudio_bases.push(base); salvar(); return r(201, { base });
  });
  rota('POST', '/api/estudio/bases/:id/links-download', auth, admin, req => { const links = {}; (req.body.dias || []).forEach(d => { if (db.estudio_arquivos.some(a => a.base_id === +req.params.id && a.dia === d)) links[d] = caminho(+req.params.id, d); }); return r(200, { links }); });
  rota('POST', '/api/estudio/bases/:id/links-upload', auth, admin, req => { const links = {}; (req.body.dias || []).forEach(d => { links[d] = caminho(+req.params.id, d); }); return r(200, { links }); });
  rota('POST', '/api/estudio/bases/:id/cargas', auth, admin, req => {
    const id = +req.params.id, { dias } = req.body;
    if (!Array.isArray(dias) || !dias.length) return erro(400, 'Resumo da carga inválido.');
    dias.forEach(d => { const ex = db.estudio_arquivos.find(a => a.base_id === id && a.dia === d.dia); const v = { base_id: id, dia: d.dia, linhas: d.linhas, bytes: d.bytes, atualizado_em: agora() }; if (ex) Object.assign(ex, v); else db.estudio_arquivos.push(v); });
    db.estudio_cargas.push({ id: db.seq.carga++, base_id: id, arquivo: req.body.arquivo || null, linhas_lidas: +req.body.linhas_lidas || 0, linhas_gravadas: +req.body.linhas_gravadas || 0, descartadas: +req.body.descartadas || 0, duplicadas: +req.body.duplicadas || 0, dias: dias.length, carregado_por: req.usuario.id, carregado_em: agora() });
    const b = db.estudio_bases.find(x => x.id === id); if (b) b.atualizado_em = agora();
    salvar(); return r(201, { mensagem: 'Carga registrada.' });
  });
  rota('PUT', '/api/estudio/bases/:id/medidas', auth, admin, req => {
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
  rota('GET', '/api/estudio/relatorios', auth, admin, () => r(200, [...db.estudio_relatorios].sort((a, b) => (a.atualizado_em < b.atualizado_em ? 1 : -1)).map(x => ({
    id: x.id, nome: x.nome, base_id: x.base_id, base_nome: (db.estudio_bases.find(b => b.id === x.base_id) || {}).nome || '—', guias: x.definicao.guias.length,
    visuais: x.definicao.guias.reduce((s, g) => s + g.visuais.length, 0), atualizado_em: x.atualizado_em, publicado_em: x.publicado_em || null, arquivado: !!x.arquivado, arquivado_em: x.arquivado_em || null }))));
  rota('POST', '/api/estudio/relatorios', auth, admin, req => {
    const nome = String(req.body.nome || '').trim().toUpperCase(), baseId = +req.body.base_id;
    if (!nome) return erro(400, 'Informe o nome do relatório.');
    if (!db.estudio_bases.some(b => b.id === baseId)) return erro(400, 'Escolha uma base válida.');
    if (db.estudio_relatorios.some(x => x.nome === nome)) return erro(409, `Já existe um relatório chamado ${nome}.`);
    const rel = { id: db.seq.erel++, nome, base_id: baseId, definicao: DEF_VAZIA(), definicao_publicada: null, publicado_em: null, arquivado: false, arquivado_em: null, criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() };
    db.estudio_relatorios.push(rel); salvar(); return r(201, { relatorio: rel });
  });
  rota('GET', '/api/estudio/relatorios/:id', auth, admin, req => { const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    return r(200, { relatorio: rel, base: db.estudio_bases.find(b => b.id === rel.base_id), arquivos: arquivosDa(rel.base_id) }); });
  rota('PUT', '/api/estudio/relatorios/:id', auth, admin, req => {
    const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    const def = req.body.definicao;
    if (!def || !Array.isArray(def.guias) || !def.guias.length) return erro(400, 'O relatório precisa ter pelo menos uma guia.');
    if (req.body.nome !== undefined) { const n = String(req.body.nome).trim().toUpperCase(); if (!n) return erro(400, 'Informe o nome do relatório.'); if (db.estudio_relatorios.some(x => x.id !== rel.id && x.nome === n)) return erro(409, `Já existe um relatório chamado ${n}.`); rel.nome = n; }
    rel.definicao = def; rel.atualizado_em = agora(); salvar(); return r(200, { relatorio: rel });
  });
  rota('PATCH', '/api/estudio/relatorios/:id/arquivar', auth, admin, req => {
    const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    const arq = req.body.arquivado === true; rel.arquivado = arq; rel.arquivado_em = arq ? agora() : null;
    const card = db.relatorios.find(x => x.estudio_relatorio_id === rel.id);
    if (card) { card.ativo = !arq; card.descontinuado_em = arq ? agora() : null; card.atualizado_em = agora(); }
    salvar(); return r(200, { relatorio: { id: rel.id, nome: rel.nome, arquivado: rel.arquivado, arquivado_em: rel.arquivado_em }, cardAtualizado: !!card });
  });
  rota('POST', '/api/estudio/relatorios/:id/publicar', auth, admin, req => {
    const rel = db.estudio_relatorios.find(x => x.id === +req.params.id); if (!rel) return erro(404, 'Relatório não encontrado.');
    if (!String(req.body.categoria || '').trim()) return erro(400, 'Escolha a categoria do card.');
    rel.definicao_publicada = JSON.parse(JSON.stringify(rel.definicao)); rel.publicado_em = agora();
    let card = db.relatorios.find(x => x.estudio_relatorio_id === rel.id), cardCriado = false;
    const descricao = req.body.descricao ? String(req.body.descricao).trim().toUpperCase() : null;
    if (card) Object.assign(card, { titulo: rel.nome, categoria: req.body.categoria, descricao, atualizado_em: agora() });
    else { card = { id: db.seq.rel++, titulo: rel.nome, categoria: req.body.categoria, descricao, link: null, tipo: 'estudio', estudio_relatorio_id: rel.id, visivel: true, ativo: true, descontinuado_em: null, criado_por: req.usuario.id, criado_em: agora(), atualizado_em: agora() }; db.relatorios.push(card); cardCriado = true; }
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
  rota('POST', '/api/estudio/csat/editor', auth, admin, req => { const res = csatEditor(req.usuario.id); salvar(); return r(200, res); });

  /* ---------- atendimento das chamadas (no lugar da rede) ---------- */
  async function atender(url, opcoes = {}) {
    await pronto;
    const metodo = (opcoes.method || 'GET').toUpperCase();
    const [caminhoQ, consulta] = url.slice(BASE.length - 1).split('?');
    const partes = caminhoQ.split('/').filter(Boolean);
    const headers = {}; new Headers(opcoes.headers || {}).forEach((v, k) => { headers[k.toLowerCase()] = v; });
    let body = {}; try { body = opcoes.body ? JSON.parse(opcoes.body) : {}; } catch (e) {}
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
