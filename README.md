# Drive Fotos

App simples para guardar fotos, no mesmo molde do `beba-agua`: sem servidor, sem
build e sem dependências.

## Armazenamento

Este repositório só tem a interface. As fotos ficam em outro repositório, privado, de outra
conta do GitHub, e o app lê e grava nele pela API do GitHub. O plano está em
`docs/planos/plano-inicial.md` e os requisitos em `docs/requisitos.md`.

## Base oficial e base de testes

O repositório de dados tem duas branches:

- `main`: a base oficial. É a que o app usa quando está publicado.
- `testes`: a base de testes. É a que o app usa quando roda em `localhost`, e a tela mostra
  "base de testes" ao lado do nome.

A escolha é pelo endereço da página, em `src/github.js`. O mesmo token serve para as duas.

## Login

Você entra com um token pessoal do GitHub, que fica guardado só no navegador.

1. Na conta dona do repositório de dados, abra Settings > Developer settings > Personal
   access tokens > Fine-grained tokens.
2. Clique em "Generate new token" e dê acesso apenas ao repositório de dados.
3. Em Contents, escolha "Read and write".
4. Copie o token e cole na tela de login do app.

O botão "Sair" apaga o token e as fotos guardadas no navegador.

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
src/foto.js      id, miniatura e registro de cada foto
src/armazem.js   o que fica guardado no aparelho, para abrir sem esperar a rede
src/ui.js        telas
```

## Estado

Já dá para entrar com o token, enviar e organizar fotos por dia, abrir em tela cheia,
renomear, baixar e apagar.

Para apagar mais de uma foto, toque em **Selecionar** acima da grade, marque as fotos e toque
em **Apagar** na barra inferior. No celular, também dá para manter o dedo sobre uma foto para
iniciar a seleção. A caixa ao lado do título de cada dia marca ou desmarca todas as fotos
daquele dia. A remoção exige confirmação e grava todas as exclusões em um único commit.

As fotos apagadas deixam de aparecer no app, mas continuam no histórico do repositório e
ocupam espaço. A seleção em massa não oferece uma opção para marcar o acervo inteiro.
