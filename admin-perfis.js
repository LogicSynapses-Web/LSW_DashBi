/* =====================================================================
   ADMINISTRAÇÃO › PERFIS e ADMINISTRAÇÃO › OPERAÇÕES (15/10/2026 · Fase 4)
   Perfil de acesso = nome + permissões. A árvore abaixo lista TUDO o que
   pode ser liberado no sistema (como a tela "Permissões de Acesso" do
   Optimus): cada linha tem "Habilita" e os grupos têm "Habilitar todos".
   Toda seção, visual ou ação nova do sistema deve ganhar uma linha aqui
   (e a mesma chave no servidor, em verificarPermissao).
   Operações: tabela com operação, cliente e situação (inativa some das
   listas de escolha; quem já está nela continua).
   Depende do script.js (apiJson, acessos, carregarOperacoes, showToast, pode).
   ===================================================================== */

// [chave, rótulo, filhos]. "sempre" = liberado para todos (não dá para tirar).
// Marcar um filho marca os pais (ex.: "Solicitar ajuste" liga "Localizar pessoa" e "Quadro atual").
const AP_ARVORE = [
  { chave: 'relatorios', rotulo: 'Relatórios', sempre: true, filhos: [
    { chave: 'relatorios.publicar', rotulo: 'Publicar, editar e descontinuar relatórios (e ver os ocultos)' },
    { chave: 'relatorios.descontinuados', rotulo: 'Ver relatórios descontinuados' },
    { chave: 'csat.importar', rotulo: 'Painel CSAT: importar avaliações e meta' },
  ] },
  { chave: 'quadro', rotulo: 'Quadro', filhos: [
    { chave: 'quadro.atual', rotulo: 'Quadro atual: ver os contadores e a tabela', filhos: [
      { chave: 'quadro.localizar', rotulo: 'Localizar pessoa (pesquisa, cartão e ficha completa)', filhos: [
        { chave: 'quadro.solicitar', rotulo: 'Solicitar ajuste (botão no cartão da pessoa)' },
      ] },
    ] },
    { chave: 'quadro.painel', rotulo: 'Painel do mês (abre o PAINEL DO QUADRO do Estúdio, mesmo com o card oculto)', filhos: [
      { chave: 'quadro.estudio', rotulo: 'Preparar no Estúdio (base QUADRO ligada ao Quadro e Painel do Quadro)' },
    ] },
    { chave: 'quadro.solicitacoes', rotulo: 'Solicitações: ver a lista de tickets', filhos: [
      { chave: 'quadro.analisar', rotulo: 'Analisar e tratar tickets (andamento, aprovar, reprovar, cancelar, divergência com a carga)' },
    ] },
    { chave: 'quadro.cargas', rotulo: 'Cargas: carregar as bases DPO e WFM' },
    { chave: 'quadro.vinculos', rotulo: 'Tratar a base: vínculos DPO × WFM (confirmar, planilha de vínculos)' },
    { chave: 'quadro.escalas', rotulo: 'Escalas: dias e pesos de cada escala, cargas horárias e horas por dia' },
  ] },
  { chave: 'estudio', rotulo: 'Estúdio', filhos: [
    { chave: 'estudio.bases', rotulo: 'Bases de dados (criar e carregar)' },
    { chave: 'estudio.relatorios', rotulo: 'Relatórios do editor (criar, editar, arquivar)' },
    { chave: 'estudio.publicar', rotulo: 'Publicar relatórios do Estúdio' },
  ] },
  { chave: 'usuarios', rotulo: 'Usuários', filhos: [
    { chave: 'usuarios.gerenciar', rotulo: 'Criar e editar usuários (perfil e operação)' },
    { chave: 'usuarios.senha', rotulo: 'Resetar senha' },
  ] },
  { chave: 'admin', rotulo: 'Administração', filhos: [
    { chave: 'admin.perfis', rotulo: 'Perfis (esta tela)' },
    { chave: 'admin.operacoes', rotulo: 'Operações (cadastrar, editar, ativar/inativar)' },
    { chave: 'admin.tickets', rotulo: 'Tickets (modelos de solicitação)' },
  ] },
  { chave: 'configuracoes', rotulo: 'Configurações (preferências pessoais)', sempre: true },
];
// Lista "achatada" com o nível e o pai de cada linha
const AP_LINHAS = (() => {
  const out = [];
  const andar = (nos, nivel, pai) => nos.forEach(n => { out.push({ ...n, nivel, pai }); if (n.filhos) andar(n.filhos, nivel + 1, n.chave); });
  andar(AP_ARVORE, 0, null);
  return out;
})();
const apLinha = c => AP_LINHAS.find(l => l.chave === c);
const apDescendentes = c => AP_LINHAS.filter(l => { let p = l.pai; while (p) { if (p === c) return true; p = (apLinha(p) || {}).pai; } return false; });

const ap = { perfis: [], sel: null, edit: null, sujo: false, fechados: new Set() };
const apEl = id => document.getElementById(id);
const apEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const apTotal = p => (p.permissoes || []).includes('*');
const apResumo = p => `${apTotal(p) ? 'acesso total' : `${(p.permissoes || []).length} permissões`} · ${p.usuarios || 0} usuário(s)`;

/* ---------------- PERFIS ---------------- */
async function apAbrir(){
  try { ap.perfis = await apiJson('GET', '/api/perfis'); }
  catch (erro) { showToast(erro.message, 'erro'); return; }
  if (!ap.sel || !ap.perfis.some(p => p.id === ap.sel)) { ap.sel = (ap.perfis.find(p => !apTotal(p)) || ap.perfis[0] || {}).id; ap.edit = null; }
  if (!ap.edit || ap.edit.id !== ap.sel) { const p = ap.perfis.find(x => x.id === ap.sel); ap.edit = p ? JSON.parse(JSON.stringify(p)) : null; ap.sujo = false; }
  apDesenhar();
}
// Troca de perfil pela lista do cabeçalho
function apEscolher(id){
  if (ap.sujo && !confirm('Há mudanças não salvas neste perfil. Descartar?')) { apDesenhar(); return; } // a lista volta ao perfil atual
  ap.sel = id; ap.edit = null; apAbrir();
}
function apDesenhar(){
  const alvo = apEl('perfis-conteudo');
  if (!alvo) return;
  const rolo = (alvo.querySelector('.ap-tabela') || {}).scrollTop || 0; // marcar uma caixa não volta a árvore para o topo
  alvo.innerHTML = `<section class="panel ap-editor tela-tabela">${ap.edit ? apHtmlEditor(ap.edit) : `
    <div class="ap-cabeca"><span class="ap-sub">Nenhum perfil cadastrado.</span><button class="btn btn-primary btn-small" style="width:auto" onclick="apNovo()">+ Novo</button></div>`}</section>`;
  const t = alvo.querySelector('.ap-tabela'); if (t) t.scrollTop = rolo;
}
function apHtmlEditor(p){
  const total = apTotal(p), perms = new Set(p.permissoes || []);
  const marcado = l => total || l.sempre || perms.has(l.chave);
  const visivel = l => { let pai = l.pai; while (pai) { if (ap.fechados.has(pai)) return false; pai = (apLinha(pai) || {}).pai; } return true; };
  const linhas = AP_LINHAS.filter(visivel).map(l => {
    const temFilhos = !!(l.filhos && l.filhos.length), desc = apDescendentes(l.chave);
    const todos = temFilhos && [l, ...desc].every(marcado);
    const trava = total || l.sempre;
    return `<tr class="ap-nivel-${l.nivel}${temFilhos ? ' ap-grupo' : ''}">
      <td class="ap-opcao" style="padding-left:${12 + l.nivel * 22}px">${temFilhos ? '(+) ' : ''}${apEsc(l.rotulo)}</td>
      <td class="ap-abrir">${temFilhos ? `<button class="ap-link" onclick="apAbrirFechar('${l.chave}')">${ap.fechados.has(l.chave) ? '‹ Abrir todos' : '⌄ Fechar todos'}</button>` : ''}</td>
      <td class="ap-ck"><input type="checkbox" ${marcado(l) ? 'checked' : ''} ${trava ? 'disabled' : ''} onchange="apMarcar('${l.chave}', this.checked, false)" title="Habilita"></td>
      <td class="ap-ck">${temFilhos ? `<input type="checkbox" ${todos ? 'checked' : ''} ${trava ? 'disabled' : ''} onchange="apMarcar('${l.chave}', this.checked, true)" title="Habilitar todos">` : ''}</td>
      <td class="ap-chave">${apEsc(l.chave)}</td>
    </tr>`;
  }).join('');
  // Cabeçalho: lista de perfis (no lugar do nome) + "+ Novo" ao lado; ações do perfil escolhido à direita
  const opcoes = ap.perfis.map(x => { const nome = x.id === p.id ? p.nome : x.nome;
    return `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${apEsc(nome)}${x.id === p.id && ap.sujo ? ' (não salvo)' : ''} — ${apResumo(x)}</option>`; }).join('');
  return `
    <div class="ap-cabeca">
      <select class="ap-nome" id="ap-escolha" title="Perfil em edição" onchange="apEscolher(Number(this.value))">${opcoes}</select>
      <button class="btn btn-primary btn-small" style="width:auto" onclick="apNovo()">+ Novo</button>
      <span class="ap-botoes">
        ${!total ? '<button class="btn btn-ghost btn-small" onclick="apRenomear()">Renomear</button>' : ''}
        <button class="btn btn-ghost btn-small" onclick="apDuplicar()">Duplicar</button>
        ${!p.sistema ? `<button class="btn btn-danger-ghost btn-small" onclick="apExcluir()">Excluir</button>` : ''}
        ${ap.sujo ? '<button class="btn btn-ghost btn-small" onclick="ap.edit = null; apAbrir()">Descartar</button>' : ''}
        ${!total ? `<button class="btn btn-primary btn-small" style="width:auto" onclick="apSalvar()">${ap.sujo ? 'Salvar mudanças' : 'Salvo'}</button>` : ''}
      </span>
    </div>
    <p class="ap-dica">${total ? 'O perfil ADMINISTRADOR tem acesso a tudo e não pode ser alterado.'
      : 'Marque o que este perfil pode ver e fazer. "Habilitar todos" marca o grupo inteiro. Ao marcar uma opção, o grupo dela também é marcado (para aparecer no menu).'}</p>
    <div class="table-wrap ap-tabela"><table>
      <thead><tr><th>Opção do menu</th><th></th><th>Habilita</th><th>Habilitar todos</th><th>Chave</th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
}

function apMarcar(chave, ligado, comFilhos){
  const perms = new Set(ap.edit.permissoes || []);
  const alvo = [chave, ...(comFilhos || !ligado ? apDescendentes(chave).map(l => l.chave) : [])];
  alvo.forEach(c => ligado ? perms.add(c) : perms.delete(c));
  if (ligado) { let p = (apLinha(chave) || {}).pai; while (p) { perms.add(p); p = (apLinha(p) || {}).pai; } } // pai junto, para o menu mostrar
  ap.edit.permissoes = AP_LINHAS.map(l => l.chave).filter(c => perms.has(c)); // mesma ordem da árvore
  ap.sujo = true;
  apDesenhar();
}
function apAbrirFechar(chave){ ap.fechados.has(chave) ? ap.fechados.delete(chave) : ap.fechados.add(chave); apDesenhar(); }
function apRenomear(){
  const nome = (prompt('Novo nome do perfil:', ap.edit.nome) || '').trim().toUpperCase();
  if (!nome || nome === ap.edit.nome) return;
  ap.edit.nome = nome; ap.sujo = true; apDesenhar();
}
async function apSalvar(){
  const p = ap.edit;
  try {
    await apiJson('PATCH', `/api/perfis/${p.id}`, { nome: p.nome, permissoes: p.permissoes || [] });
    ap.sujo = false; ap.edit = null;
    await apAbrir();
    showToast(`Perfil ${p.nome} salvo. Vale a partir do próximo login de cada usuário.`, 'sucesso', 4000);
  } catch (erro) { showToast(erro.message, 'erro', 5000); }
}
async function apNovo(base){
  if (ap.sujo && !confirm('Há mudanças não salvas neste perfil. Descartar?')) return;
  const nome = (prompt('Nome do novo perfil (ex.: SUPERVISOR):', base ? base.nome + ' (CÓPIA)' : '') || '').trim().toUpperCase();
  if (!nome) return;
  try {
    const { perfil } = await apiJson('POST', '/api/perfis', { nome, permissoes: base && !apTotal(base) ? base.permissoes : ['relatorios'] });
    ap.sel = perfil.id; ap.edit = null; ap.sujo = false;
    await apAbrir();
    showToast(`Perfil ${perfil.nome} criado. Marque as permissões e salve.`);
  } catch (erro) { showToast(erro.message, 'erro', 5000); }
}
function apDuplicar(){ apNovo(ap.edit); }
async function apExcluir(){
  const p = ap.edit;
  if (!confirm(`Excluir o perfil ${p.nome}?`)) return;
  try {
    await apiJson('DELETE', `/api/perfis/${p.id}`);
    ap.sel = null; ap.edit = null; ap.sujo = false;
    await apAbrir();
    showToast(`Perfil ${p.nome} excluído.`);
  } catch (erro) { showToast(erro.message, 'erro', 6000); }
}

/* ---------------- OPERAÇÕES (tabela: operação · cliente · situação) ---------------- */
// ao.editando: id da linha em edição, 'nova' para a linha de cadastro, null = só leitura
const ao = { editando: null };
async function aoAbrir(){
  await carregarOperacoes();
  aoDesenhar();
}
function aoDesenhar(){
  const alvo = apEl('operacoes-conteudo');
  if (!alvo) return;
  const ops = acessos.operacoes;
  const linhaEdicao = o => `<tr class="ao-editando">
      <td><input type="text" class="caixa-alta ao-campo" id="ao-nome" value="${apEsc(o.nome || '')}" placeholder="EX.: CENTRAL ATENDE" maxlength="80"></td>
      <td><input type="text" class="caixa-alta ao-campo" id="ao-cliente" value="${apEsc(o.cliente || '')}" placeholder="EX.: CLIENTE EXEMPLO" maxlength="80"></td>
      <td><select class="ao-campo" id="ao-ativo"><option value="1"${o.ativo !== false ? ' selected' : ''}>Ativa</option><option value="0"${o.ativo === false ? ' selected' : ''}>Inativa</option></select></td>
      <td class="ao-num">${o.id ? (o.usuarios || 0) : '—'}</td>
      <td class="ao-acoes"><button class="btn btn-primary btn-small" style="width:auto" onclick="aoSalvar(${o.id || 'null'})">${o.id ? 'Salvar' : 'Cadastrar'}</button>
        <button class="btn btn-ghost btn-small" onclick="ao.editando = null; aoDesenhar()">Cancelar</button></td>
    </tr>`;
  const linhas = ops.map(o => ao.editando === o.id ? linhaEdicao(o) : `<tr class="${o.ativo === false ? 'ao-inativa' : ''}">
      <td><b>${apEsc(o.nome)}</b></td>
      <td>${o.cliente ? apEsc(o.cliente) : '<span class="ap-sub">—</span>'}</td>
      <td><span class="badge ${o.ativo === false ? 'badge-off' : 'badge-on'}">${o.ativo === false ? 'Inativa' : 'Ativa'}</span></td>
      <td class="ao-num">${o.usuarios || 0}</td>
      <td class="ao-acoes"><button class="btn btn-ghost btn-small" onclick="ao.editando = ${o.id}; aoDesenhar()">Editar</button></td>
    </tr>`).join('');
  alvo.innerHTML = `<section class="panel ao tela-tabela">
    <div class="table-wrap"><table class="ao-tabela">
      <thead><tr><th>Operação</th><th>Cliente</th><th title="Inativa: some das listas de escolha (quem já está nela continua)">Situação</th><th class="ao-num">Usuários</th>
        <th class="th-acao"><button class="btn btn-primary btn-small" title="A operação a que cada usuário pertence; os relatórios podem ser liberados por operação" onclick="ao.editando = 'nova'; aoDesenhar()">+ Nova operação</button></th></tr></thead>
      <tbody>${ao.editando === 'nova' ? linhaEdicao({}) : ''}${linhas || (ao.editando === 'nova' ? '' : '<tr><td colspan="5" class="ap-sub">Nenhuma operação cadastrada.</td></tr>')}</tbody>
    </table></div>
  </section>`;
  const foco = apEl('ao-nome'); if (foco) foco.focus();
}
async function aoSalvar(id){
  const corpo = { nome: apEl('ao-nome').value.trim().toUpperCase(), cliente: apEl('ao-cliente').value.trim().toUpperCase(), ativo: apEl('ao-ativo').value === '1' };
  if (!corpo.nome) { showToast('Informe o nome da operação.', 'erro'); return; }
  try {
    await apiJson(id ? 'PATCH' : 'POST', id ? `/api/operacoes/${id}` : '/api/operacoes', corpo);
    ao.editando = null;
    await aoAbrir();
    showToast(id ? `Operação ${corpo.nome} salva.` : `Operação ${corpo.nome} cadastrada.`);
  } catch (erro) { showToast(erro.message, 'erro', 5000); }
}
