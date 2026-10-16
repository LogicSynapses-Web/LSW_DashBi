/* =====================================================================
   QUADRO — SOLICITAÇÃO DE AJUSTE (fase 4 · protótipo)
   Botão "Solicitar ajuste" no cartão da pessoa → janela de preenchimento.
   Organizado a partir do formulário "ESCALAS/QUADRO", sem as repetições:
     1. bloco fixo: quem é a pessoa (já preenchido) + data de início
     2. tipo de ajuste (cada tipo mostra só as perguntas dele)
     3. complemento: partiu do Planejamento? observação, anexos (imagens)
   O pedido vira um "ticket" (nº automático) na gaveta "tickets", status Aberto.
   Depende do quadro-base.js e do quadro.js (qd, qdModal, qdFecharModal).
   ===================================================================== */

// Tipos de ajuste. "definitiva" e "casada" = perguntas de troca de horário/folga do formulário original.
const QS_TIPOS = {
  horario:     { nome: 'Horário / carga horária', icone: '🕒', troca: true },
  folga:       { nome: 'Troca de folga',          icone: '📅', troca: true },
  folga_extra: { nome: 'Folga extra',             icone: '🎉' },
  hierarquia:  { nome: 'Supervisor (hierarquia)', icone: '👥' },
  status:      { nome: 'Situação',                icone: '🏷️' },
  segmento:    { nome: 'Segmento / produto',      icone: '🧭' },
  regime:      { nome: 'Regime de trabalho',      icone: '🏠' },
  escala:      { nome: 'Escala / pausas',         icone: '⏸️' },
};
const QS_STATUS_NOVOS = ['ATIVO', 'FÉRIAS', 'DESLIGADO (PEDIDO DO OPERADOR)', 'DESLIGADO (EMPRESA/ABANDONO)', 'LICENÇA MATERNIDADE',
  'LICENÇA PATERNIDADE', 'LICENÇA CASAMENTO', 'LICENÇA AMAMENTAÇÃO', 'TREINAMENTO LOGADO', 'TREINAMENTO DESLOGADO', 'INSS', 'FOCAL', 'ADM OP'];
const QS_FOLGA_EXTRA = ['ANIVERSÁRIO (validado pelo gerente)', 'BANCO DE HORAS', 'CAMPANHA (validado pelo gerente)', 'TRE'];
const QS_REGIMES = ['PRESENCIAL (SITE)', 'HOME OFFICE', 'HÍBRIDO'];
// Situação do ticket (as guias da tela de solicitações)
const QS_SITUACOES = {
  aberto:    { nome: 'Aberto',    cor: 'info' },
  andamento: { nome: 'Andamento', cor: 'alerta' },
  aprovado:  { nome: 'Aprovado',  cor: 'ok' },
  reprovado: { nome: 'Reprovado', cor: 'perigo' },
  cancelado: { nome: 'Cancelado', cor: 'apagado' },
};
const qsSelo = s => { const x = QS_SITUACOES[s] || QS_SITUACOES.aberto; return `<span class="qd-selo qd-selo-${x.cor}">${x.nome}</span>`; };
const QS_ANEXO_MAX = 2 * 1024 * 1024, QS_ANEXOS_QTD = 3;

let qs = null; // pedido em preenchimento (formulário montado pelo modelo: quadro-modelos.js)
// Nome do tipo do pedido: o do modelo (resposta da escolha principal) ou o tipo fixo dos pedidos antigos
const qsTipoNome = t => t.tipo_nome || (QS_TIPOS[t.tipo] || {}).nome || t.tipo;

/* ---------------- aplicar solicitações aprovadas (chamado pelo qdRecalcular) ---------------- */
// Campos que também vêm na base do DPO: nesses, a carga seguinte confere o pedido
const QS_CAMPOS_DPO = ['hora_entrada', 'carga_horaria', 'gestor1', 'gestor2', 'segmento', 'situacao'];
// Situação pedida (lista do formulário) → status do quadro
function qsStatusPedido(s){
  const n = qdNorm(s);
  if (n.startsWith('DESLIGADO')) return 'desligado';
  if (n === 'FERIAS') return 'ferias';
  if (n.startsWith('LICENCA') || n === 'INSS') return 'afastado';
  return 'ativo'; // ATIVO, TREINAMENTO, FOCAL, ADM OP
}
// A carga trouxe o que foi pedido?
function qsCargaIgual(d, m){
  if (m.campo === 'situacao') return qdStatusDpo(d.situacao) === qsStatusPedido(m.para);
  return qdNorm(d[m.campo]) === qdNorm(m.para);
}
// Põe o pedido no funcionário (soForaDpo = só campos que a base não tem, como o regime)
function qsAplicarNoFuncionario(f, t, soForaDpo){
  t.mudancas.forEach(m => {
    if (m.campo === 'folga' || (soForaDpo && QS_CAMPOS_DPO.includes(m.campo))) return;
    if (m.campo === 'situacao') {
      const s = qsStatusPedido(m.para), fim = (t.detalhes || {}).data_fim || '';
      f.situacao = m.para;
      f.status = s;
      if (s === 'ferias') { f.ferias_ini = t.data_inicio; f.ferias_fim = fim; }
      if (s === 'afastado') { f.afast_ini = t.data_inicio; f.afast_fim = fim; f.motivo_afast = m.para; }
      if (s === 'desligado') { f.desligamento = t.data_inicio; f.motivo_deslig = m.para; }
    } else f[m.campo] = m.para;
    if (m.campo === 'hora_entrada') f.turno = qdTurno(m.para);
  });
  f.ajustes = [...(f.ajustes || []), t.id];
}
// Devolve os tickets que mudaram (para gravar junto com o quadro)
function qsAplicarAprovados(tickets, novos, dpoMat, origem){
  const hoje = qdHoje(), agora = new Date().toISOString(), mudados = [];
  const evento = (t, acao) => t.eventos.push({ em: agora, quem: 'Sistema', acao });
  tickets.filter(t => t.status === 'aprovado' && t.mudancas.length)
    .sort((a, b) => (a.aprovado_em || '').localeCompare(b.aprovado_em || ''))
    .forEach(t => {
      if (t.data_inicio > hoje) return; // agendada: entra em vigor na data de início
      const f = novos.get(t.matricula), d = dpoMat.get(t.matricula);
      let mudou = false;
      if (!f) {
        if (!t.aplicado_em) { t.aplicado_em = agora; t.nao_aplicado = 'Pessoa fora da base do DPO'; evento(t, 'Não aplicada: a pessoa não está na base do DPO'); mudados.push(t); }
        return;
      }
      const temDpo = t.mudancas.some(m => QS_CAMPOS_DPO.includes(m.campo));
      // Carga do DPO com data igual ou depois do início: confere o pedido
      if (origem.tipo === 'dpo' && temDpo && d && origem.dataBase >= t.data_inicio && t.conferido !== 'carga' && t.resolucao !== 'carga') {
        const dif = t.mudancas.filter(m => QS_CAMPOS_DPO.includes(m.campo) && !qsCargaIgual(d, m))
          .map(m => ({ campo: m.campo, carga: m.campo === 'situacao' ? d.situacao : (d[m.campo] || ''), pedido: m.para }));
        if (!dif.length) {
          t.conferido = 'carga'; t.conferido_base = origem.dataBase; t.divergencia = null;
          evento(t, `Confirmada pela carga do DPO de ${qdDataBr(origem.dataBase)}`);
          mudou = true;
        } else if (t.resolucao !== 'manter') {
          t.divergencia = { base: origem.dataBase, itens: dif };
          evento(t, `A carga do DPO de ${qdDataBr(origem.dataBase)} veio diferente do pedido`);
          mudou = true;
        }
      }
      // Confirmada pela carga ou "vale a carga nova": a base já tem o valor; só o que a base não tem continua valendo
      qsAplicarNoFuncionario(f, t, t.conferido === 'carga' || t.resolucao === 'carga');
      if (t.divergencia && !t.resolucao) f.pedido_divergente = t.id;
      if (!t.aplicado_em) { t.aplicado_em = agora; evento(t, 'Aplicada ao quadro'); mudou = true; }
      if (mudou) mudados.push(t);
    });
  return mudados;
}

/* ---------------- aba SOLICITAÇÕES: guias, busca e lista ---------------- */
const qsLista = { guia: 'aberto', texto: '', tipo: '', soVermelhas: false };
const qsVermelha = t => t.status === 'aprovado' && t.divergencia && !t.resolucao;
function qsRenderLista(){
  const corpo = qdEl('qd-corpo');
  const todos = qd.tickets || [];
  const cont = {}; todos.forEach(t => cont[t.status] = (cont[t.status] || 0) + 1);
  const nVerm = todos.filter(qsVermelha).length;
  const guia = s => `<button class="qs-guia${qsLista.guia === s ? ' ativa' : ''}" onclick="qsLista.guia = '${s}'; qsLista.soVermelhas = false; qsRenderLista()">
    ${QS_SITUACOES[s].nome} <b>${qdNum(cont[s] || 0)}</b>${s === 'aprovado' && nVerm ? `<i class="qs-guia-alerta" title="Carga diferente do pedido">${nVerm}</i>` : ''}</button>`;
  corpo.innerHTML = `
    <div class="qs-topo">
      <div class="qs-guias">${['aprovado', 'aberto', 'andamento', 'reprovado', 'cancelado'].map(guia).join('')}</div>
      <div class="qs-busca">
        <select onchange="qsLista.tipo = this.value; qsRenderTabela()"><option value="">Todos os tipos</option>
          ${[...new Set(todos.map(qsTipoNome))].sort().map(n => `<option value="${qdEsc(n)}"${qsLista.tipo === n ? ' selected' : ''}>${qdEsc(n)}</option>`).join('')}</select>
        <div class="qd-busca-mini">
          <input type="text" id="qs-busca" placeholder="Nome, nº, supervisor ou data" value="${qdEsc(qsLista.texto)}" oninput="qsLista.texto = this.value; qsRenderTabela()" autocomplete="off">
          <button class="qd-busca-lupa" title="Pesquisar" onclick="qdEl('qs-busca').focus()"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
        </div>
      </div>
    </div>
    ${nVerm ? `<button class="qs-aviso-vermelho" onclick="qsLista.guia = 'aprovado'; qsLista.soVermelhas = true; qsRenderLista()">
      <b>${qdNum(nVerm)}</b> solicitação(ões) aprovada(s) com a carga do DPO diferente do pedido — clique para conferir</button>` : ''}
    <div class="panel tela-tabela"><div id="qs-tabela" class="tela-col"></div></div>`;
  qsRenderTabela();
}
function qsFiltrados(){
  const t = qdNorm(qsLista.texto);
  const dataBr = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
  return (qd.tickets || []).filter(x => {
    if (t) {
      // Busca vale em todas as guias: nº, nome, matrícula, supervisor ou data (aberta em / início)
      const achou = String(x.id) === t.replace(/^N?º?\s*/, '') || qdNorm(x.nome).includes(t) || x.matricula.includes(t) ||
        qdNorm(x.supervisor).includes(t) || dataBr(x.criado_em).includes(t) || qdDataBr(x.data_inicio).includes(t);
      if (!achou) return false;
    } else if (x.status !== qsLista.guia) return false;
    if (qsLista.tipo && qsTipoNome(x) !== qsLista.tipo) return false;
    if (qsLista.soVermelhas && !qsVermelha(x)) return false;
    return true;
  }).sort((a, b) => qsVermelha(b) - qsVermelha(a) || b.id - a.id);
}
// "o que muda" em uma linha (para a lista)
function qsResumo(t){
  const d = t.detalhes || {};
  if (t.mudancas.length) return t.mudancas.map(m => `${QD_CAMPOS_NOME[m.campo] || m.campo}: ${qdValorCampo(m.campo, m.de)} → ${qdValorCampo(m.campo, m.para)}`).join(' · ');
  if (t.tipo === 'folga_extra') return `${d.folga_tipo || ''} em ${qdDataBr(d.folga_data)}`;
  if (t.tipo === 'escala') return d.escala || '';
  // Pedido feito por modelo, sem mudança no quadro: as respostas (menos a escolha do tipo)
  if (t.respostas) return t.respostas.filter(x => x.valor !== t.tipo_nome).slice(0, 3).map(x => `${x.rotulo}: ${x.valor}`).join(' · ');
  return '';
}
function qsRenderTabela(){
  const alvo = qdEl('qs-tabela');
  if (!alvo) return;
  const lista = qsFiltrados();
  if (!lista.length) {
    alvo.innerHTML = `<div class="empty-state"><p>${qsLista.texto ? 'Nenhuma solicitação encontrada.' : `Nenhuma solicitação em "${QS_SITUACOES[qsLista.guia].nome}".`}</p>
      <p class="qd-fraco">Para abrir uma: aba Quadro atual → escolha a pessoa → "Solicitar ajuste".</p></div>`;
    return;
  }
  alvo.innerHTML = `
    <div class="table-wrap qd-tabela qs-tabela">
      <table>
        <thead><tr><th>Nº</th><th>Aberta em</th><th>Funcionário</th><th>Supervisor</th><th>Tipo</th><th>O que muda</th><th>Início</th><th>Situação</th></tr></thead>
        <tbody>${lista.map(t => `<tr class="${qsVermelha(t) ? 'qd-linha-vermelha' : ''}" onclick="qsVer(${t.id})">
          <td><b>${t.id}</b></td>
          <td>${new Date(t.criado_em).toLocaleDateString('pt-BR')}</td>
          <td class="qd-nome" title="${qdEsc(t.nome)}">${qdEsc(t.nome)} <small class="qd-fraco">${qdEsc(t.matricula)}</small></td>
          <td class="qd-corta" title="${qdEsc(t.supervisor)}">${qdEsc(t.supervisor || '—')}</td>
          <td>${qdEsc(qsTipoNome(t))}</td>
          <td class="qs-resumo" title="${qdEsc(qsResumo(t))}">${qdEsc(qsResumo(t) || '—')}</td>
          <td>${qdDataBr(t.data_inicio)}</td>
          <td>${qsSelo(t.status)}${qsVermelha(t) ? ' <span class="qd-alerta" title="Carga do DPO diferente do pedido">!</span>' : ''}${qsEtiqueta(t)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="qd-rodape-tabela"><span>${qdNum(lista.length)} solicitação(ões)${qsLista.texto ? ' · busca em todas as guias' : ''}</span></div>`;
}
// Etiqueta curta do que aconteceu depois da aprovação
function qsEtiqueta(t){
  if (t.status !== 'aprovado') return '';
  if (t.nao_aplicado) return ' <small class="qd-fraco">não aplicada</small>';
  if (t.resolucao === 'carga') return ' <small class="qd-fraco">vale a carga</small>';
  if (t.conferido === 'carga') return ' <small class="qd-fraco">confirmada pela carga</small>';
  if (t.mudancas.length && !t.aplicado_em) return ` <small class="qd-fraco">agendada p/ ${qdDataBr(t.data_inicio)}</small>`;
  return '';
}

/* ---------------- ver uma solicitação + ações do ADM ---------------- */
function qsVer(id){
  const t = qd.tickets.find(x => x.id === id);
  if (!t) return;
  const d = t.detalhes || {};
  const linha = (rot, val) => val ? `<div class="qd-dl"><dt>${rot}</dt><dd>${qdEsc(val)}</dd></div>` : '';
  const simNao = x => x === 'sim' ? 'Sim' : x === 'nao' ? 'Não' : '';
  const nomeCampo = c => QD_CAMPOS_NOME[c] || c;
  const div = qsVermelha(t) && pode('quadro.analisar') ? `
    <div class="qs-divergencia">
      <b>A carga do DPO de ${qdDataBr(t.divergencia.base)} veio diferente do que foi aprovado:</b>
      <ul>${t.divergencia.itens.map(i => `<li>${qdEsc(nomeCampo(i.campo))}: o pedido era <b>${qdEsc(qdValorCampo(i.campo, i.pedido))}</b>, a carga trouxe <b>${qdEsc(qdValorCampo(i.campo, i.carga) )}</b></li>`).join('')}</ul>
      <p>Enquanto você não decide, <b>vale o pedido</b>. Se a carga estiver certa (ex.: o RH lançou outra data), escolha "Vale a carga nova".</p>
      <div class="qs-divergencia-acoes">
        <button class="btn btn-primary btn-small" style="width:auto" onclick="qsResolver(${t.id}, 'carga')">Vale a carga nova</button>
        <button class="btn btn-ghost btn-small" onclick="qsResolver(${t.id}, 'manter')">Manter o pedido</button>
      </div>
    </div>` : '';
  const podeAgir = (t.status === 'aberto' || t.status === 'andamento') && pode('quadro.analisar'); // perfil de acesso
  const acoes = podeAgir ? `
    <h4 class="qd-ficha-sub">Análise do ADM</h4>
    <div class="field"><textarea id="qs-comentario" rows="2" placeholder="Comentário (obrigatório para reprovar ou cancelar)"></textarea></div>
    <div class="qs-acoes">
      ${t.status === 'aberto' ? `<button class="btn btn-ghost" onclick="qsAgir(${t.id}, 'andamento')">Colocar em andamento</button>` : ''}
      <button class="btn btn-ghost qs-btn-cancelar" onclick="qsAgir(${t.id}, 'cancelado')">Cancelar</button>
      <button class="btn btn-danger-ghost" onclick="qsAgir(${t.id}, 'reprovado')">Reprovar</button>
      <button class="btn btn-primary" style="width:auto" onclick="qsAgir(${t.id}, 'aprovado')">Aprovar${t.mudancas.length ? ' e aplicar' : ''}</button>
    </div>` : '';
  qdModal(`Solicitação nº ${t.id}`, `
    <div class="qd-ficha">
      <div class="qd-ficha-topo">
        <div><div class="qd-ficha-nome">${qdEsc(qsTipoNome(t))}</div>${t.modelo_nome ? `<div class="qd-fraco">Modelo: ${qdEsc(t.modelo_nome)}</div>` : ''}
          <div class="qd-fraco">${qdEsc(t.nome)} · matrícula ${qdEsc(t.matricula)} · aberta em ${new Date(t.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} por ${qdEsc(t.criado_por || '—')}</div></div>
        <div>${qsSelo(t.status)}${qsEtiqueta(t)}</div>
      </div>
      ${div}
      ${t.mudancas.length ? `<h4 class="qd-ficha-sub">O que muda (a partir de ${qdDataBr(t.data_inicio)})</h4>
        <div class="qd-bloco">${t.mudancas.map(m => `<div class="qd-dl"><dt>${qdEsc(nomeCampo(m.campo))}</dt>
          <dd>${qdEsc(qdValorCampo(m.campo, m.de))} → <b>${qdEsc(qdValorCampo(m.campo, m.para))}</b></dd></div>`).join('')}</div>`
        : `<p class="qd-fraco">A partir de ${qdDataBr(t.data_inicio)}.</p>`}
      <h4 class="qd-ficha-sub">${t.respostas ? 'Respostas' : 'Detalhes'}</h4>
      ${t.respostas ? `<div class="qd-bloco">${t.respostas.map(x => `<div class="qd-dl"><dt>${qdEsc(x.rotulo)}<small class="qd-fraco qs-resp-secao">${qdEsc(x.secao)}</small></dt><dd>${qdEsc(x.valor)}</dd></div>`).join('')}</div>` : `
      <div class="qd-bloco">
        ${linha('Definitiva', simNao(d.definitiva))}${linha('Troca casada', simNao(d.casada))}
        ${d.colega ? linha('Troca com', `${d.colega.nome} (matrícula ${d.colega.matricula})`) : ''}${linha('Tentou pelo WFM', simNao(d.via_wfm))}
        ${linha('Folga extra', d.folga_tipo ? `${d.folga_tipo} em ${qdDataBr(d.folga_data)}` : '')}
        ${linha('Fim da situação', d.data_fim ? qdDataBr(d.data_fim) : '')}${linha('Escala / pausas', d.escala)}
        ${linha('Partiu do Planejamento', simNao(t.planejamento))}${linha('Observação', t.observacao)}
      </div>`}
      ${t.anexos && t.anexos.length ? `<h4 class="qd-ficha-sub">Anexos</h4><div class="qs-anexos">${t.anexos.map((a, i) => `<figure><a id="qs-anexo-a-${i}" ${a.dado ? `href="${a.dado}"` : ''} target="_blank" rel="noopener"><img id="qs-anexo-${i}" ${a.dado ? `src="${a.dado}"` : ''} alt="carregando…"></a><figcaption>${qdEsc(a.nome)}</figcaption></figure>`).join('')}</div>` : ''}
      <h4 class="qd-ficha-sub">Andamento</h4>
      <ul class="qd-traj">${t.eventos.slice().reverse().map(e => `<li><span class="qd-traj-data">${new Date(e.em).toLocaleDateString('pt-BR')}</span>
        <span>${qdEsc(e.acao)}${e.comentario ? ` — <i>${qdEsc(e.comentario)}</i>` : ''}<small>${qdEsc(e.quem || '')}</small></span></li>`).join('')}</ul>
      ${acoes}
    </div>`);
  qsCarregarAnexos(t);
}
// As imagens ficam na gaveta "anexos" (uma por item) e só são lidas ao abrir a solicitação
async function qsCarregarAnexos(t){
  for (const [i, a] of (t.anexos || []).entries()) {
    if (a.dado) continue;
    try {
      const im = await qdPegar('anexos', `${t.id}-${i}`);
      const img = qdEl('qs-anexo-' + i), link = qdEl('qs-anexo-a-' + i);
      if (im && img) { img.src = im.dado; link.href = im.dado; }
    } catch (e) {}
  }
}
async function qsSalvar(t){ await qdGravar({ tickets: [t] }); }
// Aprovar, reprovar, cancelar ou colocar em andamento
async function qsAgir(id, novo){
  const t = qd.tickets.find(x => x.id === id);
  const comentario = (qdEl('qs-comentario')?.value || '').trim();
  if ((novo === 'reprovado' || novo === 'cancelado') && !comentario) return showToast('Escreva o motivo no comentário.', 'erro');
  const quem = session ? session.name : '', em = new Date().toISOString();
  const nomes = { andamento: 'Colocada em andamento', aprovado: 'Aprovada', reprovado: 'Reprovada', cancelado: 'Cancelada' };
  t.status = novo;
  t.eventos.push({ em, quem, acao: nomes[novo], comentario });
  if (novo === 'aprovado') { t.aprovado_em = em; t.aprovado_por = quem; }
  try {
    await qsSalvar(t);
    // Aprovada com mudanças: o quadro é refeito já com o pedido (se a data de início já chegou)
    if (novo === 'aprovado' && t.mudancas.length) await qdRecalcularSemCarga('solicitacao', `Solicitação nº ${t.id} (pedida por ${t.criado_por || '—'}) aprovada`);
    else await qdAbrir(false);
    qsVer(id);
    const fut = novo === 'aprovado' && t.mudancas.length && t.data_inicio > qdHoje();
    showToast(`Solicitação nº ${id}: ${nomes[novo].toLowerCase()}${fut ? ` — entra no quadro em ${qdDataBr(t.data_inicio)}` : ''}.`);
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}
// Carga diferente do pedido: "vale a carga nova" ou "manter o pedido"
async function qsResolver(id, escolha){
  const t = qd.tickets.find(x => x.id === id);
  const quem = session ? session.name : '';
  t.resolucao = escolha;
  t.eventos.push({ em: new Date().toISOString(), quem, acao: escolha === 'carga' ? 'ADM: vale a carga nova do DPO' : 'ADM: mantido o pedido (a carga foi ignorada)' });
  try {
    await qsSalvar(t);
    await qdRecalcularSemCarga('solicitacao', `Solicitação nº ${t.id}: ${escolha === 'carga' ? 'vale a carga do DPO' : 'mantido o pedido'}`);
    qsVer(id);
    showToast(escolha === 'carga' ? 'Feito: vale a carga nova.' : 'Feito: o pedido continua valendo.');
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}
