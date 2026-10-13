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
- **Cada foto são três arquivos no repositório de dados**, gravados por commit, em lotes de até dez fotos:
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
src/indice.js    índice das fotos por ano
src/armazem.js   o que fica guardado no aparelho
src/ui.js        telas
```

## Repositório de dados

```
fotos/AAAA/<id>.<ext>         blob original
miniaturas/AAAA/<id>.jpg      miniatura
registros/AAAA/<id>.json      registro
indices/AAAA.json             índice das fotos de cada ano: nome e origem da data
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
- **Duas escritas por foto e três por lote.** Por foto sobem o blob da original e o da
  miniatura, os dois ao mesmo tempo. Árvore, commit e avanço da branch saem uma vez por
  lote de até dez fotos. O registro vai embutido na árvore, sem chamada própria.
- **A ponta da branch não é relida a cada gravação.** O app guarda a que ele mesmo deixou
  no último commit, e só lê de novo quando o GitHub recusa o avanço.
- **Medida de 2026-10-12,** com quatro fotos de 1,2 MB na base de testes, uma rodada de
  cada: 19,9 s com um commit por foto (5,0 s por foto) e 8,5 s em lote (2,1 s por foto).
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
- **Ritmo:** 500 escritas por hora. Com duas por foto e três por lote de dez, cerca de 215
  fotos por hora.
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
- **Recusas na entrada:** arquivo vazio, pasta, o que não for imagem, imagem em formato que
  nem todo navegador mostra (HEIC, TIFF, RAW) e foto acima de 25 MB ficam de fora, com aviso.
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
- **Data da foto:** a da captura, lida do EXIF ou, sem ele, do nome do arquivo. Sem
  nenhuma das duas, o app pergunta. Ver o Épico 8.
- **Abrir:** um toque ou clique abre a foto em tela cheia, no modo ambiente. A própria
  miniatura cresce do quadro da grade até o tamanho final, e a miniatura desfocada cobre o
  fundo. A original entra por cima da prévia quando termina de baixar. Fecha no "Fechar",
  no Esc, clicando fora da foto ou no voltar do navegador, e a foto volta para o quadro.
- **Painel de informações:** só em tela larga, ao lado da foto, com nome, dimensões,
  proporção, megapixels, tamanho, data, paleta dominante e luminância média. O botão
  "Informações" e a tecla `i` mostram e escondem, e a escolha fica guardada no aparelho. O
  nome vem do registro da foto; a paleta e a luminância são calculadas da miniatura, no
  navegador. No celular não há painel: a foto fica com a tela toda.
- **Fora do modo ambiente:** inclinação 3D, histograma e faixa de miniaturas.
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
2. Para cada foto, em sequência: gera o `id`, gera a miniatura, monta o registro e sobe a
   original e a miniatura. A cada dez fotos, ou quando a fila acaba, um commit guarda o
   lote.
3. As fotos entram na grade quando o commit do lote termina: de dez em dez numa leva
   grande, e todas juntas numa leva pequena.
4. Falha em uma foto não para a fila. O item fica com erro e "tentar de novo".

### Fluxo de leitura

A regra é usar ao máximo o que já está no aparelho, para o app parecer imediato.

1. Ao abrir, o app mostra na hora a lista de fotos guardada no aparelho e confere com o
   GitHub por trás. Só redesenha a grade se algo mudou.
2. As miniaturas entram conforme aparecem na tela, não todas de uma vez, seis por vez. A
   que saiu de perto da tela antes de começar a baixar deixa a fila, e volta se reaparecer:
   rolando depressa por milhares de fotos, só baixa o que a pessoa está vendo. A grade
   mantém até 1.000 miniaturas carregadas e o aparelho guarda até 2.000 (Épico 27).
3. A original só é baixada quando a foto é aberta. Até 2026-10-12 toda foto que ficava na
   tela por mais de 0,6 s tinha a original baixada em segundo plano. Com 4.312 fotos isso
   encheu o teto de 1 GB do aparelho com 831 originais, disputou a rede com as miniaturas e
   travou a tela, e saiu na versão 1.10.1.
4. Com a foto aberta, a anterior e a próxima ficam prontas na memória, para a seta passar
   sem espera.
5. Limites: as originais guardadas no aparelho têm teto de 1 GB, e as menos usadas saem
   primeiro. Na memória da aba o teto é de 150 MB. Os dois são em bytes, não em número de
   fotos, porque uma foto pode ter 300 KB ou 25 MB.
6. O que acabou de ser enviado já fica guardado, sem baixar de volta.
7. "Sair" apaga tudo que está guardado.

O arquivo é identificado pelo conteúdo (o `sha` do git), então o que está guardado nunca
fica desatualizado.

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
uso sem internet. A seleção múltipla para apagar entrou depois, no Épico 12.

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
- Publicar a interface pelo GitHub Pages. Feito.
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

- Cache de miniaturas e originais no navegador. Feito no Épico 4.
- "Sair" limpa o cache. Feito no Épico 4.
- Releitura da árvore ao voltar para a tela, para aparecer o que subiu ou foi apagado em
  outro aparelho.
- Espaço usado na tela, somado dos tamanhos que a árvore já traz. Aviso só quando passa de
  4 GB. Só avisa, não bloqueia.
- **Pronto quando:** reabrir o app não baixa de novo o que já foi visto, e o espaço usado
  aparece.

### Épico 7: Fotos duplicadas

Pedido em 2026-10-12. Decisões fechadas no mesmo dia, depois da análise de gaps.

- **Como reconhecer a repetida:** de dois jeitos.
  - **Pelo conteúdo:** o app calcula no navegador a identidade do arquivo (o mesmo `sha`
    que o git usa) e compara com a lista de fotos, que já traz esse valor. As duas são
    idênticas, byte a byte. Não custa nenhuma chamada ao GitHub.
  - **Pelo nome:** o nome é o de uma foto guardada, mas o conteúdo é outro. O nome mora no
    registro de cada foto, então o app lê os registros em segundo plano depois de abrir, e
    eles ficam guardados no aparelho. Na primeira vez custa uma chamada por foto.
  - Conta também a foto que ainda está na fila e o mesmo arquivo escolhido duas vezes na
    leva.
- **Um diálogo por leva.** A leva inteira é conferida na entrada. As fotos novas sobem
  direto, sem esperar. As repetidas ficam de fora e aparecem num diálogo só, como "3 das 12
  fotos já estão guardadas".
- **Lado a lado.** A foto que já existe fica à esquerda, um pouco apagada, e a nova à
  direita, em destaque, as duas com o tamanho do arquivo no canto inferior direito. Com
  várias, cada par diz por que entrou: "Conteúdo idêntico" ou "Mesmo nome, conteúdo
  diferente".
- **Escolha por foto.** Com uma repetida só, dois botões: "Não enviar" e "Manter as duas".
  Com várias, cada par tem a própria caixa "Manter as duas", nenhuma vem marcada, e o botão
  principal diz o resultado ("Não enviar nenhuma", "Manter 2 de 3", "Manter todas"). "Marcar
  todas" resolve a leva de uma vez.
  - **Não enviar:** nada é gravado, e fica a que já existe. Fechar o diálogo com Esc ou
    clicando fora dá no mesmo. Um atalho embaixo leva até a foto guardada.
  - **Manter as duas:** a cópia sobe com outro nome, "praia (2).jpg", ou o próximo número
    livre entre os nomes em uso. Quando o conteúdo é idêntico, o arquivo não é enviado de
    novo: a cópia aponta para o que o repositório já tem, sobe na hora e não ocupa espaço
    novo. Quando só o nome é igual, a nova sobe inteira.
- **Antes de perguntar, o app relê o repositório.** Se a foto guardada foi apagada em outro
  aparelho, a nova deixa de ser repetida e sobe normalmente. Custa uma leitura por leva com
  repetida.
- **Apagar uma das cópias** não tira do aparelho o arquivo que a outra ainda usa.
- **Limites conhecidos:**
  - A mesma foto recodificada não bate pelo conteúdo. O iPhone converte HEIC para JPEG a
    cada seleção, então a foto reenviada por ele só é pega se o nome for o mesmo.
  - Com muitos registros ainda por ler (mais de 80), o envio não espera: compara com os
    nomes já lidos, e um nome repetido pode passar até a leitura terminar.
  - A conta do `sha` só existe em `https` e em `localhost`. Fora disso sobra a comparação
    pelo nome.
- **Pronto quando:** enviar duas vezes a mesma foto abre o diálogo; "Não enviar", Esc e
  clique fora não criam nada; "Manter as duas" deixa as duas na grade com nomes diferentes;
  e numa leva com novas e repetidas, as novas sobem sem esperar a resposta.

### Épico 8: Data da foto separada da data de envio

Pedido em 2026-10-12. Decisões fechadas no mesmo dia, depois da análise de gaps.

- **O problema:** a data da foto era a data de modificação do arquivo. Uma imagem de 2015
  enviada hoje chegava com a data de hoje (arquivo baixado, copiado, vindo de um app de
  mensagens, ou escolhido no iPhone). Aí ela caía no dia do envio, e o `id` e a pasta do
  ano saíam errados.
- **A data da foto é a da captura.** A ordem é:
  1. O `DateTimeOriginal` do EXIF, lido por um leitor pequeno escrito à mão, sem
     biblioteca. Só de JPEG.
  2. A data no nome do arquivo, no formato ano, mês e dia, como em
     `IMG-20150312-WA0001.jpg` e `Screenshot_2015-03-12-10-15-30.png`.
  3. Sem nenhuma das duas, o app pergunta.
- **A pergunta:** um diálogo por leva, só com as fotos sem data. Cada uma tem um campo de
  dia, que já vem com hoje, então abrir e confirmar envia com a data atual. As fotos que
  têm data sobem direto, sem esperar. Fechar o diálogo não envia essas fotos.
- **A data de modificação do arquivo não vale mais sozinha.** Aparece no diálogo como
  atalho ("Usar a do arquivo: 12 de março de 2015"), e só quando não é de hoje.
- **A data de envio fica só em `enviada_em`.** Ela nunca decide onde a foto mora nem em que
  dia aparece.
- **O `id` e a pasta do ano saem da data da foto.** A imagem de 2015 enviada hoje é gravada
  em `fotos/2015/` e aparece na grade em 2015.
- **Registro:** ganha `origem_da_data`, com `exif`, `nome`, `informada` ou `envio`.
- **Painel de informações:** mostra "Tirada em", com a origem quando a data não veio da
  câmera, e "Enviada em".
- **Detalhes:**
  - Data antes de 1990 ou no futuro é ignorada, e vale o próximo recurso.
  - Quando só se sabe o dia, a hora é meio-dia.
  - A hora do EXIF é tratada como local, como o `id` já faz.
  - Nome no formato dia, mês e ano não é reconhecido, porque se confunde com mês, dia e
    ano.
- **Datar depois.** Quem está com pressa confirma o diálogo sem mexer nos campos ("Enviar
  agora, datar depois"). A foto sobe com a data do envio e fica marcada com
  `origem_da_data: envio`.
- **Tela "Fotos sem data", no endereço `#sem-data`.** Junta todas as fotos marcadas assim.
  A grade mostra um aviso com a contagem e o link quando existe alguma.
  - Um bloco por dia de envio, porque fotos enviadas juntas costumam ser da mesma ocasião.
    O campo "Mesmo dia para todas" preenche o bloco inteiro.
  - Cada foto tem o próprio campo de dia e um "Está certa", para a que é mesmo do dia em
    que subiu.
  - "Salvar datas" grava o bloco num commit só. Acertar a data muda o `id`, então os três
    arquivos trocam de caminho, sem nenhum ser enviado de novo.
- **Fora do épico:** corrigir a data das fotos guardadas antes dele, que não têm a origem
  no registro. Decisão de 2026-10-12: elas são ajustadas ou reenviadas à mão.
- **Limite:** print e imagem de mensagem sem data no nome sempre caem na pergunta.
- **Pronto quando:** uma imagem de 2015 enviada hoje aparece em 2015 na grade, fica em
  `fotos/2015/`, e o registro traz a `data` de 2015 e o `enviada_em` de hoje; uma imagem
  sem data nenhuma abre a pergunta e sobe com hoje em um clique; e essa imagem aparece em
  "Fotos sem data", de onde vai para o dia certo ao salvar.

### Épico 9: Botão de atualizar

Pedido em 2026-10-12 e feito no mesmo dia.

- **Botão "Atualizar" no topo, igual ao do `beba-agua`:** ao lado de "Sair". Enquanto lê,
  vira "Atualizando..." e fica desabilitado.
- **Relê o repositório na hora.** A releitura automática do Épico 6 só roda ao voltar para
  a aba e no máximo a cada 30 segundos. O botão não tem intervalo. A grade só é redesenhada
  se algo mudou.
- **Diz quando terminou.** Ao lado do botão aparece "Atualizado às 14:02". Em tela estreita
  o texto não cabe e fica só para o leitor de tela.
- **Avisa quando falha.** A releitura automática é silenciosa. A pedida pela pessoa mostra
  "Não deu para atualizar", com o motivo e um "Tentar de novo". Token vencido abre o login.
- **No meio de um envio,** espera a fila terminar antes de ler. Com a fila pausada pelo
  limite do GitHub, não espera.
- **Puxar para atualizar,** com o mesmo efeito do `beba-agua`: no topo da página, arrastar
  para baixo faz o conteúdo descer junto com o dedo e um anel encher. Soltar com o anel
  cheio atualiza, e o anel gira até terminar. Só vale com a página no topo e sem diálogo
  aberto.

### Épico 10: Link de download para enviar a alguém

Pedido em 2026-10-12 e feito no mesmo dia, na branch `link-de-download`.

- **O pedido:** gerar um link de uma foto para mandar a outra pessoa. Quem recebe clica e o
  download começa, sem conta no GitHub. O link pode ser temporário: se vencer, gera-se outro.
- **De onde vem o link.** O repositório de dados é privado, então o endereço comum do
  arquivo só abre para quem tem acesso. A API do GitHub devolve, para cada arquivo, um
  endereço temporário em `raw.githubusercontent.com`, com uma chave de vida curta, que
  abre sem login. O app pede esse endereço com o token que já tem (`linkTemporario`, em
  `src/github.js`).
- **Por que o endereço sozinho não basta.** Aberto direto, ele mostra a imagem no navegador
  em vez de baixar, e o arquivo sai com o nome do `id`, não com o nome da foto. O GitHub não
  manda o cabeçalho que força o download.
- **A página de download.** O link enviado aponta para uma página do próprio app
  (`baixar.html`), que recebe o endereço temporário e o nome da foto, baixa o arquivo e
  dispara o download com o nome certo. Não pede login.
  - Quando o navegador segura o download automático (acontece em navegador embutido de
    aplicativo de mensagem), a página mostra a foto e um botão "Baixar".
  - Link vencido: a página diz que venceu e pede um novo a quem enviou.
- **Na foto aberta:** o botão "Copiar link", ao lado de "Baixar", manda o link direto para a
  área de transferência, sem diálogo. Enquanto gera, o botão diz "Copiando..."; depois,
  "Link copiado" por um instante. A cópia é pedida no próprio toque, com o link ainda por
  chegar, porque o Safari só deixa copiar assim.
- **Quem recebe não precisa do app nem de token.** A página de download é aberta a qualquer
  um e só aceita endereço do repositório de fotos, para não virar um baixador de link
  alheio.
- **Verificado em 2026-10-12, na base de testes:**
  - o app conseguiu o endereço temporário de um arquivo de 3,9 MB em 0,4 s;
  - o endereço baixou o arquivo inteiro sem login e a partir de outro site, que é o que a
    página de download precisa;
  - sem a chave, o mesmo endereço responde 404.
- **Em aberto:**
  - Quanto tempo o endereço vale. Numa medida de 2026-10-12 ele ainda valia 4 minutos
    depois de gerado; o momento em que vence não foi alcançado.
  - O link gerado no `localhost` aponta para a página de download do `localhost`. Para
    mandar a outra pessoa, ele precisa ser gerado no site publicado.
  - A chave fica visível no link. Quem tiver o link baixa aquela foto enquanto ele valer,
    e nenhuma outra.
- **Pronto quando:** copiar o link de uma foto, abrir numa janela anônima e o arquivo
  baixar com o nome da foto; e um link vencido mostrar a mensagem certa.

### Épico 11: Novidades (changelog)

Pedido em 2026-10-12 e feito no mesmo dia, no molde do changelog do `pr-manager`.

- **Página "Novidades" (`novidades.html`):** uma versão por bloco, da mais nova para a mais
  antiga, com o número, a data e a hora, um título e as mudanças em frases curtas. Abre sem
  token, como a página de download.
- **Rodapé do site:** mostra "Drive Fotos · versão X" e o botão "Novidades".
- **Dados num arquivo só:** `src/novidades.dados.js`. A versão do app é a da primeira
  entrada da lista.
- **Histórico retroativo:** as onze entregas de 2026-10-12 entraram com a hora real em que
  cada uma foi para a `main`.
- **Numeração:** `0.x` enquanto o MVP estava em construção, `1.0.0` quando os Épicos 1 a 6
  fecharam, e o número do meio sobe a cada funcionalidade nova. Correção sem funcionalidade
  sobe o último número.
- **Rotina:** todo PR de funcionalidade acrescenta a entrada dele no topo de
  `src/novidades.dados.js`. O texto é para quem usa o app, sem jargão de código.
- **Texto revisado antes do commit.** Decisão de 2026-10-12: toda entrada nova passa pelo
  humanizer. Cada frase diz um fato a quem usa o app; não entra travessão, adjetivo de
  venda, trio forçado nem frase que só repete o título. Número só quando foi medido.
- **O changelog é público.** O site abre para qualquer pessoa, então as entradas descrevem
  só o app, nunca as fotos nem o repositório de dados.

### Épico 12: Selecionar várias fotos para apagar

Implementado em 2026-10-12. Seleção por toque ou pressão longa no celular, por dia,
confirmação com contagem e remoção atômica em um único commit.

- **Entrar no modo de seleção:** botão "Selecionar" no topo da grade. No celular, segurar o
  dedo numa foto também entra, já com ela marcada.
- **No modo de seleção,** tocar numa foto marca e desmarca, em vez de abrir. Cada quadro
  mostra a marca, e a foto marcada fica com contorno.
- **O dia inteiro de uma vez:** o título de cada dia ganha uma caixa que marca e desmarca
  todas as fotos dele.
- **Barra de seleção,** fixa embaixo: "3 fotos selecionadas", "Apagar" e "Cancelar". O Esc e
  o voltar do navegador saem do modo sem apagar nada.
- **Confirmação com a contagem:** "Apagar 3 fotos?", com o mesmo aviso do apagar de hoje. O
  botão repete o número.
- **Um commit só para a seleção inteira.** A gravação já aceita vários arquivos por commit,
  então as fotos saem todas ou nenhuma. Não há foto apagada pela metade.
- **Depois de apagar,** as fotos somem da grade sem recarregar, o modo de seleção fecha e o
  espaço usado é refeito.
- **Cópias do Épico 7:** apagar uma das cópias não tira do aparelho o arquivo que a outra
  ainda usa, como no apagar de uma foto só.
- **Falha:** nada some da grade, a seleção continua marcada e a mensagem oferece "Tentar de
  novo".
- **Zona de envio e puxar para atualizar** ficam desligados enquanto o modo está aberto.
- **Fora do épico:** baixar, mover ou copiar o link de várias fotos. A seleção nasce só
  para apagar.
- **Em aberto:**
  - Teto de fotos por vez. Um commit grande demora mais e uma falha atinge a seleção
    inteira. Medir com 50 e com 200 na base de testes antes de fixar.
  - "Selecionar tudo". Apagar o acervo inteiro com dois toques é um risco que pede uma
    confirmação mais forte, ou fica de fora.
- **Pronto quando:** marcar cinco fotos de dois dias diferentes, apagar e as cinco sumirem
  com um commit só no repositório de dados; cancelar não apagar nenhuma; e tocar numa foto
  fora do modo de seleção continuar abrindo a foto.

### Épico 13: Análise de gaps

Pedido em 2026-10-12. As análises anteriores foram a do plano inicial e as dos Épicos 7 e
8, cada uma só do seu pedaço. Esta olha o app inteiro, como ele está depois do Épico 12.

**Feito.** A análise rodou em 2026-10-12, sobre a versão 1.8.0, e foi refeita no dia
seguinte com o acervo grande. O que ela achou virou trabalho: os Épicos 19, 20, 21, 24 e 27
saíram dela, e o que sobrou está repartido entre os Épicos 16 e 28 e a nota do Épico 14. A lista escrita dos
gaps ficou na branch `epico-13-analise-de-gaps`, que não foi mesclada e está atrás da
`main`: o `../requisitos.md` da base principal não tem essa lista nem os requisitos dos
épicos novos.

- **O que é comparado:** este plano, `../requisitos.md` e o código. De um lado o que está
  escrito, do outro o que o app faz de fato.
- **Três tipos de gap:**
  - prometido no plano e não feito, ou feito de outro jeito;
  - feito no código e não escrito em lugar nenhum;
  - caso que ninguém pensou: erro sem mensagem, tela sem estado vazio, ação sem teclado,
    dois aparelhos ao mesmo tempo.
- **Itens "Em aberto" de cada épico** são revistos um a um: fechado, ainda aberto ou caiu.
- **As quatro decisões pendentes de `../requisitos.md`** são fechadas ou ganham data.
- **Requisitos em dia:** os Épicos 7 a 12 ainda não estão na tabela de requisitos. Entram
  nesta rodada, com a origem.
- **Saída:** a lista de gaps em `../requisitos.md`, cada um com a decisão: corrigir agora,
  virar épico ou aceitar como limite. Este épico não muda código.
- **Pronto quando:** todo gap achado tem uma decisão escrita, e os que viram trabalho
  estão na lista de pendências.

### Épico 14: Revisão de todos os arquivos

Pedido em 2026-10-12. Em 2026-10-12 a base principal tem 9 arquivos de código, com 5.889
linhas: `index.html`, `baixar.html`, `src/style.css` e seis arquivos em `src/`. Os dois
maiores são `src/ui.js` e `src/app.js`.

**Retirado da lista em 2026-10-13,** por decisão, sem ter sido feito. O que a análise de gaps
tinha mandado para cá fica sem épico: a miniatura que decodifica a foto inteira (G01), a
fila, o login e o nome livre duplicados na tela de backup (G06) e as leituras da API sem
tempo máximo (G20).

- **Um arquivo por vez, do começo ao fim.** Os de código, o `manifest.webmanifest`, o
  `README.md` e os dois documentos em `docs/`.
- **O que se procura:**
  - código morto: função, classe de CSS, `id` ou texto que nada mais usa;
  - a mesma coisa feita em dois lugares;
  - nome que não diz o que a coisa é;
  - erro que cai em silêncio ou em mensagem genérica;
  - elemento sem rótulo, sem foco visível ou sem caminho pelo teclado;
  - texto de tela fora do padrão dos outros.
- **Sem mudar comportamento.** O que a revisão achar de errado no comportamento vira item
  da lista de pendências, não entra escondido.
- **Entra com os gaps do Épico 13 decididos,** para não revisar código que vai mudar.
- **Um commit por arquivo,** para o PR poder ser lido por partes.
- **Pronto quando:** todos os arquivos foram lidos, cada achado foi corrigido ou anotado, e
  o roteiro de teste (entrar, enviar, abrir, renomear, baixar, apagar, copiar link e
  atualizar) passa no celular e no computador.

### Épico 15: Remoção dos comentários

Pedido em 2026-10-12 e feito no mesmo dia, antes do Épico 14, a pedido. Saíram 577
comentários: 502 nos arquivos de `src/*.js`, 74 em `src/style.css` e 1 em `index.html`. A
regra passou a valer para o código novo e está em `.agents/preferencias.md`.

- **Como foi feito:** um script separa texto, modelo de texto e expressão regular de
  comentário, tira só o comentário e confere que o resto do arquivo ficou igual, caractere a
  caractere fora os espaços. Depois, as quatro páginas foram abertas na base de testes:
  grade, foto aberta, "Fotos sem data" e conferência do backup, sem erro.
- **O porquê de cada decisão** ficou neste plano e no histórico do git: o commit da remoção
  mostra todos os comentários que saíram. O Épico 16 tira dali o que ainda importa a quem
  usa.

- **Sai tudo:** `//` e `/* */` no JS, `/* */` no CSS e `<!-- -->` no HTML.
- **O porquê não se perde.** Alguns comentários guardam uma razão que o código não mostra,
  como a cópia do link pedida no próprio toque por causa do Safari. Antes de apagar, essa
  razão vai para o nome da função ou para a documentação do Épico 16.
- **Depois do Épico 14,** porque a revisão mexe nos mesmos arquivos.
- **Sem mudar nenhuma linha de código.** O PR só remove comentário.
- **Em aberto:** a entrada de cada épico neste plano já explica as decisões. Conferir se
  cobre o que os comentários diziam, ou se falta uma página técnica em `docs/`.
- **Pronto quando:** a busca por `//`, `/*` e `<!--` nos arquivos de código não acha
  comentário, e o roteiro de teste do Épico 14 passa igual.

### Épico 16: Documentação das usabilidades

Pedido em 2026-10-12.

- **Um documento, `docs/usabilidades.md`,** com tudo o que dá para fazer no app, do ponto de
  vista de quem usa. O `README.md` aponta para ele.
- **Uma seção por funcionalidade:** entrar e sair, enviar, fotos repetidas, data da foto e
  fotos sem data, grade, foto aberta e painel de informações, renomear, baixar, apagar uma
  e várias, copiar link, atualizar, espaço usado e novidades.
- **Cada seção diz:** o que faz, como se faz no celular e no computador, os atalhos de
  teclado, o que acontece quando dá errado e os limites conhecidos.
- **Tabela de atalhos e gestos** no fim, num lugar só: Esc, setas, `i`, deslizar, puxar
  para atualizar, arrastar e soltar, segurar o dedo.
- **Escrita a partir do app rodando,** não do plano. O que o documento descrever e o app
  não fizer vira gap.
- **Recebe o que saiu dos comentários** no Épico 15 e ainda importa a quem usa.
- **Em aberto:** se o documento também vira uma página de ajuda dentro do app, como as
  novidades.
- **Pronto quando:** cada botão, gesto e atalho do app aparece no documento, e alguém que
  nunca usou consegue enviar, achar e apagar uma foto só com ele.

### Épico 17: Migração do acervo

Pedido em 2026-10-12: trazer para o Drive Fotos tudo o que existe até hoje.

**Em andamento.** A ferramenta está pronta e o envio do acervo segue em partes. Conferido em
2026-10-13, comparando o conteúdo de cada arquivo do HD com a base oficial, que tinha 4.339
fotos e 6,02 GB:

- **Parte 2 da pasta:** enviada. 3.308 dos 3.313 arquivos estão na base. Faltam 2, e 3
  passam de 25 MB.
- **Parte 1 da pasta:** 499 dos 5.925 arquivos estão na base. Faltam 5.426, com 3,38 GB.
  Com eles a base vai a cerca de 9.765 fotos e 9,4 GB.
- **Fora da migração:** 1.888 HEIC e 2.885 arquivos que não são imagem (vídeos, RAW e PDF),
  separados em pastas próprias no HD.

**Implementação inicial:** a página dedicada `backup.html` aceita uma pasta ou uma seleção de
arquivos, confere nomes e hashes antes do envio, estima o espaço, deixa pausar/retomar/cancelar
e gera um CSV com o resultado. Após recarregar, é preciso escolher a mesma pasta novamente; a
conferência ignora as fotos já confirmadas com o mesmo nome e conteúdo. Ainda faltam o ensaio
com cem fotos e a validação da permissão persistente da pasta nos navegadores alvo.

- **Tela "Backup" no computador.** A pessoa escolhe uma pasta e o app encontra as imagens
  dentro dela, incluindo subpastas. Antes de enviar, mostra quantas encontrou, o volume
  total, os formatos, as repetidas e o que não pode importar.
- **Escolha da pasta compatível com o navegador.** Usar o seletor de diretório quando
  disponível e oferecer seleção de pasta por `<input type="file" webkitdirectory>` como
  alternativa. Se o navegador não permitir ler pastas, explicar o limite e permitir escolher
  várias imagens pelo seletor de arquivos.
- **Importação enquanto a aba estiver aberta.** Depois da conferência, a pessoa inicia o
  envio. Ele continua enquanto a aba do Drive Fotos estiver aberta, mesmo que a pessoa mude
  para outra aba. A tela mostra progresso geral e por arquivo, estado atual, pausa, retomada
  e cancelamento. O navegador pode reduzir a velocidade da aba em segundo plano; fechar a
  aba ou o navegador interrompe o trabalho. Não prometer execução em background do sistema
  operacional.
- **Retomada.** A versão inicial avisa se uma importação da aba foi interrompida. A pessoa
  escolhe a mesma pasta de novo; o app refaz a conferência por nome e conteúdo e ignora o que
  já foi confirmado no repositório. A lista completa de caminhos e estados e a reutilização
  automática da permissão da pasta ainda dependem de validação por navegador. Não guardar
  outra cópia completa do acervo no armazenamento do navegador.
- **Índice do backup.** Trocado pelo índice por ano no Épico 20. Como nasceu: a conferência precisa do nome de cada foto guardada, e o nome mora
  no registro: sem ajuda, é uma leitura por foto a cada conferência. O arquivo
  `indices/backup.json`, no repositório de dados, guarda para cada registro o `sha` dele, o
  nome e o caminho da foto. A conferência lê a árvore e o índice, e só abre os registros
  que o índice não conhece ou cujo `sha` mudou (foto renomeada ou com a data acertada).
  Foto apagada sai do índice sozinha. O índice é gravado depois da conferência, a cada dez
  lotes e no fim do envio, em commit próprio. Se ele se perder ou vier ilegível, o backup
  lê tudo de novo e o refaz. O app principal ignora a pasta `indices/`. Medida de
  2026-10-12, na base de testes, com 68 registros: 68 leituras e 6,0 s na primeira
  conferência, 1 leitura e 2,0 s na seguinte.
- **Antes de enviar, fazer o levantamento.** Informar totais, tamanho e formatos, comparar
  com o espaço conhecido do repositório e apresentar uma prévia do que será enviado,
  ignorado ou precisa de decisão. Não começar a transferência até a pessoa confirmar.
- **Capacidade: só avisa.** Um repositório tem recomendação de até 5 GB e o aviso do app
  começa em 4 GB. Quando a previsão passa do aviso, o resumo mostra a estimativa e o risco,
  e o envio segue liberado. O bloqueio que existia aqui saiu em 2026-10-12, a pedido, para
  o acervo de cerca de 8 GB subir num repositório só. Vários repositórios seguem dependendo
  do RG04.
- **O que não entra:** vídeos, arquivos vazios, formatos que o app não reconhece como imagem
  e imagens acima do limite atual de 25 MB. Listar cada item ignorado com o motivo, para não
  parecer que foi importado.
- **Lotes e limites da API.** Reutilizar a fila de envio do app, o limite de dez fotos por
  commit, a pausa quando o GitHub limitar o ritmo e a retomada. Não paralelizar sem limite.
  O backup envia três fotos por vez, com a original e a miniatura juntas, e segura o ritmo
  em 110 escritas por minuto. Medida de 2026-10-12 na base de testes, com blobs de 20 KB:
  128 escritas por minuto passaram por 70 s, e uma rajada de 530 por minuto foi bloqueada
  por 1 minuto depois de 554 escritas. O teto de 500 por hora não apareceu. Falta medir o
  ritmo sustentado e com fotos de tamanho real.
- **Data da foto:** manter a ordem do Épico 8, EXIF e depois nome do arquivo. Para exportações
  com arquivos auxiliares de metadados, identificar e especificar os formatos suportados
  antes da implementação. Sem uma data válida, importar com o estado já usado pelo app para
  que a foto apareça em "Fotos sem data".
- **Repetidas:** verificar o nome e a identidade do conteúdo contra as fotos do repositório
  e contra os arquivos já vistos nesta importação. Ignorar como repetida somente quando nome
  e conteúdo coincidirem; mostrar essa contagem no resumo. Conteúdo idêntico com outro nome
  segue a regra do Épico 7 para conteúdo repetido. Se o nome coincidir, mas o conteúdo for
  diferente, conservar as duas fotos usando o próximo nome livre, sem sobrescrever a
  existente.
- **Ensaio na base de testes,** com uma amostra de cem fotos, antes da base oficial.
- **Cópias de segurança:** recomendar que exista uma cópia independente da origem. Não
  apagar nem modificar arquivos da pasta escolhida. Depois do envio, conferir a migração
  antes de considerar o repositório a cópia válida.
- **Conferência:** totais da origem = importadas + repetidas + ignoradas, sem itens pendentes
  ou com erro. Abrir uma amostra para conferir nome, data e orientação.
- **Em aberto:**
  - Origem e tamanho reais do acervo. Fazer o levantamento antes de fechar a estratégia de
    capacidade e o tamanho dos lotes de teste.
  - HEIC. Decidido em 2026-10-12: o backup não aceita HEIC nem HEIF. As 261 que tinham
    subido sem miniatura foram apagadas da base no mesmo dia. Em 2026-10-13 a regra passou
    a valer também no envio comum e virou uma lista do que entra: JPEG, PNG, WebP, GIF, AVIF
    e BMP, os formatos que todo navegador mostra. HEIC, TIFF e RAW ficam de fora, com o
    aviso "formato que o navegador não mostra". A lista está em `src/foto.js`, e o seletor
    de arquivos da tela principal só oferece esses tipos.
  - Metadados auxiliares: listar os formatos de exportação que serão lidos e como associar
    cada arquivo de metadados à imagem correta.
  - Persistência do acesso à pasta e retomada automática: confirmar o comportamento em cada
    navegador alvo. A versão inicial pede para escolher a pasta novamente após uma
    interrupção; a fila não afirma que continuará sem a página aberta.
  - Se o acervo não couber: fechar RG04 antes de escolher entre vários repositórios e uma
    ferramenta de importação por script. O script não é o caminho principal deste épico.
- **Pronto quando:** uma pessoa escolhe uma pasta, confere o resumo e inicia a importação;
  pode acompanhar, pausar, retomar ou cancelar; uma interrupção recuperável não reenvia o
  que já foi confirmado; e o relatório final explica todos os arquivos encontrados. Na
  base de testes, cem fotos são conferidas na grade ou listadas como ignoradas/com erro, com
  amostra validada quanto a data, nome e orientação. A base oficial só recebe a migração
  depois de confirmados espaço suficiente e cópia de segurança independente.

### Épico 18: Enviar as fotos do dia

Pedido em 2026-10-12: "tirei fotos hoje, e no fim do dia quero enviar todas".

- **O limite que manda no desenho:** um site não lê a galeria sozinho. Alguém precisa
  escolher os arquivos. O épico encurta esse caminho o máximo que o navegador deixa.
- **Botão "Enviar as fotos de hoje",** junto da zona de envio. Abre o seletor de fotos, que
  no celular já começa pelas mais recentes. A pessoa marca sem conferir uma a uma, pode
  marcar a mais.
- **O app separa as de hoje.** Da seleção, só passam as fotos com data de hoje, pela mesma
  leitura do Épico 8. As de outros dias ficam de fora, sem pergunta.
- **O que já subiu não sobe de novo,** pela comparação do Épico 7, sem abrir o diálogo de
  repetidas.
- **Resumo antes de enviar:** "14 escolhidas: 9 de hoje para enviar, 3 de hoje já
  guardadas, 2 de outros dias". Um botão, "Enviar 9 fotos". Com nada a enviar, o resumo
  diz que o dia já está guardado.
- **"Hoje" é o dia do aparelho.** Antes das 4 da manhã, o botão oferece também o dia
  anterior, para quem envia depois da meia-noite.
- **Foto sem data** (print, imagem de mensagem) não entra no filtro. O resumo conta quantas
  ficaram de fora e oferece "Enviar também".
- **Estado do dia na grade:** depois do envio, o título de hoje mostra a hora do último
  envio do dia.
- **Em aberto, a parte de rotina:**
  - Lembrete no fim do dia. Notificação com o app fechado pede um servidor, que o projeto
    não tem. A alternativa é um lembrete do próprio celular, com o link do app.
  - Um atalho do sistema que junte as fotos de hoje e entregue ao app. A confirmar em que
    celular isso funciona, porque depende de o sistema deixar compartilhar para um site
    instalado. Liga com a decisão "iPhone ou Android" de `../requisitos.md`.
  - No computador, escolher uma pasta uma vez e o app ler dela as fotos de hoje. A
    confirmar em quais navegadores.
- **Pronto quando:** num dia com fotos novas, um toque no botão, a seleção das recentes e
  um toque em "Enviar" guardam todas as de hoje; repetir o mesmo caminho logo depois não
  envia nenhuma; e uma foto de ontem escolhida junto fica de fora.

### Épico 19: Listagem do repositório acima de 7 MB

Pedido em 2026-10-12, no meio da migração do acervo. É o gap G19 da análise de gaps, que
tinha sido aceito porque o bloqueio de 4 GB chegaria antes. O bloqueio saiu na versão 1.8.2.

- **O problema.** O app lista o repositório inteiro numa chamada só (`lerArvore`, em
  `src/github.js`). O GitHub corta essa lista acima de 100.000 entradas ou 7 MB e avisa com
  `truncated: true`. O app não olha esse aviso: mostraria só as fotos que vieram, sem dizer
  que faltam, e o backup deixaria de reconhecer parte do que já subiu.
- **Medida de 2026-10-12, na base oficial:** 1.786 fotos, 5.405 entradas e 1,78 MB de
  resposta, ou cerca de 330 bytes por entrada. Por essa conta, 7 MB são perto de 22.000
  entradas, ou 7.400 fotos. A migração leva a base a cerca de 9.600 fotos. A primeira parte
  da pasta para perto de 6.300 e cabe. A segunda cruza o limite.
- **Quem lê a listagem:** a grade e a conferência de repetidas (`src/app.js`), e a
  conferência e a conta de espaço do backup (`src/backup-app.js`). Gravar não depende
  dela: o commit é feito sobre a ponta da branch.

Feito em 2026-10-12, as duas etapas juntas, em `src/github.js`. O desenho saiu mais simples
que o planejado: em vez de três níveis de leitura, um só, guiado pelo `sha` de cada pasta.

- **A listagem fica guardada por pasta.** Cada pasta tem o `sha` dela e os arquivos que
  ficam direto dentro. O `sha` de uma pasta muda quando qualquer coisa dentro dela muda.
- **Primeiro a ponta.** `lerArvore` lê a ponta da branch, uma chamada pequena. Se a árvore
  da raiz é a mesma da última leitura, devolve a listagem guardada e não lê mais nada.
- **Primeira leitura do aparelho:** uma chamada só, como antes. A resposta traz também as
  pastas com o `sha` de cada uma, e a listagem por pasta é montada dela.
- **Releitura, ou primeira leitura cortada:** o app lê a raiz e desce pasta por pasta, com
  no máximo seis chamadas ao mesmo tempo. A pasta com o mesmo `sha` de antes vem da
  listagem guardada, com tudo o que tem dentro, sem chamada. Enviar fotos de um ano relê a
  raiz, as pastas `fotos/`, `miniaturas/` e `registros/` e as três pastas daquele ano.
- **Pasta cortada: erro visível.** Lida sozinha, sem as subpastas, uma pasta só é cortada
  com mais de 100.000 entradas ou 7 MB, muito acima das 3.000 fotos por ano. Se acontecer,
  a leitura falha com o erro `cortada` e mensagem própria. Na abertura sem lista guardada
  vai para a tela de erro; com lista na tela, e na conferência silenciosa, aparece no aviso
  do "Atualizar". A grade nunca é montada com lista incompleta.
- **Onde fica guardado:** no Cache do navegador, uma listagem por branch, e sai no "Sair".
  A tela de backup usa a mesma.
- **O resultado tem o mesmo formato de antes,** `{ caminho, sha, tamanho }` por arquivo.
  Grade, repetidas e backup não mudaram.
- **Para testar sem 7.000 fotos:** em `localhost`, abrir a página com `?listagem-por-pasta`
  pula a leitura de uma chamada só.
- **Verificado em 2026-10-12, na base de testes,** com 206 arquivos em 26 pastas:
  - primeira leitura: 2 chamadas;
  - nada mudou: 1 chamada, na mesma página e em outra página com a listagem guardada;
  - uma pasta de ano mudou: 4 chamadas, e a lista saiu igual à de uma chamada só;
  - leitura de uma chamada só cortada (simulado): 28 chamadas, lista igual;
  - tudo cortado (simulado): erro `cortada`, sem lista.

- **Fora do épico:**
  - Vários repositórios de dados (RG04). É a saída para o espaço, e reduz este problema,
    mas muda leitura, grade e envio.
  - O peso da grade com 9.600 fotos no celular. Fica para o Épico 14.
- **Em aberto:**
  - Se os 7 MB valem para o tamanho da resposta, como medido aqui, ou para outra conta do
    GitHub. A etapa 1 funciona nos dois casos, porque decide pelo `truncated`.
  - Se a listagem de uma pasta só, sem recursão, tem o mesmo teto. Não deu para confirmar
    com a base de testes, que é pequena. O corte real só foi simulado.
  - Repositório sem nenhum commit: a leitura da ponta responde "branch não encontrada" em
    vez de "repositório vazio". O RG07 já pede o commit inicial.
- **Pronto quando:** com o corte forçado em `localhost`, a grade mostra as mesmas fotos e o
  mesmo espaço usado da leitura comum; o backup reconhece como repetidas as mesmas fotos; um
  corte que nem a leitura por ano resolve mostra o erro, e nunca uma grade incompleta; e,
  na etapa 2, voltar para a aba sem nada novo custa uma chamada.

### Épico 20: Índice das fotos por ano

Pedido em 2026-10-12, a partir da análise de gaps refeita com o acervo grande.

- **O problema.** Três segundos depois de abrir, o app lia o registro de cada foto, um por
  chamada, para saber o nome (foto repetida) e a origem da data (fotos sem data). O que foi
  lido fica no aparelho, mas num aparelho sem nada guardado são tantas chamadas quantas
  fotos. Com 9.600 fotos, passa das 5.000 chamadas por hora que o GitHub dá ao token, e aí
  miniaturas e envio param junto.
- **A saída.** O que o app precisa saber de todas as fotos de uma vez fica num índice. O
  registro inteiro só é lido quando a foto é aberta ou regravada.
- **Um arquivo por ano,** `indices/AAAA.json`, no repositório de dados. Um índice único
  teria perto de 2 MB com 9.600 fotos, e regravar isso a cada envio pesaria quase tanto
  quanto a foto. Por ano, o maior é o de 2026, com cerca de 200 KB.
- **Cada entrada,** com o caminho do registro como chave:

```json
{
  "registro": "64a87c01fbbc3deeea960a8695689e2cac519766",
  "nome": "praia.jpg",
  "blob": "fotos/2008/20080119T122423-fmio.jpg",
  "origem": "exif",
  "enviada": "2026-10-12T19:30:26-03:00"
}
```

  - `registro` é o `sha` do arquivo de registro. A entrada só vale enquanto ele é o mesmo.
  - `origem` é a origem da data: `exif`, `nome`, `informada` ou `envio`.
  - `enviada` só existe na foto sem data, que a tela "Fotos sem data" agrupa pelo dia do
    envio.
  - Tamanho e `sha` da foto ficam de fora, porque já vêm na listagem. A data está no `id`.
- **Quem grava.** Enviar, renomear, apagar e acertar a data regravam o índice do ano no
  mesmo commit, sem chamada a mais: a foto e a entrada dela entram juntas ou não entram.
  A tela de backup, que fecha um lote a cada poucos segundos, regrava os anos que mudaram a
  cada dez lotes e no fim, em commit próprio.
- **Quem lê.** O app lê os índices três segundos depois de abrir e guarda os arquivos no
  aparelho pelo `sha`: da segunda vez, só o ano que mudou é baixado. A tela de backup lê os
  mesmos arquivos na conferência.
- **Foto que o índice não conhece** (índice velho, perdido ou sobrescrito por outro
  aparelho) é lida pelo registro, como antes, com teto de 200 leituras por abertura. O teto
  impede a rajada. O resto fica para a abertura seguinte, ou para a próxima conferência da
  tela de backup, que regrava o ano.
- **Antes de o índice ser lido, o app não grava nele,** para não trocar um arquivo completo
  por um pela metade.
- **O índice antigo,** `indices/backup.json`, sai do repositório na primeira gravação da
  tela de backup.
- **Verificado em 2026-10-12, na base de testes,** com 68 fotos em 7 anos:
  - conferência do backup sem índice: 68 leituras de registro e um commit com os 7 índices;
    a seguinte: 7 leituras, uma por índice, e nenhuma de registro;
  - abrir o app: 7 leituras de índice, nenhuma de registro, e o aviso "24 fotos estão sem
    data" certo;
  - tela "Fotos sem data": nenhuma chamada para abrir, com as 24 fotos no dia do envio;
  - enviar, renomear, apagar e acertar a data de uma foto: um commit cada, com a entrada do
    índice certa depois de cada um.
- **Em aberto:**
  - Apagar várias fotos de uma vez e o teto de 200 leituras não foram testados.
  - Dois aparelhos gravando o mesmo ano ao mesmo tempo: o último sobrescreve a entrada do
    outro, e a foto volta a ser lida pelo registro até alguém regravar o ano.
  - A tela "Fotos sem data" desenha todas as fotos de uma vez. Com 2.000 delas, pede
    carregar só o que está na tela. Épico 14.
- **Pronto quando:** abrir o app num aparelho sem nada guardado custa uma leitura por ano,
  e não uma por foto; o aviso de fotos sem data aparece sem abrir registro; e cada gravação
  do app deixa o índice do ano igual ao que está no repositório.

### Épico 21: Grade no celular

Pedido em 2026-10-12: com 4.312 fotos a tela principal travava muito no celular. Revisão
crítica feita no mesmo dia, medindo o app publicado na versão 1.10.2.

- **Animação em todo quadro sem miniatura.** Cada quadro ainda não carregado piscava, com
  uma animação de opacidade sem fim, e quase todos estão fora da tela. Medido: 4.288
  animações rodando ao mesmo tempo, 4.275 delas em quadros da grade. Agora só pisca o
  quadro que pediu a miniatura e ainda espera por ela. Na base de testes: nenhuma animação
  com a grade parada.
- **A página inteira numa camada de transformação.** O gesto de puxar para atualizar
  deslocava topo, página e rodapé por `transform`, e a regra valia o tempo todo, mesmo com
  deslocamento zero. Agora a transformação só existe enquanto o dedo puxa e durante a volta.
- **Toque que segurava a rolagem.** O ouvinte de `touchmove` do mesmo gesto era registrado
  de forma que o navegador precisava esperar o app a cada movimento do dedo antes de rolar.
  Agora ele só é registrado quando o toque começa com a página no topo, que é quando o
  gesto pode acontecer.
- **Índice das originais lido do `localStorage` a cada miniatura.** Passa a ficar na
  memória depois da primeira leitura.
- **O que não foi feito e pode ser o próximo passo,** se ainda travar:
  - A grade tem todos os quadros no documento, 13.949 elementos com 4.312 fotos. Desenhar
    só os dias perto da tela.
  - As miniaturas já vistas ficam todas na memória. Soltar as que estão longe da tela.
  - No modo de seleção, cada toque percorre todos os quadros.
- **Não medido no celular.** As medições foram no computador. O efeito no aparelho só
  aparece no uso.

### Épico 22: Skeleton na tela inicial

Pedido em 2026-10-12 e feito no mesmo dia.

- **Como ficou:** a tela de carregamento usa as mesmas classes da tela principal (`envio`,
  `zona`, `selecao-topo`, `dias`, `dia`, `grade`, `grade__quadro`), com o texto escondido
  e 24 quadros neutros. O bloco inteiro tem uma animação só, a mesma `pulsar` dos quadros.
- **Verificado na base de testes,** em tela larga: a zona de envio, o botão de backup, a
  linha do "Selecionar", o título do dia e o primeiro quadro ficam exatamente no mesmo
  lugar e com o mesmo tamanho no esqueleto e na tela real. Uma animação rodando.
- **Não verificado:** em tela de celular. As colunas vêm das mesmas regras da grade.
- **Limite:** os avisos que só aparecem com a lista em mãos (espaço usado, fotos sem data)
  empurram a grade para baixo quando existem.

- **Onde:** na tela inicial, quando o app abre pela primeira vez num aparelho e ainda não
  tem a lista de fotos guardada, e sempre que a lista estiver carregando. Hoje aparece um
  girador com "Carregando suas fotos...".
- **O que mostrar:** o esqueleto da própria tela, no lugar do girador. A zona de envio, um
  título de dia e uma grade de quadros neutros, com as mesmas colunas e o mesmo espaçamento
  da grade real, para nada pular quando as fotos chegarem.
- **Troca sem salto.** Quando a lista chega, os quadros do esqueleto dão lugar aos da grade
  no mesmo lugar. O texto "Carregando suas fotos..." continua para o leitor de tela.
- **Uma animação só.** A lição do Épico 21: o brilho do esqueleto é uma animação no bloco
  inteiro, e não uma por quadro. Com movimento reduzido no sistema, fica parado.
- **Quantos quadros:** o bastante para encher a primeira tela, e não mais.
- **Erro e vazio continuam como estão:** a falha de carga vai para a tela de erro, e a base
  sem fotos para "Nenhuma foto guardada ainda".
- **Em aberto:**
  - Se o esqueleto também entra em "Fotos sem data" e na conferência do backup.
  - Se as miniaturas ganham o mesmo tratamento enquanto baixam, ou seguem com o quadro
    neutro piscando.
- **Pronto quando:** abrir o app num aparelho sem nada guardado mostra o esqueleto da grade
  em vez do girador, e a grade real entra sem a página pular.

### Épico 23: Botão de ir para o início

Pedido em 2026-10-13 e feito no mesmo dia.

- **Como ficou:** um botão redondo, com uma seta para cima, fixo no canto inferior
  direito. A pílula de uso fica no canto esquerdo e o atalho da foto enviada, uma linha
  acima. Aparece depois de duas telas de rolagem e some no modo de seleção. Em
  2026-10-13 os dois trocaram de lado, a pedido.
- **Vale para a grade e para "Fotos sem data",** porque acompanha a rolagem da página.
- **Ao tocar,** a página volta ao topo e o foco vai para o título da tela. A menos de cinco
  telas do topo a rolagem é suave; mais longe, ou com movimento reduzido no sistema, é um
  salto direto, para não passar por milhares de quadros. A conferência da rolagem roda no
  máximo uma vez por quadro de animação.
- **Tela estreita:** abaixo de 360 px de largura o botão sobe uma linha, porque ao lado da
  pílula de uso não cabe.
- **Tolerante a página antiga.** Se o navegador ainda tiver um `index.html` de antes, sem o
  botão, o app segue funcionando sem ele. Sem essa proteção, o arquivo novo com a página
  antiga derrubava a tela inteira, e o mesmo cuidado entrou no esqueleto do Épico 22.
- **Verificado na base de testes,** em tela larga: aparece depois de duas telas, tem 44 por
  44 px, some no modo de seleção, e o toque leva o foco ao título "Suas fotos".
- **Não verificado:** a rolagem suave, porque a aba de teste estava em segundo plano e o
  navegador segura animações ali; o salto direto funcionou. Também não foi aberto em
  celular nem em 320 px de largura.

- **O problema:** com milhares de fotos a grade tem mais de cem telas de altura, e voltar ao
  topo, onde ficam a zona de envio e o "Atualizar", é rolar tudo de volta.
- **O botão:** aparece depois que a pessoa rola algumas telas e leva ao início da página
  num toque. No topo ele some.
- **Onde fica:** flutuando embaixo, sem cobrir a pílula de uso, o atalho da foto enviada
  nem a barra do modo de seleção.
- **Teclado e leitor de tela:** é um botão de verdade, com nome próprio, e o foco vai para
  o começo da página depois do salto.
- **Movimento:** rolagem suave, e direta para quem pediu movimento reduzido ao sistema.
- **Em aberto:**
  - Se a tela "Fotos sem data" ganha o mesmo botão.
  - Se além do início vale um atalho para pular por ano.
- **Pronto quando:** rolando até o meio da grade o botão aparece, um toque volta ao topo e
  o botão some.

### Épico 24: Lista de fotos guardada no navegador

Pedido em 2026-10-13 e feito no mesmo dia. É o gap N3 da análise de gaps.

- **O problema:** para abrir na hora, o app guardava no `localStorage` uma cópia da lista
  de fotos. O `localStorage` tem teto de cerca de 5 MB por site, dividido com os outros
  sites da mesma origem. Medido em 2026-10-12: 265 caracteres por foto, ou cerca de 1,15 MB
  com 4.339 fotos e 2,6 MB com 9.765. Quando não cabia, a gravação falhava em silêncio e a
  cópia antiga continuava lá: o app abria com a lista velha e desenhava a grade duas vezes.
- **Primeira tentativa, descartada:** um teto fixo de 3 MB, apagando a cópia quando não
  coubesse. Funcionava, mas ao bater o teto o app perdia a abertura na hora. O pedido foi
  um sistema permissivo, que lide com o tamanho sem falhar.
- **Como ficou:** a lista passou para o Cache do navegador, o mesmo lugar das miniaturas e
  das originais, que é limitado pelo disco e não por um teto pequeno. Não há mais teto na
  lista. Está em `src/armazem.js`.
- **Sem lista velha.** As gravações entram numa fila, uma depois da outra, para a última
  ser sempre a que fica. Se uma gravação falhar, a cópia é apagada, e a abertura seguinte
  mostra o esqueleto e carrega do GitHub.
- **Quem vem da versão anterior:** na primeira abertura o app ainda lê a lista do
  `localStorage`, para não perder a abertura na hora, e a apaga de lá na primeira gravação.
- **Verificado na base de testes:**
  - lista de 30.000 fotos, 7,6 MB: gravada em 85 ms e lida em 47 ms;
  - três gravações seguidas: fica a última;
  - sem lista no Cache e com uma no `localStorage`: o app usa a antiga, e ela sai de lá na
    gravação seguinte;
  - o app aberto duas vezes: na segunda a grade aparece direto, sem esqueleto e sem erro.
- **Em aberto:** navegador sem Cache (página fora de contexto seguro) abre sempre pelo
  esqueleto. É o mesmo limite que as miniaturas já têm.

### Épico 25: Corrigir a data de uma foto só

Pedido em 2026-10-13 e feito no mesmo dia.

- **Como ficou:** cada foto de "Fotos sem data" ganhou o botão "Salvar esta", que grava só
  ela, num commit próprio. Ele fica disponível quando a data da foto mudou ou quando "A
  data está certa" foi marcada. O "Salvar datas" do bloco e o "Mesmo dia para todas"
  continuam.
- **Miniaturas sob demanda:** a tela pede a miniatura quando a foto chega perto da tela e
  desiste se ela sair antes de começar a baixar, como na grade principal.

- **Data por foto, isolada.** Acertar a data de uma foto sem depender do bloco em que ela
  está: cada foto tem o próprio salvar, e o commit leva só ela.
- **A tela carrega as imagens como a grade principal.** As miniaturas entram conforme
  aparecem na tela, seis por vez, e a que saiu de perto da tela deixa a fila. Hoje a tela
  "Fotos sem data" desenha todas as fotos de uma vez; na base oficial são 1.136.
- **O que continua:** o "Mesmo dia para todas" e o salvar do bloco inteiro, para quem quer
  datar um envio de uma vez.
- **Índice:** a troca de data já regrava o índice dos anos envolvidos no mesmo commit
  (Épico 20).
- **Em aberto:**
  - Se a correção unitária também entra na foto aberta, para qualquer foto, e não só para as
    que subiram sem data.
  - Se a tela ganha o esqueleto do Épico 22 enquanto carrega.
- **Pronto quando:** dá para salvar a data de uma foto sem tocar nas outras do bloco, e
  abrir a tela com mais de mil fotos baixa só as miniaturas que estão à vista.

### Épico 26: Sistema de backup

Pedido em 2026-10-13: "sempre que eu abrir a tela ele faz um fork do repo da base de dados
para a conta principal? Se isso trouxer os arquivos pode ser uma solução". Hoje a cópia de
segurança é um `git clone` manual (RG10), e nada no app lembra dela.

- **O que a cópia precisa garantir:** que as fotos sobrevivam se o GitHub limitar, suspender
  ou apagar o repositório de dados ou a conta dele. É para isso que o repositório fica numa
  conta separada.
- **O fork, analisado.** A confirmar na documentação do GitHub antes de decidir:
  - O fork de um repositório privado fica preso ao original. Apagar o original privado
    apaga os forks privados junto, então o fork não cobre o caso que mais importa.
  - Fork e original dividem o mesmo armazenamento no GitHub. Não é uma cópia independente.
  - O app entra só com o token da conta separada. Criar e atualizar um fork na conta
    principal pede um token dela, que hoje o app não tem e que o plano evita guardar.
- **Alternativas a comparar:**
  - Um repositório espelho na conta principal, sem vínculo de fork, atualizado por uma
    rotina agendada que copia o repositório de dados.
  - O `git clone` no HD, como hoje, com um lembrete no app de quando foi a última cópia.
- **Tamanho:** a base está em 6,02 GB e vai a cerca de 9,4 GB. Qualquer cópia no GitHub
  herda o mesmo limite recomendado de 5 GB por repositório.
- **Em aberto:**
  - Se a cópia é disparada ao abrir a tela, por agenda ou por um botão.
  - Onde o app mostra a data da última cópia.
- **Pronto quando:** existe uma cópia das fotos que não some junto com o repositório de
  dados, atualizada sem depender de lembrar, e o app mostra quando ela foi feita.

### Épico 27: Teto para as miniaturas

Pedido em 2026-10-13 e feito no mesmo dia: "se eu navego para baixo e carrego mil imagens,
a partir disso já pode ir limpando as imagens para trás. Se eu voltar, ele recarrega".

- **O problema:** toda miniatura vista ficava para sempre, na grade e no aparelho. São 39 KB
  cada em média: as 8.857 fotos da base em 2026-10-13 somam 338 MB só de miniaturas.
  Ninguém vê tudo isso, e no celular o navegador dá menos espaço por site.
- **Na grade, mil.** A grade mantém até 1.000 miniaturas carregadas. Passou disso, as
  carregadas há mais tempo que estão longe da tela saem do quadro e da memória. O quadro
  fica neutro e pede a miniatura de novo quando voltar a ficar perto da tela.
- **No aparelho, duas mil.** O que não é original (miniaturas, registros e índices) tem
  teto de 2.000 arquivos guardados. A cada cem gravações os mais antigos saem. Quem volta a
  uma foto recente recarrega do aparelho, sem chamar o GitHub; quem volta a uma antiga
  baixa de novo.
- **O que está perto da tela nunca sai,** mesmo acima do teto.
- **As originais** continuam com o teto de 1 GB que já tinham.
- **Verificado na base de testes,** com os tetos reduzidos para 20 na grade e 40 no
  aparelho, porque a base tem 98 fotos: rolando até o fim, as do topo saíram e todas as que
  estavam na tela ficaram; voltando ao topo, as do topo recarregaram e as do fim saíram; o
  aparelho ficou com 41 arquivos pequenos.
- **Não verificado:** com os tetos reais, de 1.000 e 2.000, que pedem uma base grande.
- **Em aberto:** a tela "Fotos sem data" não passa por este teto. Fica para o Épico 25.

### Épico 28: Reformulação do layout

Pedido em 2026-10-13: "o site está muito opaco com esse tema escuro". As decisões foram
tomadas num assistente de protótipo (`prototipos/tema.html`, fora do git), com a prévia da
tela mudando a cada escolha.

- **Decisões de 2026-10-13:**

| Etapa | Escolha |
| --- | --- |
| Cor de destaque | Azul, a mesma de antes (`#3b9dff`) |
| Fundo | Ardósia: mais claro que o azul-marinho, com mais diferença entre as camadas |
| Quanto a cor aparece | Média: também na borda e no ícone da zona de envio |
| Grade de fotos | Soltas: vão de 8 px e cantos arredondados |

- **Tokens que mudaram em `src/style.css`:**

| Token | Antes | Agora |
| --- | --- | --- |
| `--fundo` | `#0b1220` | `#131a24` |
| `--superficie` | `#151e2e` | `#1f2937` |
| `--trilho` | `#263349` | `#374357` |
| `--texto` | `#e8eef7` | `#eef2f8` |
| `--texto-suave` | `#9aa8bd` | `#a9b4c5` |

  `--azul`, `--erro` e `--atencao` ficaram como estavam. A cor do tema nas quatro páginas e
  no `manifest.webmanifest` acompanha o fundo novo.
- **Contraste medido com as cores novas:** texto sobre o fundo 15,6 : 1; texto secundário
  sobre a superfície 7,0 : 1; azul sobre o fundo 6,2 : 1 e sobre a superfície 5,2 : 1; texto
  do botão principal 6,2 : 1. Todos acima dos 4,5 : 1 pedidos para texto.
- **Zona de envio:** a borda tracejada mistura o azul com o trilho, e o ícone fica azul
  mesmo sem o cursor em cima.
- **Grade:** vão de 8 px entre as fotos e cantos de 8 px. O esqueleto do Épico 22 usa as
  mesmas classes e acompanha.
- **Pílula de uso à esquerda e botão de ir para o início à direita,** trocados de lado no
  mesmo dia.
- **Menu "Mais" no topo.** Reúne o que é secundário: Backup de uma pasta, Fotos sem data
  com a contagem, Novidades com a versão ao lado e Sair. No topo ficam só "Atualizar" e
  "Mais", que tem fundo e texto em destaque. Saíram o botão "Sair" do topo, o link do
  backup acima da zona de envio e o botão "Novidades" do rodapé, que com milhares de fotos
  ficava inalcançável. O rodapé segue com a versão em texto.
  - Usa o popover nativo do navegador, que já fecha com Esc e ao tocar fora e devolve o
    foco. Onde o navegador não tem popover, o mesmo menu abre e fecha por código.
  - Fecha ao rolar a página e ao escolher um item.
  - "Fotos sem data" só aparece no menu quando existe alguma.
- **Em aberto:** se o aviso de fotos sem data sai da tela e fica só no menu. Por enquanto
  aparece nos dois lugares.
- **Verificado na base de testes,** em tela larga: a tela principal com as cores novas, a
  zona de envio, a grade, a pílula no lugar novo, "Fotos sem data" e a tela de backup.
- **Não verificado:** foto aberta, diálogos, página de novidades e de download com as
  cores novas, nem em celular.
- **Fechado em 2026-10-13,** por decisão, com a publicação da versão 1.13.0. Ficaram sem
  conferir a foto aberta, os diálogos, as páginas de novidades e de download e o celular.

### Épico 29: UX no celular: zoom, arrastar para fechar e proporções

Pedido em 2026-10-13: implementar na foto aberta o que se espera de um app de fotos no
celular.

- **Como está hoje.** A foto aberta passa para a anterior e a próxima deslizando na
  horizontal. Fecha no botão, no Esc, no voltar do aparelho e tocando fora da foto. O zoom é
  o da página inteira, feito pelo navegador, e não existe arrastar para fechar.
- **Zoom na foto.**
  - Pinça amplia em torno do ponto entre os dedos.
  - Duplo toque alterna entre a foto ajustada à tela e ampliada no ponto tocado. No
    computador, duplo clique e a roda do mouse fazem o mesmo.
  - Com a foto ampliada, arrastar move a foto, e ela não sai da área visível.
  - Enquanto está ampliada, passar de foto e arrastar para fechar ficam desligados. Voltando
    ao tamanho ajustado, os dois voltam a valer.
  - A original só entra no zoom depois de carregada. Antes disso vale a prévia.
- **Arrastar para baixo fecha.**
  - A foto acompanha o dedo desde o começo, encolhe de leve, o fundo clareia junto e os
    controles somem.
  - Confirma por distância ou por velocidade: um gesto curto e rápido também fecha.
  - Gesto incompleto volta ao lugar. Toque cancelado pelo sistema e mudança de orientação
    também.
  - Ao fechar, a foto volta para o quadro dela na grade, como já acontece no botão.
  - O eixo é decidido no começo do gesto: horizontal passa de foto, vertical fecha, e um não
    vira o outro no meio.
- **Tocar na foto não fecha.** Um toque mostra e esconde os controles. Só o fundo vazio, o
  botão e o gesto fecham.
- **Proporções.**
  - A foto aberta ocupa o máximo da tela mantendo a proporção, centralizada e dentro das
    áreas seguras, em retrato e em paisagem.
  - Os controles ficam fora das regiões importantes da foto.
  - Na grade, conferir se o quadro quadrado em três colunas é a melhor leitura no celular.
- **Todo gesto tem um caminho sem gesto:** fechar tem o botão, passar de foto tem as setas,
  e o zoom ganha um controle visível.
- **Valores de partida,** para calibrar no aparelho: reconhecer o arraste depois de 8 a 10
  px; fechar com 20% a 25% da altura da tela ou acima de 450 px por segundo; encolher até
  0,85; volta em 200 a 300 ms.
- **Movimento reduzido:** abrir e fechar viram um fade curto, sem escala nem deslocamento.
- **Verificação em aparelho de verdade,** no Safari do iPhone e no Chrome do Android. Este
  épico não fecha com teste só no computador.
- **Em aberto:**
  - O que "proporções ideais" cobre: só a foto aberta, ou também a grade e as miniaturas.
  - Se o toque fora da foto continua fechando no celular, onde quase não sobra fundo vazio.
  - Até quanto o zoom amplia.
  - O que acontece com o painel de informações, que hoje só existe em tela larga.
- **Pronto quando:** no celular, dá para ampliar com pinça e com duplo toque, mover a foto
  ampliada, fechar arrastando para baixo e ver o gesto incompleto voltar; e nenhum desses
  gestos dispara o outro por engano.

## Pendências

Lista anotada em 2026-10-12 e revista em 2026-10-13. Cada item vira épico quando for a vez
dele. Primeiro o que já foi feito, depois o que falta.

- [x] A data de envio deve ser isolada da data de criação. Feito no Épico 8.
  - [x] Enviei hoje uma imagem de 2015, deve salvar em 2015.
- [x] Botão de atualizar igual ao do `beba-agua`. Feito no Épico 9.
- [x] Melhorar a performance no envio das imagens. Feito em 2026-10-12: commit por lote,
  ponta reaproveitada e original e miniatura subindo juntas.
- [x] Criar um link de download direto para enviar a alguém. Feito no Épico 10.
  - [x] A pessoa abre o link e baixa a imagem que está no git. Pode ser temporário: se
    vencer, um novo é criado e enviado de novo.
- [x] Changelog igual ao do `pr-manager`: uma página dedicada só às entregas. Feito no
  Épico 11.
- [x] Selecionar mais de uma foto para apagar. Implementado no Épico 12; medição com 50 e
  200 fotos na base de testes ainda pendente.
- [x] Remover todos os comentários. Feito no Épico 15.
- [x] Listagem do repositório acima de 7 MB: ler por pasta, reler só o que mudou e nunca
  mostrar lista cortada. Feito no Épico 19.
- [x] Índice das fotos por ano, para o app não ler um registro por foto ao abrir. Feito no
  Épico 20.
- [x] Grade no celular: animações, transformação da página e toque. Feito no Épico 21.
- [x] Skeleton na tela inicial, na primeira abertura e enquanto carrega. Feito no Épico 22.
- [x] Teto para as miniaturas: mil na grade e duas mil no aparelho. Feito no Épico 27.

Lista revista em 2026-10-13. O que falta, do mais crítico para o menos, pelo risco de perder
fotos ou de o app parar de funcionar bem:

1. [ ] Sistema de backup. Épico 26.
   - [ ] Sempre que eu abrir a tela ele faz um fork do repositório da base de dados para a
     conta principal? Se isso trouxer os arquivos pode ser uma solução.
2. [x] Lista de fotos guardada no navegador sem teto e sem lista velha. Feito no Épico 24,
   com outra estratégia: a lista saiu do `localStorage` e foi para o Cache.
3. [ ] Migração de tudo o que tenho até hoje. Épico 17.
   - [ ] Fazendo: falta a parte 1 da pasta, com 5.426 fotos.
4. [x] Corrigir a data por foto isolada, unitária. Feito no Épico 25.
   - [x] A tela deve carregar as imagens como é feito na tela de listagem principal.
5. [x] Criar botão de ir para o início. Feito no Épico 23.
6. [ ] Botão ou rotina para enviar as fotos do dia. Bem específico. Épico 18.
   - [ ] Tirei fotos hoje, e no fim do dia quero enviar todas.
7. [x] Rodar a análise de gaps. Feito no Épico 13.
8. Retirado da lista em 2026-10-13: Revisar todos os arquivos. Épico 14.
9. [ ] Documentar as usabilidades. Épico 16.
10. [x] Reformulação do layout. Feito no Épico 28, publicado na versão 1.13.0.
11. [ ] UX no celular: zoom, arrastar para fechar e proporções. Épico 29.

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
| 7 | Fotos duplicadas | 1 dia | 3 e 5 |
| 8 | Data da foto separada da data de envio | 1 dia | 3 |
| 9 | Botão de atualizar | 0,5 dia | 6 |
| 10 | Link de download para enviar a alguém | 0,5 dia | 5 |
| 11 | Novidades: página das entregas | 0,5 dia | Nada |
| 12 | Selecionar várias fotos para apagar | 1 dia | 5 |
| 13 | Análise de gaps | 0,5 dia | 11 e 12 |
| 14 | Revisão de todos os arquivos | 1 dia | 13 |
| 15 | Remoção dos comentários | 0,5 dia | 14 |
| 16 | Documentação das usabilidades | 0,5 dia | 15 |
| 17 | Migração do acervo | 3 dias, fora o tempo de envio | 13 |
| 18 | Enviar as fotos do dia | 1 dia | 7 e 8 |
| 19 | Listagem do repositório acima de 7 MB | 0,5 dia a etapa 1, 1 dia a etapa 2 | Nada |
| 20 | Índice das fotos por ano | 1 dia | 17 e 19 |
| 21 | Grade no celular | 0,5 dia | 17 |
| 22 | Skeleton na tela inicial | 0,5 dia | 21 |
| 23 | Botão de ir para o início | 0,5 dia | Nada |
| 24 | Lista de fotos guardada no navegador | 0,5 dia | 19 e 22 |
| 25 | Corrigir a data de uma foto só | 1 dia | 8 e 20 |
| 26 | Sistema de backup | 1 dia, fora a decisão | Nada |
| 27 | Teto para as miniaturas | 0,5 dia | 21 |
| 28 | Reformulação do layout | 1 dia, fora as decisões | 22 e 23 |
| 29 | UX no celular: zoom, arrastar para fechar e proporções | 2 dias | 4 e 28 |

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
- **Data da foto.** Confirmado em 2026-10-12: uma imagem de 2015 enviada hoje foi gravada
  com a data de hoje. Virou o Épico 8.
- **Original no iPhone.** Com `accept="image/*"`, o iOS converte HEIC para JPEG antes de
  entregar. O que sobe é a cópia convertida, e Live Photo perde o movimento. Aceitar, ou
  pedir HEIC e perder a visualização no Chrome.
- **Origem do app.** Servido pelo GitHub Pages da conta principal, ele divide o
  armazenamento do navegador com os outros sites dela, que conseguiriam ler o token e o
  cache. A saída é um domínio próprio ou publicar a interface pelo Pages da conta separada.
- **Tamanho do lote.** Decidido em 2026-10-12 que o commit é por lote. O lote de dez fotos
  é um chute: maior é mais rápido, mas a grade demora mais a mostrar a primeira foto e uma
  falha no commit atinge mais fotos. Ajustar depois de testar com levas reais.
