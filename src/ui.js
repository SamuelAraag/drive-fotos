// Telas.

import { fmtTamanho } from './foto.js';
import { BASE_DE_TESTES, REPO_DADOS, lerToken } from './github.js';

const $ = (id) => document.getElementById(id);

const TELAS = ['carregando', 'erro', 'principal'];

$('login-repo').textContent = REPO_DADOS;
$('base-de-testes').hidden = !BASE_DE_TESTES;

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
  // Curto, para caber em cima de um dia de uma foto só.
  const formato = { weekday: 'short', day: 'numeric', month: 'short' };
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
const jaMostradas = new Set(); // miniaturas que já surgiram uma vez: redesenhar a grade não anima de novo

function carregarQuadro(quadro) {
  const { foto, baixar } = baixarDoQuadro.get(quadro);
  baixar(foto.miniatura).then(
    (url) => {
      const imagem = el('img', jaMostradas.has(foto.miniatura) ? 'grade__imagem' : 'grade__imagem grade__imagem--nova');
      jaMostradas.add(foto.miniatura);
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

export function mostrarDestaque() {
  document.querySelector('.grade__quadro--destaque')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function limparPrincipal() {
  observador?.disconnect();
  observador = null;
  $('grade').replaceChildren();
}

export function renderPrincipal(grupos, total, baixar, destaque) {
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
      if (foto.id === destaque) {
        quadro.classList.add('grade__quadro--destaque');
        quadro.append(el('span', 'grade__selo', 'Enviada agora'));
      }
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

// Envio

export function erroNaZona(mensagem) {
  $('zona-erro').hidden = !mensagem;
  $('zona-erro').textContent = mensagem ?? '';
}

function resumoDaFila(itens, { enviando, pausadaAte }) {
  const concluidos = itens.filter((item) => item.estado === 'concluido').length;
  const comErro = itens.filter((item) => item.estado === 'erro').length;
  if (pausadaAte) {
    const hora = pausadaAte.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `O GitHub limitou o ritmo. O envio continua sozinho às ${hora}.`;
  }
  if (enviando) {
    // Conta também as que falharam, para o número não andar para trás depois de um erro.
    return `Enviando ${Math.min(itens.length, concluidos + comErro + 1)} de ${itens.length}`;
  }
  return '';
}

const TITULO_DA_ZONA = $('zona-titulo').textContent;
const DETALHE_DA_ZONA = $('zona-detalhe').textContent;

// Não há histórico de envio: o que subiu aparece na grade, com a última em destaque.
// Aqui ficam só as fotos que falharam, porque elas precisam do "Tentar de novo".
export function renderFila(itens, situacao) {
  const atual = itens.find((item) => item.estado === 'enviando');
  const ocupada = Boolean(atual || situacao.pausadaAte);
  // A foto que está subindo ocupa a zona: o progresso fica junto da ação principal.
  $('zona').classList.toggle('zona--enviando', Boolean(atual));
  $('zona-titulo').textContent = atual ? atual.arquivo.name : situacao.pausadaAte ? 'Envio em pausa' : TITULO_DA_ZONA;
  $('zona-detalhe').textContent = ocupada ? resumoDaFila(itens, situacao) : DETALHE_DA_ZONA;

  const falhas = itens.filter((item) => item.estado === 'erro');
  $('fila').hidden = falhas.length === 0;
  $('fila-resumo').textContent = falhas.length === 1 ? '1 foto não subiu' : `${falhas.length} fotos não subiram`;
  const linhas = falhas.map((item) => {
    const linha = el('li', 'fila__item');
    const texto = el('div', 'fila__texto');
    texto.append(el('span', 'fila__nome', item.arquivo.name));
    texto.append(el('span', 'fila__estado', `${fmtTamanho(item.arquivo.size)} · ${item.mensagem}`));
    const botao = el('button', 'botao botao--fantasma', 'Tentar de novo');
    botao.type = 'button';
    botao.dataset.n = item.n;
    linha.append(texto, botao);
    return linha;
  });
  $('fila-lista').replaceChildren(...linhas);
}

// Texto para o leitor de tela quando a leva termina. Na tela, quem conta é o destaque na grade.
export function anunciarEnvio(texto) {
  $('envio-status').textContent = texto;
}

// Arrastar e soltar. Os ouvintes ficam na janela: soltar em qualquer canto da página envia.
function ligarArraste(acoes) {
  // dragleave dispara a cada elemento que o ponteiro cruza. O contador só desliga o véu no zero.
  let contador = 0;
  const veu = $('veu');
  // Arrastar texto ou link também dispara os eventos: só arquivo interessa.
  const ehArquivo = (evento) => evento.dataTransfer?.types?.includes('Files') ?? false;
  const mostrar = (ativo) => {
    if (ativo && veu.hidden) {
      // O véu nasce do retângulo da zona e cresce até a tela, para a origem do gesto ficar visível.
      const caixa = $('zona').getBoundingClientRect();
      if (caixa.width > 0) {
        veu.style.setProperty('--zona-x', `${caixa.left}px`);
        veu.style.setProperty('--zona-y', `${caixa.top}px`);
        veu.style.setProperty('--zona-escala-x', caixa.width / window.innerWidth);
        veu.style.setProperty('--zona-escala-y', caixa.height / window.innerHeight);
      }
    }
    veu.hidden = !ativo;
    $('zona').classList.toggle('zona--ativa', ativo);
  };

  window.addEventListener('dragenter', (evento) => {
    if (!ehArquivo(evento)) return;
    evento.preventDefault();
    contador++;
    if (acoes.podeEnviar()) mostrar(true);
  });
  // Sem o preventDefault aqui o navegador abre a foto numa aba em vez de entregar o drop.
  window.addEventListener('dragover', (evento) => {
    if (ehArquivo(evento)) evento.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    contador = Math.max(0, contador - 1);
    if (contador === 0) mostrar(false);
  });
  window.addEventListener('drop', (evento) => {
    if (!ehArquivo(evento)) return;
    evento.preventDefault();
    contador = 0;
    mostrar(false);
    if (!acoes.podeEnviar()) return;
    // Pasta chega como arquivo de tamanho zero; webkitGetAsEntry conta a verdade.
    const temPasta = [...(evento.dataTransfer.items ?? [])].some((item) => item.webkitGetAsEntry?.()?.isDirectory);
    acoes.arquivos([...evento.dataTransfer.files], { temPasta });
  });
  window.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape' || veu.hidden) return;
    contador = 0;
    mostrar(false);
  });
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
  const entrada = $('zona-entrada');
  $('zona').addEventListener('click', () => entrada.click());
  entrada.addEventListener('change', () => {
    acoes.arquivos([...entrada.files]);
    entrada.value = ''; // sem isso, escolher a mesma foto de novo não dispara o change
  });
  $('fila-lista').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button');
    if (botao) acoes.tentarDeNovo(Number(botao.dataset.n));
  });
  $('fila-limpar').addEventListener('click', acoes.limparFila);
  ligarArraste(acoes);

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
