// Página de novidades: mostra o que entrou em cada versão. Aberta a qualquer pessoa, sem token.

import { NOVIDADES, VERSAO_ATUAL } from './novidades.dados.js';

const $ = (id) => document.getElementById(id);

function el(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto != null) no.textContent = texto;
  return no;
}

// "12 de outubro de 2026, 16:30"
function quandoEmTexto(quando) {
  return new Date(quando).toLocaleString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

$('novidades-atual').textContent = `Versão atual: ${VERSAO_ATUAL}`;
$('novidades-lista').replaceChildren(
  ...NOVIDADES.map(({ versao, quando, titulo, mudancas }) => {
    const item = el('li', 'novidades__item');
    const topo = el('div', 'novidades__topo');
    topo.append(el('span', 'etiqueta novidades__versao', `v${versao}`));
    if (versao === VERSAO_ATUAL) topo.append(el('span', 'etiqueta', 'atual'));
    const data = el('time', 'texto-suave texto-pequeno', quandoEmTexto(quando));
    data.dateTime = quando;
    topo.append(data);
    const lista = el('ul', 'novidades__mudancas');
    lista.append(...mudancas.map((mudanca) => el('li', null, mudanca)));
    item.append(topo, el('h2', 'novidades__titulo', titulo), lista);
    return item;
  }),
);
