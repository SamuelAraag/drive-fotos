# Preferências do repositório

Convenções do Drive Fotos. Valem para qualquer pessoa ou agente que mexa no código.

## Comentários

* **Nunca escrever comentários no código.** Vale para HTML, CSS e JS. O código já basta: nada
  de explicar o que ele faz, por que foi escolhido ou qual problema motivou.
* Se a explicação importa, o lugar dela é a mensagem de commit, o corpo do PR ou o plano em
  `docs/planos/plano-inicial.md`.
* Os comentários que existiam saíram no Épico 15. O que eles diziam está no histórico do git.

## Textos para pessoas

* Todo texto escrito para uma pessoa ler passa pelo humanizer: título e corpo de PR, entradas
  de `src/novidades.dados.js` e qualquer texto visível no app (avisos, erros, rótulos,
  diálogos). Cada frase diz um fato, sem travessão, sem adjetivo de venda e sem repetir o
  título. Número só quando foi medido.
* Não vale para nomes no código nem para mensagens de commit, que seguem o estilo curto do
  repositório.

## Idioma

* Nomes de funções, variáveis e arquivos em português do Brasil, como no resto do código.
