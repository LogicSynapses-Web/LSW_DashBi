/* =====================================================================
   QUADRO — ESTÚDIO DE SOLICITAÇÕES (fase 4 · 14/10/2026)
   Aba "Modelos": o ADM monta os formulários de pedido.
     · Todo modelo começa igual (fixo): pessoa + solicitante + data de início.
     · Depois vêm as SEÇÕES, cada uma com PERGUNTAS.
     · Árvore de decisão: em perguntas de escolha (e Sim/Não), cada resposta
       pode mandar para uma seção ("vai para"); sem caminho, segue para a
       próxima seção definida na própria seção (ou termina).
     · Pergunta ligada a um CAMPO DO QUADRO (horário, supervisor...) vira
       "de → para" no pedido e é aplicada sozinha quando o pedido é aprovado.
   Também aqui: o formulário "Solicitar ajuste", montado a partir do modelo.
   Modelos ficam em config "modelos" (IndexedDB, como o resto do protótipo).
   Depende do quadro-base.js, quadro.js e quadro-solicitacoes.js.
   ===================================================================== */

const QM_TIPOS_PERG = {
  escolha: 'Escolha (com caminhos)', simnao: 'Sim / Não (com caminhos)', lista: 'Lista de opções', texto: 'Texto curto',
  texto_longo: 'Texto longo', numero: 'Número', data: 'Data', hora: 'Hora', pessoa: 'Pessoa do quadro', anexo: 'Anexo (imagem)',
};
const QM_COM_OPCOES = ['escolha', 'simnao', 'lista'], QM_COM_CAMINHO = ['escolha', 'simnao'];
// Campo do quadro que a resposta altera (vira "de → para" e é aplicado na aprovação)
const QM_CAMPOS = {
  '': '— (só informação)', hora_entrada: 'Hora de entrada', carga_horaria: 'Carga horária', gestor1: 'Supervisor', gestor2: 'Coordenador',
  segmento: 'Segmento', situacao: 'Situação', regime: 'Regime', folga_atual: 'Folga atual', folga: 'Nova folga', data_fim: 'Fim da situação',
};
const QM_SUGESTOES = { '': '—', gestor1: 'Supervisores do quadro', gestor2: 'Coordenadores do quadro', segmento: 'Segmentos e operações' };
const qmId = p => p + Math.random().toString(36).slice(2, 8);

/* ---------------- modelo padrão: ESCALAS/QUADRO reorganizado ---------------- */
function qmPadrao(){
  const op = (texto, vai = '', extra = {}) => ({ id: qmId('o'), texto, vai, ...extra });
  const p = (rotulo, tipo, extra = {}) => ({ id: qmId('p'), rotulo, tipo, obrigatoria: true, campo: '', dica: '', sugestoes: '', opcoes: [], ...extra });
  const sn = (rotulo, sim = '', nao = '', extra = {}) => p(rotulo, 'simnao', { opcoes: [op('Sim', sim, extra.simExtra || {}), op('Não', nao)], ...extra });
  const s = (id, titulo, perguntas, proxima = '') => ({ id, titulo, perguntas, proxima });
  return {
    id: 'm_escalas', nome: 'ESCALAS / QUADRO', descricao: 'Ajustes de horário, folga, hierarquia, situação, segmento, regime e escala.', ativo: true,
    inicio: 's_tipo', atualizado_em: new Date().toISOString(),
    secoes: [
      s('s_tipo', 'O que precisa mudar', [p('Tipo de ajuste', 'escolha', { opcoes: [
        op('Horário / carga horária', 's_hor'), op('Troca de folga', 's_folga'), op('Folga extra', 's_fextra'), op('Supervisor (hierarquia)', 's_hier'),
        op('Situação (férias, desligamento, licença…)', 's_status'), op('Segmento / produto', 's_seg'), op('Regime de trabalho', 's_reg'), op('Escala / pausas', 's_esc'),
      ] })]),
      s('s_hor', 'Horário', [p('Novo horário de entrada', 'hora', { campo: 'hora_entrada' }), p('Nova carga horária', 'hora', { campo: 'carga_horaria', obrigatoria: false })], 's_troca'),
      s('s_folga', 'Folga', [p('Data da folga atual', 'data', { campo: 'folga_atual' }), p('Nova data da folga', 'data', { campo: 'folga' })], 's_troca'),
      s('s_troca', 'Período e tipo de troca', [
        sn('A alteração é definitiva?', '', '', { dica: 'Não definitiva: 48 h de antecedência. Definitiva: até o dia 30 para valer em M+2.' }),
        sn('É troca casada (com outra pessoa)?', 's_casada', 's_compl'),
      ], 's_compl'),
      s('s_casada', 'Com quem será a troca', [p('Pessoa da troca', 'pessoa'), sn('Tentou a troca pelo WFM?', '', '', { dica: 'Sem print, a troca casada é improcedente.' })], 's_compl'),
      s('s_fextra', 'Folga extra', [p('Tipo da folga extra', 'lista', { opcoes: QS_FOLGA_EXTRA.map(t => op(t)) }), p('Data da folga', 'data')], 's_compl'),
      s('s_hier', 'Hierarquia', [p('Novo supervisor', 'texto', { campo: 'gestor1', sugestoes: 'gestor1' }), p('Novo coordenador', 'texto', { campo: 'gestor2', sugestoes: 'gestor2', obrigatoria: false })], 's_compl'),
      s('s_status', 'Situação', [p('Nova situação', 'lista', { campo: 'situacao', opcoes: QS_STATUS_NOVOS.map(t => op(t)) }),
        p('Data de fim (se houver)', 'data', { campo: 'data_fim', obrigatoria: false, dica: 'Afastamentos: anexe o e-mail do RH.' })], 's_compl'),
      s('s_seg', 'Segmento / produto', [p('Novo segmento / produto', 'texto', { campo: 'segmento', sugestoes: 'segmento' })], 's_compl'),
      s('s_reg', 'Regime de trabalho', [p('Novo regime', 'lista', { campo: 'regime', opcoes: QS_REGIMES.map(t => op(t)) })], 's_compl'),
      s('s_esc', 'Escala / pausas', [p('O que inserir ou mudar na escala / pausas', 'texto_longo')], 's_compl'),
      s('s_compl', 'Complemento', [
        sn('O pedido partiu do Planejamento (reunião, e-mail, Teams, WhatsApp)?', '', '', { simExtra: { exigeAnexo: true }, dica: 'Se sim, anexe o print e explique na observação.' }),
        p('Observação', 'texto_longo', { obrigatoria: false }), p('Anexos (imagens)', 'anexo', { obrigatoria: false }),
      ], 'fim'),
    ],
  };
}

/* ---------------- guardar / ler ---------------- */
const qm = { modelos: [], sel: null, edit: null, sujo: false };
async function qmCarregar(){
  let lista = await qdConfig('modelos', null);
  if (!lista || !lista.length) { lista = [qmPadrao()]; await qdGravar({ config: [{ chave: 'modelos', valor: lista }] }); }
  qm.modelos = lista;
  return lista;
}
const qmAtivos = () => qm.modelos.filter(m => m.ativo);
const qmSecao = (m, id) => m.secoes.find(s => s.id === id);
// Próxima seção de uma seção: '' = a seguinte da lista; 'fim' = termina
function qmProxima(m, s){
  if (s.proxima === 'fim') return null;
  if (s.proxima) return qmSecao(m, s.proxima) || null;
  const i = m.secoes.indexOf(s);
  return m.secoes[i + 1] || null;
}
// Caminho percorrido com as respostas dadas (para no 1º caminho ainda não respondido)
function qmCaminho(m, respostas){
  const caminho = [], vistos = new Set();
  let s = qmSecao(m, m.inicio) || m.secoes[0];
  while (s && !vistos.has(s.id)) {
    vistos.add(s.id); caminho.push(s);
    let destino, pendente = false;
    for (const p of s.perguntas.filter(x => QM_COM_CAMINHO.includes(x.tipo))) {
      const o = p.opcoes.find(x => x.id === respostas[p.id]);
      if (!o) { if (p.opcoes.some(x => x.vai)) pendente = true; continue; }
      if (o.vai && destino === undefined) destino = o.vai;
    }
    if (destino === undefined && pendente) break; // espera a resposta que decide o caminho
    s = destino === 'fim' ? null : destino ? qmSecao(m, destino) : qmProxima(m, s);
  }
  return caminho;
}

/* ---------------- aba MODELOS (Estúdio de solicitações) ---------------- */
async function qmRender(){
  const corpo = qdEl('qd-corpo');
  // Lê do armazenamento só na 1ª vez: depois a lista em memória pode ter um modelo novo ainda não salvo
  if (!qm.lido) { try { await qmCarregar(); qm.lido = true; } catch (erro) { showToast(erro.message, 'erro'); return; } }
  if (qd.aba !== 'modelos' || qdEl('qd-corpo') !== corpo) return; // saiu da tela enquanto lia do banco
  if (!qm.sel || !qm.modelos.some(m => m.id === qm.sel)) { qm.sel = qm.modelos[0].id; qm.edit = null; }
  if (!qm.edit) { qm.edit = JSON.parse(JSON.stringify(qm.modelos.find(m => m.id === qm.sel))); qm.sujo = false; }
  // A escolha do modelo fica no cabeçalho do editor (lista + "+ Novo"), sem coluna de cartões
  corpo.innerHTML = `<div class="qm">
    <section class="qm-editor" id="qm-editor"></section>
    <aside class="panel qm-arvore" id="qm-arvore"></aside>
  </div>`;
  qmDesenharEditor();
}
function qmEscolher(id){
  if (qm.sujo && !confirm('Há mudanças não salvas neste modelo. Descartar?')) { qmDesenharEditor(); return; } // a lista volta ao modelo atual
  qm.sel = id; qm.edit = null; qmRender();
}
function qmNovo(){
  if (qm.sujo && !confirm('Há mudanças não salvas neste modelo. Descartar?')) return;
  const nome = (prompt('Nome do novo modelo (ex.: ESCALAS / QUADRO):') || '').trim().toUpperCase();
  if (!nome) return;
  const m = { id: qmId('m_'), nome, descricao: '', ativo: false, inicio: '', atualizado_em: new Date().toISOString(),
    secoes: [{ id: qmId('s_'), titulo: 'Primeira seção', perguntas: [], proxima: 'fim' }] };
  m.inicio = m.secoes[0].id;
  qm.modelos.push(m); qm.sel = m.id; qm.edit = JSON.parse(JSON.stringify(m)); qm.sujo = true;
  qmRender();
}
function qmRenomear(){
  const nome = (prompt('Novo nome do modelo:', qm.edit.nome) || '').trim().toUpperCase();
  if (!nome || nome === qm.edit.nome) return;
  qm.edit.nome = nome; qmMudou();
}
function qmMudou(redesenhar = true){ qm.sujo = true; if (redesenhar) qmDesenharEditor(); else qmDesenharArvore(); }

function qmDesenharEditor(){
  const rolo = (qdEl('qm-itens') || {}).scrollTop || 0;
  const m = qm.edit, alvo = qdEl('qm-editor');
  if (!alvo) return;
  const destinos = (atual, comSegue, rotuloSegue) => [
    ...(comSegue ? [['', rotuloSegue]] : []), ...m.secoes.filter(s => s.id !== atual).map((s, i) => [s.id, `→ ${s.titulo || 'Seção sem título'}`]), ['fim', '■ Fim do formulário']];
  const sel = (lista, valor, acao) => `<select onchange="${acao}">${lista.map(([v, n]) => `<option value="${qdEsc(v)}"${v === (valor || '') ? ' selected' : ''}>${qdEsc(n)}</option>`).join('')}</select>`;
  const pergunta = (s, p, iP) => `
    <div class="qm-perg">
      <div class="qm-perg-linha">
        <input type="text" class="qm-rotulo" value="${qdEsc(p.rotulo)}" placeholder="Texto da pergunta" onchange="qmP('${s.id}','${p.id}','rotulo',this.value,false)">
        ${sel(Object.entries(QM_TIPOS_PERG), p.tipo, `qmTipo('${s.id}','${p.id}',this.value)`)}
        <label class="qm-check"><input type="checkbox" ${p.obrigatoria ? 'checked' : ''} onchange="qmP('${s.id}','${p.id}','obrigatoria',this.checked,false)"> obrigatória</label>
        <span class="qm-acoes">
          <button class="btn-icon" title="Subir" onclick="qmMoverP('${s.id}',${iP},-1)">↑</button><button class="btn-icon" title="Descer" onclick="qmMoverP('${s.id}',${iP},1)">↓</button>
          <button class="btn-icon" title="Excluir pergunta" onclick="qmExcluirP('${s.id}','${p.id}')">✕</button>
        </span>
      </div>
      <div class="qm-perg-linha qm-perg-extra">
        ${p.tipo !== 'anexo' && p.tipo !== 'pessoa' ? `<label>Altera no quadro ${sel(Object.entries(QM_CAMPOS), p.campo, `qmP('${s.id}','${p.id}','campo',this.value,false)`)}</label>` : ''}
        ${p.tipo === 'texto' ? `<label>Sugestões ${sel(Object.entries(QM_SUGESTOES), p.sugestoes, `qmP('${s.id}','${p.id}','sugestoes',this.value,false)`)}</label>` : ''}
        <input type="text" class="qm-dica" value="${qdEsc(p.dica || '')}" placeholder="Dica (opcional, aparece abaixo do campo)" onchange="qmP('${s.id}','${p.id}','dica',this.value,false)">
      </div>
      ${QM_COM_OPCOES.includes(p.tipo) ? `<div class="qm-opcoes">${p.opcoes.map((o, iO) => `
        <div class="qm-opcao">
          <input type="text" value="${qdEsc(o.texto)}" ${p.tipo === 'simnao' ? 'disabled' : ''} placeholder="Opção" onchange="qmO('${s.id}','${p.id}','${o.id}','texto',this.value)">
          ${QM_COM_CAMINHO.includes(p.tipo) ? `<span class="qd-fraco">vai para</span> ${sel(destinos(s.id, true, 'segue o fluxo da seção'), o.vai, `qmO('${s.id}','${p.id}','${o.id}','vai',this.value)`)}
            <label class="qm-check" title="Se escolher esta resposta, o anexo passa a ser obrigatório"><input type="checkbox" ${o.exigeAnexo ? 'checked' : ''} onchange="qmO('${s.id}','${p.id}','${o.id}','exigeAnexo',this.checked)"> exige anexo</label>` : ''}
          ${p.tipo !== 'simnao' ? `<button class="btn-icon" title="Excluir opção" onclick="qmExcluirO('${s.id}','${p.id}','${o.id}')">✕</button>` : ''}
        </div>`).join('')}
        ${p.tipo !== 'simnao' ? `<button class="btn btn-ghost btn-small" onclick="qmNovaO('${s.id}','${p.id}')">+ Opção</button>` : ''}
      </div>` : ''}
    </div>`;
  alvo.innerHTML = `
    <div class="panel qm-cabeca">
      <div class="qm-cabeca-linha">
        <select class="qm-nome qm-escolha" id="qm-escolha" title="Modelo em edição" onchange="qmEscolher(this.value)">
          ${qm.modelos.map(x => { const n = x.id === m.id ? m.nome : x.nome, at = x.id === m.id ? m.ativo : x.ativo;
            return `<option value="${x.id}"${x.id === m.id ? ' selected' : ''}>${qdEsc(n)}${x.id === m.id && qm.sujo ? ' (não salvo)' : ''} — ${at ? 'ativo' : 'inativo'} · ${x.secoes.length} seções</option>`; }).join('')}
        </select>
        <button class="btn btn-primary btn-small" style="width:auto" onclick="qmNovo()">+ Novo</button>
        <label class="qm-check"><input type="checkbox" ${m.ativo ? 'checked' : ''} onchange="qm.edit.ativo = this.checked; qmMudou(false)"> ativo (aparece no "Solicitar ajuste")</label>
        <span class="qm-cabeca-botoes">
          <button class="btn btn-ghost btn-small" onclick="qmRenomear()">Renomear</button>
          <button class="btn btn-ghost btn-small" onclick="qmDuplicar()">Duplicar</button>
          <button class="btn btn-ghost btn-small" onclick="qmPrevia()">Prévia</button>
          ${qm.sujo ? '<button class="btn btn-ghost btn-small" onclick="qm.edit = null; qmRender()">Descartar</button>' : ''}
          <button class="btn btn-primary btn-small" style="width:auto" onclick="qmSalvar()">${qm.sujo ? 'Salvar mudanças' : 'Salvo'}</button>
        </span>
      </div>
      <input type="text" class="qm-desc" value="${qdEsc(m.descricao || '')}" placeholder="Descrição (para quem vai escolher o modelo)" onchange="qm.edit.descricao = this.value; qmMudou(false)">
    </div>
    <!-- Cabeçalho (acima) fica parado; só as seções rolam -->
    <div class="qm-itens" id="qm-itens">
    <div class="qm-secao qm-fixa">
      <div class="qm-secao-topo"><span class="qs-num">1</span><b>Quem e quando</b><span class="qd-fraco">igual em todos os modelos: pessoa (vem do cartão), solicitante e data de início</span></div>
    </div>
    ${m.secoes.map((s, iS) => `
      <div class="qm-secao${s.id === m.inicio ? ' qm-inicio' : ''}">
        <div class="qm-secao-topo">
          <span class="qs-num">${iS + 2}</span>
          <input type="text" class="qm-titulo" value="${qdEsc(s.titulo)}" placeholder="Título da seção" onchange="qmS('${s.id}','titulo',this.value)">
          ${s.id === m.inicio ? '<span class="qd-selo qd-selo-info">começa aqui</span>' : `<button class="btn btn-ghost btn-small" onclick="qm.edit.inicio='${s.id}'; qmMudou()">Começar aqui</button>`}
          <span class="qm-acoes">
            <button class="btn-icon" title="Subir" onclick="qmMoverS(${iS},-1)">↑</button><button class="btn-icon" title="Descer" onclick="qmMoverS(${iS},1)">↓</button>
            <button class="btn-icon" title="Excluir seção" onclick="qmExcluirS('${s.id}')">✕</button>
          </span>
        </div>
        ${s.perguntas.map((p, iP) => pergunta(s, p, iP)).join('') || '<p class="qd-fraco qm-vazio">Sem perguntas ainda.</p>'}
        <div class="qm-secao-rodape">
          <button class="btn btn-ghost btn-small" onclick="qmNovaP('${s.id}')">+ Pergunta</button>
          <label>Depois desta seção ${sel(destinos(s.id, true, 'a seção seguinte da lista'), s.proxima, `qmS('${s.id}','proxima',this.value)`)}</label>
        </div>
      </div>`).join('')}
    <button class="btn btn-ghost qm-nova-secao" onclick="qmNovaS()">+ Seção</button>
    </div>`;
  if (rolo) qdEl('qm-itens').scrollTop = rolo; // redesenhar não volta a lista para o topo
  qmDesenharArvore();
}

/* ---------------- árvore (lado direito) ---------------- */
function qmDesenharArvore(){
  const m = qm.edit, alvo = qdEl('qm-arvore');
  if (!alvo) return;
  const alcancadas = new Set();
  const no = (s, vistos, nivel) => {
    if (!s) return '<li class="qm-no-fim">■ Fim</li>';
    if (vistos.has(s.id)) return `<li class="qm-no-volta">↺ volta para "${qdEsc(s.titulo)}"</li>`;
    if (nivel > 12) return '<li class="qd-fraco">…</li>';
    alcancadas.add(s.id);
    const v2 = new Set(vistos).add(s.id);
    const ramos = s.perguntas.filter(p => QM_COM_CAMINHO.includes(p.tipo) && p.opcoes.some(o => o.vai));
    const seguinte = qmProxima(m, s);
    let filhos;
    if (ramos.length) {
      const p = ramos[0];
      filhos = p.opcoes.map(o => `<li><span class="qm-ramo">"${qdEsc(o.texto)}"</span><ul>${no(o.vai === 'fim' ? null : o.vai ? qmSecao(m, o.vai) : seguinte, v2, nivel + 1)}</ul></li>`).join('');
      return `<li><span class="qm-no">${qdEsc(s.titulo)}</span><span class="qd-fraco qm-no-perg">${qdEsc(p.rotulo)}</span><ul>${filhos}</ul></li>`;
    }
    return `<li><span class="qm-no">${qdEsc(s.titulo)}</span><ul>${no(seguinte, v2, nivel + 1)}</ul></li>`;
  };
  const arvore = no(qmSecao(m, m.inicio) || m.secoes[0], new Set(), 0);
  const soltas = m.secoes.filter(s => !alcancadas.has(s.id));
  alvo.innerHTML = `<h4>Árvore do formulário</h4>
    <ul class="qm-tree"><li><span class="qm-no qm-no-fixo">Quem e quando</span><ul>${arvore}</ul></li></ul>
    ${soltas.length ? `<div class="qm-aviso">Seções que nenhum caminho alcança: ${soltas.map(s => `<b>${qdEsc(s.titulo)}</b>`).join(', ')}</div>` : ''}`;
}

/* ---------------- edição ---------------- */
const qmAchaS = id => qm.edit.secoes.find(s => s.id === id);
const qmAchaP = (sid, pid) => qmAchaS(sid).perguntas.find(p => p.id === pid);
function qmS(sid, campo, valor){ qmAchaS(sid)[campo] = valor; qmMudou(campo === 'proxima' || campo === 'titulo'); }
function qmP(sid, pid, campo, valor, redesenhar){ qmAchaP(sid, pid)[campo] = valor; qmMudou(redesenhar); }
function qmTipo(sid, pid, tipo){
  const p = qmAchaP(sid, pid);
  p.tipo = tipo;
  if (tipo === 'simnao') p.opcoes = [{ id: qmId('o'), texto: 'Sim', vai: '' }, { id: qmId('o'), texto: 'Não', vai: '' }];
  else if (QM_COM_OPCOES.includes(tipo)) { if (!p.opcoes.length || p.opcoes.map(o => o.texto).join() === 'Sim,Não') p.opcoes = [{ id: qmId('o'), texto: 'Opção 1', vai: '' }]; if (tipo === 'lista') p.opcoes.forEach(o => { o.vai = ''; delete o.exigeAnexo; }); }
  else p.opcoes = [];
  if (tipo === 'anexo' || tipo === 'pessoa') p.campo = '';
  qmMudou();
}
function qmO(sid, pid, oid, campo, valor){ qmAchaP(sid, pid).opcoes.find(o => o.id === oid)[campo] = valor; qmMudou(campo === 'vai'); }
function qmNovaO(sid, pid){ const p = qmAchaP(sid, pid); p.opcoes.push({ id: qmId('o'), texto: `Opção ${p.opcoes.length + 1}`, vai: '' }); qmMudou(); }
function qmExcluirO(sid, pid, oid){ const p = qmAchaP(sid, pid); p.opcoes = p.opcoes.filter(o => o.id !== oid); qmMudou(); }
function qmNovaP(sid){ qmAchaS(sid).perguntas.push({ id: qmId('p'), rotulo: '', tipo: 'texto', obrigatoria: true, campo: '', dica: '', sugestoes: '', opcoes: [] }); qmMudou(); }
function qmExcluirP(sid, pid){ const s = qmAchaS(sid); s.perguntas = s.perguntas.filter(p => p.id !== pid); qmMudou(); }
function qmMoverP(sid, i, d){ const l = qmAchaS(sid).perguntas, j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; qmMudou(); }
function qmNovaS(){ qm.edit.secoes.push({ id: qmId('s_'), titulo: 'Nova seção', perguntas: [], proxima: '' }); qmMudou(); }
function qmMoverS(i, d){ const l = qm.edit.secoes, j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; qmMudou(); }
function qmExcluirS(sid){
  if (qm.edit.secoes.length === 1) return showToast('O modelo precisa de ao menos uma seção.', 'erro');
  qm.edit.secoes = qm.edit.secoes.filter(s => s.id !== sid);
  // Caminhos que apontavam para a seção excluída voltam a "seguir o fluxo"
  qm.edit.secoes.forEach(s => { if (s.proxima === sid) s.proxima = ''; s.perguntas.forEach(p => p.opcoes.forEach(o => { if (o.vai === sid) o.vai = ''; })); });
  if (qm.edit.inicio === sid) qm.edit.inicio = qm.edit.secoes[0].id;
  qmMudou();
}
function qmDuplicar(){
  const c = JSON.parse(JSON.stringify(qm.edit));
  const mapa = {};
  c.id = qmId('m_'); c.nome = (c.nome + ' (CÓPIA)').slice(0, 80); c.ativo = false;
  c.secoes.forEach(s => { const n = qmId('s_'); mapa[s.id] = n; s.id = n; });
  c.inicio = mapa[c.inicio] || c.secoes[0].id;
  c.secoes.forEach(s => { if (mapa[s.proxima]) s.proxima = mapa[s.proxima]; s.perguntas.forEach(p => { p.id = qmId('p'); p.opcoes.forEach(o => { o.id = qmId('o'); if (mapa[o.vai]) o.vai = mapa[o.vai]; }); }); });
  qm.modelos.push(c); qm.sel = c.id; qm.edit = JSON.parse(JSON.stringify(c)); qm.sujo = true;
  qmRender();
}
// Confere o modelo antes de salvar
function qmProblemas(m){
  const erros = [];
  if (!String(m.nome || '').trim()) erros.push('dê um nome ao modelo');
  m.secoes.forEach(s => {
    if (!String(s.titulo || '').trim()) erros.push('há seção sem título');
    s.perguntas.forEach(p => {
      if (!String(p.rotulo || '').trim()) erros.push(`há pergunta sem texto na seção "${s.titulo}"`);
      if (QM_COM_OPCOES.includes(p.tipo) && !p.opcoes.length) erros.push(`a pergunta "${p.rotulo}" precisa de opções`);
      if (QM_COM_OPCOES.includes(p.tipo) && p.opcoes.some(o => !String(o.texto || '').trim())) erros.push(`há opção sem texto em "${p.rotulo}"`);
    });
  });
  return [...new Set(erros)];
}
async function qmSalvar(){
  const m = qm.edit, erros = qmProblemas(m);
  if (erros.length) return showToast('Antes de salvar: ' + erros.join('; ') + '.', 'erro', 6000);
  m.atualizado_em = new Date().toISOString();
  const lista = qm.modelos.map(x => x.id === m.id ? m : x);
  if (!lista.some(x => x.id === m.id)) lista.push(m);
  try {
    await qdGravar({ config: [{ chave: 'modelos', valor: lista }] });
    qm.modelos = lista; qm.edit = JSON.parse(JSON.stringify(m)); qm.sujo = false;
    qmRender();
    showToast(`Modelo ${m.nome} salvo.`);
  } catch (erro) { showToast(erro.message, 'erro'); }
}
// Prévia: abre o formulário com o modelo em edição e uma pessoa de exemplo (nada é gravado)
function qmPrevia(){
  const f = qd.func.find(x => !x.fora_base && x.status !== 'desligado') || qd.func[0];
  if (!f) return showToast('Carregue o DPO para ver a prévia com uma pessoa de exemplo.', 'erro');
  qsAbrir(f.matricula, { modelo: JSON.parse(JSON.stringify(qm.edit)), previa: true });
}

/* =====================================================================
   FORMULÁRIO "SOLICITAR AJUSTE" (montado a partir do modelo)
   ===================================================================== */
// opcoes: { modelo?, previa? }
async function qsAbrir(matricula, opcoes = {}){
  const f = qd.func.find(x => x.matricula === matricula);
  if (!f) return;
  if (!opcoes.modelo && !qm.sujo) { try { await qmCarregar(); } catch (e) {} } // não atropela um modelo em edição
  const modelos = opcoes.modelo ? [opcoes.modelo] : qmAtivos();
  if (!modelos.length) return showToast('Nenhum modelo de solicitação ativo. Ative um na aba Modelos.', 'erro');
  qs = { f, anexos: [], respostas: {}, modelo: modelos[0], modelos, previa: !!opcoes.previa };
  qsDesenharForm();
}
function qsDesenharForm(){
  const { f, modelo, modelos, previa } = qs;
  qdModal(previa ? `Prévia · ${modelo.nome}` : 'Solicitar ajuste', `
    <div class="qs-form" id="qs-form">
      ${previa ? '<div class="qs-previa">Prévia do modelo: preencha à vontade, nada é gravado.</div>' : ''}
      ${modelos.length > 1 ? `<div class="qs-modelos"><span class="qd-fraco">Modelo:</span>${modelos.map(m => `<button type="button" class="qs-tipo${m.id === modelo.id ? ' ativo' : ''}" onclick="qsTrocarModelo('${m.id}')" title="${qdEsc(m.descricao || '')}">${qdEsc(m.nome)}</button>`).join('')}</div>` : ''}
      <section class="qs-bloco">
        <h4><span class="qs-num">1</span> Quem e quando</h4>
        <div class="qs-pessoa">
          <div><b>${qdEsc(f.nome)}</b> ${qdSelo(f.status)}</div>
          <div class="qd-fraco">Matrícula ${qdEsc(f.matricula)}${f.wfm ? ' · Mat. WFM ' + qdEsc(f.wfm.re) : ''} · ${qdEsc(f.segmento || '—')} ·
            supervisor ${qdEsc(f.gestor1 || '—')} · entrada ${qdEsc(f.hora_entrada || '—')} · CH ${qdEsc(f.carga_horaria || '—')}</div>
        </div>
        <div class="field-row">
          <div class="field"><label>Data de início da alteração *</label><input type="date" id="qs-data" value="${qdEsc(qs.respostas._data || '')}" onchange="qs.respostas._data = this.value">
            <small class="qd-fraco">Pode ser retroativa para desligamento e INSS.</small></div>
          <div class="field"><label>Solicitante</label><input type="text" value="${qdEsc(session ? session.name : '')}" disabled></div>
        </div>
      </section>
      <div id="qs-secoes"></div>
    </div>
    <div class="modal-foot qd-foot-solto">
      <button class="btn btn-ghost" onclick="qdFecharModal()">${previa ? 'Fechar' : 'Cancelar'}</button>
      <button class="btn btn-primary" style="width:auto" onclick="qsEnviar()">${previa ? 'Conferir (sem gravar)' : 'Enviar solicitação'}</button>
    </div>`);
  qdEl('qd-modal').querySelector('.modal').classList.add('qs-modal');
  qsDesenharSecoes();
}
function qsTrocarModelo(id){ qs.modelo = qs.modelos.find(m => m.id === id); qs.respostas = { _data: qs.respostas._data }; qsDesenharForm(); }
// Desenha só as seções do caminho atual (muda quando uma resposta com caminho muda)
function qsDesenharSecoes(){
  const alvo = qdEl('qs-secoes');
  if (!alvo) return;
  const { f, modelo } = qs, r = qs.respostas;
  const vivos = qd.func.filter(x => !x.fora_base && x.status !== 'desligado');
  const sugest = tipo => {
    const lista = c => vivos.map(x => x[c]).filter(Boolean);
    const v = tipo === 'segmento' ? [...lista('segmento'), ...qd.func.map(x => x.wfm && x.wfm.operacao).filter(Boolean)] : tipo ? lista(tipo) : [];
    return [...new Set(v)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  };
  const atual = p => ({ hora_entrada: f.hora_entrada, carga_horaria: f.carga_horaria, gestor1: f.gestor1, gestor2: f.gestor2, segmento: f.segmento, situacao: f.situacao, regime: f.regime || 'não informado' })[p.campo];
  const campoHtml = p => {
    const v = r[p.id] ?? '', at = atual(p), id = `qs-p-${p.id}`;
    const salvar = `qsResp('${p.id}', this.value)`;
    switch (p.tipo) {
      case 'escolha': case 'simnao':
        return `<div class="${p.tipo === 'simnao' ? 'seg qs-simnao' : 'qs-tipos'}">${p.opcoes.map(o => `<button type="button" class="${p.tipo === 'simnao' ? 'seg-btn' : 'qs-tipo'}${v === o.id ? (p.tipo === 'simnao' ? ' active' : ' ativo') : ''}" onclick="qsResp('${p.id}', '${o.id}', true)">${qdEsc(o.texto)}</button>`).join('')}</div>`;
      case 'lista':
        return `<select id="${id}" onchange="${salvar}"><option value="">Escolha…</option>${p.opcoes.map(o => `<option value="${o.id}"${v === o.id ? ' selected' : ''}>${qdEsc(o.texto)}</option>`).join('')}</select>`;
      case 'texto_longo': return `<textarea id="${id}" rows="3" oninput="${salvar}">${qdEsc(v)}</textarea>`;
      case 'data': return `<input type="date" id="${id}" value="${qdEsc(v)}" onchange="${salvar}">`;
      case 'hora': return `<input type="time" id="${id}" value="${qdEsc(v)}" onchange="${salvar}">`;
      case 'numero': return `<input type="number" id="${id}" value="${qdEsc(v)}" oninput="${salvar}">`;
      case 'pessoa': return `<input type="text" id="${id}" list="${id}-dl" value="${qdEsc(v)}" placeholder="Digite nome ou matrícula" oninput="${salvar}">
        <datalist id="${id}-dl">${vivos.filter(x => x.matricula !== f.matricula).map(x => `<option value="${qdEsc(x.matricula + ' - ' + x.nome)}">`).join('')}</datalist>`;
      case 'anexo': return `<input type="file" accept="image/*" multiple class="qd-arquivo" onchange="qsAnexar(this)"><div id="qs-anexos" class="qs-anexos"></div>`;
      default: return `<input type="text" id="${id}" class="caixa-alta" ${p.sugestoes ? `list="${id}-dl"` : ''} value="${qdEsc(v)}" oninput="${salvar}">
        ${p.sugestoes ? `<datalist id="${id}-dl">${sugest(p.sugestoes).map(x => `<option value="${qdEsc(x)}">`).join('')}</datalist>` : ''}`;
    }
  };
  alvo.innerHTML = qmCaminho(modelo, r).map((s, i) => `
    <section class="qs-bloco">
      <h4><span class="qs-num">${i + 2}</span> ${qdEsc(s.titulo)}</h4>
      <div class="qs-campos">${s.perguntas.map(p => {
        const at = atual(p);
        return `<div class="field${['escolha', 'texto_longo', 'anexo'].includes(p.tipo) ? ' qs-campo-largo' : ''}"><label>${qdEsc(p.rotulo)}${p.obrigatoria ? ' *' : ''}</label>${campoHtml(p)}
          ${at && p.campo ? `<small class="qd-fraco">Atual: ${qdEsc(at)}</small>` : ''}${p.dica ? `<small class="qd-fraco">${qdEsc(p.dica)}</small>` : ''}</div>`;
      }).join('')}</div>
    </section>`).join('');
  if (qdEl('qs-anexos')) qsDesenharAnexos();
}
// Guarda a resposta; resposta de escolha pode mudar o caminho → redesenha as seções
function qsResp(pid, valor, redesenhar){
  qs.respostas[pid] = valor;
  if (redesenhar) qsDesenharSecoes();
}
async function qsAnexar(input){
  for (const arq of input.files) {
    if (qs.anexos.length >= QS_ANEXOS_QTD) { showToast(`No máximo ${QS_ANEXOS_QTD} anexos.`, 'erro'); break; }
    if (!arq.type.startsWith('image/')) { showToast(`"${arq.name}" não é imagem.`, 'erro'); continue; }
    if (arq.size > QS_ANEXO_MAX) { showToast(`"${arq.name}" passa de 2 MB.`, 'erro'); continue; }
    const dado = await new Promise(ok => { const rd = new FileReader(); rd.onload = () => ok(rd.result); rd.readAsDataURL(arq); });
    qs.anexos.push({ nome: arq.name, tipo: arq.type, dado });
  }
  input.value = '';
  qsDesenharAnexos();
}
function qsDesenharAnexos(){
  const alvo = qdEl('qs-anexos');
  if (alvo) alvo.innerHTML = qs.anexos.map((a, i) => `<figure><img src="${a.dado}" alt=""><figcaption>${qdEsc(a.nome)}
    <button class="btn-icon" title="Remover" onclick="qs.anexos.splice(${i}, 1); qsDesenharAnexos()">✕</button></figcaption></figure>`).join('');
}

/* ---------------- conferir e gravar ---------------- */
function qsEnviar(){
  const { f, modelo } = qs, r = qs.respostas;
  const faltam = [], respostas = [], mud = [], det = {};
  if (!r._data) faltam.push('data de início');
  const caminho = qmCaminho(modelo, r);
  let tipoNome = '', exigeAnexo = false, folgaAtual = '', folgaNova = '';
  const ultima = caminho[caminho.length - 1];
  caminho.forEach(s => s.perguntas.forEach(p => {
    let v = r[p.id], texto = '';
    if (typeof v === 'string') v = v.trim();
    if (QM_COM_OPCOES.includes(p.tipo)) { const o = p.opcoes.find(x => x.id === v); texto = o ? o.texto : ''; if (o && o.exigeAnexo) exigeAnexo = true; if (o && p.tipo === 'escolha' && !tipoNome) tipoNome = o.texto; }
    else if (p.tipo === 'pessoa') {
      const c = v && qd.func.find(x => x.matricula === String(v).split(' - ')[0].trim());
      if (v && !c) faltam.push(`"${p.rotulo}" (escolha a pessoa da lista)`);
      if (c) { det.colega = { matricula: c.matricula, nome: c.nome, hora_entrada: c.hora_entrada }; texto = `${c.nome} (${c.matricula})`; }
    } else if (p.tipo === 'anexo') { texto = qs.anexos.length ? `${qs.anexos.length} imagem(ns)` : ''; if (p.obrigatoria && !qs.anexos.length) faltam.push(p.rotulo); return; }
    else if (p.tipo === 'texto') texto = v ? String(v).toUpperCase() : '';
    else if (p.tipo === 'data') texto = v || '';
    else texto = v || '';
    if (p.obrigatoria && !texto) faltam.push(p.rotulo.replace(/\?$/, '').toLowerCase());
    if (texto) respostas.push({ secao: s.titulo, rotulo: p.rotulo, valor: p.tipo === 'data' ? qdDataBr(texto) : texto });
    // Pergunta ligada ao quadro → "de → para"
    if (!texto || !p.campo) return;
    if (p.campo === 'folga_atual') folgaAtual = texto;
    else if (p.campo === 'folga') folgaNova = texto;
    else if (p.campo === 'data_fim') det.data_fim = texto;
    else if (texto !== (f[p.campo] || '')) mud.push({ campo: p.campo, de: f[p.campo] || '', para: texto });
  }));
  if (folgaNova) mud.push({ campo: 'folga', de: folgaAtual, para: folgaNova });
  // O caminho parou numa pergunta que decide para onde ir e ainda não foi respondida
  if (ultima && ultima.perguntas.some(p => QM_COM_CAMINHO.includes(p.tipo) && p.opcoes.some(o => o.vai) && !r[p.id])) faltam.push('a resposta que define o caminho');
  if (exigeAnexo && !qs.anexos.length) faltam.push('o anexo (print) exigido pela resposta escolhida');
  if (faltam.length) return showToast('Falta preencher: ' + [...new Set(faltam)].join(', ') + '.', 'erro', 6000);
  if (qs.previa) return showToast(`Prévia ok: ${respostas.length} respostas${mud.length ? ` · muda: ${mud.map(x => QD_CAMPOS_NOME[x.campo] || x.campo).join(', ')}` : ''}. Nada foi gravado.`, 'sucesso', 5000);
  qsGravar({
    matricula: f.matricula, nome: f.nome, re: f.wfm ? f.wfm.re : '', supervisor: f.gestor1 || '', segmento: f.segmento || '',
    tipo: modelo.id, tipo_nome: tipoNome || modelo.nome, modelo_id: modelo.id, modelo_nome: modelo.nome,
    data_inicio: r._data, mudancas: mud, detalhes: det, respostas, anexos: qs.anexos,
  });
}
async function qsGravar(pedido){
  const quem = session ? session.name : '', em = new Date().toISOString();
  const t = { ...pedido, status: 'aberto', criado_em: em, criado_por: quem, eventos: [{ em, quem, acao: 'Solicitação aberta' }] };
  try {
    // O nº vem do banco; as imagens vão depois, uma por envio, para a gaveta "anexos"
    const imagens = qdSepararAnexos(t);
    const chaves = await qdGravar({ tickets: [t] });
    const id = Number((chaves.tickets || [])[0]);
    t.id = id;
    await qdGravarAnexos(t, imagens);
    qd.tickets.push(t);
    qs = null;
    qdFecharModal();
    qdRender(); // atualiza o cartão da pessoa e o contador da aba Solicitações
    showToast(`Solicitação nº ${id} aberta.`);
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}
