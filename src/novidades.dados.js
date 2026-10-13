export const NOVIDADES = [
  {
    versao: '1.11.2',
    quando: '2026-10-13T11:15',
    titulo: 'O app não abre mais com uma lista de fotos antiga',
    mudancas: [
      'O app guarda a lista de fotos no navegador para abrir na hora. Quando ela não cabia, ficava guardada uma lista antiga, que aparecia a cada abertura.',
      'Agora a lista antiga é apagada nesse caso, e o app abre pelo carregamento normal.',
    ],
  },
  {
    versao: '1.11.1',
    quando: '2026-10-12T23:28',
    titulo: 'O backup deixa as fotos HEIC de fora',
    mudancas: [
      'Fotos HEIC e HEIF da pasta escolhida não sobem mais no backup. Elas aparecem na lista do que fica de fora, com o motivo.',
      'No Chrome essas fotos subiam sem miniatura e ficavam como um quadro vazio na grade.',
    ],
  },
  {
    versao: '1.11.0',
    quando: '2026-10-12T23:21',
    titulo: 'Ao abrir, a tela já mostra o formato da grade',
    mudancas: [
      'Enquanto as fotos carregam, aparece o contorno da tela: a zona de envio e os quadros da grade, no lugar onde vão ficar.',
      'Quando as fotos chegam, elas entram nesses lugares. Antes aparecia só um girador no meio da tela.',
    ],
  },
  {
    versao: '1.10.3',
    quando: '2026-10-12T23:12',
    titulo: 'A grade deixa de animar o que está fora da tela',
    mudancas: [
      'Cada foto ainda não carregada piscava, mesmo fora da tela. Com 4.312 fotos eram mais de 4 mil animações ao mesmo tempo. Agora só pisca a que está carregando.',
      'A página só se desloca durante o gesto de puxar para atualizar. Antes ficava preparada para isso o tempo todo.',
      'No celular, a rolagem não espera mais o app a cada movimento do dedo.',
    ],
  },
  {
    versao: '1.10.2',
    quando: '2026-10-12T22:58',
    titulo: 'Ícone novo: um cata-vento vermelho',
    mudancas: [
      'O ícone do app, da aba do navegador e da tela inicial do celular agora é um cata-vento vermelho e grafite.',
    ],
  },
  {
    versao: '1.10.1',
    quando: '2026-10-12T22:39',
    titulo: 'A grade só baixa o que você está vendo',
    mudancas: [
      'O app baixava a foto original de tudo o que passava pela tela. Agora a original só é baixada quando você abre a foto.',
      'Rolando depressa, as miniaturas do que já saiu da tela deixam a fila, e as que você está vendo carregam primeiro.',
    ],
  },
  {
    versao: '1.10.0',
    quando: '2026-10-12T22:23',
    titulo: 'O app abre sem ler os dados de foto por foto',
    mudancas: [
      'Ao abrir, o app lia os dados de cada foto guardada, uma a uma. Agora lê uma lista por ano, e só os anos que mudaram.',
      'O aviso de fotos sem data e a tela "Fotos sem data" saem dessa lista, sem abrir cada foto.',
      'Enviar, renomear, apagar e acertar a data atualizam a lista junto com a foto.',
    ],
  },
  {
    versao: '1.9.0',
    quando: '2026-10-12T21:32',
    titulo: 'Todas as fotos aparecem, mesmo com um acervo grande',
    mudancas: [
      'Com milhares de fotos, o GitHub corta a lista que o app pede. Agora o app lê pasta por pasta e mostra todas.',
      'Se nem assim a lista vier inteira, o app avisa. Antes mostraria só uma parte, sem dizer que faltavam fotos.',
      'Ao voltar para a aba ou tocar em "Atualizar", o app primeiro confere se algo mudou. Sem novidade, não baixa a lista de novo.',
      'Quando algo muda, relê só as pastas dos anos que mudaram.',
    ],
  },
  {
    versao: '1.8.2',
    quando: '2026-10-12T20:58',
    titulo: 'O backup não trava mais acima de 4 GB',
    mudancas: [
      'Quando a pasta faz o Drive Fotos passar de 4 GB, a tela de backup avisa e deixa enviar.',
    ],
  },
  {
    versao: '1.8.1',
    quando: '2026-10-12T19:57',
    titulo: 'O backup confere a pasta bem mais rápido',
    mudancas: [
      'A tela de backup guarda uma lista do que já foi enviado e confere a pasta por ela.',
      'Só a primeira conferência lê as fotos uma a uma. Num teste com 68 fotos guardadas, ela levou 6 segundos e a seguinte, 2.',
    ],
  },
  {
    versao: '1.8.0',
    quando: '2026-10-12T19:32',
    titulo: 'Traga uma pasta inteira de fotos do computador',
    mudancas: [
      '"Backup de uma pasta" lê a pasta que você escolher, com as subpastas. Antes de enviar, mostra quantas fotos vão subir.',
      'Foto que já está no Drive Fotos não sobe de novo, e cada arquivo que fica de fora aparece com o motivo.',
      'Três fotos sobem ao mesmo tempo, e você pode pausar, retomar ou cancelar.',
      'No fim, um relatório para baixar diz o que aconteceu com cada arquivo.',
    ],
  },
  {
    versao: '1.7.0',
    quando: '2026-10-12T17:52',
    titulo: 'Apague várias fotos de uma vez',
    mudancas: [
      'Selecione fotos de dias diferentes e remova todas com uma confirmação e um único commit.',
      'No celular, mantenha o dedo sobre uma foto para começar a seleção.',
      'O botão de cada dia marca ou desmarca todas as fotos daquele dia.',
    ],
  },
  {
    versao: '1.6.0',
    quando: '2026-10-12T16:36',
    titulo: 'Veja o que mudou em cada versão',
    mudancas: [
      'A página "Novidades" lista o que entrou em cada versão, com data e hora.',
      'O rodapé mostra a versão que você está usando e leva para essa página.',
    ],
  },
  {
    versao: '1.5.0',
    quando: '2026-10-12T16:30',
    titulo: 'Mande uma foto para qualquer pessoa com um link',
    mudancas: [
      '"Copiar link", na foto aberta, põe o link na área de transferência com um toque.',
      'Quem recebe abre o link e a foto baixa com o nome certo. A pessoa não precisa de conta, do app nem de token.',
      'O link vale por pouco tempo. Quando vence, a página avisa, e você gera outro.',
      '"Link copiado" aparece no meio da foto e no botão, para confirmar.',
    ],
  },
  {
    versao: '1.4.0',
    quando: '2026-10-12T16:14',
    titulo: 'Enviar várias fotos ficou bem mais rápido',
    mudancas: [
      'O app guarda as fotos em lotes de até dez. Antes guardava uma por vez.',
      'A foto e a miniatura dela sobem ao mesmo tempo.',
      'Num teste com quatro fotos, o envio caiu de 19,9 para 8,5 segundos.',
      'Numa leva, as fotos entram na grade em bloco.',
    ],
  },
  {
    versao: '1.3.0',
    quando: '2026-10-12T16:00',
    titulo: 'Atualize as fotos sem recarregar a página',
    mudancas: [
      'O botão "Atualizar", no topo, relê as fotos na hora e mostra quando foi a última atualização.',
      'Puxar a tela para baixo faz o mesmo, e o conteúdo desce junto com o dedo.',
      'Quando a atualização falha, um aviso diz o motivo e oferece "Tentar de novo".',
      'No celular, o topo cabe em uma linha.',
      'A foto aberta ganhou folga no topo, para a barra de status do iPhone não ficar por cima.',
    ],
  },
  {
    versao: '1.2.0',
    quando: '2026-10-12T15:45',
    titulo: 'Cada foto no dia em que foi tirada',
    mudancas: [
      'A data vem da própria foto (EXIF) ou, na falta dela, do nome do arquivo. Uma imagem de 2015 enviada hoje aparece em 2015.',
      'Quando a foto não traz data nenhuma, o app pergunta o dia, com hoje já preenchido.',
      'A tela "Fotos sem data" junta as que subiram sem data, para acertar depois: um dia para o envio inteiro ou um por foto.',
      'A foto aberta mostra quando foi tirada e quando foi enviada.',
      'O site foi publicado pelo GitHub Pages.',
    ],
  },
  {
    versao: '1.1.0',
    quando: '2026-10-12T15:14',
    titulo: 'O app avisa antes de guardar uma foto repetida',
    mudancas: [
      'Antes de enviar, o app confere se a foto já está guardada, pelo conteúdo e pelo nome.',
      'A foto guardada e a nova aparecem lado a lado, cada uma com o tamanho do arquivo.',
      'Você decide par a par se envia ou se mantém as duas. A cópia sobe como "nome (2)".',
      'A cópia de uma foto idêntica não é enviada de novo nem ocupa espaço novo.',
    ],
  },
  {
    versao: '1.0.0',
    quando: '2026-10-12T14:39',
    titulo: 'Primeira versão completa, com o espaço usado sempre à vista',
    mudancas: [
      'Já dá para entrar, enviar, ver, renomear, baixar e apagar.',
      'Uma pílula no canto mostra o espaço ocupado e o total de fotos.',
      'O app avisa quando o espaço passa de 4 GB.',
      'Ao voltar para a aba, o app confere se algo mudou em outro aparelho.',
      'As margens ficaram maiores em telas largas.',
    ],
  },
  {
    versao: '0.5.0',
    quando: '2026-10-12T14:23',
    titulo: 'Renomeie, baixe e apague sem sair da foto',
    mudancas: [
      'Renomear muda o nome e não mexe no arquivo.',
      'Baixar traz a original com o nome da foto. No celular, abre o compartilhar do sistema.',
      'Apagar pede confirmação e mostra qual foto vai sair.',
    ],
  },
  {
    versao: '0.4.0',
    quando: '2026-10-12T14:09',
    titulo: 'Abra a foto em tela cheia e passe de uma para outra',
    mudancas: [
      'A foto cresce do quadro dela na grade até a tela cheia, com o fundo desfocado.',
      'Para ver a anterior e a próxima, use as setas, o teclado ou deslize o dedo.',
      'Um painel mostra nome, dimensões, tamanho, data e as cores da foto.',
      'Fotos e miniaturas ficam guardadas no aparelho, e por isso abrem sem esperar.',
    ],
  },
  {
    versao: '0.3.0',
    quando: '2026-10-12T13:00',
    titulo: 'Envie fotos tocando ou arrastando',
    mudancas: [
      'Toque na zona de envio ou arraste as fotos para qualquer canto da página.',
      'Uma barra mostra o percentual de cada foto.',
      'A foto que acabou de subir pousa na grade em destaque. Se ela cai fora da tela, um atalho leva até lá.',
      'Só as fotos que falharam ficam na lista, com "Tentar de novo".',
    ],
  },
  {
    versao: '0.2.0',
    quando: '2026-10-12T12:24',
    titulo: 'Suas fotos em uma grade, dia por dia',
    mudancas: [
      'As miniaturas aparecem da mais recente para a mais antiga, agrupadas por dia.',
      'Cada miniatura carrega quando chega perto da tela.',
      'Rodando na própria máquina, o app usa uma base de testes separada.',
    ],
  },
  {
    versao: '0.1.0',
    quando: '2026-10-12T12:12',
    titulo: 'Entre com um token que fica só no seu navegador',
    mudancas: [
      'O login é um token do GitHub.',
      'Token inválido, falta de permissão e repositório ausente têm cada um a sua mensagem.',
      '"Sair" pede confirmação e apaga o token e as fotos guardadas no aparelho.',
    ],
  },
];

export const VERSAO_ATUAL = NOVIDADES[0].versao;
