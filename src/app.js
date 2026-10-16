import * as armazem from './armazem.js';
import * as foto from './foto.js';
import * as github from './github.js';
import * as indices from './indice.js';
import * as ui from './ui.js';

const MAX_DOWNLOADS = 6;
const TETO_NA_MEMORIA = 150 * 1024 * 1024;
const INTERVALO_DE_CONFERENCIA = 30000;

const CAMINHO = /^(fotos|miniaturas|registros)\/(\d{4})\/((\d{8})T(\d{6})-[0-9a-z]+)\.([0-9a-z]+)$/i;

let fotos = null;
let modoSelecao = false;
let apagandoSelecao = false;
const fotosSelecionadas = new Set();
const miniaturas = new Map();
const espera = [];
let baixando = 0;
const buscando = new Map();
const originais = new Map();
let aberta = null;
let conferindo = false;
let conferidoEm = 0;
const registros = new Map();

let indice = new Map();
let anosComIndice = new Set();
let indicePronto = false;
let lendoIndice = null;

const ARQUIVO_DE_FAVORITAS = 'favoritas.json';
const CHAVE_DAS_FAVORITAS = 'drive-fotos.favoritas-pendentes';
const CHAVE_DAS_FAVORITAS_LIDAS = 'drive-fotos.favoritas';
const ESPERA_PARA_GRAVAR_FAVORITAS = 3000;
let arvoreLida = [];
let favoritasNoRepositorio = lerFavoritasGuardadas();
let favoritasLidasDe = null;
let favoritasPendentes = lerFavoritasPendentes();
let gravandoFavoritas = false;
let gravarFavoritasEm = null;

let fila = [];
let proximoItem = 1;
let enviando = false;
let pausadaAte = null;
let trava = null;
let progresso = 0;
let conferindoLevas = 0;

const porIdDecrescente = (a, b) => (a.id < b.id ? 1 : -1);

function montarFotos(arvore) {
  const porId = new Map();
  for (const arquivo of arvore) {
    const partes = CAMINHO.exec(arquivo.caminho);
    if (!partes) continue;
    const [, pasta, ano, id, dia, hora, ext] = partes;
    if (!id.startsWith(ano)) continue;
    const item = porId.get(id) ?? { id, dia, hora, sha: null, miniatura: null, registro: null, tamanho: 0, peso: 0, ext: null };
    item.peso += arquivo.tamanho ?? 0;
    if (pasta === 'fotos') {
      item.sha = arquivo.sha;
      item.tamanho = arquivo.tamanho ?? 0;
      item.ext = ext.toLowerCase();
    } else if (pasta === 'miniaturas') item.miniatura = arquivo.sha;
    else item.registro = arquivo.sha;
    porId.set(id, item);
  }
  return [...porId.values()].filter((item) => item.sha).sort(porIdDecrescente);
}

function agruparPorDia(lista) {
  const grupos = [];
  for (const item of lista) {
    const ultimo = grupos.at(-1);
    if (ultimo?.dia === item.dia) ultimo.fotos.push(item);
    else grupos.push({ dia: item.dia, fotos: [item] });
  }
  return grupos;
}

function obterBlob(sha, { original }) {
  if (!buscando.has(sha)) {
    const promessa = (async () => {
      const guardado = await armazem.ler(sha);
      if (guardado) return guardado;
      const blob = await github.lerBlob(sha);
      armazem.guardar(sha, blob, { original });
      return blob;
    })();
    promessa.then(
      () => buscando.delete(sha),
      () => buscando.delete(sha),
    );
    buscando.set(sha, promessa);
  }
  return buscando.get(sha);
}

function proximoDownload() {
  if (baixando >= MAX_DOWNLOADS || espera.length === 0) return;
  baixando++;
  const { sha, resolver, rejeitar } = espera.shift();
  obterBlob(sha, { original: false })
    .then((blob) => resolver(URL.createObjectURL(blob)), rejeitar)
    .finally(() => {
      baixando--;
      proximoDownload();
    });
}

function cancelarMiniatura(sha) {
  const posicao = espera.findIndex((pedido) => pedido.sha === sha);
  if (posicao < 0) return;
  const [pedido] = espera.splice(posicao, 1);
  pedido.rejeitar(new DOMException('A miniatura saiu da tela antes de baixar.', 'AbortError'));
}

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

function soltarMiniatura(sha) {
  const promessa = miniaturas.get(sha);
  if (!promessa) return;
  miniaturas.delete(sha);
  promessa.then(URL.revokeObjectURL, () => {});
}

baixarMiniatura.cancelar = cancelarMiniatura;
baixarMiniatura.soltar = soltarMiniatura;

function esquecerMiniaturas() {
  espera.length = 0;
  for (const promessa of miniaturas.values()) promessa.then(URL.revokeObjectURL, () => {});
  miniaturas.clear();
}

function baixarOriginal(item) {
  const guardada = originais.get(item.sha);
  if (guardada) {
    originais.delete(item.sha);
    originais.set(item.sha, guardada);
    return guardada.promessa;
  }
  const promessa = obterBlob(item.sha, { original: true }).then((blob) => URL.createObjectURL(blob));
  promessa.catch(() => originais.delete(item.sha));
  originais.set(item.sha, { promessa, tamanho: item.tamanho });

  const shaAberta = fotos?.find((outra) => outra.id === aberta)?.sha;
  let total = [...originais.values()].reduce((soma, entrada) => soma + entrada.tamanho, 0);
  for (const [sha, entrada] of originais) {
    if (total <= TETO_NA_MEMORIA) break;
    if (sha === shaAberta || sha === item.sha) continue;
    entrada.promessa.then(URL.revokeObjectURL, () => {});
    originais.delete(sha);
    total -= entrada.tamanho;
  }
  return promessa;
}

function esquecerOriginais() {
  for (const { promessa } of originais.values()) promessa.then(URL.revokeObjectURL, () => {});
  originais.clear();
}

let navegacao = null;

function listaDoVisor() {
  if (!navegacao || !fotos) return fotos ?? [];
  const porId = new Map(fotos.map((item) => [item.id, item]));
  return navegacao.map((id) => porId.get(id)).filter(Boolean);
}

function prepararVizinhas(indice) {
  const lista = listaDoVisor();
  for (const vizinha of [lista[indice + 1], lista[indice - 1]]) {
    if (vizinha) baixarOriginal(vizinha).catch(() => {});
  }
}

async function lerRegistro(item) {
  if (registros.has(item.id)) return registros.get(item.id);
  let registro = null;
  if (item.registro) {
    try {
      const blob = await obterBlob(item.registro, { original: false });
      registro = JSON.parse(await blob.text());
    } catch {
      return null;
    }
  }
  registros.set(item.id, registro);
  return registro;
}

const textoDoRegistro = (registro) => `${JSON.stringify(registro, null, 2)}\n`;

const caminhoDoRegistro = (item) => foto.caminhos(item.id, '').registro;

function dadosDe(item) {
  if (registros.has(item.id)) return registros.get(item.id);
  const entrada = indice.get(caminhoDoRegistro(item));
  if (!entrada || entrada.registro !== item.registro) return undefined;
  return { nome: entrada.nome, origem_da_data: entrada.origem, enviada_em: entrada.enviada ?? null };
}

function carregarIndice() {
  if (indicePronto) return Promise.resolve();
  lendoIndice ??= (async () => {
    try {
      const arvore = await github.lerArvore();
      const lido = await indices.carregar(arvore, async (sha) => (await obterBlob(sha, { original: false })).text());
      indice = lido.entradas;
      anosComIndice = new Set(lido.noArquivo.keys());
      indicePronto = true;
      armazem.manterIndices(arvore.filter((arquivo) => arquivo.caminho.startsWith('indices/')).map((arquivo) => arquivo.sha));
    } catch {
    } finally {
      lendoIndice = null;
    }
  })();
  return lendoIndice;
}

function indiceNoCommit({ entram = [], saem = [] }) {
  if (!indicePronto) return { arquivos: [], aplicar() {} };
  const novas = new Map(entram);
  const fora = new Set(saem);
  const anos = new Set([...fora, ...novas.keys()].map(indices.anoDoRegistro));
  const arquivos = [];
  for (const ano of anos) {
    const doAno = new Map();
    for (const item of fotos ?? []) {
      if (!item.registro || !item.id.startsWith(ano)) continue;
      const caminho = caminhoDoRegistro(item);
      if (fora.has(caminho) || novas.has(caminho)) continue;
      const guardada = indice.get(caminho);
      const registro = registros.get(item.id);
      if (guardada?.registro === item.registro) doAno.set(caminho, guardada);
      else if (registro) doAno.set(caminho, indices.entradaDe(registro, item.registro));
    }
    for (const [caminho, entrada] of novas) if (indices.anoDoRegistro(caminho) === ano) doAno.set(caminho, entrada);
    const arquivo = indices.arquivoDoAno(ano, [...doAno], anosComIndice.has(ano));
    if (arquivo) arquivos.push(arquivo);
  }
  return {
    arquivos,
    aplicar() {
      for (const caminho of fora) indice.delete(caminho);
      for (const [caminho, entrada] of novas) indice.set(caminho, entrada);
      for (const arquivo of arquivos) {
        const ano = arquivo.caminho.slice('indices/'.length, -'.json'.length);
        if (arquivo.apagar) anosComIndice.delete(ano);
        else anosComIndice.add(ano);
      }
    },
  };
}

async function mostrarAberta({ abrindo = false } = {}) {
  const lista = listaDoVisor();
  const indice = lista.findIndex((item) => item.id === aberta);
  if (indice < 0) {
    ui.fecharVisor();
    return;
  }
  const item = lista[indice];
  const dados = {
    posicao: indice + 1,
    total: lista.length,
    temAnterior: indice > 0,
    temProxima: indice < lista.length - 1,
  };
  if (abrindo) ui.abrirVisor(item, dados);
  else ui.renderVisor(item, dados);
  ui.marcarFavoritaNoVisor(ehFavorita(item));
  lerRegistro(item).then((registro) => ui.dadosDoRegistro(item.id, registro));
  try {
    const url = await baixarOriginal(item);
    if (aberta !== item.id) return;
    ui.mostrarOriginal(item, url);
    prepararVizinhas(listaDoVisor().findIndex((outra) => outra.id === item.id));
  } catch (erro) {
    if (aberta !== item.id) return;
    if (erro.tipo === 'token') {
      ui.fecharVisor();
      github.apagarToken();
      ui.abrirLogin(erro.message);
      return;
    }
    ui.erroNoVisor(erro.message ?? 'Não deu para carregar a foto.', { podeTentar: true });
  }
}

function abrirFoto(id, { lista = null } = {}) {
  if (!fotos?.some((item) => item.id === id)) return;
  if (lista === 'favoritas') navegacao = favoritasEmOrdem().map((item) => item.id);
  else if (naTelaDeFavoritas()) navegacao = fotos.filter(ehFavorita).map((item) => item.id);
  else navegacao = null;
  if (navegacao && !navegacao.includes(id)) navegacao = null;
  aberta = id;

  history.pushState({ visor: true }, '');
  mostrarAberta({ abrindo: true });
}

function passarFoto(sentido) {
  if (aberta == null) return;
  const lista = listaDoVisor();
  const vizinha = lista[lista.findIndex((item) => item.id === aberta) + sentido];
  if (!vizinha) return;
  aberta = vizinha.id;
  ui.passouParaAFoto(vizinha.id);
  mostrarAberta();
}

function fotoFechada() {
  const id = aberta;
  aberta = null;
  navegacao = null;
  ui.fecharRenomear();
  ui.fecharApagar();
  if (history.state?.visor) history.back();
  if (id != null) ui.voltarParaAFoto(id);
}

const fotoAberta = () => fotos?.find((item) => item.id === aberta) ?? null;

const nomeDaFoto = (item, registro) => registro?.nome ?? `${item.id}.${item.ext}`;

function tokenVenceu(erro) {
  if (erro.tipo !== 'token') return false;
  ui.fecharVisor();
  github.apagarToken();
  ui.abrirLogin(erro.message);
  return true;
}

const mensagemDe = (erro, padrao) => (erro instanceof github.ErroGitHub ? erro.message : padrao);

async function baixarFoto() {
  const item = fotoAberta();
  if (!item) return;
  ui.avisoNoVisor(null);
  ui.baixarOcupado(true);
  try {
    const [blob, registro] = await Promise.all([obterBlob(item.sha, { original: true }), lerRegistro(item)]);
    const arquivo = new File([blob], nomeDaFoto(item, registro), { type: registro?.tipo || foto.tipoDaExtensao(item.ext) });

    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo] });
        return;
      } catch (erro) {
        if (erro.name === 'AbortError') return;
      }
    }
    ui.baixarArquivo(arquivo);
  } catch (erro) {
    if (tokenVenceu(erro)) return;
    ui.avisoNoVisor(mensagemDe(erro, 'Não deu para baixar a foto. Tente de novo.'));
  } finally {
    ui.baixarOcupado(false);
  }
}

async function copiarLink() {
  const item = fotoAberta();
  if (!item) return;
  ui.avisoNoVisor(null);
  ui.estadoDoLink('copiando');
  const link = (async () => {
    const [endereco, registro] = await Promise.all([github.linkTemporario(foto.caminhos(item.id, item.ext).blob), lerRegistro(item)]);
    if (!endereco) throw new Error('sem endereço');
    const pagina = new URL('baixar.html', location.href);
    pagina.hash = new URLSearchParams({ u: endereco, n: nomeDaFoto(item, registro) }).toString();
    return pagina.href;
  })();

  const copiou = ui.copiarTexto(link);
  try {
    await link;
  } catch (erro) {
    ui.estadoDoLink(null);
    if (tokenVenceu(erro)) return;
    ui.avisoNoVisor(mensagemDe(erro, 'Não deu para gerar o link. Tente de novo.'));
    return;
  }
  if (await copiou) {
    ui.estadoDoLink('copiado');
  } else {
    ui.estadoDoLink(null);
    ui.avisoNoVisor('O link foi gerado, mas o navegador não deixou copiar. Toque em "Copiar link" de novo.');
  }
}

async function pedirRenomear() {
  const item = fotoAberta();
  if (!item) return;
  ui.avisoNoVisor(null);
  const registro = await lerRegistro(item);
  if (aberta !== item.id) return;

  if (item.registro && !registro) {
    ui.avisoNoVisor('Não deu para ler os dados da foto. Tente de novo.');
    return;
  }
  ui.abrirRenomear(...foto.separarNome(nomeDaFoto(item, registro)));
}

async function salvarNome(base, extensao) {
  const item = fotoAberta();
  if (!item) return;
  if (!base) {
    ui.erroNoRenomear('Escreva um nome para a foto.');
    return;
  }
  if (/[\\/\u0000-\u001f]/.test(base)) {
    ui.erroNoRenomear('O nome não pode ter barra.');
    return;
  }
  const atual = await lerRegistro(item);
  if (item.registro && !atual) {
    ui.erroNoRenomear('Não deu para ler os dados da foto. Tente de novo.');
    return;
  }
  const nome = `${base}${extensao}`;
  if (nome === nomeDaFoto(item, atual)) {
    ui.fecharRenomear();
    return;
  }
  const caminhos = foto.caminhos(item.id, item.ext);

  const registro = {
    ...(atual ?? {
      versao: 1,
      id: item.id,
      nome,
      tipo: foto.tipoDaExtensao(item.ext),
      tamanho: item.tamanho,
      largura: null,
      altura: null,
      data: null,
      enviada_em: null,
      blob: caminhos.blob,
      miniatura: item.miniatura ? caminhos.miniatura : null,
    }),
    nome,
  };
  const texto = textoDoRegistro(registro);
  ui.erroNoRenomear(null);
  ui.renomearOcupado(true);
  try {
    const sha = await foto.shaDoGit(texto);
    const noIndice = indiceNoCommit({ entram: [[caminhos.registro, indices.entradaDe(registro, sha)]] });
    await github.gravar([{ caminho: caminhos.registro, texto }, ...noIndice.arquivos], `renomear: ${item.id}`);
    noIndice.aplicar();
    if (item.registro) armazem.apagar([item.registro]);
    armazem.guardar(sha, new Blob([texto], { type: 'application/json' }), { original: false });
    registros.set(item.id, registro);
    if (fotos) {
      fotos = fotos.map((outra) => (outra.id === item.id ? { ...outra, registro: sha } : outra));
      armazem.guardarFotos(fotos);
    }
    ui.dadosDoRegistro(item.id, registro);
    ui.fecharRenomear();
  } catch (erro) {
    if (tokenVenceu(erro)) return;
    ui.erroNoRenomear(mensagemDe(erro, 'Não deu para renomear a foto. Tente de novo.'));
  } finally {
    ui.renomearOcupado(false);
  }
}

function pedirApagar() {
  const item = fotoAberta();
  if (!item) return;
  ui.avisoNoVisor(null);
  ui.abrirApagar(item, nomeDaFoto(item, dadosDe(item)));
}

async function apagarFoto() {
  const item = fotoAberta();
  if (!item) return;
  const caminhos = foto.caminhos(item.id, item.ext);

  const arquivos = [{ caminho: caminhos.blob, apagar: true }];
  if (item.miniatura) arquivos.push({ caminho: caminhos.miniatura, apagar: true });
  if (item.registro) arquivos.push({ caminho: caminhos.registro, apagar: true });
  const noIndice = indiceNoCommit({ saem: item.registro ? [caminhos.registro] : [] });
  ui.erroNoApagar(null);
  ui.apagarOcupado(true);
  try {
    await github.gravar([...arquivos, ...noIndice.arquivos], `apagar: ${item.id}`);
    noIndice.aplicar();
  } catch (erro) {
    ui.apagarOcupado(false);
    if (tokenVenceu(erro)) return;
    ui.erroNoApagar(mensagemDe(erro, 'Não deu para apagar a foto. Tente de novo.'));
    return;
  }
  ui.apagarOcupado(false);

  const indice = listaDoVisor().findIndex((outra) => outra.id === item.id);
  if (!removerFotosDaLista([item])) return;
  ui.fecharApagar();
  if (aberta !== item.id) {
    render();
    return;
  }

  const restantes = listaDoVisor();
  const vizinha = restantes[indice] ?? restantes[indice - 1];
  if (!vizinha) {
    render();
    ui.fecharVisor();
    return;
  }
  aberta = vizinha.id;
  ui.passouParaAFoto(vizinha.id);
  render();
  mostrarAberta();
}

function removerFotosDaLista(removidas) {
  for (const item of removidas) {
    registros.delete(item.id);
    fotosSelecionadas.delete(item.id);
  }
  if (!fotos) return false;
  const idsRemovidos = new Set(removidas.map((item) => item.id));
  fotos = fotos.filter((item) => !idsRemovidos.has(item.id));
  armazem.guardarFotos(fotos);

  const emUso = new Set(fotos.flatMap((item) => [item.sha, item.miniatura, item.registro]));
  const shasRemovidos = new Set(removidas.flatMap((item) => [item.sha, item.miniatura, item.registro]));
  armazem.apagar([...shasRemovidos].filter((sha) => sha && !emUso.has(sha)));
  for (const sha of new Set(removidas.map((item) => item.sha))) {
    const guardada = originais.get(sha);
    if (!guardada || emUso.has(sha)) continue;
    guardada.promessa.then(URL.revokeObjectURL, () => {});
    originais.delete(sha);
  }
  return true;
}

function atualizarSelecao() {
  const selecionadas = fotos?.filter((item) => fotosSelecionadas.has(item.id)) ?? [];
  ui.atualizarSelecao(modoSelecao, fotosSelecionadas, fotos?.length ?? 0, selecionadas.length > 0 && selecionadas.every(ehFavorita));
}

function iniciarSelecao(id = null) {
  if (modoSelecao) {
    if (id) alternarFotoSelecionada(id);
    return true;
  }
  if (!fotos?.length || conferindo || atualizandoAgora) return false;
  modoSelecao = true;
  if (id && fotos.some((item) => item.id === id)) fotosSelecionadas.add(id);
  history.pushState({ selecaoFotos: true }, '');
  atualizarSelecao();
  return true;
}

function limparSelecao() {
  modoSelecao = false;
  fotosSelecionadas.clear();
  atualizarSelecao();
}

function sairDaSelecao() {
  if (!modoSelecao) return;
  if (history.state?.selecaoFotos) {
    history.back();
    return;
  }
  limparSelecao();
}

function alternarFotoSelecionada(id) {
  if (!modoSelecao || !fotos?.some((item) => item.id === id)) return;
  if (fotosSelecionadas.has(id)) fotosSelecionadas.delete(id);
  else fotosSelecionadas.add(id);
  atualizarSelecao();
}

function definirSelecaoDoDia(ids, selecionada) {
  if (!modoSelecao) return;
  for (const id of ids) {
    if (selecionada) fotosSelecionadas.add(id);
    else fotosSelecionadas.delete(id);
  }
  atualizarSelecao();
}

function pedirApagarSelecao() {
  if (!modoSelecao || fotosSelecionadas.size === 0) return;
  ui.abrirApagarSelecao(fotosSelecionadas.size);
}

async function apagarSelecao() {
  if (!modoSelecao || !fotos || apagandoSelecao) return;
  const removidas = fotos.filter((item) => fotosSelecionadas.has(item.id));
  if (!removidas.length) {
    ui.fecharApagarSelecao();
    return;
  }
  const arquivos = removidas.flatMap((item) => {
    const caminhos = foto.caminhos(item.id, item.ext);
    const lista = [{ caminho: caminhos.blob, apagar: true }];
    if (item.miniatura) lista.push({ caminho: caminhos.miniatura, apagar: true });
    if (item.registro) lista.push({ caminho: caminhos.registro, apagar: true });
    return lista;
  });
  ui.erroApagarSelecao(null);
  apagandoSelecao = true;
  ui.apagarSelecaoOcupada(true);
  const noIndice = indiceNoCommit({ saem: removidas.filter((item) => item.registro).map(caminhoDoRegistro) });
  try {
    await github.gravar([...arquivos, ...noIndice.arquivos], `apagar ${removidas.length} fotos`);
    noIndice.aplicar();
  } catch (erro) {
    apagandoSelecao = false;
    ui.apagarSelecaoOcupada(false);
    if (erro.tipo === 'token') {
      ui.fecharApagarSelecao();
      tokenVenceu(erro);
      return;
    }
    ui.erroApagarSelecao(mensagemDe(erro, 'Não deu para apagar as fotos. Tente de novo.'));
    return;
  }
  apagandoSelecao = false;
  ui.apagarSelecaoOcupada(false);
  ui.fecharApagarSelecao();
  limparSelecao();
  if (!removerFotosDaLista(removidas)) return;
  render();
  if (history.state?.selecaoFotos) history.back();
}

const naTelaSemData = () => location.hash === '#sem-data';
const naTelaDeFavoritas = () => location.hash === '#favoritas';

function lerFavoritasGuardadas() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CHAVE_DAS_FAVORITAS_LIDAS) ?? '[]');
    return new Map(guardadas.map((entrada) => (Array.isArray(entrada) ? entrada : [entrada, ''])));
  } catch {
    return new Map();
  }
}

function guardarFavoritasLidas() {
  try {
    localStorage.setItem(CHAVE_DAS_FAVORITAS_LIDAS, JSON.stringify([...favoritasNoRepositorio]));
  } catch {
  }
}

function lerFavoritasPendentes() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CHAVE_DAS_FAVORITAS) ?? '[]');
    return new Map(guardadas.filter(([, valor]) => typeof valor === 'object' && valor));
  } catch {
    return new Map();
  }
}

function guardarFavoritasPendentes() {
  try {
    if (favoritasPendentes.size) localStorage.setItem(CHAVE_DAS_FAVORITAS, JSON.stringify([...favoritasPendentes]));
    else localStorage.removeItem(CHAVE_DAS_FAVORITAS);
  } catch {
  }
}

const ehFavorita = (item) => favoritasPendentes.get(item.sha)?.favorita ?? favoritasNoRepositorio.has(item.sha);
const favoritadaEm = (item) => favoritasPendentes.get(item.sha)?.em ?? favoritasNoRepositorio.get(item.sha) ?? '';

async function lerArquivoDeFavoritas(arvore) {
  const arquivo = arvore.find((item) => item.caminho === ARQUIVO_DE_FAVORITAS);
  if (!arquivo) return { sha: null, fotos: new Map() };
  const dados = JSON.parse(await (await obterBlob(arquivo.sha, { original: false })).text());
  const fotos = Array.isArray(dados?.fotos) ? dados.fotos.map((sha) => [sha, '']) : Object.entries(dados?.fotos ?? {});
  return { sha: arquivo.sha, fotos: new Map(fotos) };
}

async function lerFavoritas() {
  const arquivo = arvoreLida.find((item) => item.caminho === ARQUIVO_DE_FAVORITAS);
  if ((arquivo?.sha ?? null) === favoritasLidasDe) return;
  try {
    const lido = await lerArquivoDeFavoritas(arvoreLida);
    favoritasNoRepositorio = lido.fotos;
    favoritasLidasDe = lido.sha;
    guardarFavoritasLidas();
  } catch (erro) {
    if (tokenVenceu(erro)) return;
  }
  render();
  if (favoritasPendentes.size) agendarFavoritas(0);
}

function agendarFavoritas(espera = ESPERA_PARA_GRAVAR_FAVORITAS) {
  clearTimeout(gravarFavoritasEm);
  gravarFavoritasEm = setTimeout(gravarFavoritas, espera);
}

async function gravarFavoritas() {
  if (gravandoFavoritas || favoritasPendentes.size === 0 || !github.lerToken()) return;
  gravandoFavoritas = true;
  const enviadas = new Map(favoritasPendentes);
  try {
    const remoto = await lerArquivoDeFavoritas(await github.lerArvore());
    for (const [sha, { favorita, em }] of enviadas) {
      if (favorita) remoto.fotos.set(sha, em);
      else remoto.fotos.delete(sha);
    }
    const ordenadas = [...remoto.fotos].sort(([a], [b]) => (a < b ? -1 : 1));
    const texto = `${JSON.stringify({ versao: 2, fotos: Object.fromEntries(ordenadas) })}\n`;
    await github.gravar([{ caminho: ARQUIVO_DE_FAVORITAS, texto }], `favoritas: ${enviadas.size} ${enviadas.size === 1 ? 'mudança' : 'mudanças'}`);
    favoritasNoRepositorio = remoto.fotos;
    favoritasLidasDe = await foto.shaDoGit(texto);
    guardarFavoritasLidas();
    for (const [sha, enviada] of enviadas) {
      if (favoritasPendentes.get(sha) === enviada) favoritasPendentes.delete(sha);
    }
    guardarFavoritasPendentes();
  } catch (erro) {
    if (!tokenVenceu(erro)) agendarFavoritas(60000);
  } finally {
    gravandoFavoritas = false;
  }
  if (favoritasPendentes.size) agendarFavoritas();
}

function definirFavoritas(itens, favorita) {
  const agora = Date.now();
  itens.forEach((item, posicao) => {
    if (favoritasNoRepositorio.has(item.sha) === favorita && !favorita) favoritasPendentes.delete(item.sha);
    else favoritasPendentes.set(item.sha, { favorita, em: new Date(agora - posicao).toISOString() });
  });
  guardarFavoritasPendentes();
  agendarFavoritas();
}

function mostrarMudancaDeFavoritas(itens, favorita) {
  if (naTelaDeFavoritas()) {
    render();
    return;
  }
  for (const item of itens) ui.marcarFavorita(item.id, item, favorita);
  renderFaixaDeFavoritas({ entrando: favorita ? itens.map((item) => item.id) : [] });
}

function alternarFavorita(id) {
  const item = fotos?.find((candidato) => candidato.id === id);
  if (!item) return;
  const favorita = !ehFavorita(item);
  definirFavoritas([item], favorita);
  mostrarMudancaDeFavoritas([item], favorita);
  if (aberta === id) ui.marcarFavoritaNoVisor(favorita);
}

function alternarFavoritaAberta() {
  const item = fotos?.find((candidato) => candidato.id === aberta);
  if (!item) return;
  const favorita = !ehFavorita(item);
  definirFavoritas([item], favorita);
  ui.marcarFavoritaNoVisor(favorita, { avisar: true });
  mostrarMudancaDeFavoritas([item], favorita);
}

function favoritarSelecao() {
  const itens = fotos?.filter((item) => fotosSelecionadas.has(item.id)) ?? [];
  if (itens.length === 0) return;
  const favorita = !itens.every(ehFavorita);
  const mudam = itens.filter((item) => ehFavorita(item) !== favorita);
  definirFavoritas(mudam, favorita);
  sairDaSelecao();
  mostrarMudancaDeFavoritas(mudam, favorita);
}

function favoritasEmOrdem() {
  return (fotos ?? [])
    .filter(ehFavorita)
    .sort((a, b) => {
      const quandoA = favoritadaEm(a);
      const quandoB = favoritadaEm(b);
      if (quandoA !== quandoB) return quandoA < quandoB ? 1 : -1;
      return a.id < b.id ? 1 : -1;
    });
}

function renderFaixaDeFavoritas({ entrando = [] } = {}) {
  ui.renderFavoritas({ lista: favoritasEmOrdem(), filtro: naTelaDeFavoritas(), entrando });
}
let lendoPendentes = false;
let pendentesIncompletas = false;

function pendentes() {
  return (fotos ?? []).filter((item) => dadosDe(item)?.origem_da_data === 'envio');
}

const diaDoEnvio = (item) => {
  const enviada = new Date(dadosDe(item)?.enviada_em ?? NaN);
  return Number.isNaN(enviada.getTime()) ? item.dia : foto.diaEmTexto(enviada).replaceAll('-', '');
};

function gruposDePendentes() {
  const porDia = new Map();
  for (const item of pendentes()) {
    const dia = diaDoEnvio(item);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push({ foto: item, nome: nomeDaFoto(item, dadosDe(item)) });
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dia, lista]) => {
      const data = new Date(Number(dia.slice(0, 4)), Number(dia.slice(4, 6)) - 1, Number(dia.slice(6, 8)));
      const quando = data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
      return { chave: dia, titulo: `Enviadas em ${quando}`, fotos: lista };
    });
}

function render() {
  if (!fotos) return;
  if (naTelaSemData()) {
    ui.renderSemData(gruposDePendentes(), { lendo: lendoPendentes, incompleta: pendentesIncompletas }, baixarMiniatura);
    ui.mostrarTela('sem-data');
    return;
  }

  const espaco = fotos.reduce((soma, item) => soma + (item.peso ?? item.tamanho), 0);
  const naGrade = naTelaDeFavoritas() ? fotos.filter(ehFavorita) : fotos;
  ui.renderPrincipal(
    agruparPorDia(naGrade),
    { total: fotos.length, espaco },
    baixarMiniatura,
    { ativa: modoSelecao, ids: fotosSelecionadas },
    { ehFavorita },
  );
  renderFaixaDeFavoritas();
  ui.linkDasPendentes(pendentes().length);
  ui.mostrarTela('principal');
}

async function abrirSemData() {
  lendoPendentes = true;
  pendentesIncompletas = false;
  ui.erroNasPendentes(null);
  render();
  ui.focarTela('sem-data');
  const completa = await carregarIndice().then(() => lerNomes()).catch(() => false);
  lendoPendentes = false;
  pendentesIncompletas = !completa;
  render();
}

function aplicarRota() {
  if (!fotos) return;
  if (naTelaDeFavoritas() && modoSelecao) limparSelecao();
  if (naTelaDeFavoritas() || location.hash === '') scrollTo({ top: 0 });
  if (naTelaSemData() && modoSelecao) limparSelecao();
  if (naTelaSemData()) abrirSemData();
  else render();
}

async function datar(mudancas) {
  const arquivos = [];
  const trocas = [];
  ui.erroNasPendentes(null);
  ui.pendentesOcupado(true, mudancas.map(({ id }) => id));
  for (const { id, dia } of mudancas) {
    const antiga = fotos?.find((item) => item.id === id);

    const registro = antiga && (await lerRegistro(antiga));
    if (!antiga || !registro) continue;
    const data = dia ? foto.dataNoDia(dia) : null;
    if (dia && !data) {
      ui.pendentesOcupado(false);
      ui.erroNasPendentes('Uma das datas não vale. Escolha um dia entre 1990 e hoje.');
      return;
    }
    const novoId = data ? foto.gerarId(data) : antiga.id;
    const de = foto.caminhos(antiga.id, antiga.ext);
    const para = foto.caminhos(novoId, antiga.ext);
    const novoRegistro = {
      ...registro,
      id: novoId,
      data: data ? foto.comFuso(data) : registro.data,
      origem_da_data: 'informada',
      blob: para.blob,
      miniatura: antiga.miniatura ? para.miniatura : null,
    };
    const texto = textoDoRegistro(novoRegistro);
    if (data) {
      arquivos.push({ caminho: para.blob, sha: antiga.sha }, { caminho: de.blob, apagar: true });
      if (antiga.miniatura) arquivos.push({ caminho: para.miniatura, sha: antiga.miniatura }, { caminho: de.miniatura, apagar: true });
      arquivos.push({ caminho: de.registro, apagar: true });
    }
    arquivos.push({ caminho: para.registro, texto });
    trocas.push({ antiga, registro: novoRegistro, texto, sha: await foto.shaDoGit(texto), de, para, nova: { ...antiga, id: novoId, dia: novoId.slice(0, 8), hora: novoId.slice(9, 15) } });
  }
  if (trocas.length === 0) {
    ui.pendentesOcupado(false);
    return;
  }

  const noIndice = indiceNoCommit({
    entram: trocas.map(({ registro, sha, para }) => [para.registro, indices.entradaDe(registro, sha)]),
    saem: trocas.filter(({ antiga, de, para }) => antiga.registro && de.registro !== para.registro).map(({ de }) => de.registro),
  });
  try {
    await github.gravar([...arquivos, ...noIndice.arquivos], trocas.length === 1 ? `datar: ${trocas[0].nova.id}` : `datar: ${trocas.length} fotos`);
    noIndice.aplicar();
  } catch (erro) {
    ui.pendentesOcupado(false);
    if (tokenVenceu(erro)) return;
    ui.erroNasPendentes(mensagemDe(erro, 'Não deu para salvar as datas. Tente de novo.'));
    return;
  }
  for (const { antiga, nova, registro, texto, sha } of trocas) {
    nova.registro = sha;
    if (antiga.registro) armazem.apagar([antiga.registro]);
    armazem.guardar(nova.registro, new Blob([texto], { type: 'application/json' }), { original: false });
    registros.delete(antiga.id);
    registros.set(nova.id, registro);
  }
  if (fotos) {
    const novas = new Map(trocas.map(({ antiga, nova }) => [antiga.id, nova]));
    fotos = fotos.map((item) => novas.get(item.id) ?? item).sort(porIdDecrescente);
    armazem.guardarFotos(fotos);
  }
  await ui.pendentesSalvas(trocas.map(({ antiga }) => antiga.id));
  ui.pendentesOcupado(false);
  render();
  ui.anunciarEnvio(trocas.length === 1 ? 'Data salva.' : `${trocas.length} datas salvas.`);
}

function renderFila() {
  ui.renderFila(fila, { enviando, pausadaAte, progresso, conferindo: conferindoLevas > 0 });
}

async function lerFotos() {
  arvoreLida = await github.lerArvore();
  const lista = montarFotos(arvoreLida);
  lerFavoritas();
  conferidoEm = Date.now();
  return lista;
}

function mesmaLista(a, b) {
  return (
    a.length === b.length &&
    a.every((item, i) => item.id === b[i].id && item.sha === b[i].sha && item.miniatura === b[i].miniatura && item.registro === b[i].registro)
  );
}

async function carregar() {
  const guardadas = await armazem.lerFotos();
  if (guardadas) {
    fotos = guardadas;
    aplicarRota();
  } else {
    ui.mostrarTela('carregando');
  }
  try {
    const novas = await lerFotos();

    if (guardadas && fotos !== guardadas) return;
    armazem.guardarFotos(novas);
    aquecerNomes();
    if (guardadas && mesmaLista(novas, guardadas)) return;
    fotos = novas;
    aplicarRota();
  } catch (erro) {
    if (erro.tipo === 'token') {
      github.apagarToken();
      ui.abrirLogin(erro.message);
      return;
    }

    if (guardadas) {
      if (erro.tipo === 'cortada') ui.erroAoAtualizar(erro.message);
      return;
    }
    ui.renderErro(erro.message);
    ui.mostrarTela('erro');
    ui.focarTela('erro');
  }
}

async function relerLista() {
  const antes = fotos;
  const novas = await lerFotos();

  if (!antes || fotos !== antes || mesmaLista(novas, antes)) return false;

  const registroDe = new Map(antes.map((item) => [item.id, item.registro]));
  for (const item of novas) if (registroDe.get(item.id) !== item.registro) registros.delete(item.id);
  indicePronto = false;
  fotos = novas;
  armazem.guardarFotos(fotos);
  render();
  aquecerNomes();

  if (aberta != null && !fotos.some((item) => item.id === aberta)) ui.fecharVisor();
  return true;
}

async function conferir() {
  if (!fotos || !github.lerToken() || enviando || conferindo || modoSelecao) return;
  if (Date.now() - conferidoEm < INTERVALO_DE_CONFERENCIA) return;
  conferindo = true;
  try {
    await relerLista();
  } catch (erro) {
    if (erro.tipo === 'token') {
      ui.fecharVisor();
      github.apagarToken();
      ui.abrirLogin(erro.message);
    } else if (erro.tipo === 'cortada') {
      ui.erroAoAtualizar(erro.message);
    }
  } finally {
    conferindo = false;
  }
}

let atualizandoAgora = false;

async function atualizarAgora() {
  if (atualizandoAgora || modoSelecao) return;
  if (!fotos) {
    if (github.lerToken()) carregar();
    return;
  }
  atualizandoAgora = true;
  ui.atualizarOcupado(true);
  ui.erroAoAtualizar(null);
  try {
    while ((enviando && !pausadaAte) || conferindo) await dormir(300);
    await relerLista();
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    ui.mostrarSincronia(`Atualizado às ${hora}`);
  } catch (erro) {
    if (tokenVenceu(erro)) return;
    ui.erroAoAtualizar(`Não deu para atualizar. ${mensagemDe(erro, 'Tente de novo em instantes.')}`);
  } finally {
    atualizandoAgora = false;
    ui.atualizarOcupado(false);
  }
}

async function entrar(token) {
  if (!token) {
    ui.erroNoLogin('Cole o token para entrar.');
    return;
  }

  const anterior = github.lerToken();
  github.salvarToken(token);
  ui.loginOcupado(true);
  try {
    fotos = await lerFotos();
    armazem.guardarFotos(fotos);
    armazem.pedirPermanencia();
    ui.fecharLogin();
    render();
    ui.focarTela('principal');
    aquecerNomes();
    bombear();
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
  limparSelecao();
  fila = [];
  pausadaAte = null;
  ui.esquecerEnvio();
  ui.mostrarSincronia('');
  ui.erroAoAtualizar(null);
  renderFila();
  ui.fecharVisor();
  ui.limparPrincipal();
  registros.clear();
  indice = new Map();
  anosComIndice = new Set();
  indicePronto = false;
  registrosLidosNaAbertura = 0;
  esquecerMiniaturas();
  esquecerOriginais();
  armazem.limpar();
  ui.mostrarTela(null);
  ui.abrirLogin();
}

function plural(n, um, varios) {
  return n === 1 ? um : varios;
}

async function adicionarArquivos(arquivos, { temPasta = false } = {}) {
  const recusas = [];
  if (temPasta) recusas.push('Pastas não são aceitas. Solte as fotos de dentro dela.');

  const vazios = arquivos.filter((arquivo) => arquivo.size === 0);
  const semSuporte = arquivos.filter((arquivo) => arquivo.size > 0 && foto.ehImagemSemSuporte(arquivo));
  const naoImagens = arquivos.filter((arquivo) => arquivo.size > 0 && !foto.ehImagem(arquivo) && !foto.ehImagemSemSuporte(arquivo));
  const grandes = arquivos.filter((arquivo) => foto.ehImagem(arquivo) && arquivo.size > foto.TAMANHO_MAXIMO);
  const aceitos = [];
  for (const arquivo of arquivos.filter((arquivo) => arquivo.size > 0 && foto.ehImagem(arquivo) && arquivo.size <= foto.TAMANHO_MAXIMO)) {
    (await foto.conteudoSemSuporte(arquivo) ? semSuporte : aceitos).push(arquivo);
  }

  const nomes = (lista) => lista.map((arquivo) => arquivo.name).join(', ');
  if (vazios.length) recusas.push(`${nomes(vazios)}: ${plural(vazios.length, 'arquivo vazio', 'arquivos vazios')}.`);
  if (semSuporte.length) {
    recusas.push(`${nomes(semSuporte)}: ${plural(semSuporte.length, 'formato que o navegador não mostra', 'formatos que o navegador não mostra')}. Converta para JPEG antes de enviar.`);
  }
  if (naoImagens.length) recusas.push(`${nomes(naoImagens)}: ${plural(naoImagens.length, 'não é imagem', 'não são imagens')}.`);
  if (grandes.length) {
    recusas.push(`${nomes(grandes)}: ${plural(grandes.length, 'passa', 'passam')} de ${foto.fmtTamanho(foto.TAMANHO_MAXIMO)}.`);
  }
  ui.erroNaZona(recusas.length ? `Ficou de fora. ${recusas.join(' ')}` : null);

  if (aceitos.length === 0) return;

  conferindoLevas++;
  renderFila();
  try {
    const semData = [];
    const encaminhar = async (entradas) => {
      for (const entrada of entradas) {
        const achada = await foto.dataDaFoto(entrada.arquivo);
        if (achada) enfileirar([{ ...entrada, ...achada }]);
        else semData.push(entrada);
      }
    };
    const { novas, repetidas } = await separarRepetidas(aceitos);
    await encaminhar(novas);
    if (repetidas.length > 0) await encaminhar(await resolverRepetidas(repetidas, aceitos.length));
    if (semData.length > 0) enfileirar(await perguntarDatas(semData, aceitos.length));
  } finally {
    conferindoLevas--;
    renderFila();
  }
}

function enfileirar(entradas) {
  for (const { arquivo, data, origem, sha = null, nome = arquivo.name, reuso = null } of entradas) {
    fila.push({ n: proximoItem++, arquivo, nome, sha, reuso, data, origem, id: null, estado: 'aguardando', mensagem: null });
  }
  if (entradas.length === 0) return;
  renderFila();
  bombear();
}

const MAX_REGISTROS_NA_HORA = 80;

const MAX_REGISTROS_POR_ABERTURA = 200;
const LEITORES_DE_REGISTRO = 2;
let lendoNomes = null;
let registrosLidosNaAbertura = 0;

function lerNomes({ limite = Infinity } = {}) {
  const faltam = (fotos ?? []).filter((item) => item.registro && dadosDe(item) === undefined);
  if (faltam.length === 0) return Promise.resolve(true);
  if (faltam.length > limite) return Promise.resolve(false);
  lendoNomes ??= (async () => {
    const cota = faltam.slice(0, Math.max(0, MAX_REGISTROS_POR_ABERTURA - registrosLidosNaAbertura));
    let proximo = 0;
    let falhas = 0;
    const leitor = async () => {
      while (proximo < cota.length && falhas < 3) {
        const item = cota[proximo++];
        registrosLidosNaAbertura++;
        falhas = (await lerRegistro(item)) ? 0 : falhas + 1;
      }
    };
    await Promise.all(Array.from({ length: LEITORES_DE_REGISTRO }, leitor));
    lendoNomes = null;
    return falhas < 3 && cota.length === faltam.length;
  })();
  return lendoNomes;
}

function aquecerNomes() {
  const avisar = () => !naTelaSemData() && fotos && ui.linkDasPendentes(pendentes().length);
  setTimeout(() => {
    carregarIndice()
      .then(avisar)
      .then(() => !navigator.connection?.saveData && lerNomes().then(avisar))
      .catch(() => {});
  }, 3000);
}

const chaveDoNome = (nome) => nome.toLocaleLowerCase('pt-BR');

function nomesGuardados() {
  const porNome = new Map();
  for (const item of fotos ?? []) {
    const dados = dadosDe(item);
    if (item.registro && dados === undefined) continue;
    const chave = chaveDoNome(nomeDaFoto(item, dados));
    if (!porNome.has(chave)) porNome.set(chave, item);
  }
  return porNome;
}

async function separarRepetidas(arquivos) {
  await carregarIndice();
  await lerNomes({ limite: MAX_REGISTROS_NA_HORA });
  const porConteudo = new Map();
  const porNome = new Map();
  for (const item of fotos ?? []) if (!porConteudo.has(item.sha)) porConteudo.set(item.sha, { foto: item });
  for (const [chave, item] of nomesGuardados()) porNome.set(chave, { foto: item });
  for (const item of fila) {
    if (item.estado === 'concluido') continue;
    if (item.sha && !porConteudo.has(item.sha)) porConteudo.set(item.sha, { arquivo: item.arquivo });
    if (!porNome.has(chaveDoNome(item.nome))) porNome.set(chaveDoNome(item.nome), { arquivo: item.arquivo });
  }
  const novas = [];
  const repetidas = [];
  for (const arquivo of arquivos) {
    const sha = await foto.shaDoGit(arquivo).catch(() => null);
    const chave = chaveDoNome(arquivo.name);
    const igual = sha ? porConteudo.get(sha) : null;
    const xara = porNome.get(chave);
    if (igual) {
      repetidas.push({ arquivo, sha, par: igual, tipo: 'conteudo' });
    } else if (xara) {
      repetidas.push({ arquivo, sha, par: xara, tipo: 'nome' });
    } else {
      novas.push({ arquivo, sha });
      if (sha) porConteudo.set(sha, { arquivo });
      porNome.set(chave, { arquivo });
    }
  }
  return { novas, repetidas };
}

function nomesEmUso() {
  const guardados = (fotos ?? [])
    .filter((item) => !item.registro || dadosDe(item) !== undefined)
    .map((item) => nomeDaFoto(item, dadosDe(item)));
  return [...guardados, ...fila.map((item) => item.nome)];
}

async function resolverRepetidas(repetidas, totalDaLeva) {
  const seguem = [];

  if (repetidas.some(({ par }) => par.foto)) {
    const noGitHub = await github.lerArvore().then(
      (arvore) => new Set(arvore.map((arquivo) => arquivo.sha)),
      () => null,
    );
    repetidas = repetidas.filter((repetida) => {
      if (!repetida.par.foto || !noGitHub || noGitHub.has(repetida.par.foto.sha)) return true;
      seguem.push({ arquivo: repetida.arquivo, sha: repetida.sha });
      return false;
    });
    if (repetidas.length === 0) return seguem;
  }

  const previas = [];
  const previaDe = async (arquivo) => {
    const miniatura = await foto.gerarMiniatura(arquivo);
    if (!miniatura) return null;
    const url = URL.createObjectURL(miniatura.blob);
    previas.push(url);
    return url;
  };
  const linhas = [];
  for (const { arquivo, par, tipo } of repetidas) {
    linhas.push({
      tipo,
      nova: { nome: arquivo.name, tamanho: arquivo.size, url: await previaDe(arquivo) },
      outra: par.foto
        ? { nome: nomeDaFoto(par.foto, await lerRegistro(par.foto)), tamanho: par.foto.tamanho, foto: par.foto }
        : { nome: par.arquivo.name, tamanho: par.arquivo.size, url: await previaDe(par.arquivo) },
    });
  }
  const manter = await ui.perguntarRepetidas(linhas, totalDaLeva);
  for (const url of previas) URL.revokeObjectURL(url);
  const ficamDeFora = repetidas.filter((_, i) => !manter[i]);
  if (ficamDeFora.length > 0) {
    ui.repetidasNaoEnviadas(ficamDeFora.filter(({ par }) => par.foto).map(({ par }) => par.foto.id));
    ui.anunciarEnvio(ficamDeFora.length === 1 ? 'A foto repetida não foi enviada.' : `${ficamDeFora.length} fotos repetidas não foram enviadas.`);
  }
  for (const { arquivo, sha, par, tipo } of repetidas.filter((_, i) => manter[i])) {
    const nome = foto.nomeRepetido(arquivo.name, [...nomesEmUso(), ...seguem.map((outra) => outra.nome ?? outra.arquivo.name)]);

    seguem.push({ arquivo, sha, nome, reuso: tipo === 'conteudo' && par.foto ? sha : null });
  }
  return seguem;
}

async function perguntarDatas(entradas, totalDaLeva) {
  const previas = [];
  const linhas = [];
  for (const { arquivo, nome = arquivo.name } of entradas) {
    const miniatura = await foto.gerarMiniatura(arquivo);
    const url = miniatura ? URL.createObjectURL(miniatura.blob) : null;
    if (url) previas.push(url);
    linhas.push({ nome, url, doArquivo: foto.sugestaoDeData(arquivo) });
  }
  const dias = await ui.perguntarDatas(linhas, totalDaLeva);
  for (const url of previas) URL.revokeObjectURL(url);
  const seguem = [];
  entradas.forEach((entrada, i) => {
    const informada = dias[i] && foto.dataInformada(dias[i]);
    if (informada) seguem.push({ ...entrada, ...informada });
  });
  const ficaramDeFora = entradas.length - seguem.length;
  if (ficaramDeFora > 0) {
    ui.anunciarEnvio(ficaramDeFora === 1 ? 'A foto sem data não foi enviada.' : `${ficaramDeFora} fotos sem data não foram enviadas.`);
  }
  return seguem;
}

async function manterTelaAcordada() {
  try {
    trava ??= (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    trava = null;
  }
}

function soltarTela() {
  trava?.release().catch(() => {});
  trava = null;
}

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

const TAMANHO_DO_LOTE = 10;

async function subirFoto(item) {
  if (item.pronta) return;
  const { arquivo, data, origem } = item;

  item.id ??= foto.gerarId(data);
  const caminhos = foto.caminhos(item.id, foto.extensaoDe(arquivo));
  const miniatura = await foto.gerarMiniatura(arquivo);
  const registro = foto.montarRegistro({ id: item.id, arquivo, nome: item.nome, data, origem, miniatura, blob: caminhos.blob });

  const [original, reduzida] = await Promise.all([item.reuso ? null : foto.paraBase64(arquivo), miniatura ? foto.paraBase64(miniatura.blob) : null]);

  const total = (original?.length ?? 0) + (reduzida?.length ?? 0);
  const subido = [0, 0];
  const andar = (qual, tamanho) => (fracao) => {
    subido[qual] = fracao * tamanho;
    progresso = total ? (subido[0] + subido[1]) / total : 1;
    ui.renderProgresso(progresso);
  };
  const [shaDaOriginal, shaDaMiniatura] = await Promise.all([
    original ? github.enviarBlob(original, andar(0, original.length)) : item.reuso,
    reduzida ? github.enviarBlob(reduzida, andar(1, reduzida.length)) : null,
  ]);

  const texto = textoDoRegistro(registro);
  const arquivos = [{ caminho: caminhos.blob, sha: shaDaOriginal }];
  if (shaDaMiniatura) arquivos.push({ caminho: caminhos.miniatura, sha: shaDaMiniatura });
  arquivos.push({ caminho: caminhos.registro, texto });
  item.pronta = {
    arquivos,
    registro,
    miniatura,
    nova: {
      id: item.id,
      dia: item.id.slice(0, 8),
      hora: item.id.slice(9, 15),
      sha: shaDaOriginal,
      miniatura: shaDaMiniatura,

      registro: await foto.shaDoGit(texto),
      tamanho: arquivo.size,
      peso: arquivo.size + (miniatura?.blob.size ?? 0) + new Blob([texto]).size,
      ext: foto.extensaoDe(arquivo),
    },
  };
}

function registrarLote(lote) {
  for (const { arquivo, pronta } of lote) {
    const { nova, registro, miniatura } = pronta;

    if (nova.miniatura && !miniaturas.has(nova.miniatura)) {
      miniaturas.set(nova.miniatura, Promise.resolve(URL.createObjectURL(miniatura.blob)));
    }
    registros.set(nova.id, registro);

    armazem.guardar(nova.sha, arquivo, { original: true });
    if (nova.miniatura) armazem.guardar(nova.miniatura, miniatura.blob, { original: false });
  }
  if (!fotos) return;
  const novas = lote.map((item) => item.pronta.nova);
  const ids = new Set(novas.map((nova) => nova.id));
  fotos = [...novas, ...fotos.filter((existente) => !ids.has(existente.id))].sort(porIdDecrescente);
  armazem.guardarFotos(fotos);
  render();

  const acabou = !fila.some((outro) => outro.estado === 'aguardando');
  novas.forEach((nova, i) => ui.fotoChegou(nova.id, { ultimaDaLeva: acabou && i === novas.length - 1 }));
}

async function fecharLote(lote) {
  if (lote.length === 0) return true;
  renderFila();
  const noIndice = indiceNoCommit({
    entram: lote.map((item) => [caminhoDoRegistro(item), indices.entradaDe(item.pronta.registro, item.pronta.nova.registro)]),
  });
  const arquivos = [...lote.flatMap((item) => item.pronta.arquivos), ...noIndice.arquivos];
  const mensagem = lote.length === 1 ? `foto: ${lote[0].id}` : `fotos: ${lote.length}`;
  for (;;) {
    try {
      await github.gravar(arquivos, mensagem);
      noIndice.aplicar();
      registrarLote(lote);
      for (const item of lote) item.estado = 'concluido';
      renderFila();
      return true;
    } catch (erro) {
      if (erro.tipo === 'limite') {
        pausadaAte = new Date(Date.now() + erro.esperaMs);
        renderFila();
        await dormir(erro.esperaMs);
        pausadaAte = null;
        continue;
      }
      if (erro.tipo === 'token') {
        for (const item of lote) item.estado = 'aguardando';
        github.apagarToken();
        ui.abrirLogin(erro.message);
        return false;
      }
      for (const item of lote) {
        item.estado = 'erro';
        item.mensagem = mensagemDe(erro, 'Não deu para guardar a foto. Tente de novo.');
      }
      renderFila();
      return true;
    }
  }
}

async function bombear() {
  if (enviando || !github.lerToken()) return;
  enviando = true;
  await manterTelaAcordada();
  const inicio = performance.now();
  let lote = [];
  for (;;) {
    const item = fila.find((candidato) => candidato.estado === 'aguardando');

    if (!item || lote.length >= TAMANHO_DO_LOTE) {
      const segue = await fecharLote(lote);
      lote = [];
      if (!segue) break;

      if (!fila.some((candidato) => candidato.estado === 'aguardando')) break;
      continue;
    }
    item.estado = 'enviando';
    item.mensagem = null;
    progresso = 0;
    renderFila();
    try {
      await subirFoto(item);
      item.estado = 'gravando';
      lote.push(item);
    } catch (erro) {
      if (erro.tipo === 'limite') {
        item.estado = 'aguardando';
        pausadaAte = new Date(Date.now() + erro.esperaMs);
        renderFila();
        await dormir(erro.esperaMs);
        pausadaAte = null;
        continue;
      }
      if (erro.tipo === 'token') {
        item.estado = 'aguardando';
        for (const pronto of lote) pronto.estado = 'aguardando';
        github.apagarToken();
        ui.abrirLogin(erro.message);
        break;
      }
      item.estado = 'erro';
      item.mensagem = erro instanceof github.ErroGitHub ? erro.message : 'Não deu para preparar a foto. Tente de novo.';
    }
    renderFila();
  }
  enviando = false;
  soltarTela();

  const enviadas = fila.filter((item) => item.estado === 'concluido').length;
  fila = fila.filter((item) => item.estado !== 'concluido');
  renderFila();
  if (enviadas > 0) {
    ui.anunciarEnvio(enviadas === 1 ? 'Foto enviada.' : `${enviadas} fotos enviadas.`);

    const segundos = (performance.now() - inicio) / 1000;
    console.info(`Drive Fotos: ${enviadas} foto(s) em ${segundos.toFixed(1)} s, ${(segundos / enviadas).toFixed(1)} s por foto.`);
  }
}

function tentarDeNovo(n) {
  const item = fila.find((candidato) => candidato.n === n);
  if (!item || item.estado !== 'erro') return;
  item.estado = 'aguardando';
  item.mensagem = null;
  renderFila();
  bombear();
}

function dispensarFalhas() {
  fila = fila.filter((item) => item.estado !== 'erro');
  renderFila();
}

ui.ligarEventos({
  entrar,
  sair,
  recarregar: carregar,
  trocarToken: () => ui.abrirLogin(),
  arquivos: adicionarArquivos,
  tentarDeNovo,
  limparFila: dispensarFalhas,
  podeEnviar: () => Boolean(fotos && github.lerToken()) && !modoSelecao && !ui.visorAberto() && conferindoLevas === 0 && !naTelaSemData(),
  abrirFoto,
  passarFoto,
  recarregarFoto: () => mostrarAberta(),
  fotoFechada,
  atualizar: atualizarAgora,
  datar,
  baixarFoto,
  copiarLink,
  pedirRenomear,
  salvarNome,
  pedirApagar,
  apagarFoto,
  iniciarSelecao,
  alternarFotoSelecionada,
  definirSelecaoDoDia,
  abrirConfirmacaoSelecao: pedirApagarSelecao,
  apagarSelecao,
  sairDaSelecao,
  estaEmSelecao: () => modoSelecao,
  alternarFavorita,
  alternarFavoritaAberta,
  favoritarSelecao,
});

window.addEventListener('beforeunload', (evento) => {
  if (apagandoSelecao || fila.some((item) => ['aguardando', 'enviando', 'gravando'].includes(item.estado))) evento.preventDefault();
});

window.addEventListener('popstate', () => {
  if (modoSelecao) {
    if (apagandoSelecao) {
      history.pushState({ selecaoFotos: true }, '');
      return;
    }
    limparSelecao();
    return;
  }
  if (ui.visorAberto()) ui.fecharVisor({ efeito: true });
});

window.addEventListener('hashchange', aplicarRota);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (enviando) {
    trava = null;
    manterTelaAcordada();
  }
  conferir();
});

if (github.lerToken()) carregar();
else {
  ui.mostrarTela(null);
  ui.abrirLogin();
}
