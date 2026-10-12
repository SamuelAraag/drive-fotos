// Estado, regras e eventos.

import * as foto from './foto.js';
import * as github from './github.js';
import * as ui from './ui.js';

const MAX_DOWNLOADS = 6; // miniaturas baixando ao mesmo tempo

// fotos/2026/20261012T153045-a1b2.jpg -> pasta, ano e id.
const CAMINHO = /^(fotos|miniaturas)\/(\d{4})\/((\d{8})T(\d{6})-[0-9a-z]+)\.[0-9a-z]+$/i;

let fotos = null; // última leitura do repositório, da mais recente para a mais antiga
const miniaturas = new Map(); // sha -> promessa da URL da imagem já baixada
const espera = []; // downloads aguardando vaga
let baixando = 0;

// Fila de envio. Cada item: { n, arquivo, id, estado, mensagem }.
// estado: 'aguardando' | 'enviando' | 'concluido' | 'erro'
let fila = [];
let proximoItem = 1;
let enviando = false;
let pausadaAte = null; // quando o GitHub limita o ritmo: hora em que a fila retoma
let trava = null; // mantém a tela do celular acordada enquanto a fila corre
let progresso = 0; // de 0 a 1, da foto que está subindo agora
let destaque = null; // id da última foto enviada nesta sessão, marcada na grade

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
    const item = porId.get(id) ?? { id, dia, hora, sha: null, miniatura: null };
    if (pasta === 'fotos') item.sha = arquivo.sha;
    else item.miniatura = arquivo.sha;
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

function proximoDownload() {
  if (baixando >= MAX_DOWNLOADS || espera.length === 0) return;
  baixando++;
  const { sha, resolver, rejeitar } = espera.shift();
  github
    .lerBlob(sha)
    .then((blob) => resolver(URL.createObjectURL(blob)), rejeitar)
    .finally(() => {
      baixando--;
      proximoDownload();
    });
}

// Cada miniatura é baixada uma vez por sessão. A que falha sai do mapa para poder tentar de novo.
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

function render() {
  if (!fotos) return;
  ui.renderPrincipal(agruparPorDia(fotos), fotos.length, baixarMiniatura, destaque);
  ui.mostrarTela('principal');
}

function renderFila() {
  ui.renderFila(fila, { enviando, pausadaAte, progresso });
}

async function lerFotos() {
  return montarFotos(await github.lerArvore());
}

async function carregar() {
  ui.mostrarTela('carregando');
  try {
    fotos = await lerFotos();
    render();
  } catch (erro) {
    if (erro.tipo === 'token') {
      github.apagarToken();
      ui.abrirLogin(erro.message);
      return;
    }
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
  destaque = null;
  renderFila();
  ui.limparPrincipal();
  esquecerMiniaturas();
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
  };
  if (fotos) {
    fotos = [nova, ...fotos.filter((existente) => existente.id !== nova.id)].sort(porIdDecrescente);
    destaque = nova.id;
    render();
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
  // A leva acabou: o que subiu sai da fila, e só as falhas ficam na tela.
  const enviadas = fila.filter((item) => item.estado === 'concluido').length;
  fila = fila.filter((item) => item.estado !== 'concluido');
  renderFila();
  if (enviadas > 0) {
    ui.anunciarEnvio(enviadas === 1 ? 'Foto enviada.' : `${enviadas} fotos enviadas.`);
    ui.mostrarDestaque();
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
  podeEnviar: () => Boolean(fotos && github.lerToken()),
});

// A fila vive só nesta página: sair no meio perde o que ainda não subiu.
window.addEventListener('beforeunload', (evento) => {
  if (fila.some((item) => item.estado === 'aguardando' || item.estado === 'enviando')) evento.preventDefault();
});

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
