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

## Em aberto

- Nome do repositório de dados (sugestão: `drive-fotos-dados`).
- Organização das imagens no repositório de dados: pasta por ano e mês, por álbum, ou tudo
  numa pasta só.
- Índice: um `fotos.json` com a lista e os metadados, ou listar as pastas pela API a cada
  abertura.
- Miniaturas: gerar no navegador e subir junto com a original, ou carregar sempre a
  original.
- Reduzir a imagem antes de subir ou guardar o arquivo original. A API de Contents recebe o
  arquivo em base64, o que pesa em foto grande, e o GitHub recomenda repositório abaixo de
  1 GB.
- Hospedagem do app: GitHub Pages em repositório privado exige plano pago. Confirmar como o
  `beba-agua` é servido hoje e repetir.
- Escopo do MVP: só subir e ver, ou também apagar, álbuns e baixar.
