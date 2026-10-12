# Requisitos: Drive Fotos

Levantamento feito em 2026-10-12, a partir do plano em `planos/plano-inicial.md`, da análise
de gaps e dos limites documentados pelo GitHub. Revisto no mesmo dia pela análise de gaps do
Épico 13, que está no fim deste documento.

## Limites do GitHub

O GitHub não tem cota por tipo de mídia nem conta "assets". Foto é um arquivo como outro
qualquer. O que existe são limites de tamanho, de forma do repositório e de ritmo de uso.

### O que bloqueia de fato

| Limite | Valor | Efeito no app |
| --- | --- | --- |
| Tamanho de um arquivo | 100 MiB | Recusa o envio. Foto não chega perto, vídeo chegaria. |
| Leitura de blob pela API | 100 MB | Mesmo teto na hora de abrir a original. |
| Escritas pela API | 80 por minuto e 500 por hora, na documentação. Na medida de 2026-10-12 o envio de arquivos passou disso: ver abaixo | Pausa o envio com 403 ou 429. |
| Pontos pela API | 900 por minuto; escrita custa 5, leitura custa 1 | Idem. |
| Requisições pela API | 5.000 por hora | Só pesa na primeira carga de uma grade grande. |
| Requisições simultâneas | 100 | Limitar a concorrência das miniaturas. |
| Tamanho de um push | 2 GB | Não se aplica: o app grava pela API, não por push. |

### O que é recomendação

| Limite | Valor | Efeito no app |
| --- | --- | --- |
| Tamanho do repositório | ideal abaixo de 1 GB, "fortemente recomendado" abaixo de 5 GB | Teto prático de cada repositório de dados. |
| Tamanho em disco | 10 GB | Teto da página de limites de repositório, mais folgado que o de cima. |
| Entradas por pasta | 3.000 | Uma pasta única de fotos estoura com 3.000 fotos. |
| Tamanho de um objeto | 1 MB | Toda foto original passa disso. |
| Árvore recursiva | 100.000 entradas ou 7 MB | Acima disso a lista vem cortada (`truncated`). |

As duas páginas do GitHub dão números diferentes para o tamanho do repositório (5 GB e
10 GB). O requisito adota o menor.

### O que acontece ao passar da recomendação

Nada é bloqueado na hora. O risco é sobre a conta, não sobre o repositório:

- O suporte pode mandar e-mail pedindo ação corretiva se o repositório pesar na
  infraestrutura.
- A política de uso permite limitar a hospedagem de arquivos, suspender a conta ou apagar o
  repositório, com aviso prévio, quando o uso é "significativamente excessivo" comparado ao
  de outros usuários.
- A documentação diz que o Git "não foi projetado para servir como ferramenta de backup".

Decisão de 2026-10-12: o repositório de dados fica numa conta separada, criada só para
isso, para que uma ação do GitHub não atinja a conta do portfólio e dos projetos de
carreira. Os termos do GitHub permitem uma conta pessoal gratuita por pessoa, mais uma
conta de máquina gratuita, "usada exclusivamente para tarefas automatizadas". A conta
separada se apoia nessa segunda regra.

### Contas que saem desses números

- **Capacidade:** com foto de 3 a 5 MB, 1 GB guarda de 200 a 300 fotos e 5 GB guardam de
  1.000 a 1.600. Estimativa minha.
- **Ritmo de envio:** uma foto por commit são 5 escritas (blob, miniatura, árvore, commit,
  branch), com o registro indo embutido na árvore. Pelo teto de 500 por hora, isso dá 100
  fotos por hora. Vários por commit custam 2 escritas por foto mais 3 por lote, e o teto
  sobe para perto de 240 por hora. O GitHub não define com precisão o que conta como
  escrita "geradora de conteúdo", então o número real precisa de medição.
- **Medida de 2026-10-12,** na base de testes, com arquivos de 20 KB e sem commit: 128
  escritas por minuto passaram por 70 segundos; uma rajada de 530 por minuto foi bloqueada
  por 1 minuto depois de 554 escritas; depois da espera, mais 20 passaram. Foram 574
  escritas em 3,5 minutos, então o teto de 500 por hora não vale para o envio de arquivos.
  Falta medir o ritmo sustentado por mais tempo e com fotos de tamanho real.
- **Git LFS não resolve:** tem cota própria de armazenamento e de tráfego, e não é feito
  para ser usado direto do navegador.

## Requisitos funcionais

| # | Requisito | Origem |
| --- | --- | --- |
| RF01 | Entrar com token pessoal, validado contra o repositório de dados | Plano |
| RF02 | Sair apaga o token e o cache de fotos do navegador | Gap |
| RF03 | Enviar uma ou várias fotos por toque, clique, teclado ou arrastar | Plano |
| RF04 | Recusar arquivo vazio, pasta, não imagem e arquivo acima do teto, com aviso | Plano, limite |
| RF05 | Gerar miniatura no navegador, na orientação correta | Plano, gap |
| RF06 | Mostrar a fila com estado por item e "tentar de novo" | Plano |
| RF07 | Pausar a fila e retomar sozinha quando o GitHub limitar o ritmo | Limite |
| RF08 | Avisar antes de sair com envio em andamento e manter a tela acordada | Gap |
| RF09 | Não enviar foto que já existe no repositório | Gap |
| RF10 | Mostrar a grade de miniaturas por dia, da mais recente para a mais antiga | Plano |
| RF11 | Abrir a foto em tela cheia e navegar para a anterior e a próxima | Plano |
| RF12 | Renomear a foto | Plano |
| RF13 | Baixar a original, usando o compartilhar do sistema no celular | Plano, gap |
| RF14 | Apagar a foto, com confirmação | Plano |
| RF15 | Mostrar o espaço usado e avisar perto do teto | Plano, limite |
| RF16 | Mostrar o que foi enviado ou apagado em outro aparelho ao voltar para a tela | Plano |
| RF17 | Avisar da foto repetida, por conteúdo ou por nome, mostrar as duas lado a lado e deixar escolher por foto. Detalha o RF09 | Épico 7 |
| RF18 | A data da foto vem do EXIF ou, sem ele, do nome do arquivo. Sem os dois, o app pergunta | Épico 8 |
| RF19 | Tela "Fotos sem data", para acertar depois a data das que subiram sem ela | Épico 8 |
| RF20 | Atualizar por botão e por puxar a tela, com a hora da última atualização e erro com "Tentar de novo" | Épico 9 |
| RF21 | Copiar um link temporário de download, que abre sem conta e baixa com o nome da foto | Épico 10 |
| RF22 | Página de novidades por versão, e a versão em uso no rodapé | Épico 11 |
| RF23 | Selecionar várias fotos, inclusive um dia inteiro, e apagar todas num commit só | Épico 12 |
| RF24 | Backup de uma pasta do computador: conferência antes do envio, pausa, retomada, cancelamento e relatório | Épico 17 |

## Requisitos não funcionais

| # | Requisito | Origem |
| --- | --- | --- |
| RNF01 | HTML, CSS e JS puros, sem build, sem dependência e sem servidor | Plano |
| RNF02 | Funcionar no celular e no computador, instalável na tela inicial | Plano |
| RNF03 | Nenhuma foto, nome de foto ou token no repositório público | Plano |
| RNF04 | Token com acesso só ao repositório de dados, guardado só no navegador | Plano |
| RNF05 | Origem própria para o app, sem dividir armazenamento com outros sites | Gap |
| RNF06 | Uma foto entra inteira ou não entra: blob, miniatura e registro no mesmo commit | Plano |
| RNF07 | Envio simultâneo de dois aparelhos não perde foto | Plano |
| RNF08 | A grade abre sem baixar nenhuma original | Plano |
| RNF09 | Reabrir o app não baixa de novo o que já foi visto, com teto de cache | Plano, gap |
| RNF10 | Mensagem própria para cada tipo de erro, incluindo limite de ritmo | Plano, limite |
| RNF11 | Página aberta sem token (download, novidades) não mostra foto nem dado do repositório além do link recebido | Épicos 10 e 11 |
| RNF12 | A cópia de uma foto idêntica não é enviada de novo nem ocupa espaço novo | Épico 7 |

## Restrições que vêm do GitHub

| # | Restrição | Motivo |
| --- | --- | --- |
| RG01 | Teto de 25 MB por foto | Folga sobre os 100 MiB e sobre a memória do celular |
| RG02 | Pastas por ano: `fotos/AAAA/`, e o mesmo para miniaturas e registros. Comporta até 3.000 fotos por ano | 3.000 entradas por pasta |
| RG03 | Aviso em 4 GB por repositório de dados. No envio comum só avisa; no backup de uma pasta bloqueia o início. O aviso de 1 GB caiu (gap G05) | Recomendação de tamanho |
| RG04 | Repositório de dados configurável, para abrir um novo quando o atual encher | Capacidade |
| RG05 | Lote grande vai em commits de até dez fotos, não um commit por foto | Menos escritas e envio mais rápido: 2,1 s por foto em lote contra 5,0 s |
| RG06 | No máximo 6 downloads de miniatura ao mesmo tempo | Requisições simultâneas |
| RG07 | Repositório de dados criado com um commit inicial antes do primeiro uso | A API de Git Data recusa repositório vazio |
| RG08 | Repositório de dados numa conta separada, com o token gerado nela | Isolar a conta principal de limite ou suspensão |
| RG09 | Sem vídeo | 100 MiB por arquivo e consumo de espaço |
| RG10 | Cópia de segurança fora do GitHub, por `git clone` periódico | O GitHub pode limitar ou apagar com aviso |
| RG11 | O backup envia três fotos por vez e no máximo 110 escritas por minuto | Medida de 2026-10-12: rajada é bloqueada por 1 minuto |

## Pendente de decisão

Revistas na análise de gaps de 2026-10-12.

1. **Álbum curado ou backup da câmera.** Segue aberta. O Épico 17 entregou o backup de uma
   pasta com bloqueio em 4 GB, então hoje vale "um repositório, até 4 GB". Fecha no
   levantamento do tamanho real do acervo, antes da primeira migração na base oficial.
2. **iPhone ou Android.** Proposta: fechar como iPhone. É inferência minha a partir do que
   o app já trata (barra de status do iPhone, cópia do link no Safari, HEIC convertido).
   A confirmar.
3. **Domínio do app.** Segue aberta, e virou o gap G10: o app está no GitHub Pages da conta
   principal e divide a origem com os outros sites dela.
4. **Commit por lote.** Fechada em 2026-10-12: o envio grava em lotes de até dez fotos
   (versão 1.4.0). O RG05 foi atualizado.

## Análise de gaps de 2026-10-12

Épico 13. Compara o plano, este documento e o código como ele está na versão 1.8.0. As
decisões abaixo são propostas minhas e valem quando o Samuel confirmar. As marcadas "feito
agora" são correções de texto, já aplicadas no plano ou neste documento.

### Prometido e não feito, ou feito de outro jeito

| # | Gap | Decisão proposta |
| --- | --- | --- |
| G01 | O plano dizia que a miniatura reduz a foto já na decodificação, com `createImageBitmap`. O código decodifica a foto inteira num `<img>` e reduz no `canvas`. Foto de muitos megapixels pode pesar na memória do celular | Texto do plano corrigido, feito agora. A troca no código entra no Épico 14 |
| G02 | Plano e RG05 tratavam 500 escritas por hora como teto do envio. A medida de 2026-10-12 não achou esse teto | Feito agora |
| G03 | A estrutura do app no plano não listava as três páginas novas nem os quatro arquivos de `src/` que vieram com elas | Feito agora |
| G04 | O exemplo de registro no plano não tinha `origem_da_data` | Feito agora |
| G05 | O RG03 pedia aviso a partir de 1 GB. O app só avisa em 4 GB, como o Épico 6 decidiu | Aceitar. RG03 corrigido, feito agora |
| G06 | O Épico 17 mandava reutilizar a fila de envio do app. O `src/backup-app.js` tem fila própria, login próprio e uma função de nome livre que repete a `nomeRepetido` de `src/foto.js` | Épico 14 |
| G07 | O Épico 11 estava feito e seguia desmarcado nas pendências | Feito agora |
| G08 | O Épico 17 foi dado como feito sem o ensaio com cem fotos nem a amostra de data, nome e orientação que o "Pronto quando" pede | Aceito por decisão do Samuel em 2026-10-12. A primeira migração real começa pela base de testes |
| G09 | O Épico 12 ficou sem a medição com 50 e com 200 fotos, e sem teto de fotos por vez | Aceitar até aparecer problema |
| G10 | RNF05 não atendido: o token e o cache ficam na origem do GitHub Pages da conta principal, que outros sites dela também usam | Decisão do Samuel. Proposta: aceitar como limite enquanto todos os sites dessa origem forem dele |
| G11 | RG04, repositório de dados configurável, não foi feito. O backup bloqueia em 4 GB em vez de abrir outro repositório | Aceitar até o acervo pedir. Depende da decisão 1 |
| G12 | RG10, a cópia de segurança por `git clone`, é manual e nada no app lembra dela, fora o texto do aviso de 4 GB | Épico 16: documentar o passo a passo |

### Feito no código e não escrito

| # | Gap | Decisão proposta |
| --- | --- | --- |
| G13 | Todo envio de arquivo tem tempo máximo de 5 minutos, inclusive no envio comum. Uma foto de 25 MB precisa de cerca de 0,9 Mbps de subida para passar | Aceitar como limite. Épico 16: documentar |
| G14 | O limite de 110 escritas por minuto e as três fotos por vez só existem no backup | Feito agora, como RG11 |
| G15 | O README não cita o backup, o link de download nem as novidades | Épico 16 |
| G16 | O projeto não tem teste automatizado nem lint. Toda verificação é manual, no navegador | Aceitar: vem do RNF01, sem build e sem dependência |

### Casos em que ninguém pensou

| # | Gap | Decisão proposta |
| --- | --- | --- |
| G17 | A tela de backup não mostra "base de testes" em `localhost`, como a tela principal mostra | Corrigir agora, em PR próprio |
| G18 | O link "Backup de uma pasta" aparece no celular, onde não dá para escolher pasta, e fica acima de "Enviar fotos", que é a ação principal | Corrigir agora, em PR próprio |
| G19 | O app não confere se a lista do repositório veio cortada (`truncated`). Acima de 100.000 entradas ou 7 MB, fotos sumiriam da grade sem aviso | Aceitar: os 4 GB chegam antes, com cerca de 4.800 entradas |
| G20 | As leituras pela API não têm tempo máximo. Uma requisição pendurada deixa "Carregando suas fotos..." sem fim e sem "Tentar de novo" | Épico 14 |
| G21 | A conferência do backup baixa um registro por foto guardada a cada vez, sem usar os registros que o app já guarda no aparelho | Épico 14, junto com o G06 |
| G22 | No backup, pausar, cancelar, queda de token, seletor de pasta e retomada não foram testados. O envio de cinco fotos pequenas foi | Testar na primeira migração, na base de testes |
| G23 | O backup não pede para manter a tela acordada, como o envio comum pede | Aceitar: é tela de computador |
| G24 | Ritmo sustentado de escritas não medido: os 128 por minuto valem para 70 segundos | Medir na primeira migração. Se bloquear, baixar o RG11 |
| G25 | Rodando local, o navegador segura a versão antiga dos arquivos de `src/`, porque o servidor de teste não manda cabeçalho de cache | Épico 16: uma linha no README |

### Itens "Em aberto" de cada épico

| Épico | Item | Situação |
| --- | --- | --- |
| 10 | Quanto tempo o link vale | Aberto. Só se sabe que passa de 4 minutos |
| 10 | Link gerado em `localhost` aponta para `localhost` | Aceito como limite |
| 10 | A chave fica visível no link | Aceito como limite |
| 12 | Teto de fotos por vez | Aberto, é o G09 |
| 12 | "Selecionar tudo" | Caiu |
| 17 | Origem e tamanho reais do acervo | Aberto, trava a decisão 1 |
| 17 | HEIC: converter ou guardar sem miniatura | Aberto |
| 17 | Metadados em arquivo auxiliar | Aberto |
| 17 | Reaproveitar a permissão da pasta na retomada | Aberto |
| 17 | Acervo que não cabe | Aberto, é o G11 |
| 18 | Lembrete, atalho do sistema e pasta no computador | Aberto, o épico não começou |
| Plano | Data da foto | Fechado no Épico 8 |
| Plano | Original no iPhone | Aberto. Hoje sobe o JPEG convertido |
| Plano | Origem do app | Aberto, é o G10 |
| Plano | Tamanho do lote | Aberto. Segue em dez, sem medida com levas reais |

## Impacto no plano

O plano foi revisado em 2026-10-12, na análise de gaps. Seguem fora dele o RG04 e o RNF05,
que dependem das decisões pendentes 1 e 3.

## Fontes

- https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/rest/git/blobs
- https://docs.github.com/en/rest/git/trees
- https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies
