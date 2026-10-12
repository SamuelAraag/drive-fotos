# Plano: Drive Fotos

## Contexto

App privado para subir e ver fotos, simples como o `beba-agua`: HTML, CSS e JS puros, sem
servidor, sem build e sem dependências. O login é um token pessoal do GitHub guardado só no
navegador.

## Decisões

- **Dois repositórios, os dois privados.**
  - `drive-fotos`: o app (código). Nunca recebe imagem.
  - Repositório de dados, separado: funciona como banco de dados. Todas as imagens sobem
    para ele, pela API de Contents do GitHub.
- **Cada foto é um commit no repositório de dados** e tem duas partes:
  - o registro, com `id`, `nome` e as referências básicas (data, tamanho, tipo, caminho do
    blob);
  - o blob, que é a foto de fato e o asset mais importante. O registro existe para servir o
    blob, nunca o contrário.
- **Diferença para o `beba-agua`:** lá os dados ficam numa branch do mesmo repositório do
  app. Aqui os dados ficam em outro repositório.
- **Token:** fine-grained, com acesso só ao repositório de dados, Contents em "Read and
  write".
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
- **Fila de envio:** uma foto por requisição, em sequência. Cada item tem estado (na fila,
  enviando, enviado, erro), e a fila mostra "Enviando 2 de 5", o que falhou e um "tentar de
  novo" por item, sem refazer a seleção.
- **Recusas na entrada:** arquivo vazio, pasta e o que não for imagem ficam de fora, com
  aviso.
- **Fica de fora do `cloud-files`:** trial, barra de espaço livre e backend. Aqui o envio é
  o commit direto no repositório de dados.

## Em aberto

- Nome do repositório de dados (sugestão: `drive-fotos-dados`).
- Organização das imagens no repositório de dados: pasta por ano e mês, por álbum, ou tudo
  numa pasta só.
- Onde mora o registro: um `fotos.json` único com todos, ou um `.json` por foto ao lado do
  blob. O arquivo único lista rápido, mas dois envios ao mesmo tempo disputam o mesmo
  arquivo. Um por foto não tem disputa, mas listar custa mais chamadas.
- Formato do `id` (sugestão: gerado no navegador, e o blob é salvo com o `id` como nome de
  arquivo, para o `nome` poder mudar sem mover o blob).
- Quais são as referências básicas além de data, tamanho e tipo.
- Miniaturas: gerar no navegador e subir junto com a original, ou carregar sempre a
  original.
- Reduzir a imagem antes de subir ou guardar o arquivo original. A API de Contents recebe o
  arquivo em base64, o que pesa em foto grande, e o GitHub recomenda repositório abaixo de
  1 GB.
- Progresso por foto: a API de Contents não informa percentual com `fetch`. Usar
  `XMLHttpRequest` para ter a barra, ou mostrar só o estado de cada item.
- Hospedagem do app: GitHub Pages em repositório privado exige plano pago. Confirmar como o
  `beba-agua` é servido hoje e repetir.
- Escopo do MVP: só subir e ver, ou também apagar, álbuns e baixar.
