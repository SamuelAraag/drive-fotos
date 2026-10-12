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
}

// O GitHub usa 403 e 429 tanto para falta de permissão quanto para limite de ritmo.
// O limite pede espera, não um token novo, e só os cabeçalhos dizem qual dos dois é.
function esperaDoLimite(resposta) {
  const esperar = Number(resposta.headers.get('retry-after'));
  if (esperar > 0) return esperar * 1000;
  if (resposta.headers.get('x-ratelimit-remaining') === '0') {
    const volta = Number(resposta.headers.get('x-ratelimit-reset')) * 1000;
    return Math.max(60000, volta - Date.now());
  }
  return resposta.status === 429 ? 60000 : null;
}

// Devolve a resposta já conferida. Quem chama decide se lê como JSON ou como arquivo.
async function requisitar(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(`${URL_REPO}${caminho}`, {
      ...opcoes,
      // Sem isso o navegador pode devolver uma leitura velha do repositório.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${lerToken()}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...opcoes.headers,
      },
    });
  } catch {
    throw new ErroGitHub('rede', 'Sem conexão com o GitHub. Confira a internet e tente de novo.');
  }

  if (resposta.ok) return resposta;

  if (resposta.status === 403 || resposta.status === 429) {
    const esperaMs = esperaDoLimite(resposta);
    if (esperaMs != null) {
      const minutos = Math.ceil(esperaMs / 60000);
      const espera = minutos === 1 ? '1 minuto' : `${minutos} minutos`;
      throw new ErroGitHub('limite', `O GitHub limitou o ritmo de requisições. Espere ${espera} e tente de novo.`, {
        status: resposta.status,
        esperaMs,
      });
    }
  }

  switch (resposta.status) {
    case 401:
      throw new ErroGitHub('token', 'Token inválido ou expirado. Gere um novo token e cole de novo.');
    case 403:
      throw new ErroGitHub(
        'permissao',
        `O GitHub recusou o acesso. Confira se o token tem a permissão Contents: Read and write no repositório ${REPO_DADOS}.`,
      );
    case 404:
      throw new ErroGitHub(
        'ausente',
        `Não achei a branch ${BRANCH} de ${REPO_DADOS}. Confira se o repositório existe e se o token tem acesso a ele.`,
      );
    case 409:
      // A API de Git Data responde 409 enquanto o repositório não tem nenhum commit.
      throw new ErroGitHub(
        'vazio',
        `O repositório ${REPO_DADOS} ainda está vazio. Crie um commit inicial nele, por exemplo um README, e tente de novo.`,
        { status: 409 },
      );
    default:
      throw new ErroGitHub('servidor', `O GitHub respondeu com erro ${resposta.status}. Tente de novo em instantes.`, {
        status: resposta.status,
      });
  }
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

// Grava vários arquivos num commit só, pela API de Git Data: ou entram todos, ou nenhum.
// Cada arquivo é { caminho, base64 } ou { caminho, texto }. Devolve { caminho: sha } dos
// que subiram em base64.
export async function gravar(arquivos, mensagem) {
  const entradas = [];
  const shas = {};
  for (const arquivo of arquivos) {
    const entrada = { path: arquivo.caminho, mode: '100644', type: 'blob' };
    if (arquivo.texto != null) {
      entrada.content = arquivo.texto; // o GitHub cria o blob junto com a árvore
    } else {
      const blob = await enviar('POST', '/git/blobs', { content: arquivo.base64, encoding: 'base64' });
      entrada.sha = blob.sha;
      shas[arquivo.caminho] = blob.sha;
    }
    entradas.push(entrada);
  }

  // Os blobs já estão no GitHub. Se outro aparelho moveu a branch no meio do caminho,
  // refaz só a árvore e o commit sobre a ponta nova.
  for (let tentativa = 1; ; tentativa++) {
    const ponta = await lerPonta();
    const arvore = await enviar('POST', '/git/trees', { base_tree: ponta.arvore, tree: entradas });
    const commit = await enviar('POST', '/git/commits', { message: mensagem, tree: arvore.sha, parents: [ponta.commit] });
    try {
      await enviar('PATCH', `/git/refs/heads/${encodeURIComponent(BRANCH)}`, { sha: commit.sha });
      return shas;
    } catch (erro) {
      // 422 (ou 409) aqui quer dizer que a branch andou e o commit não é mais a continuação dela.
      if (erro.status !== 422 && erro.status !== 409) throw erro;
      if (tentativa >= MAX_TENTATIVAS_DE_COMMIT) {
        throw new ErroGitHub('conflito', 'Outro aparelho está gravando ao mesmo tempo. Tente de novo em instantes.');
      }
    }
  }
}
