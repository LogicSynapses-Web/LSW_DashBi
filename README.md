# LSW_DashBi

Portal de relatórios com um **Estúdio** para criar dashboards sem código — versão de demonstração para portfólio.

**Logic Synapse Web © 2026**

## O que é

- **Relatórios:** cada relatório publicado vira um card. Administrador publica, oculta, descontinua; usuário só lê.
- **Estúdio:** sobe uma planilha (.xlsx, .xlsb, .csv) → confere tipos e vazios → cria medidas em **DAX** → monta o painel arrastando campos (cards, gráficos, tabela dinâmica, filtros, velocímetro, cascata, tendência, reincidência) → publica.
- **Painel CSAT:** exemplo de painel feito em código e o mesmo painel recriado no Estúdio.
- **Apresentação e Tutorial:** página de portfólio, tutorial de leitura para quem não é da área de dados e passo a passo guiado na tela ("Fazer por mim").

## Como a demonstração funciona

É um site estático. Não há servidor nem banco:

- `lsw-demo-api.js` responde, dentro do navegador, as mesmas rotas do servidor real (Node + Express + Supabase);
- os dados ficam no **IndexedDB** do navegador e as preferências no `localStorage`;
- `lsw-dados.js` gera os dados fictícios (nenhum nome é de pessoa real);
- Configurações → **Zerar demonstração** volta ao estado inicial.

Acesso: na tela de entrada, **Entrar como Administrador** ou **Entrar como Usuário**
(ou `admin@lsw.demo` / `usuario@lsw.demo`, senha `demo123`).

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
| `lsw-dados.js`, `lsw-demo-api.js` | dados fictícios e servidor de demonstração |
| `lsw-app.js` | apresentação, tutorial e passo a passo guiado |
| `img/` | logos (uma por paleta) e capturas de tela |
