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
  return { avaliacoesCsat, planilhaExemplo, arquivoExemplo, baixarExemplo, sorteio };
})();
