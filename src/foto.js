// Preparo de uma foto para o envio: id, miniatura, registro e conversão para base64.

const LADO_MENOR_MINIATURA = 400;
const LADO_MAIOR_MINIATURA = 1600; // teto para panorama não virar uma miniatura enorme
const QUALIDADE_MINIATURA = 0.8;

export const TAMANHO_MAXIMO = 25 * 1024 * 1024;

const pad = (n, casas = 2) => String(n).padStart(casas, '0');

// A data da foto é a de modificação do arquivo. Sem ela, a do envio.
export function dataDoArquivo(arquivo) {
  return arquivo.lastModified ? new Date(arquivo.lastModified) : new Date();
}

// 20261012T153045-a1b2: data no horário local e um sufixo para duas fotos do mesmo segundo.
export function gerarId(data) {
  const dia = `${data.getFullYear()}${pad(data.getMonth() + 1)}${pad(data.getDate())}`;
  const hora = `${pad(data.getHours())}${pad(data.getMinutes())}${pad(data.getSeconds())}`;
  const sufixo = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${dia}T${hora}-${sufixo}`;
}

// 2026-10-12T15:30:45-03:00
function comFuso(data) {
  const minutos = -data.getTimezoneOffset();
  const sinal = minutos < 0 ? '-' : '+';
  const fuso = `${sinal}${pad(Math.floor(Math.abs(minutos) / 60))}:${pad(Math.abs(minutos) % 60)}`;
  return (
    `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}` +
    `T${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())}${fuso}`
  );
}

const EXTENSAO_DO_TIPO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif' };
const EXTENSOES_DE_IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff'];

function extensaoDoNome(nome) {
  const partes = /\.([0-9a-z]{1,5})$/i.exec(nome);
  return partes ? partes[1].toLowerCase() : null;
}

export function extensaoDe(arquivo) {
  return extensaoDoNome(arquivo.name) ?? EXTENSAO_DO_TIPO[arquivo.type] ?? 'jpg';
}

// Alguns navegadores entregam HEIC sem tipo, então a extensão também vale.
export function ehImagem(arquivo) {
  return arquivo.type.startsWith('image/') || EXTENSOES_DE_IMAGEM.includes(extensaoDoNome(arquivo.name));
}

// Devolve { blob, largura, altura } ou null quando o navegador não sabe decodificar a foto
// (HEIC fora do Safari, por exemplo). Largura e altura são as da original.
export async function gerarMiniatura(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();
    const largura = imagem.naturalWidth;
    const altura = imagem.naturalHeight;
    if (!largura || !altura) return null;

    // O lado menor manda, porque a grade corta a miniatura em quadrado.
    const escala = Math.min(1, LADO_MENOR_MINIATURA / Math.min(largura, altura), LADO_MAIOR_MINIATURA / Math.max(largura, altura));
    const tela = document.createElement('canvas');
    tela.width = Math.max(1, Math.round(largura * escala));
    tela.height = Math.max(1, Math.round(altura * escala));
    const contexto = tela.getContext('2d');
    // JPEG não tem transparência: PNG transparente ganha o fundo dos quadros da grade.
    contexto.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--superficie');
    contexto.fillRect(0, 0, tela.width, tela.height);
    // O <img> já entrega a foto na orientação gravada nela.
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

// "praia.de.itapua.jpg" -> ["praia.de.itapua", ".jpg"]. Sem extensão, o segundo vem vazio.
export function separarNome(nome) {
  const partes = /^(.*?)(\.[0-9a-z]{1,5})?$/i.exec(nome);
  return partes[1] ? [partes[1], partes[2] ?? ''] : [nome, ''];
}

// Texto em base64, com acento e tudo.
export function textoParaBase64(texto) {
  let binario = '';
  for (const byte of new TextEncoder().encode(texto)) binario += String.fromCharCode(byte);
  return btoa(binario);
}

export function caminhos(id, extensao) {
  const ano = id.slice(0, 4);
  return {
    blob: `fotos/${ano}/${id}.${extensao}`,
    miniatura: `miniaturas/${ano}/${id}.jpg`,
    registro: `registros/${ano}/${id}.json`,
  };
}

export function montarRegistro({ id, arquivo, data, miniatura, blob }) {
  return {
    versao: 1,
    id,
    nome: arquivo.name,
    tipo: arquivo.type || null,
    tamanho: arquivo.size,
    largura: miniatura?.largura ?? null,
    altura: miniatura?.altura ?? null,
    data: comFuso(data),
    enviada_em: comFuso(new Date()),
    blob,
    miniatura: miniatura ? caminhos(id, '').miniatura : null,
  };
}

export const fmtTamanho = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('pt-BR')} KB`;

// Paleta dominante e luminância média de uma imagem, lidas de uma cópia reduzida.
// Devolve { paleta: [[r, g, b], ...], luminancia: 0 a 1 } ou null se a imagem não abrir.
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

  // Agrupa as cores em 4.096 faixas e soma a luminância percebida de cada ponto.
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
  // Das faixas mais cheias para as mais vazias, fica com seis cores bem diferentes entre si.
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
