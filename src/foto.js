const LADO_MENOR_MINIATURA = 400;
const LADO_MAIOR_MINIATURA = 1600;
const QUALIDADE_MINIATURA = 0.8;

export const TAMANHO_MAXIMO = 25 * 1024 * 1024;

const pad = (n, casas = 2) => String(n).padStart(casas, '0');

const ANO_MINIMO = 1990;
const TRECHO_DO_EXIF = 256 * 1024;

function dataValida(ano, mes, dia, hora = 12, minuto = 0, segundo = 0) {
  const data = new Date(ano, mes - 1, dia, hora, minuto, segundo);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  if (ano < ANO_MINIMO || data.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return data;
}

function dataDoTiff(bytes, base) {
  const ordem = bytes.getUint16(base);
  if (ordem !== 0x4949 && ordem !== 0x4d4d) return null;
  const invertido = ordem === 0x4949;
  const u16 = (posicao) => bytes.getUint16(base + posicao, invertido);
  const u32 = (posicao) => bytes.getUint32(base + posicao, invertido);
  const lerBloco = (inicio) => {
    const etiquetas = new Map();
    const quantas = u16(inicio);
    for (let i = 0; i < quantas; i++) {
      const entrada = inicio + 2 + i * 12;
      etiquetas.set(u16(entrada), { tipo: u16(entrada + 2), quantos: u32(entrada + 4), valor: entrada + 8 });
    }
    return etiquetas;
  };

  const texto = (etiqueta) => {
    if (!etiqueta || etiqueta.tipo !== 2 || etiqueta.quantos < 19) return null;
    const inicio = u32(etiqueta.valor);
    let lido = '';
    for (let i = 0; i < 19; i++) lido += String.fromCharCode(bytes.getUint8(base + inicio + i));
    return lido;
  };
  const principal = lerBloco(u32(4));
  const exif = principal.has(0x8769) ? lerBloco(u32(principal.get(0x8769).valor)) : new Map();
  for (const candidata of [texto(exif.get(0x9003)), texto(exif.get(0x9004)), texto(principal.get(0x0132))]) {
    const partes = candidata && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(candidata);
    const data = partes && dataValida(...partes.slice(1).map(Number));
    if (data) return data;
  }
  return null;
}

async function dataDoExif(arquivo) {
  try {
    const bytes = new DataView(await arquivo.slice(0, TRECHO_DO_EXIF).arrayBuffer());
    if (bytes.getUint16(0) !== 0xffd8) return null;
    let posicao = 2;
    while (posicao + 4 <= bytes.byteLength) {
      if (bytes.getUint8(posicao) !== 0xff) return null;
      const marcador = bytes.getUint8(posicao + 1);
      if (marcador === 0xda || marcador === 0xd9) return null;
      const tamanho = bytes.getUint16(posicao + 2);

      if (marcador === 0xe1 && bytes.getUint32(posicao + 4) === 0x45786966 && bytes.getUint16(posicao + 8) === 0) {
        return dataDoTiff(bytes, posicao + 10);
      }
      posicao += 2 + tamanho;
    }
    return null;
  } catch {
    return null;
  }
}

const DATA_NO_NOME = /(?:^|\D)((?:19|20)\d\d)[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[-_. T]?([01]\d|2[0-3])[-_.:h]?([0-5]\d)[-_.:m]?([0-5]\d))?(?!\d)/;

export function dataDoNome(nome) {
  const partes = DATA_NO_NOME.exec(nome);
  if (!partes) return null;
  const [ano, mes, dia] = partes.slice(1, 4).map(Number);

  return partes[4] ? dataValida(ano, mes, dia, ...partes.slice(4, 7).map(Number)) : dataValida(ano, mes, dia);
}

export async function dataDaFoto(arquivo) {
  const doExif = await dataDoExif(arquivo);
  if (doExif) return { data: doExif, origem: 'exif' };
  const doNome = dataDoNome(arquivo.name);
  return doNome ? { data: doNome, origem: 'nome' } : null;
}

export function sugestaoDeData(arquivo) {
  if (!arquivo.lastModified) return null;
  const data = new Date(arquivo.lastModified);
  const valida = dataValida(data.getFullYear(), data.getMonth() + 1, data.getDate(), data.getHours(), data.getMinutes(), data.getSeconds());
  return valida && valida.toDateString() !== new Date().toDateString() ? valida : null;
}

export function diaEmTexto(data) {
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
}

export function dataNoDia(dia) {
  const [ano, mes, numero] = dia.split('-').map(Number);
  return dataValida(ano, mes, numero);
}

export function dataInformada(dia) {
  if (dia === diaEmTexto(new Date())) return { data: new Date(), origem: 'envio' };
  const data = dataNoDia(dia);
  return data ? { data, origem: 'informada' } : null;
}

export function gerarId(data) {
  const dia = `${data.getFullYear()}${pad(data.getMonth() + 1)}${pad(data.getDate())}`;
  const hora = `${pad(data.getHours())}${pad(data.getMinutes())}${pad(data.getSeconds())}`;
  const sufixo = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${dia}T${hora}-${sufixo}`;
}

export function comFuso(data) {
  const minutos = -data.getTimezoneOffset();
  const sinal = minutos < 0 ? '-' : '+';
  const fuso = `${sinal}${pad(Math.floor(Math.abs(minutos) / 60))}:${pad(Math.abs(minutos) % 60)}`;
  return (
    `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}` +
    `T${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())}${fuso}`
  );
}

const EXTENSAO_DO_TIPO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif' };
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'];
const EXTENSOES_ACEITAS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'];
const EXTENSOES_SEM_SUPORTE = ['heic', 'heif', 'tif', 'tiff', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'raw', 'psd'];


function extensaoDoNome(nome) {
  const partes = /\.([0-9a-z]{1,5})$/i.exec(nome);
  return partes ? partes[1].toLowerCase() : null;
}

export function extensaoDe(arquivo) {
  return extensaoDoNome(arquivo.name) ?? EXTENSAO_DO_TIPO[arquivo.type] ?? 'jpg';
}

export function ehImagem(arquivo) {
  if (arquivo.type) return TIPOS_ACEITOS.includes(arquivo.type);
  return EXTENSOES_ACEITAS.includes(extensaoDoNome(arquivo.name));
}

export function ehImagemSemSuporte(arquivo) {
  if (ehImagem(arquivo)) return false;
  return arquivo.type.startsWith('image/') || EXTENSOES_SEM_SUPORTE.includes(extensaoDoNome(arquivo.name));
}

export async function gerarMiniatura(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();
    const largura = imagem.naturalWidth;
    const altura = imagem.naturalHeight;
    if (!largura || !altura) return null;

    const escala = Math.min(1, LADO_MENOR_MINIATURA / Math.min(largura, altura), LADO_MAIOR_MINIATURA / Math.max(largura, altura));
    const tela = document.createElement('canvas');
    tela.width = Math.max(1, Math.round(largura * escala));
    tela.height = Math.max(1, Math.round(altura * escala));
    const contexto = tela.getContext('2d');

    contexto.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--superficie');
    contexto.fillRect(0, 0, tela.width, tela.height);

    contexto.drawImage(imagem, 0, 0, tela.width, tela.height);
    const blob = await new Promise((resolver) => tela.toBlob(resolver, 'image/jpeg', QUALIDADE_MINIATURA));
    return blob ? { blob, largura, altura } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function paraBase64(blob) {
  return new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(leitor.result.slice(leitor.result.indexOf(',') + 1));
    leitor.onerror = () => rejeitar(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

const TIPO_DA_EXTENSAO = Object.fromEntries(Object.entries(EXTENSAO_DO_TIPO).map(([tipo, extensao]) => [extensao, tipo]));

export function tipoDaExtensao(extensao) {
  return TIPO_DA_EXTENSAO[extensao] ?? (extensao === 'jpeg' ? 'image/jpeg' : 'application/octet-stream');
}

export function separarNome(nome) {
  const partes = /^(.*?)(\.[0-9a-z]{1,5})?$/i.exec(nome);
  return partes[1] ? [partes[1], partes[2] ?? ''] : [nome, ''];
}

export async function shaDoGit(origem) {
  const conteudo = typeof origem === 'string' ? new TextEncoder().encode(origem) : new Uint8Array(await origem.arrayBuffer());
  const cabecalho = new TextEncoder().encode(`blob ${conteudo.length}\0`);
  const bytes = new Uint8Array(cabecalho.length + conteudo.length);
  bytes.set(cabecalho);
  bytes.set(conteudo, cabecalho.length);
  const resumo = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(resumo)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function nomeRepetido(nome, usados) {
  const [inteira, extensao] = separarNome(nome);
  const base = inteira.replace(/ \(\d+\)$/, '');
  for (let n = 2; ; n++) {
    const candidato = `${base} (${n})${extensao}`;
    if (!usados.includes(candidato)) return candidato;
  }
}

export function caminhos(id, extensao) {
  const ano = id.slice(0, 4);
  return {
    blob: `fotos/${ano}/${id}.${extensao}`,
    miniatura: `miniaturas/${ano}/${id}.jpg`,
    registro: `registros/${ano}/${id}.json`,
  };
}

export function montarRegistro({ id, arquivo, nome, data, origem, miniatura, blob }) {
  return {
    versao: 1,
    id,
    nome,
    tipo: arquivo.type || null,
    tamanho: arquivo.size,
    largura: miniatura?.largura ?? null,
    altura: miniatura?.altura ?? null,
    data: comFuso(data),
    origem_da_data: origem,
    enviada_em: comFuso(new Date()),
    blob,
    miniatura: miniatura ? caminhos(id, '').miniatura : null,
  };
}

export const fmtTamanho = (bytes) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / (1024 * 1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
    : bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} KB`;

export async function analisar(url) {
  const imagem = new Image();
  imagem.src = url;
  try {
    await imagem.decode();
  } catch {
    return null;
  }
  const escala = 160 / Math.max(imagem.naturalWidth, imagem.naturalHeight);
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
  tela.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
  const contexto = tela.getContext('2d', { willReadFrequently: true });
  contexto.drawImage(imagem, 0, 0, tela.width, tela.height);
  const pontos = contexto.getImageData(0, 0, tela.width, tela.height).data;

  const faixas = new Map();
  let luminancia = 0;
  for (let i = 0; i < pontos.length; i += 4) {
    const [r, g, b] = [pontos[i], pontos[i + 1], pontos[i + 2]];
    luminancia += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const chave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const faixa = faixas.get(chave);
    if (faixa) {
      faixa[0]++;
      faixa[1] += r;
      faixa[2] += g;
      faixa[3] += b;
    } else {
      faixas.set(chave, [1, r, g, b]);
    }
  }

  const cores = [...faixas.values()]
    .sort((a, b) => b[0] - a[0])
    .map(([n, r, g, b]) => [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  const paleta = [];
  for (const cor of cores) {
    if (paleta.every((outra) => Math.hypot(outra[0] - cor[0], outra[1] - cor[1], outra[2] - cor[2]) > 52)) paleta.push(cor);
    if (paleta.length === 6) break;
  }
  return { paleta, luminancia: luminancia / (pontos.length / 4) / 255 };
}
