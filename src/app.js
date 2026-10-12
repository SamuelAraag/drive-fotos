// Estado, regras e eventos.

import * as armazem from './armazem.js';
import * as foto from './foto.js';
import * as github from './github.js';
import * as ui from './ui.js';

const MAX_DOWNLOADS = 6; // miniaturas baixando ao mesmo tempo
const TETO_NA_MEMORIA = 150 * 1024 * 1024; // originais abertas ou prontas para abrir, em bytes
const MAX_DE_FUNDO = 2; // originais baixando em segundo plano ao mesmo tempo
const ESPERA_DE_FUNDO = 600; // ms que a foto precisa ficar na tela antes de entrar na fila de fundo

// fotos/2026/20261012T153045-a1b2.jpg -> pasta, ano e id.
const CAMINHO = /^(fotos|miniaturas)\/(\d{4})\/((\d{8})T(\d{6})-[0-9a-z]+)\.[0-9a-z]+$/i;

let fotos = null; // última leitura do repositório, da mais recente para a mais antiga
const miniaturas = new Map(); // sha -> promessa da URL da imagem já baixada
const espera = []; // downloads aguardando vaga
let baixando = 0;
const buscando = new Map(); // sha -> promessa do Blob em download agora, para não baixar duas vezes
const originais = new Map(); // sha -> { promessa da URL, tamanho }; a menos usada sai primeiro
const naTela = new Map(); // id -> temporizador das fotos visíveis, à espera da fila de fundo
const filaDeFundo = []; // ids das fotos visíveis cuja original ainda não está no aparelho
let fundoAtivos = 0;
let fundoPausadoAte = 0;
let aberta = null; // id da foto aberta em tela cheia

// Fila de envio. Cada item: { n, arquivo, id, estado, mensagem }.
// estado: 'aguardando' | 'enviando' | 'concluido' | 'erro'
let fila = [];
let proximoItem = 1;
let enviando = false;
let pausadaAte = null; // quando o GitHub limita o ritmo: hora em que a fila retoma
let trava = null; // mantém a tela do celular acordada enquanto a fila corre
let progresso = 0; // de 0 a 1, da foto que está subindo agora

const porIdDecrescente = (a, b) => (a.id < b.id ? 1 : -1);

// Monta a lista só com os caminhos da árvore: o id traz a data, e o ano do id é a pasta.
// Arquivo fora do padrão, posto à mão, fica de fora.
function montarFotos(arvore) {
  const porId = new Map();
  for (const arquivo of arvore) {
    const partes = CAMINHO.exec(arquivo.caminho);
    if (!partes) continue;
    const [, pasta, ano, id, dia, hora] = partes;
    if (!id.startsWith(ano)) continue;
    const item = porId.get(id) ?? { id, dia, hora, sha: null, miniatura: null, tamanho: 0 };
    if (pasta === 'fotos') {
      item.sha = arquivo.sha;
      item.tamanho = arquivo.tamanho ?? 0;
    } else item.miniatura = arquivo.sha;
    porId.set(id, item);
  }
  return [...porId.values()].filter((item) => item.sha).sort(porIdDecrescente);
}

function agruparPorDia(lista) {
  const grupos = [];
  for (const item of lista) {
    const ultimo = grupos.at(-1);
    if (ultimo?.dia === item.dia) ultimo.fotos.push(item);
    else grupos.push({ dia: item.dia, fotos: [item] });
  }
  return grupos;
}

// Todo arquivo passa por aqui: primeiro o que já está guardado no aparelho, depois o GitHub.
// O que vem do GitHub fica guardado para a próxima vez.
function obterBlob(sha, { original }) {
  if (!buscando.has(sha)) {
    const promessa = (async () => {
      const guardado = await armazem.ler(sha);
      if (guardado) return guardado;
      const blob = await github.lerBlob(sha);
      armazem.guardar(sha, blob, { original }); // não espera: guardar não pode atrasar a tela
      return blob;
    })();
    promessa.then(
      () => buscando.delete(sha),
      () => buscando.delete(sha),
    );
    buscando.set(sha, promessa);
  }
  return buscando.get(sha);
}

function proximoDownload() {
  if (baixando >= MAX_DOWNLOADS || espera.length === 0) return;
  baixando++;
  const { sha, resolver, rejeitar } = espera.shift();
  obterBlob(sha, { original: false })
    .then((blob) => resolver(URL.createObjectURL(blob)), rejeitar)
    .finally(() => {
      baixando--;
      proximoDownload();
    });
}

// Cada miniatura é lida uma vez por sessão. A que falha sai do mapa para poder tentar de novo.
function baixarMiniatura(sha) {
  if (!miniaturas.has(sha)) {
    const promessa = new Promise((resolver, rejeitar) => {
      espera.push({ sha, resolver, rejeitar });
      proximoDownload();
    });
    promessa.catch(() => miniaturas.delete(sha));
    miniaturas.set(sha, promessa);
  }
  return miniaturas.get(sha);
}

function esquecerMiniaturas() {
  espera.length = 0;
  for (const promessa of miniaturas.values()) promessa.then(URL.revokeObjectURL, () => {});
  miniaturas.clear();
}

// Originais prontas na memória: a aberta, as vizinhas e as vistas há pouco. O teto é em bytes,
// porque uma foto pode ter 300 KB ou 25 MB. A foto aberta nunca sai.
function baixarOriginal(item) {
  const guardada = originais.get(item.sha);
  if (guardada) {
    // Volta para o fim da fila: foi a usada mais recentemente.
    originais.delete(item.sha);
    originais.set(item.sha, guardada);
    return guardada.promessa;
  }
  const promessa = obterBlob(item.sha, { original: true }).then((blob) => URL.createObjectURL(blob));
  promessa.catch(() => originais.delete(item.sha));
  originais.set(item.sha, { promessa, tamanho: item.tamanho });

  const shaAberta = fotos?.find((outra) => outra.id === aberta)?.sha;
  let total = [...originais.values()].reduce((soma, entrada) => soma + entrada.tamanho, 0);
  for (const [sha, entrada] of originais) {
    if (total <= TETO_NA_MEMORIA) break;
    if (sha === shaAberta || sha === item.sha) continue;
    entrada.promessa.then(URL.revokeObjectURL, () => {});
    originais.delete(sha);
    total -= entrada.tamanho;
  }
  return promessa;
}

function esquecerOriginais() {
  for (const { promessa } of originais.values()) promessa.then(URL.revokeObjectURL, () => {});
  originais.clear();
}

// Fila de fundo: baixa para o aparelho a original de toda foto que está na tela, para ela
// abrir na hora quando for tocada. Vai para o disco, não para a memória.

function tirarDaFilaDeFundo(id) {
  const posicao = filaDeFundo.indexOf(id);
  if (posicao >= 0) filaDeFundo.splice(posicao, 1);
}

// A interface avisa quando uma foto entra ou sai da tela. Sem id, a grade foi redesenhada.
function visibilidade(id, visivel) {
  if (id == null) {
    for (const temporizador of naTela.values()) clearTimeout(temporizador);
    naTela.clear();
    filaDeFundo.length = 0;
    return;
  }
  if (!visivel) {
    clearTimeout(naTela.get(id));
    naTela.delete(id);
    tirarDaFilaDeFundo(id); // saiu da tela antes da vez dela: não baixa
    return;
  }
  // Quem pediu economia de dados ao navegador não tem download que não pediu.
  if (naTela.has(id) || navigator.connection?.saveData) return;
  // Só entra na fila a foto que ficou na tela: rolar depressa não dispara downloads.
  naTela.set(
    id,
    setTimeout(() => {
      filaDeFundo.push(id);
      proximoDeFundo();
    }, ESPERA_DE_FUNDO),
  );
}

async function proximoDeFundo() {
  // O envio tem a vez: os dois disputam a mesma rede e o mesmo limite do GitHub.
  if (enviando || fundoAtivos >= MAX_DE_FUNDO || filaDeFundo.length === 0 || Date.now() < fundoPausadoAte) return;
  const item = fotos?.find((candidato) => candidato.id === filaDeFundo[0]);
  filaDeFundo.shift();
  if (!item) {
    proximoDeFundo();
    return;
  }
  fundoAtivos++;
  try {
    if (!(await armazem.tem(item.sha))) await obterBlob(item.sha, { original: true });
  } catch (erro) {
    // Em segundo plano nada vira aviso. O limite de ritmo só faz a fila esperar.
    if (erro.tipo === 'limite') {
      fundoPausadoAte = Date.now() + erro.esperaMs;
      setTimeout(proximoDeFundo, erro.esperaMs);
    }
    if (erro.tipo === 'token') filaDeFundo.length = 0;
  } finally {
    fundoAtivos--;
    proximoDeFundo();
  }
}

// Deixa as vizinhas prontas na memória, para a seta passar de foto sem espera.
function prepararVizinhas(indice) {
  for (const vizinha of [fotos[indice + 1], fotos[indice - 1]]) {
    if (vizinha) baixarOriginal(vizinha).catch(() => {});
  }
}

async function mostrarAberta() {
  const indice = fotos.findIndex((item) => item.id === aberta);
  if (indice < 0) {
    ui.fecharVisor();
    return;
  }
  const item = fotos[indice];
  ui.renderVisor(item, {
    posicao: indice + 1,
    total: fotos.length,
    temAnterior: indice > 0,
    temProxima: indice < fotos.length - 1,
  });
  try {
    const url = await baixarOriginal(item);
    if (aberta !== item.id) return;
    ui.mostrarOriginal(item, url);
    prepararVizinhas(fotos.findIndex((outra) => outra.id === item.id));
  } catch (erro) {
    if (aberta !== item.id) return;
    if (erro.tipo === 'token') {
      ui.fecharVisor();
      github.apagarToken();
      ui.abrirLogin(erro.message);
      return;
    }
    ui.erroNoVisor(erro.message ?? 'Não deu para carregar a foto.', { podeTentar: true });
  }
}

function abrirFoto(id) {
  if (!fotos?.some((item) => item.id === id)) return;
  aberta = id;
  ui.abrirVisor();
  // O voltar do navegador fecha a foto, em vez de sair do app.
  history.pushState({ visor: true }, '');
  mostrarAberta();
}

// A ordem é a da grade: a próxima é a foto seguinte, mais antiga.
function passarFoto(sentido) {
  if (aberta == null) return;
  const vizinha = fotos[fotos.findIndex((item) => item.id === aberta) + sentido];
  if (!vizinha) return;
  aberta = vizinha.id;
  mostrarAberta();
}

// Chamado quando o visor fecha, seja pelo botão, pelo Esc ou pelo voltar do navegador.
function fotoFechada() {
  const id = aberta;
  aberta = null;
  if (history.state?.visor) history.back();
  if (id != null) ui.voltarParaAFoto(id);
}

function render() {
  if (!fotos) return;
  ui.renderPrincipal(agruparPorDia(fotos), fotos.length, baixarMiniatura);
  ui.mostrarTela('principal');
}

function renderFila() {
  ui.renderFila(fila, { enviando, pausadaAte, progresso });
}

async function lerFotos() {
  return montarFotos(await github.lerArvore());
}

function mesmaLista(a, b) {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id && item.sha === b[i].sha && item.miniatura === b[i].miniatura);
}

// A lista guardada no aparelho aparece na hora, e a do GitHub confere por trás.
async function carregar() {
  const guardadas = armazem.lerFotos();
  if (guardadas) {
    fotos = guardadas;
    render();
  } else {
    ui.mostrarTela('carregando');
  }
  try {
    const novas = await lerFotos();
    // Se a lista mudou enquanto a leitura corria (um envio, por exemplo), a que está na tela vale.
    if (guardadas && fotos !== guardadas) return;
    armazem.guardarFotos(novas);
    if (guardadas && mesmaLista(novas, guardadas)) return;
    fotos = novas;
    render();
  } catch (erro) {
    if (erro.tipo === 'token') {
      github.apagarToken();
      ui.abrirLogin(erro.message);
      return;
    }
    // Com a lista guardada na tela, falha de rede não tira o que já está aparecendo.
    if (guardadas) return;
    ui.renderErro(erro.message);
    ui.mostrarTela('erro');
    ui.focarTela('erro');
  }
}

async function entrar(token) {
  if (!token) {
    ui.erroNoLogin('Cole o token para entrar.');
    return;
  }
  // Com um token antigo guardado (login aberto por "Trocar token"), a tentativa que
  // falha não pode apagar o antigo.
  const anterior = github.lerToken();
  github.salvarToken(token);
  ui.loginOcupado(true);
  try {
    fotos = await lerFotos();
    armazem.guardarFotos(fotos);
    armazem.pedirPermanencia();
    ui.fecharLogin();
    render();
    ui.focarTela('principal');
    bombear(); // o login pode ter sido aberto no meio de uma fila, por token vencido
  } catch (erro) {
    if (anterior) github.salvarToken(anterior);
    else github.apagarToken();
    ui.erroNoLogin(erro.message);
  } finally {
    ui.loginOcupado(false);
  }
}

function sair() {
  github.apagarToken();
  fotos = null;
  fila = [];
  pausadaAte = null;
  ui.esquecerEnvio();
  renderFila();
  ui.fecharVisor();
  ui.limparPrincipal();
  visibilidade(null);
  esquecerMiniaturas();
  esquecerOriginais();
  armazem.limpar();
  ui.mostrarTela(null);
  ui.abrirLogin();
}

// Envio

function plural(n, um, varios) {
  return n === 1 ? um : varios;
}

// Separa o que entra na fila do que fica de fora, com o motivo de cada recusa.
function adicionarArquivos(arquivos, { temPasta = false } = {}) {
  const recusas = [];
  if (temPasta) recusas.push('Pastas não são aceitas. Solte as fotos de dentro dela.');

  const vazios = arquivos.filter((arquivo) => arquivo.size === 0);
  const naoImagens = arquivos.filter((arquivo) => arquivo.size > 0 && !foto.ehImagem(arquivo));
  const grandes = arquivos.filter((arquivo) => foto.ehImagem(arquivo) && arquivo.size > foto.TAMANHO_MAXIMO);
  const aceitos = arquivos.filter(
    (arquivo) => arquivo.size > 0 && foto.ehImagem(arquivo) && arquivo.size <= foto.TAMANHO_MAXIMO,
  );

  const nomes = (lista) => lista.map((arquivo) => arquivo.name).join(', ');
  if (vazios.length) recusas.push(`${nomes(vazios)}: ${plural(vazios.length, 'arquivo vazio', 'arquivos vazios')}.`);
  if (naoImagens.length) recusas.push(`${nomes(naoImagens)}: ${plural(naoImagens.length, 'não é imagem', 'não são imagens')}.`);
  if (grandes.length) {
    recusas.push(`${nomes(grandes)}: ${plural(grandes.length, 'passa', 'passam')} de ${foto.fmtTamanho(foto.TAMANHO_MAXIMO)}.`);
  }
  ui.erroNaZona(recusas.length ? `Ficou de fora. ${recusas.join(' ')}` : null);

  for (const arquivo of aceitos) {
    fila.push({ n: proximoItem++, arquivo, id: null, estado: 'aguardando', mensagem: null });
  }
  if (aceitos.length === 0) return;
  renderFila();
  bombear();
}

async function manterTelaAcordada() {
  try {
    trava ??= (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    trava = null; // sem suporte ou negado: a fila corre do mesmo jeito
  }
}

function soltarTela() {
  trava?.release().catch(() => {});
  trava = null;
}

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function enviarFoto(item) {
  const { arquivo } = item;
  const data = foto.dataDoArquivo(arquivo);
  // O id nasce uma vez por item: "tentar de novo" regrava os mesmos caminhos, sem duplicar a foto.
  item.id ??= foto.gerarId(data);
  const caminhos = foto.caminhos(item.id, foto.extensaoDe(arquivo));
  const miniatura = await foto.gerarMiniatura(arquivo);
  const registro = foto.montarRegistro({ id: item.id, arquivo, data, miniatura, blob: caminhos.blob });

  const arquivos = [{ caminho: caminhos.blob, base64: await foto.paraBase64(arquivo) }];
  if (miniatura) arquivos.push({ caminho: caminhos.miniatura, base64: await foto.paraBase64(miniatura.blob) });
  arquivos.push({ caminho: caminhos.registro, texto: `${JSON.stringify(registro, null, 2)}\n` });

  const shas = await github.gravar(arquivos, `foto: ${item.id}`, (fracao) => {
    progresso = fracao;
    ui.renderProgresso(progresso);
  });

  // A miniatura recém-gerada já serve para a grade, sem baixar de volta.
  const shaDaMiniatura = miniatura ? shas[caminhos.miniatura] : null;
  if (shaDaMiniatura && !miniaturas.has(shaDaMiniatura)) {
    miniaturas.set(shaDaMiniatura, Promise.resolve(URL.createObjectURL(miniatura.blob)));
  }
  const nova = {
    id: item.id,
    dia: item.id.slice(0, 8),
    hora: item.id.slice(9, 15),
    sha: shas[caminhos.blob],
    miniatura: shaDaMiniatura,
    tamanho: arquivo.size,
  };
  // O que acabou de subir já está aqui: vai para o aparelho sem precisar baixar de volta.
  armazem.guardar(nova.sha, arquivo, { original: true });
  if (shaDaMiniatura) armazem.guardar(shaDaMiniatura, miniatura.blob, { original: false });
  if (fotos) {
    fotos = [nova, ...fotos.filter((existente) => existente.id !== nova.id)].sort(porIdDecrescente);
    armazem.guardarFotos(fotos);
    render();
    // O efeito de chegada corre por conta própria: a fila não espera por ele.
    ui.fotoChegou(nova.id, { ultimaDaLeva: !fila.some((outro) => outro.estado === 'aguardando') });
  }
}

// Fila única: uma foto por vez. Falha em uma não para as outras.
async function bombear() {
  if (enviando || !github.lerToken()) return;
  enviando = true;
  await manterTelaAcordada();
  for (;;) {
    const item = fila.find((candidato) => candidato.estado === 'aguardando');
    if (!item) break;
    item.estado = 'enviando';
    item.mensagem = null;
    progresso = 0;
    renderFila();
    try {
      await enviarFoto(item);
      item.estado = 'concluido';
    } catch (erro) {
      if (erro.tipo === 'limite') {
        // Não é falha da foto: espera o GitHub liberar e retoma sozinha.
        item.estado = 'aguardando';
        pausadaAte = new Date(Date.now() + erro.esperaMs);
        renderFila();
        await dormir(erro.esperaMs);
        pausadaAte = null;
        continue;
      }
      if (erro.tipo === 'token') {
        // As que faltam ficam na fila e sobem depois do novo login.
        item.estado = 'aguardando';
        github.apagarToken();
        ui.abrirLogin(erro.message);
        break;
      }
      item.estado = 'erro';
      item.mensagem = erro instanceof github.ErroGitHub ? erro.message : 'Não deu para preparar a foto. Tente de novo.';
    }
    renderFila();
  }
  enviando = false;
  soltarTela();
  proximoDeFundo(); // a fila de fundo esperou o envio terminar
  // A leva acabou: o que subiu sai da fila, e só as falhas ficam na tela.
  const enviadas = fila.filter((item) => item.estado === 'concluido').length;
  fila = fila.filter((item) => item.estado !== 'concluido');
  renderFila();
  if (enviadas > 0) {
    ui.anunciarEnvio(enviadas === 1 ? 'Foto enviada.' : `${enviadas} fotos enviadas.`);
  }
}

function tentarDeNovo(n) {
  const item = fila.find((candidato) => candidato.n === n);
  if (!item || item.estado !== 'erro') return;
  item.estado = 'aguardando';
  item.mensagem = null;
  renderFila();
  bombear();
}

function dispensarFalhas() {
  fila = fila.filter((item) => item.estado !== 'erro');
  renderFila();
}

ui.ligarEventos({
  entrar,
  sair,
  recarregar: carregar,
  trocarToken: () => ui.abrirLogin(),
  arquivos: adicionarArquivos,
  tentarDeNovo,
  limparFila: dispensarFalhas,
  podeEnviar: () => Boolean(fotos && github.lerToken()) && !ui.visorAberto(),
  abrirFoto,
  passarFoto,
  recarregarFoto: mostrarAberta,
  fotoFechada,
  visibilidade,
});

// A fila vive só nesta página: sair no meio perde o que ainda não subiu.
window.addEventListener('beforeunload', (evento) => {
  if (fila.some((item) => item.estado === 'aguardando' || item.estado === 'enviando')) evento.preventDefault();
});

// O voltar do navegador, com a foto aberta, só fecha a foto.
window.addEventListener('popstate', () => ui.fecharVisor());

// O navegador solta a trava quando a aba some. Ao voltar, com a fila correndo, pede de novo.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && enviando) {
    trava = null;
    manterTelaAcordada();
  }
});

if (github.lerToken()) carregar();
else {
  ui.mostrarTela(null);
  ui.abrirLogin();
}
