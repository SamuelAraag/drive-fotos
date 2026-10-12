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
      imagem.alt = ''; // o nome acessível já está no botão
      imagem.decoding = 'async';
      imagem.src = url;
      quadro.classList.remove('grade__quadro--carregando');
      quadro.querySelector('.grade__botao').append(imagem);
    },
    () => marcarSemMiniatura(quadro, foto),
  );
}

// Foto sem miniatura, ou miniatura que não baixou: quadro neutro. Ela ainda abre pelo botão.
function marcarSemMiniatura(quadro, foto) {
  quadro.classList.remove('grade__quadro--carregando');
  quadro.classList.add('grade__quadro--vazio');
  quadro.querySelector('.grade__botao').setAttribute('aria-label', `${descricaoDaFoto(foto)}, sem miniatura`);
}

// A foto que acabou de subir
//
// Três comportamentos, escolhidos pelo lugar onde a foto cai:
// - na tela: ela sai da zona de envio e desce em pêndulo até o lugar dela;
// - fora da tela: entra em silêncio e um atalho aparece embaixo, para ir até ela;
// - ao pousar ou ao chegar pelo atalho: o foco, com as vizinhas esmaecidas por um instante.
// A página nunca rola sozinha, e nada aqui é esperado pela fila de envio.

const semMovimento = matchMedia('(prefers-reduced-motion: reduce)');
const SUAVE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const TEMPO_DO_HOLOFOTE = 900;

let destaqueId = null; // a foto marcada com contorno e selo
let distantes = []; // ids das fotos que subiram fora da tela, à espera do atalho
let voo = null; // pêndulo em andamento: { encerrar }
let fotosPorId = new Map();
let baixarAtual = null;

const quadroDe = (id) => $('grade').querySelector(`[data-id="${id}"]`);
const podeAnimar = () => !semMovimento.matches && !document.hidden;

function animar(no, quadros, opcoes) {
  return no.animate(quadros, { easing: SUAVE, ...opcoes });
}

// Contorno e selo ficam; a entrada e o halo acontecem só quando a foto acaba de chegar.
function marcarDestaque(quadro, chegando) {
  quadro.classList.add('grade__quadro--destaque');
  quadro.classList.toggle('grade__quadro--pousou', chegando);
  if (!quadro.querySelector('.grade__selo')) quadro.append(el('span', 'grade__selo', 'Enviada agora'));
}

function destacar(id, { comFoco }) {
  const antigo = destaqueId == null ? null : quadroDe(destaqueId);
  if (antigo && destaqueId !== id) {
    antigo.classList.remove('grade__quadro--destaque', 'grade__quadro--pousou');
    antigo.querySelector('.grade__selo')?.remove();
  }
  destaqueId = id;
  const quadro = quadroDe(id);
  if (!quadro) return;
  marcarDestaque(quadro, true);
  if (!comFoco) return;
  // Foco: as vizinhas recuam por um instante e o teclado vai para a foto.
  quadro.querySelector('.grade__botao').focus({ preventScroll: true });
  if (!podeAnimar()) return;
  $('grade').classList.add('dias--holofote');
  setTimeout(() => $('grade').classList.remove('dias--holofote'), TEMPO_DO_HOLOFOTE);
}

function estaNaTela(quadro) {
  const caixa = quadro.getBoundingClientRect();
  const visivel = Math.min(caixa.bottom, innerHeight) - Math.max(caixa.top, 0);
  return visivel >= caixa.height / 2;
}

function encerrarVoo() {
  voo?.encerrar();
}

// A foto sai da zona e desce balançando até o lugar dela. O lugar já existe na grade e as
// vizinhas já abriram espaço; só a foto ainda não chegou.
function pendulo(id, aoPousar) {
  const quadro = quadroDe(id);
  const destino = quadro.getBoundingClientRect();
  const zona = $('zona').getBoundingClientRect();
  // Se a zona já saiu da tela, a foto entra pelo topo, na direção de onde a zona está.
  const origemX = zona.left + zona.width / 2 - destino.width / 2;
  const origemY = Math.max(zona.top + zona.height / 2 - destino.height / 2, -destino.height);

  const fantasma = el('div', 'voo');
  fantasma.style.width = `${destino.width}px`;
  fantasma.style.height = `${destino.height}px`;
  const foto = fotosPorId.get(id);
  if (foto?.miniatura) {
    baixarAtual(foto.miniatura).then(
      (url) => {
        const imagem = el('img', 'grade__imagem');
        imagem.alt = '';
        imagem.src = url;
        fantasma.append(imagem);
      },
      () => {},
    );
  }
  document.body.append(fantasma);
  quadro.style.visibility = 'hidden';

  const distancia = Math.hypot(destino.left - origemX, destino.top - origemY);
  const em = (fracao) =>
    `translate(${origemX + (destino.left - origemX) * fracao}px, ${origemY + (destino.top - origemY) * fracao}px)`;
  // O balanço perde força a cada ida e volta, até a foto chegar reta.
  const animacao = animar(
    fantasma,
    [
      { transform: `${em(0)} rotate(0deg) scale(0.5)`, opacity: 0 },
      { transform: `${em(0.18)} rotate(-16deg) scale(0.7)`, opacity: 1, offset: 0.18 },
      { transform: `${em(0.45)} rotate(11deg) scale(0.85)`, offset: 0.45 },
      { transform: `${em(0.7)} rotate(-6deg) scale(0.95)`, offset: 0.7 },
      { transform: `${em(0.88)} rotate(3deg) scale(1)`, offset: 0.88 },
      { transform: `${em(1)} rotate(0deg) scale(1)` },
    ],
    { duration: Math.min(1100, Math.max(650, distancia * 1.1)), easing: 'ease-in-out' },
  );

  // Encerrar vale para o pouso normal e para o corte: outra foto chegou ou a grade foi redesenhada.
  const esteVoo = {
    encerrar() {
      if (voo !== esteVoo) return;
      voo = null;
      animacao.cancel();
      fantasma.remove();
      const pouso = quadroDe(id);
      if (pouso) pouso.style.visibility = '';
      aoPousar();
    },
  };
  voo = esteVoo;
  animacao.finished.then(esteVoo.encerrar, () => {});
}

// Chamado pelo app quando uma foto termina de subir, logo depois de redesenhar a grade.
export function fotoChegou(id, { ultimaDaLeva }) {
  encerrarVoo();
  const quadro = quadroDe(id);
  if (!quadro) return;
  if (!estaNaTela(quadro)) {
    distantes.push(id);
    renderAtalho();
    return;
  }
  // Na tela, a foto recém-pousada toma o lugar de qualquer atalho pendente como a mais recente.
  const pousar = () => destacar(id, { comFoco: ultimaDaLeva });
  if (podeAnimar()) pendulo(id, pousar);
  else pousar();
}

// Rola até o quadro e só devolve quando a rolagem parou.
async function rolarAte(id) {
  quadroDe(id)?.scrollIntoView({ block: 'center', behavior: semMovimento.matches ? 'auto' : 'smooth' });
  let ultimo = null;
  let parado = 0;
  for (let voltas = 0; parado < 4 && voltas < 60; voltas++) {
    await new Promise((resolver) => setTimeout(resolver, 40));
    const topo = quadroDe(id)?.getBoundingClientRect().top ?? null;
    parado = topo === ultimo ? parado + 1 : 0;
    ultimo = topo;
  }
}

function renderAtalho() {
  const barra = $('atalho');
  barra.hidden = distantes.length === 0;
  if (distantes.length === 0) return;
  const varias = distantes.length > 1;
  $('atalho-texto').textContent = varias ? `${distantes.length} fotos enviadas` : 'Foto enviada';
  $('atalho-ver').textContent = varias ? 'Ver a última' : 'Ver foto';
  const foto = fotosPorId.get(distantes.at(-1));
  const moldura = $('atalho-foto');
  moldura.replaceChildren();
  if (foto?.miniatura) {
    baixarAtual(foto.miniatura).then(
      (url) => {
        const imagem = el('img', 'grade__imagem');
        imagem.alt = '';
        imagem.src = url;
        moldura.replaceChildren(imagem);
      },
      () => {},
    );
  }
}

async function verPeloAtalho() {
  const id = distantes.at(-1);
  distantes = [];
  renderAtalho();
  if (id == null) return;
  await rolarAte(id);
  destacar(id, { comFoco: true });
}

function fecharAtalho() {
  distantes = [];
  renderAtalho();
}

// Ao sair: nada da sessão anterior fica marcado.
export function esquecerEnvio() {
  encerrarVoo();
  destaqueId = null;
  distantes = [];
  renderAtalho();
  $('grade').classList.remove('dias--holofote');
}

export function limparPrincipal() {
  observador?.disconnect();
  observador = null;
  $('grade').replaceChildren();
}

// Guarda onde cada foto e cada título estavam, para deslizar até o lugar novo depois do
// redesenho em vez de pular. Só o que está perto da tela: o resto ninguém vê se mexer.
function posicoesVisiveis() {
  const posicoes = new Map();
  if (!podeAnimar()) return posicoes;
  for (const no of $('grade').querySelectorAll('[data-id], [data-dia]')) {
    const caixa = no.getBoundingClientRect();
    if (caixa.bottom < -innerHeight || caixa.top > innerHeight * 2) continue;
    posicoes.set(no.dataset.id ?? `dia:${no.dataset.dia}`, caixa);
  }
  return posicoes;
}

function deslizarDe(posicoes) {
  for (const no of $('grade').querySelectorAll('[data-id], [data-dia]')) {
    const de = posicoes.get(no.dataset.id ?? `dia:${no.dataset.dia}`);
    if (!de) continue;
    const para = no.getBoundingClientRect();
    const dx = de.left - para.left;
    const dy = de.top - para.top;
    if (dx || dy) animar(no, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 300 });
  }
}

export function renderPrincipal(grupos, total, baixar) {
  encerrarVoo(); // os quadros vão ser trocados: um voo em curso pousa agora
  const posicoes = posicoesVisiveis();
  limparPrincipal();
  baixarAtual = baixar;
  fotosPorId = new Map(grupos.flatMap((grupo) => grupo.fotos).map((foto) => [foto.id, foto]));
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
    const titulo = el('h3', 'dia__titulo', tituloDoDia(grupo.dia));
    titulo.dataset.dia = grupo.dia;
    secao.append(titulo);
    const lista = el('ul', 'grade');
    for (const foto of grupo.fotos) {
      const quadro = el('li', 'grade__quadro');
      quadro.dataset.id = foto.id;
      const botao = el('button', 'grade__botao');
      botao.type = 'button';
      botao.setAttribute('aria-label', descricaoDaFoto(foto));
      quadro.append(botao);
      if (foto.id === destaqueId) marcarDestaque(quadro, false);
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
  deslizarDe(posicoes);
}

// Foto aberta
//
// A foto abre em tela cheia por cima da grade. A miniatura entra na hora, como prévia, e a
// original toma o lugar dela quando termina de baixar.

let noVisor = null; // id da foto que o visor está mostrando
let prontaNoVisor = null; // id da foto cuja original já está na tela

export function visorAberto() {
  return $('visor').open;
}

export function abrirVisor() {
  if (!$('visor').open) $('visor').showModal();
}

export function fecharVisor() {
  if ($('visor').open) $('visor').close();
}

// Depois de fechar, o foco volta para a foto que estava aberta, e ela fica à vista.
export function voltarParaAFoto(id) {
  const botao = quadroDe(id)?.querySelector('.grade__botao');
  if (!botao) return;
  botao.focus({ preventScroll: true });
  botao.scrollIntoView({ block: 'nearest' });
}

export function renderVisor(foto, { posicao, total, temAnterior, temProxima }) {
  noVisor = foto.id;
  prontaNoVisor = null;
  const imagem = $('visor-imagem');
  imagem.hidden = true;
  imagem.removeAttribute('src');
  imagem.alt = descricaoDaFoto(foto);
  imagem.classList.add('visor__imagem--previa');
  $('visor-legenda').textContent = descricaoDaFoto(foto).replace('Foto de ', '');
  $('visor-posicao').textContent = `${posicao} de ${total}`;
  $('visor-anterior').disabled = !temAnterior;
  $('visor-proxima').disabled = !temProxima;
  $('visor-erro').hidden = true;
  $('visor-carregando').hidden = false;
  if (!foto.miniatura) return;
  baixarAtual(foto.miniatura).then(
    (url) => {
      // A original pode ter chegado antes, ou a pessoa pode já ter passado para outra foto.
      if (noVisor !== foto.id || prontaNoVisor === foto.id) return;
      imagem.src = url;
      imagem.hidden = false;
    },
    () => {},
  );
}

export function mostrarOriginal(foto, url) {
  prontaNoVisor = foto.id;
  const imagem = $('visor-imagem');
  imagem.classList.remove('visor__imagem--previa');
  imagem.src = url;
  imagem.hidden = false;
  $('visor-carregando').hidden = true;
}

export function erroNoVisor(mensagem, { podeTentar }) {
  $('visor-carregando').hidden = true;
  $('visor-erro').hidden = false;
  $('visor-erro-texto').textContent = mensagem;
  $('visor-tentar').hidden = !podeTentar;
}

function ligarVisor(acoes) {
  const visor = $('visor');
  $('grade').addEventListener('click', (evento) => {
    const quadro = evento.target.closest('.grade__botao')?.closest('[data-id]');
    if (quadro) acoes.abrirFoto(quadro.dataset.id);
  });
  $('visor-fechar').addEventListener('click', () => visor.close());
  $('visor-anterior').addEventListener('click', () => acoes.passarFoto(-1));
  $('visor-proxima').addEventListener('click', () => acoes.passarFoto(1));
  $('visor-tentar').addEventListener('click', acoes.recarregarFoto);
  visor.addEventListener('close', acoes.fotoFechada);
  visor.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowLeft') acoes.passarFoto(-1);
    if (evento.key === 'ArrowRight') acoes.passarFoto(1);
  });
  // O navegador não soube decodificar a original (HEIC fora do Safari, por exemplo).
  $('visor-imagem').addEventListener('error', () => {
    if (prontaNoVisor == null) return;
    $('visor-imagem').hidden = true;
    erroNoVisor('Este navegador não consegue mostrar o formato desta foto.', { podeTentar: false });
  });

  // Deslizar no celular passa de foto. Só conta o gesto mais horizontal que vertical.
  let inicio = null;
  visor.addEventListener('pointerdown', (evento) => {
    inicio = evento.pointerType === 'touch' ? { x: evento.clientX, y: evento.clientY } : null;
  });
  visor.addEventListener('pointerup', (evento) => {
    if (!inicio) return;
    const dx = evento.clientX - inicio.x;
    const dy = evento.clientY - inicio.y;
    inicio = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    acoes.passarFoto(dx < 0 ? 1 : -1);
  });
  visor.addEventListener('pointercancel', () => {
    inicio = null;
  });
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

let posicaoNaFila = ''; // "Enviando 2 de 5", repetido ao lado do percentual

// Chamado a cada avanço do envio, por isso mexe só na barra e no texto, sem redesenhar a fila.
// Nas duas pontas não há número para mostrar: antes do primeiro byte a foto ainda está sendo
// preparada, e com tudo enviado falta o GitHub fechar o commit. Aí a varredura de luz diz que
// está andando, para a barra parada não parecer travada.
export function renderProgresso(fracao) {
  const percentual = Math.round(fracao * 100);
  const fase = fracao <= 0 ? 'Preparando...' : fracao >= 0.95 && fracao < 1 ? 'Concluindo...' : `${percentual}%`;
  $('zona-barra-cheia').style.setProperty('--progresso', fracao);
  $('zona-barra').setAttribute('aria-valuenow', percentual);
  $('zona-detalhe').textContent = `${posicaoNaFila} · ${fase}`;
  $('zona').classList.toggle('zona--varrendo', fase.endsWith('...'));
}

// Não há histórico de envio: o que subiu aparece na grade, com a última em destaque.
// Aqui ficam só as fotos que falharam, porque elas precisam do "Tentar de novo".
export function renderFila(itens, situacao) {
  const atual = itens.find((item) => item.estado === 'enviando');
  const ocupada = Boolean(atual || situacao.pausadaAte);
  // A foto que está subindo ocupa a zona: o progresso fica junto da ação principal.
  $('zona-titulo').textContent = atual ? atual.arquivo.name : situacao.pausadaAte ? 'Envio em pausa' : TITULO_DA_ZONA;
  posicaoNaFila = atual ? resumoDaFila(itens, situacao) : '';
  $('zona-detalhe').textContent = ocupada ? resumoDaFila(itens, situacao) : DETALHE_DA_ZONA;
  $('zona-barra').hidden = !atual;
  if (atual) {
    $('zona-barra').setAttribute('aria-label', `Envio de ${atual.arquivo.name}`);
    renderProgresso(situacao.progresso);
  } else {
    $('zona').classList.remove('zona--varrendo');
  }

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
  $('atalho-ver').addEventListener('click', verPeloAtalho);
  $('atalho-fechar').addEventListener('click', fecharAtalho);
  ligarArraste(acoes);
  ligarVisor(acoes);

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
