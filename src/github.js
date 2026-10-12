// Leitura e gravação do repositório de dados pela API do GitHub.

const DONO = 'samuelsantosbackupfiles';
const REPO = 'drive-fotos-dados';
const BRANCH_OFICIAL = 'main';
const BRANCH_DE_TESTES = 'testes';

// Rodando na própria máquina, o app usa a base de testes. A oficial só é lida e gravada
// pelo app publicado.
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const BRANCH = LOCAL ? BRANCH_DE_TESTES : BRANCH_OFICIAL;

const MAX_TENTATIVAS_DE_COMMIT = 4;

const URL_REPO = `https://api.github.com/repos/${DONO}/${REPO}`;
const CHAVE_TOKEN = 'drive-fotos.token';

export const REPO_DADOS = `${DONO}/${REPO}`;
export const BRANCH_DADOS = BRANCH;
export const BASE_DE_TESTES = LOCAL;

// tipo: 'token' | 'permissao' | 'ausente' | 'vazio' | 'conflito' | 'limite' | 'rede' | 'servidor'
export class ErroGitHub extends Error {
  constructor(tipo, mensagem, { status = null, esperaMs = null } = {}) {
    super(mensagem);
    this.name = 'ErroGitHub';
    this.tipo = tipo;
    this.status = status;
    this.esperaMs = esperaMs; // só no tipo 'limite': quanto esperar antes de tentar de novo
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
}

// O GitHub usa 403 e 429 tanto para falta de permissão quanto para limite de ritmo.
// O limite pede espera, não um token novo, e só os cabeçalhos dizem qual dos dois é.
// `cabecalho` lê um cabeçalho da resposta pelo nome, venha ela do fetch ou do XMLHttpRequest.
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
      // A API de Git Data responde 409 enquanto o repositório não tem nenhum commit.
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

// Devolve a resposta já conferida. Quem chama decide se lê como JSON ou como arquivo.
async function requisitar(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(`${URL_REPO}${caminho}`, {
      ...opcoes,
      // Sem isso o navegador pode devolver uma leitura velha do repositório.
      cache: 'no-store',
      headers: cabecalhos(opcoes.headers),
    });
  } catch {
    throw new ErroGitHub('rede', ERRO_DE_REDE);
  }

  if (resposta.ok) return resposta;
  throw erroDaResposta(resposta.status, (nome) => resposta.headers.get(nome));
}

// POST com acompanhamento do envio. O fetch não informa quanto do corpo já subiu, e o
// XMLHttpRequest informa. Só os blobs passam por aqui, porque são o grosso de cada foto.
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
    pedido.send(JSON.stringify(corpo));
  });
}

// Uma chamada lista o repositório inteiro. Cada item é { caminho, sha, tamanho }.
export async function lerArvore() {
  const resposta = await requisitar(`/git/trees/${encodeURIComponent(BRANCH)}?recursive=1`);
  const json = await resposta.json();
  return json.tree
    .filter((entrada) => entrada.type === 'blob')
    .map((entrada) => ({ caminho: entrada.path, sha: entrada.sha, tamanho: entrada.size }));
}

// Arquivo de repositório privado não abre por URL direta: vem pela API, com o token.
export async function lerBlob(sha) {
  const resposta = await requisitar(`/git/blobs/${sha}`, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  });
  return resposta.blob();
}

// Endereço temporário de um arquivo do repositório, que abre sem login: o GitHub põe nele uma
// chave de vida curta. Serve para mandar a foto a quem não tem acesso ao repositório.
// O formato "object" é o que devolve o endereço também para arquivo de mais de 1 MB.
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

// Envia um arquivo em base64 e devolve o sha dele. O arquivo fica no GitHub, mas só passa a
// existir no repositório quando um commit aponta para ele (ver `gravar`).
export async function enviarBlob(base64, aoProgredir = () => {}) {
  const blob = await enviarComProgresso('/git/blobs', { content: base64, encoding: 'base64' }, aoProgredir);
  return blob.sha;
}

// A ponta da branch, como este aparelho a deixou no último commit que fez. Poupa uma leitura a
// cada gravação. Se outro aparelho gravou no meio tempo, o GitHub recusa o avanço, e aí a
// ponta é lida de novo.
let pontaConhecida = null;

export function esquecerPonta() {
  pontaConhecida = null;
}

// Grava vários arquivos num commit só, pela API de Git Data: ou entram todos, ou nenhum.
// Cada arquivo é { caminho, sha }, que aponta para um arquivo que o GitHub já tem (enviado por
// `enviarBlob` ou já guardado no repositório), { caminho, texto } ou { caminho, apagar: true }.
export async function gravar(arquivos, mensagem) {
  const entradas = arquivos.map((arquivo) => {
    const entrada = { path: arquivo.caminho, mode: '100644', type: 'blob' };
    if (arquivo.apagar) entrada.sha = null; // sha nulo tira o arquivo da árvore
    else if (arquivo.sha) entrada.sha = arquivo.sha;
    else entrada.content = arquivo.texto; // o GitHub cria o blob junto com a árvore
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
      // 422 (ou 409) aqui quer dizer que a branch andou e o commit não é mais a continuação dela:
      // refaz a árvore e o commit sobre a ponta nova, lida agora.
      pontaConhecida = null;
      if (erro.status !== 422 && erro.status !== 409) throw erro;
      if (tentativa >= MAX_TENTATIVAS_DE_COMMIT) {
        throw new ErroGitHub('conflito', 'Outro aparelho está gravando ao mesmo tempo. Tente de novo em instantes.');
      }
    }
  }
}
