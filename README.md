# LSW_DashBi

Portal de relatórios com um **Estúdio** para criar dashboards sem código — versão de demonstração para portfólio.

**Logic Synapse Web © 2026**

## O que é

- **Relatórios:** cada relatório publicado vira um card. Administrador publica, oculta, descontinua; usuário só lê.
- **Estúdio:** sobe uma planilha (.xlsx, .xlsb, .csv) → confere tipos e vazios → cria medidas em **DAX** → monta o painel arrastando campos (cards, gráficos, tabela dinâmica, filtros, velocímetro, cascata, tendência, reincidência) → publica.
- **Quadro de funcionários:** carga de duas bases de RH (DPO e WFM) com ligação por nome + admissão, quadro atual com pesquisa e ficha da pessoa, trajetória, foto diária, painel do mês (dias reais, remontados e projeção, turnover, DPO × WFM) e envio ao Estúdio como base com medidas DAX. Em Quadro › Cargas, **Usar bases de exemplo** carrega dados fictícios.
- **Solicitações (estilo chamados):** pedido de ajuste a partir da pessoa, guias Aprovado / Aberto / Andamento / Reprovado / Cancelado, aplicação automática ao aprovar e alerta quando a carga seguinte diverge. Os formulários são montados em Administração › Tickets, com árvore de decisão.
- **Perfis e operações:** Administração › Perfis define, numa árvore de permissões, o que cada perfil vê e faz (vale na tela e no servidor); Administração › Operações é uma tabela (operação, cliente, situação); cada usuário pertence a uma operação e cada relatório pode ser liberado para uma, várias ou todas.
- **Tela inteira:** a página não rola; listas e tabelas ocupam a altura da tela, rolam por dentro e mantêm o cabeçalho fixo.
- **Painel CSAT:** exemplo de painel feito em código e o mesmo painel recriado no Estúdio.
- **Apresentação e Tutorial:** página de portfólio, tutorial de leitura para quem não é da área de dados e passo a passo guiado na tela ("Fazer por mim").

## Como a demonstração funciona

É um site estático. Não há servidor nem banco:

- `lsw-demo-api.js` responde, dentro do navegador, as mesmas rotas do servidor real (Node + Express + Supabase);
- os dados ficam no **IndexedDB** do navegador e as preferências no `localStorage`;
- `lsw-dados.js` gera os dados fictícios (nenhum nome é de pessoa real);
- Configurações → **Zerar demonstração** volta ao estado inicial.

Acesso: na tela de entrada, **Entrar como Administrador** ou **Entrar como Usuário**
(ou `admin@lsw.demo` / `usuario@lsw.demo` / `supervisor@lsw.demo` — perfil parcial —, senha `demo123`).

## Tecnologias

HTML, CSS e JavaScript puros · DuckDB-WASM · Parquet · Apache ECharts · Gridstack · SheetJS · DAX → SQL.

## Rodar localmente

Qualquer servidor estático na pasta, por exemplo a extensão Live Server do VS Code, e abrir `index.html`.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | estrutura das telas |
| `style.css`, `estudio.css`, `lsw.css` | aparência (o `lsw.css` traz as paletas aurora, brasa e oceano) |
| `script.js` | portal: login, relatórios, usuários, painel CSAT, configurações |
| `estudio.js`, `estudio-editor.js`, `estudio-visuais.js`, `estudio-dax.js` | Estúdio: bases, editor, visuais e medidas DAX |
| `quadro-base.js`, `quadro.js`, `quadro-solicitacoes.js`, `quadro-modelos.js`, `quadro-escalas.js`, `quadro-estudio.js`, `quadro.css` | Quadro: cargas, quadro atual, solicitações, modelos, escalas e o painel no Estúdio (base ligada ao Quadro) |
| `admin-perfis.js` | Administração › Perfis (árvore de permissões) e operações |
| `lsw-dados.js`, `lsw-demo-api.js` | dados fictícios e servidor de demonstração |
| `lsw-app.js` | apresentação, tutorial e passo a passo guiado |
| `img/` | logos (uma por paleta) e capturas de tela |
