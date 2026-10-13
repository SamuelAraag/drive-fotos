import * as foto from './foto.js';
import * as github from './github.js';
import * as indices from './indice.js';

const $ = (id) => document.getElementById(id);
const MAXIMO_POR_COMMIT = 10;
const ENVIOS_SIMULTANEOS = 3;
const LEITURAS_SIMULTANEAS = 6;
// Medida de 2026-10-12: 128 escritas por minuto passaram, e uma rajada de 530 foi bloqueada.
const ESCRITAS_POR_MINUTO = 110;
const AVISO_DE_ESPACO = 4 * 1024 * 1024 * 1024;
const MARCADOR = 'drive-fotos.backup-interrompido';
// O índice de antes do formato por ano. Sai do repositório na primeira gravação.
const INDICE_ANTIGO = 'indices/backup.json';
const LOTES_POR_INDICE = 10;

let arquivosOrigem = [];
let backupPronto = null;
let backupAtivo = null;
let enviando = false;
let pausada = false;
let cancelada = false;
let leituraAtiva = false;
// Índice das fotos (ver indice.js). O envio em lote regrava o ano de tempos em tempos, e não a
// cada commit: com um lote a cada poucos segundos, o arquivo do ano pesaria mais que as fotos.
let indice = new Map(); // caminho do registro -> entrada
let anosComIndice = new Set();
let anosPorGravar = new Set();
let temIndiceAntigo = false;
let lotesSemIndice = 0;

const chaveNome = (nome) => nome.toLocaleLowerCase('pt-BR');
const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Segura o ritmo das escritas abaixo do que o GitHub bloqueia. Quando ele pede pausa a um
// envio, os outros esperam junto em vez de insistir.
const escritas = [];
let limiteAte = 0;

async function aguardarRitmo(quantas = 1) {
  for (;;) {
    const agora = Date.now();
    while (escritas.length && agora - escritas[0] >= 60000) escritas.shift();
    if (agora < limiteAte) await dormir(limiteAte - agora);
    else if (escritas.length + quantas > ESCRITAS_POR_MINUTO) await dormir(escritas[0] + 60000 - agora);
    else break;
  }
  for (let i = 0; i < quantas; i++) escritas.push(Date.now());
}

function esperarLimite(falha) {
  limiteAte = Math.max(limiteAte, Date.now() + falha.esperaMs);
}

function erro(mensagem) {
  $('backup-erro').hidden = !mensagem;
  $('backup-erro').textContent = mensagem ?? '';
}

function mensagemLogin(mensagem) {
  $('backup-login-erro').hidden = !mensagem;
  $('backup-login-erro').textContent = mensagem ?? '';
}

function listaDiretorio(handle, caminho = '') {
  return (async () => {
    const arquivos = [];
    for await (const entrada of handle.values()) {
      const relativo = caminho ? `${caminho}/${entrada.name}` : entrada.name;
      if (entrada.kind === 'directory') {
        arquivos.push(...(await listaDiretorio(entrada, relativo)));
      } else if (entrada.kind === 'file') {
        arquivos.push({ arquivo: await entrada.getFile(), caminho: relativo });
      }
    }
    return arquivos;
  })();
}

function lerMarcador() {
  try {
    return sessionStorage.getItem(MARCADOR) === 'sim';
  } catch (falha) {
    console.warn('Drive Fotos: não foi possível ler o estado de retomada do backup.', falha);
    return false;
  }
}

function salvarMarcador(ativo) {
  try {
    if (ativo) sessionStorage.setItem(MARCADOR, 'sim');
    else sessionStorage.removeItem(MARCADOR);
  } catch (falha) {
    console.warn('Drive Fotos: não foi possível salvar o estado de retomada do backup.', falha);
  }
}

function mostrarPagina() {
  const token = github.lerToken();
  $('backup-login').hidden = Boolean(token);
  $('backup-conteudo').hidden = !token;
  $('backup-interrompido').hidden = !lerMarcador();
  if (!token) $('backup-token').focus();
}

function botaoDePasta() {
  const suportaPasta = Boolean(window.showDirectoryPicker || 'webkitdirectory' in $('backup-entrada-pasta'));
  $('backup-escolher-pasta').hidden = !suportaPasta;
  $('backup-limite-navegador').hidden = suportaPasta;
}

function definirEtapa(etapa) {
  $('backup-escolha').hidden = etapa !== 'escolha';
  $('backup-resumo').hidden = etapa !== 'resumo';
  $('backup-andamento').hidden = etapa !== 'andamento';
}

function atualizarBotaoIniciar() {
  // Sem nada para enviar o botão some: o título do resumo já diz o porquê.
  $('backup-iniciar').hidden = !backupPronto || backupPronto.candidatas.length === 0;
  $('backup-iniciar').disabled = !backupPronto;
}

const plural = (quantidade, um, varios) => `${quantidade.toLocaleString('pt-BR')} ${quantidade === 1 ? um : varios}`;

function linhaDeArquivo(caminho, estado) {
  const linha = document.createElement('li');
  const nome = document.createElement('span');
  const situacao = document.createElement('span');
  nome.textContent = caminho;
  situacao.textContent = estado;
  linha.append(nome, situacao);
  return linha;
}

function escapeCsv(valor = '') {
  return `"${String(valor).replaceAll('"', '""')}"`;
}

function baixarRelatorio(linhas) {
  const texto = [
    ['Caminho', 'Nome', 'Estado', 'Motivo'].map(escapeCsv).join(';'),
    ...linhas.map(({ caminho, nome, estado, motivo }) => [caminho, nome, estado, motivo].map(escapeCsv).join(';')),
  ].join('\r\n');
  const arquivo = new File([`\uFEFF${texto}`], 'relatorio-backup.csv', { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.href = url;
  link.download = arquivo.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function relatorioPronto() {
  if (!backupPronto) return [];
  return [
    ...backupPronto.ignorados,
    ...backupPronto.candidatas.map((item) => ({
      caminho: item.caminho,
      nome: item.arquivo.name,
      estado: item.repetidaConteudo ? 'aguarda decisão' : 'pendente',
      motivo: item.repetidaConteudo ? 'conteúdo igual com outro nome' : '',
    })),
  ];
}

function relatorioFinal() {
  if (!backupAtivo) return [];
  return [
    ...backupAtivo.ignorados,
    ...backupAtivo.candidatas.map((item) => ({
      caminho: item.caminho,
      nome: item.arquivo.name,
      estado: item.estado === 'concluido' ? 'enviado' : item.estado,
      motivo: item.motivo ?? '',
    })),
  ];
}

function atualizarRelatorio() {
  $('backup-lista').replaceChildren(
    ...backupAtivo.candidatas.map((item) => {
      const estado = item.estado === 'concluido' ? 'Enviado' : item.estado;
      return linhaDeArquivo(item.caminho, item.motivo ? `${estado} · ${item.motivo}` : estado);
    }),
    ...backupAtivo.ignorados.map((item) => linhaDeArquivo(item.caminho, `Ignorado · ${item.motivo}`)),
  );
}

function renderizar(comLista = true) {
  if (!backupAtivo) return;
  const enviadas = backupAtivo.candidatas.filter((item) => item.estado === 'concluido').length;
  const falhas = backupAtivo.candidatas.filter((item) => item.estado === 'erro').length;
  const aguardando = backupAtivo.candidatas.filter((item) => item.estado === 'aguardando').length;
  const emAndamento = backupAtivo.candidatas.filter((item) => ['enviando', 'gravando'].includes(item.estado)).length;
  const pendentes = aguardando + emAndamento;
  const ignoradas = backupAtivo.ignorados.length + backupAtivo.candidatas.filter((item) => item.estado === 'ignorado').length;
  const concluida = pendentes === 0 && !enviando && !pausada;
  const resolvidas = enviadas + falhas + ignoradas;

  $('backup-status').textContent = cancelada
    ? 'Backup cancelado.'
    : concluida
      ? falhas
        ? 'Backup concluído com arquivos que falharam.'
        : 'Backup concluído.'
      : pausada
        ? 'Backup pausado.'
        : emAndamento
          ? 'Enviando fotos. Você pode continuar usando esta aba.'
          : 'Preparando a fila de arquivos.';
  const subindo = backupAtivo.candidatas.filter((item) => item.estado === 'enviando');
  const gravando = backupAtivo.candidatas.filter((item) => item.estado === 'gravando');
  $('backup-atual').textContent = subindo.length
    ? `Enviando agora: ${subindo.map((item) => `${item.caminho} (${item.etapa ?? 'Preparando'}${item.progresso > 0 ? ` ${Math.round(item.progresso * 100)}%` : ''})`).join(' · ')}`
    : gravando.length
      ? gravando[0].etapa
      : '';
  $('backup-contagem').textContent =
    `${enviadas} enviadas · ${ignoradas} ignoradas · ${falhas} com erro · ${aguardando} aguardando` +
    (emAndamento ? ` · ${emAndamento} em andamento` : '');
  const fracaoAtual = [...subindo, ...gravando].reduce((soma, item) => soma + (item.progresso ?? 0), 0);
  const total = backupAtivo.candidatas.length + backupAtivo.ignorados.length;
  $('backup-progresso').value = total ? Math.min(100, Math.round(((resolvidas + fracaoAtual) / total) * 100)) : 100;
  $('backup-pausar').hidden = concluida || pausada || !enviando;
  $('backup-retomar-botao').hidden = concluida || !pausada;
  $('backup-cancelar').hidden = concluida;
  $('backup-relatorio').hidden = !concluida;
  $('backup-nova-escolha-final').hidden = !concluida;
  $('backup-tentar-erros').hidden = !concluida || falhas === 0;
  $('backup-lista-detalhes').hidden = !concluida && !enviando;
  if (comLista) atualizarRelatorio();
  if (concluida && falhas === 0) salvarMarcador(false);
}

function nomeSemColisao(nome, nomesUsados) {
  const [inteira, extensao] = foto.separarNome(nome);
  const base = inteira.replace(/ \(\d+\)$/, '');
  let n = 2;
  let candidato = `${base} (${n})${extensao}`;
  while (nomesUsados.has(chaveNome(candidato))) candidato = `${base} (${++n})${extensao}`;
  return candidato;
}

async function lerFotosExistentes(arvore) {
  const arquivosPorCaminho = new Map(arvore.map((item) => [item.caminho, item]));
  const registros = arvore.filter((item) => item.caminho.startsWith('registros/'));
  const nomes = new Map();
  const hashes = new Set();
  const fotosPorHash = new Map(arvore.filter((item) => item.caminho.startsWith('fotos/')).map((item) => [item.sha, item]));
  const caminhosComRegistro = new Set();
  const conhecer = (nome, fotoDaArvore) => {
    const chave = chaveNome(nome);
    if (!nomes.has(chave)) nomes.set(chave, new Set());
    nomes.get(chave).add(fotoDaArvore.sha);
    hashes.add(fotoDaArvore.sha);
    caminhosComRegistro.add(fotoDaArvore.caminho);
  };
  // O índice traz o nome de quase todas. Só o registro que ele não conhece é lido um a um.
  const lido = await indices.carregar(arvore, async (sha) => (await github.lerBlob(sha)).text());
  const novo = new Map();
  const mudaram = new Set();
  const porLer = [];
  for (const item of registros) {
    const entrada = lido.entradas.get(item.caminho);
    if (!entrada) {
      porLer.push(item);
      mudaram.add(indices.anoDoRegistro(item.caminho));
      continue;
    }
    novo.set(item.caminho, entrada);
    conhecer(entrada.nome, arquivosPorCaminho.get(entrada.blob));
  }
  if (porLer.length) $('backup-status').textContent = `Lendo ${plural(porLer.length, 'registro novo', 'registros novos')}...`;
  let proximo = 0;
  let falhaLeitura = null;
  const lerRegistro = async () => {
    while (proximo < porLer.length && !falhaLeitura) {
      const item = porLer[proximo++];
      try {
        let texto;
        for (;;) {
          try {
            texto = await github.lerBlob(item.sha).then((blob) => blob.text());
            break;
          } catch (falha) {
            if (falha.tipo !== 'limite') throw falha;
            await dormir(falha.esperaMs);
          }
        }
        const registro = JSON.parse(texto);
        const fotoDaArvore = arquivosPorCaminho.get(registro.blob);
        if (!fotoDaArvore) continue;
        const nome = registro.nome || registro.blob.split('/').pop();
        conhecer(nome, fotoDaArvore);
        novo.set(item.caminho, indices.entradaDe(registro, item.sha));
      } catch (falha) {
        if (falha instanceof SyntaxError) {
          const [, ano, id] = /^registros\/(\d{4})\/([0-9]{8}T[0-9]{6}-[0-9a-z]+)\.json$/i.exec(item.caminho) ?? [];
          const prefixo = ano && id ? `fotos/${ano}/${id}.` : '';
          const fotoDaArvore = prefixo ? arvore.find((fotoItem) => fotoItem.caminho.startsWith(prefixo)) : null;
          if (!fotoDaArvore) {
            falhaLeitura = new Error(`Não foi possível identificar a foto de ${item.caminho}.`);
            break;
          }
          const nome = fotoDaArvore.caminho.split('/').pop();
          const chave = chaveNome(nome);
          if (!nomes.has(chave)) nomes.set(chave, new Set());
          nomes.get(chave).add(fotoDaArvore.sha);
          hashes.add(fotoDaArvore.sha);
        } else {
          falhaLeitura = new Error(`Falha ao ler registros do repositório: ${falha.message}`);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: LEITURAS_SIMULTANEAS }, lerRegistro));
  if (falhaLeitura) throw falhaLeitura;
  for (const item of arvore.filter((entrada) => entrada.caminho.startsWith('fotos/') && !caminhosComRegistro.has(entrada.caminho))) {
    const nome = item.caminho.split('/').pop();
    const chave = chaveNome(nome);
    if (!nomes.has(chave)) nomes.set(chave, new Set());
    nomes.get(chave).add(item.sha);
    hashes.add(item.sha);
  }
  // Arquivo de ano com entrada que não vale mais (foto apagada, registro trocado) também é regravado.
  const porAno = new Map();
  for (const caminho of novo.keys()) {
    const ano = indices.anoDoRegistro(caminho);
    porAno.set(ano, (porAno.get(ano) ?? 0) + 1);
  }
  for (const [ano, quantas] of lido.noArquivo) if ((porAno.get(ano) ?? 0) !== quantas) mudaram.add(ano);
  indice = novo;
  anosComIndice = new Set(lido.noArquivo.keys());
  anosPorGravar = mudaram;
  temIndiceAntigo = arquivosPorCaminho.has(INDICE_ANTIGO);
  return { nomes, hashes, fotosPorHash };
}

// Grava os anos que mudaram num commit próprio. Se falhar, nada se perde: a próxima conferência
// lê os registros que faltam e tenta de novo.
async function salvarIndice() {
  if ((anosPorGravar.size === 0 && !temIndiceAntigo) || !github.lerToken()) return;
  const anos = [...anosPorGravar];
  const arquivos = anos
    .map((ano) => indices.arquivoDoAno(ano, [...indice].filter(([caminho]) => indices.anoDoRegistro(caminho) === ano), anosComIndice.has(ano)))
    .filter(Boolean);
  if (temIndiceAntigo) arquivos.push({ caminho: INDICE_ANTIGO, apagar: true });
  if (arquivos.length === 0) {
    anosPorGravar.clear();
    return;
  }
  try {
    await aguardarRitmo(3);
    await github.gravar(arquivos, 'indice das fotos');
    for (const ano of anos) {
      anosPorGravar.delete(ano);
      if (indice.size && [...indice.keys()].some((caminho) => indices.anoDoRegistro(caminho) === ano)) anosComIndice.add(ano);
      else anosComIndice.delete(ano);
    }
    temIndiceAntigo = false;
    lotesSemIndice = 0;
  } catch (falha) {
    console.warn('Drive Fotos: não foi possível gravar o índice das fotos.', falha);
  }
}

async function preparar(arquivos, pasta) {
  if (!github.lerToken()) {
    erro('Entre no Drive Fotos para preparar o backup.');
    return;
  }
  if (leituraAtiva || enviando || backupAtivo && !backupAtivo.concluida) {
    erro('Conclua ou cancele o backup atual antes de escolher outra origem.');
    return;
  }
  leituraAtiva = true;
  backupPronto = null;
  arquivosOrigem = arquivos;
  erro(null);
  definirEtapa('andamento');
  $('backup-interrompido').hidden = true;
  $('backup-status').textContent = 'Conferindo o repositório...';
  $('backup-atual').textContent = '';
  $('backup-contagem').textContent = '';
  $('backup-progresso').value = 0;
  $('backup-lista-detalhes').hidden = true;
  for (const id of ['backup-pausar', 'backup-retomar-botao', 'backup-cancelar', 'backup-tentar-erros', 'backup-relatorio', 'backup-nova-escolha-final']) {
    $(id).hidden = true;
  }
  try {
    const arvore = await github.lerArvore();
    $('backup-status').textContent = 'Conferindo o que já está guardado...';
    const existentes = await lerFotosExistentes(arvore);
    const nomesUsados = new Set(existentes.nomes.keys());
    const nomesParaGerar = new Set(nomesUsados);
    const ignorados = [];
    const candidatas = [];
    let repetidasExatas = 0;
    let repetidasPorConteudo = 0;
    let renomeadas = 0;
    let bytes = 0;

    for (let indice = 0; indice < arquivos.length; indice++) {
      const origem = arquivos[indice];
      const arquivo = origem.arquivo;
      $('backup-status').textContent = `Conferindo ${indice + 1} de ${arquivos.length} arquivos...`;
      $('backup-atual').textContent = origem.caminho;
      $('backup-progresso').value = Math.round((indice / arquivos.length) * 100);
      if (arquivo.size === 0) {
        ignorados.push({ caminho: origem.caminho, nome: arquivo.name, estado: 'ignorado', motivo: 'arquivo vazio' });
        continue;
      }
      if (!foto.ehImagem(arquivo)) {
        ignorados.push({ caminho: origem.caminho, nome: arquivo.name, estado: 'ignorado', motivo: 'formato não reconhecido como imagem' });
        continue;
      }
      if (arquivo.size > foto.TAMANHO_MAXIMO) {
        ignorados.push({
          caminho: origem.caminho,
          nome: arquivo.name,
          estado: 'ignorado',
          motivo: `acima de ${foto.fmtTamanho(foto.TAMANHO_MAXIMO)}`,
        });
        continue;
      }

      const sha = await foto.shaDoGit(arquivo);
      const chave = chaveNome(arquivo.name);
      if (existentes.nomes.get(chave)?.has(sha)) {
        repetidasExatas++;
        ignorados.push({ caminho: origem.caminho, nome: arquivo.name, estado: 'ignorado', motivo: 'já existe com o mesmo nome e conteúdo' });
        continue;
      }

      const dadosDaFoto = (await foto.dataDaFoto(arquivo)) ?? { data: new Date(), origem: 'envio' };
      let nome = arquivo.name;
      if (nomesUsados.has(chave)) {
        nome = nomeSemColisao(nome, nomesParaGerar);
        renomeadas++;
      }
      const chaveFinal = chaveNome(nome);
      nomesUsados.add(chaveFinal);
      nomesParaGerar.add(chaveFinal);
      if (!existentes.nomes.has(chave)) existentes.nomes.set(chave, new Set());
      existentes.nomes.get(chave).add(sha);
      if (!existentes.nomes.has(chaveFinal)) existentes.nomes.set(chaveFinal, new Set());
      existentes.nomes.get(chaveFinal).add(sha);
      const repetidaConteudo = existentes.hashes.has(sha) || candidatas.some((item) => item.sha === sha);
      if (repetidaConteudo) repetidasPorConteudo++;
      const fotoExistente = existentes.fotosPorHash.get(sha);
      const arquivoRenomeado = nome === arquivo.name
        ? arquivo
        : new File([arquivo], nome, { type: arquivo.type, lastModified: arquivo.lastModified });
      bytes += arquivo.size;
      candidatas.push({
        arquivo: arquivoRenomeado,
        originalName: arquivo.name,
        caminho: origem.caminho,
        sha,
        data: dadosDaFoto,
        repetidaConteudo,
        shaExistente: fotoExistente?.sha ?? null,
        estado: 'pendente',
        motivo: null,
        progresso: 0,
        pronta: null,
      });
    }

    const formatos = new Map();
    for (const { arquivo } of arquivos.filter(({ arquivo }) => foto.ehImagem(arquivo) && arquivo.size <= foto.TAMANHO_MAXIMO && arquivo.size > 0)) {
      const ext = foto.extensaoDe(arquivo).toUpperCase().replace('JPEG', 'JPG');
      formatos.set(ext, (formatos.get(ext) ?? 0) + 1);
    }
    const espacoAtual = arvore.reduce((total, item) => total + item.tamanho, 0);
    const estimativa = espacoAtual + Math.ceil(bytes * 1.2);
    const acimaDoAviso = estimativa > AVISO_DE_ESPACO;
    backupPronto = { candidatas, ignorados, pasta, acimaDoAviso };
    const imagens = candidatas.length + repetidasExatas;
    $('backup-resumo-titulo').textContent = candidatas.length
      ? `${plural(candidatas.length, 'foto', 'fotos')} para enviar · ${foto.fmtTamanho(bytes)}`
      : 'Nenhuma foto nova para enviar';
    $('backup-resumo-texto').textContent = candidatas.length
      ? `${plural(arquivos.length, 'arquivo', 'arquivos')} em ${pasta}. ${[...formatos].map(([ext, quantidade]) => `${ext} ${quantidade}`).join(', ')}. Depois do envio o Drive Fotos fica com cerca de ${foto.fmtTamanho(estimativa)}.`
      : arquivos.length === 0
        ? 'A origem escolhida está vazia. Escolha outra pasta ou outros arquivos.'
        : imagens > 0 && repetidasExatas === imagens
          ? 'Todas as imagens desta origem já estão no Drive Fotos, com o mesmo nome e conteúdo.'
          : 'Nenhum arquivo desta origem é uma imagem que o Drive Fotos aceita. Veja o motivo de cada um abaixo.';
    const detalhes = [];
    if (candidatas.length && repetidasExatas) {
      detalhes.push(`${plural(repetidasExatas, 'já está', 'já estão')} no Drive Fotos, com o mesmo nome e conteúdo, e não ${repetidasExatas === 1 ? 'sobe' : 'sobem'} de novo.`);
    }
    if (renomeadas) {
      detalhes.push(`${plural(renomeadas, 'tem nome que já existe e sobe', 'têm nome que já existe e sobem')} com outro nome.`);
    }
    $('backup-detalhes').replaceChildren(...detalhes.map((texto) => {
      const item = document.createElement('li');
      item.textContent = texto;
      return item;
    }));
    $('backup-ignorados').hidden = ignorados.length === 0;
    $('backup-ignorados').open = candidatas.length === 0;
    $('backup-ignorados-titulo').textContent = plural(ignorados.length, 'arquivo fica de fora', 'arquivos ficam de fora');
    $('backup-ignorados-lista').replaceChildren(...ignorados.map(({ caminho, motivo }) => linhaDeArquivo(caminho, motivo)));
    const comRepetidas = candidatas.filter((item) => item.repetidaConteudo);
    $('backup-repetidas').hidden = comRepetidas.length === 0;
    $('backup-repetidas-lista').replaceChildren(...comRepetidas.map((item) => {
      const linha = document.createElement('li');
      const rotulo = document.createElement('label');
      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.dataset.caminho = item.caminho;
      const texto = document.createElement('span');
      texto.textContent = `${item.caminho} · ${item.arquivo.name}`;
      rotulo.append(caixa, texto);
      linha.append(rotulo);
      return linha;
    }));
    $('backup-limite').hidden = !acimaDoAviso;
    // Só avisa, não bloqueia, como o aviso de espaço do app.
    $('backup-limite').textContent = acimaDoAviso
      ? `Com estas fotos o Drive Fotos passa de 4 GB (estimativa: ${foto.fmtTamanho(estimativa)}). O GitHub recomenda até 5 GB por repositório, e apagar fotos não libera espaço. Você pode enviar mesmo assim.`
      : '';
    atualizarBotaoIniciar();
    $('backup-relatorio-resumo').hidden = arquivos.length === 0;
    definirEtapa('resumo');
    $('backup-resumo-titulo').focus();
    salvarIndice();
  } catch (falha) {
    if (falha.tipo === 'token') {
      github.apagarToken();
      $('backup-login').hidden = false;
      mensagemLogin(falha.message);
    }
    erro(`Não foi possível analisar a origem: ${falha.message}`);
    definirEtapa('escolha');
  } finally {
    leituraAtiva = false;
  }
}

async function blobComLimite(arquivo, item, aoProgredir = () => {}) {
  const base64 = await foto.paraBase64(arquivo);
  for (;;) {
    await aguardarRitmo();
    try {
      item.etapa = 'Enviando';
      return await github.enviarBlob(base64, (valor) => {
        aoProgredir(valor);
        renderizar(false);
      });
    } catch (falha) {
      if (falha.tipo !== 'limite') throw falha;
      esperarLimite(falha);
      item.etapa = falha.message;
      renderizar(false);
    }
  }
}

async function prepararFoto(item) {
  if (item.pronta) return item.pronta;
  item.etapa = 'Preparando miniatura';
  renderizar(false);
  const id = foto.gerarId(item.data.data);
  const caminhos = foto.caminhos(id, foto.extensaoDe(item.arquivo));
  const miniatura = await foto.gerarMiniatura(item.arquivo);
  const registro = foto.montarRegistro({
    id,
    arquivo: item.arquivo,
    nome: item.arquivo.name,
    data: item.data.data,
    origem: item.data.origem,
    miniatura,
    blob: caminhos.blob,
  });
  const progresso = (valor) => {
    item.progresso = valor;
  };
  // A original e a miniatura sobem ao mesmo tempo, como no envio do app.
  const [shaOriginal, shaMiniatura] = await Promise.all([
    item.shaExistente ?? blobComLimite(item.arquivo, item, progresso),
    miniatura ? blobComLimite(miniatura.blob, item) : null,
  ]);
  const entradas = [{ caminho: caminhos.blob, sha: shaOriginal }];
  if (shaMiniatura) entradas.push({ caminho: caminhos.miniatura, sha: shaMiniatura });
  const texto = `${JSON.stringify(registro, null, 2)}\n`;
  entradas.push({ caminho: caminhos.registro, texto });
  item.pronta = {
    id,
    entradas,
    noIndice: [caminhos.registro, indices.entradaDe(registro, await foto.shaDoGit(texto))],
  };
  return item.pronta;
}

async function gravarLote(lote) {
  if (lote.length === 0) return;
  for (;;) {
    try {
      for (const item of lote) item.etapa = 'Gravando lote no repositório';
      renderizar();
      await aguardarRitmo(3);
      await github.gravar(lote.flatMap((item) => item.pronta.entradas), lote.length === 1 ? `foto: ${lote[0].pronta.id}` : `fotos: ${lote.length}`);
      for (const item of lote) {
        item.estado = 'concluido';
        item.progresso = 1;
        indice.set(...item.pronta.noIndice);
        anosPorGravar.add(indices.anoDoRegistro(item.pronta.noIndice[0]));
      }
      renderizar();
      if (++lotesSemIndice >= LOTES_POR_INDICE) await salvarIndice();
      return;
    } catch (falha) {
      if (falha.tipo === 'limite') {
        esperarLimite(falha);
        for (const item of lote) item.etapa = falha.message;
        renderizar();
        continue;
      }
      if (falha.tipo === 'token') {
        github.apagarToken();
        $('backup-login').hidden = false;
        mensagemLogin(falha.message);
        for (const item of lote) item.estado = 'aguardando';
        return false;
      }
      for (const item of lote) {
        item.estado = 'erro';
        item.motivo = falha.message;
      }
      renderizar();
      return true;
    }
  }
}

async function enviarFoto(item) {
  item.estado = 'enviando';
  item.progresso = 0;
  item.etapa = 'Preparando';
  renderizar();
  try {
    await prepararFoto(item);
    item.estado = 'gravando';
    return true;
  } catch (falha) {
    if (falha.tipo === 'token') {
      github.apagarToken();
      $('backup-login').hidden = false;
      mensagemLogin(falha.message);
      item.estado = 'aguardando';
      return false;
    }
    item.estado = 'erro';
    item.motivo = falha.message;
    return true;
  } finally {
    renderizar();
  }
}

async function bombear() {
  if (enviando || !github.lerToken() || !backupAtivo) return;
  enviando = true;
  let lote = [];
  try {
    for (;;) {
      if (cancelada) {
        for (const item of backupAtivo.candidatas) {
          if (item.estado !== 'aguardando') continue;
          item.estado = 'ignorado';
          item.motivo = 'cancelado antes do envio';
        }
        break;
      }
      if (pausada) {
        while (pausada && !cancelada && github.lerToken()) await dormir(200);
        if (!github.lerToken()) break;
        continue;
      }
      const leva = backupAtivo.candidatas.filter((item) => item.estado === 'aguardando').slice(0, MAXIMO_POR_COMMIT);
      if (leva.length === 0) break;
      // Até ENVIOS_SIMULTANEOS fotos da leva sobem juntas. Pausar ou cancelar deixa terminar as
      // que já começaram e grava o que ficou pronto.
      let proxima = 0;
      let semToken = false;
      const trabalhar = async () => {
        while (proxima < leva.length && !pausada && !cancelada && !semToken) {
          if (!(await enviarFoto(leva[proxima++]))) semToken = true;
        }
      };
      await Promise.all(Array.from({ length: ENVIOS_SIMULTANEOS }, trabalhar));
      lote = leva.filter((item) => item.estado === 'gravando');
      if (semToken || await gravarLote(lote) === false) break;
      lote = [];
    }
  } catch (falha) {
    console.error('Drive Fotos: o backup parou por um erro inesperado.', falha);
    erro(`O backup parou por um erro inesperado: ${falha.message}`);
  } finally {
    // Quem já subiu e ficou sem commit volta para a fila: na retomada só falta gravar.
    for (const item of lote) {
      if (item.estado === 'gravando') item.estado = 'aguardando';
    }
    await salvarIndice();
    enviando = false;
    renderizar();
  }
}

async function iniciar() {
  if (!backupPronto || backupPronto.candidatas.length === 0) return;
  if (!github.lerToken()) {
    $('backup-login').hidden = false;
    mensagemLogin('Entre novamente para iniciar o backup.');
    return;
  }
  const selecionados = new Set(
    [...$('backup-repetidas-lista').querySelectorAll('input:checked')].map((caixa) => caixa.dataset.caminho),
  );
  backupAtivo = {
    pasta: backupPronto.pasta,
    candidatas: backupPronto.candidatas.map((item) => {
      if (item.repetidaConteudo && !selecionados.has(item.caminho)) {
        return { ...item, estado: 'ignorado', motivo: 'conteúdo repetido não selecionado' };
      }
      return { ...item, estado: 'aguardando' };
    }),
    ignorados: backupPronto.ignorados,
  };
  backupPronto = null;
  pausada = false;
  cancelada = false;
  $('backup-lista-detalhes').open = true;
  salvarMarcador(true);
  definirEtapa('andamento');
  await bombear();
}

function pausar() {
  if (!enviando) return;
  pausada = true;
  renderizar();
}

function retomar() {
  pausada = false;
  renderizar();
  if (!enviando) bombear();
}

function cancelar() {
  cancelada = true;
  pausada = false;
  if (!enviando) bombear();
  renderizar();
}

function tentarNovamente() {
  if (!backupAtivo) return;
  for (const item of backupAtivo.candidatas) {
    if (item.estado !== 'erro') continue;
    item.estado = 'aguardando';
    item.motivo = null;
  }
  cancelada = false;
  salvarMarcador(true);
  renderizar();
  bombear();
}

function baixarRelatorioAtual() {
  const linhas = backupAtivo ? relatorioFinal() : relatorioPronto();
  if (linhas.length) baixarRelatorio(linhas);
}

async function entrar(token) {
  github.salvarToken(token);
  $('backup-login-entrar').disabled = true;
  mensagemLogin(null);
  try {
    await github.lerArvore();
    $('backup-login').hidden = true;
    $('backup-conteudo').hidden = false;
    botaoDePasta();
    if (backupAtivo) bombear();
  } catch (falha) {
    github.apagarToken();
    mensagemLogin(falha.message);
  } finally {
    $('backup-login-entrar').disabled = false;
  }
}

$('backup-login-form').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const token = $('backup-token').value.trim();
  if (!token) {
    mensagemLogin('Cole o token para entrar.');
    return;
  }
  $('backup-token').value = '';
  entrar(token);
});
$('backup-login-trocar').addEventListener('click', () => {
  $('backup-login').hidden = false;
  $('backup-token').focus();
});
$('backup-escolher-pasta').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) {
    $('backup-entrada-pasta').click();
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    definirEtapa('andamento');
    $('backup-status').textContent = 'Lendo a pasta e suas subpastas...';
    const arquivos = await listaDiretorio(handle);
    preparar(arquivos, handle.name);
  } catch (falha) {
    definirEtapa('escolha');
    if (falha.name !== 'AbortError') erro(`Não foi possível ler a pasta: ${falha.message}`);
  }
});
$('backup-escolher-arquivos').addEventListener('click', () => $('backup-entrada-arquivos').click());
$('backup-entrada-pasta').addEventListener('change', () => {
  const arquivos = [...$('backup-entrada-pasta').files].map((arquivo) => ({
    arquivo,
    caminho: arquivo.webkitRelativePath || arquivo.name,
  }));
  if (arquivos.length) preparar(arquivos, arquivos[0].caminho.split('/')[0]);
  $('backup-entrada-pasta').value = '';
});
$('backup-entrada-arquivos').addEventListener('change', () => {
  const arquivos = [...$('backup-entrada-arquivos').files].map((arquivo) => ({ arquivo, caminho: arquivo.name }));
  if (arquivos.length) preparar(arquivos, 'Arquivos escolhidos');
  $('backup-entrada-arquivos').value = '';
});
$('backup-iniciar').addEventListener('click', iniciar);
$('backup-pausar').addEventListener('click', pausar);
$('backup-retomar-botao').addEventListener('click', retomar);
$('backup-cancelar').addEventListener('click', cancelar);
$('backup-tentar-erros').addEventListener('click', tentarNovamente);
$('backup-relatorio').addEventListener('click', baixarRelatorioAtual);
$('backup-relatorio-resumo').addEventListener('click', baixarRelatorioAtual);
$('backup-nova-escolha').addEventListener('click', () => {
  backupPronto = null;
  definirEtapa('escolha');
  erro(null);
});
$('backup-nova-escolha-final').addEventListener('click', () => {
  backupAtivo = null;
  cancelada = false;
  definirEtapa('escolha');
  erro(null);
});

window.addEventListener('beforeunload', (evento) => {
  if (leituraAtiva || enviando && backupAtivo?.candidatas.some((item) => ['aguardando', 'enviando', 'gravando'].includes(item.estado))) {
    evento.preventDefault();
  }
});

mostrarPagina();
botaoDePasta();
if (!github.lerToken()) $('backup-login').hidden = false;
