---
name: live-capture
description: Fase 2 da máquina de cortes. Captura uma LIVE da Twitch em andamento em blocos de 2,5 min, transcreve cada bloco, cruza picos de reação (áudio) e de chat, escolhe os momentos com nota 6+ e manda cada um para o pipeline de edição da Fase 1 (corte vertical), enquanto a live ainda está rolando. Use quando o usuário pedir cortes de uma live da Twitch acontecendo agora, "captura da live", "fase 2" ou "cortar a live ao vivo". Sem publicação.
---

# live-capture (Fase 2)

Assiste a live em blocos curtos, decide o que tem potencial de viral e gera os cortes **durante** a transmissão. Nada é publicado.

`S` = `skills/live-capture/scripts` (neste repositório). `E` = `~/.maquina-cortes-gta/engine/scripts` (motor da Fase 1). `L` = pasta da live: `./lives/<canal>-<aaaa-mm-dd>/`.

## Dependências (confira antes de começar)

- **Servidor MCP `twitch` conectado** (ferramentas `mcp__twitch__*`). A checagem de status da live é feita **só** por ele (`mcp__twitch__get_stream_info`). **Sem o MCP, pare e avise o usuário: não reimplemente chamadas à API Helix nem a autenticação na mão.** Observação: neste servidor, `get_streams` não filtra por canal (e o filtro por jogo falha); para um canal específico use `get_stream_info`.
- **streamlink** (`winget install Streamlink.Streamlink`), **ffmpeg**, e o motor da Fase 1 instalado (`node skills/maquina-cortes-gta/scripts/setup.mjs --check`).
- Configuração do canal de saída em `config/canais/<canal>.json` (marca d'água, licenças) — ver `config/canais/LEIAME.md`.

**Chat — exceção documentada ao "tudo via MCP":** o servidor MCP instalado não tem EventSub nem leitura de mensagens. O chat é lido por `S/chat-irc.mjs` como **visitante anônimo** do IRC da Twitch (usuário `justinfan`, só leitura, **sem credenciais e sem API Helix**), decisão do usuário em 17/11/2026. Guarda só horário e texto, sem nomes. Se um dia o MCP ganhar leitura de chat, troque por ele.

**Relógio:** o relógio do PC pode estar errado (em 17/11/2026 estava ~18 min atrasado em relação à Twitch). Por isso o chat usa a hora de **chegada no PC** (`t`), o mesmo relógio da gravação; a hora do servidor fica em `ts` só como referência.

## Fluxo

### 1. Status antes de começar

Chame `mcp__twitch__get_stream_info` com o login do canal. Se não estiver ao vivo, **avise e pare**. Se estiver, anote jogo, título e horário de início.

### 2. Captura e chat (em segundo plano, sem parar enquanto analisa)

```bash
node S/capturar.mjs CANAL L --bloco 150
node S/chat-irc.mjs CANAL L
```

Os dois rodam em segundo plano. Blocos de 2,5 min em `L/blocos/bloco-000.ts`, `bloco-001.ts`... (nunca um arquivo único crescendo). Estado em `L/gravacao.json` (`ativo`, `inicio`, `motivoFim`) e `L/chat-status.json`.

### 3. Primeiro bloco: layout

No primeiro bloco, olhe `L/trabalho/bloco-000/quadros.jpg` (e um quadro inteiro do `source.mp4`) e ache a câmera do streamer e a área do jogo, **sem** a câmera e sem overlays. Grave num `L/layout.json` (`{"cameras": [...], "jogo": {...}}`) ou na config do canal, se for fixo. Ver `skills/maquina-cortes-gta/references/vertical.md`.

### 3b. Triagem automática (modo padrão, para reduzir o atraso)

Logo depois de definir o layout, deixe a triagem rodando **em segundo plano**, junto com a captura e o chat:

```bash
node S/triagem.mjs L config/canais/<canal>.json --layout L/layout.json
```

Ela faz sozinha, bloco a bloco, sem esperar você: prepara e transcreve **todo** bloco, mede a energia (`sinais.mjs`), agrupa os momentos, deduplica pelo horário da live (sobreposição de 40 s entre blocos), escreve um **rascunho** de corte para cada momento com nota estimada 5+ (recorte, abertura, gancho e título **provisórios**) e **renderiza na hora** os de nota 7+ (`L/cortes/rascunhos/`); os de 5–6 vão para `L/cortes/reserva/` quando a fila esvazia. Registra **tudo** em `L/triagem/log.md` (inclusive o que não virou corte e por quê) e apaga os brutos só depois de 30 min (`--retencao`) e com os renders do bloco prontos.

**Seu papel (revisão, quando estiver livre):**

1. Leia o fim de `L/triagem/log.md`. Para cada rascunho: confira o recorte nos quadros e na transcrição, **reescreva o gancho e o título** (skill `resenha-ptbr`), ajuste `trechos`/abertura/inserts no `cortes.json` do bloco e renderize de novo com `E/vertical.mjs ... --clip ID` para `L/cortes/` (aprovado). Rascunho bom como está: só copie para `L/cortes/`.
2. **Rede de segurança (não perder momento)**: a cada revisão, chame `mcp__twitch__get_clips` do canal. Clipe criado pelo público num horário **sem** rascunho correspondente = momento que a triagem não pegou: ache o bloco pelo horário e faça o corte à mão. Também confira momentos com nota estimada 4 no log se o chat ou um clipe apontarem para eles.
3. Status: `mcp__twitch__get_stream_info` a cada revisão. Se `L/triagem/log.md` tiver "triagem PARADA" ou a captura tiver `motivoFim` de erro, avise o usuário e pare.
4. Avise o usuário a cada corte aprovado (relatório abaixo).

A VOD da Twitch é a rede final: qualquer trecho que passou pode ser baixado depois (`yt-dlp --download-sections`).

### 4. Loop por bloco (modo manual, sem triagem)


Repita até a live acabar ou o usuário mandar parar:

1. **Preparar o próximo bloco** (em segundo plano; você é avisado quando terminar). Espera o bloco fechar, junta os últimos 40 s do bloco anterior (para pegar momentos que cruzam dois blocos), transcreve com o whisper.cpp (tempo por palavra) e gera o mosaico:

   ```bash
   node E/live-bloco.mjs L --sobreposicao 40
   ```

   Com `trilhaJogo` na configuração, transcreva também a trilha do jogo (skill `legenda-bilingue`).
2. **Status de novo**: `mcp__twitch__get_stream_info`. Se a live caiu, ou se `L/gravacao.json` tem `ativo: false` com `motivoFim` de erro, ou se o MCP não respondeu, ou se `L/chat-status.json` tem `erro`: **pare o loop e avise o usuário com o erro. Não reinicie nada sozinho.**
3. **Ler o bloco**: `node S/sinais.mjs L TRABALHO` primeiro (energia por janela de 5 s, rótulos de emoção, voz, tela e chat); depois `node E/transcript-text.mjs TRABALHO` nas janelas de energia alta e `TRABALHO/quadros.jpg`. Bloco todo morno (nada ≥ 5): sem corte vertical.
4. **Escolher os momentos** (critérios abaixo). Nota de 0 a 10 pela tabela de critérios abaixo; **nota 7+ é prioridade, nota 5–6 vira corte de reserva** (`L/cortes/reserva/`), abaixo de 5 não gera. Registre cada momento escolhido em `L/momentos.json` (horário na live, assunto, nota) e **não repita** assunto nem trecho que se sobreponha a um momento recente.
5. **Escolher a abertura** de cada corte (abaixo) e gravar `TRABALHO/cortes.json` no formato da Fase 1, com `"live": {"inicioGravacao": <gravacao.json inicio>, "offset": <bloco.json offset>}` (para medir o atraso real).
6. **Gerar o corte** com o pipeline da Fase 1 (layout, B-roll, legenda bilíngue, resenha pt-BR, SFX, checagem, metadados):

   ```bash
   node E/vertical.mjs TRABALHO config/canais/<canal>.json L/cortes
   ```

   Reprovado na checagem (código 2): corrija o `cortes.json` e rode de novo.
7. **Avisar o usuário** (relatório abaixo).
8. **Limpar o disco**: `node S/limpar.mjs L BLOCO` para cada bloco já decidido (aprovado e renderizado, ou descartado). O `.ts` só é apagado quando o bloco seguinte já foi preparado.

### 5. Parar

- Usuário mandou parar → `touch L/PARAR` (captura fecha o bloco atual; chat para junto). Processe o que já foi gravado, se o usuário quiser.
- `get_stream_info` diz offline → crie `L/PARAR`, processe os blocos restantes e avise.

## Vídeo longo em paralelo (partida, missão ou exploração completa)

Ao mesmo tempo que os curtos, gere o **vídeo longo** da unidade completa de conteúdo para o YouTube: uma **partida** do início ao fim (entrou na partida → vitória/derrota), uma **missão** ou **missão secundária** inteira no GTA, ou um trecho longo de **exploração** com descobertas. Não é "10 minutos da partida": é a partida **completa**.

1. **VOD da live**: `mcp__twitch__get_videos` (o primeiro `archive` é a live atual; ela cresce enquanto a live acontece). Assim dá para pegar também o que aconteceu **antes** da captura começar.
2. **Relógio**: a captura usa o relógio do PC; a VOD, o da Twitch. Meça a diferença pelo chat (mediana de `ts - t` em `chat.jsonl`) e calcule onde o início da captura cai na VOD: `inicioReal = gravacao.inicio + diferença`; `naVod = inicioReal - criação da VOD`. Guarde em `L/vod.json`.
3. **Margem antes e depois (sempre)**: o vídeo longo começa **antes** do início real (seleção de herói, carregamento, o papo antes de a missão começar) e termina **depois** do fim (análise, reclamação, piada pós-jogo). O `partida.mjs` já soma **90 s antes e 150 s depois** (`--margem-antes`, `--margem-depois`); estenda mais se a conversa antes/depois for boa, e corte só quando ele claramente muda de assunto ou entra na próxima partida/missão.
4. **Início**: baixe uma prévia leve da VOD até onde a captura começou (`yt-dlp -N 8 -f worst --download-sections "*0-FIM"`), gere o mosaico (`E/live-quadros.mjs ... --cada 30`) e ache o começo da partida/missão (tela de seleção/carregamento, início da missão).
5. **Fim**: acompanhe os mosaicos dos blocos da captura até a tela de vitória/derrota (ou missão concluída). Converta para o tempo da VOD (`naVod + offset do bloco + segundo`).
6. **Montar** (em segundo plano; baixa só o trecho e usa o montar-longo da Fase 1):

   ```bash
   node S/partida.mjs L ID URL_DA_VOD INICIO_VOD FIM_VOD --titulo "..." [--capitulos caps.json] [--remover rem.json]
   ```

   Capítulos (`[{"inicio": s_da_vod, "nome": "..."}]`) nos momentos-chave (primeira kill, virada, luta final); `--remover` só para tempo morto real (fila, menu, AFK), nunca para "encurtar" a partida.
7. Avise com título, duração e o caminho do arquivo e dos capítulos.

## Critérios: o que vira corte vertical (e o que não vira)

Corte vertical é só para o momento **explosivo** — o streamer reagindo forte. O que for informativo, calmo ou de contexto vai para o **vídeo longo** (partida/missão completa), não para o corte.

### O que procurar (em ordem de força)

1. **RAGE**: estresse no jogo que explode — xinga, grita, culpa o time, bate na mesa, "esse jogo me transforma".
2. **RISADA**: ele rindo de verdade (não sorriso), do jogo, de um bug, do chat, de si mesmo.
3. **ESPANTO / SUSTO**: "que isso?!", "meu Deus", grito de susto, jumpscare, silêncio tenso depois de algo inesperado.
4. **ELOGIA O JOGO** com empolgação ("olha isso, que lindo, que jogo!") ou **XINGA O JOGO** (bug, injusto, "jogo lixo").
5. **DESCOBERTA**: achou algo secreto, easter egg, mecânica que não sabia, lugar novo — e ficou surpreso.
6. **AÇÃO + REAÇÃO**: evento forte na tela (quase morte, clutch, kill impossível, explosão, atividade diferente do resto da live) **com** ele reagindo junto.

O chat **confirma** (rajada, kkkk, KEKW, OMEGALUL, "?"), mas sozinho não basta: spam de emote por alerta/sub sem reação dele **não** é momento.

### Medir antes de decidir

`node S/sinais.mjs L TRABALHO` dá, por janela de 5 s, uma **energia de 0 a 10** e um rótulo (RAGE, RISADA, ESPANTO, ELOGIA O JOGO, XINGA O JOGO, DESCOBERTA, AÇÃO + REAÇÃO, morno). Ela soma: **voz** dele acima do normal dele (áudio com filtro de voz, o som do jogo pesa pouco), **termos** na fala (palavrão, espanto, elogio, risada, "não!"), **tela** (quanto a imagem muda) e **chat**. Ponto de partida: janelas com **energia ≥ 5 e um rótulo de emoção**. Confirme ouvindo a transcrição e olhando os quadros.

### Nota do momento (0 a 10)

| Critério | Pontos |
|---|---|
| **Explosão do streamer**: voz bem acima do normal dele, grito, risada, xingamento, espanto audível | 0–4 |
| **Emoção clara**: dá para dizer numa palavra o que ele sente (raiva, riso, espanto, admiração) | 0–2 |
| **Gatilho na tela**: o motivo aparece no jogo (morte, kill, bug, descoberta, cena bonita, atividade diferente) | 0–2 |
| **Chat confirma**: rajada ou expressão repetida logo depois | 0–1 |
| **Fecha sozinho**: tem payoff (conclui, ri, pede desculpa, frase de efeito) | 0–1 |
| Penalidades: precisa de contexto para entender (−2), reação morna ou só narração (−3), fala administrativa (−3), repete assunto de um corte recente (−2) | |

**Prioridade para nota 7 ou mais**, mas **não descarte os mais fracos** (pedido do usuário em 17/11/2026: "às vezes dá pra aproveitar"):

| Nota | O que fazer |
|---|---|
| **7 a 10** | Corte vertical **prioritário**: gere primeiro, em `L/cortes/`. |
| **5 a 6** | Corte vertical **de reserva**: gere também (depois dos prioritários), em `L/cortes/reserva/`, com `"reserva": true` nos metadados. O usuário avalia e pode pedir melhorias. |
| **0 a 4** | Não gera: silêncio, fala administrativa ("já volto", "deixa eu beber água"), spam de emote sem reação dele. |

Os critérios acima continuam valendo para dar a nota e para escolher **o melhor recorte** de cada momento; a diferença é que nota 5–6 não é mais motivo para jogar fora.

### Exemplos desta live (alanzoka, Deadlock)

| Momento | Nota | Por quê |
|---|---|---|
| Quase mata, grita "Não!", culpa o amigo ("vai jogar Stardew Valley"), "esse jogo me transforma" | **8** ✅ | voz +23 dB, RAGE + RISADA no chat, gatilho na tela, payoff |
| Xinga a lane, "por isso que eu não jogo MOBA" | **7** ✅ | rage forte + frase de efeito; chat com D:/kkkk |
| "quase morri, o cara vai atrás de mim" | 5 (reserva) | tensão sem explosão nem payoff |
| Chat spamando emote de alerta, ele só diz "ah, legal" | 2 ❌ | chat sem reação dele |
| "Calma, chat… primeira do mês, tô aquecendo" (virou o a02) | 5 (reserva) | **fraco, mas não descartável** (usuário): parado, sem gatilho na tela e precisa de contexto; entra como reserva para ele avaliar. A abertura clímax primeiro dele foi aprovada |

### Montagem do corte

Comece no gatilho ou logo antes (ação direta) ou no pico (clímax primeiro). Use `trechos` para emendar só as partes fortes e `inteiro: true` na gameplay de ação que dá contexto ao grito. Sem destaques de texto, sem zoom artificial, legenda só na fala, B-roll só para referência de fora do contexto (ver `skills/maquina-cortes-gta/references/vertical.md`).

## Abertura (primeiros 2 segundos)

Nunca começar com capa, legenda parada, tela preta ou algo estático. Escolha **por corte**:

- **Ação direta** (`"abertura": {"tipo": "acao", "porque": "..."}`): o corte já começa com algo acontecendo (reação, evento, emoção em andamento). Use quando o começo do próprio trecho já é forte.
- **Clímax primeiro** (`"abertura": {"tipo": "climax", "inicio": S, "fim": S, "porque": "..."}`, 1 a 2 s, tempos locais do bloco): mostra o ponto mais impactante (o grito, o resultado, a punchline) e depois um flash + whoosh volta para o início da sequência. Use quando esse trecho, **sozinho e fora de contexto**, já prende (som ou imagem forte) e o começo do corte é mais lento.

**Use às vezes, não em todo corte** (aprovado pelo usuário em 17/11/2026): só quando o pico, isolado, já prende de verdade e o corte depois mostra como se chegou nele. O corte em si precisa ser bom (nota 7+); a abertura não salva um momento fraco.

Regra prática: se o pico mais alto de `sinais.mjs` (ou a punchline) fica depois dos primeiros 3 s do corte e é forte isoladamente → clímax primeiro; se o corte já abre no pico → ação direta. O `porque` vai para o JSON de metadados (`abertura`).

## Relatório (a cada corte pronto)

Uma linha por corte, curta:

> ✅ `NOME.mp4` · live em **h:mm:ss** · nota **N** · abertura **clímax primeiro / ação direta** · pronto **X min Y s** depois do momento

O atraso vem de `live.atrasoSegundos` no JSON do corte (momento na live → corte pronto). Expectativa: ~5 a 8 min (bloco de 2,5 min + transcrição + render).

## Regras

- **Sem publicação** nesta fase.
- **Sem senhas**: as credenciais da Twitch ficam no servidor MCP; o chat anônimo não usa credencial.
- Erro no streamlink, live caída, MCP sem resposta ou chat com erro: **pare e avise**, sem reiniciar sozinho.
- Siga as preferências de corte da Fase 1 (tela dividida como base, inserts ligados à fala, sem cartões gráficos, conferir cada insert).
