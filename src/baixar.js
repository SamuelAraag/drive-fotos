import { fmtTamanho } from './foto.js';
import { REPO_DADOS } from './github.js';

const $ = (id) => document.getElementById(id);

const ESTADOS = ['preparando', 'pronta', 'erro'];

function mostrar(estado) {
  for (const nome of ESTADOS) $(`baixar-${nome}`).hidden = nome !== estado;
}

function erro(titulo, texto, { podeTentar = false } = {}) {
  $('baixar-erro-titulo').textContent = titulo;
  $('baixar-erro-texto').textContent = texto;
  $('baixar-de-novo').hidden = !podeTentar;
  mostrar('erro');
}

function lerLink() {
  const parametros = new URLSearchParams(location.hash.slice(1));
  let endereco;
  try {
    endereco = new URL(parametros.get('u'));
  } catch {
    return null;
  }
  const doRepositorio =
    endereco.protocol === 'https:' && endereco.hostname === 'raw.githubusercontent.com' && endereco.pathname.startsWith(`/${REPO_DADOS}/`);
  if (!doRepositorio) return null;

  const pedido = parametros.get('n') || decodeURIComponent(endereco.pathname.split('/').pop());
  const nome = pedido.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'foto';
  return { endereco: endereco.href, nome };
}

async function preparar() {
  const link = lerLink();
  if (!link) {
    erro('Link incompleto', 'Este link não traz uma foto. Peça a quem enviou para gerar outro e mandar de novo.');
    return;
  }
  mostrar('preparando');
  let resposta;
  try {
    resposta = await fetch(link.endereco, { credentials: 'omit', cache: 'no-store' });
  } catch {
    erro('Sem conexão', 'Não deu para buscar a foto. Confira a internet e tente de novo.', { podeTentar: true });
    return;
  }
  if (!resposta.ok) {
    erro('Este link venceu', 'O link de uma foto vale por pouco tempo. Peça a quem enviou para gerar outro e mandar de novo.');
    return;
  }
  const arquivo = await resposta.blob();
  const local = URL.createObjectURL(arquivo);
  const botao = $('baixar-link');
  botao.href = local;
  botao.download = link.nome;
  $('baixar-nome').textContent = link.nome;
  $('baixar-tamanho').textContent = fmtTamanho(arquivo.size);

  const previa = $('baixar-previa');
  previa.addEventListener('error', () => (previa.hidden = true), { once: true });
  previa.src = local;
  mostrar('pronta');

  botao.click();
}

$('baixar-de-novo').addEventListener('click', preparar);
preparar();
