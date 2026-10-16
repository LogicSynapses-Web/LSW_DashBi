/* =====================================================================
   LSW_DashBi · DADOS DE DEMONSTRAÇÃO (todos fictícios)
   Gera, sempre do mesmo jeito (sorteio com "semente" fixa):
   - as avaliações do Painel CSAT de exemplo;
   - a planilha de exemplo usada no tutorial do Estúdio (atendimentos_exemplo.csv).
   Nenhum nome aqui é de pessoa real.
   ===================================================================== */
const LSW_DADOS = (() => {
  // Sorteio repetível (mulberry32): a mesma semente gera sempre a mesma sequência
  function sorteio(semente) {
    let a = semente >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const NOMES = ['ANA', 'BRUNO', 'CARLA', 'DIEGO', 'ELISA', 'FÁBIO', 'GABRIELA', 'HEITOR', 'ISABELA', 'JOÃO', 'KAREN', 'LUCAS', 'MARIANA', 'NICOLAS',
    'OLÍVIA', 'PEDRO', 'RAFAELA', 'SAMUEL', 'TATIANA', 'VITOR', 'YASMIN', 'WAGNER', 'BEATRIZ', 'CAIO', 'DANIELA', 'EDUARDO', 'FERNANDA', 'GUSTAVO'];
  const SOBRENOMES = ['SILVA', 'SOUZA', 'COSTA', 'PEREIRA', 'ROCHA', 'LIMA', 'MARTINS', 'CARVALHO', 'GOMES', 'RIBEIRO', 'ARAÚJO', 'BARBOSA', 'MOREIRA', 'NUNES'];
  const SUPERVISORES = ['RENATA PRADO', 'MARCOS VIANA', 'PATRÍCIA DUARTE', 'LEONARDO FARIAS', 'CAMILA TORRES', ''];
  const OPERACOES = ['VENDAS', 'SUPORTE TÉCNICO', 'COBRANÇA', 'RETENÇÃO', 'SAC', ''];
  // Locais: SEDE, FILIAL RJ e FILIAL BH formam a EPS "PRÓPRIA"; os parceiros mantêm o próprio nome
  const LOCAIS = ['SEDE', 'FILIAL RJ', 'FILIAL BH', 'PARCEIRO ALFA', 'PARCEIRO BETA', ''];
  const pega = (r, lista) => lista[Math.floor(r() * lista.length)];
  const nota = r => { const x = r(); return x < 0.06 ? 1 : x < 0.11 ? 2 : x < 0.15 ? 3 : x < 0.40 ? 4 : 5; };
  const iso = d => d.toISOString().slice(0, 10);
  const uuid = r => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const v = Math.floor(r() * 16); return (c === 'x' ? v : (v & 3 | 8)).toString(16); });

  // 40 atendentes, cada um com supervisor, operação e local fixos (como numa operação de verdade)
  function equipe(r) {
    const usados = new Set(), lista = [];
    while (lista.length < 40) {
      const nome = pega(r, NOMES) + ' ' + pega(r, SOBRENOMES) + ' ' + pega(r, SOBRENOMES);
      if (usados.has(nome)) continue; usados.add(nome);
      const i = lista.length;
      lista.push({ nome, sup: SUPERVISORES[i % 6], oper: i % 13 === 7 ? '' : OPERACOES[i % 5], loc: i % 11 === 9 ? '' : LOCAIS[i % 5] });
    }
    return lista;
  }

  // Avaliações do Painel CSAT: últimos 20 dias (até ontem), ~120 por dia, 08:00 às 20:30
  function avaliacoesCsat() {
    const r = sorteio(20261013), ops = equipe(r), linhas = [];
    const hoje = new Date(); hoje.setUTCHours(12, 0, 0, 0);
    for (let k = 20; k >= 1; k--) {
      const dia = new Date(hoje); dia.setUTCDate(dia.getUTCDate() - k);
      const n = 90 + Math.floor(r() * 60);
      for (let j = 0; j < n; j++) {
        const op = ops[Math.floor(r() * ops.length)];
        const h = r() < 0.03 ? null : 480 + 30 * Math.floor(Math.pow(r(), 0.9) * 26); // 08:00 até 20:30
        linhas.push({ i: uuid(r), o: op.nome, d: iso(dia), s: op.sup, p: op.oper, l: op.loc, n: nota(r), h });
      }
    }
    return linhas;
  }

  // Planilha de exemplo do tutorial do Estúdio: atendimentos de 6 dias, com cliente (para reincidência)
  function planilhaExemplo() {
    const r = sorteio(42), ops = equipe(r).slice(0, 18);
    const canais = ['TELEFONE', 'CHAT', 'WHATSAPP', 'E-MAIL'];
    const cab = 'DATA,HORA,ATENDENTE,SUPERVISOR,EQUIPE,CANAL,CLIENTE,TEMPO_SEG,NOTA,RESOLVIDO';
    const linhas = [cab];
    const hoje = new Date(); hoje.setUTCHours(12, 0, 0, 0);
    for (let k = 6; k >= 1; k--) {
      const dia = new Date(hoje); dia.setUTCDate(dia.getUTCDate() - k);
      const dd = String(dia.getUTCDate()).padStart(2, '0'), mm = String(dia.getUTCMonth() + 1).padStart(2, '0'), aaaa = dia.getUTCFullYear();
      const n = 160 + Math.floor(r() * 60);
      for (let j = 0; j < n; j++) {
        const op = ops[Math.floor(r() * ops.length)];
        const m = 480 + Math.floor(r() * 720);
        const hora = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + ':' + String(Math.floor(r() * 60)).padStart(2, '0');
        const cliente = 'CLI-' + String(1 + Math.floor(Math.pow(r(), 1.6) * 600)).padStart(4, '0');
        const nt = nota(r), resolvido = nt >= 4 ? (r() < 0.95 ? 1 : 0) : (r() < 0.55 ? 1 : 0);
        linhas.push([`${dd}/${mm}/${aaaa}`, hora, op.nome, op.sup || 'SEM SUPERVISOR', op.oper || 'SAC', pega(r, canais), cliente, 120 + Math.floor(r() * 780), nt, resolvido].join(','));
      }
    }
    return linhas.join('\n');
  }
  function arquivoExemplo() { return new File([planilhaExemplo()], 'atendimentos_exemplo.csv', { type: 'text/csv' }); }
  function baixarExemplo() {
    const url = URL.createObjectURL(new Blob(['﻿' + planilhaExemplo()], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'atendimentos_exemplo.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  /* ---------------- Quadro de funcionários: bases DPO e WFM de exemplo (fictícias) ----------------
     DPO = estrutura oficial (CSV com ";"); WFM = relatório do sistema de escala (tabela HTML, como o "xls" real).
     Datas relativas a hoje: férias, afastamentos, avisos e contratações caem no mês corrente, para o painel ter movimento. */
  function basesQuadro() {
    const r = sorteio(20261015), hoje = new Date(); hoje.setUTCHours(12, 0, 0, 0);
    const dia = n => { const d = new Date(hoje); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    const br = s => s ? s.split('-').reverse().join('/') : '';
    const SEG = ['CENTRAL ATENDE - N1 - VENDAS', 'CENTRAL ATENDE - N1 - SUPORTE', 'CENTRAL ATENDE - N2 - SUPORTE', 'CENTRAL ATENDE - COBRANÇA', 'CENTRAL ATENDE - RETENÇÃO'];
    const SUPS = ['RENATA PRADO', 'MARCOS VIANA', 'PATRÍCIA DUARTE', 'LEONARDO FARIAS', 'CAMILA TORRES'];
    const COORD = ['HELENA MATOS', 'OTÁVIO RANGEL'];
    const ENTRADAS = ['06:00', '07:00', '08:00', '09:00', '10:00', '12:00', '13:00', '14:00', '15:00', '16:00', '18:00'];
    const ESCALAS = [['06:20', '180', '6x1 - 06h20 - Folga sab ou dom'], ['06:20', '180', '7x1 - 06h20 - Folga semanal'], ['08:12', '220', '5x2 - 08h12 - Seg a Sex'], ['06:00', '130', '4x3 - Aprendiz']];
    const soma = (h, ch) => { const [a, b] = h.split(':').map(Number), [c, d] = ch.split(':').map(Number); const t = (a * 60 + b + c * 60 + d) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
    const usados = new Set(), pessoas = [];
    while (pessoas.length < 180) {
      const nome = pega(r, NOMES) + ' ' + pega(r, SOBRENOMES) + ' ' + pega(r, SOBRENOMES);
      if (usados.has(nome)) continue; usados.add(nome);
      const i = pessoas.length, x = r();
      const esc = i % 23 === 0 ? ESCALAS[3] : i % 4 === 0 ? ESCALAS[2] : i % 3 === 0 ? ESCALAS[1] : ESCALAS[0];
      const ent = pega(r, ENTRADAS);
      const p = { mat: String(10000 + i * 7), re: String(900000 + i * 11), nome, adm: dia(-30 - Math.floor(r() * 1400)), seg: SEG[i % 5], sup: SUPS[i % 5], coord: COORD[i % 2],
        ent, sai: soma(ent, esc[0]), ch: esc[0], jor: esc[1], jornada: esc[2], nivel: esc[0] === '06:00' ? 'APRENDIZ' : 'OPERADOR', funcao: esc[0] === '06:00' ? 'APRENDIZ OPERADOR' : 'OPERADOR DE ATENDIMENTO',
        sit: 'ATIVO', desl: '', motivo: '', feI: '', feF: '', afI: '', afF: '', motAf: '', avI: '', avF: '', cliente: 'CENTRAL ATENDE', wSit: 'Ativo', wIni: '', wFim: '', difAdm: false };
      if (x < 0.20) { p.sit = 'DESLIGADO'; p.desl = r() < 0.4 ? dia(-Math.floor(r() * Math.min(25, hoje.getUTCDate()))) : dia(-40 - Math.floor(r() * 300)); p.motivo = r() < 0.5 ? 'PEDIDO DE DEMISSÃO' : 'SEM JUSTA CAUSA'; p.wSit = 'Desligado'; p.wIni = br(p.desl); }
      else if (x < 0.28) { p.sit = 'FÉRIAS'; p.feI = dia(-Math.floor(r() * 15)); p.feF = dia(5 + Math.floor(r() * 20)); p.wSit = 'Férias'; }
      else if (x < 0.31) { p.feI = dia(3 + Math.floor(r() * 12)); p.feF = dia(32 + Math.floor(r() * 5)); } // férias marcadas para os próximos dias (projeção)
      else if (x < 0.36) { p.sit = 'AFASTADO'; p.afI = dia(-10 - Math.floor(r() * 60)); p.afF = r() < 0.5 ? dia(2 + Math.floor(r() * 20)) : ''; p.motAf = r() < 0.5 ? 'INSS' : 'LIC MATERNIDADE'; p.wSit = p.motAf === 'INSS' ? 'INSS' : 'Licença Maternidade'; p.wIni = br(p.afI); p.wFim = br(p.afF); }
      else if (x < 0.38) { p.sit = 'AVISO PREVIO'; p.avI = dia(-5); p.avF = dia(10 + Math.floor(r() * 15)); }
      else if (x < 0.41) { p.adm = dia(-Math.floor(r() * Math.max(1, hoje.getUTCDate() - 1))); } // contratados neste mês
      if (i === 17 || i === 61) { p.sit = 'ATIVO'; p.wSit = 'Desligado'; p.wIni = br(dia(-6)); } // rescisão indireta: ativo no DPO, desligado no WFM
      if (i % 12 === 5) p.difAdm = true; // admissão diferente no WFM → vai para "Confirmar vínculos"
      pessoas.push(p);
    }
    // outros clientes no mesmo arquivo do DPO (o quadro filtra só o cliente da operação)
    const outros = Array.from({ length: 25 }, (_, i) => ({ ...pessoas[i], mat: String(50000 + i), cliente: 'OUTRO CLIENTE', seg: 'OUTRO CLIENTE - N1', difAdm: false }));
    const cabD = ['Matricula', 'Periodo', 'Nome Colaborador', 'Admissao', 'Desligamento', 'Motivo do Desligamento', 'Nome Gestor 1', 'Nome Gestor 2', 'Situação Oficial', 'Função', 'Nivel Hierarquico',
      'Hora Entrada', 'Hora Saida', 'Segmento', 'Cliente', 'Site', 'Inicio Férias', 'Fim de Férias', 'Afastamento', 'Retorno Afastamento', 'Motivo Afastamento', 'Carga Horaria', 'Jornada',
      'Aviso Previo Inicio', 'Aviso Previo Fim', 'Sistema0', 'Login Sistema0', 'Sistema4', 'Login Sistema4'];
    const linD = p => [p.mat, hoje.toISOString().slice(0, 7).replace('-', ''), p.nome, p.adm, p.desl, p.motivo, p.sup, p.coord, p.sit, p.funcao, p.nivel, p.ent + ':00', p.sai + ':00', p.seg, p.cliente, 'SEDE',
      p.feI, p.feF, p.afI, p.afF, p.motAf, p.ch + ':00', p.jor, p.avI, p.avF, 'TELEFONIA', p.mat, 'REDE', 'u' + p.mat].join(';');
    const dpo = [cabD.join(';'), ...[...pessoas, ...outros].map(linD)].join('\n');
    const cabW = ['Cód. RE', 'Nome', 'Dt. Admissão', 'Cargo', 'Centro Custo', 'Carga Horária', 'Situação', 'Dt. Ini Situação', 'Dt. Fim Situação', 'Dt. Ini Férias', 'Dt. Fim Férias', 'Motivo Deslig.', 'Dt. Situação', 'Descrição da Operação', 'Operação', 'Jornada', 'Horário de Entrada'];
    const td = v => `<td>${String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`;
    const linW = p => '<tr>' + [p.re, p.nome, br(p.difAdm ? dia(-20 - Math.floor(r() * 200)) : p.adm), p.funcao, 'CENTRAL', p.i % 9 === 4 ? '08:12' : p.ch, p.wSit, p.wIni, p.wFim,
      p.wSit === 'Férias' ? br(p.feI) : '', p.wSit === 'Férias' ? br(p.feF) : '', p.wSit === 'Desligado' ? 'VOLUNTÁRIO' : '', p.wIni, p.seg.replace('CENTRAL ATENDE - ', ''), p.seg.replace('CENTRAL ATENDE - ', ''), p.jornada,
      p.i % 15 === 8 ? soma(p.ent, '01:00') : p.ent].map(td).join('') + '</tr>';
    pessoas.forEach((p, i) => p.i = i);
    const wfm = `<html><head><meta charset="windows-1252"><style>td{mso-number-format:"\\@"}</style></head><body><table><tr>${cabW.map(c => `<th>${c}</th>`).join('')}</tr>${pessoas.map(linW).join('')}</table></body></html>`;
    return { dpo, wfm };
  }
  return { avaliacoesCsat, planilhaExemplo, arquivoExemplo, baixarExemplo, sorteio, basesQuadro };
})();
// Quadro da demonstração: o cliente fictício que forma a operação (no DashBI real é o cliente do DPO escolhido em Cargas)
const QD_CLIENTES_PADRAO = ['CENTRAL ATENDE'];
// Botão "Usar bases de exemplo" (Quadro › Cargas): carrega o DPO e o WFM fictícios como se fossem arquivos escolhidos
async function lswBasesExemplo(){
  const { dpo, wfm } = LSW_DADOS.basesQuadro();
  const colocar = (id, conteudo, nome, tipo) => { const dt = new DataTransfer(); dt.items.add(new File([conteudo], nome, { type: tipo })); document.getElementById(id).files = dt.files; };
  colocar('qd-arq-dpo', dpo, 'estrutura_exemplo.csv', 'text/csv');
  await qdCarregar('dpo');
  colocar('qd-arq-wfm', wfm, 'funcionarios_exemplo.xls', 'application/vnd.ms-excel');
  await qdCarregar('wfm');
}
