/* =====================================================================
   ESTÚDIO · VISUAIS E MEDIDAS (etapas E2b e E2c)
   - Carrega os dados da base (arquivos Parquet por dia) no DuckDB do navegador → visão "dados"
   - Medidas: formulário vira SQL. Condições = FILTER (WHERE ...), o mesmo raciocínio do SOMASES/CONT.SES
   - Campos dos visuais: Eixo · Valores · Legenda (arrastar do painel Dados ou escolher na lista)
   - Desenho: card (número grande) e gráficos com Apache ECharts
   Depende de: estudio.js (estSql, estDuck, estApi, estEsc) e estudio-editor.js (ed, edVisual...).
   ===================================================================== */

const LIB_ECHARTS = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';

// Paleta das séries (validada: separação para daltonismo e contraste, temas escuro e claro).
// Ordem fixa: a 1ª série é sempre laranja (cor do sistema), a 2ª azul, e assim por diante.
const VZ_PALETA = {
  dark:  ['#d95926', '#3987e5', '#199e70', '#c98500', '#d55181', '#9085e9'],
  light: ['#eb6834', '#2a78d6', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'],
};

const VZ_TIPOS_MEDIDA = {
  soma:              { rotulo: 'Soma',                 excel: 'SOMA / SOMASES',            coluna: 'num' },
  media:             { rotulo: 'Média',                excel: 'MÉDIA / MÉDIASES',          coluna: 'num' },
  contagem:          { rotulo: 'Contagem de linhas',   excel: 'CONT.VALORES / CONT.SES',   coluna: null },
  contagem_distinta: { rotulo: 'Contagem distinta',    excel: 'quantos valores diferentes', coluna: 'qualquer' },
  minimo:            { rotulo: 'Mínimo',               excel: 'MÍNIMO / MÍNIMOSES',        coluna: 'ordem' },
  maximo:            { rotulo: 'Máximo',               excel: 'MÁXIMO / MÁXIMOSES',        coluna: 'ordem' },
  media_ponderada:   { rotulo: 'Média ponderada',      excel: 'SOMARPRODUTO ÷ SOMA',       coluna: 'num' },
  divisao:           { rotulo: 'Divisão entre medidas', excel: 'medida A ÷ medida B',      coluna: null },
};
const VZ_FORMATOS = { auto: 'Automático', inteiro: 'Número inteiro', decimal: 'Decimal', porcentagem: 'Porcentagem (0,885 → 88,5%)', moeda: 'Moeda (R$)', duracao: 'Duração (segundos → hh:mm:ss)', data: 'Data (dd/mm/aaaa)', hora: 'Hora (hh:mm)', texto: 'Texto (como está)' };
// Casas decimais padrão de cada formato (a aba Formatar pode trocar)
const VZ_CASAS_PADRAO = { decimal: 2, porcentagem: 1, moeda: 2, auto: 2 };
const VZ_AGG_COLUNA = { soma: 'Soma', media: 'Média', contagem_distinta: 'Contagem distinta', minimo: 'Mínimo', maximo: 'Máximo' };

/* ---------------- dados da base no navegador ---------------- */
async function vzCarregarDados(){
  ed.dadosProntos = false;
  // Base "foto" (ex.: QUADRO, um retrato por carga): o relatório pode usar só o dia mais recente, para não somar retratos
  const dias = (ed.def.apoio || {}).ultimoDia ? ed.arquivos.slice(-1) : ed.arquivos.slice(-62); // até ~2 meses no editor
  const st = edEl('ed-status-dados');
  if (!ed.leitura) await daxConverterMedidasAntigas(); // estudio-dax.js: medidas do formulário antigo → fórmula DAX
  if (ed.base.fonte === 'csat') return vzCarregarDadosCsat(); // E4: base ligada ao banco (avaliações do Painel CSAT)
  if (!dias.length) { if (st) st.textContent = 'Base sem dados carregados'; return; }
  try {
    if (st) st.textContent = 'Carregando dados…';
    await Promise.all([estDuck(), carregarLib(LIB_ECHARTS)]);
    const nomes = await vzBaixarDias(ed.base.id, dias);
    await estSql(`create or replace view principal as select * from read_parquet([${nomes.map(n => `'${n}'`).join(', ')}], union_by_name = true)`);
    await vzMontarRelacoes(); // E5: junta as colunas das bases relacionadas → visão "dados"
    const n = (await estSql('select count(*) n from dados'))[0].n;
    ed.dadosProntos = true;
    // busca o aviso de novo: o painel Dados pode ter sido redesenhado (colunas das relações) durante a carga
    const st2 = edEl('ed-status-dados');
    if (st2) st2.textContent = `${estNum(n)} linhas · ${estDataBr(dias[0].dia)} a ${estDataBr(dias[dias.length - 1].dia)}`;
    vzRenderTodos();
  } catch (erro) {
    if (edEl('ed-status-dados')) edEl('ed-status-dados').textContent = 'Erro ao carregar os dados';
    showToast('Erro ao carregar os dados da base: ' + erro.message, 'erro');
  }
}
// Baixa (só os que faltam) os arquivos Parquet de alguns dias de uma base e devolve os nomes no motor
async function vzBaixarDias(baseId, dias){
  const { db } = await estDuck();
  est._arquivosNoMotor = est._arquivosNoMotor || new Set();
  const nomes = dias.map(a => `b${baseId}_${a.dia}_${a.bytes}.parquet`);
  const faltam = dias.filter((a, i) => !est._arquivosNoMotor.has(nomes[i]));
  if (faltam.length) {
    // Tela do usuário (relatório publicado) usa a rota que confere se o card está liberado; o editor usa a rota do admin
    const { links } = ed.leitura
      ? await estApi('POST', `/api/estudio/publicados/${ed.rel.id}/links-download`, { dias: faltam.map(a => a.dia), base_id: baseId })
      : await estApi('POST', `/api/estudio/bases/${baseId}/links-download`, { dias: faltam.map(a => a.dia) });
    await Promise.all(faltam.map(async a => {
      const nome = `b${baseId}_${a.dia}_${a.bytes}.parquet`;
      if (!links[a.dia]) throw new Error(`o arquivo do dia ${estDataBr(a.dia)} não foi encontrado`);
      const r = await fetch(links[a.dia]);
      if (!r.ok) throw new Error(`não foi possível baixar o dia ${estDataBr(a.dia)}`);
      await db.registerFileBuffer(nome, new Uint8Array(await r.arrayBuffer()));
      est._arquivosNoMotor.add(nome);
    }));
  }
  return nomes;
}

/* ---------------- relações entre bases · etapa E5 ----------------
   Como o "procurar" (PROCV) do Excel ou a relação do Power BI: cada linha da base principal busca, na base
   relacionada, a linha com o mesmo valor na coluna escolhida (ex.: OPERADOR) e ganha as colunas dela (ex.: TURNO, EPS).
   Se a base relacionada tiver o mesmo valor repetido, fica só a primeira linha — assim a base principal nunca
   ganha linhas a mais (as contas não dobram). Comparação sem diferenciar maiúsculas e espaços nas pontas.
   As colunas novas aparecem no painel Dados com o nome "BASE · COLUNA" e funcionam em visuais, filtros e DAX. */
async function vzInfoBaseRel(baseId){
  ed.basesRel = ed.basesRel || {};
  if (!ed.basesRel[baseId]) {
    if (ed.leitura) throw new Error('base relacionada não encontrada na versão publicada');
    const det = await estApi('GET', `/api/estudio/bases/${baseId}`);
    ed.basesRel[baseId] = { base: det.base, arquivos: det.arquivos || [] };
  }
  return ed.basesRel[baseId];
}
async function vzMontarRelacoes(){
  if (!ed.colunasOriginais) ed.colunasOriginais = ed.base.colunas.filter(c => !c._rel);
  ed.base.colunas = ed.colunasOriginais;
  const rels = ed.def.relacoes || [];
  const sel = ['p.*'], joins = [], extras = [];
  ed.avisosRel = [];
  for (const r of rels) {
    try {
      const info = await vzInfoBaseRel(r.base_id);
      if (info.base.fonte === 'csat') throw new Error('a base ligada ao banco não pode ser relacionada (ainda)');
      if (!vzColunaOriginal(r.coluna)) throw new Error(`a coluna ${r.coluna} não existe mais nesta base`);
      const diasR = info.arquivos.slice(-120);
      if (!diasR.length) throw new Error(`a base ${info.base.nome} não tem dados`);
      const nomesR = await vzBaixarDias(info.base.id, diasR);
      const t = `rel_${r.id}`, chaveR = vzId(r.coluna_rel), chaveP = vzId(r.coluna);
      await estSql(`create or replace view ${t} as select * exclude (_rn) from (
          select *, row_number() over (partition by upper(trim(cast(${chaveR} as varchar)))) as _rn
          from read_parquet([${nomesR.map(n => `'${n}'`).join(', ')}], union_by_name = true)) where _rn = 1`);
      for (const c of info.base.colunas.filter(c => c.manter && c.nome !== r.coluna_rel)) {
        const nome = `${r.id}__${c.nome}`;
        sel.push(`${t}.${vzId(c.nome)} as ${vzId(nome)}`);
        extras.push({ ...c, nome, rotulo: `${info.base.nome} · ${c.rotulo}`, _rel: r.id, _relBase: info.base.nome, _rotuloOriginal: c.rotulo, _nomeOriginal: c.nome });
      }
      joins.push(`left join ${t} on upper(trim(cast(p.${chaveP} as varchar))) = upper(trim(cast(${t}.${chaveR} as varchar)))`);
    } catch (erro) {
      ed.avisosRel.push(`Relação com a base ${r.base_nome || r.base_id}: ${erro.message}`);
    }
  }
  await estSql(`create or replace view dados_base as select ${sel.join(', ')} from principal p ${joins.join(' ')}`);
  extras.push(...await vzMontarApoio()); // tabelas de apoio (Calendário, Faixas de 30 min) → visões "dados" e "dados_faixa"
  ed.base.colunas = [...ed.colunasOriginais, ...extras];
  if (ed.avisosRel.length) showToast(ed.avisosRel.join(' · '), 'erro', 6000);
  if (!ed.leitura && edEl('ed-dados')) edRenderDados();
}
const vzColunaOriginal = nome => (ed.colunasOriginais || ed.base.colunas).find(c => c.nome === nome);

/* ---------------- tabelas de apoio · Calendário e Faixas de 30 min (14/10/2026) ----------------
   Como a tabela calendário do Power BI: cada linha da base é cruzada com os dias do mês (CALENDARIO) e,
   nos visuais que usam o horário, também com as 48 faixas de 30 min (FAIXAS). Assim uma medida DAX pode
   perguntar "no dia do eixo, esta pessoa estava de férias?" comparando as datas dela com CALENDARIO[DATA].
   Liga-se no desenho do relatório: def.apoio = { calendario: true, faixas: true, mes: 'AAAA-MM' (vazio = mês do último dia da base) }.
   Colunas: CALENDARIO[DATA], [DIA], [DIA DA SEMANA] (1 = domingo … 7 = sábado), [NOME DO DIA], [FERIADO] (1/0), [TIPO] (REAL/PROJEÇÃO,
   comparando com o último dia de dados) · FAIXAS[INÍCIO] (hora), [FAIXA] ("HH:MM"). */
// Feriados nacionais do ano (fixos + móveis pela Páscoa: Carnaval seg/ter, Sexta-feira Santa, Corpus Christi)
function vzFeriadosNacionais(ano){
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mes = Math.floor((h + l - 7 * m + 114) / 31),
    dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(Date.UTC(ano, mes - 1, dia));
  const mais = n => new Date(pascoa.getTime() + n * 86400000).toISOString().slice(0, 10);
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(x => `${ano}-${x}`);
  return new Set([...fixos, mais(-48), mais(-47), mais(-2), mais(60)]);
}
const VZ_DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
async function vzMontarApoio(){
  const ap = ed.def.apoio || {}, extras = [];
  const col = (tabela, nome, rotulo, tipo) => ({ origem: nome, nome, rotulo: `${tabela} · ${rotulo}`, tipo, manter: true, vazio: 'nulo', padrao: '',
    _rel: 'apoio', _relBase: tabela, _rotuloOriginal: rotulo, _nomeOriginal: nome, _apoio: tabela });
  if (!ap.calendario) {
    await estSql('create or replace view dados as select * from dados_base');
    await estSql('create or replace view dados_faixa as select * from dados_base');
    return extras;
  }
  const ultimoDia = ed.arquivos.length ? ed.arquivos[ed.arquivos.length - 1].dia : new Date().toISOString().slice(0, 10);
  const mes = /^\d{4}-\d{2}$/.test(ap.mes || '') ? ap.mes : ultimoDia.slice(0, 7);
  const [ano, m] = mes.split('-').map(Number), nDias = new Date(ano, m, 0).getDate(), feriados = vzFeriadosNacionais(ano);
  const linhas = Array.from({ length: nDias }, (_, i) => {
    const dia = `${mes}-${String(i + 1).padStart(2, '0')}`, sem = new Date(dia + 'T12:00:00').getDay();
    return `(date '${dia}', ${i + 1}, ${sem + 1}, '${VZ_DIAS_SEMANA[sem]}', ${feriados.has(dia) ? 1 : 0}, '${dia <= ultimoDia ? 'REAL' : 'PROJEÇÃO'}')`;
  });
  await estSql(`create or replace table apoio_calendario as select * from (values ${linhas.join(', ')})
    as t(cal__data, cal__dia, cal__dia_semana, cal__nome_dia, cal__feriado, cal__tipo)`);
  await estSql('create or replace view dados as select b.*, c.* from dados_base b cross join apoio_calendario c');
  extras.push(col('CALENDARIO', 'cal__data', 'DATA', 'data'), col('CALENDARIO', 'cal__dia', 'DIA', 'inteiro'),
    col('CALENDARIO', 'cal__dia_semana', 'DIA DA SEMANA', 'inteiro'), col('CALENDARIO', 'cal__nome_dia', 'NOME DO DIA', 'texto'),
    col('CALENDARIO', 'cal__feriado', 'FERIADO', 'inteiro'), col('CALENDARIO', 'cal__tipo', 'TIPO', 'texto'));
  if (ap.faixas) {
    await estSql(`create or replace table apoio_faixas as select make_time(cast(i // 2 as bigint), cast((i % 2) * 30 as bigint), 0.0) as fx__inicio,
        lpad(cast(i // 2 as varchar), 2, '0') || ':' || case when i % 2 = 0 then '00' else '30' end as fx__faixa
      from range(48) r(i)`);
    await estSql('create or replace view dados_faixa as select d.*, f.* from dados d cross join apoio_faixas f');
    extras.push(col('FAIXAS', 'fx__inicio', 'INÍCIO', 'hora'), col('FAIXAS', 'fx__faixa', 'FAIXA', 'texto'));
  } else await estSql('create or replace view dados_faixa as select * from dados');
  ed.apoioMes = mes;
  return extras;
}
// Visual que usa uma coluna das FAIXAS (eixo, linhas, legenda...) lê a visão cruzada com as 48 faixas; os demais, a visão por dia
const vzUsaFaixa = v => JSON.stringify(v.campos || {}).includes('"fx__');

// E4 · base "ligada ao banco" (Painel CSAT): lê UM mês de avaliações pela rota do painel e monta a tabela no navegador.
// Colunas: data, operador, supervisor, operacao, local, nota, hora (faixa de 30 min). Vazio no banco = vazio aqui.
async function vzCarregarDadosCsat(mes){
  const st = edEl('ed-status-dados');
  ed.dadosProntos = false;
  try {
    if (st) st.textContent = 'Carregando avaliações do banco…';
    const [{ db }] = await Promise.all([estDuck(), carregarLib(LIB_ECHARTS)]);
    const r = await estApi('GET', '/api/csat/dados' + (mes ? '?mes=' + encodeURIComponent(mes) : ''));
    ed.csatMes = r.mes; ed.csatMeses = r.meses || []; ed.csatUltima = r.ultima || null;
    // Meta: a mesma do Painel CSAT (gravada no banco). Se o admin mexeu e ainda não salvou, não desfaz.
    ed.metaSalva = r.meta ?? 90;
    if (!ed.metaAlterada) ed.meta = ed.metaSalva;
    if (typeof edAtualizarMeta === 'function') edAtualizarMeta();
    const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const hh = m => m == null ? '' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ':00';
    const linhas = ['data,operador,supervisor,operacao,local,nota,hora'];
    for (const [dia, o, s, p, l, nota, h] of (r.linhas || [])) {
      linhas.push([`${r.mes}-${String(dia).padStart(2, '0')}`, q(r.dic.op[o]), q(r.dic.sup[s]), q(r.dic.oper[p]), q(r.dic.loc[l]), nota, hh(h)].join(','));
    }
    await db.registerFileText('csat_banco.csv', linhas.join('\n'));
    // Vazio no banco aparece como no painel: "Sem supervisor", "Sem operação", "Sem local".
    // EPS = SEDE, FILIAL RJ e FILIAL BH viram "PRÓPRIA"; os demais locais mantêm o próprio nome (igual ao painel)
    await estSql(`create or replace table csat_banco as select cast(data as date) as data, nullif(operador, '') as operador,
        coalesce(nullif(supervisor, ''), 'Sem supervisor') as supervisor, coalesce(nullif(operacao, ''), 'Sem operação') as operacao,
        case when local in ('SEDE', 'FILIAL RJ', 'FILIAL BH') then 'PRÓPRIA' else coalesce(nullif(local, ''), 'Sem local') end as eps,
        coalesce(nullif(local, ''), 'Sem local') as local, cast(nota as integer) as nota, cast(nullif(hora, '') as time) as hora
      from read_csv('csat_banco.csv', header=true, all_varchar=true, delim=',', quote='"', escape='"')`);
    await db.dropFile('csat_banco.csv');
    await estSql('create or replace view dados as select * from csat_banco');
    // seletor de mês no cabeçalho (só aparece para base ligada ao banco)
    const sel = edEl('ed-mes');
    if (sel) {
      const nomeMes = m => { const [a, b] = m.split('-'); return ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'][+b - 1] + '/' + a; };
      sel.innerHTML = ed.csatMeses.map(m => `<option value="${m}" ${m === r.mes ? 'selected' : ''}>${nomeMes(m)}</option>`).join('');
      sel.classList.toggle('hidden', !ed.csatMeses.length);
    }
    ed.dadosProntos = true;
    if (st) st.textContent = r.mes ? `${estNum((r.linhas || []).length)} avaliações · mês ${r.mes.split('-').reverse().join('/')}` : 'Nenhuma avaliação no banco ainda';
    vzRenderTodos();
  } catch (erro) {
    if (st) st.textContent = 'Erro ao carregar as avaliações';
    showToast('Erro ao carregar as avaliações do banco: ' + erro.message, 'erro');
  }
}

/* ---------------- medidas → SQL ---------------- */
const vzColuna = nome => (ed.base.colunas || []).find(c => c.nome === nome);
const vzMedida = id => (ed.base.medidas || []).find(m => m.id === id);
const vzId = nome => '"' + String(nome).replace(/"/g, '') + '"';

// Valor digitado na condição → literal SQL do tipo certo da coluna
function vzLiteral(col, valor){
  const c = vzColuna(col), v = String(valor ?? '').trim();
  if (!c) throw new Error('coluna desconhecida: ' + col);
  if (['inteiro', 'decimal'].includes(c.tipo)) {
    const n = Number(v.replace(/\./g, '').replace(',', '.'));
    if (v === '' || isNaN(n)) throw new Error(`"${v}" não é um número válido para ${c.rotulo}`);
    return String(n);
  }
  if (c.tipo === 'data' || c.tipo === 'data_hora') {
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) || v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) throw new Error(`"${v}" não é uma data (use dd/mm/aaaa) para ${c.rotulo}`);
    const iso = m[3].length === 4 ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return c.tipo === 'data' ? `date '${iso}'` : `timestamp '${iso}'`;
  }
  if (c.tipo === 'hora') {
    if (!/^\d{1,2}:\d{2}$/.test(v)) throw new Error(`"${v}" não é uma hora (use hh:mm) para ${c.rotulo}`);
    return `time '${v.padStart(5, '0')}:00'`;
  }
  return estSqlTexto(v);
}
function vzCondicaoSql(k){
  const col = vzId(k.coluna);
  if (k.op === 'vazio') return `${col} is null`;
  if (k.op === 'nao_vazio') return `${col} is not null`;
  if (k.op === 'contem') return `contains(lower(cast(${col} as varchar)), lower(${estSqlTexto(k.valor || '')}))`;
  if (k.op === 'em') return `${col} in (${String(k.valor || '').split(';').map(x => x.trim()).filter(Boolean).map(x => vzLiteral(k.coluna, x)).join(', ') || 'null'})`;
  return `${col} ${k.op} ${vzLiteral(k.coluna, k.valor)}`;
}
function vzFiltro(condicoes){
  return condicoes && condicoes.length ? ` filter (where ${condicoes.map(vzCondicaoSql).join(' and ')})` : '';
}
function vzMedidaSql(m, pilha = new Set()){
  if (m.tipo === 'dax') return daxSqlMedida(m, [], pilha); // fórmula escrita (estudio-dax.js)
  // Daqui para baixo: contas rápidas de coluna nos visuais (ex.: soma de TMA) e medidas antigas do formulário
  if (pilha.has(m.id)) throw new Error(`a medida ${m.nome} depende dela mesma`);
  pilha.add(m.id);
  const f = vzFiltro(m.condicoes), c = m.coluna ? vzId(m.coluna) : null;
  let s;
  switch (m.tipo) {
    case 'soma': s = `sum(${c})${f}`; break;
    case 'media': s = `avg(${c})${f}`; break;
    case 'contagem': s = `count(*)${f}`; break;
    case 'contagem_distinta': s = `count(distinct ${c})${f}`; break;
    case 'minimo': s = `min(${c})${f}`; break;
    case 'maximo': s = `max(${c})${f}`; break;
    case 'media_ponderada': s = `(sum(${c} * ${vzId(m.peso)})${f} / nullif(sum(${vzId(m.peso)})${f}, 0))`; break;
    case 'divisao': {
      const a = vzMedida(m.medida_a), b = vzMedida(m.medida_b);
      if (!a || !b) throw new Error(`a medida ${m.nome} usa uma medida que não existe mais`);
      s = `(${vzMedidaSql(a, new Set(pilha))} / nullif(${vzMedidaSql(b, new Set(pilha))}, 0))`; break;
    }
    default: throw new Error('tipo de medida desconhecido');
  }
  const fator = Number(m.fator || 1);
  return fator !== 1 ? `((${s}) * ${fator})` : s;
}
// Item do campo Valores: medida salva ou coluna com uma conta rápida (ex.: soma de TMA)
function vzItemMedida(item){
  if (item.tipo === 'medida') return vzMedida(item.id);
  const c = vzColuna(item.col);
  const agg = item.agg || (['inteiro', 'decimal'].includes(c && c.tipo) ? 'soma' : 'contagem_distinta');
  return { id: 'col_' + item.col, nome: `${VZ_AGG_COLUNA[agg] || agg} DE ${(c && c.rotulo || item.col).toUpperCase()}`, tipo: agg, coluna: item.col, formato: 'auto', condicoes: [] };
}
function vzRotuloItem(item){
  if (item.tipo === 'medida') { const m = vzMedida(item.id); return m ? m.nome : '(medida apagada)'; }
  const c = vzColuna(item.col); return c ? c.rotulo : item.col;
}

/* ---------------- formatação de números ---------------- */
// casas: número de casas decimais (null = padrão do formato)
function vzFmt(v, formato, casas){
  if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
  if (typeof v === 'bigint') v = Number(v);
  if (formato === 'texto') return String(v);
  if (v instanceof Date) return v.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  if (formato === 'data') {
    if (typeof v === 'number') return new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    const s = String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s;
  }
  if (formato === 'hora') {
    if (typeof v !== 'number') { const m = String(v).match(/(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : String(v); }
    // hora do banco chega em microssegundos (> 1 dia em ms) ou milissegundos; número pequeno = segundos
    const seg = v > 86400000 ? v / 1e6 : v > 86400 ? v / 1000 : v;
    const t = Math.round(seg) % 86400; return String(Math.floor(t / 3600)).padStart(2, '0') + ':' + String(Math.floor(t % 3600 / 60)).padStart(2, '0');
  }
  if (typeof v !== 'number') return String(v);
  const c = casas ?? VZ_CASAS_PADRAO[formato];
  switch (formato) {
    case 'inteiro': return Math.round(v).toLocaleString('pt-BR');
    case 'decimal': return v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
    // toPrecision(12) limpa o "resto" da conta em binário (0,8825 × 100 = 88,2499999…) para arredondar igual ao painel (88,3%)
    case 'porcentagem': return Number((v * 100).toPrecision(12)).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }) + '%';
    case 'moeda': return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: c, maximumFractionDigits: c });
    case 'duracao': { const t = Math.round(v), h = Math.floor(t / 3600), mi = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' : '') + String(mi).padStart(h ? 2 : 1, '0') + ':' + String(s).padStart(2, '0'); }
    default: return Number.isInteger(v) ? v.toLocaleString('pt-BR') : v.toLocaleString('pt-BR', { maximumFractionDigits: casas ?? 2 });
  }
}
// Formatação do visual (aba Formatar): lê uma opção com valor padrão
const vzF = (v, sec, k, padrao) => { const s = v.formato && v.formato[sec]; return s && s[k] != null ? s[k] : padrao; };
// Formato de número que vale para uma medida dentro de um visual: o do visual (se escolhido) ou o da própria medida
function vzFormatoNum(v, m){
  const f = vzF(v, 'numero', 'formato', 'medida');
  return { formato: f === 'medida' ? (m.formato || 'auto') : f, casas: vzF(v, 'numero', 'casas', null) };
}
// Rótulo do eixo (datas e horas no formato brasileiro)
function vzFmtEixo(v, tipo){
  if (v == null) return tipo === 'hora' ? 'Sem horário' : '(vazio)';
  if (tipo === 'data' || tipo === 'data_hora') { const s = typeof v === 'number' ? new Date(v).toISOString() : String(v); return s.slice(8, 10) + '/' + s.slice(5, 7); }
  if (tipo === 'hora') { const s = String(v); return s.slice(0, 5); }
  return typeof v === 'number' ? vzFmt(v, 'auto') : String(v);
}
// Expressão do eixo/legenda conforme o tipo da coluna (data e hora em faixas úteis)
function vzExprEixo(col){
  const c = vzColuna(col), id = vzId(col);
  if (!c) throw new Error('coluna desconhecida: ' + col);
  if (c.tipo === 'data_hora') return `cast(cast(${id} as date) as varchar)`;
  if (c.tipo === 'data') return `cast(${id} as varchar)`;
  // meia hora, como texto "HH:MM" (o DuckDB do navegador não aceita strftime com TIME)
  if (c.tipo === 'hora') return `(lpad(cast(hour(${id}) as varchar), 2, '0') || ':' || case when minute(${id}) < 30 then '00' else '30' end)`;
  if (c.tipo === 'texto') return `coalesce(${id}, '(vazio)')`;
  return id;
}

/* ---------------- desenho dos visuais ---------------- */
ed.graficos = ed.graficos || {};
function vzRenderTodos(){
  if (!ed.def) return;
  edGuiaAtual().visuais.forEach(v => vzRender(v.id));
}
function vzCorpo(id){ return document.querySelector(`#ed-grade .ed-vis[data-id="${id}"] .ed-vis-corpo`); }
function vzDescartarGrafico(id){
  const g = ed.graficos[id];
  if (g) { try { g.obs && g.obs.disconnect(); g.inst.dispose(); } catch (e) {} delete ed.graficos[id]; }
}
function vzTema(){
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  // LSW: a 1ª série acompanha a paleta escolhida (aurora = violeta, brasa = laranja, oceano = verde); a ordem segue girando igual
  const base = VZ_PALETA[document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'];
  const giro = { aurora: 5, brasa: 0, oceano: 2 }[document.documentElement.getAttribute('data-paleta')] || 0;
  return { paleta: base.slice(giro).concat(base.slice(0, giro)), texto: css('--text-dim'), forte: css('--text'), fraco: css('--text-faint'), grade: css('--border'), fundo: css('--surface') };
}
async function vzRender(id){
  const v = edVisual(id), corpo = vzCorpo(id);
  if (!v || !corpo) return;
  vzAtualizarAlternador(v); // botões de eixos alternativos no título (quando há 2+ colunas no Eixo)
  const campos = v.campos || {};
  const valores = (campos.valores || []).filter(it => it.tipo === 'col' || vzMedida(it.id));
  vzDescartarGrafico(id);
  corpo._exp = null; // dados para o Exportar Excel (preenchidos quando o visual é desenhado)
  if (v.tipo === 'filtro') return vzRenderFiltro(id, v, corpo);
  if (v.tipo === 'reincidencia') return vzRenderReincidencia(id, v, corpo);
  if (!valores.length) { corpo.innerHTML = edCorpoVazio(v); return; }
  if (!ed.dadosProntos) { corpo.innerHTML = '<div class="ed-vazio-txt">carregando dados…</div>'; return; }
  const pedido = (corpo._pedido || 0) + 1; corpo._pedido = pedido; // descarta respostas antigas se mudar rápido
  try {
    const medidas = valores.map(vzItemMedida);
    if (v.tipo === 'tabela') { await vzRenderTabela(id, v, corpo, medidas, pedido); return; }
    if (v.tipo === 'velocimetro') { await vzRenderVelocimetro(id, v, corpo, medidas[0], pedido); return; }
    if (v.tipo === 'cascata') { await vzRenderCascata(id, v, corpo, medidas[0], pedido); return; }
    if (v.tipo === 'tendencia') { await vzRenderTendencia(id, v, corpo, medidas[0], pedido); return; }
    if (v.tipo === 'card') { await vzRenderCard(id, v, corpo, medidas[0], pedido); return; }
    const ei = (campos.eixo || [])[vzEixoAtivo(v)], leg = (campos.legenda || [])[0];
    if (!ei) { corpo.innerHTML = `<div class="ed-vazio-txt">falta o ${v.tipo === 'pizza' ? 'campo Categoria' : 'campo Eixo'} (uma coluna)</div>`; return; }
    const ce = vzColuna(ei.col);
    const usaLeg = leg && v.tipo !== 'pizza' && medidas.length === 1;
    const ordenaPorValor = v.tipo === 'pizza' || ce.tipo === 'texto';
    // Eixo de horário: sem as linhas sem horário (contadas para a dica) e com TODAS as meias horas entre a 1ª e a última
    const porHora = ce.tipo === 'hora';
    const fonte = vzFonte(v);
    const sql = `select ${vzExprEixo(ei.col)} as x${usaLeg ? `, ${vzExprEixo(leg.col)} as s` : ''}, ${medidas.map((m, i) => `${vzMedidaSql(m)} as m${i}`).join(', ')}
      from ${fonte} ${porHora ? `where ${vzId(ei.col)} is not null` : ''} group by all order by ${ordenaPorValor ? 'm0 desc nulls last' : 'x'} limit ${usaLeg ? 2000 : v.tipo === 'pizza' ? 12 : 60}`;
    let linhas = await estSql(sql);
    const semValor = porHora ? Number((await estSql(`select count(*) n from ${fonte} where ${vzId(ei.col)} is null`))[0].n) : 0;
    if (corpo._pedido !== pedido) return;
    if (porHora && linhas.length && !usaLeg) {
      const min = s => +s.slice(0, 2) * 60 + +s.slice(3, 5), hh = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
      const porX = Object.fromEntries(linhas.map(l => [l.x, l]));
      const todas = []; for (let m = min(linhas[0].x); m <= min(linhas[linhas.length - 1].x); m += 30) todas.push(porX[hh(m)] || { x: hh(m) });
      linhas = todas;
    }
    vzAtualizarCabecalho(v, ei, semValor);
    vzDesenharGrafico(id, v, linhas, medidas, ce, usaLeg ? vzColuna(leg.col) : null);
  } catch (erro) {
    if (corpo._pedido === pedido) corpo.innerHTML = `<div class="vz-erro">Não foi possível calcular: ${estEsc(erro.message)}</div>`;
  }
}
/* ---------------- meta ----------------
   Meta do relatório em % (ed.meta, ex.: 90). No Painel CSAT é a meta gravada no banco (a mesma do painel em código).
   Um valor em % (0,885) está na meta se 88,5 >= 90; um número comum, se valor >= meta. */
function vzNaMeta(valor, formato){
  if (valor == null || ed.meta == null) return null;
  return (formato === 'porcentagem' ? Number(valor) * 100 : Number(valor)) >= ed.meta;
}
const vzEtiquetaMeta = ok => ok == null ? '' : ok ? '<span class="badge badge-on">✓ Dentro da meta</span>' : '<span class="badge badge-fora">! Fora da meta</span>';
const VZ_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Título e dica do visual: o eixo alternativo ativo pode trocar os dois (ex.: Intraday / Intrahora); {n} = linhas sem valor no eixo
function vzAtualizarCabecalho(v, ei, semValor){
  const cab = document.querySelector(`#ed-grade .ed-vis[data-id="${v.id}"] .ed-vis-cab`);
  if (!cab) return;
  const tit = cab.querySelector('.ed-vis-titulo');
  if (tit) tit.textContent = (ei && ei.titulo) || v.titulo || '';
  let dica = vzF(v, 'titulo', 'dica', '');
  if (ei && (ei.dica || ei.dicaSem)) dica = semValor && ei.dica ? ei.dica.replace('{n}', estNum(semValor)) : (ei.dicaSem || (ei.dica && !ei.dica.includes('{n}') ? ei.dica : ''));
  let el = cab.querySelector('.ed-vis-dica');
  if (!dica) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('span'); el.className = 'ed-vis-dica'; tit.after(el); }
  el.textContent = dica;
}

// Card: valor grande + (opcional) rótulo em cima, alinhado à esquerda, faixa colorida e subtítulo (% do total, meta ou mês)
async function vzRenderCard(id, v, corpo, m, pedido){
  const nf = vzFormatoNum(v, m);
  const sub = vzF(v, 'card', 'sub', ''), subDe = sub === 'pct' ? vzMedida(vzF(v, 'card', 'subDe', '')) : null;
  const r = (await estSql(`select ${vzMedidaSql(m)} as v${subDe ? `, ${vzMedidaSql(subDe)} as t` : ''} from ${vzFonte(v)}`))[0];
  if (corpo._pedido !== pedido) return;
  corpo._exp = [['Medida', 'Valor'], [m.nome, vzNumExp(r.v)]];
  const tam = vzF(v, 'card', 'tamanho', null), cor = vzF(v, 'card', 'cor', null);
  const estilo = (tam ? `font-size:min(calc(${tam}px * var(--escala-fonte)), 52cqh, 18cqw);` : '') + (cor ? `color:${cor};` : '');
  const rotTxt = vzF(v, 'card', 'rotuloTexto', '') || m.nome, acima = vzF(v, 'card', 'rotuloPos', 'abaixo') === 'acima';
  const rotulo = vzF(v, 'card', 'rotulo', true) ? `<div class="vz-card-rot ${acima ? 'acima' : ''}">${estEsc(rotTxt)}</div>` : '';
  let subHtml = '';
  if (sub === 'meta') subHtml = r.v == null ? '' : vzEtiquetaMeta(vzNaMeta(r.v, nf.formato));
  else if (sub === 'pct' && subDe && Number(r.t)) subHtml = estEsc(vzFmt(Number(r.v) / Number(r.t), 'porcentagem', 1) + ' do total');
  else if (sub === 'mes') subHtml = ed.csatMes ? estEsc(VZ_MESES[+ed.csatMes.slice(5, 7) - 1] + '/' + ed.csatMes.slice(0, 4)) : '';
  else if (sub === 'texto') subHtml = estEsc(vzF(v, 'card', 'subTexto', ''));
  corpo.classList.toggle('vz-card-esq', vzF(v, 'card', 'alinhar', 'centro') === 'esquerda');
  const valor = `<div class="vz-card-valor" style="${estilo}">${r.v == null ? '—' : estEsc(vzFmt(r.v, nf.formato, nf.casas))}</div>`;
  corpo.innerHTML = (acima ? rotulo + valor : valor + rotulo) + (sub ? `<div class="vz-card-sub">${subHtml}</div>` : '');
}

function vzDesenharGrafico(id, v, linhas, medidas, ce, cl){
  const corpo = vzCorpo(id);
  corpo.innerHTML = '<div class="vz-grafico"></div>';
  const alvo = corpo.firstChild, t = vzTema();
  const inst = echarts.init(alvo, null, { renderer: 'canvas' });
  const nf = vzFormatoNum(v, medidas[0]), fmtV = val => vzFmt(val, nf.formato, nf.casas);
  // Formatação escolhida na aba Formatar (tudo opcional: sem escolha = automático/tema)
  const coresSeries = vzF(v, 'grafico', 'cores', []) || [];
  const paleta = Array.from({ length: Math.max(t.paleta.length, coresSeries.length) }, (_, i) => coresSeries[i] || t.paleta[i % t.paleta.length]);
  const corTexto = vzF(v, 'texto', 'cor', null) || t.texto, tamTexto = vzF(v, 'texto', 'tamanho', 11);
  const modoLegenda = vzF(v, 'grafico', 'legenda', 'auto'), rotulos = vzF(v, 'grafico', 'rotulos', false), grade = vzF(v, 'grafico', 'grade', true);
  let series, categorias;
  if (cl) {
    // uma medida separada pela Legenda: até 6 séries (as maiores); o resto vira OUTROS
    categorias = [...new Set(linhas.map(l => l.x))];
    const totais = {}; linhas.forEach(l => { totais[l.s] = (totais[l.s] || 0) + (Number(l.m0) || 0); });
    const nomesS = Object.keys(totais).sort((a, b) => totais[b] - totais[a]);
    const principais = nomesS.slice(0, 6);
    series = principais.map(s => ({ nome: vzFmtEixo(s === 'null' ? null : s, cl.tipo), dados: categorias.map(x => { const l = linhas.find(q => q.x === x && String(q.s) === s); return l ? Number(l.m0) : null; }) }));
  } else {
    categorias = linhas.map(l => l.x);
    series = medidas.map((m, i) => ({ nome: m.nome, dados: linhas.map(l => l['m' + i] == null ? null : Number(l['m' + i])) }));
  }
  const rotCat = categorias.map(x => vzFmtEixo(x, ce.tipo));
  corpo._exp = [[ce.rotulo, ...series.map(s => s.nome)], ...rotCat.map((r, i) => [r, ...series.map(s => s.dados[i])])];
  const eixoTexto = { color: corTexto, fontSize: tamTexto };
  // Legenda: automático = aparece com 2+ séries; pizza não usa (o nome fica ao lado de cada fatia)
  const mostraLegenda = v.tipo !== 'pizza' && (modoLegenda === 'mostrar' || (modoLegenda === 'auto' && series.length > 1));
  const base = {
    color: paleta, animation: false, textStyle: { fontFamily: 'IBM Plex Sans, sans-serif' },
    grid: { left: 8, right: 16, top: mostraLegenda ? 34 : (rotulos ? 22 : 14), bottom: 8, containLabel: true },
    legend: mostraLegenda ? { top: 0, textStyle: { color: corTexto, fontSize: tamTexto }, itemWidth: 14, itemHeight: 8, type: 'scroll' } : undefined,
    tooltip: { trigger: v.tipo === 'pizza' ? 'item' : 'axis', valueFormatter: fmtV, backgroundColor: t.fundo, borderColor: t.grade, textStyle: { color: t.texto } },
  };
  const rotuloDados = (pos) => rotulos ? { show: true, position: pos, color: corTexto, fontSize: tamTexto, formatter: p => fmtV(p.value) } : undefined;
  let opc;
  if (v.tipo === 'pizza') {
    opc = { ...base, series: [{ type: 'pie', radius: ['40%', '66%'], center: ['50%', '52%'], itemStyle: { borderColor: t.fundo, borderWidth: 2 },
      avoidLabelOverlap: true, minShowLabelAngle: 6, labelLayout: { hideOverlap: true },
      label: { color: corTexto, fontSize: tamTexto, formatter: p => `${p.name}\n${fmtV(p.value)}` },
      data: rotCat.map((nome, i) => ({ name: nome, value: series[0].dados[i] })) }] };
  } else {
    const horizontal = v.tipo === 'barras';
    // Meta no gráfico (aba Formatar): linha tracejada "Meta (90%)" e pontos verdes (dentro) / vermelhos (fora), como no Painel CSAT
    const comMeta = vzF(v, 'grafico', 'meta', false) && ed.meta != null && !horizontal;
    const pct = nf.formato === 'porcentagem', metaValor = comMeta ? (pct ? ed.meta / 100 : ed.meta) : null;
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const corOk = css('--success'), corFora = css('--danger');
    const eixoCat = { type: 'category', data: horizontal ? [...rotCat].reverse() : rotCat, axisLabel: { ...eixoTexto, hideOverlap: true }, axisLine: { lineStyle: { color: t.grade } }, axisTick: { show: false } };
    const eixoVal = { type: 'value', axisLabel: { ...eixoTexto, formatter: fmtV }, splitLine: { show: grade, lineStyle: { color: t.grade } } };
    if (comMeta && pct) {
      // eixo de 65% a 100% para realçar a tendência; desce se algum ponto (ou a meta) ficar abaixo de 65% — igual ao painel
      const vals = series.flatMap(s => s.dados).filter(x => x != null);
      eixoVal.max = 1;
      eixoVal.min = Math.max(0, Math.min(0.65, Math.floor(Math.min(...vals, metaValor) * 20) / 20 - 0.05));
    }
    const suave = vzF(v, 'grafico', 'suave', false);
    opc = { ...base, xAxis: horizontal ? eixoVal : eixoCat, yAxis: horizontal ? eixoCat : eixoVal,
      series: series.map(s => {
        const dados = horizontal ? [...s.dados].reverse() : s.dados;
        if (v.tipo === 'linhas' || v.tipo === 'area') return { name: s.nome, type: 'line', data: dados, symbolSize: comMeta ? 9 : 7, lineStyle: { width: 2 }, connectNulls: false,
          smooth: suave ? 0.35 : false, smoothMonotone: suave ? 'x' : undefined,
          itemStyle: comMeta ? { color: p => (p.value != null && (pct ? p.value * 100 : p.value) >= ed.meta) ? corOk : corFora, borderColor: t.fundo, borderWidth: 2 } : undefined,
          areaStyle: v.tipo === 'area' ? { opacity: .15 } : undefined, label: rotuloDados('top') };
        return { name: s.nome, type: 'bar', data: dados, barMaxWidth: 42, itemStyle: { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] }, label: rotuloDados(horizontal ? 'right' : 'top') };
      }).concat(comMeta ? [{ name: `Meta (${ed.meta}%)`.replace('%)', pct ? '%)' : ')'), type: 'line', data: rotCat.map(() => metaValor), symbol: 'none',
        lineStyle: { type: [6, 5], width: 1.5, color: t.texto }, itemStyle: { color: t.texto }, tooltip: { show: false } }] : []) };
    // a linha da série principal na cor 1 (os pontos é que ficam verdes/vermelhos)
    if (comMeta && opc.series[0] && opc.series[0].type === 'line') opc.series[0].lineStyle.color = paleta[0];
  }
  inst.setOption(opc);
  const obs = new ResizeObserver(() => inst.resize());
  obs.observe(alvo);
  ed.graficos[id] = { inst, obs };
}

/* ---------------- visuais de análise · etapa E6 ----------------
   Velocímetro (valor × meta) · Cascata (o que mais pesou / variação) · Tendência e projeção (reta dos mínimos
   quadrados, como a TENDÊNCIA do Excel) · Reincidência (quem voltou em até N dias). */
function vzNovoGrafico(id, corpo){
  corpo.innerHTML = '<div class="vz-grafico"></div>';
  const alvo = corpo.firstChild, inst = echarts.init(alvo, null, { renderer: 'canvas' });
  const obs = new ResizeObserver(() => inst.resize()); obs.observe(alvo);
  ed.graficos[id] = { inst, obs };
  return inst;
}
// Máximo "redondo" para o mostrador (ex.: 1.234 → 2.000)
function vzMaxRedondo(x){ if (!(x > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(x))); return Math.ceil(x / p) * p; }

async function vzRenderVelocimetro(id, v, corpo, m, pedido){
  const metaIt = ((v.campos || {}).meta || [])[0];
  const mm = metaIt && (metaIt.tipo === 'col' || vzMedida(metaIt.id)) ? vzItemMedida(metaIt) : null;
  const r = (await estSql(`select ${vzMedidaSql(m)} as v${mm ? `, ${vzMedidaSql(mm)} as meta` : ''} from ${vzFonte(v)}`))[0];
  if (corpo._pedido !== pedido) return;
  const nf = vzFormatoNum(v, m), pct = nf.formato === 'porcentagem', fmtV = x => vzFmt(x, nf.formato, nf.casas), t = vzTema();
  const valor = r.v == null ? null : Number(r.v);
  let meta = mm ? (r.meta == null ? null : Number(r.meta)) : vzF(v, 'velocimetro', 'meta', null);
  if (!mm && meta != null && pct) meta = meta / 100; // meta fixa é digitada em % (ex.: 85)
  const maxF = vzF(v, 'velocimetro', 'maximo', null);
  const max = maxF != null ? (pct ? maxF / 100 : maxF) : pct ? 1 : vzMaxRedondo(Math.max(valor || 0, meta || 0) * 1.2);
  const ok = meta == null || valor == null ? null : valor >= meta;
  corpo._exp = [['Medida', 'Valor', 'Meta', 'Situação'], [m.nome, valor, meta, ok == null ? '' : ok ? 'dentro da meta' : 'fora da meta']];
  corpo._velo = { valor, meta, ok, max };
  // cor da barra: com meta, verde = dentro / laranja = fora (sempre com o texto escrito embaixo); sem meta, azul
  const cor = ok == null ? t.paleta[1] : ok ? t.paleta[2] : t.paleta[0];
  const comum = { type: 'gauge', min: 0, max, startAngle: 210, endAngle: -30, radius: '78%', center: ['50%', '50%'], axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, anchor: { show: false } };
  vzNovoGrafico(id, corpo).setOption({ animation: false, series: [
    { ...comum, progress: { show: true, width: 14, itemStyle: { color: cor } }, axisLine: { lineStyle: { width: 14, color: [[1, t.grade]] } }, pointer: { show: false }, title: { show: false },
      detail: { offsetCenter: [0, '-8%'], fontSize: 24, fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', color: t.forte, formatter: () => fmtV(valor) }, data: [{ value: valor ?? 0 }] },
    ...(meta != null ? [{ ...comum, axisLine: { show: false }, progress: { show: false }, detail: { show: false },
      pointer: { show: true, icon: 'rect', length: '16%', width: 3, offsetCenter: [0, '-74%'], itemStyle: { color: t.forte } },
      title: { show: true, offsetCenter: [0, '68%'], fontSize: 11, color: t.texto }, // abaixo das pontas do arco
      data: [{ value: meta, name: `META ${fmtV(meta)} · ${ok ? '✓ dentro da meta' : '! fora da meta'}` }] }] : []),
  ] });
}

async function vzRenderCascata(id, v, corpo, m, pedido){
  const eixo = ((v.campos || {}).eixo || [])[0];
  if (!eixo || !vzColuna(eixo.col)) { corpo.innerHTML = '<div class="ed-vazio-txt">falta a Categoria ou o período (uma coluna)</div>'; return; }
  const ce = vzColuna(eixo.col), temporal = ['data', 'data_hora', 'hora'].includes(ce.tipo);
  let modo = vzF(v, 'cascata', 'modo', 'auto');
  if (modo === 'auto') modo = temporal ? 'variacao' : 'soma';
  const linhas = await estSql(`select ${vzExprEixo(eixo.col)} as x, ${vzMedidaSql(m)} as y from ${vzFonte(v)} group by 1 order by ${temporal ? 'x' : 'y desc nulls last'} limit 24`);
  if (corpo._pedido !== pedido) return;
  if (!linhas.length) { corpo.innerHTML = '<div class="ed-vazio-txt">sem dados</div>'; return; }
  const nf = vzFormatoNum(v, m), fmtV = x => vzFmt(x, nf.formato, nf.casas), t = vzTema();
  const rot = linhas.map(l => vzFmtEixo(l.x, ce.tipo)), ys = linhas.map(l => Number(l.y) || 0);
  // passos: modo "soma" = cada categoria soma até o TOTAL; modo "variação" = do 1º valor, quanto subiu/caiu de um para o outro, até o último
  const passos = modo === 'variacao'
    ? [{ nome: rot[0], valor: ys[0], total: true }, ...ys.slice(1).map((y, i) => ({ nome: rot[i + 1], valor: y - ys[i] })), { nome: 'FIM', valor: ys[ys.length - 1], total: true }]
    : [...rot.map((n, i) => ({ nome: n, valor: ys[i] })), { nome: 'TOTAL', valor: ys.reduce((a, b) => a + b, 0), total: true }];
  let acum = 0; const base = [], barras = [];
  const corSobe = t.paleta[1], corDesce = t.paleta[0], corTotal = t.fraco;
  for (const p of passos) {
    if (p.total) { base.push(0); barras.push({ value: p.valor, itemStyle: { color: corTotal } }); acum = p.valor; continue; }
    const fim = acum + p.valor;
    base.push(Math.min(acum, fim)); barras.push({ value: Math.abs(p.valor), itemStyle: { color: p.valor >= 0 ? corSobe : corDesce } });
    acum = fim;
  }
  corpo._exp = [[ce.rotulo, modo === 'variacao' ? 'Variação' : 'Valor', 'Acumulado'], ...passos.map((p, i) => [p.nome, p.valor, base[i] + barras[i].value])];
  corpo._cascata = passos;
  const rotulo = i => { const p = passos[i]; return p.total ? fmtV(p.valor) : (p.valor >= 0 ? '+' : '−') + fmtV(Math.abs(p.valor)); };
  const corTexto = vzF(v, 'texto', 'cor', null) || t.texto, tam = vzF(v, 'texto', 'tamanho', 11);
  vzNovoGrafico(id, corpo).setOption({
    animation: false, textStyle: { fontFamily: 'IBM Plex Sans, sans-serif' },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: corTexto, fontSize: tam }, data: [modo === 'variacao' ? 'SUBIU' : 'SOMA', modo === 'variacao' ? 'CAIU' : 'SUBTRAI', modo === 'variacao' ? 'INÍCIO / FIM' : 'TOTAL'] },
    grid: { left: 8, right: 12, top: 30, bottom: 8, containLabel: true },
    tooltip: { trigger: 'item', backgroundColor: t.fundo, borderColor: t.grade, textStyle: { color: t.texto }, formatter: p => p.seriesIndex === 1 ? `${passos[p.dataIndex].nome}: ${rotulo(p.dataIndex)}` : '' },
    xAxis: { type: 'category', data: passos.map(p => p.nome), axisLabel: { color: corTexto, fontSize: tam, hideOverlap: true }, axisLine: { lineStyle: { color: t.grade } }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: corTexto, fontSize: tam, formatter: fmtV }, splitLine: { lineStyle: { color: t.grade } } },
    series: [
      { type: 'bar', stack: 'c', data: base, itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, tooltip: { show: false } },
      { type: 'bar', stack: 'c', data: barras, barMaxWidth: 42, itemStyle: { borderRadius: 3 }, label: { show: true, position: 'top', color: corTexto, fontSize: tam, formatter: p => rotulo(p.dataIndex) } },
      // séries vazias só para a legenda explicar as cores
      { name: modo === 'variacao' ? 'SUBIU' : 'SOMA', type: 'bar', data: [], itemStyle: { color: corSobe } },
      { name: modo === 'variacao' ? 'CAIU' : 'SUBTRAI', type: 'bar', data: [], itemStyle: { color: corDesce } },
      { name: modo === 'variacao' ? 'INÍCIO / FIM' : 'TOTAL', type: 'bar', data: [], itemStyle: { color: corTotal } },
    ],
  });
}

async function vzRenderTendencia(id, v, corpo, m, pedido){
  const eixo = ((v.campos || {}).eixo || [])[0];
  if (!eixo || !vzColuna(eixo.col)) { corpo.innerHTML = '<div class="ed-vazio-txt">falta a Data (uma coluna de data)</div>'; return; }
  if (!['data', 'data_hora'].includes(vzColuna(eixo.col).tipo)) { corpo.innerHTML = '<div class="ed-vazio-txt">a tendência precisa de uma coluna de DATA no campo Data</div>'; return; }
  const linhas = await estSql(`select cast(cast(${vzId(eixo.col)} as date) as varchar) as d, ${vzMedidaSql(m)} as y from ${vzFonte(v)} where ${vzId(eixo.col)} is not null group by 1 order by 1`);
  if (corpo._pedido !== pedido) return;
  const pts0 = linhas.filter(l => l.y != null);
  if (pts0.length < 2) { corpo.innerHTML = '<div class="ed-vazio-txt">são precisos pelo menos 2 dias com dados para calcular a tendência</div>'; return; }
  const dia = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  const x0 = dia(linhas[0].d), ultimo = dia(linhas[linhas.length - 1].d);
  // reta dos mínimos quadrados (y = a + b·x, x = dias desde o 1º dia) — a mesma conta da função TENDÊNCIA do Excel
  const pts = pts0.map(l => ({ x: dia(l.d) - x0, y: Number(l.y) }));
  const n = pts.length, sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const b = (n * sxx - sx * sx) ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0, a = (sy - b * sx) / n;
  const proj = vzF(v, 'tendencia', 'projetar', 'fim_mes');
  let fim = ultimo;
  if (proj === 'fim_mes') { const u = new Date(ultimo * 864e5); fim = Date.UTC(u.getUTCFullYear(), u.getUTCMonth() + 1, 0) / 864e5; }
  else if (proj === 'dias7') fim = ultimo + 7;
  else if (proj === 'dias30') fim = ultimo + 30;
  const dias = []; for (let d = x0; d <= fim; d++) dias.push(d);
  const porDia = Object.fromEntries(pts.map(p => [p.x + x0, p.y]));
  const real = dias.map(d => porDia[d] ?? null);
  const tend = dias.map(d => d <= ultimo ? a + b * (d - x0) : null);
  const futuro = dias.map(d => d >= ultimo && fim > ultimo ? a + b * (d - x0) : null);
  const rot = dias.map(d => { const dt = new Date(d * 864e5); return String(dt.getUTCDate()).padStart(2, '0') + '/' + String(dt.getUTCMonth() + 1).padStart(2, '0'); });
  const nf = vzFormatoNum(v, m), fmtV = x => vzFmt(x, nf.formato, nf.casas), t = vzTema();
  const valorFim = a + b * (fim - x0);
  corpo._exp = [['Data', 'Real', 'Tendência', 'Projeção'], ...rot.map((r, i) => [r, real[i], tend[i], futuro[i]])];
  corpo._tend = { a, b, valorFim, fim: rot[rot.length - 1] };
  const corTexto = vzF(v, 'texto', 'cor', null) || t.texto, tam = vzF(v, 'texto', 'tamanho', 11);
  const resumo = `${fim > ultimo ? `Projeção para ${rot[rot.length - 1]}: ${fmtV(valorFim)} · ` : ''}tendência ${b >= 0 ? '↑' : '↓'} ${fmtV(Math.abs(b))} por dia`;
  vzNovoGrafico(id, corpo).setOption({
    animation: false, color: [t.paleta[0], t.paleta[1], t.paleta[1]], textStyle: { fontFamily: 'IBM Plex Sans, sans-serif' },
    title: { text: resumo, left: 4, top: 0, textStyle: { color: corTexto, fontSize: tam, fontWeight: 500 } },
    legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 8, textStyle: { color: corTexto, fontSize: tam } },
    grid: { left: 8, right: 16, top: 30, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: x => x == null ? '—' : fmtV(x), backgroundColor: t.fundo, borderColor: t.grade, textStyle: { color: t.texto } },
    xAxis: { type: 'category', data: rot, axisLabel: { color: corTexto, fontSize: tam, hideOverlap: true }, axisLine: { lineStyle: { color: t.grade } }, axisTick: { show: false } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: corTexto, fontSize: tam, formatter: fmtV }, splitLine: { lineStyle: { color: t.grade } } },
    series: [
      { name: 'REAL', type: 'line', data: real, symbolSize: 7, lineStyle: { width: 2 }, connectNulls: false },
      { name: 'TENDÊNCIA', type: 'line', data: tend, symbol: 'none', lineStyle: { width: 2, type: 'dashed' } },
      { name: 'PROJEÇÃO', type: 'line', data: futuro, symbol: 'none', lineStyle: { width: 2, type: 'dotted' } },
    ],
  });
}

async function vzRenderReincidencia(id, v, corpo){
  const cs = v.campos || {}, chave = (cs.chave || [])[0], eixo = (cs.eixo || [])[0];
  if (!chave || !vzColuna(chave.col)) { corpo.innerHTML = '<div class="ed-vazio-txt">arraste a coluna que identifica quem volta (ex.: telefone, ID do cliente)</div>'; return; }
  if (!ed.dadosProntos) { corpo.innerHTML = '<div class="ed-vazio-txt">carregando dados…</div>'; return; }
  // data do contato: a escolhida; senão a coluna do dia da base; senão a 1ª coluna de data
  let dataCol = ((cs.data || [])[0] || {}).col;
  if (!dataCol) { const c = (ed.base.colunas || []).find(c => c.nome === ed.base.coluna_data) || (ed.base.colunas || []).find(c => c.manter && ['data_hora', 'data'].includes(c.tipo)); dataCol = c && c.nome; }
  if (!dataCol || !vzColuna(dataCol) || !['data', 'data_hora'].includes(vzColuna(dataCol).tipo)) { corpo.innerHTML = '<div class="ed-vazio-txt">falta uma coluna de data/hora do contato</div>'; return; }
  const janela = Number(vzF(v, 'reincidencia', 'janela', 7)) || 7;
  const pedido = (corpo._pedido || 0) + 1; corpo._pedido = pedido;
  try {
    // contato "reincidente" = a mesma pessoa já tinha um contato anterior até N dias antes (LAG = o contato anterior dela)
    const linhas = await estSql(`with b as (select ${vzId(chave.col)} as k, cast(${vzId(dataCol)} as timestamp) as t${eixo ? `, ${vzExprEixo(eixo.col)} as x` : ''}
          from ${vzFonte(v)} where ${vzId(chave.col)} is not null and ${vzId(dataCol)} is not null),
        o as (select *, lag(t) over (partition by k order by t) as ant from b)
      select ${eixo ? 'x, ' : ''}count(*) as total, count(*) filter (where ant is not null and date_diff('second', ant, t) <= ${janela * 86400}) as reinc
      from o${eixo ? ' group by x order by reinc * 1.0 / total desc, total desc limit 20' : ''}`);
    if (corpo._pedido !== pedido) return;
    const t = vzTema(), pct = r => r.total ? r.reinc / r.total : null;
    if (!eixo) {
      const r = linhas[0] || { total: 0, reinc: 0 };
      corpo._reinc = r;
      corpo._exp = [['Contatos', 'Reincidentes', '% reincidência', 'Janela (dias)'], [r.total, r.reinc, pct(r), janela]];
      corpo.innerHTML = `<div class="vz-card-valor">${estEsc(vzFmt(pct(r), 'porcentagem'))}</div>
        <div class="vz-card-rot">voltaram em até ${janela} dia(s) · ${estNum(r.reinc)} de ${estNum(r.total)} contatos</div>`;
      return;
    }
    const ce = vzColuna(eixo.col), rot = linhas.map(l => vzFmtEixo(l.x, ce.tipo));
    corpo._reinc = linhas;
    corpo._exp = [[ce.rotulo, 'Contatos', 'Reincidentes', '% reincidência'], ...linhas.map((l, i) => [rot[i], l.total, l.reinc, pct(l)])];
    const corTexto = vzF(v, 'texto', 'cor', null) || t.texto, tam = vzF(v, 'texto', 'tamanho', 11);
    vzNovoGrafico(id, corpo).setOption({
      animation: false, color: [t.paleta[0]], textStyle: { fontFamily: 'IBM Plex Sans, sans-serif' },
      title: { text: `% que voltou em até ${janela} dia(s)`, left: 4, top: 0, textStyle: { color: corTexto, fontSize: tam, fontWeight: 500 } },
      grid: { left: 8, right: 40, top: 26, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item', backgroundColor: t.fundo, borderColor: t.grade, textStyle: { color: t.texto }, formatter: p => `${rot[rot.length - 1 - p.dataIndex]}: ${vzFmt(p.value, 'porcentagem')} (${estNum(linhas[linhas.length - 1 - p.dataIndex].reinc)} de ${estNum(linhas[linhas.length - 1 - p.dataIndex].total)})` },
      xAxis: { type: 'value', axisLabel: { color: corTexto, fontSize: tam, formatter: x => vzFmt(x, 'porcentagem', 0) }, splitLine: { lineStyle: { color: t.grade } } },
      yAxis: { type: 'category', data: [...rot].reverse(), axisLabel: { color: corTexto, fontSize: tam }, axisTick: { show: false }, axisLine: { lineStyle: { color: t.grade } } },
      series: [{ type: 'bar', data: linhas.map(pct).reverse(), barMaxWidth: 22, itemStyle: { borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: corTexto, fontSize: tam, formatter: p => vzFmt(p.value, 'porcentagem') } }],
    });
  } catch (erro) {
    if (corpo._pedido === pedido) corpo.innerHTML = `<div class="vz-erro">Não foi possível calcular: ${estEsc(erro.message)}</div>`;
  }
}

/* ---------------- tabela dinâmica (como a do Excel) ---------------- */
// Ordem dos rótulos: números como números (1, 2, 10), texto em ordem alfabética; vazio por último
const vzOrdemRotulo = (a, b) => a === 'null' ? 1 : b === 'null' ? -1
  : (isNaN(a) || isNaN(b)) ? String(a).localeCompare(String(b), 'pt-BR') : Number(a) - Number(b);
// Uma consulta só, com GROUPING SETS: traz os valores de cada linha, de cada subtotal e do total geral.
// Assim média, % e média ponderada dos totais saem CERTAS (calculadas de novo), e não somadas.
async function vzRenderTabela(id, v, corpo, medidas, pedido){
  const campos = v.campos || {};
  const linItens = campos.linhas || [];
  const todasLin = linItens.map(i => i.col), colP = ((campos.colunas || [])[0] || {}).col;
  if (!todasLin.length && !colP) { corpo.innerHTML = '<div class="ed-vazio-txt">coloque uma coluna em Linhas (ex.: operador)</div>'; return; }
  // Modo "lista" (como as tabelas do Painel CSAT): agrupa só pela 1ª coluna de Linhas; as outras aparecem ao lado
  // como "informação" (o valor de uma linha do grupo — ex.: o supervisor do operador)
  const lista = vzF(v, 'tabela', 'layout', 'padrao') === 'lista';
  const lin = lista ? todasLin.slice(0, 1) : todasLin, infos = lista ? todasLin.slice(1) : [];
  const dims = lin.map((_, i) => `r${i}`);
  const expr = lin.map((c, i) => `${vzExprEixo(c)} as r${i}`).concat(infos.map((c, j) => `${vzExprEixo(c)} as x${j}`)).concat(colP ? [`${vzExprEixo(colP)} as c`] : []);
  const conjuntos = [];
  for (let k = lin.length; k >= 0; k--) {
    const pre = dims.slice(0, k);
    if (colP) conjuntos.push([...pre, 'c']);
    conjuntos.push(pre);
  }
  // sem a linha "vazio" (opção) e, numa coluna de horário em Colunas, sem a coluna "Sem horário"
  const onde = [];
  if (vzF(v, 'tabela', 'semVazio', false) && lin.length) onde.push(`${vzId(lin[0])} is not null`);
  if (colP && vzColuna(colP).tipo === 'hora') onde.push(`${vzId(colP)} is not null`);
  const sql = `select ${[...dims, ...(colP ? ['c'] : [])].join(', ')}${dims.length || colP ? ',' : ''}
      ${dims.map((d, i) => `grouping(${d}) as g${i}`).concat(colP ? ['grouping(c) as gc'] : []).join(', ')}${dims.length || colP ? ',' : ''}
      ${infos.map((_, j) => `any_value(x${j}) as x${j},`).join(' ')}
      ${medidas.map((m, i) => `${vzMedidaSql(m)} as m${i}`).join(', ')}
    from (select *, ${expr.join(', ')} from ${vzFonte(v)}${onde.length ? ' where ' + onde.join(' and ') : ''}) t
    group by grouping sets (${conjuntos.map(s => '(' + s.join(', ') + ')').join(', ')})`;
  const linhas = await estSql(sql);
  if (corpo._pedido !== pedido) return;
  // valores por caminho da linha ("JOAO|SUP X") e por coluna (valor de Colunas ou __total)
  const celulas = {}, colVals = new Set();
  for (const l of linhas) {
    const nivel = dims.filter((_, i) => l['g' + i] === 0).length;
    const caminho = dims.slice(0, nivel).map(d => String(l[d])).join('\u0001');
    const ck = colP && l.gc === 0 ? String(l.c) : '__total';
    if (ck !== '__total') colVals.add(ck);
    const cel = celulas[caminho] = celulas[caminho] || {};
    cel[ck] = medidas.map((_, i) => l['m' + i]);
    if (infos.length && ck === '__total') cel.__info = infos.map((_, j) => l['x' + j]);
  }
  const cTipo = colP ? vzColuna(colP).tipo : null;
  let cols = [...colVals].sort(vzOrdemRotulo);
  const LIM = 48; // até 48 colunas (as 48 meias horas do dia)
  const cortadas = cols.length > LIM ? cols.length - LIM : 0;
  if (cortadas) cols = cols.slice(0, LIM);
  corpo._tabela = { lin, infos, linItens, colP, cTipo, cols, cortadas, celulas, medidas };
  vzMontarTabela(id);
}
const vzNorm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
// Monta a tabela a partir do último cálculo (ordenar, recolher, buscar e trocar formatação não refazem a consulta).
// soTabela = só troca a tabela (a barra com a busca fica, para o cursor não sair do campo enquanto digita)
function vzMontarTabela(id, soTabela){
  const v = edVisual(id), corpo = vzCorpo(id);
  if (!v || !corpo || !corpo._tabela) return;
  const { lin, infos, linItens, colP, cTipo, cols, cortadas, celulas, medidas } = corpo._tabela;
  const lista = vzF(v, 'tabela', 'layout', 'padrao') === 'lista';
  const totLin = vzF(v, 'tabela', 'totalLinhas', true), totCol = vzF(v, 'tabela', 'totalColunas', true) && !!colP;
  const sub = vzF(v, 'tabela', 'subtotais', true), zebra = vzF(v, 'tabela', 'zebra', true);
  const corCab = vzF(v, 'tabela', 'cabecalho', null), corTexto = vzF(v, 'texto', 'cor', null), tam = vzF(v, 'texto', 'tamanho', null);
  const ordem = vzF(v, 'tabela', 'ordem', null);
  const valItens = ((v.campos || {}).valores || []).filter(it => it.tipo === 'col' || vzMedida(it.id));
  const nomeVal = i => (valItens[i] && valItens[i].rotulo) || medidas[i].nome;
  const nomeLin = (c, i) => (linItens.find(x => x.col === c) || {}).rotulo || vzColuna(c).rotulo;
  // Meta: a medida comparada com a meta (verde/vermelho) e a coluna Status (✓ Dentro / ! Fora da meta)
  const metaId = vzF(v, 'tabela', 'metaMedida', null);
  const mi = metaId == null ? -1 : typeof metaId === 'number' ? metaId : valItens.findIndex(it => it.tipo === 'medida' && it.id === metaId);
  const metaFundo = vzF(v, 'tabela', 'metaEstilo', 'texto') === 'fundo';
  const status = vzF(v, 'tabela', 'status', false) && mi >= 0 && !colP;
  // Número pequeno embaixo (ex.: "8 aval" sob o CSAT): essa medida não ganha coluna própria
  const si = vzF(v, 'tabela', 'subvalor', null), temSub = si != null && !!medidas[si];
  const vis = medidas.map((_, i) => i).filter(i => !(temSub && i === si));
  const nfOf = i => vzFormatoNum(v, medidas[i]);
  const fmtVal = (vals, i) => vals && vals[i] != null ? vzFmt(vals[i], nfOf(i).formato, nfOf(i).casas) : '';
  const classeMeta = (vals, i) => {
    if (i !== mi || !vals || vals[i] == null) return '';
    const ok = vzNaMeta(vals[i], nfOf(i).formato);
    return metaFundo ? (ok ? ' vz-meta-fundo-ok' : ' vz-meta-fundo-fora') : (ok ? ' vz-meta-ok' : ' vz-meta-fora');
  };
  const celula = (vals, i) => {
    if (temSub && i === vis[0]) {
      if (!vals || vals[i] == null) return '<td class="num vz-cel-vazia">–</td>';
      return `<td class="num vz-cel-sub${classeMeta(vals, i)}"><b>${estEsc(fmtVal(vals, i))}</b><small>${estEsc(fmtVal(vals, si))} ${estEsc(nomeVal(si))}</small></td>`;
    }
    return `<td class="num${classeMeta(vals, i)}">${estEsc(fmtVal(vals, i))}</td>`;
  };
  const colunasMostradas = (colP ? cols : []).concat(totCol || !colP ? ['__total'] : []);
  const etiqueta = caminho => vzEtiquetaMeta(vzNaMeta(((celulas[caminho] || {}).__total || [])[mi], nfOf(mi).formato));
  const celulasLinha = caminho => colunasMostradas.map(ck => vis.map(i => celula((celulas[caminho] || {})[ck], i)).join('')).join('') + (status ? `<td>${etiqueta(caminho)}</td>` : '');
  // filhos de um caminho, na ordem escolhida (clique no título do valor) ou pelo rótulo
  const filhos = (prefixo, nivel) => {
    const lista = Object.keys(celulas).filter(k => k && k.split('\u0001').length === nivel + 1 && (nivel === 0 || k.startsWith(prefixo + '\u0001')));
    return lista.sort((a, b) => {
      if (ordem) {
        const va = ((celulas[a] || {}).__total || [])[ordem.i], vb = ((celulas[b] || {}).__total || [])[ordem.i];
        const d = (Number(va) || 0) - (Number(vb) || 0);
        if (d) return ordem.dir === 'asc' ? d : -d;
      }
      return vzOrdemRotulo(a.split('\u0001')[nivel], b.split('\u0001')[nivel]);
    });
  };
  const horaFaixa = vzF(v, 'tabela', 'horaFaixa', false);
  const fmtRot = (valor, c) => {
    const tipo = vzColuna(c).tipo, txt = vzFmtEixo(valor, tipo);
    if (horaFaixa && tipo === 'hora' && valor != null) { const m = (+txt.slice(0, 2) * 60 + +txt.slice(3, 5) + 30) % 1440; return `${txt} – ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
    return txt;
  };
  const rotulo = (caminho, nivel) => { const p = caminho.split('\u0001')[nivel]; return fmtRot(p === 'null' ? null : p, lin[nivel]); };
  const infoTxt = (caminho, j) => { const x = ((celulas[caminho] || {}).__info || [])[j]; return x == null ? '' : vzFmtEixo(x, vzColuna(infos[j]).tipo); };
  // Busca e "situação" (Na meta / Fora da meta / Com X), como na tabela de operadores do painel — só na tela
  const estado = (ed.tabEstado = ed.tabEstado || {})[id] = (ed.tabEstado || {})[id] || {};
  const q = vzNorm(estado.busca || '').trim();
  const passa = caminho => {
    const vals = (celulas[caminho] || {}).__total || [];
    if (q && !vzNorm([rotulo(caminho, 0), ...infos.map((_, j) => infoTxt(caminho, j))].join(' ')).includes(q)) return false;
    if (estado.situacao === 'IN') return mi >= 0 && vzNaMeta(vals[mi], nfOf(mi).formato) === true;
    if (estado.situacao === 'OUT') return mi >= 0 && vzNaMeta(vals[mi], nfOf(mi).formato) === false;
    if (estado.situacao && estado.situacao[0] === 'c') return Number(vals[+estado.situacao.slice(1)]) > 0;
    return true;
  };
  ed.recolhidos = ed.recolhidos || new Set();
  let corpoHtml = '', n = 0;
  const grupos = corpo._tabela.grupos = []; // o botão +/− guarda só o número do grupo (nomes podem ter aspas etc.)
  if (lista) {
    for (const k of filhos('', 0).filter(passa)) {
      corpoHtml += `<tr class="${zebra && n++ % 2 ? 'vz-zebra' : ''}"><td class="vz-rot vz-forte">${estEsc(rotulo(k, 0))}</td>${infos.map((_, j) => `<td class="vz-fraco">${estEsc(infoTxt(k, j))}</td>`).join('')}${celulasLinha(k)}</tr>`;
    }
  } else {
    const desce = (prefixo, nivel) => {
      for (const k of filhos(prefixo, nivel)) {
        if (nivel === 0 && !passa(k)) continue;
        const ehGrupo = nivel < lin.length - 1, fechado = ed.recolhidos.has(id + '|' + k);
        const valores = ehGrupo && !sub ? colunasMostradas.map(() => vis.map(() => '<td></td>').join('')).join('') + (status ? '<td></td>' : '') : celulasLinha(k);
        corpoHtml += `<tr class="${ehGrupo ? 'vz-grupo' : ''} ${zebra && n++ % 2 ? 'vz-zebra' : ''}"><td class="vz-rot" style="padding-left:${8 + nivel * 16}px">`
          + (ehGrupo ? `<button class="vz-abre" onclick="vzAlternarGrupo('${id}', ${grupos.push(k) - 1})">${fechado ? '+' : '−'}</button>` : '')
          + `${estEsc(rotulo(k, nivel))}</td>${valores}</tr>`;
        if (ehGrupo && !fechado) desce(k, nivel + 1);
      }
    };
    if (lin.length) desce('', 0);
  }
  if (!corpoHtml && lin.length) corpoHtml = `<tr><td colspan="${1 + infos.length + colunasMostradas.length * vis.length + (status ? 1 : 0)}" class="vz-sem-linhas">Nenhum resultado para os filtros escolhidos.</td></tr>`;
  if (totLin || !lin.length) corpoHtml += `<tr class="vz-total"><td class="vz-rot">${lin.length ? 'Total geral' : 'Total'}</td>${infos.map(() => '<td></td>').join('')}${celulasLinha('')}</tr>`;
  // Exportar Excel: todas as linhas (inclusive as de grupos recolhidos). Linha de subtotal = colunas de níveis abaixo em branco.
  const nomeCol = ck => ck === '__total' ? 'Total' : vzFmtEixo(ck === 'null' ? null : ck, cTipo);
  const exp = [[...lin.map((c, i) => nomeLin(c, i)), ...infos.map((c, j) => nomeLin(c, j + 1)), ...colunasMostradas.flatMap(ck => medidas.map((m, i) => (colP ? nomeCol(ck) + ' · ' : '') + nomeVal(i))), ...(status ? ['Status'] : [])]];
  const valoresExp = caminho => colunasMostradas.flatMap(ck => medidas.map((_, i) => vzNumExp(((celulas[caminho] || {})[ck] || [])[i])))
    .concat(status ? [vzNaMeta(((celulas[caminho] || {}).__total || [])[mi], nfOf(mi).formato) ? 'Dentro da meta' : 'Fora da meta'] : []);
  const desceExp = (prefixo, nivel) => {
    for (const k of filhos(prefixo, nivel)) {
      if (nivel === 0 && !passa(k)) continue;
      exp.push([...lin.map((_, j) => j <= nivel ? rotulo(k, j) : ''), ...infos.map((_, j) => infoTxt(k, j)), ...valoresExp(k)]);
      if (nivel < lin.length - 1) desceExp(k, nivel + 1);
    }
  };
  if (lin.length) desceExp('', 0);
  if (totLin) exp.push([...(lin.length ? ['Total geral', ...lin.slice(1).map(() => '')] : []), ...infos.map(() => ''), ...valoresExp('')]);
  corpo._exp = exp;
  const seta = i => ordem && ordem.i === i ? (ordem.dir === 'asc' ? ' ▲' : ' ▼') : '';
  const thMedidas = () => vis.map(i => `<th class="num vz-ord" onclick="vzOrdenarTabela('${id}', ${i})" title="Ordenar por ${estEsc(nomeVal(i))}">${estEsc(nomeVal(i))}${seta(i)}</th>`).join('');
  const thLinhas = lista
    ? lin.map((c, i) => `<th class="vz-rot">${estEsc(nomeLin(c, i))}</th>`).join('') + infos.map((c, j) => `<th>${estEsc(nomeLin(c, j + 1))}</th>`).join('')
    : `<th class="vz-rot" ${colP && vis.length > 1 ? 'rowspan="2"' : ''}>${lin.map((c, i) => estEsc(nomeLin(c, i))).join(' › ')}</th>`;
  const thStatus = status ? '<th>Status</th>' : '';
  const nomeColTh = ck => ck === '__total' ? 'Total' : estEsc(vzFmtEixo(ck === 'null' ? null : ck, cTipo));
  const cabecalho = colP
    ? (vis.length > 1
      ? `<tr>${thLinhas}${colunasMostradas.map(ck => `<th colspan="${vis.length}" class="vz-th-col">${nomeColTh(ck)}</th>`).join('')}</tr><tr>${colunasMostradas.map(() => thMedidas()).join('')}</tr>`
      : `<tr>${thLinhas}${colunasMostradas.map(ck => `<th class="num vz-th-col ${ck === '__total' ? 'vz-ord' : ''}" ${ck === '__total' ? `onclick="vzOrdenarTabela('${id}', ${vis[0]})"` : ''}>${nomeColTh(ck)}${ck === '__total' ? seta(vis[0]) : ''}</th>`).join('')}</tr>`)
    : `<tr>${thLinhas}${thMedidas()}${thStatus}</tr>`;
  const estilo = (corTexto ? `color:${corTexto};` : '') + (tam ? `font-size:calc(${tam}px * var(--escala-fonte));` : '') + (corCab ? `--vz-cab:${corCab};` : '');
  const tabela = `<table><thead>${cabecalho}</thead><tbody>${corpoHtml}</tbody></table>
    ${cortadas ? `<div class="vz-aviso">Mostrando as ${48} primeiras colunas (${cortadas} a mais ficaram de fora).</div>` : ''}`;
  if (soTabela && corpo.querySelector('.vz-tabela')) { corpo.querySelector('.vz-tabela').innerHTML = tabela; return; }
  // Barra acima da tabela: situação, Extrair (base do Painel CSAT) e busca
  const busca = vzF(v, 'tabela', 'busca', null), situacao = vzF(v, 'tabela', 'situacao', null), extrair = vzF(v, 'tabela', 'extrair', false) && ed.base.fonte === 'csat';
  const barra = busca || situacao || extrair ? `<div class="vz-tab-barra">
      ${situacao ? `<select class="vz-tab-sel" onchange="vzTabSituacao('${id}', this.value)">
        ${[['', 'Todos'], ...(mi >= 0 ? [['IN', 'Na meta'], ['OUT', 'Fora da meta']] : []), ...(Array.isArray(situacao) ? situacao : []).map(s => ['c' + s.i, s.rotulo])].map(([k, r]) => `<option value="${k}" ${(estado.situacao || '') === k ? 'selected' : ''}>${estEsc(r)}</option>`).join('')}</select>` : ''}
      ${extrair ? `<button class="btn btn-danger-ghost btn-small" onclick="vzExtrairCsat('D', '${id}')">Extrair detratores</button><button class="btn btn-ghost btn-small" onclick="vzExtrairCsat('P', '${id}')">Extrair promotores</button>` : ''}
      ${busca ? `<div class="vz-tab-busca">${edIcone('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>', 15)}<input type="text" value="${estEsc(estado.busca || '')}" placeholder="${estEsc(typeof busca === 'string' ? busca : 'Buscar...')}" oninput="vzTabBusca('${id}', this.value)"></div>` : ''}
    </div>` : '';
  corpo.innerHTML = `${barra}<div class="vz-tabela" style="${estilo}">${tabela}</div>`;
}
function vzTabBusca(id, txt){ ((ed.tabEstado = ed.tabEstado || {})[id] = ed.tabEstado[id] || {}).busca = txt; vzMontarTabela(id, true); }
function vzTabSituacao(id, val){ ((ed.tabEstado = ed.tabEstado || {})[id] = ed.tabEstado[id] || {}).situacao = val; vzMontarTabela(id, true); }

// Extrair detratores/promotores (base ligada ao Painel CSAT): a lista com o ID da conversa vem do servidor,
// com os mesmos filtros da tela (igual ao botão do painel em código)
async function vzExtrairCsat(tipo){
  const nome = { P: 'PROMOTOR', D: 'DETRATOR' }[tipo];
  // escolha atual de cada filtro (pela coluna), já sem os "Sem ..." (vazio no banco)
  const pega = col => { for (const g of ed.def.guias) for (const x of g.visuais) { if (x.tipo !== 'filtro' || ((x.campos || {}).coluna || [])[0]?.col !== col) continue; const st = (ed.filtros || {})[vzChaveFiltro(x)]; if (st) return st; } return null; };
  const vals = (col, sem) => { const st = pega(col); return st && st.vals && st.vals.length ? st.vals.map(v => v === sem ? '' : v) : null; };
  let locais = vals('local', 'Sem local');
  const eps = vals('eps', 'Sem local');
  if (eps) {
    // EPS e Local viram uma única lista de locais permitidos (igual ao painel)
    const todos = (await estSql("select distinct local, eps from dados")).filter(r => eps.includes(r.eps === 'Sem local' ? '' : r.eps));
    const permitidos = todos.map(r => r.local === 'Sem local' ? '' : r.local);
    locais = locais ? locais.filter(l => permitidos.includes(l)) : permitidos;
    if (!locais.length) { showToast(`Nenhuma avaliação ${nome} para os filtros atuais.`, 'erro'); return; }
  }
  const stData = pega('data'), stHora = pega('hora');
  let datas = stData && stData.vals && stData.vals.length ? stData.vals.map(String) : null;
  if (stData && (stData.de || stData.ate)) datas = (await estSql(`select distinct cast(data as varchar) d from dados where data >= date '${stData.de || '1900-01-01'}' and data <= date '${stData.ate || '2999-12-31'}'`)).map(r => r.d);
  const intervalos = stHora && stHora.vals && stHora.vals.length ? stHora.vals.map(h => h == null ? -1 : +String(h).slice(0, 2) * 60 + +String(h).slice(3, 5)) : null;
  try {
    const [, lista] = await Promise.all([carregarLib(LIB_PLANILHA), estApi('POST', '/api/csat/detalhe', {
      mes: ed.csatMes, tipo, operacoes: vals('operacao', 'Sem operação'), supervisores: vals('supervisor', 'Sem supervisor'), locais, datas, intervalos,
    })]);
    if (!lista.length) { showToast(`Nenhuma avaliação ${nome} para os filtros atuais.`, 'erro'); return; }
    const linhas = lista.map(r => ({ 'ID da conversa': r.id, 'Data': r.data, 'Intervalo (30 min)': r.hora || 'Sem horário', 'Operador': r.op, 'Supervisor': r.sup,
      'Operação': r.oper, 'Local': r.loc, 'Nota (1 a 5)': r.nota, 'Classificação': nome }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Base_' + nome);
    const arquivo = `Base_${nome}_CSAT_${ed.csatMes}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    ed.ultimaExtracao = { arquivo, linhas: linhas.length }; // usado pelos testes automáticos
    XLSX.writeFile(wb, arquivo);
  } catch (erro) { showToast(erro.message, 'erro'); }
}
function vzAlternarGrupo(id, n){
  const k = id + '|' + vzCorpo(id)._tabela.grupos[n];
  ed.recolhidos.has(k) ? ed.recolhidos.delete(k) : ed.recolhidos.add(k);
  vzMontarTabela(id);
}
// Clique no título de um valor: ordena (maior → menor, depois menor → maior, depois sem ordem)
function vzOrdenarTabela(id, i){
  const v = edVisual(id), atual = vzF(v, 'tabela', 'ordem', null);
  const nova = !atual || atual.i !== i ? { i, dir: 'desc' } : atual.dir === 'desc' ? { i, dir: 'asc' } : null;
  edMudar(() => { v.formato = v.formato || {}; v.formato.tabela = v.formato.tabela || {}; if (nova) v.formato.tabela.ordem = nova; else delete v.formato.tabela.ordem; });
  vzMontarTabela(id);
}

/* ---------------- filtros (segmentações) · etapa E2d ----------------
   Um visual do tipo "filtro" mostra os valores de uma coluna; o que a pessoa escolher vale para os
   outros visuais da guia (ou do relatório inteiro, se escolhido na aba Formatar).
   A escolha fica só na tela (ed.filtros), como no Power BI ao abrir o relatório: começa sem filtro.
   Filtros "sincronizados" (mesma chave em guias diferentes, ex.: a faixa de filtros repetida em cada guia)
   dividem a mesma escolha — como o "sincronizar segmentações" do Power BI. */
const vzNumExp = x => (typeof x === 'bigint' ? Number(x) : x == null ? null : x);
const vzChaveFiltro = x => vzF(x, 'filtro', 'sinc', null) || x.id;
const vzVisualEmQualquerGuia = id => { for (const g of ed.def.guias) { const v = g.visuais.find(x => x.id === id); if (v) return v; } return null; };
const vzChaveDoId = id => { const v = vzVisualEmQualquerGuia(id); return v ? vzChaveFiltro(v) : id; };
// Filtros que o visual ignora: os marcados na aba Formatar + os do eixo alternativo ativo (ex.: Intraday ignora DATA)
function vzIgnorados(v){
  const ig = new Set(vzF(v, 'filtros', 'ignorar', []) || []);
  const eixo = ((v.campos || {}).eixo || [])[typeof vzEixoAtivo === 'function' ? vzEixoAtivo(v) : 0];
  if (eixo && eixo.ignora) eixo.ignora.forEach(k => ig.add(k));
  return ig;
}
// Filtros que valem para o visual v (nunca o próprio filtro nem os ligados a ele: assim a lista dele continua completa)
function vzFiltrosDe(v){
  const lista = [], vistos = new Set(), ig = vzIgnorados(v), minha = v.tipo === 'filtro' ? vzChaveFiltro(v) : null;
  for (const g of ed.def.guias) for (const x of g.visuais) {
    if (x.tipo !== 'filtro' || x.id === v.id) continue;
    const k = vzChaveFiltro(x);
    if (k === minha || vistos.has(k) || ig.has(k) || ig.has(x.id) || !ed.filtros || !ed.filtros[k]) continue;
    if (g.id === ed.guia || vzF(x, 'filtro', 'alcance', 'guia') === 'relatorio') { lista.push(x); vistos.add(k); }
  }
  return lista;
}
function vzCondFiltro(x){
  const st = ed.filtros[vzChaveFiltro(x)], it = ((x.campos || {}).coluna || [])[0];
  if (!st || !it || !vzColuna(it.col)) return null;
  const conds = [];
  if (st.de) conds.push(`cast(${vzId(it.col)} as date) >= date '${st.de}'`);
  if (st.ate) conds.push(`cast(${vzId(it.col)} as date) <= date '${st.ate}'`);
  if (st.vals && st.vals.length) {
    // vazio (ex.: "Sem horário") também pode ser escolhido: vira "é vazio"
    const exp = vzExprEixo(it.col), vals = st.vals.filter(v => v != null), partes = [];
    if (vals.length) partes.push(`${exp} in (${vals.map(v => typeof v === 'number' || typeof v === 'bigint' ? String(v) : estSqlTexto(String(v))).join(', ')})`);
    if (st.vals.some(v => v == null)) partes.push(`${exp} is null`);
    conds.push('(' + partes.join(' or ') + ')');
  }
  return conds.length ? conds.join(' and ') : null;
}
// De onde o visual lê: a visão "dados" inteira ou só as linhas que passam nos filtros
function vzFonte(v){
  // Faixas de 30 min: só os visuais que usam a coluna da faixa leem a visão cruzada (senão cada pessoa contaria 48 vezes)
  const faixa = vzUsaFaixa(v), visao = faixa ? 'dados_faixa' : 'dados';
  const conds = vzFiltrosDe(v).map(vzCondFiltro).filter(c => c && (faixa || !c.includes('"fx__')));
  return conds.length ? `(select * from ${visao} where ${conds.map(c => '(' + c + ')').join(' and ')}) as dados` : (faixa ? 'dados_faixa as dados' : 'dados');
}
// Rótulo de um valor na lista do filtro (data completa dd/mm/aaaa, como no Painel CSAT)
function vzRotuloFiltro(v, tipo){
  if (v != null && (tipo === 'data' || tipo === 'data_hora')) { const s = String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s; }
  return vzFmtEixo(v, tipo);
}
async function vzRenderFiltro(id, v, corpo){
  const it = ((v.campos || {}).coluna || [])[0];
  if (!it || !vzColuna(it.col)) { corpo.innerHTML = edCorpoVazio(v); return; }
  if (!ed.dadosProntos) { corpo.innerHTML = '<div class="ed-vazio-txt">carregando dados…</div>'; return; }
  const c = vzColuna(it.col), st = (ed.filtros || {})[vzChaveFiltro(v)] || {};
  const compacto = vzF(v, 'filtro', 'estilo', 'normal') === 'compacto';
  // cascata = a lista mostra só os valores que sobram com os outros filtros; sem cascata = todos os valores (como no Painel CSAT)
  const fonte = vzF(v, 'filtro', 'cascata', true) ? vzFonte(v) : 'dados';
  const pedido = (corpo._pedido || 0) + 1; corpo._pedido = pedido;
  corpo.classList.toggle('vz-corpo-compacto', compacto);
  try {
    if ((c.tipo === 'data' || c.tipo === 'data_hora') && vzF(v, 'filtro', 'modo', 'intervalo') !== 'lista') {
      const r = (await estSql(`select cast(min(cast(${vzId(c.nome)} as date)) as varchar) a, cast(max(cast(${vzId(c.nome)} as date)) as varchar) b from ${fonte}`))[0];
      if (corpo._pedido !== pedido) return;
      corpo.innerHTML = `<div class="vz-filtro vz-filtro-data">
        <label>De <input type="date" value="${st.de || ''}" min="${r.a || ''}" max="${r.b || ''}" onchange="vzFiltroData('${id}', 'de', this.value)"></label>
        <label>Até <input type="date" value="${st.ate || ''}" min="${r.a || ''}" max="${r.b || ''}" onchange="vzFiltroData('${id}', 'ate', this.value)"></label>
        ${st.de || st.ate ? `<button class="vz-filtro-limpar" onclick="vzLimparFiltro('${id}')" title="Limpar o filtro">×</button>` : ''}</div>`;
      return;
    }
    const linhas = await estSql(`select ${vzExprEixo(c.nome)} as v, count(*) as n from ${fonte} group by 1 order by 1 nulls last limit 1000`);
    if (corpo._pedido !== pedido) return;
    corpo._valores = linhas.map(l => ({ v: vzNumExp(l.v), n: Number(l.n) }));
    const sel = st.vals || [];
    const todos = vzF(v, 'filtro', 'todos', 'Todos');
    const resumo = !sel.length ? todos : sel.length === 1 ? vzRotuloFiltro(sel[0], c.tipo) : `${sel.length} selecionados`;
    corpo.innerHTML = `<div class="vz-filtro ${compacto ? 'vz-filtro-compacto' : ''}"><button class="vz-filtro-btn ${sel.length ? 'ativo' : ''}" onclick="vzAbrirListaFiltro('${id}', this)" title="${estEsc(c.rotulo)}">
        <span>${estEsc(resumo)}</span>${edIcone('<path d="M6 9l6 6 6-6"/>', 14)}</button>
      ${sel.length && !compacto ? `<button class="vz-filtro-limpar" onclick="vzLimparFiltro('${id}')" title="Limpar o filtro">×</button>` : ''}</div>`;
  } catch (erro) {
    if (corpo._pedido === pedido) corpo.innerHTML = `<div class="vz-erro">Não foi possível montar o filtro: ${estEsc(erro.message)}</div>`;
  }
}
function vzAplicarFiltros(){ vzRenderTodos(); if (typeof edAtualizarLimpar === 'function') edAtualizarLimpar(); }
function vzFiltroData(id, k, val){
  ed.filtros = ed.filtros || {};
  const chave = vzChaveDoId(id), st = ed.filtros[chave] = ed.filtros[chave] || {};
  if (val) st[k] = val; else delete st[k];
  if (!st.de && !st.ate) delete ed.filtros[chave];
  vzAplicarFiltros();
}
function vzLimparFiltro(id){ if (ed.filtros) delete ed.filtros[vzChaveDoId(id)]; vzFecharListaFiltro(); vzAplicarFiltros(); }
function vzLimparTodosFiltros(){ ed.filtros = {}; vzFecharListaFiltro(); vzAplicarFiltros(); }
const vzTemFiltro = () => !!ed.filtros && Object.keys(ed.filtros).length > 0;
// Lista de valores com caixinhas (abre embaixo do botão do filtro)
function vzAbrirListaFiltro(id, botao){
  vzFecharListaFiltro();
  const corpo = vzCorpo(id), v = edVisual(id), c = vzColuna(v.campos.coluna[0].col);
  const multipla = vzF(v, 'filtro', 'multipla', true);
  const pop = document.createElement('div');
  pop.id = 'vz-filtro-pop'; pop.className = 'vz-filtro-pop'; pop.dataset.vis = id; pop.dataset.chave = vzChaveFiltro(v);
  const r = botao.getBoundingClientRect();
  pop.style.left = Math.min(r.left, window.innerWidth - 290) + 'px';
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - 330) + 'px';
  pop.innerHTML = `<input class="ed-inp" type="search" placeholder="Buscar…" oninput="vzRenderListaFiltro()">
    <div class="vz-filtro-acoes">${multipla ? `<button onclick="vzMarcarTodosFiltro(true)">Marcar visíveis</button>` : ''}<button onclick="vzLimparFiltro('${id}')">Limpar seleção</button></div>
    <div class="vz-filtro-itens"></div>`;
  edEl('ed-overlay').appendChild(pop);
  pop._c = c; pop._multipla = multipla; pop._valores = corpo._valores || [];
  vzRenderListaFiltro();
  pop.querySelector('input').focus();
  setTimeout(() => document.addEventListener('mousedown', vzFecharListaFora, true), 0);
}
function vzRenderListaFiltro(){
  const pop = edEl('vz-filtro-pop'); if (!pop) return;
  const sel = ((ed.filtros || {})[pop.dataset.chave] || {}).vals || [];
  const digitado = (pop.querySelector('input').value || '').trim();
  const q = digitado ? estSlug(digitado) : ''; // estSlug('') devolve um nome padrão: só normaliza quando há texto
  const chave = x => x == null ? 'z' : typeof x === 'number' ? 'n' + x : 's' + String(x);
  const marcados = new Set(sel.map(chave));
  pop._visiveis = pop._valores.map((x, i) => ({ ...x, i })).filter(x => !q || estSlug(vzRotuloFiltro(x.v, pop._c.tipo)).includes(q));
  pop.querySelector('.vz-filtro-itens').innerHTML = pop._visiveis.map(x => `<label class="vz-filtro-item">
      <input type="${pop._multipla ? 'checkbox' : 'radio'}" name="vzf" ${marcados.has(chave(x.v)) ? 'checked' : ''} onchange="vzMarcarFiltro(${x.i}, this.checked)">
      <span>${estEsc(vzRotuloFiltro(x.v, pop._c.tipo))}</span><span class="vz-filtro-n">${estNum(x.n)}</span></label>`).join('') || '<div class="ed-info">Nada encontrado.</div>';
}
function vzMarcarFiltro(i, marcado){
  const pop = edEl('vz-filtro-pop'), chaveF = pop.dataset.chave, val = pop._valores[i].v;
  ed.filtros = ed.filtros || {};
  const st = ed.filtros[chaveF] = ed.filtros[chaveF] || {};
  const igual = x => x === val || (x != null && val != null && String(x) === String(val));
  if (!pop._multipla) st.vals = marcado ? [val] : [];
  else st.vals = marcado ? [...(st.vals || []).filter(x => !igual(x)), val] : (st.vals || []).filter(x => !igual(x));
  if (!st.vals.length) delete ed.filtros[chaveF];
  vzAplicarFiltros();
  if (!pop._multipla) vzFecharListaFiltro();
}
function vzMarcarTodosFiltro(){
  const pop = edEl('vz-filtro-pop'), chaveF = pop.dataset.chave;
  ed.filtros = ed.filtros || {};
  ed.filtros[chaveF] = { vals: pop._visiveis.map(x => x.v) };
  if (!ed.filtros[chaveF].vals.length) delete ed.filtros[chaveF];
  vzRenderListaFiltro(); vzAplicarFiltros();
}
function vzFecharListaFora(e){ const pop = edEl('vz-filtro-pop'); if (pop && !pop.contains(e.target) && !e.target.closest('.vz-filtro-btn')) vzFecharListaFiltro(); }
function vzFecharListaFiltro(){
  const pop = edEl('vz-filtro-pop'); if (pop) pop.remove();
  document.removeEventListener('mousedown', vzFecharListaFora, true);
}

/* ---------------- exportar para Excel · etapa E2d ----------------
   Uma aba da planilha por visual da guia aberta (com os filtros aplicados), mais uma aba "Sobre". */
async function vzExportar(){
  try {
    await carregarLib(LIB_PLANILHA);
    const guia = edGuiaAtual();
    const visuais = [...guia.visuais].sort((a, b) => a.y - b.y || a.x - b.x).filter(v => v.tipo !== 'filtro' && (vzCorpo(v.id) || {})._exp);
    if (!visuais.length) { showToast('Nenhum visual com dados para exportar nesta guia.', 'erro'); return; }
    const wb = XLSX.utils.book_new(), usados = new Set();
    const nomeAba = t => {
      let base = String(t || 'VISUAL').replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 28) || 'VISUAL', n = base, i = 2;
      while (usados.has(n.toUpperCase())) n = base.slice(0, 25) + ' (' + i++ + ')';
      usados.add(n.toUpperCase()); return n;
    };
    const filtros = [], vistos = new Set();
    for (const g of ed.def.guias) for (const x of g.visuais) {
      const k = x.tipo === 'filtro' ? vzChaveFiltro(x) : null;
      if (!k || vistos.has(k) || !ed.filtros || !ed.filtros[k] || !(g.id === ed.guia || vzF(x, 'filtro', 'alcance', 'guia') === 'relatorio')) continue;
      vistos.add(k);
      const st = ed.filtros[k], c = vzColuna(x.campos.coluna[0].col);
      filtros.push([c.rotulo, st.vals ? st.vals.map(v => vzRotuloFiltro(v, c.tipo)).join('; ') : `${st.de ? 'de ' + estDataBr(st.de) : ''} ${st.ate ? 'até ' + estDataBr(st.ate) : ''}`.trim()]);
    }
    const sobre = [['Relatório', ed.rel.nome], ['Guia', guia.nome], ['Base', ed.base.nome], ['Exportado em', new Date().toLocaleString('pt-BR')], [], ['Filtros aplicados', filtros.length ? '' : 'nenhum'], ...filtros];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sobre), 'Sobre');
    for (const v of visuais) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vzCorpo(v.id)._exp), nomeAba(v.titulo));
    const arquivo = `${ed.rel.nome} - ${guia.nome}.xlsx`.replace(/[\\/:*?"<>|]/g, ' ');
    ed.ultimaExportacao = { arquivo, abas: wb.SheetNames.slice(), wb }; // usado pelos testes automáticos
    XLSX.writeFile(wb, arquivo);
    showToast(`Planilha ${arquivo} gerada (${visuais.length} visual(is)).`);
  } catch (erro) {
    showToast('Não foi possível exportar: ' + erro.message, 'erro');
  }
}

/* ---------------- aba Formatar ---------------- */
// Tudo fica em v.formato[seção][opção]. Opção apagada (null) = volta ao automático (cores do tema etc.).
// Seções: titulo · fundo · numero · texto · card · grafico · tabela
// Vários visuais selecionados: a mudança vale para todos os que têm aquela opção
// (título, fundo, borda e texto valem para qualquer tipo; as opções de um tipo, só para os do mesmo tipo)
const VZ_SEC_COMUNS = ['titulo', 'fundo', 'texto'];
function vzAlvosFmt(id, sec){
  const sel = typeof edSelecionados === 'function' ? edSelecionados() : [];
  if (sel.length < 2 || !sel.includes(id) || sec === 'filtros') return [id];
  const tipo = edVisual(id).tipo;
  return sel.filter(x => { const v = edVisual(x); return v && (VZ_SEC_COMUNS.includes(sec) || (sec === 'numero' ? v.tipo !== 'filtro' : v.tipo === tipo)); });
}
function vzFmtSet(id, sec, k, val){
  const alvos = vzAlvosFmt(id, sec);
  edMudar(() => alvos.forEach(x => {
    const v = edVisual(x);
    v.formato = v.formato || {};
    const s = v.formato[sec] = v.formato[sec] || {};
    if (val === null || val === '' || (typeof val === 'number' && isNaN(val))) delete s[k]; else s[k] = Array.isArray(val) ? val.slice() : val;
    if (!Object.keys(s).length) delete v.formato[sec];
    if (!Object.keys(v.formato).length) delete v.formato;
  }));
  alvos.forEach(x => vzFmtRedesenhar(x, sec, k));
  if (val === null || ['sub', 'layout', 'borda'].includes(k)) edRenderProps(); // botão "Auto" e opções que mostram/escondem outras
}
// Redesenha só o necessário depois de mudar uma opção de formatação
function vzFmtRedesenhar(id, sec, k){
  const v = edVisual(id);
  if (sec === 'titulo' || sec === 'fundo') edAplicarMoldura(id); // só a caixa muda: não precisa recalcular os dados
  else if (v.tipo === 'filtro') { vzRenderTodos(); edAplicarMoldura(id); } // mudou o alcance/ligação do filtro: recalcula todos
  else if (sec === 'filtros' || (sec === 'tabela' && ['layout', 'semVazio'].includes(k))) vzRender(id); // muda a consulta
  else if (v.tipo === 'tabela' && (vzCorpo(id) || {})._tabela) vzMontarTabela(id); // tabela: só redesenha, sem nova consulta
  else { vzRender(id); if (sec === 'card') edAplicarMoldura(id); }
}
// Lados da borda: t (cima) · d (direita) · b (baixo) · e (esquerda). Padrão = todos; "-" = nenhum
function vzFmtLado(id, lado){
  const atual = vzF(edVisual(id), 'fundo', 'lados', 'tdbe').replace('-', '');
  const novo = 'tdbe'.split('').filter(l => (l === lado) !== atual.includes(l)).join('');
  vzFmtSet(id, 'fundo', 'lados', novo === 'tdbe' ? null : (novo || '-'));
  if (novo && !vzF(edVisual(id), 'fundo', 'borda', true)) vzFmtSet(id, 'fundo', 'borda', null); // ligar um lado liga a borda
  edRenderProps();
}
function vzFmtCor(id, sec, k, i, val){ // cor de uma série (lista de cores) — com vários selecionados, a lista do principal vai para todos
  const v = edVisual(id), lista = [...(vzF(v, 'grafico', 'cores', []) || [])];
  lista[i] = val; for (let j = 0; j < lista.length; j++) if (!lista[j]) lista[j] = null;
  while (lista.length && !lista[lista.length - 1]) lista.pop();
  vzFmtSet(id, sec, k, lista.length ? lista : null);
}

/* ---------------- paleta de cores (como a do Excel) ----------------
   Um botão mostra a cor atual; ao clicar abre a paleta: Automático, cores do tema (10 cores × 6 tons),
   cores padrão, cores recentes, código #hex e "Mais cores…" (o seletor completo do navegador). */
const VZ_CORES_BASE = ['#ffffff', '#1a1b23', '#666879', '#c9793f', '#d95926', '#3987e5', '#199e70', '#c98500', '#d55181', '#9085e9'];
const VZ_CORES_PADRAO = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0'];
const VZ_CORES_RECENTES = 'dashbi-cores-recentes';
// Mistura uma cor com branco (p > 0, clareia) ou preto (p < 0, escurece)
function vzMisturar(hex, p){
  const n = parseInt(hex.slice(1), 16), alvo = p > 0 ? 255 : 0, f = Math.abs(p);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(x => Math.round(x + (alvo - x) * f));
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
}
// Coluna de tons de cada cor base: a própria cor, 3 mais claras e 2 mais escuras
const vzTons = hex => hex === '#ffffff' ? [hex, '#f2f2f2', '#d9d9d9', '#bfbfbf', '#a6a6a6', '#7f7f7f']
  : hex === '#1a1b23' ? [hex, '#7f7f7f', '#595959', '#404040', '#262626', '#0d0d0d']
  : [hex, vzMisturar(hex, .8), vzMisturar(hex, .6), vzMisturar(hex, .4), vzMisturar(hex, -.25), vzMisturar(hex, -.5)];
function vzCoresRecentes(){ try { return JSON.parse(localStorage.getItem(VZ_CORES_RECENTES) || '[]'); } catch (e) { return []; } }
function vzGuardarRecente(cor){
  const lista = [cor, ...vzCoresRecentes().filter(c => c !== cor)].slice(0, 10);
  try { localStorage.setItem(VZ_CORES_RECENTES, JSON.stringify(lista)); } catch (e) {}
}
// Botão que mostra a cor atual (alvo = { id, sec, k, i? } — i = posição na lista de cores das séries)
function vzBotaoCor(alvo, val, padraoTxt, corAuto){
  const dados = estEsc(JSON.stringify(alvo));
  const semCor = val === 'transparent'; // "Sem preenchimento" (fundo e borda do visual)
  const nome = semCor ? 'Sem preenchimento' : val ? val.toUpperCase() : (padraoTxt || 'Automática');
  return `<button type="button" class="vz-cor-btn ${val ? '' : 'auto'}" data-alvo="${dados}" onclick="vzAbrirCores(this)" title="${val ? nome : 'Automática (' + (padraoTxt || 'do tema') + ')'}">
    <i class="${semCor ? 'vz-cor-sem' : ''}" style="background:${semCor ? '' : (val || corAuto || 'transparent')}"></i><span>${nome}</span><b>▾</b></button>`;
}
function vzAbrirCores(botao){
  vzFecharCores();
  const alvo = JSON.parse(botao.dataset.alvo);
  const amostra = c => `<button type="button" class="vz-cor-am" style="background:${c}" title="${c.toUpperCase()}" onclick="vzEscolherCor('${c}')"></button>`;
  const recentes = vzCoresRecentes();
  const pop = document.createElement('div');
  pop.id = 'vz-cores'; pop.className = 'vz-cores';
  pop._alvo = alvo;
  pop.innerHTML = `
    <button type="button" class="vz-cores-auto" onclick="vzEscolherCor(null)"><i></i> Automática (cor do tema)</button>
    ${alvo.sec === 'fundo' ? '<button type="button" class="vz-cores-auto" onclick="vzEscolherCor(\'transparent\')"><i class="vz-cor-sem"></i> Sem preenchimento</button>' : ''}
    <div class="vz-cores-rot">Cores do tema</div>
    <div class="vz-cores-tema">${VZ_CORES_BASE.map(b => `<div class="vz-cores-col">${vzTons(b).map(amostra).join('')}</div>`).join('')}</div>
    <div class="vz-cores-rot">Cores padrão</div>
    <div class="vz-cores-linha">${VZ_CORES_PADRAO.map(amostra).join('')}</div>
    ${recentes.length ? `<div class="vz-cores-rot">Usadas recentemente</div><div class="vz-cores-linha">${recentes.map(amostra).join('')}</div>` : ''}
    <div class="vz-cores-hex">
      <label for="vz-cores-hex">#</label>
      <input id="vz-cores-hex" type="text" maxlength="7" placeholder="ex.: 1f4fd1" autocomplete="off"
        onkeydown="if (event.key === 'Enter') vzCorDoHex()">
      <button type="button" class="btn btn-ghost btn-small" style="width:auto" onclick="vzCorDoHex()">Aplicar</button>
    </div>
    <label class="vz-cores-mais">🎨 Mais cores…<input type="color" onchange="vzEscolherCor(this.value)"></label>`;
  document.body.appendChild(pop);
  // posiciona embaixo do botão (ou em cima, se não couber), sem sair da tela
  const r = botao.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  pop.style.top = (r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
  setTimeout(() => { document.addEventListener('mousedown', vzCoresFora, true); document.addEventListener('keydown', vzCoresEsc, true); }, 0);
}
function vzCoresFora(e){ const p = document.getElementById('vz-cores'); if (p && !p.contains(e.target)) vzFecharCores(); }
function vzCoresEsc(e){ if (e.key === 'Escape') { e.stopPropagation(); vzFecharCores(); } }
function vzFecharCores(){
  const p = document.getElementById('vz-cores'); if (p) p.remove();
  document.removeEventListener('mousedown', vzCoresFora, true); document.removeEventListener('keydown', vzCoresEsc, true);
}
function vzCorDoHex(){
  let t = document.getElementById('vz-cores-hex').value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) t = t.split('').map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(t)) { showToast('Código de cor inválido. Use 6 dígitos, ex.: 1f4fd1.', 'erro'); return; }
  vzEscolherCor('#' + t.toLowerCase());
}
function vzEscolherCor(cor){
  const p = document.getElementById('vz-cores'); if (!p) return;
  const a = p._alvo;
  vzFecharCores();
  if (cor && cor !== 'transparent') vzGuardarRecente(cor);
  if (a.i !== undefined) vzFmtCor(a.id, a.sec, a.k, a.i, cor);
  else vzFmtSet(a.id, a.sec, a.k, cor);
  edRenderProps(); // atualiza o botão com a cor nova
}
function vzHtmlFormatar(v){
  const id = v.id;
  const selecao = typeof edSelecionados === 'function' ? edSelecionados() : [id];
  const tiposSel = new Set(selecao.map(x => (edVisual(x) || {}).tipo));
  const soComuns = selecao.length > 1 && tiposSel.size > 1;
  const temaPaleta = vzTema().paleta;
  // pequenos construtores de controle
  // cor: botão que abre a paleta completa (tema, padrão, recentes, #hex, mais cores)
  const cor = (sec, k, rot, padraoTxt) => { const val = vzF(v, sec, k, null);
    return `<div class="vz-fmt-lin"><span>${rot}</span>${vzBotaoCor({ id, sec, k }, /^#/.test(val || '') || val === 'transparent' ? val : null, padraoTxt)}</div>`; }; // só #hex (ou "sem preenchimento") vira cor (atalhos como "accent" ficam no outro controle)
  const num = (sec, k, rot, min, max, padrao) => `<div class="vz-fmt-lin"><span>${rot}</span>
      <input type="number" class="ed-inp vz-fmt-num" min="${min}" max="${max}" placeholder="${padrao}" value="${vzF(v, sec, k, '') ?? ''}"
        onchange="vzFmtSet('${id}', '${sec}', '${k}', this.value === '' ? null : Math.min(${max}, Math.max(${min}, Number(this.value))))"></div>`;
  const sel = (sec, k, rot, opcoes, padrao) => { const val = vzF(v, sec, k, padrao);
    return `<div class="vz-fmt-lin"><span>${rot}</span><select class="ed-inp vz-fmt-sel" onchange="vzFmtSet('${id}', '${sec}', '${k}', this.value)">
      ${Object.entries(opcoes).map(([o, r]) => `<option value="${o}" ${String(val) === o ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`; };
  const chk = (sec, k, rot, padrao) => `<label class="vz-fmt-lin vz-fmt-chk"><span>${rot}</span>
      <input type="checkbox" ${vzF(v, sec, k, padrao) ? 'checked' : ''} onchange="vzFmtSet('${id}', '${sec}', '${k}', this.checked)"></label>`;
  const txt = (sec, k, rot, ph) => `<div class="vz-fmt-lin"><span>${rot}</span>
      <input type="text" class="ed-inp vz-fmt-txt" placeholder="${estEsc(ph || '')}" value="${estEsc(String(vzF(v, sec, k, '') || ''))}" onchange="vzFmtSet('${id}', '${sec}', '${k}', this.value.trim() || null)"></div>`;
  // medidas do campo Valores (para "meta", "% de", "número pequeno embaixo")
  const valItens = ((v.campos || {}).valores || []).filter(it => it.tipo === 'col' || vzMedida(it.id));
  const opcMedidas = (sec, k, rot, porIndice) => { const atual = vzF(v, sec, k, ''); return `<div class="vz-fmt-lin"><span>${rot}</span><select class="ed-inp vz-fmt-sel"
      onchange="vzFmtSet('${id}', '${sec}', '${k}', this.value === '' ? null : ${porIndice ? 'Number(this.value)' : 'this.value'})"><option value="">Nenhuma</option>
      ${(porIndice ? valItens.map((it, i) => [String(i), it.rotulo || vzRotuloItem(it)]) : (ed.base.medidas || []).map(m => [m.id, m.nome])).map(([o, r]) => `<option value="${o}" ${String(atual) === o ? 'selected' : ''}>${estEsc(r)}</option>`).join('')}</select></div>`; };
  // Cada seção vira um grupo da faixa do topo (controles em cima, nome do grupo embaixo, como no Excel)
  const grupo = (nome, chave, html) => edGrupoFaixa(nome, `<div class="ed-rib-col vz-fmt-col" data-sec="${chave}">${html}</div>`);

  const formatos = { medida: 'Igual ao da medida', ...VZ_FORMATOS };
  const colFiltro = v.tipo === 'filtro' ? vzColuna((((v.campos || {}).coluna || [])[0] || {}).col) : null;
  let html = '';
  if (selecao.length > 1) html += edGrupoFaixa('Seleção', `<div class="ed-rib-col"><span class="ed-rib-info"><b>${selecao.length} visuais selecionados.</b><br>${soComuns
      ? 'Tipos diferentes: aparecem só as opções comuns<br>(texto, título, fundo, borda e sombra).' : 'A formatação vale para todos eles.'}<br>Ctrl+clique tira ou põe um visual.</span></div>`);
  if (typeof edFaixaPincel === 'function') html += edFaixaPincel(v);
  if (!soComuns) html += v.tipo === 'filtro' ? grupo('Filtro', 'filtro',
      sel('filtro', 'alcance', 'Vale para', { guia: 'Só esta guia', relatorio: 'Todas as guias' }, 'guia')
    + chk('filtro', 'multipla', 'Permitir várias escolhas', true)
    + sel('filtro', 'estilo', 'Aparência', { normal: 'Caixa com título', compacto: 'Compacto (faixa de filtros)' }, 'normal')
    + txt('filtro', 'todos', 'Texto sem escolha', 'Todos')
    + (colFiltro && ['data', 'data_hora'].includes(colFiltro.tipo) ? sel('filtro', 'modo', 'Datas', { intervalo: 'De / Até', lista: 'Lista de datas' }, 'intervalo') : '')
    + chk('filtro', 'cascata', 'Lista respeita os outros filtros', true)
    + txt('filtro', 'sinc', 'Ligar a filtros de outras guias', 'nome em comum (ex.: oper)'))
    : grupo('Números', 'numero',
      sel('numero', 'formato', 'Tipo', formatos, 'medida')
    + num('numero', 'casas', 'Casas decimais', 0, 6, 'padrão'));
  if (soComuns || v.tipo === 'filtro') { /* filtro: só Filtro, Texto, Título e Fundo; tipos misturados: só o comum */ }
  // E6
  else if (v.tipo === 'velocimetro') html += grupo('Velocímetro', 'velocimetro',
      num('velocimetro', 'meta', 'Meta fixa', 0, 1e12, 'sem meta') + num('velocimetro', 'maximo', 'Máximo do mostrador', 0, 1e12, 'automático')
    + `<span class="ed-rib-info">Valor em %? Digite em % (ex.: 85).<br>Meta numa medida: use a caixa Meta.</span>`);
  else if (v.tipo === 'cascata') html += grupo('Cascata', 'cascata',
      sel('cascata', 'modo', 'Mostrar', { auto: 'Automático', soma: 'Quanto cada um soma (até o total)', variacao: 'Quanto subiu/caiu de um para o outro' }, 'auto')
    + `<span class="ed-rib-info">Automático: com data no eixo mostra a variação;<br>com texto (ex.: operação) mostra quanto cada um soma.</span>`);
  else if (v.tipo === 'tendencia') html += grupo('Tendência', 'tendencia',
      sel('tendencia', 'projetar', 'Projetar', { fim_mes: 'Até o fim do mês', dias7: 'Próximos 7 dias', dias30: 'Próximos 30 dias', nao: 'Sem projeção' }, 'fim_mes')
    + `<span class="ed-rib-info">Reta dos mínimos quadrados (como a TENDÊNCIA do Excel).</span>`);
  else if (v.tipo === 'reincidencia') html += grupo('Reincidência', 'reincidencia',
      num('reincidencia', 'janela', 'Volta em até (dias)', 1, 365, 7)
    + `<span class="ed-rib-info">Reincidente = a mesma pessoa (caixa "Quem volta")<br>teve outro contato até N dias antes.</span>`);
  else if (v.tipo === 'card') {
    html += grupo('Valor do card', 'card',
        num('card', 'tamanho', 'Tamanho da fonte', 10, 96, 30)
      + cor('card', 'cor', 'Cor do número')
      + chk('card', 'rotulo', 'Mostrar rótulo', true));
    html += grupo('Rótulo e subtítulo', 'cardTexto',
        txt('card', 'rotuloTexto', 'Rótulo', 'nome da medida')
      + sel('card', 'rotuloPos', 'Rótulo fica', { abaixo: 'Abaixo do número', acima: 'Acima do número' }, 'abaixo')
      + sel('card', 'alinhar', 'Alinhamento', { centro: 'Centro', esquerda: 'Esquerda' }, 'centro')
      + sel('card', 'sub', 'Subtítulo', { '': 'Nenhum', pct: '% de outra medida ("x% do total")', meta: 'Dentro / fora da meta', mes: 'Mês (base do Painel CSAT)', texto: 'Texto fixo' }, '')
      + opcMedidas('card', 'subDe', '% de qual medida', false)
      + txt('card', 'subTexto', 'Texto fixo', ''));
    html += grupo('Faixa colorida', 'cardDestaque',
        sel('card', 'destaque', 'Atalho', { ...(/^#/.test(vzF(v, 'card', 'destaque', '') || '') ? { [vzF(v, 'card', 'destaque', '')]: 'Cor escolhida (abaixo)' } : {}), '': 'Nenhuma', accent: 'Cor de destaque do sistema', success: 'Verde (positivo)', warning: 'Amarelo (atenção)', danger: 'Vermelho (negativo)', faint: 'Cinza' }, '')
      + cor('card', 'destaque', 'Ou escolha a cor', 'nenhuma'));
  } else if (v.tipo === 'tabela') {
    html += grupo('Tabela', 'tabela',
        sel('tabela', 'layout', 'Tipo', { padrao: 'Dinâmica (com subtotais)', lista: 'Lista (como as tabelas do Painel CSAT)' }, 'padrao')
      + chk('tabela', 'totalLinhas', 'Linha de total geral', true)
      + chk('tabela', 'totalColunas', 'Coluna de total', true)
      + chk('tabela', 'subtotais', 'Subtotais dos grupos', true)
      + chk('tabela', 'zebra', 'Linhas zebradas', true)
      + cor('tabela', 'cabecalho', 'Fundo do cabeçalho'));
    html += grupo('Meta e situação', 'tabelaMeta',
        opcMedidas('tabela', 'metaMedida', 'Comparar com a meta', false)
      + sel('tabela', 'metaEstilo', 'Cor', { texto: 'No texto', fundo: 'No fundo da célula' }, 'texto')
      + chk('tabela', 'status', 'Coluna Status (✓ / !)', false)
      + chk('tabela', 'situacao', 'Filtro de situação', false)
      + txt('tabela', 'busca', 'Caixa de busca', 'texto de exemplo (vazio = sem busca)')
      + (ed.base.fonte === 'csat' ? chk('tabela', 'extrair', 'Extrair detratores/promotores', false) : ''));
    html += grupo('Células', 'tabelaCel',
        opcMedidas('tabela', 'subvalor', 'Número pequeno embaixo', true)
      + chk('tabela', 'horaFaixa', 'Horário como faixa (08:00 – 08:30)', false)
      + chk('tabela', 'semVazio', 'Sem a linha "vazio"', false));
  } else {
    // pizza ou gráfico com Legenda: várias séries saem de uma coluna → libera 10 cores; senão, uma por medida em Valores
    const temLegenda = ((v.campos || {}).legenda || []).length > 0;
    const nSeries = v.tipo === 'pizza' || temLegenda ? 10 : Math.max(1, (v.campos && v.campos.valores || []).length);
    const cores = vzF(v, 'grafico', 'cores', []) || [];
    html += grupo('Gráfico', 'grafico',
        (v.tipo !== 'pizza' ? sel('grafico', 'legenda', 'Legenda', { auto: 'Automática', mostrar: 'Mostrar', ocultar: 'Ocultar' }, 'auto') : '')
      + (v.tipo !== 'pizza' ? chk('grafico', 'rotulos', 'Valores nas barras/pontos', false) + chk('grafico', 'grade', 'Linhas de grade', true) : '<span class="ed-rib-info">a pizza mostra o nome e o valor ao lado de cada fatia</span>')
      + (['linhas', 'area', 'colunas'].includes(v.tipo) ? chk('grafico', 'meta', 'Linha da meta (pontos verdes/vermelhos)', false) : '')
      + (['linhas', 'area'].includes(v.tipo) ? chk('grafico', 'suave', 'Linha suave', false) : ''));
    html += grupo(`Cores ${v.tipo === 'pizza' ? 'das fatias' : 'das séries'}`, 'cores', `<div class="vz-fmt-paleta">`
      + Array.from({ length: Math.min(10, nSeries) }, (_, i) => `<span class="vz-fmt-serie" title="${i + 1}ª ${v.tipo === 'pizza' ? 'fatia' : 'série'}">${i + 1}
          ${vzBotaoCor({ id, sec: 'grafico', k: 'cores', i }, cores[i] || null, 'auto', temaPaleta[i % temaPaleta.length])}</span>`).join('')
      + (cores.length ? `<button class="vz-fmt-auto" onclick="vzFmtSet('${id}', 'grafico', 'cores', null)">Todas automáticas</button>` : '')
      + `</div>`);
  }
  html += grupo('Texto', 'texto', num('texto', 'tamanho', 'Tamanho da fonte', 8, 24, v.tipo === 'tabela' ? 12 : 11) + cor('texto', 'cor', 'Cor do texto'));
  html += grupo('Título', 'titulo',
      chk('titulo', 'mostrar', 'Mostrar título', true)
    + num('titulo', 'tamanho', 'Tamanho da fonte', 9, 28, 12.5)
    + cor('titulo', 'cor', 'Cor')
    + chk('titulo', 'negrito', 'Negrito', true)
    + sel('titulo', 'alinhar', 'Alinhamento', { esquerda: 'Esquerda', centro: 'Centro', direita: 'Direita' }, 'esquerda'));
  html += grupo('Fundo', 'fundo',
      cor('fundo', 'cor', 'Cor de fundo', 'do tema')
    + num('fundo', 'raio', 'Cantos arredondados (px)', 0, 30, 10));
  // Lados da borda, como no Excel: cada botão liga/desliga um lado; "Todas" e "Nenhuma" de uma vez
  const lados = vzF(v, 'fundo', 'lados', 'tdbe'), comBorda = vzF(v, 'fundo', 'borda', true);
  const ICO_LADO = { t: '<path d="M4 4h16" stroke-width="3"/>', d: '<path d="M20 4v16" stroke-width="3"/>', b: '<path d="M4 20h16" stroke-width="3"/>', e: '<path d="M4 4v16" stroke-width="3"/>' };
  const ladoBtn = (l, rot) => `<button type="button" class="vz-lado ${comBorda && lados.includes(l) ? 'on' : ''}" title="Borda ${rot}" onclick="vzFmtLado('${id}', '${l}')">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1"><rect x="4" y="4" width="16" height="16" stroke-dasharray="2 2" opacity=".5"/>${ICO_LADO[l]}</svg></button>`;
  html += grupo('Borda', 'borda',
      `<div class="vz-fmt-lin"><span>Lados</span><span class="vz-lados">${ladoBtn('t', 'de cima')}${ladoBtn('d', 'da direita')}${ladoBtn('b', 'de baixo')}${ladoBtn('e', 'da esquerda')}
        <button type="button" class="vz-lado-txt" onclick="vzFmtSet('${id}', 'fundo', 'lados', null); vzFmtSet('${id}', 'fundo', 'borda', null)">Todas</button>
        <button type="button" class="vz-lado-txt" onclick="vzFmtSet('${id}', 'fundo', 'borda', false)">Nenhuma</button></span></div>`
    + cor('fundo', 'corBorda', 'Cor da borda', 'do tema')
    + num('fundo', 'esp', 'Espessura (px)', 1, 8, 1)
    + sel('fundo', 'estilo', 'Estilo', { solid: 'Contínua', dashed: 'Tracejada', dotted: 'Pontilhada', double: 'Dupla' }, 'solid'));
  html += grupo('Sombra', 'sombra',
      sel('fundo', 'sombra', 'Sombra', { '': 'Nenhuma', leve: 'Leve', media: 'Média', forte: 'Forte' }, '')
    + cor('fundo', 'corSombra', 'Cor da sombra', 'preta'));
  // Comportamento: filtros que este visual ignora e "só aparece quando…" (botão de outro visual)
  const chavesFiltro = []; const vistos = new Set();
  for (const g of ed.def.guias) for (const x of g.visuais) if (x.tipo === 'filtro' && x.id !== v.id) {
    const k = vzChaveFiltro(x); if (vistos.has(k)) continue; vistos.add(k);
    const c = vzColuna((((x.campos || {}).coluna || [])[0] || {}).col);
    chavesFiltro.push([k, c ? c.rotulo : x.titulo]);
  }
  const ignora = vzF(v, 'filtros', 'ignorar', []) || [];
  const alternaveis = edGuiaAtual().visuais.filter(x => x.id !== v.id && VZ_TIPOS_ALTERNAVEIS.includes(x.tipo) && ((x.campos || {}).eixo || []).length > 1);
  const se = (v.formato || {}).visivelSe;
  if (!soComuns && selecao.length < 2) html += grupo('Comportamento', 'comportamento',
      (chavesFiltro.length ? `<div class="vz-fmt-lin"><span>Ignorar filtros</span><span class="vz-fmt-ign">${chavesFiltro.map(([k, r]) => `<label><input type="checkbox" ${ignora.includes(k) ? 'checked' : ''} onchange="vzFmtIgnorar('${id}', '${k}', this.checked)"> ${estEsc(r)}</label>`).join('')}</span></div>` : '')
    + `<div class="vz-fmt-lin"><span>Aparece</span><select class="ed-inp vz-fmt-sel" onchange="vzFmtVisivel('${id}', this.value)"><option value="">Sempre</option>
        ${alternaveis.flatMap(x => x.campos.eixo.map((it, i) => [`${x.id}|${i}`, `Só com "${vzRotuloBotaoEixo(it)}" em ${x.titulo}`])).map(([o, r]) => `<option value="${o}" ${se && `${se.visual}|${se.eixo}` === o ? 'selected' : ''}>${estEsc(r)}</option>`).join('')}</select></div>`);
  return html;
}
function vzFmtIgnorar(id, chave, marcado){
  const v = edVisual(id), atual = vzF(v, 'filtros', 'ignorar', []) || [];
  const lista = marcado ? [...new Set([...atual, chave])] : atual.filter(k => k !== chave);
  vzFmtSet(id, 'filtros', 'ignorar', lista.length ? lista : null);
}
function vzFmtVisivel(id, valor){
  const v = edVisual(id);
  edMudar(() => { v.formato = v.formato || {}; if (!valor) delete v.formato.visivelSe; else { const [visual, i] = valor.split('|'); v.formato.visivelSe = { visual, eixo: Number(i) }; } });
  edAplicarVisibilidade();
}

/* ---------------- campos do visual (Eixo / Valores / Legenda) ---------------- */
// Quais caixas cada tipo tem e quantos itens cada uma aceita
function vzSlots(tipo){
  if (tipo === 'card') return [{ k: 'valores', nome: 'Valor', max: 1, aceita: 'valor' }];
  if (tipo === 'filtro') return [{ k: 'coluna', nome: 'Coluna do filtro', max: 1, aceita: 'coluna' }];
  // E6
  if (tipo === 'velocimetro') return [{ k: 'valores', nome: 'Valor', max: 1, aceita: 'valor' }, { k: 'meta', nome: 'Meta (opcional — ou fixa na aba Formatar)', max: 1, aceita: 'valor' }];
  if (tipo === 'cascata') return [{ k: 'eixo', nome: 'Categoria ou período', max: 1, aceita: 'coluna' }, { k: 'valores', nome: 'Valor', max: 1, aceita: 'valor' }];
  if (tipo === 'tendencia') return [{ k: 'eixo', nome: 'Data', max: 1, aceita: 'coluna' }, { k: 'valores', nome: 'Valor', max: 1, aceita: 'valor' }];
  if (tipo === 'reincidencia') return [{ k: 'chave', nome: 'Quem volta (cliente, telefone, ID)', max: 1, aceita: 'coluna' }, { k: 'data', nome: 'Data/hora do contato', max: 1, aceita: 'coluna' }, { k: 'eixo', nome: 'Abrir por (opcional, ex.: operador)', max: 1, aceita: 'coluna' }];
  if (tipo === 'pizza') return [{ k: 'eixo', nome: 'Categoria', max: 1, aceita: 'coluna' }, { k: 'valores', nome: 'Valor', max: 1, aceita: 'valor' }];
  // Tabela dinâmica, como no Excel: Linhas (até 3 níveis, com subtotais) · Colunas · Valores
  if (tipo === 'tabela') return [{ k: 'linhas', nome: 'Linhas', max: 5, aceita: 'coluna' }, { k: 'colunas', nome: 'Colunas', max: 1, aceita: 'coluna' }, { k: 'valores', nome: 'Valores', max: 6, aceita: 'valor' }];
  // Eixo aceita até 4 colunas: com 2 ou mais, viram botões no título do gráfico para alternar (ex.: INTRADAY | INTRAHORA)
  return [{ k: 'eixo', nome: 'Eixo', max: 4, aceita: 'coluna' }, { k: 'valores', nome: 'Valores', max: 6, aceita: 'valor' }, { k: 'legenda', nome: 'Legenda', max: 1, aceita: 'coluna' }];
}

/* ---------------- eixos alternativos (botões no título do gráfico) ----------------
   Como o "parâmetro de campo" do Power BI: o mesmo gráfico, com as mesmas medidas, troca a coluna do eixo
   ao clicar no botão (ex.: DATA = INTRADAY, HORÁRIO = INTRAHORA). A escolha vale só na tela (começa no 1º). */
const VZ_TIPOS_ALTERNAVEIS = ['colunas', 'barras', 'linhas', 'area'];
function vzEixoAtivo(v){
  const n = ((v.campos || {}).eixo || []).length;
  const i = (ed.eixoAtivo || {})[v.id] || 0;
  return i < n ? i : 0;
}
function vzRotuloBotaoEixo(it){ return it.rotulo || vzRotuloItem(it); }
// Desenha (ou esconde) os botões no título do visual
function vzAtualizarAlternador(v){
  const cab = document.querySelector(`#ed-grade .ed-vis[data-id="${v.id}"] .ed-vis-cab`);
  if (!cab) return;
  const eixos = (v.campos || {}).eixo || [];
  let alt = cab.querySelector('.ed-vis-alt');
  const mostrar = VZ_TIPOS_ALTERNAVEIS.includes(v.tipo) && eixos.length > 1;
  cab.classList.toggle('com-alternador', mostrar);
  if (!mostrar) { if (alt) alt.remove(); return; }
  if (!alt) { alt = document.createElement('span'); alt.className = 'ed-vis-alt'; cab.appendChild(alt); }
  const ativo = vzEixoAtivo(v);
  // mousedown parado aqui: o título é a "alça" de arrastar o visual; clicar no botão não pode arrastar
  alt.innerHTML = eixos.map((it, i) => `<button class="${i === ativo ? 'ativo' : ''}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); vzTrocarEixo('${v.id}', ${i})">${estEsc(vzRotuloBotaoEixo(it))}</button>`).join('');
}
function vzTrocarEixo(id, i){
  ed.eixoAtivo = ed.eixoAtivo || {};
  ed.eixoAtivo[id] = i;
  vzRender(id);
  if (typeof edAplicarVisibilidade === 'function') edAplicarVisibilidade(); // visuais que aparecem só com este botão
}
// Propriedade de um item de campo (nome na tabela, título/dica do botão do eixo). Vazio = apaga.
function vzCampoProp(id, slot, i, prop, txt){
  const v = edVisual(id), t = String(txt || '').trim();
  edMudar(() => { const it = v.campos[slot][i]; if (t) it[prop] = t; else delete it[prop]; });
  vzRender(id);
}
// Nome do botão (vazio = nome da coluna). Fica gravado no relatório.
function vzRotuloEixo(id, i, txt){
  const v = edVisual(id);
  edMudar(() => { const it = v.campos.eixo[i]; const t = String(txt || '').trim().toUpperCase(); if (t) it.rotulo = t; else delete it.rotulo; });
  vzAtualizarAlternador(v);
}
function vzHtmlSlots(v){
  const campos = v.campos || {};
  const opcoesValor = `<optgroup label="Medidas">${(ed.base.medidas || []).map(m => `<option value="medida:${m.id}">${estEsc(m.nome)}</option>`).join('') || '<option disabled>nenhuma medida ainda</option>'}</optgroup>
    <optgroup label="Colunas numéricas (soma)">${ed.base.colunas.filter(c => c.manter && ['inteiro', 'decimal'].includes(c.tipo)).map(c => `<option value="col:${c.nome}">${estEsc(c.rotulo)}</option>`).join('')}</optgroup>`;
  const opcoesColuna = ['Datas e horas', 'Textos', 'Números'].map((g, i) => {
    const tipos = [['data', 'data_hora', 'hora'], ['texto'], ['inteiro', 'decimal']][i];
    return `<optgroup label="${g}">${ed.base.colunas.filter(c => c.manter && tipos.includes(c.tipo)).map(c => `<option value="col:${c.nome}">${estEsc(c.rotulo)}</option>`).join('')}</optgroup>`;
  }).join('');
  return vzSlots(v.tipo).map(s => {
    const itens = campos[s.k] || [];
    const chips = itens.map((it, i) => `<div class="vz-chip ${it.tipo === 'medida' ? 'medida' : ''}">
        <span class="vz-chip-nome" title="${estEsc(vzRotuloItem(it))}">${estEsc(vzRotuloItem(it))}</span>
        ${it.tipo === 'col' && s.aceita === 'valor' ? `<select class="vz-chip-agg" onchange="vzMudarAgg('${v.id}', '${s.k}', ${i}, this.value)">${Object.entries(VZ_AGG_COLUNA).map(([k, r]) => `<option value="${k}" ${(it.agg || 'soma') === k ? 'selected' : ''}>${r}</option>`).join('')}</select>` : ''}
        <button class="vz-chip-x" onclick="vzRemoverCampo('${v.id}', '${s.k}', ${i})" title="Tirar">×</button>
        ${s.k === 'eixo' && itens.length > 1 && VZ_TIPOS_ALTERNAVEIS.includes(v.tipo) ? `<input class="vz-chip-rot" type="text" value="${estEsc(it.rotulo || '')}" placeholder="nome do botão: ${estEsc(vzRotuloItem(it))}" title="Nome do botão no título do gráfico" onchange="vzRotuloEixo('${v.id}', ${i}, this.value)">
          <input class="vz-chip-rot" type="text" value="${estEsc(it.titulo || '')}" placeholder="título com este botão (opcional)" title="Título do gráfico quando este botão está ativo" onchange="vzCampoProp('${v.id}', 'eixo', ${i}, 'titulo', this.value)">
          <input class="vz-chip-rot" type="text" value="${estEsc(it.dica || '')}" placeholder="dica ao lado do título (opcional; {n} = sem valor)" title="Texto pequeno ao lado do título" onchange="vzCampoProp('${v.id}', 'eixo', ${i}, 'dica', this.value)">` : ''}
        ${v.tipo === 'tabela' ? `<input class="vz-chip-rot" type="text" value="${estEsc(it.rotulo || '')}" placeholder="nome na tabela: ${estEsc(vzRotuloItem(it))}" title="Nome desta coluna no cabeçalho da tabela" onchange="vzCampoProp('${v.id}', '${s.k}', ${i}, 'rotulo', this.value)">` : ''}</div>`).join('');
    const cheio = itens.length >= s.max && s.max === 1 ? '' : '';
    return `<div class="ed-slot" data-slot="${s.k}" data-vis="${v.id}" ondragover="vzSobre(event)" ondragleave="this.classList.remove('vz-alvo')" ondrop="vzSoltarNoSlot(event, '${v.id}', '${s.k}')">
      <div class="ed-slot-nome">${s.nome}${s.max > 1 ? ` <span class="ed-fraco">(até ${s.max})</span>` : ''}</div>
      ${chips}
      ${itens.length < s.max || s.max === 1 ? `<select class="vz-add" onchange="vzAdicionarDaLista('${v.id}', '${s.k}', this.value); this.value=''">
        <option value="">${itens.length && s.max === 1 ? 'trocar…' : '＋ arraste aqui ou escolha…'}</option>${s.aceita === 'valor' ? opcoesValor : opcoesColuna}</select>` : ''}${cheio}
    </div>`;
  }).join('') + (v.tipo === 'filtro'
    ? `<div class="ed-info">A escolha feita neste filtro vale para os outros visuais <b>desta guia</b> (ou de todas, na aba Formatar). Coluna de data vira "De / Até".</div>`
    : v.tipo === 'tabela'
    ? `<div class="ed-info">Como a tabela dinâmica do Excel: cada nível de <b>Linhas</b> ganha subtotal; <b>Colunas</b> abre os valores lado a lado; clique no título de um valor para ordenar.</div>`
    : ['colunas', 'barras', 'linhas', 'area'].includes(v.tipo) ? `<div class="ed-info">Com <b>Legenda</b>, o gráfico usa uma só medida em Valores e separa as séries pela coluna escolhida.</div>` : '');
}
function vzColocarCampo(visId, slot, item){
  const v = edVisual(visId), s = vzSlots(v.tipo).find(x => x.k === slot);
  if (!s) return;
  if (s.aceita === 'coluna' && item.tipo !== 'col') { showToast(`${s.nome} recebe uma coluna (ex.: data, operação, supervisor).`, 'erro'); return; }
  if (s.aceita === 'valor' && item.tipo === 'col') {
    const c = vzColuna(item.col);
    if (!['inteiro', 'decimal'].includes(c.tipo)) item = { ...item, agg: 'contagem_distinta' };
  }
  edMudar(() => {
    v.campos = v.campos || {};
    const lista = v.campos[slot] = v.campos[slot] || [];
    if (s.max === 1) lista.splice(0, lista.length, item);
    else if (lista.length < s.max) lista.push(item);
  });
  edRenderProps(); vzDepoisDeMudarCampos(v);
}
// Mudou a coluna de um filtro: a escolha antiga não vale mais e todos os visuais são recalculados
function vzDepoisDeMudarCampos(v){
  if (v.tipo === 'filtro') { if (ed.filtros) delete ed.filtros[vzChaveFiltro(v)]; vzAplicarFiltros(); }
  else vzRender(v.id);
}
function vzAdicionarDaLista(visId, slot, valor){
  if (!valor) return;
  const [tipo, ref] = valor.split(':');
  vzColocarCampo(visId, slot, tipo === 'medida' ? { tipo: 'medida', id: ref } : { tipo: 'col', col: ref });
}
function vzRemoverCampo(visId, slot, i){
  edMudar(() => { edVisual(visId).campos[slot].splice(i, 1); });
  edRenderProps(); vzDepoisDeMudarCampos(edVisual(visId));
}
function vzMudarAgg(visId, slot, i, agg){
  edMudar(() => { edVisual(visId).campos[slot][i].agg = agg; });
  vzRender(visId);
}

/* ---------------- arrastar e soltar (painel Dados → visual ou caixa) ---------------- */
function vzArrastar(ev, item){
  ev.dataTransfer.setData('text/estudio', JSON.stringify(item));
  ev.dataTransfer.effectAllowed = 'copy';
}
function vzSobre(ev){
  if ([...ev.dataTransfer.types].includes('text/estudio')) { ev.preventDefault(); ev.currentTarget.classList.add('vz-alvo'); }
}
function vzLerArraste(ev){
  try { return JSON.parse(ev.dataTransfer.getData('text/estudio')); } catch (e) { return null; }
}
function vzSoltarNoSlot(ev, visId, slot){
  ev.preventDefault(); ev.currentTarget.classList.remove('vz-alvo');
  const item = vzLerArraste(ev); if (item) vzColocarCampo(visId, slot, item);
}
// Soltar direto em cima do visual: o sistema escolhe a caixa (medida/número → Valores; data/texto → Eixo)
function vzSoltarNoVisual(ev, visId){
  ev.preventDefault(); ev.currentTarget.classList.remove('vz-alvo');
  const item = vzLerArraste(ev); if (!item) return;
  const v = edVisual(visId);
  edSelecionar(visId);
  const c = item.tipo === 'col' ? vzColuna(item.col) : null;
  const ehValor = item.tipo === 'medida' || (c && ['inteiro', 'decimal'].includes(c.tipo));
  if (v.tipo === 'tabela') { vzColocarCampo(visId, ehValor ? 'valores' : 'linhas', item); return; }
  if (v.tipo === 'filtro') { vzColocarCampo(visId, 'coluna', item); return; }
  if (v.tipo === 'velocimetro') { vzColocarCampo(visId, (v.campos && (v.campos.valores || []).length) && ehValor ? 'meta' : 'valores', item); return; }
  if (v.tipo === 'reincidencia') {
    // coluna de data → Data; senão a 1ª caixa vazia entre "Quem volta" e "Abrir por"
    const cs = v.campos || {};
    const slot = c && ['data', 'data_hora'].includes(c.tipo) ? 'data' : !(cs.chave || []).length ? 'chave' : 'eixo';
    vzColocarCampo(visId, slot, item); return;
  }
  if (v.tipo === 'cascata' || v.tipo === 'tendencia') { vzColocarCampo(visId, ehValor ? 'valores' : 'eixo', item); return; }
  if (v.tipo === 'card' || ehValor) vzColocarCampo(visId, 'valores', item);
  else if (!(v.campos && v.campos.eixo && v.campos.eixo.length) || v.tipo === 'pizza') vzColocarCampo(visId, 'eixo', item);
  else vzColocarCampo(visId, 'legenda', item);
}

/* A janela de medida (fórmula DAX) fica em estudio-dax.js */
