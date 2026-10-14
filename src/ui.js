import { analisar, diaEmTexto, fmtTamanho } from './foto.js';
import { ligarGestos } from './gestos.js';
import { BASE_DE_TESTES, REPO_DADOS, lerToken } from './github.js';
import { VERSAO_ATUAL } from './novidades.dados.js';

const $ = (id) => document.getElementById(id);

const TELAS = ['carregando', 'erro', 'principal', 'sem-data'];
const FIM_PUXAR = 64;
const QUADROS_DO_ESQUELETO = 24;
const TELAS_ATE_O_BOTAO_DE_INICIO = 2;
const TELAS_COM_ROLAGEM_SUAVE = 5;
let atualizacaoOcupada = false;
let quantasApagarSelecao = 0;

$('login-repo').textContent = REPO_DADOS;
$('base-de-testes').hidden = !BASE_DE_TESTES;
$('versao').textContent = VERSAO_ATUAL;
if ($('mais-versao')) $('mais-versao').textContent = VERSAO_ATUAL;

export function mostrarTela(nome) {
  for (const tela of TELAS) $(`tela-${tela}`).hidden = tela !== nome;
  $('atualizar').hidden = !lerToken();
  if ($('mais-abrir')) $('mais-abrir').hidden = !lerToken();
  else $('sair').hidden = !lerToken();

  if (nome !== 'principal') $('uso').hidden = true;
}

export function atualizarOcupado(ocupado) {
  atualizacaoOcupada = ocupado;
  $('atualizar').disabled = ocupado || document.body.classList.contains('modo-selecao');
  $('atualizar').textContent = ocupado ? 'Atualizando...' : 'Atualizar';
}

export function mostrarSincronia(texto) {
  $('sincronia').textContent = texto;
}

export function erroAoAtualizar(mensagem) {
  $('atualizar-erro').hidden = !mensagem;
  $('atualizar-erro-texto').textContent = mensagem ?? '';
}

function ligarPuxar(aoSoltar, podePuxarAgora) {
  const raiz = document.documentElement;
  let inicio = null;
  let distancia = 0;
  let recarregando = false;

  let fimDaSoltura = null;

  const definir = (px) => {
    distancia = px;
    raiz.classList.toggle('puxando', px > 0);
    raiz.style.setProperty('--puxar', `${px}px`);
    const progresso = Math.min(1, px / FIM_PUXAR);
    raiz.style.setProperty('--puxar-progresso', progresso);
    $('puxar-arco').style.strokeDashoffset = 100 - progresso * 100;
    $('puxar').classList.toggle('puxar--cheio', px >= FIM_PUXAR);
  };

  const soltar = () => {
    raiz.classList.add('puxar-soltando');
    clearTimeout(fimDaSoltura);
    fimDaSoltura = setTimeout(() => raiz.classList.remove('puxar-soltando'), 400);
  };

  const aoMover = (evento) => {
    if (inicio == null) return;
    const arrasto = evento.touches[0].clientY - inicio;
    if (arrasto <= 0 || scrollY > 0) {
      if (distancia) definir(0);
      return;
    }

    if (evento.cancelable) evento.preventDefault();

    definir(arrasto / 2);
  };

  addEventListener(
    'touchstart',
    (evento) => {
      const podePuxar =
        !recarregando && evento.touches.length === 1 && scrollY <= 0 && !document.querySelector('dialog[open]') && podePuxarAgora();
      inicio = podePuxar ? evento.touches[0].clientY : null;
      clearTimeout(fimDaSoltura);
      raiz.classList.remove('puxar-soltando');
      removeEventListener('touchmove', aoMover);
      if (podePuxar) addEventListener('touchmove', aoMover, { passive: false });
    },
    { passive: true },
  );

  const aoTerminar = () => {
    removeEventListener('touchmove', aoMover);
    if (inicio == null) return;
    inicio = null;
    soltar();
    if (distancia < FIM_PUXAR) {
      definir(0);
      return;
    }
    recarregando = true;
    definir(FIM_PUXAR);
    $('puxar-arco').style.strokeDashoffset = 25;
    $('puxar').classList.add('puxar--recarregando');
    Promise.resolve(aoSoltar()).finally(() => {
      recarregando = false;
      $('puxar').classList.remove('puxar--recarregando');
      soltar();
      definir(0);
    });
  };

  addEventListener('touchend', aoTerminar);

  addEventListener('touchcancel', () => {
    removeEventListener('touchmove', aoMover);
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

$('esqueleto-grade')?.append(...Array.from({ length: QUADROS_DO_ESQUELETO }, () => el('li', 'grade__quadro')));

function el(tag, classe, texto) {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  if (texto != null) no.textContent = texto;
  return no;
}

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

  const formato = { weekday: 'short', day: 'numeric', month: 'short' };
  if (data.getFullYear() !== hoje.getFullYear()) formato.year = 'numeric';
  const texto = data.toLocaleDateString('pt-BR', formato);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function descricaoDaFoto(foto) {
  const dia = dataDoDia(foto.dia).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Foto de ${dia}, ${foto.hora.slice(0, 2)}:${foto.hora.slice(2, 4)}`;
}

const MINIATURAS_NA_GRADE = 1000;
let observador = null;
let quadrosComMiniatura = [];
const baixarDoQuadro = new WeakMap();
const jaMostradas = new Set();

function carregarQuadro(quadro) {
  const pedido = baixarDoQuadro.get(quadro);
  const { foto, baixar } = pedido;
  pedido.pedida = true;
  quadro.classList.add('grade__quadro--carregando');
  baixar(foto.miniatura).then(
    (url) => {
      if (!quadro.isConnected) return;
      const imagem = el('img', jaMostradas.has(foto.miniatura) ? 'grade__imagem' : 'grade__imagem grade__imagem--nova');
      jaMostradas.add(foto.miniatura);
      imagem.alt = '';
      imagem.decoding = 'async';
      imagem.src = url;
      quadro.classList.remove('grade__quadro--carregando');
      quadro.querySelector('.grade__botao').append(imagem);
      pedido.carregada = true;
      quadrosComMiniatura.push(quadro);
      aliviarGrade();
    },
    (falha) => {
      if (falha?.name !== 'AbortError') {
        observador?.unobserve(quadro);
        marcarSemMiniatura(quadro, foto);
        return;
      }

      pedido.pedida = false;
      quadro.classList.remove('grade__quadro--carregando');
      if (observador && quadro.isConnected) {
        observador.unobserve(quadro);
        observador.observe(quadro);
      }
    },
  );
}

function aliviarGrade() {
  let sobra = quadrosComMiniatura.length - MINIATURAS_NA_GRADE;
  if (sobra <= 0) return;
  const ficam = [];
  for (const quadro of quadrosComMiniatura) {
    const pedido = baixarDoQuadro.get(quadro);
    if (!quadro.isConnected || !pedido) continue;
    if (sobra > 0 && !pedido.perto) {
      quadro.querySelector('.grade__imagem')?.remove();
      pedido.carregada = false;
      pedido.pedida = false;
      pedido.baixar.soltar?.(pedido.foto.miniatura);
      sobra--;
    } else {
      ficam.push(quadro);
    }
  }
  quadrosComMiniatura = ficam;
}

function marcarSemMiniatura(quadro, foto) {
  quadro.classList.remove('grade__quadro--carregando');
  quadro.classList.add('grade__quadro--vazio');
  quadro.querySelector('.grade__botao').setAttribute('aria-label', `${descricaoDaFoto(foto)}, sem miniatura`);
}

const semMovimento = matchMedia('(prefers-reduced-motion: reduce)');
const SUAVE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const TEMPO_DO_HOLOFOTE = 900;

let destaqueId = null;
let distantes = [];
let atalhoDeRepetidas = false;
let voo = null;
let fotosPorId = new Map();
let baixarAtual = null;

const quadroDe = (id) => {
  const seletor = `[data-id="${id}"]`;
  const quadro = $('grade').querySelector(seletor);
  if (quadro || !fotosPorId.has(id) || gruposPorDesenhar.length === 0) return quadro;
  desenharAte(id);
  return $('grade').querySelector(seletor);
};
const podeAnimar = () => !semMovimento.matches && !document.hidden;

function animar(no, quadros, opcoes) {
  return no.animate(quadros, { easing: SUAVE, ...opcoes });
}

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

function pendulo(id, aoPousar) {
  const quadro = quadroDe(id);
  const destino = quadro.getBoundingClientRect();
  const zona = $('zona').getBoundingClientRect();

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

export function fotoChegou(id, { ultimaDaLeva }) {
  encerrarVoo();
  const quadro = quadroDe(id);
  if (!quadro) return;
  if (!estaNaTela(quadro)) {
    if (atalhoDeRepetidas) distantes = [];
    atalhoDeRepetidas = false;
    distantes.push(id);
    renderAtalho();
    return;
  }

  const pousar = () => destacar(id, { comFoco: ultimaDaLeva });
  if (podeAnimar()) pendulo(id, pousar);
  else pousar();
}

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

  if (repetida) quadroDe(id)?.querySelector('.grade__botao')?.focus({ preventScroll: true });
  else destacar(id, { comFoco: true });
}

function fecharAtalho() {
  distantes = [];
  atalhoDeRepetidas = false;
  renderAtalho();
}

export function repetidasNaoEnviadas(ids) {
  if (ids.length === 0) return;
  distantes = ids;
  atalhoDeRepetidas = true;
  renderAtalho();
}

export function esquecerEnvio() {
  encerrarVoo();
  destaqueId = null;
  distantes = [];
  renderAtalho();
  $('grade').classList.remove('dias--holofote');
}

const PRIMEIRA_LEVA = 150;
const LEVA = 300;

let gruposPorDesenhar = [];
let desenhadas = 0;
let selecaoNaGrade = { ativa: false, ids: new Set() };
let fimDaGrade = null;

function desenharGrupo(grupo) {
  const selecao = selecaoNaGrade;
  const secao = el('section', 'dia');
  const titulo = el('h3', 'dia__titulo', tituloDoDia(grupo.dia));
  const cabeca = el('div', 'dia__cabeca');
  cabeca.dataset.dia = grupo.dia;
  const rotuloDia = el('label', 'dia__selecao');
  const caixaDia = el('input');
  caixaDia.type = 'checkbox';
  caixaDia.setAttribute('aria-label', `Selecionar todas as fotos de ${titulo.textContent}`);
  rotuloDia.append(caixaDia);
  cabeca.append(titulo, rotuloDia);
  secao.append(cabeca);
  const lista = el('ul', 'grade');
  for (const foto of grupo.fotos) {
    const quadro = el('li', 'grade__quadro');
    quadro.dataset.id = foto.id;
    const botao = el('button', 'grade__botao');
    botao.type = 'button';
    botao.setAttribute('aria-label', descricaoDaFoto(foto));
    if (selecao.ativa) botao.setAttribute('aria-pressed', String(selecao.ids.has(foto.id)));
    quadro.append(botao);
    quadro.classList.toggle('grade__quadro--selecionado', selecao.ids.has(foto.id));
    if (foto.id === destaqueId) marcarDestaque(quadro, false);
    if (foto.id === foraDaGrade) quadro.style.visibility = 'hidden';
    if (foto.miniatura) {
      baixarDoQuadro.set(quadro, { foto, baixar: baixarAtual });
      observador.observe(quadro);
    } else {
      marcarSemMiniatura(quadro, foto);
    }
    lista.append(quadro);
  }
  const marcadas = grupo.fotos.filter((foto) => selecao.ids.has(foto.id)).length;
  caixaDia.checked = marcadas === grupo.fotos.length;
  caixaDia.indeterminate = marcadas > 0 && marcadas < grupo.fotos.length;
  secao.append(lista);
  return secao;
}

function desenharLeva(quantas) {
  const secoes = [];
  let nestaLeva = 0;
  while (gruposPorDesenhar.length > 0 && nestaLeva < quantas) {
    const grupo = gruposPorDesenhar.shift();
    secoes.push(desenharGrupo(grupo));
    nestaLeva += grupo.fotos.length;
  }
  desenhadas += nestaLeva;
  $('grade').append(...secoes);
  vigiarFimDaGrade();
}

function desenharAte(id) {
  const posicao = gruposPorDesenhar.findIndex((grupo) => grupo.fotos.some((foto) => foto.id === id));
  if (posicao < 0) return;
  desenharLeva(gruposPorDesenhar.slice(0, posicao + 1).reduce((soma, grupo) => soma + grupo.fotos.length, 0));
}

function vigiarFimDaGrade() {
  fimDaGrade?.disconnect();
  fimDaGrade = null;
  const ultima = $('grade').lastElementChild;
  if (gruposPorDesenhar.length === 0 || !ultima) return;
  fimDaGrade = new IntersectionObserver(
    (entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting)) desenharLeva(LEVA);
    },
    { rootMargin: '0px 0px 1500px 0px' },
  );
  fimDaGrade.observe(ultima);
}

export function limparPrincipal() {
  observador?.disconnect();
  observador = null;
  fimDaGrade?.disconnect();
  fimDaGrade = null;
  gruposPorDesenhar = [];
  quadrosComMiniatura = [];
  $('grade').replaceChildren();
}

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

function renderEspaco(espaco) {
  const aviso = $('principal-espaco');
  aviso.hidden = espaco <= AVISO_DE_ESPACO;
  aviso.textContent = `As fotos já ocupam ${fmtTamanho(espaco)}, perto dos 5 GB que o GitHub recomenda por repositório. Apagar fotos não libera espaço: faça a cópia de segurança antes de enviar mais.`;
}

export function renderPrincipal(grupos, { total, espaco }, baixar, selecao = { ativa: false, ids: new Set() }) {
  encerrarVoo();
  const posicoes = posicoesVisiveis();
  limparPrincipal();
  baixarAtual = baixar;
  fotosPorId = new Map(grupos.flatMap((grupo) => grupo.fotos).map((foto) => [foto.id, foto]));
  $('principal-vazia').hidden = total > 0;

  $('uso').hidden = total === 0;
  $('uso-valor').textContent = `${fmtTamanho(espaco)} usados`;
  $('uso-detalhe').textContent = total === 1 ? '1 foto' : `${total.toLocaleString('pt-BR')} fotos`;
  renderEspaco(espaco);
  atualizarSelecao(selecao.ativa, selecao.ids, total);

  observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        const quadro = entrada.target;
        const pedido = baixarDoQuadro.get(quadro);
        if (!pedido) continue;
        pedido.perto = entrada.isIntersecting;
        if (pedido.perto && !pedido.pedida) carregarQuadro(quadro);
        else if (!pedido.perto && pedido.pedida && !pedido.carregada) pedido.baixar.cancelar?.(pedido.foto.miniatura);
      }
    },
    { rootMargin: '400px 0px' },
  );

  selecaoNaGrade = selecao;
  const jaDesenhadas = desenhadas;
  desenhadas = 0;
  gruposPorDesenhar = [...grupos];
  desenharLeva(Math.max(PRIMEIRA_LEVA, jaDesenhadas));
  deslizarDe(posicoes);
}

export function atualizarSelecao(ativa, ids, total) {
  selecaoNaGrade = { ativa, ids };
  document.body.classList.toggle('modo-selecao', ativa);
  $('grade').classList.toggle('grade--selecao', ativa);
  $('selecao-topo').hidden = total === 0 || ativa;
  $('barra-selecao').hidden = !ativa;
  $('zona').disabled = ativa;
  $('zona-entrada').disabled = ativa;
  $('atualizar').disabled = atualizacaoOcupada || ativa;
  $('selecao-contagem').textContent = `${ids.size} ${ids.size === 1 ? 'foto selecionada' : 'fotos selecionadas'}`;
  $('apagar-selecionadas').disabled = ids.size === 0;

  for (const quadro of $('grade').querySelectorAll('.grade__quadro')) {
    const selecionada = ids.has(quadro.dataset.id);
    quadro.classList.toggle('grade__quadro--selecionado', selecionada);
    const botao = quadro.querySelector('.grade__botao');
    if (ativa) botao.setAttribute('aria-pressed', String(selecionada));
    else botao.removeAttribute('aria-pressed');
  }
  for (const cabeca of $('grade').querySelectorAll('.dia__cabeca')) {
    const caixas = [...cabeca.closest('.dia').querySelectorAll('.grade__quadro')];
    const quantidade = caixas.filter((quadro) => ids.has(quadro.dataset.id)).length;
    const caixaDia = cabeca.querySelector('input');
    caixaDia.checked = caixas.length > 0 && quantidade === caixas.length;
    caixaDia.indeterminate = quantidade > 0 && quantidade < caixas.length;
  }
}

const CHAVE_PAINEL = 'drive-fotos.painel';
const telaLarga = matchMedia('(min-width: 900px)');

let noVisor = null;
let prontaNoVisor = null;
let proporcaoNoVisor = null;
let ficha = null;
let foraDaGrade = null;
let camadaDoAmbiente = 0;
let fechando = false;
const analises = new Map();

const ZOOM_DO_DUPLO_TOQUE = 2.5;
const ZOOM_MAXIMO = 4;
const FOLGA_DA_PINCA = 0.3;
const PASSA_COM = 48;
const FECHA_COM = 0.22;
const VELOCIDADE_QUE_CONFIRMA = 0.45;
const ENCOLHE_ATE = 0.85;

let zoom = { escala: 1, x: 0, y: 0 };
let zoomDeAntes = null;
let fimDoAssento = null;
let sentidoDaPassagem = 0;
let tocouEm = 0;

const entre = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

function zoomMaximo() {
  const largura = $('visor-foto').offsetWidth;
  return Math.max(ZOOM_MAXIMO, largura ? $('visor-original').naturalWidth / largura : 0);
}

function pintarZoom() {
  const { escala, x, y } = zoom;
  $('visor-foto').style.transform = escala === 1 && x === 0 && y === 0 ? '' : `translate(${x}px, ${y}px) scale(${escala})`;
  const ampliada = escala > 1;
  $('visor').classList.toggle('visor--ampliada', ampliada);
  const botao = $('visor-zoom');
  if (!botao) return;
  botao.textContent = ampliada ? 'Reduzir' : 'Ampliar';
  botao.setAttribute('aria-pressed', String(ampliada));
}

function assentar() {
  if (semMovimento.matches) return;
  $('visor').classList.add('visor--assentando');
  clearTimeout(fimDoAssento);
  fimDoAssento = setTimeout(() => $('visor').classList.remove('visor--assentando'), 320);
}

function soltarAssento() {
  clearTimeout(fimDoAssento);
  $('visor').classList.remove('visor--assentando');
}

function definirZoom(escala, x, y, suave = false) {
  const nova = entre(escala, 1, zoomMaximo());
  const sobraX = Math.max(0, ($('visor-foto').offsetWidth * nova - $('visor-palco').clientWidth) / 2);
  const sobraY = Math.max(0, ($('visor-foto').offsetHeight * nova - $('visor-palco').clientHeight) / 2);
  zoom = { escala: nova, x: entre(x, -sobraX, sobraX), y: entre(y, -sobraY, sobraY) };
  if (suave) assentar();
  pintarZoom();
}

function zoomEmTorno(ponto, escala, de = zoom, destino = ponto) {
  const palco = $('visor-palco').getBoundingClientRect();
  const centroX = palco.left + palco.width / 2;
  const centroY = palco.top + palco.height / 2;
  return {
    escala,
    x: destino.x - centroX - (escala * (ponto.x - centroX - de.x)) / de.escala,
    y: destino.y - centroY - (escala * (ponto.y - centroY - de.y)) / de.escala,
  };
}

function alternarZoom(ponto) {
  if (zoom.escala > 1) {
    definirZoom(1, 0, 0, true);
    return;
  }
  const alvo = zoomEmTorno(ponto, ZOOM_DO_DUPLO_TOQUE);
  definirZoom(alvo.escala, alvo.x, alvo.y, true);
}

function limparGestos() {
  soltarAssento();
  zoom = { escala: 1, x: 0, y: 0 };
  pintarZoom();
  $('visor-ambiente').style.opacity = '';
  $('visor').classList.remove('visor--limpo', 'visor--arrastando');
}

const cromo = () => [$('visor-topo'), $('visor-anterior'), $('visor-proxima'), $('visor-painel'), $('visor-rodape')];

export function visorAberto() {
  return $('visor').open;
}

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
    return;
  }
  aplicarPainel();
}

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
  if (!url) return;
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

  $('painel-nome').textContent = nome ?? (temNome ? foto.id : 'Carregando o nome...');
  const linhas = [];
  if (largura && altura) {
    linhas.push(['Dimensões', `${largura.toLocaleString('pt-BR')} × ${altura.toLocaleString('pt-BR')} px`]);
    linhas.push(['Proporção', proporcaoEmTexto(largura, altura)]);
    linhas.push(['Megapixels', `${((largura * altura) / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MP`]);
  }
  if (foto.tamanho) linhas.push(['Tamanho', fmtTamanho(foto.tamanho)]);

  const tirada = descricaoDaFoto(foto).replace('Foto de ', '');
  linhas.push(['Tirada em', ORIGEM_DA_DATA[origem] ? `${tirada} (${ORIGEM_DA_DATA[origem]})` : tirada]);
  if (enviadaEm) linhas.push(['Enviada em', enviadaEm]);
  $('painel-dados').replaceChildren(...linhas.flatMap(([termo, valor]) => [el('dt', null, termo), el('dd', null, valor)]));
}

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

export function renderVisor(foto, { posicao, total, temAnterior, temProxima }) {
  noVisor = foto.id;
  prontaNoVisor = null;
  proporcaoNoVisor = null;
  soltarAssento();
  zoom = { escala: 1, x: 0, y: 0 };
  pintarZoom();
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
  confirmarNoVisor(null);
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

export async function abrirVisor(foto, dados) {
  const visor = $('visor');
  if (!visor.open) {
    visor.showModal();
    aplicarPainel();
  }
  const previaPronta = renderVisor(foto, dados);
  const partes = [$('visor-foto'), $('visor-ambiente'), ...cromo()];
  if (!podeAnimar() || !foto.miniatura || !quadroDe(foto.id)) return;

  for (const parte of partes) parte.style.opacity = '0';
  const pronta = await previaPronta;
  for (const parte of partes) parte.style.opacity = '';
  const quadro = quadroDe(foto.id);
  if (!pronta || noVisor !== foto.id || !visor.open || !quadro) return;

  const partida = medirPartida(quadro);
  tirarDaGrade(foto.id);
  animar($('visor-foto'), [partida.quadro, partida.inteira], { duration: 380 });
  animar($('visor-ambiente'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' });

  for (const parte of cromo()) animar(parte, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 140, easing: 'ease', fill: 'backwards' });
}

export function passouParaAFoto(id) {
  if (foraDaGrade != null) tirarDaGrade(id);
  const desloca = sentidoDaPassagem * 32;
  sentidoDaPassagem = 0;
  if (!podeAnimar()) return;
  animar($('visor-foto'), [{ opacity: 0.3, transform: `translateX(${desloca}px)` }, { opacity: 1, transform: 'none' }], { duration: desloca ? 260 : 200, easing: desloca ? SUAVE : 'ease' });
}

async function fecharComEfeito() {
  const visor = $('visor');
  if (!visor.open || fechando) return;
  const quadro = noVisor == null ? null : quadroDe(noVisor);
  if (!podeAnimar() || !quadro || !proporcaoNoVisor) {
    visor.close();
    limparGestos();
    return;
  }
  fechando = true;
  soltarAssento();
  const caixa = $('visor-foto');
  const ambiente = $('visor-ambiente');
  const saindoDe = { transform: caixa.style.transform || 'none', clipPath: 'inset(0px 0px)' };
  const opacidade = (no) => getComputedStyle(no).opacity;
  const ambienteEm = opacidade(ambiente);
  caixa.style.transform = '';
  quadro.scrollIntoView({ block: 'nearest' });
  tirarDaGrade(noVisor);
  const partida = medirPartida(quadro);
  const saida = [
    animar(caixa, [saindoDe, partida.quadro], { duration: 280, fill: 'forwards' }),
    animar(ambiente, [{ opacity: ambienteEm }, { opacity: 0 }], { duration: 240, easing: 'ease', fill: 'forwards' }),
    ...cromo().map((parte) => animar(parte, [{ opacity: opacidade(parte) }, { opacity: 0 }], { duration: 120, easing: 'ease', fill: 'forwards' })),
  ];
  await saida[0].finished.catch(() => {});
  visor.close();
  limparGestos();
  for (const animacao of saida) animacao.cancel();
  fechando = false;
}

export function fecharVisor({ efeito = false } = {}) {
  if (efeito) fecharComEfeito();
  else if ($('visor').open) {
    $('visor').close();
    limparGestos();
  }
}

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
  if (!original.naturalWidth) return;
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

  if (podeAnimar() && !$('visor-previa').hidden) animar(original, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' });
}

export function erroNoVisor(mensagem, { podeTentar }) {
  $('visor-carregando').hidden = true;
  $('visor-erro').hidden = false;
  $('visor-erro-texto').textContent = mensagem;
  $('visor-tentar').hidden = !podeTentar;
}

export function avisoNoVisor(mensagem) {
  $('visor-aviso').hidden = !mensagem;
  $('visor-aviso').textContent = mensagem ?? '';
}

function rotularAcao(botao, texto, ocupado = false) {
  (botao.querySelector('.visor__rotulo') ?? botao).textContent = texto;
  botao.setAttribute('aria-busy', String(ocupado));
}

export function baixarOcupado(ocupado) {
  $('visor-baixar').disabled = ocupado;
  rotularAcao($('visor-baixar'), ocupado ? 'Baixando...' : 'Baixar', ocupado);
}

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

export function abrirApagarSelecao(total) {
  quantasApagarSelecao = total;
  erroApagarSelecao(null);
  apagarSelecaoOcupada(false);
  $('apagar-selecao-titulo').textContent = `Apagar ${total} ${total === 1 ? 'foto' : 'fotos'}?`;
  $('apagar-selecao-aviso').textContent = `Você selecionou ${total} ${total === 1 ? 'foto' : 'fotos'}.`;
  $('apagar-selecao-confirmar').textContent = `Apagar ${total} ${total === 1 ? 'foto' : 'fotos'}`;
  $('apagar-selecao').showModal();
}

export function fecharApagarSelecao() {
  if ($('apagar-selecao').open) $('apagar-selecao').close();
}

export function erroApagarSelecao(mensagem) {
  $('apagar-selecao-erro').hidden = !mensagem;
  $('apagar-selecao-erro').textContent = mensagem ?? '';
  $('apagar-selecao-confirmar').textContent = mensagem ? 'Tentar de novo' : `Apagar ${quantasApagarSelecao} ${quantasApagarSelecao === 1 ? 'foto' : 'fotos'}`;
}

export function apagarSelecaoOcupada(ocupada) {
  const confirmar = $('apagar-selecao-confirmar');
  confirmar.disabled = ocupada;
  $('apagar-selecao-cancelar').disabled = ocupada;
  if (ocupada) confirmar.textContent = 'Apagando...';
  else erroApagarSelecao($('apagar-selecao-erro').hidden ? null : $('apagar-selecao-erro').textContent);
}

export async function copiarTexto(promessa) {
  if (window.ClipboardItem && navigator.clipboard?.write) {
    try {
      const comoArquivo = promessa.then((texto) => new Blob([texto], { type: 'text/plain' }));
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': comoArquivo })]);
      return true;
    } catch {
    }
  }
  try {
    await navigator.clipboard.writeText(await promessa);
    return true;
  } catch {
    return false;
  }
}

let fimDaConfirmacao = null;

export function confirmarNoVisor(texto) {
  clearTimeout(fimDaConfirmacao);
  const confirmacao = $('visor-confirmacao');
  confirmacao.hidden = true;
  if (!texto) return;
  $('visor-confirmacao-texto').textContent = texto;

  void confirmacao.offsetWidth;
  confirmacao.hidden = false;
  fimDaConfirmacao = setTimeout(() => (confirmacao.hidden = true), 2500);
}

let voltaDoLink = null;

export function estadoDoLink(estado) {
  clearTimeout(voltaDoLink);
  const botao = $('visor-link');
  botao.disabled = estado === 'copiando';
  rotularAcao(botao, estado === 'copiando' ? 'Copiando...' : estado === 'copiado' ? 'Link copiado' : 'Copiar link', estado === 'copiando');

  if (estado === 'copiado') {
    confirmarNoVisor('Link copiado');
    voltaDoLink = setTimeout(() => estadoDoLink(null), 2500);
  }
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

  for (const dialogo of [$('renomear'), $('apagar')]) {
    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) dialogo.close();
    });
  }
}

function ligarVisor(acoes) {
  ligarAcoesDaFoto(acoes);
  const visor = $('visor');
  let pressao = null;
  let suprimirClique = false;
  let limparSupressao = null;
  const cancelarPressao = () => {
    if (pressao?.temporizador) clearTimeout(pressao.temporizador);
    pressao = null;
  };
  $('grade').addEventListener('pointerdown', (evento) => {
    const botao = evento.target.closest('.grade__botao');
    const quadro = botao?.closest('[data-id]');
    if (evento.pointerType !== 'touch' || !quadro || acoes.estaEmSelecao()) return;
    cancelarPressao();
    pressao = {
      id: quadro.dataset.id,
      pointerId: evento.pointerId,
      x: evento.clientX,
      y: evento.clientY,
      temporizador: setTimeout(() => {
        if (!pressao) return;
        if (acoes.iniciarSelecao(pressao.id)) pressao.disparada = true;
        else cancelarPressao();
      }, 550),
    };
  });
  $('grade').addEventListener('pointermove', (evento) => {
    if (!pressao || evento.pointerId !== pressao.pointerId || pressao.disparada) return;
    if (Math.hypot(evento.clientX - pressao.x, evento.clientY - pressao.y) > 12) cancelarPressao();
  });
  $('grade').addEventListener('pointerup', (evento) => {
    if (!pressao || evento.pointerId !== pressao.pointerId) return;
    const disparada = pressao.disparada;
    cancelarPressao();
    if (!disparada) return;
    suprimirClique = true;
    clearTimeout(limparSupressao);
    limparSupressao = setTimeout(() => (suprimirClique = false), 600);
  });
  $('grade').addEventListener('pointercancel', cancelarPressao);
  $('grade').addEventListener('contextmenu', (evento) => {
    if (evento.target.closest('.grade__botao')) evento.preventDefault();
  });
  $('grade').addEventListener('click', (evento) => {
    const botao = evento.target.closest('.grade__botao');
    const quadro = botao?.closest('[data-id]');
    if (!quadro) return;
    if (suprimirClique) {
      evento.preventDefault();
      evento.stopPropagation();
      suprimirClique = false;
      clearTimeout(limparSupressao);
      return;
    }
    if (acoes.estaEmSelecao()) acoes.alternarFotoSelecionada(quadro.dataset.id);
    else acoes.abrirFoto(quadro.dataset.id);
  });
  $('grade').addEventListener('change', (evento) => {
    const caixa = evento.target.closest('.dia__selecao input');
    if (!caixa) return;
    const ids = [...caixa.closest('.dia').querySelectorAll('.grade__quadro')].map((quadro) => quadro.dataset.id);
    acoes.definirSelecaoDoDia(ids, caixa.checked);
  });
  $('visor-fechar').addEventListener('click', () => fecharComEfeito());
  $('visor-info').addEventListener('click', alternarPainel);
  $('visor-anterior').addEventListener('click', () => acoes.passarFoto(-1));
  $('visor-proxima').addEventListener('click', () => acoes.passarFoto(1));
  $('visor-tentar').addEventListener('click', acoes.recarregarFoto);

  visor.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    fecharComEfeito();
  });
  visor.addEventListener('close', () => {
    limparGestos();
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

  $('visor-palco').addEventListener('click', (evento) => {
    if (evento.target === $('visor-palco') && performance.now() - tocouEm > 600) fecharComEfeito();
  });
  $('visor-zoom')?.addEventListener('click', () => {
    const palco = $('visor-palco').getBoundingClientRect();
    alternarZoom({ x: palco.left + palco.width / 2, y: palco.top + palco.height / 2 });
  });

  $('visor-original').addEventListener('error', () => {
    if (noVisor == null || !$('visor-original').getAttribute('src')) return;
    $('visor-original').hidden = true;
    erroNoVisor('Este navegador não consegue mostrar o formato desta foto.', { podeTentar: false });
  });
  addEventListener('resize', () => {
    if (!visor.open) return;
    ajustarFoto();
    definirZoom(1, 0, 0);
  });
  telaLarga.addEventListener('change', () => {
    if (visor.open) aplicarPainel();
  });

  const caixa = $('visor-foto');
  const ambiente = $('visor-ambiente');
  const temVizinha = (dx) => !$(dx < 0 ? 'visor-proxima' : 'visor-anterior').disabled;
  const voltarAoLugar = () => {
    assentar();
    visor.classList.remove('visor--arrastando');
    ambiente.style.opacity = '';
    pintarZoom();
  };

  ligarGestos($('visor-palco'), {
    podeComecar: (evento) => !fechando && !evento.target.closest('button'),
    eixoLivre: () => zoom.escala > 1,
    toque() {
      tocouEm = performance.now();
      visor.classList.toggle('visor--limpo');
    },
    duploToque(ponto) {
      tocouEm = performance.now();
      visor.classList.toggle('visor--limpo');
      alternarZoom(ponto);
    },
    arrasteComeca(eixo) {
      soltarAssento();
      zoomDeAntes = { ...zoom };
      if (eixo === 'y') visor.classList.add('visor--arrastando');
    },
    arrasteMove({ eixo, dx, dy }) {
      if (eixo === 'livre') {
        definirZoom(zoomDeAntes.escala, zoomDeAntes.x + dx, zoomDeAntes.y + dy);
      } else if (eixo === 'x') {
        caixa.style.transform = `translateX(${temVizinha(dx) ? dx : dx * 0.3}px)`;
      } else if (dy <= 0) {
        caixa.style.transform = `translateY(${dy * 0.2}px)`;
        ambiente.style.opacity = '';
      } else {
        const avanco = Math.min(1, dy / innerHeight);
        caixa.style.transform = `translate(${dx}px, ${dy}px) scale(${Math.max(ENCOLHE_ATE, 1 - avanco * 0.4)})`;
        ambiente.style.opacity = String(Math.max(0, 1 - avanco * 1.6));
      }
    },
    arrasteTermina({ eixo, dx, dy, vx, vy, cancelado }) {
      if (eixo === 'livre') return;
      if (eixo === 'x') {
        const passa = !cancelado && temVizinha(dx) && (Math.abs(dx) >= PASSA_COM || (Math.abs(vx) > VELOCIDADE_QUE_CONFIRMA && Math.abs(dx) > 16));
        if (!passa) {
          voltarAoLugar();
          return;
        }
        sentidoDaPassagem = dx < 0 ? 1 : -1;
        pintarZoom();
        acoes.passarFoto(sentidoDaPassagem);
        return;
      }
      const fecha = !cancelado && dy > 0 && (dy > innerHeight * FECHA_COM || (vy > VELOCIDADE_QUE_CONFIRMA && dy > 24));
      if (!fecha) {
        voltarAoLugar();
        return;
      }
      fecharComEfeito();
    },
    pincaComeca(centro) {
      soltarAssento();
      zoomDeAntes = { ...zoom, centro };
    },
    pincaMove({ x, y, fator }) {
      const escala = entre(zoomDeAntes.escala * fator, 1 - FOLGA_DA_PINCA, zoomMaximo() * (1 + FOLGA_DA_PINCA));
      zoom = zoomEmTorno(zoomDeAntes.centro, escala, zoomDeAntes, { x, y });
      pintarZoom();
    },
    pincaTermina() {
      definirZoom(zoom.escala, zoom.x, zoom.y, true);
    },
  });
}

export function erroNaZona(mensagem) {
  $('zona-erro').hidden = !mensagem;
  $('zona-erro').textContent = mensagem ?? '';
}

function resumoDaFila(itens, { enviando, pausadaAte }) {
  const concluidos = itens.filter((item) => item.estado === 'concluido' || item.estado === 'gravando').length;
  const comErro = itens.filter((item) => item.estado === 'erro').length;
  if (pausadaAte) {
    const hora = pausadaAte.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `O GitHub limitou o ritmo. O envio continua sozinho às ${hora}.`;
  }
  if (enviando) {
    return `Enviando ${Math.min(itens.length, concluidos + comErro + 1)} de ${itens.length}`;
  }
  return '';
}

const TITULO_DA_ZONA = $('zona-titulo').textContent;
const DETALHE_DA_ZONA = $('zona-detalhe').textContent;

let posicaoNaFila = '';

export function renderProgresso(fracao) {
  const percentual = Math.round(fracao * 100);

  const fase = fracao <= 0 ? 'Preparando...' : fracao >= 1 ? 'Concluindo...' : `${percentual}%`;
  $('zona-barra-cheia').style.setProperty('--progresso', fracao);
  $('zona-barra').setAttribute('aria-valuenow', percentual);
  $('zona-detalhe').textContent = `${posicaoNaFila} · ${fase}`;
  $('zona').classList.toggle('zona--varrendo', fase.endsWith('...'));
}

export function renderFila(itens, situacao) {
  const atual = itens.find((item) => item.estado === 'enviando');
  const ocupada = Boolean(atual || situacao.pausadaAte);

  const gravando = ocupada ? 0 : itens.filter((item) => item.estado === 'gravando').length;

  const conferindo = !ocupada && !gravando && situacao.conferindo;

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

function quadroDaRepetida(rotulo, { nome, tamanho, url, foto }, { nova = false, detalhe = null } = {}) {
  const figura = el('figure', nova ? 'repetidas__foto repetidas__foto--nova' : 'repetidas__foto repetidas__foto--outra');
  const quadro = el('div', 'repetidas__quadro');
  const imagem = el('img', 'repetidas__imagem');
  imagem.alt = '';
  imagem.hidden = true;
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

function renderEscolhaDasRepetidas() {
  const caixas = marcadasNasRepetidas();
  if (caixas.length === 0) return;
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

      item.append(
        outra.foto
          ? quadroDaRepetida('Já guardada', outra, { detalhe: descricaoDaFoto(outra.foto).replace('Foto de ', '') })
          : quadroDaRepetida('Na fila de envio', outra),
        quadroDaRepetida('Enviando agora', nova, { nova: true }),
      );

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

const diaPorExtenso = (data) => data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

const camposDeData = () => [...$('sem-data-lista').querySelectorAll('input[type=date]')];

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

export function linkDasPendentes(quantas) {
  const link = $('principal-pendentes');
  link.hidden = quantas === 0;
  if ($('mais-sem-data')) {
    $('mais-sem-data').hidden = quantas === 0;
    $('mais-sem-data-quantas').textContent = quantas.toLocaleString('pt-BR');
  }
  link.replaceChildren(
    quantas === 1 ? '1 foto está sem data. ' : `${quantas.toLocaleString('pt-BR')} fotos estão sem data. `,
    el('strong', null, 'Acertar as datas'),
  );
}

const camposDasPendentes = () => [...$('pendentes').querySelectorAll('input[data-id]')];

function decisaoDoItem(item) {
  const campo = item.querySelector('input[data-id]');
  if (item.querySelector('input[type=checkbox]').checked) return { id: campo.dataset.id, dia: null };
  return campo.value && campo.value !== campo.dataset.atual ? { id: campo.dataset.id, dia: campo.value } : null;
}

function decisoesDoBloco(grupo) {
  return [...grupo.querySelectorAll('.pendentes__item')].map(decisaoDoItem).filter(Boolean);
}

let observadorDasPendentes = null;
const miniaturasDasPendentes = new WeakMap();

function observarPendentes() {
  observadorDasPendentes?.disconnect();
  observadorDasPendentes = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        const imagem = entrada.target;
        const pedido = miniaturasDasPendentes.get(imagem);
        if (!pedido) continue;
        if (!entrada.isIntersecting) {
          if (pedido.pedida) pedido.baixar.cancelar?.(pedido.sha);
          continue;
        }
        if (pedido.pedida) continue;
        pedido.pedida = true;
        pedido.baixar(pedido.sha).then(
          (url) => {
            observadorDasPendentes?.unobserve(imagem);
            imagem.src = url;
          },
          (falha) => {
            pedido.pedida = false;
            observadorDasPendentes?.unobserve(imagem);
            if (falha?.name === 'AbortError' && imagem.isConnected) observadorDasPendentes?.observe(imagem);
          },
        );
      }
    },
    { rootMargin: '400px 0px' },
  );
}

function renderBotoesDasPendentes() {
  for (const grupo of $('pendentes').querySelectorAll('.pendentes__grupo')) {
    for (const item of grupo.querySelectorAll('.pendentes__item')) {
      item.querySelector('input[data-id]').disabled = item.querySelector('input[type=checkbox]').checked;
      item.querySelector('[data-acao=salvar-uma]').disabled = pendentesOcupadas || !decisaoDoItem(item);
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
  observarPendentes();

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
        const item = el('li', 'pendentes__item');
        const miniatura = el('img', 'pendentes__imagem');
        miniatura.alt = '';
        miniatura.decoding = 'async';
        if (foto.miniatura) {
          miniaturasDasPendentes.set(miniatura, { sha: foto.miniatura, baixar, pedida: false });
          observadorDasPendentes.observe(miniatura);
        }
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

        const certa = el('label', 'pendentes__certa');
        const caixa = el('input');
        caixa.type = 'checkbox';
        caixa.dataset.de = foto.id;
        caixa.checked = certas.has(foto.id);
        certa.append(caixa, el('span', null, 'A data está certa'));
        const salvarUma = el('button', 'botao botao--secundario', 'Salvar esta');
        salvarUma.type = 'button';
        salvarUma.dataset.acao = 'salvar-uma';
        salvarUma.setAttribute('aria-label', `Salvar a data de ${nome}`);
        const quadro = el('span', 'pendentes__quadro');
        quadro.append(miniatura);
        item.append(quadro, rotulo, campo, certa, salvarUma);
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
  deslizarPendentes();
}

export function pendentesOcupado(ocupado, ids = []) {
  pendentesOcupadas = ocupado;
  const salvando = new Set(ids);
  for (const controle of $('pendentes').querySelectorAll('button, input')) controle.disabled = ocupado;
  for (const item of $('pendentes').querySelectorAll('.pendentes__item')) {
    const neste = ocupado && salvando.has(item.querySelector('input[data-id]').dataset.id);
    item.classList.toggle('pendentes__item--salvando', neste);
    item.setAttribute('aria-busy', String(neste));
    item.querySelector('[data-acao=salvar-uma]').textContent = neste ? 'Salvando...' : 'Salvar esta';
  }
  for (const salvar of $('pendentes').querySelectorAll('[data-acao=salvar]')) {
    salvar.textContent = ocupado && salvando.size !== 1 ? 'Salvando...' : 'Salvar datas';
  }
  if (!ocupado) renderBotoesDasPendentes();
}

const espera = (ms) => new Promise((pronto) => setTimeout(pronto, ms));
const idDoItem = (item) => item.querySelector('input[data-id]').dataset.id;
let posicoesDasPendentes = null;

export async function pendentesSalvas(ids) {
  const salvas = new Set(ids);
  const itens = [...$('pendentes').querySelectorAll('.pendentes__item')];
  const saem = itens.filter((item) => salvas.has(idDoItem(item)));
  if (saem.length === 0) return;
  for (const item of saem) {
    item.classList.remove('pendentes__item--salvando');
    item.classList.add('pendentes__item--salva');
  }
  await espera(semMovimento.matches ? 400 : 600);
  if (semMovimento.matches) return;
  for (const item of saem) item.classList.add('pendentes__item--saindo');
  await espera(300);
  posicoesDasPendentes = new Map(itens.filter((item) => !salvas.has(idDoItem(item))).map((item) => [idDoItem(item), item.getBoundingClientRect()]));
  setTimeout(() => {
    posicoesDasPendentes = null;
  }, 0);
}

function deslizarPendentes() {
  const antes = posicoesDasPendentes;
  posicoesDasPendentes = null;
  if (!antes) return;
  for (const item of $('pendentes').querySelectorAll('.pendentes__item')) {
    const de = antes.get(idDoItem(item));
    if (!de) continue;
    const para = item.getBoundingClientRect();
    const x = de.left - para.left;
    const y = de.top - para.top;
    if (x === 0 && y === 0) continue;
    item.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration: 420, easing: SUAVE });
  }
}

export function erroNasPendentes(mensagem) {
  $('pendentes-erro').hidden = !mensagem;
  $('pendentes-erro').textContent = mensagem ?? '';
}

function ligarPendentes(acoes) {
  const tela = $('pendentes');
  tela.addEventListener('input', renderBotoesDasPendentes);
  tela.addEventListener('click', (evento) => {
    const umaSo = evento.target.closest('button[data-acao=salvar-uma]');
    if (umaSo) {
      const decisao = decisaoDoItem(umaSo.closest('.pendentes__item'));
      if (decisao) acoes.datar([decisao]);
      return;
    }
    const botao = evento.target.closest('button[data-acao=aplicar]');
    if (!botao) return;
    const grupo = botao.closest('.pendentes__grupo');
    const dia = grupo.querySelector('.pendentes__ferramenta input').value;
    if (!dia) return;

    for (const campo of grupo.querySelectorAll('input[data-id]:not(:disabled)')) campo.value = dia;
    renderBotoesDasPendentes();
  });
  tela.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const mudancas = decisoesDoBloco(evento.target);
    if (mudancas.length > 0) acoes.datar(mudancas);
  });
}

export function anunciarEnvio(texto) {
  $('envio-status').textContent = texto;
}

function ligarArraste(acoes) {
  let contador = 0;
  const veu = $('veu');

  const ehArquivo = (evento) => evento.dataTransfer?.types?.includes('Files') ?? false;
  const mostrar = (ativo) => {
    if (ativo && veu.hidden) {
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

function ligarMenuMais() {
  const abrir = $('mais-abrir');
  const menu = $('mais');
  if (!abrir || !menu) return;
  const nativo = typeof menu.showPopover === 'function';
  const aberto = () => (nativo ? menu.matches(':popover-open') : !menu.hidden);
  const fechar = () => {
    if (!aberto()) return;
    if (nativo) menu.hidePopover();
    else {
      menu.hidden = true;
      aoMudar(false);
    }
  };
  const posicionar = () => {
    const caixa = abrir.getBoundingClientRect();
    menu.style.top = `${caixa.bottom + 8}px`;
    menu.style.right = `${Math.max(16, innerWidth - caixa.right)}px`;
  };
  const aoMudar = (abriu) => {
    abrir.setAttribute('aria-expanded', String(abriu));
    if (abriu) menu.querySelector('.mais__item:not([hidden])')?.focus();
  };

  if (nativo) {
    menu.addEventListener('beforetoggle', (evento) => {
      if (evento.newState === 'open') posicionar();
    });
    menu.addEventListener('toggle', (evento) => aoMudar(evento.newState === 'open'));
  } else {
    menu.hidden = true;
    abrir.addEventListener('click', () => {
      if (aberto()) {
        fechar();
        return;
      }
      posicionar();
      menu.hidden = false;
      aoMudar(true);
    });
    document.addEventListener('click', (evento) => {
      if (!menu.contains(evento.target) && !abrir.contains(evento.target)) fechar();
    });
    document.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape' || !aberto()) return;
      fechar();
      abrir.focus();
    });
  }
  menu.addEventListener('click', (evento) => {
    if (evento.target.closest('.mais__item')) fechar();
  });
  addEventListener('resize', () => aberto() && posicionar());
  addEventListener('scroll', fechar, { passive: true });
}

function ligarIrAoInicio() {
  const botao = $('ir-ao-inicio');
  if (!botao) return;
  let conferindo = false;
  const conferir = () => {
    conferindo = false;
    botao.hidden = scrollY < innerHeight * TELAS_ATE_O_BOTAO_DE_INICIO;
  };
  addEventListener(
    'scroll',
    () => {
      if (conferindo) return;
      conferindo = true;
      requestAnimationFrame(conferir);
    },
    { passive: true },
  );
  botao.addEventListener('click', () => {
    const perto = scrollY < innerHeight * TELAS_COM_ROLAGEM_SUAVE;
    scrollTo({ top: 0, behavior: perto && !semMovimento.matches ? 'smooth' : 'auto' });
    document.querySelector('.tela:not([hidden]) h2')?.focus({ preventScroll: true });
  });
}

export function ligarEventos(acoes) {
  ligarIrAoInicio();
  ligarMenuMais();
  const entrada = $('zona-entrada');
  $('zona').addEventListener('click', () => entrada.click());
  entrada.addEventListener('change', () => {
    acoes.arquivos([...entrada.files]);
    entrada.value = '';
  });
  $('fila-lista').addEventListener('click', (evento) => {
    const botao = evento.target.closest('button');
    if (botao) acoes.tentarDeNovo(Number(botao.dataset.n));
  });
  $('fila-limpar').addEventListener('click', acoes.limparFila);
  $('atalho-ver').addEventListener('click', verPeloAtalho);
  $('atalho-fechar').addEventListener('click', fecharAtalho);
  ligarPuxar(acoes.atualizar, () => Boolean(lerToken()) && !acoes.estaEmSelecao());
  $('atualizar').addEventListener('click', acoes.atualizar);
  $('atualizar-de-novo').addEventListener('click', acoes.atualizar);
  ligarArraste(acoes);
  ligarVisor(acoes);
  ligarPendentes(acoes);
  $('entrar-selecao').addEventListener('click', () => acoes.iniciarSelecao());
  $('apagar-selecionadas').addEventListener('click', acoes.abrirConfirmacaoSelecao);
  $('cancelar-selecao').addEventListener('click', acoes.sairDaSelecao);
  $('apagar-selecao-form').addEventListener('submit', (evento) => {
    evento.preventDefault();
    acoes.apagarSelecao();
  });
  $('apagar-selecao-cancelar').addEventListener('click', fecharApagarSelecao);
  $('apagar-selecao').addEventListener('click', (evento) => {
    if (evento.target === $('apagar-selecao') && !$('apagar-selecao-confirmar').disabled) fecharApagarSelecao();
  });
  $('apagar-selecao').addEventListener('cancel', (evento) => {
    if ($('apagar-selecao-confirmar').disabled) evento.preventDefault();
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !document.querySelector('dialog[open]')) acoes.sairDaSelecao();
  });

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

  $('login').addEventListener('cancel', (evento) => {
    if (!lerToken()) evento.preventDefault();
  });
}
