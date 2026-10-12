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

function el(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto != null) no.textContent = texto;
  return no;
}

// '20261012' -> data local.
function dataDoDia(dia) {
  return new Date(Number(dia.slice(0, 4)), Number(dia.slice(4, 6)) - 1, Number(dia.slice(6, 8)));
}

function tituloDoDia(dia) {
  const data = dataDoDia(dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const distancia = Math.round((hoje - data) / 86400000);
  if (distancia === 0) return 'Hoje';
  if (distancia === 1) return 'Ontem';
  const formato = { weekday: 'long', day: 'numeric', month: 'long' };
  if (data.getFullYear() !== hoje.getFullYear()) formato.year = 'numeric';
  const texto = data.toLocaleDateString('pt-BR', formato);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function descricaoDaFoto(foto) {
  const dia = dataDoDia(foto.dia).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Foto de ${dia}, ${foto.hora.slice(0, 2)}:${foto.hora.slice(2, 4)}`;
}

let observador = null; // carrega a miniatura quando o quadro chega perto da tela
const baixarDoQuadro = new WeakMap();

function carregarQuadro(quadro) {
  const { foto, baixar } = baixarDoQuadro.get(quadro);
  baixar(foto.miniatura).then(
    (url) => {
      const imagem = el('img', 'grade__imagem');
      imagem.alt = descricaoDaFoto(foto);
      imagem.decoding = 'async';
      imagem.src = url;
      quadro.classList.remove('grade__quadro--carregando');
      quadro.append(imagem);
    },
    () => marcarSemMiniatura(quadro, foto),
  );
}

// Foto sem miniatura, ou miniatura que não baixou: quadro neutro, com o texto para o leitor de tela.
function marcarSemMiniatura(quadro, foto) {
  quadro.classList.remove('grade__quadro--carregando');
  quadro.classList.add('grade__quadro--vazio');
  quadro.append(el('span', 'so-leitor', `${descricaoDaFoto(foto)}, sem miniatura`));
}

export function limparPrincipal() {
  observador?.disconnect();
  observador = null;
  $('grade').replaceChildren();
}

export function renderPrincipal(grupos, total, baixar) {
  limparPrincipal();
  $('principal-vazia').hidden = total > 0;
  $('principal-total').hidden = total === 0;
  $('principal-total').textContent = total === 1 ? '1 foto' : `${total.toLocaleString('pt-BR')} fotos`;

  observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        observador.unobserve(entrada.target);
        carregarQuadro(entrada.target);
      }
    },
    { rootMargin: '400px 0px' },
  );

  for (const grupo of grupos) {
    const secao = el('section', 'dia');
    secao.append(el('h3', 'dia__titulo', tituloDoDia(grupo.dia)));
    const lista = el('ul', 'grade');
    for (const foto of grupo.fotos) {
      const quadro = el('li', 'grade__quadro');
      if (foto.miniatura) {
        quadro.classList.add('grade__quadro--carregando');
        baixarDoQuadro.set(quadro, { foto, baixar });
        observador.observe(quadro);
      } else {
        marcarSemMiniatura(quadro, foto);
      }
      lista.append(quadro);
    }
    secao.append(lista);
    $('grade').append(secao);
  }
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
