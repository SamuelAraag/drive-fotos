# Requisitos: Drive Fotos

Levantamento feito em 2026-10-12, a partir do plano em `planos/plano-inicial.md`, da análise
de gaps e dos limites documentados pelo GitHub. Onde o requisito contraria o plano, o plano
ainda não foi alterado: ver "Impacto no plano" no fim.

## Limites do GitHub

O GitHub não tem cota por tipo de mídia nem conta "assets". Foto é um arquivo como outro
qualquer. O que existe são limites de tamanho, de forma do repositório e de ritmo de uso.

### O que bloqueia de fato

| Limite | Valor | Efeito no app |
| --- | --- | --- |
| Tamanho de um arquivo | 100 MiB | Recusa o envio. Foto não chega perto, vídeo chegaria. |
| Leitura de blob pela API | 100 MB | Mesmo teto na hora de abrir a original. |
| Escritas pela API | 80 por minuto e 500 por hora | Pausa o envio com 403 ou 429. |
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

A conta em risco é a mesma do portfólio e dos projetos de carreira. Com um usuário só,
poucos GB e pouco tráfego, a chance é baixa, mas o custo de uma suspensão é alto.

### Contas que saem desses números

- **Capacidade:** com foto de 3 a 5 MB, 1 GB guarda de 200 a 300 fotos e 5 GB guardam de
  1.000 a 1.600. Estimativa minha.
- **Ritmo de envio:** uma foto por commit são 5 escritas (blob, miniatura, árvore, commit,
  branch), com o registro indo embutido na árvore. Pelo teto de 500 por hora, isso dá 100
  fotos por hora. Vários por commit custam 2 escritas por foto mais 3 por lote, e o teto
  sobe para perto de 240 por hora. O GitHub não define com precisão o que conta como
  escrita "geradora de conteúdo", então o número real precisa de medição.
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

## Restrições que vêm do GitHub

| # | Restrição | Motivo |
| --- | --- | --- |
| RG01 | Teto de 25 MB por foto | Folga sobre os 100 MiB e sobre a memória do celular |
| RG02 | Pastas por ano e mês: `fotos/AAAA/MM/`, e o mesmo para miniaturas e registros | 3.000 entradas por pasta |
| RG03 | Aviso em 4 GB e bloqueio de envio em 5 GB por repositório de dados | Recomendação de tamanho |
| RG04 | Repositório de dados configurável, para abrir um novo quando o atual encher | Capacidade |
| RG05 | Lote grande vai em commits de várias fotos, não um commit por foto | 500 escritas por hora |
| RG06 | No máximo 6 downloads de miniatura ao mesmo tempo | Requisições simultâneas |
| RG07 | Repositório de dados criado com um commit inicial antes do primeiro uso | A API de Git Data recusa repositório vazio |
| RG08 | Dados numa branch que não é a principal | Não pintar o gráfico de contribuições |
| RG09 | Sem vídeo | 100 MiB por arquivo e consumo de espaço |
| RG10 | Cópia de segurança fora do GitHub, por `git clone` periódico | O GitHub pode limitar ou apagar com aviso |

## Pendente de decisão

1. Álbum curado ou backup da câmera. Define se 5 GB por repositório bastam ou se o RG04
   precisa entrar no MVP.
2. iPhone ou Android. No iPhone, a data do arquivo tende a ser a do envio, e a foto chega
   convertida para JPEG.
3. Domínio do app: padrão do GitHub Pages ou próprio (RNF05).
4. RG05 muda a decisão "cada foto é um commit". Alternativa: manter um commit por foto e
   aceitar cerca de 100 fotos por hora.

## Impacto no plano

Se aceitos, estes requisitos mudam o plano em quatro pontos:

- caminhos passam de `fotos/<id>` para `fotos/AAAA/MM/<id>` (RG02);
- o repositório de dados deixa de ser fixo no código (RG04);
- a gravação passa para uma branch própria (RG08);
- entra um épico zero de preparo: repositórios, commit inicial, branch, token e hospedagem
  (RG07).

## Fontes

- https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits
- https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/rest/git/blobs
- https://docs.github.com/en/rest/git/trees
- https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies
