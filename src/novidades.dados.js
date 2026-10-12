// O que entrou em cada versão do Drive Fotos, da mais nova para a mais antiga.
// Toda entrega acrescenta a entrada dela no topo desta lista. A versão do app é a da primeira.
// `quando` é a data e a hora local em que a versão foi para a base principal.

export const NOVIDADES = [
  {
    versao: '1.6.0',
    quando: '2026-10-12T16:36',
    titulo: 'Novidades',
    mudancas: [
      'Página "Novidades", com tudo o que entrou em cada versão do app.',
      'Rodapé com a versão atual e o botão que leva para as novidades.',
    ],
  },
  {
    versao: '1.5.0',
    quando: '2026-10-12T16:30',
    titulo: 'Link para enviar a foto a alguém',
    mudancas: [
      'Botão "Copiar link" na foto aberta: um toque manda o link para a área de transferência.',
      'Página de download para quem recebe o link: baixa a foto com o nome certo, sem conta, sem app e sem token.',
      'O link vale por pouco tempo. Se vencer, a página avisa e basta gerar outro.',
      'Confirmação "Link copiado" no meio da foto e no próprio botão.',
    ],
  },
  {
    versao: '1.4.0',
    quando: '2026-10-12T16:14',
    titulo: 'Envio mais rápido',
    mudancas: [
      'As fotos são guardadas em lotes de até dez, em vez de uma por vez.',
      'A foto e a miniatura dela sobem ao mesmo tempo.',
      'Num teste com quatro fotos, o envio caiu de 19,9 para 8,5 segundos.',
      'Numa leva, as fotos passam a entrar na grade em bloco.',
    ],
  },
  {
    versao: '1.3.0',
    quando: '2026-10-12T16:00',
    titulo: 'Atualizar',
    mudancas: [
      'Botão "Atualizar" no topo, que relê as fotos na hora e mostra a hora da última atualização.',
      'Puxar a tela para baixo também atualiza, com o conteúdo descendo junto com o dedo.',
      'Se a atualização falha, um aviso diz o motivo e oferece "Tentar de novo".',
      'O topo fica sempre em uma linha no celular.',
      'Mais folga no topo da foto aberta, por causa da barra de status do iPhone.',
    ],
  },
  {
    versao: '1.2.0',
    quando: '2026-10-12T15:45',
    titulo: 'A data da foto é a de quando ela foi tirada',
    mudancas: [
      'A data vem da própria foto (EXIF) e, sem ela, do nome do arquivo. Uma imagem de 2015 enviada hoje aparece em 2015.',
      'Foto sem data nenhuma: o app pergunta o dia, com hoje já preenchido.',
      'Tela "Fotos sem data", para acertar depois as que subiram com pressa, com um dia só para todo o envio ou um por foto.',
      'A foto aberta mostra "Tirada em" e "Enviada em".',
      'Site publicado pelo GitHub Pages.',
    ],
  },
  {
    versao: '1.1.0',
    quando: '2026-10-12T15:14',
    titulo: 'Fotos repetidas',
    mudancas: [
      'O app reconhece a foto que já está guardada, pelo conteúdo ou pelo nome, antes de enviar de novo.',
      'A foto guardada e a nova aparecem lado a lado, com o tamanho de cada uma.',
      'Em cada par dá para escolher entre não enviar e manter as duas. A cópia sobe como "nome (2)".',
      'A cópia de uma foto idêntica não é enviada de novo e não ocupa espaço novo.',
    ],
  },
  {
    versao: '1.0.0',
    quando: '2026-10-12T14:39',
    titulo: 'Espaço usado e atualização automática',
    mudancas: [
      'Primeira versão completa: entrar, enviar, ver, renomear, baixar e apagar.',
      'Pílula no canto com o espaço ocupado e o total de fotos.',
      'Aviso quando o espaço passa de 4 GB.',
      'Ao voltar para a aba, o app confere se algo mudou em outro aparelho.',
      'Margens maiores em telas largas.',
    ],
  },
  {
    versao: '0.5.0',
    quando: '2026-10-12T14:23',
    titulo: 'Renomear, baixar e apagar',
    mudancas: [
      'Renomear a foto sem mexer no arquivo.',
      'Baixar a original com o nome da foto. No celular, pelo compartilhar do sistema.',
      'Apagar com confirmação, mostrando qual foto vai sair.',
    ],
  },
  {
    versao: '0.4.0',
    quando: '2026-10-12T14:09',
    titulo: 'Foto aberta',
    mudancas: [
      'A foto abre em tela cheia, crescendo do quadro dela na grade, com o fundo desfocado.',
      'Anterior e próxima pelas setas, pelo teclado ou deslizando o dedo.',
      'Painel de informações com nome, dimensões, tamanho, data e as cores da foto.',
      'Fotos e miniaturas ficam guardadas no aparelho, para abrir sem esperar.',
    ],
  },
  {
    versao: '0.3.0',
    quando: '2026-10-12T13:00',
    titulo: 'Envio',
    mudancas: [
      'Enviar fotos tocando na zona de envio ou arrastando para qualquer canto da página.',
      'Barra com o percentual de cada foto.',
      'A foto recém-enviada pousa na grade em destaque. Fora da tela, um atalho leva até ela.',
      'Só as fotos que falharam ficam listadas, com "Tentar de novo".',
    ],
  },
  {
    versao: '0.2.0',
    quando: '2026-10-12T12:24',
    titulo: 'Grade',
    mudancas: [
      'Grade de miniaturas, da mais recente para a mais antiga, agrupada por dia.',
      'As miniaturas carregam conforme aparecem na tela.',
      'Base de testes separada, usada quando o app roda na própria máquina.',
    ],
  },
  {
    versao: '0.1.0',
    quando: '2026-10-12T12:12',
    titulo: 'Fundação e login',
    mudancas: [
      'Entrar com um token do GitHub, guardado só no navegador.',
      'Mensagem própria para token inválido, sem permissão e repositório ausente.',
      '"Sair", com confirmação, apaga o token e as fotos guardadas no aparelho.',
    ],
  },
];

export const VERSAO_ATUAL = NOVIDADES[0].versao;
