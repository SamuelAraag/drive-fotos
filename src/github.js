const DONO = 'samuelsantosbackupfiles';
const REPO = 'drive-fotos-dados';
const BRANCH_OFICIAL = 'main';
const BRANCH_DE_TESTES = 'testes';

const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const BRANCH = LOCAL ? BRANCH_DE_TESTES : BRANCH_OFICIAL;

const MAX_TENTATIVAS_DE_COMMIT = 4;
const TEMPO_MAXIMO_DE_ENVIO_MS = 5 * 60 * 1000;

const URL_REPO = `https://api.github.com/repos/${DONO}/${REPO}`;
const CHAVE_TOKEN = 'drive-fotos.token';

export const REPO_DADOS = `${DONO}/${REPO}`;
export const BRANCH_DADOS = BRANCH;
export const BASE_DE_TESTES = LOCAL;

export class ErroGitHub extends Error {
  constructor(tipo, mensagem, { status = null, esperaMs = null } = {}) {
    super(mensagem);
    this.name = 'ErroGitHub';
    this.tipo = tipo;
    this.status = status;
    this.esperaMs = esperaMs;
  }
}

export function lerToken() {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function salvarToken(token) {
  localStorage.setItem(CHAVE_TOKEN, token);
}

export function apagarToken() {
  localStorage.removeItem(CHAVE_TOKEN);
  esquecerPonta();
  listagem = null;
}

function esperaDoLimite(status, cabecalho) {
  const esperar = Number(cabecalho('retry-after'));
  if (esperar > 0) return esperar * 1000;
  if (cabecalho('x-ratelimit-remaining') === '0') {
    const volta = Number(cabecalho('x-ratelimit-reset')) * 1000;
    return Math.max(60000, volta - Date.now());
  }
  return status === 429 ? 60000 : null;
}

function erroDaResposta(status, cabecalho) {
  if (status === 403 || status === 429) {
    const esperaMs = esperaDoLimite(status, cabecalho);
    if (esperaMs != null) {
      const minutos = Math.ceil(esperaMs / 60000);
      const espera = minutos === 1 ? '1 minuto' : `${minutos} minutos`;
      return new ErroGitHub('limite', `O GitHub limitou o ritmo de requisições. Espere ${espera} e tente de novo.`, {
        status,
        esperaMs,
      });
    }
  }

  switch (status) {
    case 401:
      return new ErroGitHub('token', 'Token inválido ou expirado. Gere um novo token e cole de novo.');
    case 403:
      return new ErroGitHub(
        'permissao',
        `O GitHub recusou o acesso. Confira se o token tem a permissão Contents: Read and write no repositório ${REPO_DADOS}.`,
      );
    case 404:
      return new ErroGitHub(
        'ausente',
        `Não achei a branch ${BRANCH} de ${REPO_DADOS}. Confira se o repositório existe e se o token tem acesso a ele.`,
      );
    case 409:

      return new ErroGitHub(
        'vazio',
        `O repositório ${REPO_DADOS} ainda está vazio. Crie um commit inicial nele, por exemplo um README, e tente de novo.`,
        { status: 409 },
      );
    default:
      return new ErroGitHub('servidor', `O GitHub respondeu com erro ${status}. Tente de novo em instantes.`, { status });
  }
}

const ERRO_DE_REDE = 'Sem conexão com o GitHub. Confira a internet e tente de novo.';

function cabecalhos(extras) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${lerToken()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...extras,
  };
}

async function requisitar(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(`${URL_REPO}${caminho}`, {
      ...opcoes,

      cache: 'no-store',
      headers: cabecalhos(opcoes.headers),
    });
  } catch {
    throw new ErroGitHub('rede', ERRO_DE_REDE);
  }

  if (resposta.ok) return resposta;
  throw erroDaResposta(resposta.status, (nome) => resposta.headers.get(nome));
}

function enviarComProgresso(caminho, corpo, aoProgredir) {
  return new Promise((resolver, rejeitar) => {
    const pedido = new XMLHttpRequest();
    pedido.open('POST', `${URL_REPO}${caminho}`);
    for (const [nome, valor] of Object.entries(cabecalhos({ 'Content-Type': 'application/json' }))) {
      pedido.setRequestHeader(nome, valor);
    }
    pedido.upload.onprogress = (evento) => {
      if (evento.lengthComputable) aoProgredir(evento.loaded / evento.total);
    };
    pedido.timeout = TEMPO_MAXIMO_DE_ENVIO_MS;
    pedido.onload = () => {
      if (pedido.status < 200 || pedido.status >= 300) {
        rejeitar(erroDaResposta(pedido.status, (nome) => pedido.getResponseHeader(nome)));
        return;
      }
      try {
        resolver(JSON.parse(pedido.responseText));
      } catch {
        rejeitar(new ErroGitHub('servidor', 'O GitHub respondeu de um jeito inesperado. Tente de novo em instantes.'));
      }
    };
    pedido.onerror = () => rejeitar(new ErroGitHub('rede', ERRO_DE_REDE));
    pedido.ontimeout = () => rejeitar(new ErroGitHub('rede', 'O envio demorou mais de 5 minutos e foi interrompido. Tente enviar o arquivo novamente.'));
    pedido.send(JSON.stringify(corpo));
  });
}

const PASTAS_AO_MESMO_TEMPO = 6;
export const NOME_DO_CACHE_DA_LISTAGEM = 'drive-fotos-listagem-v1';
const ENDERECO_DA_LISTAGEM = `${location.origin}/__listagem__/${BRANCH}`;

const SEMPRE_POR_PASTA = LOCAL && new URLSearchParams(location.search).has('listagem-por-pasta');

let listagem = null;
let listagemLida = false;

async function lerListagemGuardada() {
  try {
    const resposta = await (await caches.open(NOME_DO_CACHE_DA_LISTAGEM)).match(ENDERECO_DA_LISTAGEM);
    const guardada = resposta ? await resposta.json() : null;
    return guardada?.raiz && guardada.pastas ? guardada : null;
  } catch {
    return null;
  }
}

async function guardarListagem() {
  try {
    await (await caches.open(NOME_DO_CACHE_DA_LISTAGEM)).put(ENDERECO_DA_LISTAGEM, new Response(JSON.stringify(listagem)));
  } catch {
  }
}

const juntar = (pasta, nome) => (pasta ? `${pasta}/${nome}` : nome);
const pastaDe = (caminho) => caminho.slice(0, Math.max(0, caminho.lastIndexOf('/')));

function pastasDaListaInteira(raiz, entradas) {
  const pastas = { '': { sha: raiz, arquivos: [], subpastas: [] } };
  for (const entrada of entradas) {
    if (entrada.type === 'tree') pastas[entrada.path] = { sha: entrada.sha, arquivos: [], subpastas: [] };
  }
  for (const entrada of entradas) {
    const mae = pastas[pastaDe(entrada.path)];
    if (!mae) continue;
    if (entrada.type === 'tree') mae.subpastas.push(entrada.path);
    else if (entrada.type === 'blob') mae.arquivos.push({ caminho: entrada.path, sha: entrada.sha, tamanho: entrada.size });
  }
  return pastas;
}

let pastasLendo = 0;
const pastasNaFila = [];

async function comVagaDePasta(tarefa) {
  while (pastasLendo >= PASTAS_AO_MESMO_TEMPO) await new Promise((seguir) => pastasNaFila.push(seguir));
  pastasLendo++;
  try {
    return await tarefa();
  } finally {
    pastasLendo--;
    pastasNaFila.shift()?.();
  }
}

function copiarPasta(caminho, antigas, novas) {
  novas[caminho] = antigas[caminho];
  for (const sub of antigas[caminho].subpastas) copiarPasta(sub, antigas, novas);
}

async function lerPasta(caminho, sha, antigas, novas) {
  if (antigas?.[caminho]?.sha === sha) {
    copiarPasta(caminho, antigas, novas);
    return;
  }
  const json = await comVagaDePasta(async () => (await requisitar(`/git/trees/${sha}`)).json());
  if (json.truncated) {
    throw new ErroGitHub(
      'cortada',
      `A pasta ${caminho || 'principal'} de ${REPO_DADOS} tem arquivos demais para o GitHub listar de uma vez. As fotos continuam guardadas, mas o app não consegue mostrar a lista completa.`,
    );
  }
  const pasta = { sha, arquivos: [], subpastas: [] };
  novas[caminho] = pasta;
  const subpastas = [];
  for (const entrada of json.tree) {
    const inteiro = juntar(caminho, entrada.path);
    if (entrada.type === 'tree') {
      pasta.subpastas.push(inteiro);
      subpastas.push(lerPasta(inteiro, entrada.sha, antigas, novas));
    } else if (entrada.type === 'blob') {
      pasta.arquivos.push({ caminho: inteiro, sha: entrada.sha, tamanho: entrada.size });
    }
  }
  await Promise.all(subpastas);
}

export async function lerArvore() {
  const ponta = await lerPonta();
  if (!listagem && !listagemLida) {
    listagemLida = true;
    listagem = await lerListagemGuardada();
  }
  if (listagem?.raiz !== ponta.arvore) {
    let pastas = null;
    if (!listagem && !SEMPRE_POR_PASTA) {
      const json = await (await requisitar(`/git/trees/${ponta.arvore}?recursive=1`)).json();
      if (!json.truncated) pastas = pastasDaListaInteira(ponta.arvore, json.tree);
    }
    if (!pastas) {
      pastas = {};
      await lerPasta('', ponta.arvore, listagem?.pastas, pastas);
    }
    listagem = { raiz: ponta.arvore, pastas };
    guardarListagem();
  }
  return Object.values(listagem.pastas).flatMap((pasta) => pasta.arquivos);
}

export async function lerBlob(sha) {
  const resposta = await requisitar(`/git/blobs/${sha}`, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  });
  return resposta.blob();
}

export async function linkTemporario(caminho) {
  const partes = caminho.split('/').map(encodeURIComponent).join('/');
  const resposta = await requisitar(`/contents/${partes}?ref=${encodeURIComponent(BRANCH)}`, {
    headers: { Accept: 'application/vnd.github.object+json' },
  });
  return (await resposta.json()).download_url ?? null;
}

async function enviar(metodo, caminho, corpo) {
  const resposta = await requisitar(caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return resposta.json();
}

async function lerPonta() {
  const resposta = await requisitar(`/branches/${encodeURIComponent(BRANCH)}`);
  const json = await resposta.json();
  return { commit: json.commit.sha, arvore: json.commit.commit.tree.sha };
}

export async function enviarBlob(base64, aoProgredir = () => {}) {
  const blob = await enviarComProgresso('/git/blobs', { content: base64, encoding: 'base64' }, aoProgredir);
  return blob.sha;
}

let pontaConhecida = null;

export function esquecerPonta() {
  pontaConhecida = null;
}

export async function gravar(arquivos, mensagem) {
  const entradas = arquivos.map((arquivo) => {
    const entrada = { path: arquivo.caminho, mode: '100644', type: 'blob' };
    if (arquivo.apagar) entrada.sha = null;
    else if (arquivo.sha) entrada.sha = arquivo.sha;
    else entrada.content = arquivo.texto;
    return entrada;
  });

  for (let tentativa = 1; ; tentativa++) {
    const ponta = pontaConhecida ?? (await lerPonta());
    const arvore = await enviar('POST', '/git/trees', { base_tree: ponta.arvore, tree: entradas });
    const commit = await enviar('POST', '/git/commits', { message: mensagem, tree: arvore.sha, parents: [ponta.commit] });
    try {
      await enviar('PATCH', `/git/refs/heads/${encodeURIComponent(BRANCH)}`, { sha: commit.sha });
      pontaConhecida = { commit: commit.sha, arvore: arvore.sha };
      return;
    } catch (erro) {
      pontaConhecida = null;
      if (erro.status !== 422 && erro.status !== 409) throw erro;
      if (tentativa >= MAX_TENTATIVAS_DE_COMMIT) {
        throw new ErroGitHub('conflito', 'Outro aparelho está gravando ao mesmo tempo. Tente de novo em instantes.');
      }
    }
  }
}
