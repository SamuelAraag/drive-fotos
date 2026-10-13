// Guarda no aparelho o que já veio do GitHub, para o app abrir e mostrar as fotos sem esperar
// a rede. Os arquivos ficam no Cache do navegador e a lista de fotos no localStorage.
// "Sair" apaga tudo: são fotos de um repositório privado.

import { BRANCH_DADOS, NOME_DO_CACHE_DA_LISTAGEM } from './github.js';

const NOME_DO_CACHE = 'drive-fotos-arquivos-v1';
const CHAVE_ORIGINAIS = 'drive-fotos.originais'; // { sha: [tamanho, último uso] }
// A base oficial e a de testes têm listas diferentes: cada uma guarda a sua.
const CHAVE_FOTOS = `drive-fotos.fotos.${BRANCH_DADOS}`;

// Miniaturas ficam sempre, porque são pequenas. As originais têm teto, e as que não são
// abertas há mais tempo saem primeiro.
const TETO_DE_ORIGINAIS = 1024 * 1024 * 1024;

// O Cache só aceita endereços http(s), então cada arquivo ganha um endereço inventado.
// O sha identifica o conteúdo: o mesmo sha é sempre o mesmo arquivo, e nunca fica velho.
const endereco = (sha) => `${location.origin}/__arquivo__/${sha}`;

let cache = null;

// Sem Cache (navegador antigo ou página fora de contexto seguro) o app funciona igual,
// só que baixando tudo de novo a cada abertura.
function abrir() {
  cache ??= 'caches' in window ? caches.open(NOME_DO_CACHE).catch(() => null) : Promise.resolve(null);
  return cache;
}

function lerIndice() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_ORIGINAIS)) ?? {};
  } catch {
    return {};
  }
}

function gravarIndice(indice) {
  try {
    localStorage.setItem(CHAVE_ORIGINAIS, JSON.stringify(indice));
  } catch {
    // localStorage cheio ou bloqueado: o índice é só para decidir o que sai primeiro
  }
}

// Tira as originais menos usadas até caber no teto.
async function enxugar(arquivos, teto) {
  const indice = lerIndice();
  const porUso = Object.entries(indice).sort((a, b) => a[1][1] - b[1][1]);
  let total = porUso.reduce((soma, [, [tamanho]]) => soma + tamanho, 0);
  for (const [sha, [tamanho]] of porUso) {
    if (total <= teto) break;
    await arquivos.delete(endereco(sha));
    delete indice[sha];
    total -= tamanho;
  }
  gravarIndice(indice);
}

export async function tem(sha) {
  const arquivos = await abrir();
  if (!arquivos) return false;
  try {
    return Boolean(await arquivos.match(endereco(sha)));
  } catch {
    return false;
  }
}

// Devolve o Blob guardado, ou null se o arquivo não está no aparelho.
export async function ler(sha) {
  const arquivos = await abrir();
  if (!arquivos) return null;
  try {
    const resposta = await arquivos.match(endereco(sha));
    if (!resposta) return null;
    const indice = lerIndice();
    if (indice[sha]) {
      indice[sha][1] = Date.now();
      gravarIndice(indice);
    }
    return await resposta.blob();
  } catch {
    return null;
  }
}

// `original` diz se o arquivo entra na conta do teto.
export async function guardar(sha, blob, { original }) {
  const arquivos = await abrir();
  if (!arquivos) return;
  try {
    await arquivos.put(endereco(sha), new Response(blob));
    if (!original) return;
    const indice = lerIndice();
    indice[sha] = [blob.size, Date.now()];
    gravarIndice(indice);
    await enxugar(arquivos, TETO_DE_ORIGINAIS);
  } catch {
    // O navegador recusou por falta de espaço: abre folga e segue sem guardar este.
    await enxugar(arquivos, TETO_DE_ORIGINAIS / 2).catch(() => {});
  }
}

// Tira do aparelho os arquivos de uma foto apagada.
export async function apagar(shas) {
  const arquivos = await abrir();
  if (!arquivos) return;
  const indice = lerIndice();
  for (const sha of shas) {
    await arquivos.delete(endereco(sha)).catch(() => {});
    delete indice[sha];
  }
  gravarIndice(indice);
}

export function lerFotos() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_FOTOS));
    return Array.isArray(lista) ? lista : null;
  } catch {
    return null;
  }
}

export function guardarFotos(lista) {
  try {
    localStorage.setItem(CHAVE_FOTOS, JSON.stringify(lista));
  } catch {
    // sem espaço: na próxima abertura a lista vem do GitHub, como antes
  }
}

export async function limpar() {
  cache = null;
  try {
    for (const chave of Object.keys(localStorage)) {
      if (chave === CHAVE_ORIGINAIS || chave.startsWith('drive-fotos.fotos.')) localStorage.removeItem(chave);
    }
    if ('caches' in window) {
      await caches.delete(NOME_DO_CACHE);
      await caches.delete(NOME_DO_CACHE_DA_LISTAGEM);
    }
  } catch {
    // nada a fazer: o que não deu para apagar fica órfão no navegador
  }
}

// Pede ao navegador para não apagar o que está guardado quando o disco apertar.
export function pedirPermanencia() {
  navigator.storage?.persist?.().catch(() => {});
}
