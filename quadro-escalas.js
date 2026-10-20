/* =====================================================================
   QUADRO › ESCALAS (19/10/2026) — escalas sem código
   Duas tabelas, guardadas no Quadro (config "escalas"):
   - Escalas: quanto a pessoa conta em cada dia da semana (1 = o dia inteiro, 0,6 = 60%, 0 = folga)
     e se folga no feriado; "também vale para" = jornadas do WFM com outro nome (ex.: 6X1 conta como 7X1).
   - Cargas horárias: a escala de quem não tem jornada no WFM e as horas que valem por dia (10:00 = 9 h).
     Carga horária fora da tabela não entra nas horas escaladas.
   A base QUADRO do Estúdio usa estas regras ao abrir (quadro-estudio.js · qeLinha): cada pessoa vem com
   PESO DOM … PESO SÁB e FOLGA NO FERIADO, e as medidas de escala só multiplicam — sem escala escrita na fórmula.
   ===================================================================== */
const QX_DIAS = [['dom', 'Dom'], ['seg', 'Seg'], ['ter', 'Ter'], ['qua', 'Qua'], ['qui', 'Qui'], ['sex', 'Sex'], ['sab', 'Sáb']];
// Regras de fábrica (as decisões de 14/10/2026): valem enquanto nada for salvo na tela
const QX_PADRAO = {
  escalas: [
    { nome: '4X3', apelidos: '', pesos: { dom: 0, seg: 1, ter: 1, qua: 1, qui: 1, sex: 0, sab: 0 }, folgaFeriado: true },
    { nome: '5X2', apelidos: '', pesos: { dom: 0, seg: 1, ter: 1, qua: 1, qui: 1, sex: 1, sab: 0 }, folgaFeriado: false },
    { nome: '7X1', apelidos: '6X1', pesos: { dom: 0.4, seg: 1, ter: 1, qua: 1, qui: 1, sex: 1, sab: 0.6 }, folgaFeriado: false },
  ],
  cargas: [
    { ch: '06:00', escala: '4X3', horas: '06:00' }, { ch: '06:20', escala: '7X1', horas: '06:20' }, { ch: '08:12', escala: '5X2', horas: '08:12' },
    { ch: '08:20', escala: '7X1', horas: '08:20' }, { ch: '10:00', escala: '5X2', horas: '09:00' },
  ],
  lideranca: 'SUPERVISOR, COORDENADOR, GERENTE',
};
const qxCopia = o => JSON.parse(JSON.stringify(o));
let qx = { cfg: null, lido: false, edit: null, sujo: false };
// Regras em uso: as salvas na tela ou, sem nada salvo, as de fábrica
const qxRegras = () => qx.cfg || QX_PADRAO;
const qxApelidos = e => String(e.apelidos || '').toUpperCase().split(/[,;\s]+/).filter(Boolean);
const qxHoras = h => { const m = String(h || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] + m[2] / 60 : null; };
const qxHoraOk = h => /^\d{2}:[0-5]\d$/.test(String(h || ''));
async function qxCarregar(){ qx.cfg = await qdConfig('escalas', null); qx.lido = true; return qxRegras(); }

/* ---------------- tela ---------------- */
async function qxRender(){
  const corpo = qdEl('qd-corpo');
  if (!qx.edit) {
    try { await qxCarregar(); } catch (erro) { showToast(erro.message, 'erro'); return; }
    if (qd.aba !== 'escalas' || qdEl('qd-corpo') !== corpo) return; // saiu da tela enquanto lia do banco
    qx.edit = qxCopia(qxRegras()); qx.sujo = false;
  }
  qxDesenhar();
}
function qxMudou(){ qx.sujo = true; qxDesenhar(); }
// Quem está no quadro hoje (para mostrar quantas pessoas cada linha alcança)
const qxNoQuadro = () => qd.func.filter(f => !f.fora_base && !qdForaDoQuadro(f.status));

function qxDesenhar(){
  const alvo = qdEl('qd-corpo');
  if (!alvo || !qx.edit) return;
  const r = qx.edit, pessoas = qxNoQuadro();
  const porEscala = {}, porCh = {};
  pessoas.forEach(f => {
    const e = qeEscala(f, r); if (e) porEscala[e] = (porEscala[e] || 0) + 1;
    if (f.carga_horaria) porCh[f.carga_horaria] = (porCh[f.carga_horaria] || 0) + 1;
  });
  // Avisos: escalas que aparecem no quadro sem cadastro (contam zero hora) e cargas horárias fora da tabela
  const semEscala = Object.entries(porEscala).filter(([e]) => !r.escalas.some(x => x.nome === e));
  const semCh = Object.entries(porCh).filter(([c]) => !r.cargas.some(x => x.ch === c)).sort((a, b) => b[1] - a[1]);
  const num = (v, acao) => `<input type="number" class="qx-peso" min="0" max="1" step="0.1" value="${v}" onchange="${acao}">`;
  const linhasEsc = r.escalas.map((e, i) => `<tr>
      <td><input type="text" class="caixa-alta qx-nome" value="${qdEsc(e.nome)}" placeholder="EX.: 12X36" onchange="qxEsc(${i},'nome',this.value.trim().toUpperCase())"></td>
      <td><input type="text" class="caixa-alta qx-apelidos" value="${qdEsc(e.apelidos || '')}" placeholder="—" title="Jornadas do WFM que contam como esta escala (separe por vírgula)" onchange="qxEsc(${i},'apelidos',this.value.trim().toUpperCase())"></td>
      ${QX_DIAS.map(([d]) => `<td class="qx-dia">${num(e.pesos[d], `qxPeso(${i},'${d}',this.value)`)}</td>`).join('')}
      <td><select onchange="qxEsc(${i},'folgaFeriado',this.value === '1')"><option value="0"${e.folgaFeriado ? '' : ' selected'}>Trabalha</option><option value="1"${e.folgaFeriado ? ' selected' : ''}>Folga</option></select></td>
      <td class="num">${qdNum(porEscala[e.nome] || 0)}</td>
      <td class="th-acao"><button class="btn-icon" title="Excluir escala" onclick="qxExcluir('escalas',${i})">✕</button></td>
    </tr>`).join('');
  const opcoesEsc = atual => [['', '— fora da escala'], ...r.escalas.map(e => [e.nome, e.nome])]
    .map(([v, n]) => `<option value="${qdEsc(v)}"${v === (atual || '') ? ' selected' : ''}>${qdEsc(n)}</option>`).join('');
  const linhasCh = r.cargas.map((c, i) => `<tr>
      <td><input type="text" class="qx-hora" value="${qdEsc(c.ch)}" placeholder="08:12" maxlength="5" onchange="qxCh(${i},'ch',this.value.trim())"></td>
      <td><select onchange="qxCh(${i},'escala',this.value)">${opcoesEsc(c.escala)}</select></td>
      <td><input type="text" class="qx-hora" value="${qdEsc(c.horas || '')}" placeholder="${qdEsc(c.ch)}" maxlength="5" title="Horas que valem por dia (vazio = a própria carga horária)" onchange="qxCh(${i},'horas',this.value.trim())"></td>
      <td class="num">${qdNum(porCh[c.ch] || 0)}</td>
      <td class="th-acao"><button class="btn-icon" title="Excluir carga horária" onclick="qxExcluir('cargas',${i})">✕</button></td>
    </tr>`).join('');
  alvo.innerHTML = `<div class="qx">
    <div class="panel qx-barra">
      <label class="qx-lid" title="Quem tem um destes cargos (nível/função do DPO) não entra nas horas escaladas">Não entram na escala os cargos
        <input type="text" class="caixa-alta" value="${qdEsc(r.lideranca || '')}" onchange="qx.edit.lideranca = this.value.trim().toUpperCase(); qxMudou()"></label>
      <span class="qx-botoes">
        <button class="btn btn-ghost btn-small" onclick="qxPadrao()" title="Volta às regras de 14/10/2026 (4X3, 5X2, 7X1)">Voltar ao padrão</button>
        ${qx.sujo ? '<button class="btn btn-ghost btn-small" onclick="qx.edit = null; qxRender()">Descartar</button>' : ''}
        <button class="btn btn-primary btn-small" style="width:auto" onclick="qxSalvar()"${qx.sujo ? '' : ' disabled'}>${qx.sujo ? 'Salvar mudanças' : 'Salvo'}</button>
      </span>
    </div>
    ${semEscala.length || semCh.length ? `<div class="qx-aviso">
      ${semEscala.length ? `<div><b>Escalas do WFM sem cadastro</b> (não contam horas): ${semEscala.map(([e, n]) => `<button class="btn btn-ghost btn-small" title="Cadastrar esta escala" onclick="qxNova('${qdEsc(e)}')">+ ${qdEsc(e)} · ${qdNum(n)} pessoa(s)</button>`).join(' ')}</div>` : ''}
      ${semCh.length ? `<div class="qd-fraco">Cargas horárias do quadro fora da tabela (não entram nas horas): ${semCh.map(([c, n]) => `${qdEsc(c)} · ${qdNum(n)}`).join(' · ')}</div>` : ''}
    </div>` : ''}
    <div class="qx-grade">
      <section class="panel tela-tabela">
        <div class="table-wrap"><table class="qx-tabela">
          <thead><tr><th>Escala</th><th title="Jornadas do WFM que contam como esta escala">Também vale para</th>
            ${QX_DIAS.map(([, n]) => `<th class="qx-dia" title="Quanto a pessoa conta neste dia: 1 = o dia inteiro, 0,6 = 60%, 0 = folga">${n}</th>`).join('')}
            <th>Feriado</th><th class="num">Pessoas</th>
            <th class="th-acao"><button class="btn btn-primary btn-small" onclick="qxNova()">+ Nova escala</button></th></tr></thead>
          <tbody>${linhasEsc || '<tr><td colspan="12" class="qd-fraco">Nenhuma escala cadastrada.</td></tr>'}</tbody>
        </table></div>
      </section>
      <section class="panel tela-tabela">
        <div class="table-wrap"><table class="qx-tabela">
          <thead><tr><th title="Carga horária do DPO">Carga horária</th><th title="Escala de quem não tem jornada no WFM">Escala</th><th title="Horas que valem por dia">Horas/dia</th><th class="num">Pessoas</th>
            <th class="th-acao"><button class="btn btn-primary btn-small" onclick="qxNovaCh()">+ Nova carga horária</button></th></tr></thead>
          <tbody>${linhasCh || '<tr><td colspan="5" class="qd-fraco">Nenhuma carga horária cadastrada.</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>
  </div>`;
}

/* ---------------- edição ---------------- */
function qxEsc(i, campo, valor){
  const e = qx.edit.escalas[i], antes = e.nome;
  e[campo] = valor;
  if (campo === 'nome') qx.edit.cargas.forEach(c => { if (c.escala === antes) c.escala = valor; }); // renomear leva junto as cargas horárias
  qxMudou();
}
function qxPeso(i, dia, valor){
  const v = Math.min(1, Math.max(0, Number(String(valor).replace(',', '.')) || 0));
  qx.edit.escalas[i].pesos[dia] = Math.round(v * 100) / 100;
  qxMudou();
}
function qxCh(i, campo, valor){ qx.edit.cargas[i][campo] = valor; qxMudou(); }
function qxNova(nome = ''){
  qx.edit.escalas.push({ nome, apelidos: '', pesos: { dom: 0, seg: 1, ter: 1, qua: 1, qui: 1, sex: 1, sab: 0 }, folgaFeriado: false });
  qxMudou();
}
function qxNovaCh(){ qx.edit.cargas.push({ ch: '', escala: '', horas: '' }); qxMudou(); }
function qxExcluir(lista, i){
  const item = qx.edit[lista][i];
  if (lista === 'escalas') qx.edit.cargas.forEach(c => { if (c.escala === item.nome) c.escala = ''; });
  qx.edit[lista].splice(i, 1);
  qxMudou();
}
function qxPadrao(){
  if (!confirm('Voltar às regras de fábrica (4X3, 5X2, 7X1 e as 5 cargas horárias)? As mudanças só valem depois de salvar.')) return;
  qx.edit = qxCopia(QX_PADRAO); qxMudou();
}
function qxConferir(r){
  const nomes = r.escalas.map(e => e.nome);
  if (nomes.some(n => !n)) return 'Toda escala precisa de nome.';
  if (new Set(nomes).size !== nomes.length) return 'Há escalas com o mesmo nome.';
  const apelidos = r.escalas.flatMap(qxApelidos);
  if (apelidos.some(a => nomes.includes(a))) return '"Também vale para" não pode repetir o nome de outra escala.';
  if (new Set(apelidos).size !== apelidos.length) return 'A mesma jornada está em "também vale para" de duas escalas.';
  const chs = r.cargas.map(c => c.ch);
  if (chs.some(c => !qxHoraOk(c))) return 'Carga horária no formato HH:MM (ex.: 08:12).';
  if (new Set(chs).size !== chs.length) return 'Há cargas horárias repetidas.';
  if (r.cargas.some(c => c.horas && !qxHoraOk(c.horas))) return 'Horas por dia no formato HH:MM (ex.: 09:00) ou vazio.';
  return null;
}
async function qxSalvar(){
  const problema = qxConferir(qx.edit);
  if (problema) return showToast(problema, 'erro', 5000);
  const valor = qxCopia(qx.edit);
  try {
    await qdGravar({ config: [{ chave: 'escalas', valor }] });
    qx.cfg = valor; qx.sujo = false;
    // O painel no Estúdio lê as regras ao abrir; aqui só garante que a base e as medidas de escala estão na versão que usa os pesos
    let extra = '';
    const info = await qdConfig('estudio', null).catch(() => null);
    if (info && pode('quadro.estudio')) {
      try { const p = await qePrepararBase(); if (p.trocadas || p.faltam) extra = ` · ${p.trocadas + p.faltam} medida(s) do Estúdio atualizada(s)`; }
      catch (erro) { extra = ' · não foi possível atualizar as medidas do Estúdio (' + erro.message + ')'; }
    }
    showToast(`Escalas salvas: o PAINEL DO QUADRO usa as regras novas na próxima vez que for aberto${extra}.`, 'sucesso', 6000);
    qxDesenhar();
  } catch (erro) { showToast('Erro ao salvar as escalas: ' + erro.message, 'erro', 6000); }
}
