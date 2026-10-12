# Plano: Drive Fotos

## Contexto

App para subir e ver fotos, simples como o `beba-agua`: HTML, CSS e JS puros, sem servidor,
sem build e sem dependências. O login é um token pessoal do GitHub guardado só no
navegador.

## Decisões

- **Dois repositórios, em duas contas do GitHub.**
  - `drive-fotos`: público, na conta principal. Só a interface, em HTML, CSS e JS. Não
    sobe servidor, não guarda imagem nem dado, só mostra o que lê do outro repositório.
  - `drive-fotos-dados`: privado, numa conta separada, criada só para isso. Funciona como
    banco de dados, e é onde moram os blobs e os registros. Tudo que é privado fica nele.
- **Por que uma conta separada:** se o GitHub limitar ou suspender por uso de espaço, quem
  é atingida é a conta das fotos, e não a do portfólio e dos projetos de carreira. Os
  commits de envio também saem em nome dela, e não pintam o gráfico de contribuições da
  conta principal.
- **Diferença para o `beba-agua`:** lá os dados ficam numa branch do mesmo repositório do
  app. Aqui os dados ficam em outro repositório, de outra conta.
- **Token:** fine-grained, gerado na conta separada, com acesso só ao `drive-fotos-dados`,
  Contents em "Read and write". É o token que protege as fotos: sem ele, a interface
  pública não lê nada. A conta principal não tem acesso nenhum ao repositório de dados.
- **Cada foto é um commit no repositório de dados**, com três arquivos:
  - o blob, que é a foto de fato e o asset mais importante, guardado intacto;
  - a miniatura, gerada no navegador;
  - o registro, um `.json` por foto, com `id`, `nome` e as referências básicas. O registro
    existe para servir o blob, nunca o contrário.
- **CRUD no MVP:** enviar, ver, renomear, baixar a original e apagar.
- **Estrutura do app:** a mesma do `beba-agua`.

```
index.html
manifest.webmanifest
icones/
src/style.css
src/app.js       estado, regras e eventos
src/github.js    leitura e gravação via API do GitHub
src/ui.js        telas
```

## Repositório de dados

```
fotos/AAAA/<id>.<ext>         blob original
miniaturas/AAAA/<id>.jpg      miniatura
registros/AAAA/<id>.json      registro
```

- **Uma pasta por ano:** o GitHub recomenda no máximo 3.000 entradas por pasta. Com uma
  pasta por ano, cada uma comporta até 3.000 fotos naquele ano, o que cobre o uso esperado.
  O ano da pasta é o ano do `id`, então o caminho de qualquer foto sai do próprio `id`.

- **`id`:** gerado no navegador, com a data na frente e um sufixo aleatório, por exemplo
  `20261012T153045-a1b2`. Como o `id` é o nome dos três arquivos, a lista de caminhos do
  repositório já basta para ordenar e agrupar a grade por data, sem abrir nenhum registro.
- **Blob salvo pelo `id`, não pelo nome:** renomear mexe só no registro, o blob não se
  move.
- **Registro:**

```json
{
  "versao": 1,
  "id": "20261012T153045-a1b2",
  "nome": "praia.jpg",
  "tipo": "image/jpeg",
  "tamanho": 3481122,
  "largura": 4032,
  "altura": 3024,
  "data": "2026-10-12T15:30:45-03:00",
  "enviada_em": "2026-10-12T18:02:11-03:00",
  "blob": "fotos/2026/20261012T153045-a1b2.jpg",
  "miniatura": "miniaturas/2026/20261012T153045-a1b2.jpg"
}
```

- **Um commit com os três arquivos:** a API de Contents grava um arquivo por commit. Para a
  foto entrar inteira ou não entrar, o envio usa a API de Git Data (cria os blobs, a
  árvore, o commit e move a branch), que a mesma permissão de Contents cobre.
- **Dois aparelhos ao mesmo tempo:** os arquivos nunca colidem, porque cada foto tem os
  seus. O que pode acontecer é a branch ter andado entre o início e o fim do envio. Nesse
  caso o app relê a ponta da branch e refaz só o commit, sem reenviar os blobs.
- **Leitura:** uma chamada à árvore do repositório lista tudo. Imagem de repositório
  privado não abre por URL direta, então o app baixa cada blob com o token e monta a
  imagem.

## Miniatura

Dá para gerar com JS puro, sem biblioteca: o navegador decodifica a foto
(`createImageBitmap`), desenha reduzida num `canvas` e exporta em JPEG (`canvas.toBlob`).
Por isso a miniatura entra no MVP.

- Lado maior de 400 px, JPEG com qualidade 0,8. Fica na casa de 30 a 60 KB por foto.
- A grade carrega só miniaturas. A original só é baixada ao abrir a foto.
- **Limite:** o navegador só gera miniatura do formato que ele sabe decodificar. HEIC do
  iPhone abre no Safari, mas não no Chrome. Quando a decodificação falha, a foto sobe sem
  miniatura e a grade mostra um quadro neutro com o nome. O iPhone costuma converter para
  JPEG ao escolher pela galeria, então o caso é raro.

## Envio

A ideia vem do upload do `cloud-files` (componentes `zona-envio` e `fila-de-envio`),
reescrita em JS puro. O mesmo caminho serve para celular e web.

- **Zona de envio:** uma caixa que é o alvo de toque, clique e teclado e abre o seletor de
  arquivos, com `multiple` e `accept="image/*"`. No celular, o seletor já oferece a galeria
  e a câmera.
- **Arrastar e soltar na web:** os ouvintes ficam na janela, então soltar em qualquer canto
  da página envia. Vêm junto os três cuidados do `cloud-files`: contador de `dragenter` e
  `dragleave` para o véu não piscar, `preventDefault` no `dragover` para o navegador não
  abrir a foto numa aba, e filtro por `types` para só reagir a arquivo.
- **Fila de envio:** uma foto por vez, em sequência. Cada item tem estado (na fila,
  enviando, enviado, erro), e a fila mostra "Enviando 2 de 5", o que falhou e um "tentar de
  novo" por item, sem refazer a seleção.
- **Recusas na entrada:** arquivo vazio, pasta e o que não for imagem ficam de fora, com
  aviso.
- **Fica de fora do `cloud-files`:** trial, barra de espaço livre e backend. Aqui o envio é
  o commit direto no repositório de dados.

## Visualização

No molde do Google Fotos.

- **Grade:** a tela inicial é a grade de miniaturas, da mais recente para a mais antiga,
  agrupada por dia, com um título por dia.
- **Data da foto:** a data de modificação do arquivo, que o navegador entrega sem
  biblioteca. Sem ela, vale a data do envio. Leitura de EXIF fica fora.
- **Abrir:** um toque ou clique abre a foto em tela cheia. Fecha no X, no Esc ou no voltar
  do navegador.
- **Navegar:** com a foto aberta, deslizar no celular ou usar as setas no teclado passa
  para a anterior e a próxima.
- **Ações na foto aberta:** renomear, baixar a original e apagar.

## MVP

### Telas

1. **Login:** campo para colar o token. O app valida lendo o repositório de dados e guarda
   o token só no navegador. "Sair" apaga.
2. **Grade:** tela inicial, com a zona de envio no topo. Estado vazio convida a enviar a
   primeira foto.
3. **Foto aberta:** tela cheia por cima da grade, com fechar, anterior, próxima e as três
   ações.

### Fluxo de envio

1. A pessoa escolhe ou solta as fotos. O app descarta o que não é imagem e monta a fila.
2. Para cada foto, em sequência: gera o `id`, gera a miniatura, monta o registro e faz o
   commit dos três arquivos.
3. A foto entra na grade assim que o commit dela termina, sem esperar o resto da fila.
4. Falha em uma foto não para a fila. O item fica com erro e "tentar de novo".

### Fluxo de leitura

1. Ao abrir, o app lê a árvore do repositório de dados e monta a grade.
2. As miniaturas entram conforme aparecem na tela, não todas de uma vez.
3. Miniatura e original já baixadas ficam em cache no navegador, pela identidade do blob,
   que nunca muda. Abrir o app de novo não baixa tudo outra vez.

### Renomear, baixar e apagar

- **Renomear:** edita o `nome` no registro e faz um commit só desse arquivo.
- **Baixar:** baixa o blob original e salva no aparelho com o `nome` do registro.
- **Apagar:** pede confirmação e faz um commit que remove os três arquivos. A foto some do
  app, mas continua no histórico do git, e o repositório não diminui.

### Erros tratados

Os mesmos tipos do `beba-agua`: token inválido, sem permissão, repositório ausente,
conflito, rede e servidor. Cada um com mensagem própria.

### Fora do MVP

Álbuns, busca, compartilhar, vídeo, edição de imagem e seleção múltipla.

## Épicos

Separados por funcionalidade, na ordem de construção. Cada um termina com algo que dá para
testar na tela.

### Épico 1: Fundação e login

- Estrutura de arquivos, `index.html`, estilo base e `manifest.webmanifest` com ícones.
- `github.js`: guardar, ler e apagar o token; chamada base com os tipos de erro.
- Tela de login que valida o token lendo o `drive-fotos-dados`.
- "Sair", com confirmação.
- **Pronto quando:** token válido entra, token inválido ou sem permissão mostra a mensagem
  certa, e "Sair" volta para o login.

### Épico 2: Grade

- Leitura da árvore do repositório e montagem da lista a partir dos caminhos.
- Grade de miniaturas agrupada por dia, da mais recente para a mais antiga.
- Carregamento das miniaturas conforme aparecem na tela.
- Estado vazio, estado de carregamento e quadro neutro para foto sem miniatura.
- **Pronto quando:** fotos postas à mão no repositório de dados aparecem na grade, no dia
  certo.

### Épico 3: Envio

- Zona de envio: toque, clique, teclado e seletor de arquivos.
- Arrastar e soltar na janela inteira, com o véu.
- Recusa de arquivo vazio, pasta e não imagem.
- Geração do `id`, da miniatura e do registro.
- Commit dos três arquivos pela API de Git Data, com nova tentativa quando a branch andou.
- Fila com estado por item, "Enviando 2 de 5" e "tentar de novo".
- **Pronto quando:** várias fotos enviadas pelo celular e pela web entram na grade uma a
  uma, e uma falha no meio não derruba as outras.

### Épico 4: Foto aberta

- Tela cheia por cima da grade, com a original.
- Fechar no X, no Esc e no voltar do navegador.
- Anterior e próxima por deslize e por setas.
- Miniatura como prévia enquanto a original carrega.
- **Pronto quando:** dá para abrir uma foto, percorrer as vizinhas e voltar para a grade no
  mesmo ponto.

### Épico 5: Renomear, baixar e apagar

- Renomear, com commit só do registro.
- Baixar a original com o `nome` do registro.
- Apagar, com confirmação e commit que remove os três arquivos.
- **Pronto quando:** as três ações funcionam na foto aberta e a grade reflete o resultado
  sem recarregar a página.

### Épico 6: Cache e tamanho

- Cache de miniaturas e originais no navegador, pela identidade do blob.
- Releitura da árvore ao voltar para a tela, para aparecer o que subiu em outro aparelho.
- Tamanho usado do repositório de dados na tela, com aviso perto de 1 GB.
- **Pronto quando:** reabrir o app não baixa de novo o que já foi visto, e o tamanho usado
  aparece.

## Em aberto

- Onde o app aprende o dono do repositório de dados: fixo no código, que é público e
  revelaria a conta, ou digitado no login junto com o token e guardado no navegador.
- Origem do app: servido pelo GitHub Pages da conta principal, ele divide o armazenamento
  do navegador com os outros sites dela. A conta separada não resolve isso.

- Progresso por foto: mostrar só o estado de cada item, ou barra de percentual, que exige
  `XMLHttpRequest` no lugar de `fetch`. O Épico 3 começa só com o estado.
