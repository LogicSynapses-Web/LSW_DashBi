/* =====================================================================
   ESTÚDIO · MEDIDAS EM DAX (12/10/2026)
   A pessoa escreve a medida em DAX (a linguagem do Power BI) e este arquivo:
   1) lê o texto e monta a "árvore" da fórmula (daxTokens → daxParse);
   2) traduz a árvore para SQL do DuckDB, que faz a conta no navegador (daxSqlMedida);
   3) converte as medidas antigas do formulário para DAX (daxDeLegado);
   4) desenha a janela de fórmula: cores, sugestões, lista de medidas/colunas/funções e resultado ao vivo.
   Ideia central da tradução: uma medida resume muitas linhas num número só (SUM, AVERAGE, COUNTROWS...).
   CALCULATE(conta, condição) vira "conta FILTER (WHERE condição)" — o mesmo raciocínio do SOMASES/CONT.SES.
   Depende de: estudio-visuais.js (vzColuna, vzId, vzMedidaSql, vzFmt...) e estudio-editor.js (ed).
   ===================================================================== */

// Funções aceitas: [grupo, como escrever, o que faz]
const DAX_FUNCOES = {
  SUM:           ['Agregação', 'SUM(dados[coluna])', 'Soma da coluna (SOMA)'],
  AVERAGE:       ['Agregação', 'AVERAGE(dados[coluna])', 'Média da coluna (MÉDIA)'],
  MIN:           ['Agregação', 'MIN(dados[coluna])', 'Menor valor (ou o menor entre 2 valores)'],
  MAX:           ['Agregação', 'MAX(dados[coluna])', 'Maior valor (ou o maior entre 2 valores)'],
  COUNT:         ['Agregação', 'COUNT(dados[coluna])', 'Conta os valores preenchidos da coluna'],
  COUNTA:        ['Agregação', 'COUNTA(dados[coluna])', 'Igual ao COUNT (conta preenchidos)'],
  COUNTBLANK:    ['Agregação', 'COUNTBLANK(dados[coluna])', 'Conta as linhas com a coluna vazia'],
  COUNTROWS:     ['Agregação', 'COUNTROWS(dados)', 'Conta as linhas (CONT.VALORES)'],
  DISTINCTCOUNT: ['Agregação', 'DISTINCTCOUNT(dados[coluna])', 'Quantos valores diferentes existem'],
  MEDIAN:        ['Agregação', 'MEDIAN(dados[coluna])', 'Mediana da coluna (MED)'],
  SUMX:          ['Linha a linha', 'SUMX(dados, expressão)', 'Faz a conta em cada linha e soma (SOMARPRODUTO)'],
  AVERAGEX:      ['Linha a linha', 'AVERAGEX(dados, expressão)', 'Faz a conta em cada linha e tira a média'],
  MINX:          ['Linha a linha', 'MINX(dados, expressão)', 'Menor resultado da conta linha a linha'],
  MAXX:          ['Linha a linha', 'MAXX(dados, expressão)', 'Maior resultado da conta linha a linha'],
  COUNTX:        ['Linha a linha', 'COUNTX(dados, expressão)', 'Conta as linhas em que a conta tem valor'],
  MEDIANX:       ['Linha a linha', 'MEDIANX(dados, expressão)', 'Mediana da conta linha a linha'],
  CALCULATE:     ['Filtro', 'CALCULATE(expressão, condição, ...)', 'Calcula só nas linhas onde TODAS as condições valem (SOMASES, CONT.SES)'],
  FILTER:        ['Filtro', 'FILTER(dados, condição)', 'As linhas que atendem à condição (use dentro de CALCULATE, COUNTROWS ou SUMX)'],
  KEEPFILTERS:   ['Filtro', 'KEEPFILTERS(condição)', 'Condição do CALCULATE (aqui funciona igual à condição normal)'],
  DIVIDE:        ['Lógica e matemática', 'DIVIDE(a, b, [se_zero])', 'Divisão que não dá erro quando b é zero ou vazio'],
  IF:            ['Lógica e matemática', 'IF(condição, se_sim, [se_não])', 'SE do Excel'],
  SWITCH:        ['Lógica e matemática', 'SWITCH(TRUE(), cond1, res1, cond2, res2, ..., senão)', 'Vários SE seguidos (SES do Excel)'],
  AND:           ['Lógica e matemática', 'AND(a, b)', 'E: verdadeiro se os dois forem (ou use &&)'],
  OR:            ['Lógica e matemática', 'OR(a, b)', 'OU: verdadeiro se um deles for (ou use ||)'],
  NOT:           ['Lógica e matemática', 'NOT(condição)', 'NÃO: inverte a condição'],
  ISBLANK:       ['Lógica e matemática', 'ISBLANK(valor)', 'Verdadeiro se estiver vazio (ÉCÉL.VAZIA)'],
  BLANK:         ['Lógica e matemática', 'BLANK()', 'Valor vazio'],
  COALESCE:      ['Lógica e matemática', 'COALESCE(a, b, ...)', 'O primeiro valor que não for vazio'],
  TRUE:          ['Lógica e matemática', 'TRUE()', 'Verdadeiro'],
  FALSE:         ['Lógica e matemática', 'FALSE()', 'Falso'],
  ABS:           ['Lógica e matemática', 'ABS(valor)', 'Valor sem sinal'],
  ROUND:         ['Lógica e matemática', 'ROUND(valor, casas)', 'Arredonda (ARRED)'],
  ROUNDUP:       ['Lógica e matemática', 'ROUNDUP(valor, casas)', 'Arredonda para cima'],
  ROUNDDOWN:     ['Lógica e matemática', 'ROUNDDOWN(valor, casas)', 'Arredonda para baixo'],
  INT:           ['Lógica e matemática', 'INT(valor)', 'Parte inteira'],
  SQRT:          ['Lógica e matemática', 'SQRT(valor)', 'Raiz quadrada'],
  POWER:         ['Lógica e matemática', 'POWER(base, expoente)', 'Potência (ou use ^)'],
  MOD:           ['Lógica e matemática', 'MOD(a, b)', 'Resto da divisão'],
  CONTAINSSTRING:['Texto', 'CONTAINSSTRING(texto, "parte")', 'Verdadeiro se o texto contém a parte (sem diferenciar maiúsculas)'],
  LEFT:          ['Texto', 'LEFT(texto, n)', 'Primeiros n caracteres (ESQUERDA)'],
  RIGHT:         ['Texto', 'RIGHT(texto, n)', 'Últimos n caracteres (DIREITA)'],
  LEN:           ['Texto', 'LEN(texto)', 'Quantidade de caracteres (NÚM.CARACT)'],
  UPPER:         ['Texto', 'UPPER(texto)', 'MAIÚSCULAS'],
  LOWER:         ['Texto', 'LOWER(texto)', 'minúsculas'],
  TRIM:          ['Texto', 'TRIM(texto)', 'Tira espaços das pontas (ARRUMAR)'],
  CONCATENATE:   ['Texto', 'CONCATENATE(a, b)', 'Junta dois textos (ou use &)'],
  YEAR:          ['Data e hora', 'YEAR(data)', 'Ano'],
  MONTH:         ['Data e hora', 'MONTH(data)', 'Mês (1 a 12)'],
  DAY:           ['Data e hora', 'DAY(data)', 'Dia do mês'],
  HOUR:          ['Data e hora', 'HOUR(hora)', 'Hora (0 a 23)'],
  MINUTE:        ['Data e hora', 'MINUTE(hora)', 'Minuto'],
  WEEKDAY:       ['Data e hora', 'WEEKDAY(data)', 'Dia da semana (1 = domingo ... 7 = sábado)'],
  DATE:          ['Data e hora', 'DATE(ano, mês, dia)', 'Monta uma data (para comparar)'],
  TIME:          ['Data e hora', 'TIME(hora, minuto, segundo)', 'Monta uma hora (para comparar)'],
  TODAY:         ['Data e hora', 'TODAY()', 'Data de hoje'],
  META:          ['Lógica e matemática', 'META()', 'Meta do relatório (ex.: 90% → 0,90). No Painel CSAT, é a meta gravada no banco'],
};
const DAX_PALAVRAS = ['VAR', 'RETURN', 'IN', 'NOT', 'TRUE', 'FALSE'];

/* ---------------- 1) leitura do texto ---------------- */
function daxErro(msg, src, p){
  const antes = src.slice(0, p), linha = antes.split('\n').length, col = p - antes.lastIndexOf('\n');
  const e = new Error(`Linha ${linha}, coluna ${col}: ${msg}`); e.pos = p; return e;
}
// Quebra o texto em pedaços (números, textos, [referências], nomes, operadores).
// tolerante = para colorir enquanto a pessoa digita (não para no 1º erro, guarda espaços e comentários)
function daxTokens(src, tolerante){
  const t = []; let i = 0;
  const falha = (msg, p) => { if (tolerante) { t.push({ t: 'txt', v: src.slice(p), p }); i = src.length; } else throw daxErro(msg, src, p); };
  while (i < src.length) {
    const c = src[i], p = i, resto = src.slice(i);
    let m;
    if ((m = resto.match(/^\s+/))) { if (tolerante) t.push({ t: 'esp', v: m[0], p }); i += m[0].length; continue; }
    if (resto.startsWith('//') || resto.startsWith('--')) { let j = src.indexOf('\n', i); if (j < 0) j = src.length; if (tolerante) t.push({ t: 'com', v: src.slice(i, j), p }); i = j; continue; }
    if (resto.startsWith('/*')) { let j = src.indexOf('*/', i + 2); j = j < 0 ? src.length : j + 2; if (tolerante) t.push({ t: 'com', v: src.slice(i, j), p }); i = j; continue; }
    if ((m = resto.match(/^(\d+(\.\d+)?|\.\d+)/))) { t.push({ t: 'num', v: m[0], p }); i += m[0].length; continue; }
    if (c === '"') {
      let j = i + 1, v = '';
      while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { v += '"'; j += 2; continue; } break; } v += src[j++]; }
      if (j >= src.length) { if (tolerante) { t.push({ t: 'str', v: src.slice(i), p, bruto: true }); i = src.length; continue; } throw daxErro('texto sem as aspas de fechamento (")', src, p); }
      t.push({ t: 'str', v, p, fim: j + 1 }); i = j + 1; continue;
    }
    if (c === '[') {
      const j = src.indexOf(']', i);
      if (j < 0 || src.slice(i, j).includes('\n')) { falha('colchete [ sem o ] de fechamento', p); continue; }
      t.push({ t: 'ref', v: src.slice(i + 1, j), p, fim: j + 1 }); i = j + 1; continue;
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) { falha("nome de tabela sem o ' de fechamento", p); continue; }
      t.push({ t: 'tab', v: src.slice(i + 1, j), p, fim: j + 1 }); i = j + 1; continue;
    }
    if ((m = resto.match(/^[A-Za-z_À-ÿ][A-Za-z0-9_À-ÿ.]*/))) { t.push({ t: 'id', v: m[0], p }); i += m[0].length; continue; }
    if ((m = resto.match(/^(<=|>=|<>|==|&&|\|\|)/))) { t.push({ t: 'op', v: m[0], p }); i += 2; continue; }
    if ('=<>+-*/^&(),{}'.includes(c)) { t.push({ t: 'op', v: c, p }); i++; continue; }
    falha(`caractere inesperado "${c}"`, p);
  }
  return t;
}
// Monta a árvore da fórmula, respeitando a ordem das contas (* antes de +, comparações, && e ||)
function daxParse(src){
  const tk = daxTokens(src);
  let k = 0;
  const eh = (v, o = 0) => { const x = tk[k + o]; return !!x && (x.t === 'op' || x.t === 'id') && x.v.toUpperCase() === v; };
  const pos = () => (tk[k] ? tk[k].p : src.length);
  const espera = v => {
    if (!eh(v)) throw daxErro(`esperava "${v}"${tk[k] ? ` e encontrou "${tk[k].v}"` : ' mas a fórmula acabou'}`, src, pos());
    k++;
  };
  function expr(){
    if (eh('VAR')) {
      const defs = [];
      while (eh('VAR')) {
        k++;
        const n = tk[k];
        if (!n || n.t !== 'id') throw daxErro('depois de VAR vem o nome da variável (ex.: VAR total = ...)', src, pos());
        k++; espera('=');
        defs.push({ nome: n.v, expr: expr() });
      }
      if (!eh('RETURN')) throw daxErro('depois das variáveis (VAR) falta o RETURN com a conta final', src, pos());
      k++;
      return { n: 'vars', defs, ret: expr() };
    }
    return ou();
  }
  const binario = (prox, ops, nome) => () => {
    let a = prox();
    while (ops.some(o => eh(o))) { const op = tk[k++].v; a = { n: 'bin', op: nome ? nome(op) : op, a, b: prox() }; }
    return a;
  };
  const pot = () => { const a = prim(); if (eh('^')) { k++; return { n: 'bin', op: '^', a, b: unario() }; } return a; };
  const unario = () => {
    if (eh('-')) { k++; return { n: 'neg', a: unario() }; }
    if (eh('+')) { k++; return unario(); }
    if (eh('NOT') && !eh('(', 1)) { k++; return { n: 'not', a: unario() }; }
    return pot();
  };
  const mult = binario(unario, ['*', '/']);
  const soma = binario(mult, ['+', '-']);
  const junta = binario(soma, ['&'], () => 'concat');
  const cmp = () => {
    const a = junta();
    const op = ['=', '==', '<>', '<=', '>=', '<', '>'].find(o => eh(o));
    if (op) { k++; return { n: 'bin', op: op === '==' ? '=' : op, a, b: junta() }; }
    if (eh('IN')) { k++; return { n: 'in', a, b: prim() }; }
    return a;
  };
  const e_ = binario(cmp, ['&&'], () => 'and');
  const ou = binario(e_, ['||'], () => 'or');
  function prim(){
    const x = tk[k];
    if (!x) throw daxErro('a fórmula terminou antes da hora (falta um valor ou um parêntese?)', src, src.length);
    if (x.t === 'num') { k++; return { n: 'num', v: Number(x.v) }; }
    if (x.t === 'str') { k++; return { n: 'str', v: x.v }; }
    if (x.t === 'ref') { k++; return { n: 'ref', nome: x.v, p: x.p }; }
    if (x.t === 'tab') {
      k++;
      if (tk[k] && tk[k].t === 'ref') { const r = tk[k++]; return { n: 'ref', tabela: x.v, nome: r.v, p: r.p }; }
      return { n: 'nome', v: x.v, p: x.p };
    }
    if (eh('(')) { k++; const e = expr(); espera(')'); return e; }
    if (eh('{')) {
      k++; const itens = [];
      if (!eh('}')) { itens.push(expr()); while (eh(',')) { k++; itens.push(expr()); } }
      espera('}');
      return { n: 'lista', itens };
    }
    if (x.t === 'id') {
      k++;
      if (eh('(')) {
        k++; const args = [];
        if (!eh(')')) { args.push(expr()); while (eh(',')) { k++; args.push(expr()); } }
        espera(')');
        return { n: 'fn', f: x.v.toUpperCase(), args, p: x.p };
      }
      if (tk[k] && tk[k].t === 'ref') { const r = tk[k++]; return { n: 'ref', tabela: x.v, nome: r.v, p: r.p }; }
      const u = x.v.toUpperCase();
      if (u === 'TRUE' || u === 'FALSE') return { n: 'bool', v: u === 'TRUE' };
      return { n: 'nome', v: x.v, p: x.p };
    }
    throw daxErro(`"${x.v}" fora do lugar`, src, x.p);
  }
  if (!tk.length) throw daxErro('escreva a fórmula da medida', src, 0);
  const arvore = expr();
  if (k < tk.length) throw daxErro(`sobrou "${tk[k].v}" — faltou uma vírgula, um operador ou fechar um parêntese?`, src, tk[k].p);
  return arvore;
}

/* ---------------- 2) tradução para SQL ---------------- */
// Cada pedaço traduzido diz de que "tipo" é: c = constante, a = já resumido (agregado), l = linha a linha (coluna solta)
const daxColuna = nome => { const u = String(nome).trim().toUpperCase(); return (ed.base.colunas || []).find(c => c.manter && (c.nome.toUpperCase() === u || String(c.rotulo).toUpperCase() === u)); };
const daxMedidaPorNome = nome => { const u = String(nome).trim().toUpperCase(); return (ed.base.medidas || []).find(m => m.nome.toUpperCase() === u); };
const daxEhTabela = nome => ['DADOS', String(ed.base.nome || '').toUpperCase()].includes(String(nome).trim().toUpperCase());
const daxFiltro = lista => lista.length ? ` filter (where ${lista.map(x => '(' + x + ')').join(' and ')})` : '';
function daxTipo(...ks){
  if (ks.includes('l') && ks.includes('a')) throw new Error('a fórmula mistura coluna linha a linha com medida/agregação. Dentro de SUMX/FILTER use só colunas; fora deles, resuma a coluna (SUM, AVERAGE...).');
  return ks.includes('l') ? 'l' : ks.includes('a') ? 'a' : 'c';
}
const daxCache = new Map();
function daxArvore(formula){
  if (!daxCache.has(formula)) { if (daxCache.size > 300) daxCache.clear(); daxCache.set(formula, daxParse(formula)); }
  return daxCache.get(formula);
}
// SQL de uma medida. filtros = condições de um CALCULATE de fora (valem também para as medidas citadas dentro dela)
function daxSqlMedida(m, filtros = [], pilha = new Set()){
  if (pilha.has(m.id)) throw new Error(`a medida ${m.nome} depende dela mesma (referência circular)`);
  const p2 = new Set(pilha); p2.add(m.id);
  if (m.tipo !== 'dax') return vzMedidaSql(m, p2); // medida antiga ainda não convertida
  let r;
  try {
    r = daxC(daxArvore(m.formula), { linha: false, filtros, vars: {}, pilha: p2 });
  } catch (e) {
    if (pilha.size && !e.message.startsWith('na medida ')) e.message = `na medida [${m.nome}]: ${e.message}`;
    throw e;
  }
  if (r.k === 'l') throw new Error('a fórmula termina numa coluna sem resumo. Use SUM(...), AVERAGE(...), COUNTROWS(...) ou SUMX(dados, ...).');
  return r.s;
}
function daxC(no, ctx){
  const C = (x, c2 = ctx) => daxC(x, c2);
  const emLinha = { ...ctx, linha: true };
  switch (no.n) {
    case 'num': return { s: String(no.v), k: 'c' };
    case 'str': return { s: estSqlTexto(no.v), k: 'c' };
    case 'bool': return { s: no.v ? 'true' : 'false', k: 'c' };
    case 'neg': { const a = C(no.a); return { s: `(-${a.s})`, k: a.k }; }
    case 'not': { const a = C(no.a); return { s: `(not ${a.s})`, k: a.k }; }
    case 'lista': throw new Error('lista entre { } só pode ser usada depois de IN (ex.: dados[local] IN {"A", "B"})');
    case 'in': {
      if (no.b.n !== 'lista') throw new Error('depois de IN vem uma lista entre chaves: {"A", "B"}');
      const a = C(no.a), itens = no.b.itens.map(x => C(x));
      return { s: `(${a.s} in (${itens.map(x => x.s).join(', ') || 'null'}))`, k: daxTipo(a.k, ...itens.map(x => x.k)) };
    }
    case 'bin': {
      const a = C(no.a), b = C(no.b), k = daxTipo(a.k, b.k);
      if (no.op === '^') return { s: `power(${a.s}, ${b.s})`, k };
      if (no.op === 'concat') return { s: `(coalesce(cast(${a.s} as varchar), '') || coalesce(cast(${b.s} as varchar), ''))`, k };
      return { s: `(${a.s} ${no.op} ${b.s})`, k };
    }
    case 'vars': {
      const novo = { ...ctx, vars: { ...ctx.vars } };
      for (const d of no.defs) novo.vars[d.nome.toUpperCase()] = C(d.expr, novo);
      return C(no.ret, novo);
    }
    case 'nome': {
      const v = ctx.vars[no.v.toUpperCase()];
      if (v) return v;
      if (daxEhTabela(no.v)) throw new Error(`a tabela ${no.v} só pode ser usada dentro de COUNTROWS, SUMX, FILTER...`);
      if (DAX_FUNCOES[no.v.toUpperCase()]) throw new Error(`faltou abrir parênteses depois de ${no.v.toUpperCase()}`);
      throw new Error(`não conheço "${no.v}". Se for coluna ou medida, escreva entre colchetes: [${no.v}]`);
    }
    case 'ref': return daxRef(no, ctx);
    case 'fn': return daxFuncao(no, ctx, C, emLinha);
  }
  throw new Error('parte da fórmula não reconhecida');
}
function daxRef(no, ctx){
  const col = daxColuna(no.nome);
  const med = no.tabela ? null : daxMedidaPorNome(no.nome);
  const semResumo = c => new Error(`a coluna [${c.rotulo}] precisa ser resumida: SUM(dados[${c.rotulo}]), AVERAGE(...), DISTINCTCOUNT(...) — ou use SUMX(dados, ...) para conta linha a linha`);
  if (no.tabela) {
    let c = col;
    if (!daxEhTabela(no.tabela)) {
      // E5: tabela = nome de uma base relacionada → coluna dela (ex.: 'OPERADORES RH'[TURNO])
      const t = String(no.tabela).trim().toUpperCase(), n = String(no.nome).trim().toUpperCase();
      const rel = (ed.base.colunas || []).filter(x => x._rel && String(x._relBase).toUpperCase() === t);
      if (!rel.length) throw new Error(`a tabela "${no.tabela}" não existe aqui — use dados[coluna] ou o nome de uma base relacionada`);
      c = rel.find(x => String(x._rotuloOriginal).toUpperCase() === n || String(x._nomeOriginal).toUpperCase() === n);
      if (!c) throw new Error(`a coluna [${no.nome}] não existe na base ${no.tabela}`);
    }
    if (!c) throw new Error(`a coluna ${no.tabela}[${no.nome}] não existe na base`);
    if (!ctx.linha) throw semResumo(c);
    return { s: vzId(c.nome), k: 'l' };
  }
  if (ctx.linha) {
    if (col) return { s: vzId(col.nome), k: 'l' };
    if (med) throw new Error(`a medida [${med.nome}] não pode ser usada linha a linha (dentro de SUMX, FILTER ou condição do CALCULATE) nesta versão`);
    throw new Error(`não existe coluna chamada [${no.nome}]`);
  }
  if (med) return { s: daxSqlMedida(med, ctx.filtros, ctx.pilha), k: 'a' };
  if (col) throw semResumo(col);
  throw new Error(`não existe medida nem coluna chamada [${no.nome}]`);
}
function daxFuncao(no, ctx, C, emLinha){
  const A = no.args, f = no.f;
  const qtd = (min, max = min) => {
    if (A.length < min || A.length > max) throw new Error(`${f} recebe ${min === max ? min : `de ${min} a ${max === 99 ? 'vários' : max}`} argumento(s) e recebeu ${A.length}. Forma: ${(DAX_FUNCOES[f] || [])[1] || f + '(...)'}`);
  };
  const semLinha = () => { if (ctx.linha) throw new Error(`${f} resume várias linhas e não pode ficar dentro de uma conta linha a linha (SUMX, FILTER, condição do CALCULATE)`); };
  const agg = sqlf => { semLinha(); qtd(1); const x = C(A[0], emLinha); return { s: sqlf(x.s) + daxFiltro(ctx.filtros), k: 'a' }; };
  // 1º argumento de COUNTROWS/SUMX...: a tabela "dados" ou FILTER(dados, condição) → devolve as condições extras
  const tabela = t => {
    if (t.n === 'nome') { if (!daxEhTabela(t.v)) throw new Error(`a tabela "${t.v}" não existe aqui — use dados`); return []; }
    if (t.n === 'fn' && t.f === 'FILTER') {
      if (t.args.length !== 2) throw new Error('FILTER recebe 2 argumentos: FILTER(dados, condição)');
      return [...tabela(t.args[0]), C(t.args[1], emLinha).s];
    }
    if (t.n === 'fn' && ['ALL', 'ALLSELECTED', 'REMOVEFILTERS', 'VALUES'].includes(t.f)) throw new Error(`${t.f} chega junto com os filtros do relatório (etapa E2d)`);
    throw new Error(`o 1º argumento de ${f} deve ser a tabela (dados) ou FILTER(dados, condição)`);
  };
  const iter = sqlf => { semLinha(); qtd(2); const fx = tabela(A[0]); const x = C(A[1], emLinha); return { s: sqlf(x.s) + daxFiltro([...ctx.filtros, ...fx]), k: 'a' }; };
  const escalar = (sqlf, min, max = min) => { qtd(min, max); const xs = A.map(a => C(a)); return { s: sqlf(...xs.map(x => x.s)), k: daxTipo(...xs.map(x => x.k)) }; };
  const condCalc = a => {
    if (a.n === 'fn' && a.f === 'FILTER') return tabela(a);
    if (a.n === 'fn' && a.f === 'KEEPFILTERS') { if (a.args.length !== 1) throw new Error('KEEPFILTERS recebe 1 condição'); return condCalc(a.args[0]); }
    if (a.n === 'fn' && ['ALL', 'ALLSELECTED', 'REMOVEFILTERS'].includes(a.f)) throw new Error(`${a.f} chega junto com os filtros do relatório (etapa E2d)`);
    return [C(a, emLinha).s];
  };
  switch (f) {
    case 'SUM': return agg(x => `sum(${x})`);
    case 'AVERAGE': return agg(x => `avg(${x})`);
    case 'MEDIAN': return agg(x => `median(${x})`);
    case 'COUNT': case 'COUNTA': return agg(x => `count(${x})`);
    case 'DISTINCTCOUNT': return agg(x => `count(distinct ${x})`);
    case 'COUNTBLANK': { semLinha(); qtd(1); const x = C(A[0], emLinha); return { s: 'count(*)' + daxFiltro([...ctx.filtros, `${x.s} is null`]), k: 'a' }; }
    case 'MIN': case 'MAX':
      if (A.length === 2) return escalar((a, b) => `${f === 'MIN' ? 'least' : 'greatest'}(${a}, ${b})`, 2);
      return agg(x => `${f.toLowerCase()}(${x})`);
    case 'COUNTROWS': { semLinha(); qtd(1); return { s: 'count(*)' + daxFiltro([...ctx.filtros, ...tabela(A[0])]), k: 'a' }; }
    case 'SUMX': return iter(x => `sum(${x})`);
    case 'AVERAGEX': return iter(x => `avg(${x})`);
    case 'MINX': return iter(x => `min(${x})`);
    case 'MAXX': return iter(x => `max(${x})`);
    case 'COUNTX': return iter(x => `count(${x})`);
    case 'MEDIANX': return iter(x => `median(${x})`);
    case 'CALCULATE': {
      semLinha(); qtd(1, 99);
      const conds = A.slice(1).flatMap(condCalc);
      const x = C(A[0], { ...ctx, filtros: [...ctx.filtros, ...conds] });
      if (x.k === 'l') throw new Error('o 1º argumento do CALCULATE precisa ser uma conta resumida (ex.: COUNTROWS(dados), SUM(...), [MEDIDA])');
      return x;
    }
    case 'FILTER': throw new Error('FILTER devolve linhas (uma tabela): use dentro de CALCULATE, COUNTROWS ou SUMX');
    case 'DIVIDE': {
      qtd(2, 3);
      const [a, b, alt] = A.map(x => C(x));
      return { s: `(case when (${b.s}) is null or (${b.s}) = 0 then ${alt ? alt.s : 'null'} else (${a.s}) / (${b.s}) end)`, k: daxTipo(a.k, b.k, ...(alt ? [alt.k] : [])) };
    }
    case 'IF': {
      qtd(2, 3);
      const [c, a, b] = A.map(x => C(x));
      return { s: `(case when ${c.s} then ${a.s} else ${b ? b.s : 'null'} end)`, k: daxTipo(c.k, a.k, ...(b ? [b.k] : [])) };
    }
    case 'SWITCH': {
      qtd(3, 99);
      const verdade = (A[0].n === 'fn' && A[0].f === 'TRUE') || (A[0].n === 'bool' && A[0].v);
      const base = verdade ? null : C(A[0]);
      const resto = A.slice(1).map(x => C(x));
      let s = base ? `(case ${base.s}` : '(case', i = 0;
      for (; i + 1 < resto.length; i += 2) s += ` when ${resto[i].s} then ${resto[i + 1].s}`;
      s += (i < resto.length ? ` else ${resto[i].s}` : '') + ' end)';
      return { s, k: daxTipo(...(base ? [base.k] : []), ...resto.map(x => x.k)) };
    }
    case 'AND': return escalar((a, b) => `(${a} and ${b})`, 2);
    case 'OR': return escalar((a, b) => `(${a} or ${b})`, 2);
    case 'NOT': return escalar(a => `(not ${a})`, 1);
    case 'ISBLANK': return escalar(a => `(${a} is null)`, 1);
    case 'BLANK': qtd(0); return { s: 'null', k: 'c' };
    case 'TRUE': qtd(0); return { s: 'true', k: 'c' };
    case 'FALSE': qtd(0); return { s: 'false', k: 'c' };
    case 'COALESCE': return escalar((...xs) => `coalesce(${xs.join(', ')})`, 2, 99);
    case 'ABS': return escalar(a => `abs(${a})`, 1);
    case 'SQRT': return escalar(a => `sqrt(${a})`, 1);
    case 'INT': return escalar(a => `floor(${a})`, 1);
    case 'ROUND': return escalar((a, d = '0') => `round(${a}, ${d})`, 1, 2);
    case 'ROUNDUP': return escalar((a, d = '0') => `(ceil((${a}) * power(10, ${d})) / power(10, ${d}))`, 1, 2);
    case 'ROUNDDOWN': return escalar((a, d = '0') => `(trunc((${a}) * power(10, ${d})) / power(10, ${d}))`, 1, 2);
    case 'POWER': return escalar((a, b) => `power(${a}, ${b})`, 2);
    case 'MOD': return escalar((a, b) => `((${a}) % (${b}))`, 2);
    case 'CONTAINSSTRING': return escalar((a, b) => `contains(lower(cast(${a} as varchar)), lower(cast(${b} as varchar)))`, 2);
    case 'LEFT': return escalar((a, n) => `left(cast(${a} as varchar), ${n})`, 2);
    case 'RIGHT': return escalar((a, n) => `right(cast(${a} as varchar), ${n})`, 2);
    case 'LEN': return escalar(a => `length(cast(${a} as varchar))`, 1);
    case 'UPPER': return escalar(a => `upper(cast(${a} as varchar))`, 1);
    case 'LOWER': return escalar(a => `lower(cast(${a} as varchar))`, 1);
    case 'TRIM': return escalar(a => `trim(cast(${a} as varchar))`, 1);
    case 'CONCATENATE': return escalar((a, b) => `(coalesce(cast(${a} as varchar), '') || coalesce(cast(${b} as varchar), ''))`, 2);
    case 'YEAR': case 'MONTH': case 'DAY': case 'HOUR': case 'MINUTE': return escalar(a => `${f.toLowerCase()}(${a})`, 1);
    case 'WEEKDAY': return escalar(a => `(dayofweek(${a}) + 1)`, 1);
    case 'DATE': return escalar((y, m, d) => `make_date(cast(${y} as bigint), cast(${m} as bigint), cast(${d} as bigint))`, 3);
    case 'TIME': return escalar((h, m, s) => `make_time(cast(${h} as bigint), cast(${m} as bigint), cast(${s} as double))`, 3);
    case 'TODAY': qtd(0); return { s: 'current_date', k: 'c' };
    case 'META': qtd(0); return { s: String((ed.meta ?? 90) / 100), k: 'c' };
  }
  throw new Error(`a função ${f} não existe ou ainda não é aceita aqui. Veja a lista de funções ao lado.`);
}

/* ---------------- 3) medidas antigas (formulário) → DAX ---------------- */
function daxDeLegado(m){
  const ref = n => `dados[${(vzColuna(n) || { rotulo: n }).rotulo}]`;
  const lit = (col, valor) => {
    const c = vzColuna(col) || { tipo: 'texto' }, v = String(valor ?? '').trim();
    if (['inteiro', 'decimal'].includes(c.tipo)) return String(Number(v.replace(/\./g, '').replace(',', '.')));
    if (c.tipo === 'data' || c.tipo === 'data_hora') {
      const d = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/), iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (d) return `DATE(${d[3]}, ${+d[2]}, ${+d[1]})`;
      if (iso) return `DATE(${iso[1]}, ${+iso[2]}, ${+iso[3]})`;
    }
    if (c.tipo === 'hora') { const h = v.match(/^(\d{1,2}):(\d{2})$/); if (h) return `TIME(${+h[1]}, ${+h[2]}, 0)`; }
    return '"' + v.replace(/"/g, '""') + '"';
  };
  const cond = k => {
    const c = ref(k.coluna);
    if (k.op === 'vazio') return `ISBLANK(${c})`;
    if (k.op === 'nao_vazio') return `NOT ISBLANK(${c})`;
    if (k.op === 'contem') return `CONTAINSSTRING(${c}, "${String(k.valor || '').replace(/"/g, '""')}")`;
    if (k.op === 'em') return `${c} IN {${String(k.valor || '').split(';').map(x => x.trim()).filter(Boolean).map(x => lit(k.coluna, x)).join(', ')}}`;
    return `${c} ${k.op} ${lit(k.coluna, k.valor)}`;
  };
  const nomeMed = id => { const x = (ed.base.medidas || []).find(y => y.id === id); return x ? `[${x.nome}]` : 'BLANK()'; };
  let f;
  switch (m.tipo) {
    case 'soma': f = `SUM(${ref(m.coluna)})`; break;
    case 'media': f = `AVERAGE(${ref(m.coluna)})`; break;
    case 'contagem': f = 'COUNTROWS(dados)'; break;
    case 'contagem_distinta': f = `DISTINCTCOUNT(${ref(m.coluna)})`; break;
    case 'minimo': f = `MIN(${ref(m.coluna)})`; break;
    case 'maximo': f = `MAX(${ref(m.coluna)})`; break;
    case 'media_ponderada': f = `DIVIDE(SUMX(dados, ${ref(m.coluna)} * ${ref(m.peso)}), SUM(${ref(m.peso)}))`; break;
    case 'divisao': f = `DIVIDE(${nomeMed(m.medida_a)}, ${nomeMed(m.medida_b)})`; break;
    default: f = 'BLANK()';
  }
  const conds = m.tipo === 'divisao' ? [] : (m.condicoes || []).filter(k => k.coluna);
  if (conds.length) f = `CALCULATE(\n    ${f},\n    ${conds.map(cond).join(',\n    ')}\n)`;
  const fator = Number(m.fator || 1);
  if (fator !== 1) f = `(${f}) * ${fator}`;
  return { id: m.id, nome: m.nome, tipo: 'dax', formula: f, formato: m.formato || 'auto' };
}
// Ao abrir o editor: medidas do formulário antigo viram fórmula DAX (o resultado é o mesmo) e são gravadas na base
async function daxConverterMedidasAntigas(){
  const lista = ed.base.medidas || [];
  const antigas = lista.filter(m => m.tipo !== 'dax');
  if (!antigas.length) return;
  const novas = lista.map(m => m.tipo === 'dax' ? m : daxDeLegado(m));
  ed.base.medidas = novas;
  try {
    await vzGravarMedidas(novas);
    showToast(`${antigas.length} medida(s) do formulário antigo agora estão em fórmula DAX (mesmo resultado).`);
  } catch (erro) {
    showToast('As medidas foram convertidas para DAX nesta tela, mas não foi possível gravar: ' + erro.message, 'erro');
  }
}

/* ---------------- 4) janela de fórmula ---------------- */
let vzMed = null; // medida em edição
const DAX_TAM_CHAVE = 'dashbi-dax-tam';
function vzAbrirMedida(id){
  const existente = id ? vzMedida(id) : null;
  vzMed = existente ? { ...existente, formula: existente.tipo === 'dax' ? existente.formula : daxDeLegado(existente).formula, nomeAntigo: existente.nome }
                    : { id: edNovoId('m'), nome: '', formula: '', formato: 'auto' };
  vzMed._nova = !existente;
  let jan = edEl('vz-janela');
  if (!jan) { jan = document.createElement('div'); jan.id = 'vz-janela'; jan.className = 'modal-overlay active vz-janela'; edEl('ed-overlay').appendChild(jan); }
  jan.classList.add('active');
  vzRenderMedida();
}
function vzFecharMedida(){
  const caixa = edEl('vz-dax-jan');
  if (caixa && !caixa.classList.contains('max')) { try { localStorage.setItem(DAX_TAM_CHAVE, JSON.stringify({ w: caixa.offsetWidth, h: caixa.offsetHeight })); } catch (e) {} }
  const j = edEl('vz-janela'); if (j) j.remove();
  vzMed = null;
}
function vzRenderMedida(){
  const m = vzMed;
  let tam = null; try { tam = JSON.parse(localStorage.getItem(DAX_TAM_CHAVE) || 'null'); } catch (e) {}
  const estiloTam = tam && tam.w ? `width:${tam.w}px;height:${tam.h}px` : '';
  const x = '<path d="M18 6L6 18M6 6l12 12"/>', maxi = '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>';
  edEl('vz-janela').innerHTML = `
    <div class="vz-dax-jan" id="vz-dax-jan" style="${estiloTam}">
      <div class="vz-dax-cab">
        <span class="vz-dax-fx">fx</span>
        <span class="vz-dax-titulo">${m._nova ? 'Nova medida' : 'Editar medida'}</span>
        <label class="vz-dax-rot" for="vz-m-nome">Nome</label>
        <input id="vz-m-nome" class="caixa-alta vz-dax-nome" type="text" value="${estEsc(m.nome)}" placeholder="EX.: CSAT" oninput="vzMed.nome=this.value.toUpperCase(); vzDaxAgendar()">
        <label class="vz-dax-rot" for="vz-m-formato">Formato</label>
        <select id="vz-m-formato" class="vz-dax-sel" onchange="vzMed.formato=this.value; vzDaxAgendar()">${Object.entries(VZ_FORMATOS).map(([k, r]) => `<option value="${k}" ${k === m.formato ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <span class="vz-dax-esp"></span>
        <button class="btn-icon" onclick="vzDaxMaximizar()" title="Maximizar / restaurar">${edIcone(maxi, 16)}</button>
        <button class="btn-icon" onclick="vzFecharMedida()" title="Fechar">${edIcone(x, 18)}</button>
      </div>
      <div class="vz-dax-corpo">
        <div class="vz-dax-esq">
          <div class="vz-dax-editor">
            <div class="vz-dax-linhas" id="vz-dax-linhas">1</div>
            <div class="vz-dax-area">
              <pre class="vz-dax-cor" id="vz-dax-cor" aria-hidden="true"></pre>
              <textarea id="vz-m-formula" spellcheck="false" wrap="off" autocomplete="off"
                placeholder="Escreva em DAX. Exemplos:&#10;COUNTROWS(dados)&#10;CALCULATE(COUNTROWS(dados), dados[cont lov] = 1)&#10;DIVIDE(SUMX(dados, dados[TMA] * dados[CONT_TOT]), SUM(dados[CONT_TOT]))"
                oninput="vzDaxDigitou()" onkeydown="vzDaxTecla(event)" onscroll="vzDaxRolou()" onclick="vzDaxFecharSug()" onblur="setTimeout(vzDaxFecharSug, 150)">${estEsc(m.formula)}</textarea>
            </div>
            <div class="vz-dax-sug hidden" id="vz-dax-sug"></div>
          </div>
          <div class="vz-previa vz-dax-status" id="vz-m-previa">—</div>
          <details class="vz-dax-sql"><summary>Como o sistema calcula (SQL)</summary><pre id="vz-dax-sqltxt">—</pre></details>
        </div>
        <div class="vz-dax-lista">
          <input id="vz-dax-busca" class="ed-inp" type="search" placeholder="Buscar medida, coluna ou função" oninput="vzDaxRenderLista()">
          <div class="vz-dax-itens" id="vz-dax-itens"></div>
        </div>
      </div>
      <div class="vz-dax-rodape">
        ${m._nova ? '' : `<button class="btn btn-danger-ghost" style="width:auto" onclick="vzExcluirMedida('${m.id}')">Excluir</button>`}
        <span class="vz-dax-dica">Clique num item da lista para inserir · <b>Ctrl+Espaço</b> sugere · <b>Tab</b> aceita a sugestão · <b>Ctrl+Enter</b> salva · arraste o canto para mudar o tamanho</span>
        <button class="btn btn-ghost" style="width:auto" onclick="vzFecharMedida()">Cancelar</button>
        <button class="btn btn-primary" style="width:auto" id="vz-m-salvar" onclick="vzSalvarMedida()">Salvar medida</button>
      </div>
    </div>`;
  vzDaxRenderLista();
  vzDaxColorir();
  vzDaxAgendar();
  const ta = edEl('vz-m-formula'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
}
function vzDaxMaximizar(){ const c = edEl('vz-dax-jan'); c.classList.toggle('max'); }

// Cores: funções, medidas, colunas, textos, números e comentários com cores diferentes
function vzDaxColorir(){
  const ta = edEl('vz-m-formula'), pre = edEl('vz-dax-cor');
  if (!ta || !pre) return;
  const src = ta.value, tk = daxTokens(src, true);
  const vars = new Set();
  tk.forEach((x, i) => { if (x.t === 'id' && x.v.toUpperCase() === 'VAR') { const n = tk.slice(i + 1).find(y => y.t !== 'esp'); if (n && n.t === 'id') vars.add(n.v.toUpperCase()); } });
  const proximo = i => tk.slice(i + 1).find(y => y.t !== 'esp');
  let html = '', ultimo = 0;
  tk.forEach((x, i) => {
    const bruto = src.slice(x.p, x.t === 'str' || x.t === 'ref' || x.t === 'tab' ? (x.fim || src.length) : x.p + x.v.length);
    html += estEsc(src.slice(ultimo, x.p));
    let cls = '';
    if (x.t === 'id') {
      const u = x.v.toUpperCase(), prox = proximo(i);
      if (DAX_PALAVRAS.includes(u) && !(prox && prox.v === '(' && DAX_FUNCOES[u])) cls = 'kw';
      else if (prox && prox.v === '(') cls = DAX_FUNCOES[u] ? 'fn' : 'erro';
      else if (vars.has(u)) cls = 'var';
      else if (daxEhTabela(x.v)) cls = 'tab';
    } else if (x.t === 'ref') cls = daxColuna(x.v) || (ed.base.colunas || []).some(c => c._rel && String(c._rotuloOriginal).toUpperCase() === x.v.trim().toUpperCase()) ? 'col' : daxMedidaPorNome(x.v) ? 'med' : 'erro';
    else if (x.t === 'tab' && (ed.base.colunas || []).some(c => c._rel && String(c._relBase).toUpperCase() === x.v.trim().toUpperCase())) cls = 'tab';
    else cls = { num: 'num', str: 'str', com: 'com', tab: 'tab', txt: 'erro' }[x.t] || '';
    html += cls ? `<span class="dx-${cls}">${estEsc(bruto)}</span>` : estEsc(bruto);
    ultimo = x.p + bruto.length;
  });
  html += estEsc(src.slice(ultimo));
  pre.innerHTML = html + '\n ';
  const n = src.split('\n').length;
  edEl('vz-dax-linhas').innerHTML = Array.from({ length: n }, (_, i) => i + 1).join('<br>');
  vzDaxRolou();
}
function vzDaxRolou(){
  const ta = edEl('vz-m-formula'), pre = edEl('vz-dax-cor'), ln = edEl('vz-dax-linhas');
  if (!ta) return;
  pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; ln.scrollTop = ta.scrollTop;
}
function vzDaxDigitou(){
  vzMed.formula = edEl('vz-m-formula').value;
  vzDaxColorir();
  vzDaxSugerir(false);
  vzDaxAgendar();
}
// Insere texto onde está o cursor (substituindo desde "ini", quando é uma sugestão). execCommand mantém o Ctrl+Z do campo.
function vzDaxInserir(txt, ini){
  const ta = edEl('vz-m-formula');
  ta.focus();
  if (ini != null) ta.setSelectionRange(ini, ta.selectionEnd);
  if (!document.execCommand('insertText', false, txt)) ta.setRangeText(txt, ta.selectionStart, ta.selectionEnd, 'end');
  vzDaxDigitou();
}

// Sugestões enquanto digita: depois de "[" (medidas e colunas) ou ao digitar o começo de uma função
let vzDaxSugs = [], vzDaxSugSel = 0, vzDaxSugIni = 0;
function vzDaxSugerir(forcar){
  const ta = edEl('vz-m-formula'), caixa = edEl('vz-dax-sug');
  const antes = ta.value.slice(0, ta.selectionStart);
  let m, itens = [];
  const medidas = (ed.base.medidas || []).filter(x => !vzMed || x.id !== vzMed.id);
  const colunas = (ed.base.colunas || []).filter(c => c.manter);
  if ((m = antes.match(/\[([^\[\]\n]*)$/))) {
    const q = m[1].toUpperCase(); vzDaxSugIni = ta.selectionStart - m[1].length - 1;
    const naTabela = /dados\s*$/i.test(antes.slice(0, vzDaxSugIni)); // "dados[" → só colunas
    itens = (naTabela ? [] : medidas.map(x => ({ rot: x.nome, tipo: 'med', ins: `[${x.nome}]` })))
      .concat(colunas.map(c => ({ rot: c.rotulo, tipo: 'col', ins: `[${c.rotulo}]` })))
      .filter(x => x.rot.toUpperCase().includes(q));
  } else if ((m = antes.match(/([A-Za-z_][A-Za-z0-9_]*)$/)) && (m[1].length >= 2 || forcar)) {
    const q = m[1].toUpperCase(); vzDaxSugIni = ta.selectionStart - m[1].length;
    itens = Object.keys(DAX_FUNCOES).filter(f => f.startsWith(q)).map(f => ({ rot: f, tipo: 'fn', ins: f + '(', desc: DAX_FUNCOES[f][1] }))
      .concat('DADOS'.startsWith(q) ? [{ rot: 'dados', tipo: 'tab', ins: 'dados' }] : [])
      .concat(['VAR', 'RETURN'].filter(p => p.startsWith(q) && p !== q).map(p => ({ rot: p, tipo: 'kw', ins: p + ' ' })));
  } else if (forcar) {
    vzDaxSugIni = ta.selectionStart;
    itens = medidas.map(x => ({ rot: x.nome, tipo: 'med', ins: `[${x.nome}]` })).concat(Object.keys(DAX_FUNCOES).map(f => ({ rot: f, tipo: 'fn', ins: f + '(', desc: DAX_FUNCOES[f][1] })));
  }
  vzDaxSugs = itens.slice(0, 12); vzDaxSugSel = 0;
  if (!vzDaxSugs.length) { caixa.classList.add('hidden'); return; }
  vzDaxRenderSug();
  // posição: logo abaixo do cursor (fonte de largura fixa → coluna × largura da letra)
  const est = getComputedStyle(ta), linhas = antes.split('\n'), col = linhas[linhas.length - 1].length;
  const ctx = (vzDaxSugerir._c = vzDaxSugerir._c || document.createElement('canvas').getContext('2d'));
  ctx.font = `${est.fontSize} ${est.fontFamily}`;
  const larg = ctx.measureText('M').width, alt = parseFloat(est.lineHeight) || parseFloat(est.fontSize) * 1.5;
  const area = ta.parentElement, base = area.offsetLeft;
  caixa.style.left = Math.min(base + parseFloat(est.paddingLeft) + col * larg - ta.scrollLeft, area.parentElement.clientWidth - 330) + 'px';
  caixa.style.top = (parseFloat(est.paddingTop) + linhas.length * alt - ta.scrollTop + 4) + 'px';
}
function vzDaxRenderSug(){
  const icone = { med: 'Σ', col: '▦', fn: 'ƒ', tab: '⊞', kw: '·' };
  edEl('vz-dax-sug').innerHTML = vzDaxSugs.map((s, i) => `<div class="vz-dax-sug-item ${i === vzDaxSugSel ? 'sel' : ''} dx-${s.tipo}" onmousedown="event.preventDefault(); vzDaxAceitar(${i})">
      <span class="vz-dax-sug-ico">${icone[s.tipo]}</span><span>${estEsc(s.rot)}</span>${s.desc ? `<span class="vz-dax-sug-desc">${estEsc(s.desc)}</span>` : ''}</div>`).join('');
  edEl('vz-dax-sug').classList.remove('hidden');
}
function vzDaxAceitar(i){ const s = vzDaxSugs[i]; vzDaxFecharSug(); if (s) vzDaxInserir(s.ins, vzDaxSugIni); }
function vzDaxFecharSug(){ const c = edEl('vz-dax-sug'); if (c) c.classList.add('hidden'); vzDaxSugs = []; }
function vzDaxTecla(e){
  const aberta = vzDaxSugs.length && !edEl('vz-dax-sug').classList.contains('hidden');
  if (aberta && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
    e.preventDefault(); vzDaxSugSel = (vzDaxSugSel + (e.key === 'ArrowDown' ? 1 : vzDaxSugs.length - 1)) % vzDaxSugs.length; vzDaxRenderSug(); return;
  }
  if (aberta && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); vzDaxAceitar(vzDaxSugSel); return; }
  if (aberta && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); vzDaxFecharSug(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); vzSalvarMedida(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === ' ') { e.preventDefault(); vzDaxSugerir(true); return; }
  if (e.key === 'Tab') { e.preventDefault(); vzDaxInserir('    '); }
}

// Lista à direita: medidas, colunas (por tipo) e funções (por grupo). Clique = insere na fórmula.
function vzDaxRenderLista(){
  const q = (edEl('vz-dax-busca').value || '').trim().toUpperCase();
  const ok = s => !q || String(s).toUpperCase().includes(q);
  const item = (cls, ico, rot, ins, titulo, desc) => `<button class="vz-dax-item dx-${cls}" title="${estEsc(titulo || rot)}" onmousedown="event.preventDefault()" onclick='vzDaxInserir(${JSON.stringify(ins).replace(/'/g, '&#39;')})'>
      <span class="vz-dax-sug-ico">${ico}</span><span class="vz-dax-item-nome">${estEsc(rot)}</span>${desc ? `<span class="vz-dax-item-desc">${estEsc(desc)}</span>` : ''}</button>`;
  const grupo = (nome, html) => html ? `<div class="vz-dax-grupo">${nome}</div>${html}` : '';
  const medidas = (ed.base.medidas || []).filter(m => (!vzMed || m.id !== vzMed.id) && ok(m.nome));
  let html = grupo('Medidas', medidas.map(m => item('med', 'Σ', m.nome, `[${m.nome}]`, m.formula)).join(''));
  const tipos = [['Datas e horas', ['data', 'data_hora', 'hora']], ['Textos', ['texto']], ['Números', ['inteiro', 'decimal']]];
  for (const [nome, ts] of tipos) {
    html += grupo('Colunas · ' + nome, (ed.base.colunas || []).filter(c => c.manter && ts.includes(c.tipo) && ok(c.rotulo)).map(c => item('col', '▦', c.rotulo, `dados[${c.rotulo}]`, `dados[${c.rotulo}] · ${c.tipo}`)).join(''));
  }
  const grupos = [...new Set(Object.values(DAX_FUNCOES).map(x => x[0]))];
  for (const g of grupos) {
    html += grupo('Funções · ' + g, Object.entries(DAX_FUNCOES).filter(([f, x]) => x[0] === g && (ok(f) || ok(x[2]))).map(([f, x]) => item('fn', 'ƒ', f, f + '(', `${x[1]} — ${x[2]}`, x[2])).join(''));
  }
  edEl('vz-dax-itens').innerHTML = html || '<div class="ed-info">Nada encontrado.</div>';
}

// Resultado ao vivo (espera a pessoa parar de digitar por um instante)
let vzDaxTimer = null;
function vzDaxAgendar(){ clearTimeout(vzDaxTimer); vzDaxTimer = setTimeout(vzPreviaMedida, 300); }
// Monta a medida temporária e devolve o SQL (ou lança o erro em português)
function vzDaxCompilarTemp(m){
  const temp = { id: m.id, nome: (m.nome || '').trim().toUpperCase() || '(SEM NOME)', tipo: 'dax', formula: m.formula || '', formato: m.formato };
  const antes = ed.base.medidas;
  ed.base.medidas = (antes || []).filter(x => x.id !== temp.id).concat([temp]);
  try { return { temp, sql: daxSqlMedida(temp) }; } finally { ed.base.medidas = antes; }
}
async function vzPreviaMedida(){
  const alvo = edEl('vz-m-previa'), sqlTxt = edEl('vz-dax-sqltxt');
  if (!alvo || !vzMed) return;
  if (!String(vzMed.formula || '').trim()) { alvo.innerHTML = '<span class="ed-fraco">Escreva a fórmula. Dica: comece com o nome de uma função (ex.: SUM) e use Tab para aceitar a sugestão.</span>'; sqlTxt.textContent = '—'; return; }
  let comp;
  try { comp = vzDaxCompilarTemp(vzMed); }
  catch (erro) { alvo.innerHTML = `<span class="vz-erro">⚠ ${estEsc(erro.message)}</span>`; sqlTxt.textContent = '—'; return; }
  sqlTxt.textContent = comp.sql;
  if (!ed.dadosProntos) { alvo.textContent = 'Fórmula correta. Os dados ainda estão carregando…'; return; }
  const meu = (alvo._n || 0) + 1; alvo._n = meu;
  try {
    const r = (await estSql(`select ${comp.sql} as v from dados`))[0];
    if (alvo._n === meu) alvo.innerHTML = `<span class="vz-dax-ok">✓</span> Resultado com os dados carregados: <b>${estEsc(vzFmt(r.v, comp.temp.formato))}</b>`;
  } catch (erro) {
    if (alvo._n === meu) alvo.innerHTML = `<span class="vz-erro">⚠ O motor recusou a conta: ${estEsc(erro.message.split('\n')[0])}</span>`;
  }
}
async function vzGravarMedidas(lista){
  const r = await estApi('PUT', `/api/estudio/bases/${ed.base.id}/medidas`, { medidas: lista });
  ed.base.medidas = r.base.medidas;
}
const daxEscRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const daxCita = (formula, nome) => new RegExp(`\\[\\s*${daxEscRegex(nome)}\\s*\\]`, 'i').test(formula || '');
async function vzSalvarMedida(){
  const m = vzMed, nome = String(m.nome || '').trim().toUpperCase();
  if (!nome) { showToast('Dê um nome para a medida.', 'erro'); return; }
  if (/[\[\]]/.test(nome)) { showToast('O nome da medida não pode ter colchetes [ ].', 'erro'); return; }
  if ((ed.base.medidas || []).some(x => x.id !== m.id && x.nome.toUpperCase() === nome)) { showToast(`Já existe uma medida chamada ${nome}.`, 'erro'); return; }
  if (daxColuna(nome)) { showToast(`Já existe uma coluna chamada ${nome}: escolha outro nome para a medida.`, 'erro'); return; }
  try { vzDaxCompilarTemp({ ...m, nome }); } catch (erro) { showToast('A fórmula tem um problema: ' + erro.message, 'erro'); return; }
  const limpa = { id: m.id, nome, tipo: 'dax', formula: m.formula.trim(), formato: m.formato || 'auto' };
  let lista = (ed.base.medidas || []).filter(x => x.id !== m.id).concat([limpa]);
  // Renomeou: as outras fórmulas que citavam [NOME ANTIGO] passam a citar [NOME NOVO]
  if (m.nomeAntigo && m.nomeAntigo !== nome) {
    const re = new RegExp(`\\[\\s*${daxEscRegex(m.nomeAntigo)}\\s*\\]`, 'gi');
    lista = lista.map(x => x.tipo === 'dax' && x.id !== m.id ? { ...x, formula: x.formula.replace(re, `[${nome}]`) } : x);
  }
  const botao = edEl('vz-m-salvar'); botao.disabled = true;
  try {
    await vzGravarMedidas(lista);
    vzFecharMedida();
    showToast(`Medida ${nome} salva na base.`);
    edRenderDados(); vzRenderTodos(); if (ed.sel) edRenderProps();
  } catch (erro) { showToast(erro.message, 'erro'); botao.disabled = false; }
}
async function vzExcluirMedida(id){
  const m = vzMedida(id);
  const usadaEm = ed.def.guias.flatMap(g => g.visuais).filter(v => Object.values(v.campos || {}).flat().some(it => it.tipo === 'medida' && it.id === id));
  const dependentes = (ed.base.medidas || []).filter(x => x.id !== id && x.tipo === 'dax' && daxCita(x.formula, m.nome));
  if (dependentes.length) { showToast(`Não dá para excluir: a medida ${dependentes[0].nome} usa [${m.nome}] na fórmula.`, 'erro'); return; }
  if (!confirm(`Excluir a medida ${m.nome}?${usadaEm.length ? ` Ela está em ${usadaEm.length} visual(is) deste relatório, que ficarão sem esse valor.` : ''} Outros relatórios desta base também perdem a medida.`)) return;
  try {
    await vzGravarMedidas((ed.base.medidas || []).filter(x => x.id !== id));
    vzFecharMedida(); edRenderDados(); vzRenderTodos(); if (ed.sel) edRenderProps();
    showToast('Medida excluída.');
  } catch (erro) { showToast(erro.message, 'erro'); }
}
