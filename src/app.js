// Estado, regras e eventos.

import * as github from './github.js';
import * as ui from './ui.js';

const PASTA_FOTOS = 'fotos/';

let fotos = null; // blobs originais da última leitura do repositório

function render() {
  if (!fotos) return;
  ui.renderPrincipal(fotos);
  ui.mostrarTela('principal');
}

async function lerFotos() {
  const arvore = await github.lerArvore();
  return arvore.filter((arquivo) => arquivo.caminho.startsWith(PASTA_FOTOS));
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
