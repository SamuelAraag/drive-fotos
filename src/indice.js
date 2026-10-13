const VERSAO = 2;
const CAMINHO_DE_INDICE = /^indices\/(\d{4})\.json$/;
const CAMINHO_DE_REGISTRO = /^registros\/(\d{4})\//;

export const caminhoDoIndice = (ano) => `indices/${ano}.json`;
export const anoDoRegistro = (caminho) => CAMINHO_DE_REGISTRO.exec(caminho)?.[1] ?? null;

export function entradaDe(registro, shaDoRegistro) {
  const entrada = {
    registro: shaDoRegistro,
    nome: registro.nome || registro.blob.split('/').pop(),
    blob: registro.blob,
    origem: registro.origem_da_data ?? null,
  };
  if (entrada.origem === 'envio') entrada.enviada = registro.enviada_em ?? null;
  return entrada;
}

export async function carregar(arvore, lerTexto) {
  const shaDe = new Map(arvore.map((arquivo) => [arquivo.caminho, arquivo.sha]));
  const entradas = new Map();
  const noArquivo = new Map();
  await Promise.all(
    arvore.map(async (arquivo) => {
      const ano = CAMINHO_DE_INDICE.exec(arquivo.caminho)?.[1];
      if (!ano) return;
      let fotos = {};
      try {
        const dados = JSON.parse(await lerTexto(arquivo.sha));
        if (dados?.versao === VERSAO && dados.fotos) fotos = dados.fotos;
      } catch (falha) {
        if (falha?.tipo === 'token') throw falha;
      }
      noArquivo.set(ano, Object.keys(fotos).length);
      for (const [caminho, entrada] of Object.entries(fotos)) {
        if (entrada?.registro === shaDe.get(caminho) && shaDe.has(entrada.blob)) entradas.set(caminho, entrada);
      }
    }),
  );
  return { entradas, noArquivo };
}

export function arquivoDoAno(ano, entradasDoAno, existe) {
  const caminho = caminhoDoIndice(ano);
  if (entradasDoAno.length === 0) return existe ? { caminho, apagar: true } : null;
  const fotos = Object.fromEntries([...entradasDoAno].sort(([a], [b]) => (a < b ? -1 : 1)));
  return { caminho, texto: `${JSON.stringify({ versao: VERSAO, fotos })}\n` };
}
