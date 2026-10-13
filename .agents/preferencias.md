# Preferências do repositório

Convenções do Drive Fotos. Valem para qualquer pessoa ou agente que mexa no código.

## Comentários

* **Nunca escrever comentários no código.** Vale para HTML, CSS e JS. O código já basta: nada
  de explicar o que ele faz, por que foi escolhido ou qual problema motivou.
* Se a explicação importa, o lugar dela é a mensagem de commit, o corpo do PR ou o plano em
  `docs/planos/plano-inicial.md`.
* Os comentários que já existem saem no Épico 15. Até lá, não acrescentar nenhum.

## Novidades

* Toda entrada nova de `src/novidades.dados.js` passa pelo humanizer antes do commit: cada
  frase diz um fato a quem usa o app, sem travessão, sem adjetivo de venda e sem repetir o
  título. Número só quando foi medido.

## Idioma

* Nomes de funções, variáveis e arquivos em português do Brasil, como no resto do código.
