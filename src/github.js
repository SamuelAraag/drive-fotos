// Leitura e gravação do repositório de dados pela API do GitHub.

const DONO = 'samuelsantosbackupfiles';
const REPO = 'drive-fotos-dados';
const BRANCH = 'main';

const URL_REPO = `https://api.github.com/repos/${DONO}/${REPO}`;
const CHAVE_TOKEN = 'drive-fotos.token';

export const REPO_DADOS = `${DONO}/${REPO}`;
export const BRANCH_DADOS = BRANCH;

// tipo: 'token' | 'permissao' | 'ausente' | 'vazio' | 'conflito' | 'limite' | 'rede' | 'servidor'
export class ErroGitHub extends Error {
  constructor(tipo, mensagem) {
    super(mensagem);
    this.name = 'ErroGitHub';
    this.tipo = tipo;
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
function minutosDeEspera(resposta) {
  const esperar = Number(resposta.headers.get('retry-after'));
  if (esperar > 0) return Math.ceil(esperar / 60);
  if (resposta.headers.get('x-ratelimit-remaining') === '0') {
    const volta = Number(resposta.headers.get('x-ratelimit-reset')) * 1000;
    return Math.max(1, Math.ceil((volta - Date.now()) / 60000));
  }
  return resposta.status === 429 ? 1 : null;
}

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

  if (resposta.ok) return resposta.json();

  if (resposta.status === 403 || resposta.status === 429) {
    const minutos = minutosDeEspera(resposta);
    if (minutos != null) {
      const espera = minutos === 1 ? '1 minuto' : `${minutos} minutos`;
      throw new ErroGitHub('limite', `O GitHub limitou o ritmo de requisições. Espere ${espera} e tente de novo.`);
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
      );
    case 422:
      throw new ErroGitHub('conflito', 'Outro aparelho gravou antes.');
    default:
      throw new ErroGitHub('servidor', `O GitHub respondeu com erro ${resposta.status}. Tente de novo em instantes.`);
  }
}

// Uma chamada lista o repositório inteiro. Cada item é { caminho, sha, tamanho }.
export async function lerArvore() {
  const json = await requisitar(`/git/trees/${encodeURIComponent(BRANCH)}?recursive=1`);
  return json.tree
    .filter((entrada) => entrada.type === 'blob')
    .map((entrada) => ({ caminho: entrada.path, sha: entrada.sha, tamanho: entrada.size }));
}
