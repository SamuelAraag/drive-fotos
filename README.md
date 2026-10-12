# Drive Fotos

App simples para guardar fotos, no mesmo molde do `beba-agua`: sem servidor, sem
build e sem dependências.

## Armazenamento

Este repositório só tem a interface. As fotos ficam em outro repositório, privado, de outra
conta do GitHub, e o app lê e grava nele pela API do GitHub. O plano está em
`docs/planos/plano-inicial.md` e os requisitos em `docs/requisitos.md`.

## Login

Você entra com um token pessoal do GitHub, que fica guardado só no navegador.

1. Na conta dona do repositório de dados, abra Settings > Developer settings > Personal
   access tokens > Fine-grained tokens.
2. Clique em "Generate new token" e dê acesso apenas ao repositório de dados.
3. Em Contents, escolha "Read and write".
4. Copie o token e cole na tela de login do app.

O botão "Sair" apaga o token do navegador.

## Rodar localmente

O app não tem build nem dependências. Na raiz do repositório, rode:

```
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

## Estrutura

```
index.html
manifest.webmanifest
icones/
src/style.css
src/app.js       estado, regras e eventos
src/github.js    leitura e gravação via API do GitHub
src/ui.js        telas
```

## Estado

Em construção. Já dá para entrar com o token e ver quantas fotos estão guardadas. A grade,
o envio e a foto aberta ainda não existem.
