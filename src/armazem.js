import { BRANCH_DADOS, NOME_DO_CACHE_DA_LISTAGEM } from './github.js';

const NOME_DO_CACHE = 'drive-fotos-arquivos-v1';
const CHAVE_ORIGINAIS = 'drive-fotos.originais';

const CHAVE_FOTOS = `drive-fotos.fotos.${BRANCH_DADOS}`;

const CHAVE_INDICES = `drive-fotos.indices.${BRANCH_DADOS}`;

const TETO_DE_ORIGINAIS = 1024 * 1024 * 1024;

const endereco = (sha) => `${location.origin}/__arquivo__/${sha}`;

let cache = null;

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
  }
}

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
    await enxugar(arquivos, TETO_DE_ORIGINAIS / 2).catch(() => {});
  }
}

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
  }
}

export function manterIndices(atuais) {
  try {
    const antes = JSON.parse(localStorage.getItem(CHAVE_INDICES)) ?? [];
    localStorage.setItem(CHAVE_INDICES, JSON.stringify(atuais));
    const velhos = antes.filter((sha) => !atuais.includes(sha));
    if (velhos.length) apagar(velhos);
  } catch {
  }
}

export async function limpar() {
  cache = null;
  try {
    for (const chave of Object.keys(localStorage)) {
      if (chave === CHAVE_ORIGINAIS || chave.startsWith('drive-fotos.fotos.') || chave.startsWith('drive-fotos.indices.')) localStorage.removeItem(chave);
    }
    if ('caches' in window) {
      await caches.delete(NOME_DO_CACHE);
      await caches.delete(NOME_DO_CACHE_DA_LISTAGEM);
    }
  } catch {
  }
}

export function pedirPermanencia() {
  navigator.storage?.persist?.().catch(() => {});
}
