// Índice das fotos: o que o app precisa saber de todas elas sem abrir um registro por foto.
// Um arquivo por ano no repositório de dados, `indices/AAAA.json`, para cada gravação mexer só
// no ano dela. Cada entrada é a do registro em `registros/AAAA/<id>.json`:
//
//   { registro, nome, blob, origem, enviada }
//
// `registro` é o sha do arquivo de registro. A entrada só vale enquanto ele é o mesmo: quem
// renomeia ou acerta a data fora do índice muda esse sha, e a foto volta a ser lida pelo registro.
// `enviada` só existe na foto sem data (`origem: 'envio'`), que a tela "Fotos sem data" agrupa
// pelo dia do envio.

const VERSAO = 2;
const CAMINHO_DE_INDICE = /^indices\/(\d{4})\.json$/;
const CAMINHO_DE_REGISTRO = /^registros\/(\d{4})\//;

export const caminhoDoIndice = (ano) => `indices/${ano}.json`;
export const anoDoRegistro = (caminho) => CAMINHO_DE_REGISTRO.exec(caminho)?.[1] ?? null;

// A entrada de uma foto, tirada do registro completo dela.
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

// Lê os índices que a listagem do repositório mostra. `lerTexto(sha)` busca um arquivo, e quem
// chama decide se ele vem do aparelho ou do GitHub. Devolve:
//   entradas: Map(caminho do registro -> entrada), só as que ainda valem;
//   noArquivo: Map(ano -> quantas entradas o arquivo daquele ano tem), para saber qual regravar.
// Índice ilegível ou de outra versão conta como vazio: as fotos dele são lidas pelo registro.
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

// O arquivo de um ano, pronto para entrar num commit. Sem entradas, o arquivo sai do
// repositório, e só se ele existe: tirar da árvore o que não está lá é recusado.
export function arquivoDoAno(ano, entradasDoAno, existe) {
  const caminho = caminhoDoIndice(ano);
  if (entradasDoAno.length === 0) return existe ? { caminho, apagar: true } : null;
  const fotos = Object.fromEntries([...entradasDoAno].sort(([a], [b]) => (a < b ? -1 : 1)));
  return { caminho, texto: `${JSON.stringify({ versao: VERSAO, fotos })}\n` };
}
