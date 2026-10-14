# Paint (clone web do Paint clássico do Windows)

Editor de imagens que roda direto no navegador, sem dependências nem instalação.
Abra `index.html` ou sirva a pasta: `python3 -m http.server 8000` e acesse http://localhost:8000.

## Como o Paint clássico funciona (e como foi reproduzido)

| Conceito do Paint | Implementação |
|---|---|
| Área de desenho bitmap, sem suavização | `<canvas>` com `image-rendering: pixelated`; lápis e pincel usam Bresenham, e as formas têm bordas sem anti-aliasing |
| **Cor 1** (frente) e **Cor 2** (fundo) | Botão esquerdo desenha com a cor 1, botão direito com a cor 2. Duplo clique em uma cor abre o editor de cores |
| Caixa de ferramentas com 16 ferramentas e painel de opções | Seleção livre, Selecionar, Borracha, Preencher, Selecionar cor, Lupa, Lápis, Pincel, Aerógrafo, Texto, Linha, Curva, Retângulo, Polígono, Elipse e Retângulo arredondado |
| Seleção flutuante | Arraste para mover (o espaço deixado fica com a cor 2); **Ctrl+arrastar** copia; modo opaco ou transparente |
| Desfazer em vários níveis | Histórico de 40 estados (Ctrl+Z / Ctrl+Y) |
| Formas com contorno, contorno+preenchimento ou só preenchimento | Painel de opções; **Shift** força quadrado, círculo ou ângulos de 45° |
| Curva em dois arrastes e polígono por cliques | Igual ao original: duplo clique ou Enter fecha o polígono |
| Menu Imagem | Inverter, girar, inverter cores, atributos (largura/altura) e limpar imagem. A alça no canto também redimensiona |
| Arquivo | Novo, Abrir imagem, Salvar como PNG. Também cola imagens da área de transferência (Ctrl+V) |

## Atalhos

`Ctrl+N` novo · `Ctrl+O` abrir · `Ctrl+S` salvar · `Ctrl+Z/Y` desfazer/refazer · `Ctrl+A` selecionar tudo ·
`Ctrl+C/X/V` copiar/recortar/colar · `Del` limpar seleção · `Ctrl+I` inverter cores · `Ctrl+E` atributos ·
`Ctrl+G` grade (zoom ≥ 4x) · `Esc` cancela a operação atual.

## Arquivos

- `index.html`: estrutura da janela
- `styles.css`: visual estilo Windows 98
- `app.js`: ferramentas, histórico, seleção, menus e arquivos

## Configuração do Claude Code neste repositório

- `.claude/settings.json` habilita o plugin Superpowers
- `.mcp.json` registra o servidor MCP REA (`rea-agents`)
