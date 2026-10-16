/* =====================================================================
   QUADRO (fase 4 · protótipo P1) — PARTE COMUM
   Usada pelo sistema (index.html + quadro.js) e pela página avulsa de
   pesquisa (pesquisa.html). Desde 16/10/2026 os dados ficam no BANCO (Supabase),
   pelo servidor; antes ficavam só no navegador (IndexedDB).
   Não guarda CPF, salário, endereço, telefone nem e-mail.
   ===================================================================== */

/* ---------------- situações (status) ---------------- */
// Ordem = ordem dos cards e dos filtros. "cor" = classe do selo (quadro.css).
const QD_STATUS = {
  ativo:     { nome: 'Ativo',             cor: 'ok' },
  ferias:    { nome: 'Férias',            cor: 'info' },
  afastado:  { nome: 'Afastado',          cor: 'alerta' },
  aviso:     { nome: 'Aviso prévio',      cor: 'alerta' },
  rescisao:  { nome: 'Rescisão indireta', cor: 'perigo' },
  desligado: { nome: 'Desligado',         cor: 'apagado' },
  outro:     { nome: 'Outro',             cor: 'apagado' },
};
// Fora do quadro = desligado ou rescisão indireta (a rescisão indireta é um desligamento — regra de negócio)
const qdForaDoQuadro = s => s === 'desligado' || s === 'rescisao';
// Situação Oficial do DPO → status do quadro (o DPO é quem vale)
function qdStatusDpo(sit){
  const s = qdNorm(sit);
  if (s === 'ATIVO' || s === 'PROMOVIDO') return 'ativo';
  if (s === 'FERIAS') return 'ferias';
  if (s === 'AFASTADO') return 'afastado';
  if (s === 'AVISO PREVIO') return 'aviso';
  if (s === 'DESLIGADO') return 'desligado';
  return 'outro';
}
// Situação do WFM → mesmo vocabulário (para comparar com o DPO)
function qdStatusWfm(sit){
  const s = qdNorm(sit);
  if (!s) return '';
  if (s === 'ATIVO' || s === 'TREINAMENTO') return 'ativo';
  if (s === 'FERIAS') return 'ferias';
  if (s === 'INSS' || s.startsWith('LICENCA')) return 'afastado';
  if (s === 'DESLIGADO' || s.startsWith('TRANSFERENCIA')) return 'desligado';
  return 'outro';
}
// Turno pela hora de entrada (cortes 06:00 · 11:00 · 17:00 · 22:00)
const QD_TURNOS = { manha: 'Manhã (06–11h)', tarde: 'Tarde (11–17h)', noite: 'Noite (17–22h)', madrugada: 'Madrugada (22–06h)' };
function qdTurno(hora){
  const m = String(hora || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = +m[1];
  if (h >= 6 && h < 11) return 'manha';
  if (h >= 11 && h < 17) return 'tarde';
  if (h >= 17 && h < 22) return 'noite';
  return 'madrugada';
}

/* ---------------- ajudas ---------------- */
// Texto sem acento, maiúsculo e com espaços simples (para comparar nomes e situações)
const qdNorm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const qdEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const qdNum = v => Number(v || 0).toLocaleString('pt-BR');
const qdDataBr = iso => iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—';
const qdHoje = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
// "02/05/2024" ou "2024-05-02 00:00:00" → "2024-05-02"; vazio → ''
function qdIso(v){
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
// "06:20:00" → "06:20" (pega o primeiro HH:MM que aparecer)
function qdHora(v){
  const m = String(v ?? '').match(/(\d{1,2}):(\d{2})/);
  return m ? m[1].padStart(2, '0') + ':' + m[2] : '';
}
// Início e fim da situação atual (férias, afastamento, aviso, desligamento), vindos das bases
function qdPeriodo(f){
  const w = f.wfm || {};
  switch (f.status) {
    case 'ferias': return [f.ferias_ini || w.ferias_ini, f.ferias_fim || w.ferias_fim];
    case 'afastado': return [f.afast_ini || w.sit_ini, f.afast_fim || w.sit_fim];
    case 'aviso': return [f.aviso_ini, f.aviso_fim];
    case 'desligado': return [f.desligamento, ''];
    case 'rescisao': return [w.sit_ini || w.dt_situacao, ''];
    default: return ['', ''];
  }
}
function qdSelo(status){
  const s = QD_STATUS[status] || QD_STATUS.outro;
  return `<span class="qd-selo qd-selo-${s.cor}">${s.nome}</span>`;
}

/* ---------------- armazenamento: BANCO (16/10/2026) ---------------- */
// Gavetas (as mesmas do protótipo; agora no banco, tabela quadro_dados, pelo servidor):
//   config        ajustes (clientes do quadro, pendências de vínculo, modelos de ticket)
//   dpo / wfm     última carga de cada base, já limpa (só os campos usados)
//   funcionarios  quadro montado: DPO + WFM ligados, status, turno, divergências
//   vinculos      decisões do ADM sobre ligações DPO × WFM (por Cód. RE)
//   cargas        histórico das cargas
//   fotos         foto de cada dia (como o dia fechou)
//   historico     trajetória: cada mudança de cada funcionário
//   tickets       solicitações de ajuste (nº automático, dado pelo banco)
//   anexos        imagens das solicitações (uma por item: "nº-posição"), lidas só ao abrir a solicitação
const qdApiUrl = () => (typeof API_URL !== 'undefined' ? API_URL
  : ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:3000' : 'lsw-demo');
async function qdApi(caminho, opcoes = {}){
  const r = await fetch(qdApiUrl() + caminho, { ...opcoes, headers: { ...(opcoes.headers || {}), Authorization: 'Bearer ' + (localStorage.getItem('token') || '') } });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error((j && j.erro) || `Erro ${r.status} no servidor.`);
  return j;
}
// Leitura: a gaveta inteira, ou filtrada por chave / matrícula / prefixo da chave
function qdLer(store, filtro = {}){
  const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  return qdApi(`/api/quadro/dados/${store}${q ? '?' + q : ''}`);
}
const qdTodos = store => qdLer(store);
async function qdPegar(store, chave){ return (await qdLer(store, { chave }))[0]; }
// Único índice usado: matrícula (trajetória e solicitações de uma pessoa)
const qdPorIndice = (store, indice, valor) => qdLer(store, { matricula: valor });
async function qdConfig(chave, padrao){ const r = await qdPegar('config', chave); return r ? r.valor : padrao; }
// Grava tudo numa transação só (ou grava tudo, ou nada).
// mapa = { gaveta: [itens] }; trocar = gavetas esvaziadas antes de gravar. Devolve as chaves gravadas ({ tickets: ['12'] }).
// Vai compactado (gzip): a base DPO crua passa de 2 MB e o servidor aceita até ~4,5 MB por envio.
async function qdGravar(mapa, trocar = []){
  const json = JSON.stringify({ mapa, trocar });
  let corpo = json, tipo = 'application/json';
  if (typeof CompressionStream !== 'undefined') {
    corpo = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    tipo = 'application/octet-stream';
  }
  const r = await qdApi('/api/quadro/gravar', { method: 'POST', headers: { 'Content-Type': tipo }, body: corpo });
  return r.chaves || {};
}
// Remove itens de uma gaveta (ex.: desfazer vínculo)
const qdRemover = (store, chaves) => qdApi('/api/quadro/remover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loja: store, chaves: chaves.map(String) }) });
// Apaga o Quadro inteiro do banco (só o perfil com acesso total)
const qdApagarTudo = () => qdApi('/api/quadro/remover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tudo: true }) });
// Imagens de uma solicitação saem do pedido e vão para a gaveta "anexos" (uma por envio, por causa do tamanho)
function qdSepararAnexos(t){
  const imagens = (t.anexos || []).filter(a => a && a.dado);
  t.anexos = (t.anexos || []).map(a => ({ nome: a.nome, tipo: a.tipo }));
  return imagens;
}
async function qdGravarAnexos(t, imagens){
  for (let i = 0; i < imagens.length; i++) {
    await qdGravar({ anexos: [{ chave: `${t.id}-${i}`, matricula: t.matricula, ticket: t.id, nome: imagens[i].nome, tipo: imagens[i].tipo, dado: imagens[i].dado }] });
  }
}

/* ---------------- dados antigos do protótipo NESTE navegador (IndexedDB) ---------------- */
// Até 15/10/2026 o Quadro guardava tudo no navegador. Aqui só LEMOS esse banco antigo,
// uma vez, para enviar ao banco de verdade (botão "Enviar para o banco" em Cargas).
const QD_DB = 'dashbi-quadro';
const QD_LOJAS_LOCAIS = ['config', 'dpo', 'wfm', 'funcionarios', 'vinculos', 'cargas', 'fotos', 'historico', 'tickets'];
async function qdLocalAbrir(){
  // Não cria o banco antigo se ele não existir (só abre o que já está lá)
  if (!indexedDB.databases) return null;
  const lista = await indexedDB.databases();
  if (!lista.some(d => d.name === QD_DB)) return null;
  return new Promise(ok => {
    const req = indexedDB.open(QD_DB);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ok(null);
    req.onupgradeneeded = () => { req.transaction.abort(); ok(null); };
  });
}
async function qdLocalLer(){
  const db = await qdLocalAbrir();
  if (!db) return null;
  const saida = {};
  for (const loja of QD_LOJAS_LOCAIS) {
    saida[loja] = db.objectStoreNames.contains(loja)
      ? await new Promise((ok, falha) => { const r = db.transaction(loja).objectStore(loja).getAll(); r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error); })
      : [];
  }
  db.close();
  return saida;
}
// Resumo para o aviso: quantas pessoas, vínculos e solicitações há no navegador
async function qdLocalResumo(){
  try {
    const l = await qdLocalLer();
    if (!l || !l.funcionarios.length) return null;
    return { pessoas: l.funcionarios.length, vinculos: l.vinculos.length, tickets: l.tickets.length, cargas: l.cargas.length, fotos: l.fotos.length };
  } catch (e) { return null; }
}
// Envia tudo ao banco, em partes (cada envio fica bem abaixo do limite do servidor)
async function qdMigrarLocal(aviso = () => {}){
  const l = await qdLocalLer();
  if (!l || !l.funcionarios.length) throw new Error('Não há dados do protótipo neste navegador.');
  const partes = (lista, n) => { const out = []; for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n)); return out; };
  aviso('Enviando as bases DPO e WFM…');
  await qdGravar({ dpo: l.dpo }, ['dpo']);
  await qdGravar({ wfm: l.wfm }, ['wfm']);
  aviso('Enviando o quadro, os vínculos e as cargas…');
  await qdGravar({ funcionarios: l.funcionarios, vinculos: l.vinculos, cargas: l.cargas, config: l.config.filter(c => c.chave !== 'migrado') }, ['funcionarios', 'vinculos', 'cargas']);
  aviso('Enviando a trajetória…');
  for (const p of partes(l.historico, 3000)) await qdGravar({ historico: p });
  aviso('Enviando as fotos diárias…');
  for (const p of partes(l.fotos, 8)) await qdGravar({ fotos: p });
  aviso('Enviando as solicitações…');
  const imagens = l.tickets.map(t => [t, qdSepararAnexos(t)]);
  if (l.tickets.length) await qdGravar({ tickets: l.tickets });
  for (const [t, im] of imagens) await qdGravarAnexos(t, im);
  const contagem = { pessoas: l.funcionarios.length, vinculos: l.vinculos.length, tickets: l.tickets.length, historico: l.historico.length, fotos: l.fotos.length };
  await qdGravar({ config: [{ chave: 'migrado', valor: { em: new Date().toISOString(), quem: (typeof session !== 'undefined' && session) ? session.name : '', ...contagem } }] });
  return contagem;
}
/* ---------------- ficha do funcionário (sistema e página de pesquisa) ---------------- */
// Nomes amigáveis dos campos que entram na trajetória
const QD_CAMPOS_NOME = {
  status: 'Situação', situacao: 'Situação no DPO', wfm_situacao: 'Situação no WFM', gestor1: 'Supervisor',
  segmento: 'Segmento', turno: 'Turno', hora_entrada: 'Hora de entrada', carga_horaria: 'Carga horária',
  jornada: 'Jornada', funcao: 'Função', site: 'Site', wfm_operacao: 'Operação (WFM)',
  regime: 'Regime', gestor2: 'Coordenador', folga: 'Folga', ferias_ini: 'Início das férias', afast_ini: 'Início do afastamento', aviso_ini: 'Início do aviso prévio',
  desligamento: 'Data de desligamento', base: 'Base',
};
// Mostra um valor de campo do jeito certo (data, status, turno)
function qdValorCampo(campo, v){
  if (v === '' || v == null) return '—';
  if (campo === 'status') return (QD_STATUS[v] || QD_STATUS.outro).nome;
  if (campo === 'turno') return QD_TURNOS[v] || v;
  if (/_ini$|_fim$|^desligamento$|^admissao$|^folga$/.test(campo)) return qdDataBr(v);
  return v;
}
function qdFichaHtml(f, historico){
  const w = f.wfm;
  const linha = (rotulo, valor, destaque) => `<div class="qd-dl${destaque ? ' qd-dl-div' : ''}"><dt>${rotulo}</dt><dd>${qdEsc(valor || '—')}</dd></div>`;
  const div = new Set((f.divergencias || []).map(d => d.campo));
  const periodo = (a, b) => a || b ? `${qdDataBr(a)} a ${qdDataBr(b)}` : '';
  const dpo = [
    linha('Matrícula', f.matricula), linha('Admissão', qdDataBr(f.admissao)),
    linha('Situação oficial', f.situacao, div.has('status')), linha('Função', f.funcao),
    linha('Segmento', f.segmento), linha('Cliente', f.cliente), linha('Site', f.site),
    linha('Supervisor (gestor 1)', f.gestor1), linha('Gestor 2', f.gestor2),
    linha('Entrada / saída', [f.hora_entrada, f.hora_saida].filter(Boolean).join(' – '), div.has('hora_entrada')),
    linha('Carga horária', f.carga_horaria, div.has('carga_horaria')), linha('Jornada', f.jornada),
    linha('Regime', f.regime || 'não informado'),
    (f.logins || []).length ? linha('Logins', f.logins.map(l => `${l.sistema || 'Sistema'}: ${l.login}`).join(' · ')) : '',
    f.ferias_ini ? linha('Férias', periodo(f.ferias_ini, f.ferias_fim)) : '',
    f.afast_ini ? linha('Afastamento', periodo(f.afast_ini, f.afast_fim) + (f.motivo_afast ? ' · ' + f.motivo_afast : '')) : '',
    f.aviso_ini ? linha('Aviso prévio', periodo(f.aviso_ini, f.aviso_fim)) : '',
    f.desligamento ? linha('Desligamento', qdDataBr(f.desligamento) + (f.motivo_deslig ? ' · ' + f.motivo_deslig : '')) : '',
  ].join('');
  const wfm = w ? [
    linha('Cód. RE', w.re), linha('Admissão', qdDataBr(w.admissao)),
    linha('Situação', w.situacao + (w.sit_ini ? ` (desde ${qdDataBr(w.sit_ini)}${w.sit_fim ? ' até ' + qdDataBr(w.sit_fim) : ''})` : ''), div.has('status') || f.status === 'rescisao'),
    linha('Operação', w.operacao), linha('Cargo', w.cargo), linha('Centro de custo', w.centro_custo),
    linha('Horário de entrada', w.hora_entrada, div.has('hora_entrada')), linha('Carga horária', w.carga_horaria, div.has('carga_horaria')),
    linha('Jornada', w.jornada),
    w.ferias_ini ? linha('Férias', periodo(w.ferias_ini, w.ferias_fim)) : '',
    w.motivo_deslig ? linha('Motivo do desligamento', w.motivo_deslig) : '',
    linha('Ligação com o DPO', { confirmado: 'Confirmada pelo ADM', planilha: 'Pela planilha de vínculos' }[f.vinculo] || 'Automática (nome + admissão)'),
  ].join('') : '<p class="qd-fraco">Sem cadastro ligado no WFM.</p>';
  const avisos = [
    f.status === 'rescisao' ? '<li><b>Rescisão indireta:</b> ativo no DPO e desligado no WFM.</li>' : '',
    ...(f.divergencias || []).map(d => `<li><b>${qdEsc(QD_CAMPOS_NOME[d.campo] || d.campo)}:</b> DPO "${qdEsc(qdValorCampo(d.campo, d.dpo))}" × WFM "${qdEsc(qdValorCampo(d.campo, d.wfm))}" — vale o DPO.</li>`),
    f.fora_base ? `<li>Não veio na carga do DPO de ${qdDataBr(f.fora_base)} (saiu da base).</li>` : '',
  ].filter(Boolean).join('');
  const traj = (historico || []).slice().sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id)).map(h => `
    <li><span class="qd-traj-data">${qdDataBr(h.data)}</span>
      <span><b>${qdEsc(QD_CAMPOS_NOME[h.campo] || h.campo)}:</b> ${qdEsc(qdValorCampo(h.campo, h.de))} → ${qdEsc(qdValorCampo(h.campo, h.para))}
      <small>${qdEsc(h.origem)}${h.quem ? ' · ' + qdEsc(h.quem) : ''}</small></span></li>`).join('');
  return `
    <div class="qd-ficha">
      <div class="qd-ficha-topo">
        <div><div class="qd-ficha-nome">${qdEsc(f.nome)}</div>
          <div class="qd-fraco">Matrícula ${qdEsc(f.matricula)}${w ? ' · Cód. RE ' + qdEsc(w.re) : ''} · ${qdEsc(QD_TURNOS[f.turno] || 'turno não informado')}</div></div>
        ${qdSelo(f.status)}
      </div>
      ${avisos ? `<ul class="qd-avisos">${avisos}</ul>` : ''}
      <div class="qd-ficha-colunas">
        <div class="qd-bloco"><h4>DPO <small>vale este</small></h4>${dpo}</div>
        <div class="qd-bloco"><h4>WFM</h4>${wfm}</div>
      </div>
      <h4 class="qd-ficha-sub">Trajetória</h4>
      ${traj ? `<ul class="qd-traj">${traj}</ul>` : '<p class="qd-fraco">Nenhuma mudança registrada ainda. As mudanças aparecem a partir da segunda carga.</p>'}
    </div>`;
}
