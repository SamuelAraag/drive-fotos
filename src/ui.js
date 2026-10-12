// Telas.

import { analisar, diaEmTexto, fmtTamanho } from './foto.js';
import { BASE_DE_TESTES, REPO_DADOS, lerToken } from './github.js';

const $ = (id) => document.getElementById(id);

const TELAS = ['carregando', 'erro', 'principal', 'sem-data'];
const FIM_PUXAR = 64; // descida do conteúdo em que o anel enche; soltar daqui em diante atualiza

$('login-repo').textContent = REPO_DADOS;
$('base-de-testes').hidden = !BASE_DE_TESTES;

export function mostrarTela(nome) {
  for (const tela of TELAS) $(`tela-${tela}`).hidden = tela !== nome;
  $('sair').hidden = !lerToken();
  $('atualizar').hidden = !lerToken();
  // A pílula de uso mora fora da página e só faz sentido com a grade na tela.
  if (nome !== 'principal') $('uso').hidden = true;
}

// Botão "Atualizar", no molde do beba-agua: enquanto lê, diz que está lendo e não aceita outro toque.
export function atualizarOcupado(ocupado) {
  $('atualizar').disabled = ocupado;
  $('atualizar').textContent = ocupado ? 'Atualizando...' : 'Atualizar';
}

// "Atualizado às 14:02", ou vazio.
export function mostrarSincronia(texto) {
  $('sincronia').textContent = texto;
}

// A releitura pedida pela pessoa avisa quando falha, com o motivo e a saída ao lado.
export function erroAoAtualizar(mensagem) {
  $('atualizar-erro').hidden = !mensagem;
  $('atualizar-erro-texto').textContent = mensagem ?? '';
}

// Puxar para atualizar, como nos apps do iPhone e no beba-agua: no topo da página, arrasta
// para baixo e solta. O conteúdo desce junto com o dedo, sem trava, até onde a pessoa arrastar,
// e no vão um anel enche de 0 a 100%. Com o anel cheio, soltar atualiza: o conteúdo volta para a
// altura do anel e ele gira até `aoSoltar` terminar.
function ligarPuxar(aoSoltar, podePuxarAgora) {
  const raiz = document.documentElement;
  let inicio = null;
  let distancia = 0;
  let recarregando = false;

  const definir = (px) => {
    distancia = px;
    raiz.style.setProperty('--puxar', `${px}px`);
    const progresso = Math.min(1, px / FIM_PUXAR);
    raiz.style.setProperty('--puxar-progresso', progresso);
    $('puxar-arco').style.strokeDashoffset = 100 - progresso * 100;
    $('puxar').classList.toggle('puxar--cheio', px >= FIM_PUXAR);
  };

  addEventListener(
    'touchstart',
    (evento) => {
      const podePuxar =
        !recarregando && evento.touches.length === 1 && scrollY <= 0 && !document.querySelector('dialog[open]') && podePuxarAgora();
      inicio = podePuxar ? evento.touches[0].clientY : null;
      raiz.classList.remove('puxar-soltando');
    },
    { passive: true },
  );

  addEventListener(
    'touchmove',
    (evento) => {
      if (inicio == null) return;
      const arrasto = evento.touches[0].clientY - inicio;
      if (arrasto <= 0 || scrollY > 0) {
        if (distancia) definir(0);
        return;
      }
      // Segura o elástico nativo para o conteúdo seguir só o nosso deslocamento.
      if (evento.cancelable) evento.preventDefault();
      // Metade do caminho do dedo: dá a resistência de elástico, sem parar em lugar nenhum.
      definir(arrasto / 2);
    },
    { passive: false },
  );

  addEventListener('touchend', () => {
    if (inicio == null) return;
    inicio = null;
    raiz.classList.add('puxar-soltando');
    if (distancia < FIM_PUXAR) {
      definir(0);
      return;
    }
    recarregando = true;
    definir(FIM_PUXAR); // de onde estiver, o conteúdo sobe até a altura do anel e espera ali
    $('puxar-arco').style.strokeDashoffset = 25;
    $('puxar').classList.add('puxar--recarregando');
    Promise.resolve(aoSoltar()).finally(() => {
      recarregando = false;
      $('puxar').classList.remove('puxar--recarregando');
      definir(0);
    });
  });

  addEventListener('touchcancel', () => {
    inicio = null;
    if (!recarregando) definir(0);
  });
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
let observadorDaTela = null; // avisa o app de quais fotos estão de fato na tela
let avisarVisibilidade = () => {};
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
let atalhoDeRepetidas = false; // o atalho fala de repetidas que não subiram, e não de fotos que chegaram
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
    // Foto que chega toma o atalho de um aviso de repetidas que ainda estivesse aberto.
    if (atalhoDeRepetidas) distantes = [];
    atalhoDeRepetidas = false;
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
  if (atalhoDeRepetidas) {
    // Curto de propósito: o atalho é estreito, e o diálogo acabou de dizer que eram repetidas.
    $('atalho-texto').textContent = varias ? `${distantes.length} não enviadas` : 'Não enviada';
    $('atalho-ver').textContent = varias ? 'Ver a última' : 'Ver a guardada';
  } else {
    $('atalho-texto').textContent = varias ? `${distantes.length} fotos enviadas` : 'Foto enviada';
    $('atalho-ver').textContent = varias ? 'Ver a última' : 'Ver foto';
  }
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
  const repetida = atalhoDeRepetidas;
  fecharAtalho();
  if (id == null) return;
  await rolarAte(id);
  // A guardada não acabou de chegar: só recebe o foco, sem o selo de "Enviada agora".
  if (repetida) quadroDe(id)?.querySelector('.grade__botao')?.focus({ preventScroll: true });
  else destacar(id, { comFoco: true });
}

function fecharAtalho() {
  distantes = [];
  atalhoDeRepetidas = false;
  renderAtalho();
}

// Depois de "Não enviar": o atalho diz que nada subiu e leva até a foto que já estava guardada.
export function repetidasNaoEnviadas(ids) {
  if (ids.length === 0) return;
  distantes = ids;
  atalhoDeRepetidas = true;
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
  observadorDaTela?.disconnect();
  observadorDaTela = null;
  avisarVisibilidade(null); // os quadros vão ser trocados: o que estava na tela deixa de valer
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

const AVISO_DE_ESPACO = 4 * 1024 * 1024 * 1024;

// Só avisa, não bloqueia: o teto recomendado pelo GitHub é de 5 GB por repositório.
function renderEspaco(espaco) {
  const aviso = $('principal-espaco');
  aviso.hidden = espaco <= AVISO_DE_ESPACO;
  aviso.textContent = `As fotos já ocupam ${fmtTamanho(espaco)}, perto dos 5 GB que o GitHub recomenda por repositório. Apagar fotos não libera espaço: faça a cópia de segurança antes de enviar mais.`;
}

export function renderPrincipal(grupos, { total, espaco }, baixar) {
  encerrarVoo(); // os quadros vão ser trocados: um voo em curso pousa agora
  const posicoes = posicoesVisiveis();
  limparPrincipal();
  baixarAtual = baixar;
  fotosPorId = new Map(grupos.flatMap((grupo) => grupo.fotos).map((foto) => [foto.id, foto]));
  $('principal-vazia').hidden = total > 0;
  // Sem fotos a pílula de uso some: "0 MB" não diz nada que a tela vazia já não diga.
  $('uso').hidden = total === 0;
  $('uso-valor').textContent = `${fmtTamanho(espaco)} usados`;
  $('uso-detalhe').textContent = total === 1 ? '1 foto' : `${total.toLocaleString('pt-BR')} fotos`;
  renderEspaco(espaco);

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
  // Sem margem e com metade do quadro à vista: é o que a pessoa pode tocar agora.
  observadorDaTela = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) avisarVisibilidade(entrada.target.dataset.id, entrada.isIntersecting);
    },
    { threshold: 0.5 },
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
      if (foto.id === foraDaGrade) quadro.style.visibility = 'hidden';
      if (foto.miniatura) {
        quadro.classList.add('grade__quadro--carregando');
        baixarDoQuadro.set(quadro, { foto, baixar });
        observador.observe(quadro);
      } else {
        marcarSemMiniatura(quadro, foto);
      }
      observadorDaTela.observe(quadro);
      lista.append(quadro);
    }
    secao.append(lista);
    $('grade').append(secao);
  }
  deslizarDe(posicoes);
}

// Foto aberta
//
// A foto vira o ambiente: a miniatura dela, desfocada, cobre o fundo. A foto cresce do quadro
// da grade até o lugar final e volta para ele ao fechar. A miniatura entra na hora, nítida e
// no tamanho certo, e a original aparece por cima dela quando termina de baixar.
// Em tela larga, um painel ao lado mostra os dados da foto, e dá para escondê-lo.

const CHAVE_PAINEL = 'drive-fotos.painel';
const telaLarga = matchMedia('(min-width: 900px)');

let noVisor = null; // id da foto que o visor está mostrando
let prontaNoVisor = null; // id da foto cuja original já está na tela
let proporcaoNoVisor = null; // [largura, altura] da foto aberta, quando já se sabe
let ficha = null; // o que o painel mostra: { foto, posicao, total, nome, temNome, largura, altura }
let foraDaGrade = null; // id da foto cuja miniatura "saiu" da grade para o visor
let camadaDoAmbiente = 0;
let fechando = false;
const analises = new Map(); // sha da miniatura -> { paleta, luminancia }

const cromo = () => [$('visor-topo'), $('visor-anterior'), $('visor-proxima'), $('visor-painel'), $('visor-rodape')];

export function visorAberto() {
  return $('visor').open;
}

// O painel abre como ficou da última vez. Só existe em tela larga.
function painelPreferido() {
  try {
    return localStorage.getItem(CHAVE_PAINEL) !== '0';
  } catch {
    return true;
  }
}

function aplicarPainel() {
  const aberto = telaLarga.matches && painelPreferido();
  $('visor-painel').hidden = !aberto;
  $('visor-info').setAttribute('aria-pressed', String(aberto));
  ajustarFoto();
}

function alternarPainel() {
  if (!telaLarga.matches) return;
  try {
    localStorage.setItem(CHAVE_PAINEL, painelPreferido() ? '0' : '1');
  } catch {
    return; // sem onde guardar a escolha, o painel fica como está
  }
  aplicarPainel();
}

// Dá à caixa da foto o maior tamanho que cabe no palco, na proporção dela.
function ajustarFoto() {
  const caixa = $('visor-foto');
  if (!proporcaoNoVisor) {
    caixa.style.width = '';
    caixa.style.height = '';
    return;
  }
  const palco = $('visor-palco');
  const [largura, altura] = proporcaoNoVisor;
  const escala = Math.min(palco.clientWidth / largura, palco.clientHeight / altura);
  caixa.style.width = `${Math.round(largura * escala)}px`;
  caixa.style.height = `${Math.round(altura * escala)}px`;
}

function trocarAmbiente(url) {
  const camadas = $('visor-ambiente').querySelectorAll('.visor__desfoque');
  camadas[camadaDoAmbiente].classList.remove('visor__desfoque--visivel');
  if (!url) return; // foto sem miniatura: fica só o fundo liso
  camadaDoAmbiente = 1 - camadaDoAmbiente;
  camadas[camadaDoAmbiente].src = url;
  camadas[camadaDoAmbiente].classList.add('visor__desfoque--visivel');
}

function tirarDaGrade(id) {
  devolverParaAGrade();
  const quadro = quadroDe(id);
  if (quadro) quadro.style.visibility = 'hidden';
  foraDaGrade = id;
}

function devolverParaAGrade() {
  const quadro = foraDaGrade == null ? null : quadroDe(foraDaGrade);
  if (quadro) quadro.style.visibility = '';
  foraDaGrade = null;
}

// De onde a foto parte e para onde volta: o quadro dela na grade, visto pela foto aberta.
// A miniatura é um corte quadrado ao centro, e o recorte some conforme a foto cresce.
function medirPartida(quadro) {
  const origem = quadro.getBoundingClientRect();
  const destino = $('visor-foto').getBoundingClientRect();
  const escala = origem.width / Math.min(destino.width, destino.height);
  const sobraX = Math.max(0, (destino.width - destino.height) / 2);
  const sobraY = Math.max(0, (destino.height - destino.width) / 2);
  const dx = origem.left + origem.width / 2 - (destino.left + destino.width / 2);
  const dy = origem.top + origem.height / 2 - (destino.top + destino.height / 2);
  return {
    quadro: { transform: `translate(${dx}px, ${dy}px) scale(${escala})`, clipPath: `inset(${sobraY}px ${sobraX}px)` },
    inteira: { transform: 'none', clipPath: 'inset(0px 0px)' },
  };
}

function proporcaoEmTexto(largura, altura) {
  const mdc = (a, b) => (b ? mdc(b, a % b) : a);
  const divisor = mdc(largura, altura);
  const [a, b] = [largura / divisor, altura / divisor];
  if (a <= 32 && b <= 32) return `${a}:${b}`;
  return `${(largura / altura).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}:1`;
}

const ORIGEM_DA_DATA = { nome: 'pelo nome do arquivo', informada: 'informada no envio', envio: 'data do envio' };

function renderFicha() {
  const { foto, posicao, total, nome, temNome, largura, altura, origem, enviadaEm } = ficha;
  $('painel-tipo').textContent = `${(foto.ext ?? 'foto').toUpperCase()} · ${posicao} de ${total}`;
  // O nome vem do registro, que pode demorar um instante. Foto sem registro mostra o id.
  $('painel-nome').textContent = nome ?? (temNome ? foto.id : 'Carregando o nome...');
  const linhas = [];
  if (largura && altura) {
    linhas.push(['Dimensões', `${largura.toLocaleString('pt-BR')} × ${altura.toLocaleString('pt-BR')} px`]);
    linhas.push(['Proporção', proporcaoEmTexto(largura, altura)]);
    linhas.push(['Megapixels', `${((largura * altura) / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MP`]);
  }
  if (foto.tamanho) linhas.push(['Tamanho', fmtTamanho(foto.tamanho)]);
  // A data da foto é a do id. Quando ela não veio da câmera, o painel diz de onde veio.
  const tirada = descricaoDaFoto(foto).replace('Foto de ', '');
  linhas.push(['Tirada em', ORIGEM_DA_DATA[origem] ? `${tirada} (${ORIGEM_DA_DATA[origem]})` : tirada]);
  if (enviadaEm) linhas.push(['Enviada em', enviadaEm]);
  $('painel-dados').replaceChildren(...linhas.flatMap(([termo, valor]) => [el('dt', null, termo), el('dd', null, valor)]));
}

// Chamado pelo app quando o registro da foto chega (ou quando se sabe que ela não tem).
export function dadosDoRegistro(id, registro) {
  if (noVisor !== id || !ficha) return;
  ficha.temNome = true;
  ficha.nome = registro?.nome ?? null;
  if (registro?.largura && registro?.altura) {
    ficha.largura = registro.largura;
    ficha.altura = registro.altura;
  }
  ficha.origem = registro?.origem_da_data ?? null;
  const enviada = registro?.enviada_em ? new Date(registro.enviada_em) : null;
  ficha.enviadaEm =
    enviada && !Number.isNaN(enviada.getTime())
      ? enviada.toLocaleString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;
  renderFicha();
}

// Paleta e luminância saem da miniatura, no próprio navegador.
async function mostrarAnalise(foto, url) {
  if (!analises.has(foto.miniatura)) analises.set(foto.miniatura, await analisar(url));
  const analise = analises.get(foto.miniatura);
  if (noVisor !== foto.id || !analise) return;
  const cores = analise.paleta.map(([r, g, b]) => {
    const cor = el('li');
    cor.style.background = `rgb(${r} ${g} ${b})`;
    return cor;
  });
  $('painel-paleta').replaceChildren(...cores);
  $('painel-luminancia').textContent = `${Math.round(analise.luminancia * 100)}%`;
  $('painel-analise').hidden = false;
}

// Prepara o visor para uma foto. Devolve uma promessa que diz se a prévia ficou pronta.
export function renderVisor(foto, { posicao, total, temAnterior, temProxima }) {
  noVisor = foto.id;
  prontaNoVisor = null;
  proporcaoNoVisor = null;
  const previa = $('visor-previa');
  const original = $('visor-original');
  for (const animacao of original.getAnimations()) animacao.cancel();
  for (const imagem of [previa, original]) {
    imagem.hidden = true;
    imagem.removeAttribute('src');
  }
  original.alt = descricaoDaFoto(foto);
  $('visor-legenda').textContent = descricaoDaFoto(foto).replace('Foto de ', '');
  $('visor-posicao').textContent = `${posicao} de ${total}`;
  $('visor-anterior').disabled = !temAnterior;
  $('visor-proxima').disabled = !temProxima;
  $('visor-erro').hidden = true;
  $('visor-carregando').hidden = false;
  $('painel-analise').hidden = true;
  avisoNoVisor(null);
  estadoDoLink(null);
  ficha = { foto, posicao, total, nome: null, temNome: false, largura: null, altura: null, origem: null, enviadaEm: null };
  renderFicha();
  ajustarFoto();

  if (!foto.miniatura) {
    trocarAmbiente(null);
    return Promise.resolve(false);
  }
  return baixarAtual(foto.miniatura).then(
    async (url) => {
      if (noVisor !== foto.id) return false;
      previa.src = url;
      await previa.decode().catch(() => {});
      if (noVisor !== foto.id) return false;
      if (!proporcaoNoVisor && previa.naturalWidth) {
        proporcaoNoVisor = [previa.naturalWidth, previa.naturalHeight];
        ajustarFoto();
      }
      previa.hidden = false;
      trocarAmbiente(url);
      mostrarAnalise(foto, url);
      return true;
    },
    () => false,
  );
}

// Abre o visor. Se der, a foto cresce do quadro dela na grade.
export async function abrirVisor(foto, dados) {
  const visor = $('visor');
  if (!visor.open) {
    visor.showModal();
    aplicarPainel();
  }
  const previaPronta = renderVisor(foto, dados);
  const partes = [$('visor-foto'), $('visor-ambiente'), ...cromo()];
  if (!podeAnimar() || !foto.miniatura || !quadroDe(foto.id)) return;

  // Até a prévia estar pronta nada aparece: senão o visor piscaria vazio antes do voo.
  for (const parte of partes) parte.style.opacity = '0';
  const pronta = await previaPronta;
  for (const parte of partes) parte.style.opacity = '';
  const quadro = quadroDe(foto.id);
  if (!pronta || noVisor !== foto.id || !visor.open || !quadro) return;

  const partida = medirPartida(quadro);
  tirarDaGrade(foto.id); // a miniatura saiu da grade: é ela que está voando
  animar($('visor-foto'), [partida.quadro, partida.inteira], { duration: 380 });
  animar($('visor-ambiente'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' });
  // Topo, setas e painel entram depois, para não disputar a atenção com a foto em voo.
  for (const parte of cromo()) animar(parte, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 140, easing: 'ease', fill: 'backwards' });
}

// Ao passar de foto, a que estava aberta volta para a grade e a nova sai dela.
export function passouParaAFoto(id) {
  if (foraDaGrade != null) tirarDaGrade(id);
  if (podeAnimar()) animar($('visor-foto'), [{ opacity: 0.3 }, { opacity: 1 }], { duration: 200, easing: 'ease' });
}

async function fecharComEfeito() {
  const visor = $('visor');
  if (!visor.open || fechando) return;
  const quadro = noVisor == null ? null : quadroDe(noVisor);
  if (!podeAnimar() || !quadro || !proporcaoNoVisor) {
    visor.close();
    return;
  }
  fechando = true;
  quadro.scrollIntoView({ block: 'nearest' });
  tirarDaGrade(noVisor); // o lugar fica vago para a foto pousar nele
  const partida = medirPartida(quadro);
  const saida = [
    animar($('visor-foto'), [partida.inteira, partida.quadro], { duration: 280, fill: 'forwards' }),
    animar($('visor-ambiente'), [{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease', fill: 'forwards' }),
    ...cromo().map((parte) => animar(parte, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease', fill: 'forwards' })),
  ];
  await saida[0].finished.catch(() => {});
  visor.close();
  for (const animacao of saida) animacao.cancel();
  fechando = false;
}

// `efeito` leva a foto de volta ao quadro antes de fechar. Sem ele, fecha de uma vez.
export function fecharVisor({ efeito = false } = {}) {
  if (efeito) fecharComEfeito();
  else if ($('visor').open) $('visor').close();
}

// Depois de fechar, o foco volta para a foto que estava aberta, e ela fica à vista.
export function voltarParaAFoto(id) {
  const botao = quadroDe(id)?.querySelector('.grade__botao');
  if (!botao) return;
  botao.focus({ preventScroll: true });
  botao.scrollIntoView({ block: 'nearest' });
}

export async function mostrarOriginal(foto, url) {
  const original = $('visor-original');
  original.src = url;
  await original.decode().catch(() => {});
  if (noVisor !== foto.id) return;
  prontaNoVisor = foto.id;
  $('visor-carregando').hidden = true;
  if (!original.naturalWidth) return; // o navegador não soube decodificar: o aviso vem pelo evento de erro
  if (!proporcaoNoVisor) {
    proporcaoNoVisor = [original.naturalWidth, original.naturalHeight];
    ajustarFoto();
  }
  if (ficha && !ficha.largura) {
    ficha.largura = original.naturalWidth;
    ficha.altura = original.naturalHeight;
    renderFicha();
  }
  original.hidden = false;
  // Com a prévia por baixo, a original entra numa transição. Sem prévia, entra direto.
  if (podeAnimar() && !$('visor-previa').hidden) animar(original, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' });
}

export function erroNoVisor(mensagem, { podeTentar }) {
  $('visor-carregando').hidden = true;
  $('visor-erro').hidden = false;
  $('visor-erro-texto').textContent = mensagem;
  $('visor-tentar').hidden = !podeTentar;
}

// Ações da foto aberta: baixar, renomear e apagar.

export function avisoNoVisor(mensagem) {
  $('visor-aviso').hidden = !mensagem;
  $('visor-aviso').textContent = mensagem ?? '';
}

export function baixarOcupado(ocupado) {
  $('visor-baixar').disabled = ocupado;
  $('visor-baixar').textContent = ocupado ? 'Baixando...' : 'Baixar';
}

// Entrega o arquivo ao navegador como um download comum.
export function baixarArquivo(arquivo) {
  const url = URL.createObjectURL(arquivo);
  const link = el('a');
  link.href = url;
  link.download = arquivo.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// O nome se edita sem a extensão, que fica ao lado: trocar ".jpg" por engano quebraria o arquivo baixado.
export function abrirRenomear(base, extensao) {
  $('renomear-nome').value = base;
  $('renomear-extensao').textContent = extensao;
  $('renomear-extensao').hidden = !extensao;
  erroNoRenomear(null);
  renomearOcupado(false);
  $('renomear').showModal();
  $('renomear-nome').select();
}

export function fecharRenomear() {
  if ($('renomear').open) $('renomear').close();
}

export function erroNoRenomear(mensagem) {
  $('renomear-erro').hidden = !mensagem;
  $('renomear-erro').textContent = mensagem ?? '';
  $('renomear-nome').setAttribute('aria-invalid', String(Boolean(mensagem)));
}

export function renomearOcupado(ocupado) {
  $('renomear-salvar').disabled = ocupado;
  $('renomear-salvar').textContent = ocupado ? 'Salvando...' : 'Salvar';
}

// O diálogo mostra qual foto vai sair: a miniatura, o nome e o dia dela.
export function abrirApagar(foto, nome) {
  erroNoApagar(null);
  apagarOcupado(false);
  $('apagar-nome').textContent = nome;
  $('apagar-data').textContent = descricaoDaFoto(foto).replace('Foto de ', '');
  const miniatura = $('apagar-miniatura');
  miniatura.hidden = true;
  miniatura.removeAttribute('src');
  miniatura.dataset.id = foto.id;
  if (foto.miniatura) {
    baixarAtual(foto.miniatura).then(
      (url) => {
        if (miniatura.dataset.id !== foto.id) return;
        miniatura.src = url;
        miniatura.hidden = false;
      },
      () => {},
    );
  }
  $('apagar').showModal();
}

export function fecharApagar() {
  if ($('apagar').open) $('apagar').close();
}

export function erroNoApagar(mensagem) {
  $('apagar-erro').hidden = !mensagem;
  $('apagar-erro').textContent = mensagem ?? '';
}

export function apagarOcupado(ocupado) {
  $('apagar-confirmar').disabled = ocupado;
  $('apagar-confirmar').textContent = ocupado ? 'Apagando...' : 'Apagar foto';
}

// "Copiar link" manda o link direto para a área de transferência, sem diálogo. O link ainda
// está sendo gerado quando a pessoa toca, e o Safari só deixa copiar no toque: por isso o
// texto vai como promessa. Devolve se copiou.
export async function copiarTexto(promessa) {
  if (window.ClipboardItem && navigator.clipboard?.write) {
    try {
      const comoArquivo = promessa.then((texto) => new Blob([texto], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': comoArquivo })]);
      return true;
    } catch {
      // navegador que não aceita promessa aqui: tenta do jeito simples, logo abaixo
    }
  }
  try {
    await navigator.clipboard.writeText(await promessa);
    return true;
  } catch {
    return false;
  }
}

let voltaDoLink = null; // temporizador que devolve o botão ao texto normal

// estado: 'copiando' | 'copiado' | null
export function estadoDoLink(estado) {
  clearTimeout(voltaDoLink);
  const botao = $('visor-link');
  botao.disabled = estado === 'copiando';
  botao.textContent = estado === 'copiando' ? 'Copiando...' : estado === 'copiado' ? 'Link copiado' : 'Copiar link';
  // A confirmação fica um instante no próprio botão e depois ele volta ao normal.
  if (estado === 'copiado') voltaDoLink = setTimeout(() => estadoDoLink(null), 2500);
}

function ligarAcoesDaFoto(acoes) {
  $('visor-link').addEventListener('click', acoes.copiarLink);
  $('visor-baixar').addEventListener('click', acoes.baixarFoto);
  $('visor-renomear').addEventListener('click', acoes.pedirRenomear);
  $('visor-apagar').addEventListener('click', acoes.pedirApagar);
  $('renomear-form').addEventListener('submit', (evento) => {
    evento.preventDefault();
    acoes.salvarNome($('renomear-nome').value.trim(), $('renomear-extensao').textContent);
  });
  $('renomear-cancelar').addEventListener('click', fecharRenomear);
  $('apagar-form').addEventListener('submit', (evento) => {
    evento.preventDefault();
    acoes.apagarFoto();
  });
  $('apagar-cancelar').addEventListener('click', fecharApagar);
  // Clicar fora do diálogo cancela, como no de sair.
  for (const dialogo of [$('renomear'), $('apagar')]) {
    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) dialogo.close();
    });
  }
}

function ligarVisor(acoes) {
  ligarAcoesDaFoto(acoes);
  const visor = $('visor');
  $('grade').addEventListener('click', (evento) => {
    const quadro = evento.target.closest('.grade__botao')?.closest('[data-id]');
    if (quadro) acoes.abrirFoto(quadro.dataset.id);
  });
  $('visor-fechar').addEventListener('click', () => fecharComEfeito());
  $('visor-info').addEventListener('click', alternarPainel);
  $('visor-anterior').addEventListener('click', () => acoes.passarFoto(-1));
  $('visor-proxima').addEventListener('click', () => acoes.passarFoto(1));
  $('visor-tentar').addEventListener('click', acoes.recarregarFoto);
  // O Esc do diálogo fecharia de uma vez: passa pela saída com efeito.
  visor.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    fecharComEfeito();
  });
  visor.addEventListener('close', () => {
    devolverParaAGrade();
    noVisor = null;
    acoes.fotoFechada();
  });
  visor.addEventListener('keydown', (evento) => {
    if (evento.target.closest('input, textarea')) return;
    if (evento.key === 'ArrowLeft') acoes.passarFoto(-1);
    if (evento.key === 'ArrowRight') acoes.passarFoto(1);
    if (evento.key === 'i' || evento.key === 'I') alternarPainel();
  });
  // Clicar no vazio em volta da foto fecha, como em qualquer visualizador.
  $('visor-palco').addEventListener('click', (evento) => {
    if (evento.target === $('visor-palco')) fecharComEfeito();
  });
  // O navegador não soube decodificar a original (HEIC fora do Safari, por exemplo).
  $('visor-original').addEventListener('error', () => {
    if (noVisor == null || !$('visor-original').getAttribute('src')) return;
    $('visor-original').hidden = true;
    erroNoVisor('Este navegador não consegue mostrar o formato desta foto.', { podeTentar: false });
  });
  addEventListener('resize', () => {
    if (visor.open) ajustarFoto();
  });
  telaLarga.addEventListener('change', () => {
    if (visor.open) aplicarPainel();
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
  // A foto que já subiu e espera o commit do lote conta como feita na contagem.
  const concluidos = itens.filter((item) => item.estado === 'concluido' || item.estado === 'gravando').length;
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
  // Com tudo enviado ainda falta o GitHub confirmar que recebeu os arquivos.
  const fase = fracao <= 0 ? 'Preparando...' : fracao >= 1 ? 'Concluindo...' : `${percentual}%`;
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
  // Os arquivos já subiram e falta o commit que põe as fotos no repositório.
  const gravando = ocupada ? 0 : itens.filter((item) => item.estado === 'gravando').length;
  // Sem nada subindo, a conferência das repetidas é o que a zona tem para contar.
  const conferindo = !ocupada && !gravando && situacao.conferindo;
  // A foto que está subindo ocupa a zona: o progresso fica junto da ação principal.
  $('zona-titulo').textContent = atual
    ? atual.nome
    : situacao.pausadaAte
      ? 'Envio em pausa'
      : gravando
        ? gravando === 1
          ? 'Guardando a foto'
          : `Guardando ${gravando} fotos`
        : conferindo
          ? 'Conferindo as fotos'
          : TITULO_DA_ZONA;
  posicaoNaFila = atual ? resumoDaFila(itens, situacao) : '';
  $('zona-detalhe').textContent = ocupada
    ? resumoDaFila(itens, situacao)
    : gravando
      ? 'Concluindo...'
      : conferindo
        ? 'Vendo se alguma já está guardada...'
        : DETALHE_DA_ZONA;
  $('zona-barra').hidden = !atual;
  if (atual) {
    $('zona-barra').setAttribute('aria-label', `Envio de ${atual.nome}`);
    renderProgresso(situacao.progresso);
  } else {
    $('zona').classList.toggle('zona--varrendo', Boolean(gravando) || conferindo);
  }

  const falhas = itens.filter((item) => item.estado === 'erro');
  $('fila').hidden = falhas.length === 0;
  $('fila-resumo').textContent = falhas.length === 1 ? '1 foto não subiu' : `${falhas.length} fotos não subiram`;
  const linhas = falhas.map((item) => {
    const linha = el('li', 'fila__item');
    const texto = el('div', 'fila__texto');
    texto.append(el('span', 'fila__nome', item.nome));
    texto.append(el('span', 'fila__estado', `${fmtTamanho(item.arquivo.size)} · ${item.mensagem}`));
    const botao = el('button', 'botao botao--fantasma', 'Tentar de novo');
    botao.type = 'button';
    botao.dataset.n = item.n;
    linha.append(texto, botao);
    return linha;
  });
  $('fila-lista').replaceChildren(...linhas);
}

// Fotos repetidas: um diálogo por leva. Cada linha põe lado a lado a foto que já existe, à
// esquerda, e a que está sendo enviada, à direita e em destaque: { nova: { nome, tamanho, url }, outra: { nome, tamanho, url, foto } }.
// `outra.foto` é a foto guardada; vem vazia quando a outra cópia ainda está na fila, e aí a
// imagem dela vem em `outra.url`. `tipo` é 'conteudo' (idêntica) ou 'nome' (só o nome igual).
// Devolve, na ordem das linhas, quais manter em dobro.
// Com uma repetida só, são dois botões. Com várias, cada par tem a própria caixa de marcar, e
// nada vem marcado. Fechar com Esc ou clicando fora é não enviar nenhuma: nada é gravado.
function quadroDaRepetida(rotulo, { nome, tamanho, url, foto }, { nova = false, detalhe = null } = {}) {
  const figura = el('figure', nova ? 'repetidas__foto repetidas__foto--nova' : 'repetidas__foto repetidas__foto--outra');
  const quadro = el('div', 'repetidas__quadro');
  const imagem = el('img', 'repetidas__imagem');
  imagem.alt = '';
  imagem.hidden = true; // sem imagem para mostrar, fica o quadro neutro
  const mostrar = (endereco) => {
    imagem.src = endereco;
    imagem.hidden = false;
  };
  if (url) mostrar(url);
  else if (foto?.miniatura) baixarAtual(foto.miniatura).then(mostrar, () => {});
  quadro.append(imagem, el('span', 'repetidas__tamanho', fmtTamanho(tamanho)));
  const legenda = el('figcaption', 'repetidas__legenda');
  legenda.append(el('span', 'texto-suave texto-pequeno', rotulo), el('span', null, nome));
  if (detalhe) legenda.append(el('span', 'texto-suave texto-pequeno', detalhe));
  figura.append(quadro, legenda);
  return figura;
}

// Uma repetida é idêntica a uma foto guardada ('conteudo') ou só tem o mesmo nome ('nome').
// O título diz qual dos dois casos é, e mistura os dois só quando a leva mistura.
export function textosDasRepetidas(linhas, totalDaLeva) {
  const quantas = linhas.length;
  const soNome = linhas.every((linha) => linha.tipo === 'nome');
  const soConteudo = linhas.every((linha) => linha.tipo === 'conteudo');
  if (quantas === 1) {
    const titulo = soNome
      ? totalDaLeva === 1
        ? 'Já existe uma foto com este nome'
        : `1 das ${totalDaLeva} fotos tem nome que já existe`
      : totalDaLeva === 1
        ? 'Esta foto já está guardada'
        : `1 das ${totalDaLeva} fotos já está guardada`;
    const detalhe = soNome
      ? 'O nome é o mesmo, mas o conteúdo é diferente. "Manter as duas" envia a nova com outro nome.'
      : 'O conteúdo é idêntico ao da foto guardada. "Manter as duas" envia de novo, com outro nome.';
    return { titulo, detalhe };
  }
  const todas = quantas === totalDaLeva;
  const titulo = soConteudo
    ? todas
      ? `As ${quantas} fotos já estão guardadas`
      : `${quantas} das ${totalDaLeva} fotos já estão guardadas`
    : soNome
      ? todas
        ? `As ${quantas} fotos têm nome que já existe`
        : `${quantas} das ${totalDaLeva} fotos têm nome que já existe`
      : todas
        ? `As ${quantas} fotos parecem repetidas`
        : `${quantas} das ${totalDaLeva} fotos parecem repetidas`;
  return { titulo, detalhe: 'Compare cada par: à esquerda, a que já está guardada. Marque as que quer manter em dobro: elas sobem com outro nome.' };
}

export const rotuloDaRepetida = (tipo) => (tipo === 'nome' ? 'Mesmo nome, conteúdo diferente' : 'Conteúdo idêntico');

const marcadasNasRepetidas = () => [...$('repetidas-lista').querySelectorAll('input[type=checkbox]')];

// O botão principal diz o que vai acontecer com o que está marcado agora.
function renderEscolhaDasRepetidas() {
  const caixas = marcadasNasRepetidas();
  if (caixas.length === 0) return; // uma repetida só: os dois botões já dizem tudo
  const marcadas = caixas.filter((caixa) => caixa.checked).length;
  $('repetidas-concluir').textContent =
    marcadas === 0 ? 'Não enviar nenhuma' : marcadas === caixas.length ? 'Manter todas' : `Manter ${marcadas} de ${caixas.length}`;
  $('repetidas-todas').textContent = marcadas === caixas.length ? 'Desmarcar todas' : 'Marcar todas';
}

export function perguntarRepetidas(linhas, totalDaLeva) {
  const dialogo = $('repetidas');
  const quantas = linhas.length;
  const varias = quantas > 1;
  const { titulo, detalhe } = textosDasRepetidas(linhas, totalDaLeva);
  $('repetidas-titulo').textContent = titulo;
  $('repetidas-detalhe').textContent = detalhe;
  $('repetidas-concluir').textContent = 'Não enviar';
  $('repetidas-manter').hidden = varias;
  $('repetidas-todas').hidden = !varias;
  $('repetidas-lista').classList.toggle('repetidas--varias', varias);
  $('repetidas-lista').replaceChildren(
    ...linhas.map(({ tipo, nova, outra }) => {
      const item = el('li', 'repetidas__item');
      // A que já existe vem primeiro, e a nova, à direita, é a que fica em destaque.
      item.append(
        outra.foto
          ? quadroDaRepetida('Já guardada', outra, { detalhe: descricaoDaFoto(outra.foto).replace('Foto de ', '') })
          : quadroDaRepetida('Na fila de envio', outra),
        quadroDaRepetida('Enviando agora', nova, { nova: true }),
      );
      // Com várias, cada par diz por que entrou na lista. Com uma só, o texto de cima já disse.
      if (varias) {
        item.append(el('p', tipo === 'nome' ? 'repetidas__motivo' : 'repetidas__motivo texto-suave', rotuloDaRepetida(tipo)));
        const escolha = el('label', 'repetidas__escolha');
        const caixa = el('input');
        caixa.type = 'checkbox';
        escolha.append(caixa, el('span', null, 'Manter as duas'));
        item.append(escolha);
      }
      return item;
    }),
  );
  renderEscolhaDasRepetidas();
  dialogo.returnValue = '';
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener(
      'close',
      () => {
        const resposta = dialogo.returnValue;
        if (!varias) resolver([resposta === 'manter']);
        else resolver(marcadasNasRepetidas().map((caixa) => resposta === 'concluir' && caixa.checked));
      },
      { once: true },
    );
  });
}

// Fotos sem data: o EXIF e o nome não dizem quando foram tiradas. Cada linha é
// { nome, url, doArquivo }, e `doArquivo` é a data de modificação, quando serve de sugestão.
// Todo campo vem com hoje, então abrir e confirmar envia com a data atual. Devolve, na ordem das
// linhas, o dia escolhido ("2015-03-12"), ou tudo vazio se a pessoa desistiu de enviar.
const diaPorExtenso = (data) => data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

const camposDeData = () => [...$('sem-data-lista').querySelectorAll('input[type=date]')];

// O botão principal só promete "a data de hoje" enquanto nenhum campo foi mexido.
function renderEnvioSemData() {
  const hoje = diaEmTexto(new Date());
  $('sem-data-enviar').textContent = camposDeData().every((campo) => campo.value === hoje) ? 'Enviar agora, datar depois' : 'Enviar';
}

export function perguntarDatas(linhas, totalDaLeva) {
  const dialogo = $('sem-data');
  const quantas = linhas.length;
  const hoje = diaEmTexto(new Date());
  $('sem-data-titulo').textContent =
    totalDaLeva === 1
      ? 'Não achei a data desta foto'
      : quantas === 1
        ? `1 das ${totalDaLeva} fotos está sem data`
        : quantas === totalDaLeva
          ? `As ${quantas} fotos estão sem data`
          : `${quantas} das ${totalDaLeva} fotos estão sem data`;
  $('sem-data-detalhe').textContent =
    quantas === 1
      ? 'O arquivo e o nome não dizem quando ela foi tirada. Escolha o dia, ou envie agora e acerte depois em "Fotos sem data".'
      : 'O arquivo e o nome não dizem quando foram tiradas. Escolha o dia de cada uma, ou envie agora e acerte depois em "Fotos sem data".';
  $('sem-data-lista').replaceChildren(
    ...linhas.map(({ nome, url, doArquivo }, i) => {
      const item = el('li', 'sem-data__item');
      const miniatura = el('img', 'dialogo__miniatura');
      miniatura.alt = '';
      miniatura.width = 64;
      miniatura.height = 64;
      if (url) miniatura.src = url;
      const campos = el('div', 'sem-data__campos');
      const rotulo = el('label', 'campo__rotulo', nome);
      const campo = el('input', 'campo');
      campo.type = 'date';
      campo.id = `sem-data-${i}`;
      campo.required = true;
      campo.min = '1990-01-01';
      campo.max = hoje;
      campo.value = hoje;
      campo.setAttribute('aria-describedby', 'sem-data-detalhe');
      rotulo.htmlFor = campo.id;
      campos.append(rotulo, campo);
      if (doArquivo) {
        // A data do arquivo pode ser a da foto ou só a da cópia: fica como atalho, nunca como padrão.
        const atalho = el('button', 'botao botao--fantasma', `Usar a do arquivo: ${diaPorExtenso(doArquivo)}`);
        atalho.type = 'button';
        atalho.dataset.dia = diaEmTexto(doArquivo);
        atalho.dataset.campo = campo.id;
        campos.append(atalho);
      }
      item.append(miniatura, campos);
      return item;
    }),
  );
  renderEnvioSemData();
  dialogo.returnValue = '';
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener(
      'close',
      () => resolver(camposDeData().map((campo) => (dialogo.returnValue === 'enviar' ? campo.value : null))),
      { once: true },
    );
  });
}

// Tela "Fotos sem data": as que subiram com a data do envio, para acertar com calma.
//
// Um bloco por dia de envio, porque fotos enviadas juntas costumam ser da mesma ocasião: o
// campo do topo do bloco aplica um dia a todas. Cada foto tem o próprio campo e um "Está certa",
// para a que é mesmo do dia em que subiu. `grupos` é [{ chave, titulo, fotos: [{ foto, nome }] }].
export function linkDasPendentes(quantas) {
  const link = $('principal-pendentes');
  link.hidden = quantas === 0;
  link.replaceChildren(
    quantas === 1 ? '1 foto está sem data. ' : `${quantas.toLocaleString('pt-BR')} fotos estão sem data. `,
    el('strong', null, 'Acertar as datas'),
  );
}

const camposDasPendentes = () => [...$('pendentes').querySelectorAll('input[data-id]')];

// O que a pessoa decidiu para cada foto de um bloco: um dia novo, "está certa", ou nada.
function decisoesDoBloco(grupo) {
  return [...grupo.querySelectorAll('.pendentes__item')].flatMap((item) => {
    const campo = item.querySelector('input[data-id]');
    if (item.querySelector('input[type=checkbox]').checked) return [{ id: campo.dataset.id, dia: null }];
    return campo.value && campo.value !== campo.dataset.atual ? [{ id: campo.dataset.id, dia: campo.value }] : [];
  });
}

// O rodapé de cada bloco diz quantas fotos vão mudar, e o "Salvar" só acende quando há alguma.
function renderBotoesDasPendentes() {
  for (const grupo of $('pendentes').querySelectorAll('.pendentes__grupo')) {
    for (const item of grupo.querySelectorAll('.pendentes__item')) {
      // Marcada como certa, a foto fica com a data que tem: o campo sai de cena.
      item.querySelector('input[data-id]').disabled = item.querySelector('input[type=checkbox]').checked;
    }
    const quantas = decisoesDoBloco(grupo).length;
    grupo.querySelector('.pendentes__resumo').textContent =
      quantas === 0 ? 'Nenhuma alteração ainda' : quantas === 1 ? '1 foto pronta para salvar' : `${quantas} fotos prontas para salvar`;
    grupo.querySelector('[data-acao=salvar]').disabled = pendentesOcupadas || quantas === 0;
  }
}

let pendentesOcupadas = false;

export function renderSemData(grupos, { lendo, incompleta }, baixar) {
  baixarAtual = baixar;
  // Um redesenho no meio da escolha (um envio que terminou, por exemplo) não apaga o que foi decidido.
  const escolhidos = new Map(camposDasPendentes().map((campo) => [campo.dataset.id, campo.value]));
  const certas = new Set([...$('pendentes').querySelectorAll('input[type=checkbox]:checked')].map((caixa) => caixa.dataset.de));
  const hoje = diaEmTexto(new Date());
  const total = grupos.reduce((soma, grupo) => soma + grupo.fotos.length, 0);
  $('pendentes-lendo').hidden = !lendo;
  $('pendentes-vazia').hidden = lendo || total > 0;
  $('sem-data-explica').hidden = total === 0;
  if (incompleta) erroNasPendentes('Não deu para ler os dados de todas as fotos, então a lista pode estar incompleta. Recarregue a página para tentar de novo.');
  $('pendentes').replaceChildren(
    ...grupos.map(({ chave, titulo, fotos }) => {
      const grupo = el('form', 'pendentes__grupo');
      grupo.dataset.grupo = chave;
      grupo.noValidate = true;

      const topo = el('header', 'pendentes__topo');
      topo.append(el('h3', 'pendentes__titulo', titulo), el('p', 'texto-suave texto-pequeno', fotos.length === 1 ? '1 foto' : `${fotos.length} fotos`));
      grupo.append(topo);

      // Fotos enviadas juntas costumam ser da mesma ocasião: um dia só resolve o bloco.
      if (fotos.length > 1) {
        const ferramenta = el('div', 'pendentes__ferramenta');
        const rotulo = el('label', 'campo__rotulo', 'Mesmo dia para todas');
        const campo = el('input', 'campo');
        campo.type = 'date';
        campo.id = `pendentes-todas-${chave}`;
        campo.min = '1990-01-01';
        campo.max = hoje;
        rotulo.htmlFor = campo.id;
        const aplicar = el('button', 'botao botao--secundario', 'Aplicar a todas');
        aplicar.type = 'button';
        aplicar.dataset.acao = 'aplicar';
        ferramenta.append(rotulo, campo, aplicar);
        grupo.append(ferramenta);
      }

      const lista = el('ul', 'pendentes__lista');
      for (const { foto, nome } of fotos) {
        // A prévia é o que diz de quando é a foto: ocupa a largura toda do cartão.
        const item = el('li', 'pendentes__item');
        const miniatura = el('img', 'pendentes__imagem');
        miniatura.alt = '';
        if (foto.miniatura) baixar(foto.miniatura).then((url) => (miniatura.src = url), () => {});
        const rotulo = el('label', 'pendentes__nome', nome);
        const campo = el('input', 'campo');
        const atual = `${foto.dia.slice(0, 4)}-${foto.dia.slice(4, 6)}-${foto.dia.slice(6, 8)}`;
        campo.type = 'date';
        campo.id = `pendente-${foto.id}`;
        campo.dataset.id = foto.id;
        campo.dataset.atual = atual;
        campo.min = '1990-01-01';
        campo.max = hoje;
        campo.value = escolhidos.get(foto.id) ?? atual;
        rotulo.htmlFor = campo.id;
        // Para a foto que é mesmo do dia em que subiu: sai da lista sem mudar de lugar.
        const certa = el('label', 'pendentes__certa');
        const caixa = el('input');
        caixa.type = 'checkbox';
        caixa.dataset.de = foto.id;
        caixa.checked = certas.has(foto.id);
        certa.append(caixa, el('span', null, 'A data está certa'));
        item.append(miniatura, rotulo, campo, certa);
        lista.append(item);
      }
      grupo.append(lista);

      const rodape = el('footer', 'pendentes__rodape');
      const resumo = el('p', 'pendentes__resumo texto-suave texto-pequeno');
      resumo.setAttribute('role', 'status');
      const salvar = el('button', 'botao botao--primario', 'Salvar datas');
      salvar.type = 'submit';
      salvar.dataset.acao = 'salvar';
      rodape.append(resumo, salvar);
      grupo.append(rodape);
      return grupo;
    }),
  );
  renderBotoesDasPendentes();
}

export function pendentesOcupado(ocupado) {
  pendentesOcupadas = ocupado;
  for (const controle of $('pendentes').querySelectorAll('button, input')) controle.disabled = ocupado;
  for (const salvar of $('pendentes').querySelectorAll('[data-acao=salvar]')) salvar.textContent = ocupado ? 'Salvando...' : 'Salvar datas';
  if (!ocupado) renderBotoesDasPendentes();
}

export function erroNasPendentes(mensagem) {
  $('pendentes-erro').hidden = !mensagem;
  $('pendentes-erro').textContent = mensagem ?? '';
}

function ligarPendentes(acoes) {
  const tela = $('pendentes');
  tela.addEventListener('input', renderBotoesDasPendentes);
  tela.addEventListener('click', (evento) => {
    const botao = evento.target.closest('button[data-acao=aplicar]');
    if (!botao) return;
    const grupo = botao.closest('.pendentes__grupo');
    const dia = grupo.querySelector('.pendentes__ferramenta input').value;
    if (!dia) return;
    // As que foram marcadas como certas ficam como estão.
    for (const campo of grupo.querySelectorAll('input[data-id]:not(:disabled)')) campo.value = dia;
    renderBotoesDasPendentes();
  });
  tela.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const mudancas = decisoesDoBloco(evento.target);
    if (mudancas.length > 0) acoes.datar(mudancas);
  });
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
  avisarVisibilidade = acoes.visibilidade;
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
  ligarPuxar(acoes.atualizar, () => Boolean(lerToken()));
  $('atualizar').addEventListener('click', acoes.atualizar);
  $('atualizar-de-novo').addEventListener('click', acoes.atualizar);
  ligarArraste(acoes);
  ligarVisor(acoes);
  ligarPendentes(acoes);

  $('repetidas').addEventListener('click', (evento) => {
    if (evento.target === $('repetidas')) $('repetidas').close();
  });
  $('sem-data').addEventListener('click', (evento) => {
    if (evento.target === $('sem-data')) $('sem-data').close();
  });
  $('sem-data-lista').addEventListener('input', renderEnvioSemData);
  $('sem-data-lista').addEventListener('click', (evento) => {
    const atalho = evento.target.closest('button[data-dia]');
    if (!atalho) return;
    $(atalho.dataset.campo).value = atalho.dataset.dia;
    renderEnvioSemData();
  });
  $('repetidas-lista').addEventListener('change', renderEscolhaDasRepetidas);
  $('repetidas-todas').addEventListener('click', () => {
    const caixas = marcadasNasRepetidas();
    const marcar = caixas.some((caixa) => !caixa.checked);
    for (const caixa of caixas) caixa.checked = marcar;
    renderEscolhaDasRepetidas();
  });

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
