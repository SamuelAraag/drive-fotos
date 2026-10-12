# Plano: Drive Fotos

## Contexto

App para subir e ver fotos, simples como o `beba-agua`: HTML, CSS e JS puros, sem servidor,
sem build e sem dependências. O login é um token pessoal do GitHub guardado só no
navegador.

## Decisões

- **Dois repositórios.**
  - `drive-fotos`: público, só a interface. Nunca recebe imagem nem dado.
  - Repositório de dados: privado. Funciona como banco de dados, e é onde moram os blobs e
    os registros. Tudo que é privado fica nele.
- **Diferença para o `beba-agua`:** lá os dados ficam numa branch do mesmo repositório do
  app. Aqui os dados ficam em outro repositório.
- **Token:** fine-grained, com acesso só ao repositório de dados, Contents em "Read and
  write". É o token que protege as fotos: sem ele, a interface pública não lê nada.
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
fotos/<id>.<ext>         blob original
miniaturas/<id>.jpg      miniatura
registros/<id>.json      registro
```

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
  "blob": "fotos/20261012T153045-a1b2.jpg",
  "miniatura": "miniaturas/20261012T153045-a1b2.jpg"
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
  agrupada por data.
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

### Ordem de construção

1. `github.js`: token, leitura da árvore, leitura de blob e commit de vários arquivos.
2. Login e grade só de leitura, testada com fotos postas à mão no repositório de dados.
3. Zona de envio, miniatura e fila.
4. Foto aberta, com navegação.
5. Renomear, baixar e apagar.
6. Cache, estado vazio, erros e ícone de tela inicial.

## Em aberto

- Nome do repositório de dados (sugestão: `drive-fotos-dados`).
- Agrupamento da grade: por dia ou por mês.
- Data da foto: sem biblioteca, o navegador entrega a data de modificação do arquivo, que
  quase sempre é a da captura. Ler o EXIF de verdade pede um leitor escrito à mão.
- Progresso por foto: mostrar só o estado de cada item, ou barra de percentual, que exige
  `XMLHttpRequest` no lugar de `fetch`.
- Tamanho: o GitHub recomenda repositório abaixo de 1 GB e recusa arquivo acima de 100 MB.
  Com foto de 3 a 5 MB, 1 GB dá de 200 a 300 fotos. Definir o que fazer ao chegar perto.
