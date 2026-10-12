// Telas.

import { REPO_DADOS, lerToken } from './github.js';

const $ = (id) => document.getElementById(id);

const TELAS = ['carregando', 'erro', 'principal'];

$('login-repo').textContent = REPO_DADOS;

export function mostrarTela(nome) {
  for (const tela of TELAS) $(`tela-${tela}`).hidden = tela !== nome;
  $('sair').hidden = !lerToken();
}

export function focarTela(nome) {
  $(`tela-${nome}`).querySelector('h2').focus();
}

export function renderErro(mensagem) {
  $('erro-mensagem').textContent = mensagem;
}

export function renderPrincipal(fotos) {
  const total = fotos.length;
  $('principal-vazia').hidden = total > 0;
  $('principal-total').hidden = total === 0;
  $('principal-total').textContent = total === 1 ? '1 foto guardada.' : `${total.toLocaleString('pt-BR')} fotos guardadas.`;
}

export function abrirLogin(mensagem) {
  const dialogo = $('login');
  if ($('confirmar-sair').open) $('confirmar-sair').close('cancelar');
  $('login-cancelar').hidden = !lerToken();
  $('login-token').value = '';
  erroNoLogin(mensagem ?? null);
  if (!dialogo.open) dialogo.showModal();
  $('login-token').focus();
}

export function fecharLogin() {
  $('login').close();
}

export function erroNoLogin(mensagem) {
  const erro = $('login-erro');
  erro.hidden = !mensagem;
  erro.textContent = mensagem ?? '';
  $('login-token').setAttribute('aria-invalid', String(Boolean(mensagem)));
}

export function loginOcupado(ocupado) {
  $('login-entrar').disabled = ocupado;
  $('login-entrar').textContent = ocupado ? 'Verificando...' : 'Entrar';
}

export function ligarEventos(acoes) {
  // Sair apaga o token, que o GitHub não mostra de novo: confirma antes.
  const confirmarSair = $('confirmar-sair');
  $('sair').addEventListener('click', () => confirmarSair.showModal());
  confirmarSair.addEventListener('click', (evento) => {
    if (evento.target === confirmarSair) confirmarSair.close('cancelar');
  });
  confirmarSair.querySelector('form').addEventListener('submit', (evento) => {
    if (evento.submitter?.value === 'sair') acoes.sair();
  });
  $('erro-recarregar').addEventListener('click', acoes.recarregar);
  $('erro-trocar-token').addEventListener('click', acoes.trocarToken);
  $('login-form').addEventListener('submit', (evento) => {
    evento.preventDefault();
    acoes.entrar($('login-token').value.trim());
  });
  $('login-cancelar').addEventListener('click', fecharLogin);
  // Sem token não há nada atrás do modal: Esc não fecha.
  $('login').addEventListener('cancel', (evento) => {
    if (!lerToken()) evento.preventDefault();
  });
}
