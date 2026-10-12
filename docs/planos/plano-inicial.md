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
src/armazem.js   o que fica guardado no aparelho
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
2. As miniaturas entram conforme aparecem na tela, não todas de uma vez. Toda miniatura
   baixada fica guardada no aparelho, sem limite, porque é pequena.
3. Toda foto que fica na tela por mais de 0,6 s entra numa fila de fundo, que baixa a
   original para o aparelho, duas por vez. Ao tocar numa foto visível, ela abre sem
   chamar o GitHub. Rolar depressa não dispara downloads, e a fila cede a vez ao envio.
4. Com a foto aberta, a anterior e a próxima ficam prontas na memória, para a seta passar
   sem espera.
5. Limites: as originais guardadas no aparelho têm teto de 1 GB, e as menos usadas saem
   primeiro. Na memória da aba o teto é de 150 MB. Os dois são em bytes, não em número de
   fotos, porque uma foto pode ter 300 KB ou 25 MB.
6. O que acabou de ser enviado já fica guardado, sem baixar de volta.
7. "Sair" apaga tudo que está guardado. Quem ativou economia de dados no navegador não tem
   a fila de fundo.

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
- **O changelog é público.** O site abre para qualquer pessoa, então as entradas descrevem
  só o app, nunca as fotos nem o repositório de dados.

## Pendências

Lista anotada em 2026-10-12, na ordem em que foi passada. Cada item vira épico quando for a
vez dele.

- [x] A data de envio deve ser isolada da data de criação. Feito no Épico 8.
  - [x] Enviei hoje uma imagem de 2015, deve salvar em 2015.
- [x] Botão de atualizar igual ao do `beba-agua`. Feito no Épico 9.
- [x] Melhorar a performance no envio das imagens. Feito em 2026-10-12: commit por lote,
  ponta reaproveitada e original e miniatura subindo juntas.
- [x] Criar um link de download direto para enviar a alguém. Feito no Épico 10.
  - [x] A pessoa abre o link e baixa a imagem que está no git. Pode ser temporário: se
    vencer, um novo é criado e enviado de novo.
- [ ] Rodar a análise de gaps.
- [ ] Revisar todos os arquivos.
- [ ] Remover todos os comentários.
- [ ] Documentar as usabilidades.
- [ ] Migração de tudo o que tenho até hoje.
- [ ] Botão ou rotina para enviar as fotos do dia. Bem específico.
  - [ ] Tirei fotos hoje, e no fim do dia quero enviar todas.

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
| 11 | Novidades (changelog) | 0,5 dia | Nada |

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
