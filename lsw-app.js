/* =====================================================================
   LSW_DashBi — APRESENTAÇÃO, TUTORIAL E PASSO A PASSO GUIADO
   1. Entrada (página pública, login com um clique, zerar a demonstração)
   2. Apresentação (portfólio)
   3. Tutorial (página de leitura, escrita para quem não é da área de dados)
   4. Passo a passo guiado (motor: destaque + balão + "Fazer por mim")
   5. Roteiros: conhecer o sistema · ler um relatório · criar o primeiro relatório
   ===================================================================== */

/* ---------------- 1. entrada ---------------- */
const lswEl = id => document.getElementById(id);
function lswPublico(pagina){
  lswEl('login-screen').style.display = 'none';
  lswEl('lsw-publico').classList.remove('hidden');
  document.querySelectorAll('.lsw-pub-nav [data-pub]').forEach(b => b.classList.toggle('active', b.dataset.pub === pagina));
  lswEl('lsw-publico-conteudo').innerHTML = pagina === 'tutorial' ? lswHtmlTutorial(true) : lswHtmlApresentacao(true);
  window.scrollTo(0, 0);
  if (pagina === 'tutorial') lswIndiceAtivo();
}
function lswIrParaLogin(){
  lswEl('lsw-publico').classList.add('hidden');
  lswEl('login-screen').style.display = '';
  window.scrollTo(0, 0);
}
// Entrar com um clique: preenche e-mail/senha de demonstração e usa o login normal do sistema
async function lswEntrarDemo(perfil, depois){
  await LSW_DEMO.pronto();
  lswEl('login-user').value = perfil === 'admin' ? 'admin@lsw.demo' : 'usuario@lsw.demo';
  lswEl('login-pass').value = 'demo123';
  lswEl('lsw-publico').classList.add('hidden');
  if (depois) lswT.semBoasVindas = true; // já vai abrir outro passo a passo
  await doLogin();
  if (depois && session) setTimeout(depois, 400);
}
// Tutorial público → "começar o passo a passo": entra como administrador e já abre o roteiro
function lswComecarTour(nome){
  if (session) { lswTour(nome); return; }
  lswEntrarDemo('admin', () => lswTour(nome));
}
function lswAoEntrar(isAdmin){
  lswEl('lsw-publico').classList.add('hidden');
  updateSidebarLogo();
  // 1ª vez neste navegador: oferece o passo a passo de boas-vindas
  let visto = false; try { visto = localStorage.getItem('lsw-boas-vindas') === '1'; } catch (e) {}
  if (!visto && !lswT.semBoasVindas) { try { localStorage.setItem('lsw-boas-vindas', '1'); } catch (e) {} setTimeout(() => lswTour('conhecer'), 700); }
}
function lswAoTrocarTela(view){
  if (view === 'apresentacao') lswEl('lsw-apresentacao-app').innerHTML = lswHtmlApresentacao(false);
  if (view === 'tutorial') { lswEl('lsw-tutorial-app').innerHTML = lswHtmlTutorial(false); lswIndiceAtivo(); }
}
async function lswZerarDemo(){
  if (!confirm('Apagar tudo o que foi feito nesta demonstração e voltar aos dados de exemplo?')) return;
  await LSW_DEMO.zerar();
  try { localStorage.removeItem('token'); sessionStorage.setItem('lsw-ir-login', '1'); } catch (e) {}
  location.reload();
}
// "Usar planilha de exemplo" no assistente de Nova base
function lswUsarPlanilhaExemplo(){
  const a = est.assist;
  if (a && a.modo === 'nova' && !String(a.nome || '').trim()) {
    a.nome = lswNomeLivre('ATENDIMENTOS EXEMPLO', (est.bases || []).map(b => b.nome));
    const i = lswEl('est-nome'); if (i) i.value = a.nome;
  }
  estLerArquivo(LSW_DADOS.arquivoExemplo());
}
function lswNomeLivre(base, usados){
  let nome = base, n = 2;
  while (usados.includes(nome)) nome = `${base} ${n++}`;
  return nome;
}
// Imagem ampliada ao clicar (galeria e figuras do tutorial)
function lswZoom(src){
  const d = document.createElement('div'); d.className = 'lsw-zoom'; d.onclick = () => d.remove();
  d.innerHTML = `<img src="${src}" alt="">`; document.body.appendChild(d);
}

/* ---------------- 2. apresentação ---------------- */
const LSW_ICO = {
  base: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  fx: '<path d="M9 20c2 0 3-1 3.5-3.5L14 7c.4-2 1.4-3 3-3"/><path d="M8 10h8"/>',
  grade: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  filtro: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  escudo: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
};
const lswSvg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const lswPaleta = () => (typeof prefs !== 'undefined' && prefs.paleta) || 'aurora';
const LSW_TELAS = [
  ['relatorios', 'Portal de relatórios', 'Cada relatório publicado vira um card. O administrador controla quem vê o quê.'],
  ['estudio-csat', 'Relatório feito no Estúdio', 'O Painel CSAT recriado sem código: guias, filtros, cards, gráficos e tabelas.'],
  ['editor', 'Editor visual', 'Faixa de menus como a do Excel, painel de dados à esquerda e a tela à direita.'],
  ['dax', 'Medidas em DAX', 'A mesma linguagem do Power BI, com sugestões, cores e o resultado na hora.'],
  ['colunas', 'Tratamento da base', 'O sistema lê a planilha, sugere o tipo de cada coluna e aponta valores inválidos.'],
  ['painel-csat', 'Painel feito em código', 'O painel original, com importação de planilhas e prévia antes de gravar.'],
];
function lswHtmlApresentacao(publico){
  const p = lswPaleta();
  const acoes = publico
    ? `<button class="btn btn-primary" onclick="lswIrParaLogin()">Entrar na demonstração</button>
       <button class="btn btn-ghost" onclick="lswPublico('tutorial')">Ler o tutorial</button>`
    : `<button class="btn btn-primary" onclick="lswTour('relatorio')">Criar um relatório guiado</button>
       <button class="btn btn-ghost" onclick="lswTour('conhecer')">Conhecer o sistema</button>`;
  return `<div class="lsw-ap">
    <section class="lsw-hero">
      <div>
        <span class="lsw-selo"><i></i> Demonstração ao vivo · dados fictícios</span>
        <h1>Relatórios de verdade, <em>sem depender de código</em>.</h1>
        <p class="lead">O <b>LSW_DashBi</b> é um portal de relatórios com um <b>Estúdio</b> embutido: a pessoa sobe uma planilha,
          o sistema organiza os dados, e ela monta o painel arrastando colunas e medidas — com contas no estilo do Power BI,
          filtros, guias e publicação com um clique.</p>
        <div class="lsw-hero-acoes">${acoes}</div>
      </div>
      <div class="lsw-hero-logo"><img src="img/logo-completo-${p}.png" alt="Logic Synapse Web"></div>
    </section>

    <div class="lsw-numeros">
      <div class="lsw-numero"><b>12</b><span>tipos de visual: cards, gráficos, tabela dinâmica, velocímetro, cascata, tendência…</span></div>
      <div class="lsw-numero"><b>70+</b><span>funções DAX traduzidas para o motor de dados do navegador</span></div>
      <div class="lsw-numero"><b>0</b><span>linhas de código para criar, publicar e atualizar um relatório</span></div>
      <div class="lsw-numero"><b>ms</b><span>contas em milissegundos: os dados são calculados no próprio navegador</span></div>
    </div>

    <section class="lsw-sec">
      <div class="lsw-sec-cab"><small>Como funciona</small><h2>Da planilha ao painel em cinco passos</h2>
        <p>O mesmo caminho que um analista faria no Excel ou no Power BI, só que guiado e dentro do portal da empresa.</p></div>
      <div class="lsw-fluxo">
        <div class="lsw-fluxo-item"><h3>Subir a base</h3><p>Planilha .xlsx, .xlsb ou .csv. Tudo é lido no navegador.</p></div>
        <div class="lsw-fluxo-item"><h3>Conferir as colunas</h3><p>O sistema sugere o tipo (data, número, texto, hora) e mostra o que está sujo.</p></div>
        <div class="lsw-fluxo-item"><h3>Criar as medidas</h3><p>Contas como CONT.SES e SOMARPRODUTO, escritas em DAX.</p></div>
        <div class="lsw-fluxo-item"><h3>Montar o painel</h3><p>Clique numa área, escolha o visual e arraste os campos.</p></div>
        <div class="lsw-fluxo-item"><h3>Publicar</h3><p>Vira um card em Relatórios. Usuários só leem; editar não muda nada até publicar de novo.</p></div>
      </div>
    </section>

    <section class="lsw-sec">
      <div class="lsw-sec-cab"><small>Recursos</small><h2>O que vem pronto</h2></div>
      <div class="lsw-recursos">
        <div class="lsw-recurso"><div class="ic">${lswSvg(LSW_ICO.base)}</div><h3>Bases tratadas</h3><p>Tipos detectados lendo a base inteira, vazios tratados, chave para não duplicar e um arquivo compactado por dia.</p></div>
        <div class="lsw-recurso"><div class="ic">${lswSvg(LSW_ICO.fx)}</div><h3>Medidas em DAX</h3><p>CALCULATE, SUMX, DIVIDE, IF, SWITCH… com sugestões enquanto digita e o resultado ao vivo.</p></div>
        <div class="lsw-recurso"><div class="ic">${lswSvg(LSW_ICO.grade)}</div><h3>Editor por arrastar</h3><p>Grade fina, desfazer/refazer, prévia, zoom, modelo sugerido e modelo em Z (do macro ao micro).</p></div>
        <div class="lsw-recurso"><div class="ic">${lswSvg(LSW_ICO.filtro)}</div><h3>Filtros e guias</h3><p>Segmentações sincronizadas entre guias, eixos alternativos (Intraday / Intrahora) e exportação para Excel.</p></div>
        <div class="lsw-recurso"><div class="ic">${lswSvg(LSW_ICO.link)}</div><h3>Relações entre bases</h3><p>Como o PROCV: cada linha busca na outra base as colunas que faltam, sem duplicar linhas.</p></div>
        <div class="lsw-recurso"><div class="ic">${lswSvg(LSW_ICO.escudo)}</div><h3>Perfis e operações</h3><p>Uma árvore de permissões diz o que cada perfil vê e faz (na tela e no servidor). Cada pessoa pertence a uma operação, e cada relatório pode ser liberado para uma, várias ou todas.</p></div>
        <div class="lsw-recurso"><div class="ic">${lswSvg(LSW_ICO.base)}</div><h3>Quadro de funcionários</h3><p>Junta duas bases de RH (DPO e WFM), liga as pessoas por nome e admissão, guarda a foto de cada dia e a trajetória de cada um, e projeta o mês: férias, afastamentos, desligamentos e turnover.</p></div>
        <div class="lsw-recurso"><div class="ic">${lswSvg(LSW_ICO.filtro)}</div><h3>Solicitações com árvore de decisão</h3><p>Formulários montados sem código (resposta X leva à pergunta Y). O pedido aprovado entra sozinho no quadro, e uma carga que vier diferente fica marcada em vermelho.</p></div>
      </div>
    </section>

    <section class="lsw-sec">
      <div class="lsw-sec-cab"><small>Telas</small><h2>Por dentro do sistema</h2><p>Clique numa imagem para ampliar.</p></div>
      <div class="lsw-galeria">${LSW_TELAS.map(([arq, tit, txt]) => `
        <figure class="lsw-tela" onclick="lswZoom('img/telas/${arq}.png')"><img src="img/telas/${arq}.png" alt="${tit}" loading="lazy" onerror="this.style.visibility='hidden'">
          <figcaption><b>${tit}</b>${txt}</figcaption></figure>`).join('')}</div>
    </section>

    <section class="lsw-sec">
      <div class="lsw-sec-cab"><small>Perfis</small><h2>Quem faz o quê</h2></div>
      <div class="lsw-perfis">
        <div class="lsw-perfil"><h3>Administrador</h3><ul>
          <li>Cria bases e relatórios no Estúdio</li><li>Publica, oculta, descontinua e arquiva relatórios</li>
          <li>Cadastra usuários, define perfis e reseta senhas</li><li>Importa as planilhas do Painel CSAT e ajusta a meta</li></ul></div>
        <div class="lsw-perfil"><h3>Usuário</h3><ul>
          <li>Vê só os relatórios publicados e visíveis</li><li>Filtra, troca de guia e de visão (dia / hora)</li>
          <li>Exporta para Excel o que está vendo</li><li>Escolhe tema, paleta e tamanho da letra</li></ul></div>
      </div>
    </section>

    <section class="lsw-sec">
      <div class="lsw-sec-cab"><small>Tecnologia</small><h2>Feito para rodar leve</h2>
        <p>Sem framework: HTML, CSS e JavaScript puros. As contas pesadas acontecem no navegador de quem está vendo.</p></div>
      <div class="lsw-tec">
        <span><b>Front</b>HTML · CSS · JavaScript</span><span><b>Dados</b>DuckDB-WASM</span><span><b>Arquivos</b>Parquet (zstd)</span>
        <span><b>Gráficos</b>Apache ECharts</span><span><b>Grade</b>Gridstack</span><span><b>Planilhas</b>SheetJS</span>
        <span><b>Fórmulas</b>DAX → SQL</span><span><b>Produção</b>Node · Express · Supabase · Vercel</span>
      </div>
      <div class="lsw-caixa dica" style="margin-top:18px"><p>Esta demonstração não usa servidor: um "servidor de mentira" roda dentro do navegador e guarda tudo
        neste computador. Na versão de produção, as mesmas telas conversam com Node + Supabase.</p></div>
    </section>

    <section class="lsw-cta">
      <h2>Experimente agora</h2>
      <p>Entre como administrador e crie seu primeiro relatório com o passo a passo — leva uns cinco minutos.</p>
      <div class="lsw-hero-acoes">${publico
        ? `<button class="btn btn-primary" onclick="lswComecarTour('relatorio')">Começar o passo a passo</button><button class="btn btn-ghost" onclick="lswIrParaLogin()">Só entrar</button>`
        : `<button class="btn btn-primary" onclick="lswTour('relatorio')">Começar o passo a passo</button><button class="btn btn-ghost" onclick="switchView('tutorial')">Ler o tutorial</button>`}</div>
    </section>
    <footer class="lsw-rodape"><span>LSW_DashBi · Logic Synapse Web © 2026</span><span>Demonstração com dados fictícios — nenhum nome é de pessoa real.</span></footer>
  </div>`;
}

/* ---------------- 3. tutorial (leitura) ---------------- */
const LSW_CAPS = [
  ['comece', 'Antes de começar'], ['palavras', 'Palavras que vão aparecer'], ['base', '1 · Subir a planilha'], ['colunas', '2 · Conferir as colunas'],
  ['gravar', '3 · Prévia e gravar'], ['relatorio', '4 · Criar o relatório'], ['editor', '5 · Conhecendo o editor'], ['medidas', '6 · Medidas (as contas)'],
  ['visuais', '7 · Visuais'], ['formatar', '8 · Formatar'], ['filtros', '9 · Filtros e guias'], ['publicar', '10 · Prévia, salvar e publicar'],
  ['analises', '11 · Análises prontas'], ['problemas', 'Deu algo errado?'],
];
const lswFig = (arq, legenda) => `<figure class="lsw-fig" onclick="lswZoom('img/telas/${arq}.png')"><img src="img/telas/${arq}.png" alt="${legenda}" loading="lazy" onerror="this.parentNode.style.display='none'"><figcaption>${legenda}</figcaption></figure>`;
function lswHtmlTutorial(publico){
  const guiado = nome => publico ? `lswComecarTour('${nome}')` : `lswTour('${nome}')`;
  return `<div class="lsw-tut">
    <nav class="lsw-tut-indice"><small>Neste tutorial</small>${LSW_CAPS.map(([id, t]) => `<a href="#cap-${id}" data-cap="${id}" onclick="event.preventDefault(); document.getElementById('cap-${id}').scrollIntoView({behavior:'smooth'})">${t}</a>`).join('')}</nav>
    <article class="lsw-tut-corpo">
      <header>
        <h1>Como criar e editar um relatório no Estúdio</h1>
        <p>Este guia é para quem <b>nunca montou um painel</b>. Não precisa saber programar nem conhecer Power BI.
          Se você já usou o Excel para somar uma coluna ou filtrar uma tabela, já sabe o suficiente para começar.</p>
      </header>
      <div class="lsw-tut-guias">
        <button class="lsw-tut-guia" onclick="${guiado('relatorio')}"><b>Prefere fazer junto?</b><span>O passo a passo guiado acende cada botão na tela e explica o que fazer. Se travar, ele faz por você.</span><em>Começar o passo a passo →</em></button>
        <button class="lsw-tut-guia" onclick="${publico ? "lswEntrarDemo('usuario', () => lswTour('ler'))" : "lswTour('ler')"}"><b>Só vai ler relatórios?</b><span>Um passo a passo curto mostra guias, filtros, a troca entre dia e hora e o botão Exportar.</span><em>Ver como ler um relatório →</em></button>
        <button class="lsw-tut-guia" onclick="${publico ? "lswEntrarDemo('admin', () => lswTour('conhecer'))" : "lswTour('conhecer')"}"><b>Primeira vez aqui?</b><span>Um giro de um minuto pelas partes do sistema: menu, relatórios, usuários, Estúdio e configurações.</span><em>Conhecer o sistema →</em></button>
        <button class="lsw-tut-guia" onclick="LSW_DADOS.baixarExemplo()"><b>Planilha de exemplo</b><span>Atendimentos fictícios de 6 dias: data, hora, atendente, canal, cliente, tempo, nota e se resolveu.</span><em>Baixar atendimentos_exemplo.csv ↓</em></button>
      </div>

      <section class="lsw-cap" id="cap-comece"><small>Ideia geral</small><h2>Antes de começar</h2>
        <p>Pense no Estúdio como uma <b>cozinha</b>. Para servir um prato (o relatório), você precisa de três coisas:</p>
        <ol class="lsw-passos">
          <li><b>Ingredientes — a base de dados.</b> É a sua planilha: cada linha é um acontecimento (um atendimento, uma venda, uma avaliação) e cada coluna é uma informação sobre ele (data, quem atendeu, nota…).</li>
          <li><b>Receitas — as medidas.</b> São as contas: "quantos atendimentos", "nota média", "% resolvidos". Você escreve a conta uma vez e ela se refaz sozinha para cada filtro, dia ou pessoa.</li>
          <li><b>Pratos — os visuais.</b> Cards com um número grande, gráficos, tabelas. Cada visual mostra uma ou mais medidas, abertas por alguma coluna (por dia, por atendente…).</li>
        </ol>
        <p>O caminho é sempre o mesmo: <b>base → medidas → visuais → publicar</b>. Os capítulos abaixo seguem essa ordem.</p>
        <div class="lsw-caixa dica"><p>Só o perfil <b>Administrador</b> vê o Estúdio. Na demonstração, use "Entrar como Administrador".</p></div>
      </section>

      <section class="lsw-cap" id="cap-palavras"><small>Glossário</small><h2>Palavras que vão aparecer</h2>
        <div class="lsw-glossario">
          <div><b>Base de dados</b><span>A planilha guardada no sistema. Pode receber dias novos depois.</span></div>
          <div><b>Coluna / campo</b><span>Uma informação de cada linha: DATA, ATENDENTE, NOTA…</span></div>
          <div><b>Tipo</b><span>Que tipo de informação a coluna tem: data, hora, número inteiro, decimal ou texto. Muda como ela pode ser usada.</span></div>
          <div><b>Chave</b><span>A coluna (ou colunas) que identifica uma linha sem repetir, como o número de um protocolo.</span></div>
          <div><b>Medida</b><span>Uma conta com nome: ATENDIMENTOS, NOTA MÉDIA. Como uma fórmula do Excel que vale para o relatório inteiro.</span></div>
          <div><b>DAX</b><span>A "língua" das medidas, a mesma do Power BI. Parece fórmula do Excel em inglês.</span></div>
          <div><b>Visual</b><span>Cada quadro da tela: card, gráfico, tabela, filtro.</span></div>
          <div><b>Eixo / Linhas</b><span>Por onde a medida é "aberta": por dia, por atendente, por canal.</span></div>
          <div><b>Filtro (segmentação)</b><span>Caixa onde quem lê escolhe, por exemplo, só o canal CHAT. Todos os visuais obedecem.</span></div>
          <div><b>Guia</b><span>Uma página do relatório, como as abas de uma pasta do Excel.</span></div>
          <div><b>Prévia</b><span>Mostra o relatório do jeito que o usuário final vai ver.</span></div>
          <div><b>Publicar</b><span>Entregar a versão atual para os usuários. Até publicar de novo, suas edições não aparecem para eles.</span></div>
        </div>
      </section>

      <section class="lsw-cap" id="cap-base"><small>Passo 1</small><h2>Subir a planilha (criar a base)</h2>
        <ol class="lsw-passos">
          <li>No menu à esquerda, abra <b>Estúdio</b> e clique em <b>Bases de dados</b>.</li>
          <li>Clique em <b>Nova base</b>.</li>
          <li>Dê um <b>nome</b> que qualquer pessoa entenda, como <kbd>ATENDIMENTOS</kbd>. A descrição é opcional.</li>
          <li>Clique em <b>Selecionar planilha</b> (ou arraste o arquivo). Na demonstração, use <b>Usar planilha de exemplo</b>.</li>
        </ol>
        <div class="lsw-caixa atencao"><p>A <b>primeira linha</b> da planilha precisa ser o cabeçalho (os nomes das colunas), e precisa existir
          <b>uma coluna de data</b> — é ela que diz a que dia cada linha pertence.</p></div>
        <div class="lsw-caixa dica"><p>A planilha é lida <b>no seu computador</b>; nada sobe antes de você conferir e clicar em Gravar.</p></div>
      </section>

      <section class="lsw-cap" id="cap-colunas"><small>Passo 2</small><h2>Conferir as colunas</h2>
        <p>O sistema leu a planilha inteira e mostra uma tabela com cada coluna. Em cada linha dessa tabela você decide:</p>
        <div class="lsw-tabela-wrap"><table class="lsw-tabela">
          <tr><th>Opção</th><th>O que é</th><th>Quando mexer</th></tr>
          <tr><td>Guardar</td><td>Se a coluna vai para o sistema.</td><td>Desmarque o que nunca vai usar: a base fica menor e mais rápida.</td></tr>
          <tr><td>Nome no Estúdio</td><td>Como a coluna vai aparecer para você.</td><td>Troque nomes estranhos, como <kbd>TEMPO_SEG</kbd> → <kbd>TEMPO (SEG)</kbd>.</td></tr>
          <tr><td>Tipo</td><td>Data, hora, data e hora, número inteiro, decimal ou texto. O ✓ é a sugestão.</td><td>Quase nunca. Mude se o sistema errou (ex.: um código numérico que deveria ser texto).</td></tr>
          <tr><td>Chave</td><td>O que identifica uma linha.</td><td>Marque se a planilha tiver um ID. Ao subir o mesmo dia de novo, linhas com a mesma chave são <b>atualizadas</b> em vez de duplicadas.</td></tr>
          <tr><td>Vazios e inválidos</td><td>O que fazer com células vazias ou com texto onde deveria haver número.</td><td>Ex.: virar 0, ou virar o texto "SEM SUPERVISOR".</td></tr>
        </table></div>
        ${lswFig('colunas', 'A tabela de colunas: o ✓ marca o tipo sugerido; o diagnóstico avisa valores inválidos.')}
        <div class="lsw-caixa excel"><p><b>Por que o tipo importa?</b> Para o computador, "10" escrito como texto não soma. Uma coluna do tipo <b>número</b> pode ser somada e tirar média;
          uma do tipo <b>data</b> pode virar eixo de gráfico por dia; uma de <b>texto</b> serve para separar (por atendente, por canal).</p></div>
      </section>

      <section class="lsw-cap" id="cap-gravar"><small>Passo 3</small><h2>Prévia e gravar</h2>
        <p>Clique em <b>Ver prévia</b>. Aparecem as primeiras linhas já convertidas, quantas linhas serão gravadas por dia e os alertas
          (por exemplo, "28 valores inválidos viraram vazio"). Se estiver tudo certo, clique em <b>Gravar</b>.</p>
        <div class="lsw-caixa dica"><p>Amanhã chegou a planilha de um dia novo? Na lista de bases, clique em <b>Carregar dados</b> na mesma base.
          As colunas precisam ter os mesmos nomes da primeira vez.</p></div>
      </section>

      <section class="lsw-cap" id="cap-relatorio"><small>Passo 4</small><h2>Criar o relatório</h2>
        <ol class="lsw-passos">
          <li>No menu, em <b>Estúdio › Relatórios</b>, clique em <b>Novo relatório</b> (no canto da tabela).</li>
          <li>Dê um nome (ex.: <kbd>ATENDIMENTO DIÁRIO</kbd>) e escolha a <b>base</b> que acabou de criar.</li>
          <li>Em <b>Começar com</b>, escolha <b>Modelo sugerido</b>: ele já desenha três cards no topo, dois gráficos à esquerda e uma tabela à direita, vazios, esperando os campos.</li>
          <li>Clique em <b>Criar e abrir o editor</b>.</li>
        </ol>
      </section>

      <section class="lsw-cap" id="cap-editor"><small>Passo 5</small><h2>Conhecendo o editor</h2>
        ${lswFig('editor', 'O editor: cabeçalho no topo, faixa de menus logo abaixo, painel Dados à esquerda e a tela do relatório.')}
        <div class="lsw-tabela-wrap"><table class="lsw-tabela">
          <tr><th>Parte</th><th>Para que serve</th></tr>
          <tr><td>Cabeçalho</td><td>Nome do relatório, zoom, Exportar, <b>Prévia</b>, desfazer/refazer e <b>Salvar</b>.</td></tr>
          <tr><td>Faixa de menus</td><td>Como a do Excel. <b>Página Inicial</b> (novo visual, guias, publicar), <b>Inserir</b> (um botão por tipo de visual), <b>Cálculos</b> (medidas e relações), <b>Exibir</b> (zoom, prévia, meta). Ao clicar num visual, surgem as abas <b>Visual</b> e <b>Formatar</b>.</td></tr>
          <tr><td>Painel Dados</td><td>À esquerda: as <b>colunas</b> da base e as <b>medidas</b> que você criou. Daqui você arrasta para os visuais. Pode ser recolhido.</td></tr>
          <tr><td>Tela</td><td>Onde ficam os visuais. Clique numa área vazia para adicionar; arraste pelo título para mover; puxe o canto para mudar o tamanho.</td></tr>
        </table></div>
        <div class="lsw-caixa dica"><p>Errou? <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz, <kbd>Ctrl</kbd>+<kbd>Y</kbd> refaz, <kbd>Delete</kbd> exclui o visual selecionado e <kbd>Ctrl</kbd>+<kbd>S</kbd> salva.</p></div>
      </section>

      <section class="lsw-cap" id="cap-medidas"><small>Passo 6</small><h2>Medidas (as contas)</h2>
        <p>Uma medida é uma conta com nome. A grande vantagem sobre uma célula do Excel: você escreve <b>uma vez</b>, e ela é refeita sozinha
          para cada dia do gráfico, cada linha da tabela e cada filtro que o usuário escolher.</p>
        <ol class="lsw-passos">
          <li>Clique em <b>fx Nova medida</b> (Página Inicial ou Cálculos).</li>
          <li>Escreva o <b>nome</b> (ex.: <kbd>NOTA MÉDIA</kbd>) e escolha o <b>formato</b> (inteiro, decimal, porcentagem, moeda, duração).</li>
          <li>Escreva a fórmula. Digite <kbd>[</kbd> para ver as colunas e medidas, ou clique nelas na lista à direita.</li>
          <li>Confira o resultado que aparece embaixo, enquanto você digita, e clique em <b>Salvar medida</b>.</li>
        </ol>
        <h3>Do Excel para o DAX</h3>
        <div class="lsw-tabela-wrap"><table class="lsw-tabela">
          <tr><th>No Excel</th><th>No Estúdio (DAX)</th><th>Exemplo com a planilha de exemplo</th></tr>
          <tr><td>CONT.VALORES</td><td>COUNTROWS</td><td><code>COUNTROWS(dados)</code> = quantos atendimentos</td></tr>
          <tr><td>MÉDIA</td><td>AVERAGE</td><td><code>AVERAGE(dados[NOTA])</code> = nota média</td></tr>
          <tr><td>SOMA</td><td>SUM</td><td><code>SUM(dados[TEMPO_SEG])</code> = tempo total</td></tr>
          <tr><td>CONT.SES</td><td>CALCULATE + COUNTROWS</td><td><code>CALCULATE(COUNTROWS(dados), dados[RESOLVIDO] = 1)</code> = resolvidos</td></tr>
          <tr><td>SOMASES</td><td>CALCULATE + SUM</td><td><code>CALCULATE(SUM(dados[TEMPO_SEG]), dados[CANAL] = "CHAT")</code></td></tr>
          <tr><td>Divisão sem erro</td><td>DIVIDE</td><td><code>DIVIDE([RESOLVIDOS], [ATENDIMENTOS])</code> = % resolvidos</td></tr>
          <tr><td>SOMARPRODUTO</td><td>SUMX</td><td><code>DIVIDE(SUMX(dados, dados[NOTA] * dados[TEMPO_SEG]), SUM(dados[TEMPO_SEG]))</code> = média ponderada</td></tr>
          <tr><td>SE</td><td>IF</td><td><code>IF([NOTA MÉDIA] >= 4, "BOM", "ATENÇÃO")</code></td></tr>
          <tr><td>CONT.VALORES(ÚNICO(...))</td><td>DISTINCTCOUNT</td><td><code>DISTINCTCOUNT(dados[CLIENTE])</code> = clientes diferentes</td></tr>
        </table></div>
        <div class="lsw-caixa dica"><p><b>dados</b> é o nome da sua base dentro das fórmulas. <b>dados[NOTA]</b> quer dizer "a coluna NOTA da base".
          Uma medida pode usar outra: <code>[ATENDIMENTOS]</code>, entre colchetes.</p></div>
        <div class="lsw-caixa atencao"><p><b>Porcentagem:</b> escreva a conta como fração (0,85) e escolha o formato <b>Porcentagem</b>; o sistema mostra 85%. Não multiplique por 100.</p></div>
        ${lswFig('dax', 'A janela da medida: fórmula colorida, sugestões, lista de funções e o resultado ao vivo.')}
      </section>

      <section class="lsw-cap" id="cap-visuais"><small>Passo 7</small><h2>Visuais</h2>
        <p><b>Para adicionar:</b> clique numa área vazia da tela e escolha o tipo — ou use a aba <b>Inserir</b>.
          <b>Para preencher:</b> arraste uma medida ou coluna do painel Dados e solte em cima do visual. O sistema escolhe onde ela entra:
          números vão para <b>Valores</b>; datas e textos, para o <b>Eixo</b>. Para escolher você mesmo, use as caixas da aba <b>Visual</b>.</p>
        <h3>Qual visual usar?</h3>
        <div class="lsw-tabela-wrap"><table class="lsw-tabela">
          <tr><th>Pergunta</th><th>Visual</th><th>Campos</th></tr>
          <tr><td>Qual é o número principal?</td><td>Card</td><td>Valores: 1 medida</td></tr>
          <tr><td>Como foi ao longo dos dias?</td><td>Linhas ou Área</td><td>Eixo: DATA · Valores: medida</td></tr>
          <tr><td>Quem/qual é maior?</td><td>Barras ou Colunas</td><td>Eixo: ATENDENTE · Valores: medida</td></tr>
          <tr><td>Qual a fatia de cada um no total?</td><td>Pizza (poucas fatias)</td><td>Eixo: CANAL · Valores: medida</td></tr>
          <tr><td>Quero o detalhe, com vários números</td><td>Tabela dinâmica</td><td>Linhas: ATENDENTE · Valores: várias medidas</td></tr>
          <tr><td>Estamos dentro da meta?</td><td>Velocímetro</td><td>Valor + meta</td></tr>
          <tr><td>Para onde estamos indo?</td><td>Tendência e projeção</td><td>Data + valor</td></tr>
        </table></div>
        <div class="lsw-caixa atencao"><p>Evite colocar duas medidas de tamanhos muito diferentes no mesmo gráfico (ex.: atendimentos e nota média):
          uma "achata" a outra. Faça dois gráficos.</p></div>
      </section>

      <section class="lsw-cap" id="cap-formatar"><small>Passo 8</small><h2>Formatar</h2>
        <p>Clique num visual e abra a aba <b>Formatar</b>. Lá você muda o título, o tamanho e a cor do texto, o formato dos números
          e as casas decimais, as cores das séries, a legenda, a grade e o fundo. Na tabela: totais, subtotais, linhas zebradas e cores pela meta.</p>
        <p>Em <b>Exibir → Meta do relatório</b> você define uma meta (ex.: 90%). Cards, tabelas e o velocímetro passam a mostrar "dentro" ou "fora da meta".</p>
      </section>

      <section class="lsw-cap" id="cap-filtros"><small>Passo 9</small><h2>Filtros e guias</h2>
        <p>Um <b>filtro</b> é um visual como os outros: insira um <b>Filtro</b> e arraste uma coluna para ele (ex.: CANAL). Com coluna de data, ele vira
          "De / Até". Na aba Formatar você escolhe se o filtro vale só para a guia ou para o relatório inteiro.</p>
        <p><b>Guias</b> são as páginas do relatório. Crie em <b>Página Inicial → Nova guia</b>; dê dois cliques no nome para renomear.
          Em <b>Exibir</b> você escolhe se as guias aparecem no topo, à esquerda ou no cabeçalho.</p>
      </section>

      <section class="lsw-cap" id="cap-publicar"><small>Passo 10</small><h2>Prévia, salvar e publicar</h2>
        <ol class="lsw-passos">
          <li><b>Prévia</b> (no cabeçalho): mostra como o usuário vai ver. Clique de novo para voltar a editar.</li>
          <li><b>Salvar</b>: grava o desenho. Ele fica com uma bolinha quando há algo não salvo.</li>
          <li><b>Publicar</b> (Página Inicial): escolha a categoria e uma descrição. O relatório vira um <b>card</b> em Relatórios.</li>
        </ol>
        <div class="lsw-caixa dica"><p><b>Para editar depois:</b> Estúdio → Relatórios → <b>Editar</b>. Os usuários continuam vendo a versão publicada
          até você clicar em <b>Publicar de novo</b>. Não quer mais o relatório? <b>Arquivar</b> tira da lista e do portal, sem apagar.</p></div>
      </section>

      <section class="lsw-cap" id="cap-analises"><small>Passo 11</small><h2>Análises prontas</h2>
        <div class="lsw-tabela-wrap"><table class="lsw-tabela">
          <tr><th>Visual</th><th>O que responde</th></tr>
          <tr><td>Velocímetro</td><td>Quanto falta (ou sobra) para a meta, com "✓ dentro / ! fora da meta".</td></tr>
          <tr><td>Cascata</td><td>O que mais pesou: quanto cada parte soma até o total, ou como variou de um dia para o outro.</td></tr>
          <tr><td>Tendência e projeção</td><td>A reta da tendência (como a TENDÊNCIA do Excel) e onde o mês deve fechar.</td></tr>
          <tr><td>Reincidência</td><td>Quem voltou a procurar em até N dias — use CLIENTE em "Quem volta".</td></tr>
        </table></div>
        <p>Quer contar uma história? Em <b>Novo relatório → Começar com → Modelo em Z</b>, os visuais vêm numerados para a leitura ir do
          <b>macro ao micro</b>: resultado → meta → tendência → o que pesou → detalhe.</p>
      </section>

      <section class="lsw-cap" id="cap-problemas"><small>Ajuda</small><h2>Deu algo errado?</h2>
        <div class="lsw-tabela-wrap"><table class="lsw-tabela">
          <tr><th>O que aconteceu</th><th>O que fazer</th></tr>
          <tr><td>"Nenhuma coluna do tipo Data"</td><td>Mude o tipo da coluna de data para <b>Data</b> no passo 2. Toda base precisa de uma.</td></tr>
          <tr><td>O visual diz "arraste campos"</td><td>Ele está vazio: arraste uma medida para ele.</td></tr>
          <tr><td>Número estranho na medida</td><td>Confira o formato (porcentagem × decimal) e a fórmula. O resultado aparece embaixo da fórmula.</td></tr>
          <tr><td>A fórmula ficou vermelha</td><td>Leia a mensagem: ela diz a linha e a coluna do problema (parêntese faltando, nome de coluna errado…).</td></tr>
          <tr><td>O usuário não vê a mudança</td><td>Faltou <b>Publicar de novo</b>.</td></tr>
          <tr><td>Quero recomeçar a demonstração</td><td>Configurações → <b>Zerar demonstração</b>.</td></tr>
        </table></div>
        <div class="lsw-tut-acao"><button class="btn btn-primary" onclick="${guiado('relatorio')}">Fazer o passo a passo agora</button>
          <button class="btn btn-ghost" onclick="LSW_DADOS.baixarExemplo()">Baixar a planilha de exemplo</button></div>
      </section>
    </article>
  </div>`;
}
// Destaca no índice o capítulo que está na tela
function lswIndiceAtivo(){
  const caps = [...document.querySelectorAll('.lsw-cap')];
  if (!caps.length) return;
  if (window._lswObs) window._lswObs.disconnect();
  window._lswObs = new IntersectionObserver(ents => ents.forEach(e => {
    if (!e.isIntersecting) return;
    const id = e.target.id.replace('cap-', '');
    document.querySelectorAll('.lsw-tut-indice a').forEach(a => a.classList.toggle('ativo', a.dataset.cap === id));
  }), { rootMargin: '-90px 0px -70% 0px' });
  caps.forEach(c => window._lswObs.observe(c));
}

/* ---------------- 4. passo a passo guiado (motor) ----------------
   Cada passo: { titulo, texto, faca (o que a pessoa deve fazer), alvo (seletor ou função → elemento a destacar),
   antes() (prepara a tela), acao() ("Fazer por mim"), pronto() (já foi feito?), mostrar() (passo vale para este perfil?) } */
const lswT = { passos: [], i: 0, ocupado: false, timer: null };
const lswEspera = ms => new Promise(r => setTimeout(r, ms));
async function lswAte(cond, limite = 60000){
  const ini = Date.now();
  while (Date.now() - ini < limite) { try { if (cond()) return true; } catch (e) {} await lswEspera(150); }
  return false;
}
const lswVisivel = el => el && el.getClientRects().length > 0;
const lswPrimeiro = (...sels) => () => { for (const s of sels) { const el = [...document.querySelectorAll(s)].find(lswVisivel); if (el) return el; } return null; };
function lswTour(nome){
  const passos = (LSW_ROTEIROS[nome] || (() => []))().filter(p => !p.mostrar || p.mostrar());
  if (!passos.length) return;
  lswFecharTour();
  lswT.passos = passos; lswT.i = 0; lswT.nome = nome;
  const t = document.createElement('div'); t.id = 'lsw-tour';
  t.innerHTML = '<div class="lsw-tour-buraco"></div><div class="lsw-tour-balao"></div>';
  document.body.appendChild(t);
  lswT.timer = setInterval(lswPosicionar, 250);
  window.addEventListener('resize', lswPosicionar);
  lswIrPasso(0);
}
function lswFecharTour(){
  clearInterval(lswT.timer);
  const t = lswEl('lsw-tour'); if (t) t.remove();
  window.removeEventListener('resize', lswPosicionar);
}
async function lswIrPasso(i){
  lswT.i = i;
  const p = lswT.passos[i];
  if (p.antes) { try { await p.antes(); } catch (e) { console.warn(e); } await lswEspera(120); }
  lswDesenharBalao();
}
function lswFeito(p){ try { return !p.pronto || !!p.pronto(); } catch (e) { return false; } }
function lswDesenharBalao(){
  const p = lswT.passos[lswT.i], b = document.querySelector('#lsw-tour .lsw-tour-balao');
  if (!p || !b) return;
  const ultimo = lswT.i === lswT.passos.length - 1, feito = lswFeito(p);
  const principal = lswT.ocupado ? '<button class="btn btn-primary" disabled>Fazendo…</button>'
    : p.acao && !feito ? '<button class="btn btn-primary" onclick="lswFazerPorMim()">Fazer por mim</button>'
    : `<button class="btn btn-primary" onclick="lswProximo()">${ultimo ? 'Concluir' : 'Próximo'}</button>`;
  b.innerHTML = `<div class="lsw-tour-passo">Passo ${lswT.i + 1} de ${lswT.passos.length}</div>
    <h4>${p.titulo}</h4><p>${p.texto}</p>
    ${p.faca && !feito ? `<div class="lsw-tour-faca"><b>Faça você:</b> ${p.faca}</div>` : ''}
    ${p.faca && feito && p.acao ? '<div class="lsw-tour-faca">✓ Feito! Clique em <b>Próximo</b>.</div>' : ''}
    <div class="lsw-tour-barra"><i style="width:${(lswT.i + 1) / lswT.passos.length * 100}%"></i></div>
    <div class="lsw-tour-botoes">
      <button class="link-btn" onclick="lswFecharTour()">Sair</button><span class="esp"></span>
      ${lswT.i > 0 && !lswT.ocupado ? '<button class="btn btn-ghost" onclick="lswVoltar()">Voltar</button>' : ''}
      ${principal}
    </div>`;
  b._feito = feito;
  lswPosicionar();
}
function lswPosicionar(){
  const t = lswEl('lsw-tour'); if (!t) return;
  const p = lswT.passos[lswT.i], b = t.querySelector('.lsw-tour-balao'), h = t.querySelector('.lsw-tour-buraco');
  if (!p || !b) return;
  // Se a pessoa fez o passo sozinha, o balão troca "Fazer por mim" por "Próximo"
  if (!lswT.ocupado && p.acao && b._feito !== lswFeito(p)) { lswDesenharBalao(); return; }
  let el = null;
  try { el = typeof p.alvo === 'function' ? p.alvo() : p.alvo ? lswPrimeiro(p.alvo)() : null; } catch (e) {}
  const W = innerWidth, H = innerHeight, bw = b.offsetWidth, bh = b.offsetHeight, m = 14;
  if (!el) {
    t.classList.add('sem-alvo');
    b.style.left = Math.max(16, (W - bw) / 2) + 'px'; b.style.top = Math.max(16, (H - bh) / 2) + 'px';
    return;
  }
  t.classList.remove('sem-alvo');
  const r = el.getBoundingClientRect(), pad = 6;
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(W - x - 4, r.width + pad * 2), hh = Math.min(H - y - 4, r.height + pad * 2);
  Object.assign(h.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
  // Balão: embaixo, em cima, à direita ou à esquerda do destaque — o primeiro lugar onde couber
  let bx, by;
  if (y + hh + m + bh < H) { by = y + hh + m; bx = r.left; }
  else if (y - m - bh > 0) { by = y - m - bh; bx = r.left; }
  else if (x + w + m + bw < W) { bx = x + w + m; by = r.top; }
  else if (x - m - bw > 0) { bx = x - m - bw; by = r.top; }
  else { bx = W - bw - 16; by = H - bh - 16; }
  b.style.left = Math.min(Math.max(16, bx), W - bw - 16) + 'px';
  b.style.top = Math.min(Math.max(16, by), H - bh - 16) + 'px';
}
async function lswFazerPorMim(){
  const p = lswT.passos[lswT.i];
  lswT.ocupado = true; lswDesenharBalao();
  try {
    await p.acao();
    const ok = await lswAte(() => lswFeito(p), p.limite || 60000);
    if (!ok) showToast('Isso está demorando mais que o normal. Espere um pouco e clique em Próximo.', 'erro', 4000);
  } catch (e) { showToast('Não consegui fazer este passo: ' + e.message, 'erro', 4000); }
  lswT.ocupado = false;
  if (lswFeito(p)) lswProximo(); else lswDesenharBalao();
}
function lswProximo(){
  if (lswT.i >= lswT.passos.length - 1) {
    const fim = lswT.passos[lswT.i].fim; lswFecharTour(); if (fim) fim(); return;
  }
  lswIrPasso(lswT.i + 1);
}
function lswVoltar(){ if (lswT.i > 0) lswIrPasso(lswT.i - 1); }

/* ---------------- 5. roteiros ---------------- */
const lswAdmin = () => session && session.role === 'admin';
const lswNav = v => `.nav-item[data-view="${v}"]`;
// Ajudantes do editor: encontram coluna, medida e visual pelo nome que aparece na tela
const lswCol = rot => { const c = ed.base.colunas.find(x => String(x.rotulo).toUpperCase() === rot || String(x.origem).toUpperCase() === rot); if (!c) throw new Error('coluna ' + rot + ' não encontrada'); return c.nome; };
const lswMed = nome => (ed.base.medidas || []).find(m => m.nome === nome);
const lswVis = titulo => (edGuiaAtual().visuais || []).find(v => v.titulo === titulo || v._lsw === titulo);
const lswElVis = titulo => () => { const v = lswVis(titulo); return v ? document.querySelector(`#ed-grade .grid-stack-item[gs-id="${v.id}"]`) : null; };
const lswBotaoFaixa = texto => () => [...document.querySelectorAll('#ed-faixa .ed-rib-btn')].find(b => b.textContent.includes(texto) && lswVisivel(b));
const lswEditorPronto = () => lswEl('ed-overlay') && ed.dadosProntos;
async function lswCriarMedida(nome, formula, formato){
  if (lswMed(nome)) return;
  ed.aba = 'inicio'; edRenderFaixa();
  vzAbrirMedida();
  await lswEspera(250);
  const n = lswEl('vz-m-nome'); n.value = nome; n.dispatchEvent(new Event('input'));
  const f = lswEl('vz-m-formato'); f.value = formato; f.dispatchEvent(new Event('change'));
  const ta = lswEl('vz-m-formula'); ta.value = formula; vzDaxDigitou();
  await lswEspera(900); // deixa a pessoa ver o resultado aparecer
  await vzSalvarMedida();
}
// Preenche um visual (e troca o título) como se a pessoa tivesse arrastado os campos
function lswPreencher(tituloAtual, novoTitulo, campos){
  const v = lswVis(tituloAtual) || lswVis(novoTitulo);
  if (!v) throw new Error('visual ' + tituloAtual + ' não encontrado');
  v._lsw = tituloAtual;
  edSelecionar(v.id);
  for (const [slot, itens] of Object.entries(campos)) for (const it of itens) {
    const ja = ((v.campos || {})[slot] || []).some(x => (x.id && x.id === it.id) || (x.col && x.col === it.col));
    if (!ja) vzColocarCampo(v.id, slot, it);
  }
  if (novoTitulo && v.titulo !== novoTitulo) { edMudar(() => { v.titulo = novoTitulo; }); edTituloAoVivo(v.id, novoTitulo); edRenderFaixa(); }
}
const lswM = nome => { const m = lswMed(nome); if (!m) throw new Error('crie a medida ' + nome + ' primeiro'); return { tipo: 'medida', id: m.id }; };
const lswC = rot => ({ tipo: 'col', col: lswCol(rot) });
const lswTemCampos = titulo => { const v = lswVis(titulo); return v && Object.values(v.campos || {}).some(l => l.length); };

const LSW_ROTEIROS = {
  // Tour 1 · conhecer o sistema (qualquer perfil)
  conhecer: () => [
    { titulo: 'Bem-vindo ao LSW_DashBi 👋', texto: 'Em menos de um minuto você conhece as partes do sistema. Use <b>Próximo</b> para seguir ou <b>Sair</b> quando quiser — o passo a passo fica no menu <b>Tutorial</b>.' },
    { titulo: 'Menu', alvo: '#sidebar .sidebar-nav', texto: 'Tudo começa aqui. A seta redonda no topo recolhe o menu para sobrar mais espaço.', antes: () => switchView('reports') },
    { titulo: 'Relatórios', alvo: '#reports-grid', texto: 'Cada card é um relatório. A etiqueta <b>Estúdio</b> marca os que foram montados sem código; <b>Painel do sistema</b> é o painel feito em código. Clique em <b>Abrir</b> para ver.' },
    { titulo: 'Publicar relatório', alvo: '#btn-new-report', mostrar: lswAdmin, texto: 'O administrador também pode publicar um link externo (por exemplo, um relatório do Power BI).' },
    { titulo: 'Usuários', alvo: '#nav-users', mostrar: lswAdmin, texto: 'Cadastro de pessoas, perfis (Administrador ou Usuário), ativar/desativar e resetar senha.' },
    { titulo: 'Estúdio', alvo: '#nav-estudio', mostrar: lswAdmin, texto: 'Onde os relatórios são criados: você sobe a planilha, cria as contas e desenha o painel. É o coração do sistema.' },
    { titulo: 'Tema claro ou escuro', alvo: '.theme-toggle', texto: 'Alterna o tema. Em <b>Configurações</b> você ainda escolhe a paleta (Aurora, Brasa ou Oceano) e o tamanho da letra.' },
    { titulo: 'Apresentação e Tutorial', alvo: lswPrimeiro(lswNav('tutorial')), texto: 'A apresentação mostra a ferramenta; o tutorial explica tudo com calma e tem o passo a passo para criar um relatório.',
      fim: () => { if (lswAdmin()) showToast('Dica: no menu Tutorial há o passo a passo "Criar um relatório".', 'sucesso', 4500); } },
  ],

  // Tour 3 · ler um relatório publicado
  ler: () => [
    { titulo: 'Abrir um relatório', alvo: () => [...document.querySelectorAll('#reports-grid .report-card')].find(c => c.textContent.includes('PAINEL CSAT (ESTÚDIO)')),
      texto: 'Este card foi montado no Estúdio. Vamos abri-lo como um usuário vê.', faca: 'clique em <b>Abrir</b> no card <b>PAINEL CSAT (ESTÚDIO)</b>.',
      antes: () => switchView('reports'),
      acao: () => { const r = reports.find(x => x.tipo === 'estudio' && x.title === 'PAINEL CSAT (ESTÚDIO)') || reports.find(x => x.tipo === 'estudio'); openViewer(r.id); },
      pronto: () => lswEl('ed-overlay') && ed.leitura && ed.dadosProntos },
    { titulo: 'Guias', alvo: lswPrimeiro('.ed-top .ed-guias-cab', '#ed-guias'), texto: 'O relatório tem várias páginas: Visão Geral, Operador, Supervisor e Operação.' },
    { titulo: 'Filtros', alvo: lswPrimeiro('#ed-grade .grid-stack-item[gs-id="f_oper_g1"]'), texto: 'Escolha uma operação, uma data ou um horário: todos os números da tela obedecem. A escolha continua valendo ao trocar de guia.' },
    { titulo: 'Números principais', alvo: lswPrimeiro('#ed-grade .grid-stack-item[gs-id="k_csat"]'), texto: 'O CSAT global com a meta. Ao lado: promotoras, neutras e detratoras, com a porcentagem de cada uma.' },
    { titulo: 'Dia ou hora', alvo: lswPrimeiro('#ed-grade .grid-stack-item[gs-id="l_geral"]'), texto: 'Os botões <b>Intraday</b> e <b>Intrahora</b> trocam o gráfico entre "por dia" e "por meia hora". A tabela abaixo aparece só na visão por hora.' },
    { titulo: 'Exportar', alvo: '#ed-exportar', texto: 'Baixa em Excel o que está na tela, já com os filtros escolhidos.' },
    { titulo: 'Fechar', alvo: '.ed-top .btn-icon', texto: 'O X fecha o relatório e volta para a lista.', acao: () => edFechar(), pronto: () => !lswEl('ed-overlay') },
  ],

  // Tour 2 · criar o primeiro relatório (administrador)
  relatorio: () => {
    const d = lswT.dados = {};
    return [
      { titulo: 'Seu primeiro relatório', texto: 'Vamos fazer o caminho completo: <b>subir uma planilha → criar as contas → montar o painel → publicar</b>.<br><br>Em cada passo, eu acendo o lugar certo e digo o que fazer. Se preferir, clique em <b>Fazer por mim</b>.',
        mostrar: () => true, antes: () => { if (!lswAdmin()) { lswFecharTour(); showToast('Este passo a passo é para o perfil Administrador. Saia e entre como Administrador.', 'erro', 5000); } } },
      { titulo: 'Abra o Estúdio', alvo: '#nav-estudio .nav-subitem[data-sub="bases"]', texto: 'O Estúdio é onde ficam as bases de dados e os relatórios em construção. No menu ele se abre em duas partes: <b>Bases de dados</b> e <b>Relatórios</b>.', faca: 'clique em <b>Estúdio › Bases de dados</b> no menu.',
        antes: () => { const g = lswEl('nav-estudio'); if (g) g.classList.add('aberto'); },
        acao: () => switchView('estudio', 'bases'), pronto: () => !lswEl('view-estudio').classList.contains('hidden') && est.bases && est.aba === 'bases' },
      { titulo: 'Nova base', alvo: lswPrimeiro('#estudio-conteudo .th-acao .btn-primary, #estudio-conteudo .empty-acoes .btn-primary'), texto: 'Primeiro, os ingredientes: a planilha com os dados.', faca: 'clique em <b>Nova base</b>.',
        antes: () => { if (!est.assist && est.aba !== 'bases') estTrocarAba('bases'); }, acao: () => estNovaBase(), pronto: () => est.assist && est.assist.modo === 'nova' },
      { titulo: 'Dê um nome', alvo: '#est-nome', texto: 'Um nome que qualquer colega entenda. A descrição é opcional.', faca: 'escreva <b>ATENDIMENTOS EXEMPLO</b> no nome.',
        acao: () => { const n = lswNomeLivre('ATENDIMENTOS EXEMPLO', est.bases.map(b => b.nome)); est.assist.nome = n; lswEl('est-nome').value = n; },
        pronto: () => est.assist && String(est.assist.nome || '').trim().length > 2 },
      { titulo: 'Escolha a planilha', alvo: lswPrimeiro('#lsw-usar-exemplo'), texto: 'Normalmente você clicaria em <b>Selecionar planilha</b>. Aqui temos uma pronta: atendimentos fictícios de 6 dias.', faca: 'clique em <b>Usar planilha de exemplo</b> e espere a leitura.',
        acao: () => lswUsarPlanilhaExemplo(), pronto: () => est.assist && est.assist.passo === 2 },
      { titulo: 'Confira as colunas', alvo: lswPrimeiro('.est-tabela'), antes: () => { d.base = est.assist.nome; },
        texto: 'O sistema leu a planilha inteira. Para cada coluna: <b>Guardar</b> (vai para o sistema?), <b>Nome</b>, <b>Tipo</b> (o ✓ é a sugestão) e o que fazer com <b>vazios</b>. Aqui está tudo certo: DATA é data, NOTA é número inteiro, ATENDENTE é texto.' },
      { titulo: 'Ver a prévia', alvo: lswPrimeiro('.est-rodape .btn-primary'), texto: 'Antes de gravar, o sistema mostra como os dados ficaram.', faca: 'clique em <b>Ver prévia</b>.',
        acao: () => estContinuarColunas(), pronto: () => est.assist && est.assist.passo === 3 },
      { titulo: 'Gravar', alvo: lswPrimeiro('.est-rodape .btn-primary'), texto: 'Aqui aparecem as linhas convertidas e quantas serão gravadas por dia. Tudo certo?', faca: 'clique em <b>Gravar</b> e espere terminar.',
        acao: () => estGravar(), pronto: () => est.assist && est.assist.concluido && !est.assist.gravando },
      { titulo: 'Base pronta!', alvo: lswPrimeiro('.est-rodape .btn-primary'), texto: 'Os dados estão guardados, um arquivo por dia. Agora vamos ao relatório.', faca: 'clique em <b>Voltar para as bases</b>.',
        acao: () => estCancelar(), pronto: () => !est.assist },
      { titulo: 'Relatórios do Estúdio', alvo: '#nav-estudio .nav-subitem[data-sub="relatorios"]', texto: 'Aqui ficam os relatórios do Estúdio.', faca: 'clique em <b>Relatórios</b>, dentro de Estúdio, no menu.',
        antes: () => { const g = lswEl('nav-estudio'); if (g) g.classList.add('aberto'); },
        acao: () => estTrocarAba('relatorios'), pronto: () => est.aba === 'relatorios' && !est.assist },
      { titulo: 'Novo relatório', alvo: lswPrimeiro('#estudio-conteudo .th-acao .btn-primary, #estudio-conteudo .empty-acoes .btn-primary'), texto: 'Vamos criar o relatório em cima da base que acabamos de gravar.', faca: 'clique em <b>Novo relatório</b>.',
        acao: () => estNovoRelatorio(), pronto: () => est.novoRel },
      { titulo: 'Nome, base e modelo', alvo: lswPrimeiro('.est-novo-rel'), limite: 90000,
        texto: '<b>Começar com → Modelo sugerido</b> já desenha 3 cards, 2 gráficos e uma tabela, vazios, esperando os campos.',
        faca: `nome <b>MEU PRIMEIRO RELATÓRIO</b>, base <b>${d.base || 'ATENDIMENTOS EXEMPLO'}</b>, modelo sugerido → <b>Criar e abrir o editor</b>.`,
        acao: async () => {
          lswEl('est-rel-nome').value = lswNomeLivre('MEU PRIMEIRO RELATÓRIO', est.relatorios.map(r => r.nome));
          const b = est.bases.find(x => x.nome === d.base) || est.bases.filter(x => x.fonte !== 'csat').slice(-1)[0];
          lswEl('est-rel-base').value = b.id; lswEl('est-rel-modelo').value = 'sugerido';
          await estCriarRelatorio();
        }, pronto: lswEditorPronto },
      { titulo: 'O editor', alvo: '.ed-top', texto: 'No cabeçalho: nome do relatório, zoom, Exportar, <b>Prévia</b>, desfazer/refazer e <b>Salvar</b>.' },
      { titulo: 'Faixa de menus', alvo: '.ed-faixa-wrap', texto: 'Funciona como a do Excel: <b>Página Inicial</b>, <b>Inserir</b>, <b>Cálculos</b> e <b>Exibir</b>. Quando você clica num visual, aparecem as abas <b>Visual</b> e <b>Formatar</b>.' },
      { titulo: 'Painel Dados', alvo: '#ed-dados', texto: 'As <b>colunas</b> da planilha e, logo mais, as <b>medidas</b>. É daqui que você arrasta os campos para os visuais.' },
      { titulo: 'A tela', alvo: '#ed-tela', texto: 'O modelo sugerido já colocou os visuais. Eles estão vazios porque ainda não dissemos <b>o que</b> mostrar. Para isso, precisamos das contas — as medidas.' },
      { titulo: 'Medida 1 · ATENDIMENTOS', alvo: lswBotaoFaixa('Nova medida'), antes: () => { ed.aba = 'inicio'; edRenderFaixa(); },
        texto: 'Conta quantas linhas a base tem — como o <b>CONT.VALORES</b> do Excel.<br><code>COUNTROWS(dados)</code>',
        faca: 'clique em <b>fx Nova medida</b>, nome <b>ATENDIMENTOS</b>, formato <b>Número inteiro</b>, escreva a fórmula e clique em <b>Salvar medida</b>.',
        acao: () => lswCriarMedida('ATENDIMENTOS', 'COUNTROWS(dados)', 'inteiro'), pronto: () => lswMed('ATENDIMENTOS') && !lswEl('vz-janela') },
      { titulo: 'Medida 2 · NOTA MÉDIA', alvo: lswBotaoFaixa('Nova medida'),
        texto: 'A média da coluna NOTA — como o <b>MÉDIA</b> do Excel.<br><code>AVERAGE(dados[NOTA])</code>',
        faca: 'nova medida <b>NOTA MÉDIA</b>, formato <b>Decimal</b>.',
        acao: () => lswCriarMedida('NOTA MÉDIA', 'AVERAGE(dados[NOTA])', 'decimal'), pronto: () => lswMed('NOTA MÉDIA') && !lswEl('vz-janela') },
      { titulo: 'Medida 3 · % RESOLVIDOS', alvo: lswBotaoFaixa('Nova medida'),
        texto: 'Resolvidos ÷ atendimentos. <b>CALCULATE</b> é o "SES" do Excel: conta só as linhas com RESOLVIDO = 1.<br><code>DIVIDE(CALCULATE(COUNTROWS(dados), dados[RESOLVIDO] = 1), [ATENDIMENTOS])</code>',
        faca: 'nova medida <b>% RESOLVIDOS</b>, formato <b>Porcentagem</b>.',
        acao: () => lswCriarMedida('% RESOLVIDOS', 'DIVIDE(CALCULATE(COUNTROWS(dados), dados[RESOLVIDO] = 1), [ATENDIMENTOS])', 'porcentagem'), pronto: () => lswMed('% RESOLVIDOS') && !lswEl('vz-janela') },
      { titulo: 'Card 1', alvo: lswElVis('INDICADOR 1'), antes: () => edSelecionar(null),
        texto: 'Um card mostra um número em destaque. Para preenchê-lo, arraste a medida do painel Dados e solte em cima dele.',
        faca: 'arraste <b>ATENDIMENTOS</b> (painel Dados, grupo Medidas) para o card <b>INDICADOR 1</b>.',
        acao: () => lswPreencher('INDICADOR 1', 'ATENDIMENTOS', { valores: [lswM('ATENDIMENTOS')] }), pronto: () => lswTemCampos('INDICADOR 1') },
      { titulo: 'Cards 2 e 3', alvo: lswElVis('INDICADOR 2'), texto: 'Mesma coisa para os outros dois cards.',
        faca: 'arraste <b>NOTA MÉDIA</b> para o INDICADOR 2 e <b>% RESOLVIDOS</b> para o INDICADOR 3.',
        acao: () => { lswPreencher('INDICADOR 2', 'NOTA MÉDIA', { valores: [lswM('NOTA MÉDIA')] }); lswPreencher('INDICADOR 3', '% RESOLVIDOS', { valores: [lswM('% RESOLVIDOS')] }); },
        pronto: () => lswTemCampos('INDICADOR 2') && lswTemCampos('INDICADOR 3') },
      { titulo: 'Gráfico de linhas', alvo: lswElVis('EVOLUÇÃO POR DIA'),
        texto: 'Um gráfico precisa de duas coisas: o <b>Eixo</b> (por onde abrir — aqui, por dia) e os <b>Valores</b> (a medida). Ao soltar uma coluna de data, ela vai sozinha para o Eixo.',
        faca: 'arraste a coluna <b>DATA</b> e a medida <b>NOTA MÉDIA</b> para o gráfico EVOLUÇÃO POR DIA.',
        acao: () => lswPreencher('EVOLUÇÃO POR DIA', 'NOTA MÉDIA POR DIA', { eixo: [lswC('DATA')], valores: [lswM('NOTA MÉDIA')] }), pronto: () => lswTemCampos('EVOLUÇÃO POR DIA') },
      { titulo: 'Gráfico de colunas', alvo: lswElVis('COMPARATIVO POR DIA'), texto: 'Agora o volume por dia.',
        faca: 'arraste <b>DATA</b> e <b>ATENDIMENTOS</b> para o gráfico COMPARATIVO POR DIA.',
        acao: () => lswPreencher('COMPARATIVO POR DIA', 'ATENDIMENTOS POR DIA', { eixo: [lswC('DATA')], valores: [lswM('ATENDIMENTOS')] }), pronto: () => lswTemCampos('COMPARATIVO POR DIA') },
      { titulo: 'Tabela dinâmica', alvo: lswElVis('RESULTADO POR OPERADOR'),
        texto: 'Como a tabela dinâmica do Excel: <b>Linhas</b> (um por atendente) e <b>Valores</b> (as medidas lado a lado). Clique no título de uma coluna para ordenar.',
        faca: 'arraste <b>ATENDENTE</b> e depois as três medidas para a tabela.',
        acao: () => lswPreencher('RESULTADO POR OPERADOR', 'RESULTADO POR ATENDENTE', { linhas: [lswC('ATENDENTE')], valores: [lswM('ATENDIMENTOS'), lswM('NOTA MÉDIA'), lswM('% RESOLVIDOS')] }),
        pronto: () => { const v = lswVis('RESULTADO POR OPERADOR'); return v && (v.campos.valores || []).length >= 3; } },
      { titulo: 'Visual e Formatar', alvo: '#ed-faixa-abas',
        antes: () => { const v = lswVis('INDICADOR 1'); if (v) { edSelecionar(v.id); ed.aba = 'formatar'; edRenderFaixa(); } },
        texto: 'Com um visual selecionado surgem duas abas: <b>Visual</b> (título, tipo e as caixas de campos) e <b>Formatar</b> (cores, tamanho da letra, formato dos números, fundo). Explore à vontade — <b>Ctrl+Z</b> desfaz.' },
      { titulo: 'Prévia', alvo: '#ed-previa-btn', antes: () => edSelecionar(null), texto: 'Mostra o relatório como o usuário vai ver, sem as ferramentas.',
        faca: 'clique em <b>Prévia</b>.', acao: () => edAlternarPrevia(), pronto: () => ed.previa },
      { titulo: 'Salvar', alvo: '#ed-salvar', antes: () => { if (ed.previa) edAlternarPrevia(); }, texto: 'Saímos da prévia. Agora grave o desenho.',
        faca: 'clique em <b>Salvar</b>.', acao: () => edSalvar(), pronto: () => !ed.sujo },
      { titulo: 'Publicar', alvo: lswBotaoFaixa('Publicar'), antes: () => { edSelecionar(null); ed.aba = 'inicio'; edRenderFaixa(); },
        texto: 'Publicar transforma o relatório num card em <b>Relatórios</b>. Depois, editar não muda nada para os usuários até você publicar de novo.',
        faca: 'clique em <b>Publicar</b>, escolha a categoria e confirme.',
        acao: async () => { if (!lswEl('ed-pub')) edAbrirPublicar(); await lswEspera(300); lswEl('ed-pub-desc').value = 'CRIADO NO PASSO A PASSO'; await edPublicar(); },
        pronto: () => ed.rel && ed.rel.publicado_em && !lswEl('ed-pub') },
      { titulo: 'Pronto! 🎉', alvo: lswPrimeiro('#reports-grid .report-card'),
        antes: async () => { if (lswEl('ed-overlay')) edFechar(); switchView('reports'); await carregarRelatorios(); },
        texto: 'Seu relatório já está em <b>Relatórios</b>, como um card. Para mudar algo: Estúdio → Relatórios → <b>Editar</b>, e depois <b>Publicar de novo</b>.<br><br>No <b>Tutorial</b> há mais: filtros, guias, velocímetro, tendência e o modelo em Z.' },
    ];
  },
};

/* ---------------- início ---------------- */
// Ao abrir a página: mostra a apresentação pública (ou a tela de entrada, se a pessoa acabou de sair ou zerar)
(function lswIniciar(){
  aplicarPrefs();
  const p = lswPaleta();
  const atualizarLogos = () => { const q = lswPaleta(); document.querySelectorAll('.lsw-marca-icone').forEach(i => { i.src = `img/logo-icone-${q}.png`; });
    const l = document.querySelector('.lsw-login-logo'); if (l) l.src = `img/logo-completo-${q}.png`; };
  atualizarLogos();
  // Trocar a paleta em Configurações também troca as logos da página pública e da entrada
  const salvarOriginal = salvarPref;
  window.salvarPref = function(chave, valor){ salvarOriginal(chave, valor); if (chave === 'paleta') atualizarLogos(); };
  let irLogin = false; try { irLogin = sessionStorage.getItem('lsw-ir-login') === '1'; sessionStorage.removeItem('lsw-ir-login'); } catch (e) {}
  if (irLogin || location.hash === '#entrar') lswIrParaLogin();
  else lswPublico(location.hash === '#tutorial' ? 'tutorial' : 'apresentacao');
})();
