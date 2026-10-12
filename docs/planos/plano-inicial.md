# Plano: Drive Fotos

Revisado em 2026-10-12, depois da análise de gaps e do levantamento em `../requisitos.md`.

## Contexto

App para subir e ver fotos, simples como o `beba-agua`: HTML, CSS e JS puros, sem servidor,
sem build e sem dependências. O login é um token pessoal do GitHub guardado só no
navegador.

## Decisões

- **Dois repositórios, em duas contas do GitHub.**
  - `drive-fotos`: público, na conta principal. Só a interface, em HTML, CSS e JS. Não
    sobe servidor, não guarda imagem nem dado, só mostra o que lê do outro repositório.
    Link: https://github.com/SamuelAraag/drive-fotos
  - `drive-fotos-dados`: privado, numa conta separada, criada só para isso. Funciona como
    banco de dados, e é onde moram os blobs e os registros. Tudo que é privado fica nele.
    Link: https://github.com/samuelsantosbackupfiles/drive-fotos-dados
- **Por que uma conta separada:** se o GitHub limitar ou suspender por uso de espaço, quem
  é atingida é a conta das fotos, e não a do portfólio e dos projetos de carreira. Os
  commits de envio também saem em nome dela, e não pintam o gráfico de contribuições da
  conta principal.
- **Diferença para o `beba-agua`:** lá os dados ficam numa branch do mesmo repositório do
  app. Aqui os dados ficam em outro repositório, de outra conta.
- **Token:** fine-grained, gerado na conta separada, com acesso só ao `drive-fotos-dados`,
  Contents em "Read and write". É o token que protege as fotos: sem ele, a interface
  pública não lê nada.
- **Acesso da conta principal:** ela tem acesso de owner ao `drive-fotos-dados`. Serve para
  administrar e para a cópia de segurança por `git clone`. O app não usa esse acesso: ele
  entra só com o token da conta separada.
- **Duas branches no repositório de dados.** `main` é a base oficial, usada pelo app
  publicado. `testes` é a base de testes, usada pelo app rodando em `localhost`. O app
  escolhe pelo endereço da página e mostra "base de testes" na tela quando é o caso. Foto
  de teste nunca entra na `main`.
- **Dono e nome do repositório de dados ficam fixos no código**, como no `beba-agua`. O
  nome da conta já é público neste plano, então esconder no login não protegeria nada.
- **Cada foto é um commit no repositório de dados**, com três arquivos:
  - o blob, que é a foto de fato e o asset mais importante, guardado como o navegador
    entrega;
  - a miniatura, gerada no navegador;
  - o registro, um `.json` por foto, com `id`, `nome` e as referências básicas. O registro
    existe para servir o blob, nunca o contrário.
- **CRUD no MVP:** enviar, ver, renomear, baixar a original e apagar.
- **Só foto.** Vídeo fica fora, e cada foto tem teto de 25 MB.
- **Estrutura do app:** a mesma do `beba-agua`.

```
index.html
manifest.webmanifest
icones/
src/style.css
src/app.js       estado, regras e eventos
src/github.js    leitura e gravação via API do GitHub
src/foto.js      id, miniatura e registro de cada foto
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
  O ano da pasta é o ano do `id`.
- **`id`:** gerado no navegador, com a data da foto na frente, no horário local, e um
  sufixo aleatório, por exemplo `20261012T153045-a1b2`. Como o `id` é o nome dos três
  arquivos, a lista de caminhos do repositório já basta para ordenar e agrupar a grade por
  dia, sem abrir nenhum registro.
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

  `largura`, `altura` e `miniatura` ficam vazios quando o navegador não consegue decodificar
  a foto.

### Gravação

- **Um commit com os três arquivos:** a API de Contents grava um arquivo por commit. Para a
  foto entrar inteira ou não entrar, o envio usa a API de Git Data, que a mesma permissão
  de Contents cobre.
- **Cinco escritas por foto:** blob da original, blob da miniatura, árvore, commit e
  avanço da branch. O registro vai embutido na árvore, sem chamada própria.
- **Dois aparelhos ao mesmo tempo:** os arquivos nunca colidem, porque cada foto tem os
  seus. O que pode acontecer é a branch ter andado entre o início e o fim do envio. O
  GitHub responde 422 no avanço da branch. O app relê a ponta, refaz a árvore e o commit e
  tenta de novo, sem reenviar os blobs.
- **Repositório vazio:** a API de Git Data recusa repositório sem nenhum commit. O
  `drive-fotos-dados` precisa de um commit inicial antes do primeiro uso (Épico 0).

### Leitura

- Uma chamada à árvore do repositório lista tudo, com o tamanho de cada arquivo. O limite
  é de 100.000 entradas ou 7 MB, muito acima do que o repositório comporta em espaço.
- Imagem de repositório privado não abre por URL direta. O app baixa cada blob com o token
  e monta a imagem, com no máximo 6 downloads ao mesmo tempo.

### Limites do GitHub

Detalhe e fontes em `../requisitos.md`. O que pesa no desenho:

- **Espaço:** recomendado abaixo de 5 GB por repositório, o que dá de 1.000 a 1.600 fotos
  de 3 a 5 MB. É o teto que chega primeiro, antes das 3.000 fotos por pasta.
- **Ritmo:** 500 escritas por hora. A cinco por foto, cerca de 100 fotos por hora.
- **Apagar não devolve espaço:** a foto continua no histórico do git.

## Miniatura

Dá para gerar com JS puro, sem biblioteca: o navegador decodifica a foto
(`createImageBitmap`), desenha reduzida num `canvas` e exporta em JPEG (`canvas.toBlob`).
Por isso a miniatura entra no MVP.

- Lado menor de 400 px, com teto de 1.600 px no lado maior, JPEG com qualidade 0,8. O lado
  menor manda porque a grade corta a miniatura em quadrado, e em tela de alta densidade o
  quadro chega a quase 400 px.
- A grade carrega só miniaturas. A original só é baixada ao abrir a foto.
- A redução é pedida já na decodificação, para foto de muitos megapixels não estourar a
  memória do celular, e respeitando a orientação gravada na foto.
- **Limite:** o navegador só gera miniatura do formato que ele sabe decodificar. HEIC do
  iPhone abre no Safari, mas não no Chrome. Quando a decodificação falha, a foto sobe sem
  miniatura e a grade mostra um quadro neutro. O iPhone costuma converter para JPEG ao
  escolher pela galeria, então o caso é raro.

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
- **Zona durante o envio:** mostra o nome da foto que está subindo, "Enviando 2 de 5", o
  percentual e uma barra. O percentual é real: os arquivos sobem por `XMLHttpRequest`, que
  informa quanto já foi enviado, coisa que o `fetch` não faz. Antes do primeiro byte
  ("Preparando...") e depois do último ("Concluindo..."), uma varredura de luz substitui o
  número. No arraste, um véu nasce da zona e cobre a tela, como no `cloud-files`.
- **Fila de envio:** uma foto por vez, em sequência. Não há histórico na tela: o que subiu
  aparece direto na grade.
- **Chegada da foto na grade:** depende de onde ela cai.
  - Na tela: a foto sai da zona de envio e desce em pêndulo até o lugar dela, enquanto as
    vizinhas deslizam para abrir espaço.
  - Fora da tela (foto antiga, ou grade rolada): entra em silêncio e um atalho aparece
    embaixo, com a miniatura e "Ver foto". Com várias, "3 fotos enviadas" e "Ver a última".
  - Ao pousar ou ao chegar pelo atalho, a foto fica em destaque, com contorno, selo
    "Enviada agora" e um halo. Na última foto da leva e no atalho, as vizinhas esmaecem por
    um instante e o foco do teclado vai para ela.
  - A página nunca rola sozinha, e a fila não espera a animação.
- **Falhas:** só as fotos que não subiram ficam listadas, cada uma com o motivo e um
  "tentar de novo", sem refazer a seleção.
- **Recusas na entrada:** arquivo vazio, pasta, o que não for imagem e foto acima de 25 MB
  ficam de fora, com aviso.
- **Limite de ritmo:** quando o GitHub responde que o limite estourou, a fila pausa, mostra
  quando volta e retoma sozinha. Não vira erro de item.
- **A fila vive na memória da página.** No celular, bloquear a tela ou trocar de app pode
  interromper o envio. O app pede para manter a tela acordada enquanto a fila corre e
  confirma antes de sair com envio em andamento.
- **Fica de fora do `cloud-files`:** trial, barra de espaço livre e backend. Aqui o envio é
  o commit direto no repositório de dados.

## Visualização

No molde do Google Fotos.

- **Grade:** a tela inicial é a grade de miniaturas, da mais recente para a mais antiga,
  agrupada por dia, com um título por dia. Miniaturas quadradas, cortadas ao centro.
- **Data da foto:** a data de modificação do arquivo, que o navegador entrega sem
  biblioteca. Sem ela, vale a data do envio. Ver "Em aberto" sobre o iPhone.
- **Abrir:** um toque ou clique abre a foto em tela cheia. Fecha no "Fechar", no Esc ou no
  voltar do navegador, e o foco volta para a foto na grade. A miniatura aparece desfocada
  como prévia até a original baixar. As últimas oito originais ficam na memória, para ir
  e voltar entre vizinhas sem baixar de novo.
- **Navegar:** com a foto aberta, deslizar no celular ou usar as setas no teclado passa
  para a anterior e a próxima.
- **Ações na foto aberta:** renomear, baixar a original e apagar. O nome aparece aqui, lido
  do registro.

## MVP

### Telas

1. **Login:** campo para colar o token. O app valida lendo o repositório de dados e guarda
   o token só no navegador. "Sair" apaga o token e o cache de fotos.
2. **Grade:** tela inicial, com a zona de envio no topo. Estado vazio convida a enviar a
   primeira foto.
3. **Foto aberta:** tela cheia por cima da grade, com fechar, anterior, próxima e as três
   ações.

### Fluxo de envio

1. A pessoa escolhe ou solta as fotos. O app descarta o que não entra e monta a fila.
2. Para cada foto, em sequência: gera o `id`, gera a miniatura, monta o registro e faz o
   commit dos três arquivos.
3. A foto entra na grade assim que o commit dela termina, sem esperar o resto da fila.
4. Falha em uma foto não para a fila. O item fica com erro e "tentar de novo".

### Fluxo de leitura

1. Ao abrir, o app lê a árvore do repositório de dados e monta a grade.
2. As miniaturas entram conforme aparecem na tela, não todas de uma vez.
3. Miniaturas baixadas ficam em cache no navegador, pela identidade do blob, que nunca
   muda. Originais também, com um teto de espaço, e as mais antigas saem primeiro.

### Renomear, baixar e apagar

- **Renomear:** edita o `nome` no registro e faz um commit só desse arquivo.
- **Baixar:** baixa o blob original com o `nome` do registro. No celular usa o compartilhar
  do sistema, que permite salvar direto na galeria.
- **Apagar:** pede confirmação e faz um commit que remove os três arquivos. A foto some do
  app, mas continua no histórico do git, e o repositório não diminui.

### Erros tratados

Os tipos do `beba-agua` (token inválido, sem permissão, repositório ausente, conflito, rede
e servidor) e mais dois: limite de ritmo e repositório vazio. Cada um com mensagem própria.
O `beba-agua` trata 403 como falta de permissão. Aqui o 403 e o 429 com aviso de limite são
separados, porque pedem espera, não um token novo.

### Fora do MVP

Álbuns, busca, compartilhar com outras pessoas, vídeo, edição de imagem, seleção múltipla e
uso sem internet.

## Cópia de segurança

O repositório de dados é a única cópia das fotos, e o GitHub pode limitar ou apagar um
repositório, com aviso. Um `git clone` do `drive-fotos-dados` traz todas as fotos como
arquivos comuns. Fazer o primeiro clone num disco fora do GitHub e atualizar de tempos em
tempos com `git pull`.

## Épicos

Separados por funcionalidade, na ordem de construção. Cada um termina com algo que dá para
testar na tela.

### Épico 0: Preparo

- `drive-fotos` criado na conta principal. Feito.
- `drive-fotos-dados` criado na conta separada. Feito.
- Token fine-grained gerado na conta separada. Feito.
- Commit inicial no `drive-fotos-dados`, com um README. Feito.
- Publicar a interface pelo GitHub Pages.
- **Pronto quando:** a página abre pelo endereço público e o token lê o repositório de
  dados.

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
- Carregamento das miniaturas conforme aparecem na tela, seis por vez.
- Estado vazio, estado de carregamento e quadro neutro para foto sem miniatura.
- **Pronto quando:** fotos postas à mão no repositório de dados aparecem na grade, no dia
  certo.

### Épico 3: Envio

- Zona de envio: toque, clique, teclado e seletor de arquivos.
- Arrastar e soltar na janela inteira, com o véu.
- Recusa de arquivo vazio, pasta, não imagem e foto acima de 25 MB.
- Geração do `id`, da miniatura e do registro.
- Commit dos três arquivos pela API de Git Data, com nova tentativa quando a branch andou.
- Fila com estado por item, "Enviando 2 de 5" e "tentar de novo".
- Pausa e retomada no limite de ritmo.
- Tela acordada e confirmação antes de sair com a fila correndo.
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
- Baixar a original com o `nome` do registro, pelo compartilhar do sistema no celular.
- Apagar, com confirmação e commit que remove os três arquivos.
- **Pronto quando:** as três ações funcionam na foto aberta e a grade reflete o resultado
  sem recarregar a página.

### Épico 6: Cache e tamanho

- Cache de miniaturas e originais no navegador, pela identidade do blob, com teto para as
  originais.
- "Sair" limpa o cache.
- Releitura da árvore ao voltar para a tela, para aparecer o que subiu ou foi apagado em
  outro aparelho.
- Espaço usado na tela, somado dos tamanhos que a árvore já traz. Aviso a partir de 1 GB e
  outro, mais forte, em 4 GB. Só avisa, não bloqueia.
- **Pronto quando:** reabrir o app não baixa de novo o que já foi visto, e o espaço usado
  aparece.

## Linha do tempo

Durações estimadas, em dias de trabalho focado. Uma branch por etapa.

| Ordem | Épico | Duração | Depende de |
| --- | --- | --- | --- |
| 0 | Preparo | 0,5 dia | Nada |
| 1 | Fundação e login | 0,5 dia | 0 |
| 2 | Grade | 1 dia | 1 |
| 3 | Envio | 2 dias | 2 |
| 4 | Foto aberta | 1 dia | 2 |
| 5 | Renomear, baixar e apagar | 0,5 dia | 4 |
| 6 | Cache e tamanho | 1 dia | 3 e 4 |

- **Dia 1:** Épicos 0 e 1, juntos, na branch `fundacao-e-login`. Dá para entrar com o
  token.
- **Dia 2:** Épico 2. Fotos postas à mão aparecem na grade.
- **Dias 3 e 4:** Épico 3. Envio pelo celular e pela web. É o épico de maior risco.
- **Dia 5:** Épico 4. Abrir e percorrer as fotos.
- **Dia 6:** Épico 5 e metade do 6.
- **Dia 7:** fim do Épico 6 e ajustes.

A partir do dia 4 o app já é usável: entrar, enviar e ver.

## Em aberto

- **Álbum curado ou backup da câmera.** Com 1.000 a 1.600 fotos por repositório, o desenho
  atual serve para álbum. Para backup, seria preciso abrir um repositório de dados novo
  quando o atual encher, e o app teria que ler vários.
- **Data da foto no iPhone.** O Safari do iOS costuma entregar a hora da seleção, não a da
  captura, e aí toda foto cairia no dia do envio. Testar com uma foto antiga antes do
  Épico 3. Se confirmar, a saída é ler só a data do EXIF, com um leitor pequeno escrito à
  mão.
- **Original no iPhone.** Com `accept="image/*"`, o iOS converte HEIC para JPEG antes de
  entregar. O que sobe é a cópia convertida, e Live Photo perde o movimento. Aceitar, ou
  pedir HEIC e perder a visualização no Chrome.
- **Origem do app.** Servido pelo GitHub Pages da conta principal, ele divide o
  armazenamento do navegador com os outros sites dela, que conseguiriam ler o token e o
  cache. A saída é um domínio próprio ou publicar a interface pelo Pages da conta separada.
- **Um commit por foto ou por lote.** Um por foto dá cerca de 100 por hora. Agrupar várias
  num commit sobe para perto de 240, mas a foto deixa de entrar na grade uma a uma. Medir
  o limite real no Épico 3 antes de decidir.
- **Foto repetida.** A árvore já traz a identidade de cada blob, então dá para detectar a
  mesma foto antes de enviar de novo. Entra no Épico 3 ou fica para depois.
