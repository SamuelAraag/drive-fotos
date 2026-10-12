// Estado, regras e eventos.

import * as armazem from './armazem.js';
import * as foto from './foto.js';
import * as github from './github.js';
import * as ui from './ui.js';

const MAX_DOWNLOADS = 6; // miniaturas baixando ao mesmo tempo
const TETO_NA_MEMORIA = 150 * 1024 * 1024; // originais abertas ou prontas para abrir, em bytes
const MAX_DE_FUNDO = 2; // originais baixando em segundo plano ao mesmo tempo
const ESPERA_DE_FUNDO = 600; // ms que a foto precisa ficar na tela antes de entrar na fila de fundo
const INTERVALO_DE_CONFERENCIA = 30000; // ms entre duas releituras do repositório ao voltar para a tela

// fotos/2026/20261012T153045-a1b2.jpg -> pasta, ano, id e extensão.
const CAMINHO = /^(fotos|miniaturas|registros)\/(\d{4})\/((\d{8})T(\d{6})-[0-9a-z]+)\.([0-9a-z]+)$/i;

let fotos = null; // última leitura do repositório, da mais recente para a mais antiga
const miniaturas = new Map(); // sha -> promessa da URL da imagem já baixada
const espera = []; // downloads aguardando vaga
let baixando = 0;
const buscando = new Map(); // sha -> promessa do Blob em download agora, para não baixar duas vezes
const originais = new Map(); // sha -> { promessa da URL, tamanho }; a menos usada sai primeiro
const naTela = new Map(); // id -> temporizador das fotos visíveis, à espera da fila de fundo
const filaDeFundo = []; // ids das fotos visíveis cuja original ainda não está no aparelho
let fundoAtivos = 0;
let fundoPausadoAte = 0;
let aberta = null; // id da foto aberta em tela cheia
let conferindo = false;
let conferidoEm = 0; // hora da última leitura do repositório
const registros = new Map(); // id -> registro já lido (nome, dimensões), ou null se a foto não tem

// Fila de envio. Cada item: { n, arquivo, nome, sha, reuso, data, origem, id, estado, mensagem }.
// `data` é quando a foto foi tirada e `origem` diz de onde ela veio: toda foto entra na fila
// já com as duas.
// `sha` é o do conteúdo, para reconhecer foto repetida. `reuso` vem preenchido na cópia de uma
// foto já guardada: o arquivo não sobe de novo, a cópia aponta para o que o repositório já tem.
// estado: 'aguardando' | 'enviando' | 'concluido' | 'erro'
let fila = [];
let proximoItem = 1;
let enviando = false;
let pausadaAte = null; // quando o GitHub limita o ritmo: hora em que a fila retoma
let trava = null; // mantém a tela do celular acordada enquanto a fila corre
let progresso = 0; // de 0 a 1, da foto que está subindo agora
let conferindoLevas = 0; // levas sendo conferidas agora (repetidas e datas), antes de entrar na fila

const porIdDecrescente = (a, b) => (a.id < b.id ? 1 : -1);

// Monta a lista só com os caminhos da árvore: o id traz a data, e o ano do id é a pasta.
// Arquivo fora do padrão, posto à mão, fica de fora.
function montarFotos(arvore) {
  const porId = new Map();
  for (const arquivo of arvore) {
    const partes = CAMINHO.exec(arquivo.caminho);
    if (!partes) continue;
    const [, pasta, ano, id, dia, hora, ext] = partes;
    if (!id.startsWith(ano)) continue;
    const item = porId.get(id) ?? { id, dia, hora, sha: null, miniatura: null, registro: null, tamanho: 0, peso: 0, ext: null };
    item.peso += arquivo.tamanho ?? 0; // os três arquivos da foto, para a conta do espaço usado
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

// Todo arquivo passa por aqui: primeiro o que já está guardado no aparelho, depois o GitHub.
// O que vem do GitHub fica guardado para a próxima vez.
function obterBlob(sha, { original }) {
  if (!buscando.has(sha)) {
    const promessa = (async () => {
      const guardado = await armazem.ler(sha);
      if (guardado) return guardado;
      const blob = await github.lerBlob(sha);
      armazem.guardar(sha, blob, { original }); // não espera: guardar não pode atrasar a tela
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

// Cada miniatura é lida uma vez por sessão. A que falha sai do mapa para poder tentar de novo.
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

function esquecerMiniaturas() {
  espera.length = 0;
  for (const promessa of miniaturas.values()) promessa.then(URL.revokeObjectURL, () => {});
  miniaturas.clear();
}

// Originais prontas na memória: a aberta, as vizinhas e as vistas há pouco. O teto é em bytes,
// porque uma foto pode ter 300 KB ou 25 MB. A foto aberta nunca sai.
function baixarOriginal(item) {
  const guardada = originais.get(item.sha);
  if (guardada) {
    // Volta para o fim da fila: foi a usada mais recentemente.
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

// Fila de fundo: baixa para o aparelho a original de toda foto que está na tela, para ela
// abrir na hora quando for tocada. Vai para o disco, não para a memória.

function tirarDaFilaDeFundo(id) {
  const posicao = filaDeFundo.indexOf(id);
  if (posicao >= 0) filaDeFundo.splice(posicao, 1);
}

// A interface avisa quando uma foto entra ou sai da tela. Sem id, a grade foi redesenhada.
function visibilidade(id, visivel) {
  if (id == null) {
    for (const temporizador of naTela.values()) clearTimeout(temporizador);
    naTela.clear();
    filaDeFundo.length = 0;
    return;
  }
  if (!visivel) {
    clearTimeout(naTela.get(id));
    naTela.delete(id);
    tirarDaFilaDeFundo(id); // saiu da tela antes da vez dela: não baixa
    return;
  }
  // Quem pediu economia de dados ao navegador não tem download que não pediu.
  if (naTela.has(id) || navigator.connection?.saveData) return;
  // Só entra na fila a foto que ficou na tela: rolar depressa não dispara downloads.
  naTela.set(
    id,
    setTimeout(() => {
      filaDeFundo.push(id);
      proximoDeFundo();
    }, ESPERA_DE_FUNDO),
  );
}

async function proximoDeFundo() {
  // O envio tem a vez: os dois disputam a mesma rede e o mesmo limite do GitHub.
  if (enviando || fundoAtivos >= MAX_DE_FUNDO || filaDeFundo.length === 0 || Date.now() < fundoPausadoAte) return;
  const item = fotos?.find((candidato) => candidato.id === filaDeFundo[0]);
  filaDeFundo.shift();
  if (!item) {
    proximoDeFundo();
    return;
  }
  fundoAtivos++;
  try {
    if (!(await armazem.tem(item.sha))) await obterBlob(item.sha, { original: true });
  } catch (erro) {
    // Em segundo plano nada vira aviso. O limite de ritmo só faz a fila esperar.
    if (erro.tipo === 'limite') {
      fundoPausadoAte = Date.now() + erro.esperaMs;
      setTimeout(proximoDeFundo, erro.esperaMs);
    }
    if (erro.tipo === 'token') filaDeFundo.length = 0;
  } finally {
    fundoAtivos--;
    proximoDeFundo();
  }
}

// Deixa as vizinhas prontas na memória, para a seta passar de foto sem espera.
function prepararVizinhas(indice) {
  for (const vizinha of [fotos[indice + 1], fotos[indice - 1]]) {
    if (vizinha) baixarOriginal(vizinha).catch(() => {});
  }
}

// O registro traz o nome da foto. Vem do GitHub na primeira vez e do aparelho nas seguintes.
async function lerRegistro(item) {
  if (registros.has(item.id)) return registros.get(item.id);
  let registro = null;
  if (item.registro) {
    try {
      const blob = await obterBlob(item.registro, { original: false });
      registro = JSON.parse(await blob.text());
    } catch {
      return null; // falha de rede ou arquivo quebrado: o painel mostra o id, e a próxima abertura tenta de novo
    }
  }
  registros.set(item.id, registro);
  return registro;
}

const textoDoRegistro = (registro) => `${JSON.stringify(registro, null, 2)}\n`;

async function mostrarAberta({ abrindo = false } = {}) {
  const indice = fotos.findIndex((item) => item.id === aberta);
  if (indice < 0) {
    ui.fecharVisor();
    return;
  }
  const item = fotos[indice];
  const dados = {
    posicao: indice + 1,
    total: fotos.length,
    temAnterior: indice > 0,
    temProxima: indice < fotos.length - 1,
  };
  if (abrindo) ui.abrirVisor(item, dados);
  else ui.renderVisor(item, dados);
  lerRegistro(item).then((registro) => ui.dadosDoRegistro(item.id, registro));
  try {
    const url = await baixarOriginal(item);
    if (aberta !== item.id) return;
    ui.mostrarOriginal(item, url);
    prepararVizinhas(fotos.findIndex((outra) => outra.id === item.id));
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

function abrirFoto(id) {
  if (!fotos?.some((item) => item.id === id)) return;
  aberta = id;
  // O voltar do navegador fecha a foto, em vez de sair do app.
  history.pushState({ visor: true }, '');
  mostrarAberta({ abrindo: true });
}

// A ordem é a da grade: a próxima é a foto seguinte, mais antiga.
function passarFoto(sentido) {
  if (aberta == null) return;
  const vizinha = fotos[fotos.findIndex((item) => item.id === aberta) + sentido];
  if (!vizinha) return;
  aberta = vizinha.id;
  ui.passouParaAFoto(vizinha.id);
  mostrarAberta();
}

// Chamado quando o visor fecha, seja pelo botão, pelo Esc ou pelo voltar do navegador.
function fotoFechada() {
  const id = aberta;
  aberta = null;
  ui.fecharRenomear();
  ui.fecharApagar();
  if (history.state?.visor) history.back();
  if (id != null) ui.voltarParaAFoto(id);
}

// Ações da foto aberta: baixar, renomear e apagar.

const fotoAberta = () => fotos?.find((item) => item.id === aberta) ?? null;

// Foto sem registro, posta à mão no repositório, atende pelo id.
const nomeDaFoto = (item, registro) => registro?.nome ?? `${item.id}.${item.ext}`;

// Token vencido no meio de uma ação: fecha tudo e pede o login de novo.
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
    // No celular, o compartilhar do sistema deixa salvar direto na galeria.
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo] });
        return;
      } catch (erro) {
        if (erro.name === 'AbortError') return; // a pessoa fechou o compartilhar
        // O navegador recusou (a espera pelo download gastou o toque): cai no download comum.
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

async function pedirRenomear() {
  const item = fotoAberta();
  if (!item) return;
  ui.avisoNoVisor(null);
  const registro = await lerRegistro(item);
  if (aberta !== item.id) return;
  // Sem o registro em mãos, salvar o nome apagaria os outros dados dele.
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
  // Foto posta à mão no repositório ganha o registro dela agora.
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
    await github.gravar([{ caminho: caminhos.registro, texto }], `renomear: ${item.id}`);
    const sha = await foto.shaDoGit(texto);
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
  ui.abrirApagar(item, nomeDaFoto(item, registros.get(item.id)));
}

async function apagarFoto() {
  const item = fotoAberta();
  if (!item) return;
  const caminhos = foto.caminhos(item.id, item.ext);
  // Só entra no commit o que a foto tem: tirar da árvore um arquivo que não existe é recusado.
  const arquivos = [{ caminho: caminhos.blob, apagar: true }];
  if (item.miniatura) arquivos.push({ caminho: caminhos.miniatura, apagar: true });
  if (item.registro) arquivos.push({ caminho: caminhos.registro, apagar: true });
  ui.erroNoApagar(null);
  ui.apagarOcupado(true);
  try {
    await github.gravar(arquivos, `apagar: ${item.id}`);
  } catch (erro) {
    ui.apagarOcupado(false);
    if (tokenVenceu(erro)) return;
    ui.erroNoApagar(mensagemDe(erro, 'Não deu para apagar a foto. Tente de novo.'));
    return;
  }
  ui.apagarOcupado(false);

  registros.delete(item.id);
  tirarDaFilaDeFundo(item.id);
  if (!fotos) return; // saiu da conta enquanto o commit corria
  const indice = fotos.findIndex((outra) => outra.id === item.id);
  fotos = fotos.filter((outra) => outra.id !== item.id);
  armazem.guardarFotos(fotos);
  // Duas cópias da mesma foto dividem o arquivo: só sai do aparelho o que ninguém mais usa.
  const emUso = new Set(fotos.flatMap((outra) => [outra.sha, outra.miniatura, outra.registro]));
  armazem.apagar([item.sha, item.miniatura, item.registro].filter((sha) => sha && !emUso.has(sha)));
  const guardada = originais.get(item.sha);
  if (guardada && !emUso.has(item.sha)) {
    guardada.promessa.then(URL.revokeObjectURL, () => {});
    originais.delete(item.sha);
  }
  ui.fecharApagar();
  if (aberta !== item.id) {
    render(); // o visor fechou enquanto o commit corria
    return;
  }
  // A vizinha assume o lugar: a seguinte, ou a anterior quando a apagada era a última.
  const vizinha = fotos[indice] ?? fotos[indice - 1];
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

function render() {
  if (!fotos) return;
  // Lista guardada por uma versão antiga do app não tem o peso: vale o tamanho da original.
  const espaco = fotos.reduce((soma, item) => soma + (item.peso ?? item.tamanho), 0);
  ui.renderPrincipal(agruparPorDia(fotos), { total: fotos.length, espaco }, baixarMiniatura);
  ui.mostrarTela('principal');
}

function renderFila() {
  ui.renderFila(fila, { enviando, pausadaAte, progresso, conferindo: conferindoLevas > 0 });
}

async function lerFotos() {
  const lista = montarFotos(await github.lerArvore());
  conferidoEm = Date.now();
  return lista;
}

function mesmaLista(a, b) {
  return (
    a.length === b.length &&
    a.every((item, i) => item.id === b[i].id && item.sha === b[i].sha && item.miniatura === b[i].miniatura && item.registro === b[i].registro)
  );
}

// A lista guardada no aparelho aparece na hora, e a do GitHub confere por trás.
async function carregar() {
  const guardadas = armazem.lerFotos();
  if (guardadas) {
    fotos = guardadas;
    render();
  } else {
    ui.mostrarTela('carregando');
  }
  try {
    const novas = await lerFotos();
    // Se a lista mudou enquanto a leitura corria (um envio, por exemplo), a que está na tela vale.
    if (guardadas && fotos !== guardadas) return;
    armazem.guardarFotos(novas);
    aquecerNomes();
    if (guardadas && mesmaLista(novas, guardadas)) return;
    fotos = novas;
    render();
  } catch (erro) {
    if (erro.tipo === 'token') {
      github.apagarToken();
      ui.abrirLogin(erro.message);
      return;
    }
    // Com a lista guardada na tela, falha de rede não tira o que já está aparecendo.
    if (guardadas) return;
    ui.renderErro(erro.message);
    ui.mostrarTela('erro');
    ui.focarTela('erro');
  }
}

// Ao voltar para a tela, confere se algo subiu ou foi apagado em outro aparelho. Só redesenha
// se a lista mudou, e nunca no meio de um envio, que já mexe nela.
async function conferir() {
  if (!fotos || !github.lerToken() || enviando || conferindo) return;
  if (Date.now() - conferidoEm < INTERVALO_DE_CONFERENCIA) return;
  const antes = fotos;
  conferindo = true;
  try {
    const novas = await lerFotos();
    // A lista mudou enquanto a leitura corria (envio, renomear, apagar): a que está na tela vale.
    if (fotos !== antes || mesmaLista(novas, antes)) return;
    // Registro trocado em outro aparelho (um renomear): o nome que estava na memória não vale mais.
    const registroDe = new Map(antes.map((item) => [item.id, item.registro]));
    for (const item of novas) if (registroDe.get(item.id) !== item.registro) registros.delete(item.id);
    fotos = novas;
    armazem.guardarFotos(fotos);
    render();
    aquecerNomes();
    // A foto aberta foi apagada em outro aparelho: o visor fecha.
    if (aberta != null && !fotos.some((item) => item.id === aberta)) ui.fecharVisor();
  } catch (erro) {
    // Em segundo plano só o token vencido vira aviso.
    if (erro.tipo === 'token') {
      ui.fecharVisor();
      github.apagarToken();
      ui.abrirLogin(erro.message);
    }
  } finally {
    conferindo = false;
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
    armazem.guardarFotos(fotos);
    armazem.pedirPermanencia();
    ui.fecharLogin();
    render();
    ui.focarTela('principal');
    aquecerNomes();
    bombear(); // o login pode ter sido aberto no meio de uma fila, por token vencido
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
  fila = [];
  pausadaAte = null;
  ui.esquecerEnvio();
  renderFila();
  ui.fecharVisor();
  ui.limparPrincipal();
  visibilidade(null);
  registros.clear();
  esquecerMiniaturas();
  esquecerOriginais();
  armazem.limpar();
  ui.mostrarTela(null);
  ui.abrirLogin();
}

// Envio

function plural(n, um, varios) {
  return n === 1 ? um : varios;
}

// Separa o que entra na fila do que fica de fora, com o motivo de cada recusa.
async function adicionarArquivos(arquivos, { temPasta = false } = {}) {
  const recusas = [];
  if (temPasta) recusas.push('Pastas não são aceitas. Solte as fotos de dentro dela.');

  const vazios = arquivos.filter((arquivo) => arquivo.size === 0);
  const naoImagens = arquivos.filter((arquivo) => arquivo.size > 0 && !foto.ehImagem(arquivo));
  const grandes = arquivos.filter((arquivo) => foto.ehImagem(arquivo) && arquivo.size > foto.TAMANHO_MAXIMO);
  const aceitos = arquivos.filter(
    (arquivo) => arquivo.size > 0 && foto.ehImagem(arquivo) && arquivo.size <= foto.TAMANHO_MAXIMO,
  );

  const nomes = (lista) => lista.map((arquivo) => arquivo.name).join(', ');
  if (vazios.length) recusas.push(`${nomes(vazios)}: ${plural(vazios.length, 'arquivo vazio', 'arquivos vazios')}.`);
  if (naoImagens.length) recusas.push(`${nomes(naoImagens)}: ${plural(naoImagens.length, 'não é imagem', 'não são imagens')}.`);
  if (grandes.length) {
    recusas.push(`${nomes(grandes)}: ${plural(grandes.length, 'passa', 'passam')} de ${foto.fmtTamanho(foto.TAMANHO_MAXIMO)}.`);
  }
  ui.erroNaZona(recusas.length ? `Ficou de fora. ${recusas.join(' ')}` : null);

  if (aceitos.length === 0) return;
  // Cada foto precisa de duas respostas antes de subir: se já existe e quando foi tirada.
  // As que não deixam dúvida sobem direto. As outras esperam um diálogo, sem segurar a fila.
  // Até lá, a zona diz que está conferindo, e uma leva nova espera a vez.
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

// Fotos repetidas
//
// Dois jeitos de uma foto já existir. Pelo conteúdo: o sha que o git dá ao arquivo, calculado
// aqui, bate com o de uma foto da lista, e aí as duas são idênticas, byte a byte. Pelo nome: o
// nome é o de uma foto guardada, mas o conteúdo é outro. O conteúdo não custa nenhuma chamada
// ao GitHub. O nome mora no registro de cada foto, então depende de os registros terem sido
// lidos. Conta também a foto que ainda está na fila e o mesmo arquivo escolhido duas vezes.

const MAX_REGISTROS_NA_HORA = 80; // registros que o envio aceita esperar; acima disso, vale o que já foi lido
const LEITORES_DE_REGISTRO = 2;
let lendoNomes = null; // leitura de registros em curso, para não correr duas ao mesmo tempo

// Lê o registro das fotos que ainda não têm o nome conhecido. Fica guardado no aparelho, então
// só custa chamadas na primeira vez. Devolve se terminou com todos os nomes em mãos.
function lerNomes({ limite = Infinity } = {}) {
  const faltam = (fotos ?? []).filter((item) => item.registro && !registros.has(item.id));
  if (faltam.length === 0) return Promise.resolve(true);
  if (faltam.length > limite) return Promise.resolve(false);
  lendoNomes ??= (async () => {
    let proximo = 0;
    let falhas = 0;
    const leitor = async () => {
      // Três falhas seguidas (sem rede, limite de ritmo) encerram: tenta de novo na próxima vez.
      while (proximo < faltam.length && falhas < 3) {
        const item = faltam[proximo++];
        falhas = (await lerRegistro(item)) ? 0 : falhas + 1;
      }
    };
    await Promise.all(Array.from({ length: LEITORES_DE_REGISTRO }, leitor));
    lendoNomes = null;
    return falhas < 3;
  })();
  return lendoNomes;
}

// Em segundo plano, depois que a grade já pediu as miniaturas dela.
function aquecerNomes() {
  if (navigator.connection?.saveData) return;
  setTimeout(() => lerNomes().catch(() => {}), 3000);
}

const chaveDoNome = (nome) => nome.toLocaleLowerCase('pt-BR');

// Os nomes que já se conhece, das fotos guardadas. Foto sem registro atende pelo id.
function nomesGuardados() {
  const porNome = new Map(); // chave do nome -> foto mais recente com esse nome
  for (const item of fotos ?? []) {
    if (item.registro && !registros.has(item.id)) continue; // nome ainda não lido
    const chave = chaveDoNome(nomeDaFoto(item, registros.get(item.id)));
    if (!porNome.has(chave)) porNome.set(chave, item);
  }
  return porNome;
}

async function separarRepetidas(arquivos) {
  await lerNomes({ limite: MAX_REGISTROS_NA_HORA });
  const porConteudo = new Map(); // sha -> { foto } já guardada, ou { arquivo } ainda na fila
  const porNome = new Map(); // chave do nome -> idem
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
    // Fora de https e de localhost o navegador não faz a conta: sobra a comparação pelo nome.
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

// Todos os nomes em uso, guardados ou na fila: a cópia não pode cair em nenhum deles.
function nomesEmUso() {
  const guardados = (fotos ?? [])
    .filter((item) => !item.registro || registros.has(item.id))
    .map((item) => nomeDaFoto(item, registros.get(item.id)));
  return [...guardados, ...fila.map((item) => item.nome)];
}

// Devolve as fotos que seguem para o envio: as que deixaram de ser repetidas e as cópias pedidas.
async function resolverRepetidas(repetidas, totalDaLeva) {
  const seguem = [];
  // "Não enviar" só é seguro se a foto guardada ainda existe: confere no GitHub antes de
  // perguntar. A que foi apagada em outro aparelho deixa de ser repetida e sobe como nova.
  // Sem rede, vale a lista que está na tela.
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

  // A foto que está sendo enviada aparece ao lado da que já existe. A prévia é uma miniatura
  // feita aqui, para o diálogo não abrir vários arquivos grandes de uma vez.
  const previas = [];
  const previaDe = async (arquivo) => {
    const miniatura = await foto.gerarMiniatura(arquivo);
    if (!miniatura) return null; // o navegador não decodifica: fica o quadro neutro
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
    // Idêntica a uma foto guardada, a cópia aponta para o arquivo dela, sem enviar de novo.
    // Só com o nome igual, ou com a original ainda na fila, sobe normal.
    seguem.push({ arquivo, sha, nome, reuso: tipo === 'conteudo' && par.foto ? sha : null });
  }
  return seguem;
}

// Fotos sem data: nem o EXIF nem o nome dizem quando foram tiradas. A pessoa escolhe o dia de
// cada uma, e o campo já vem com hoje. Devolve as que seguem para o envio, já com a data.
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
    trava = null; // sem suporte ou negado: a fila corre do mesmo jeito
  }
}

function soltarTela() {
  trava?.release().catch(() => {});
  trava = null;
}

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function enviarFoto(item) {
  const { arquivo } = item;
  const { data, origem } = item;
  // O id nasce uma vez por item: "tentar de novo" regrava os mesmos caminhos, sem duplicar a foto.
  item.id ??= foto.gerarId(data);
  const caminhos = foto.caminhos(item.id, foto.extensaoDe(arquivo));
  const miniatura = await foto.gerarMiniatura(arquivo);
  const registro = foto.montarRegistro({ id: item.id, arquivo, nome: item.nome, data, origem, miniatura, blob: caminhos.blob });

  // A cópia de uma foto já guardada não envia o arquivo de novo: o git guarda um conteúdo só.
  const arquivos = [item.reuso ? { caminho: caminhos.blob, sha: item.reuso } : { caminho: caminhos.blob, base64: await foto.paraBase64(arquivo) }];
  if (miniatura) arquivos.push({ caminho: caminhos.miniatura, base64: await foto.paraBase64(miniatura.blob) });
  arquivos.push({ caminho: caminhos.registro, texto: textoDoRegistro(registro) });

  const shas = await github.gravar(arquivos, `foto: ${item.id}`, (fracao) => {
    progresso = fracao;
    ui.renderProgresso(progresso);
  });

  // A miniatura recém-gerada já serve para a grade, sem baixar de volta.
  const shaDaMiniatura = miniatura ? shas[caminhos.miniatura] : null;
  if (shaDaMiniatura && !miniaturas.has(shaDaMiniatura)) {
    miniaturas.set(shaDaMiniatura, Promise.resolve(URL.createObjectURL(miniatura.blob)));
  }
  const nova = {
    id: item.id,
    dia: item.id.slice(0, 8),
    hora: item.id.slice(9, 15),
    sha: item.reuso ?? shas[caminhos.blob],
    miniatura: shaDaMiniatura,
    // O GitHub não devolve o sha do registro, que vai embutido na árvore: sai da conta feita aqui.
    registro: await foto.shaDoGit(textoDoRegistro(registro)),
    tamanho: arquivo.size,
    peso: arquivo.size + (miniatura?.blob.size ?? 0) + new Blob([textoDoRegistro(registro)]).size,
    ext: foto.extensaoDe(arquivo),
  };
  registros.set(nova.id, registro);
  // O que acabou de subir já está aqui: vai para o aparelho sem precisar baixar de volta.
  armazem.guardar(nova.sha, arquivo, { original: true });
  if (shaDaMiniatura) armazem.guardar(shaDaMiniatura, miniatura.blob, { original: false });
  if (fotos) {
    fotos = [nova, ...fotos.filter((existente) => existente.id !== nova.id)].sort(porIdDecrescente);
    armazem.guardarFotos(fotos);
    render();
    // O efeito de chegada corre por conta própria: a fila não espera por ele.
    ui.fotoChegou(nova.id, { ultimaDaLeva: !fila.some((outro) => outro.estado === 'aguardando') });
  }
}

// Fila única: uma foto por vez. Falha em uma não para as outras.
async function bombear() {
  if (enviando || !github.lerToken()) return;
  enviando = true;
  await manterTelaAcordada();
  for (;;) {
    const item = fila.find((candidato) => candidato.estado === 'aguardando');
    if (!item) break;
    item.estado = 'enviando';
    item.mensagem = null;
    progresso = 0;
    renderFila();
    try {
      await enviarFoto(item);
      item.estado = 'concluido';
    } catch (erro) {
      if (erro.tipo === 'limite') {
        // Não é falha da foto: espera o GitHub liberar e retoma sozinha.
        item.estado = 'aguardando';
        pausadaAte = new Date(Date.now() + erro.esperaMs);
        renderFila();
        await dormir(erro.esperaMs);
        pausadaAte = null;
        continue;
      }
      if (erro.tipo === 'token') {
        // As que faltam ficam na fila e sobem depois do novo login.
        item.estado = 'aguardando';
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
  proximoDeFundo(); // a fila de fundo esperou o envio terminar
  // A leva acabou: o que subiu sai da fila, e só as falhas ficam na tela.
  const enviadas = fila.filter((item) => item.estado === 'concluido').length;
  fila = fila.filter((item) => item.estado !== 'concluido');
  renderFila();
  if (enviadas > 0) {
    ui.anunciarEnvio(enviadas === 1 ? 'Foto enviada.' : `${enviadas} fotos enviadas.`);
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
  podeEnviar: () => Boolean(fotos && github.lerToken()) && !ui.visorAberto() && conferindoLevas === 0,
  abrirFoto,
  passarFoto,
  recarregarFoto: () => mostrarAberta(),
  fotoFechada,
  baixarFoto,
  pedirRenomear,
  salvarNome,
  pedirApagar,
  apagarFoto,
  visibilidade,
});

// A fila vive só nesta página: sair no meio perde o que ainda não subiu.
window.addEventListener('beforeunload', (evento) => {
  if (fila.some((item) => item.estado === 'aguardando' || item.estado === 'enviando')) evento.preventDefault();
});

// O voltar do navegador, com a foto aberta, só fecha a foto.
window.addEventListener('popstate', () => ui.fecharVisor({ efeito: true }));

// O navegador solta a trava quando a aba some. Ao voltar, com a fila correndo, pede de novo.
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
