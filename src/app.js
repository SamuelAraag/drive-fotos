// Estado, regras e eventos.

import * as github from './github.js';
import * as ui from './ui.js';

const MAX_DOWNLOADS = 6; // miniaturas baixando ao mesmo tempo

// fotos/2026/20261012T153045-a1b2.jpg -> pasta, ano e id.
const CAMINHO = /^(fotos|miniaturas)\/(\d{4})\/((\d{8})T(\d{6})-[0-9a-z]+)\.[0-9a-z]+$/i;

let fotos = null; // última leitura do repositório, da mais recente para a mais antiga
const miniaturas = new Map(); // sha -> promessa da URL da imagem já baixada
const espera = []; // downloads aguardando vaga
let baixando = 0;

// Monta a lista só com os caminhos da árvore: o id traz a data, e o ano do id é a pasta.
// Arquivo fora do padrão, posto à mão, fica de fora.
function montarFotos(arvore) {
  const porId = new Map();
  for (const arquivo of arvore) {
    const partes = CAMINHO.exec(arquivo.caminho);
    if (!partes) continue;
    const [, pasta, ano, id, dia, hora] = partes;
    if (!id.startsWith(ano)) continue;
    const foto = porId.get(id) ?? { id, dia, hora, sha: null, miniatura: null };
    if (pasta === 'fotos') foto.sha = arquivo.sha;
    else foto.miniatura = arquivo.sha;
    porId.set(id, foto);
  }
  return [...porId.values()].filter((foto) => foto.sha).sort((a, b) => (a.id < b.id ? 1 : -1));
}

function agruparPorDia(lista) {
  const grupos = [];
  for (const foto of lista) {
    const ultimo = grupos.at(-1);
    if (ultimo?.dia === foto.dia) ultimo.fotos.push(foto);
    else grupos.push({ dia: foto.dia, fotos: [foto] });
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
  ui.renderPrincipal(agruparPorDia(fotos), fotos.length, baixarMiniatura);
  ui.mostrarTela('principal');
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
  ui.limparPrincipal();
  esquecerMiniaturas();
  ui.mostrarTela(null);
  ui.abrirLogin();
}

ui.ligarEventos({
  entrar,
  sair,
  recarregar: carregar,
  trocarToken: () => ui.abrirLogin(),
});

if (github.lerToken()) carregar();
else {
  ui.mostrarTela(null);
  ui.abrirLogin();
}
