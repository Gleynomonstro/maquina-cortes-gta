# Corte vertical (fase 1)

Um corte de **até 60 s (ideal 30 a 45)**, 1080×1920, 30 fps, H.264, AAC 48 kHz a −14 LUFS, em **tela dividida** (o streamer em cima, centralizado na metade, e o que ele está vendo embaixo, sincronizado) quando a configuração tem a área `jogo`, ou com o streamer centralizado em tela cheia quando não tem. Gancho nos primeiros 1,5 s, mudança visual a cada 2 a 3 s e **inserts em tela cheia mostrando o que ele cita**. Junto saem um JSON de metadados (com o registro de fontes) e um relatório de checagem.

`E` = `~/.maquina-cortes-gta/engine/scripts`. Skills do projeto em `.claude/skills/` (detecção de momentos, legenda bilíngue, resenha-ptbr, B-roll, efeitos sonoros, metadados).

## Fluxo

1. **Configuração do canal**: `config/canais/<canal>.json` (ver `config/canais/LEIAME.md`). Sem `cameras`, pare e peça o retângulo da câmera: o rastreamento de rosto precisa do Python + MediaPipe.
2. **Baixar e transcrever** (passos 3 e 4 do `SKILL.md`): `source.mp4`, `captions.json`, `silences.json`, `meta.json`, `audio16k.wav` na pasta `work/`.
3. **Escolher o momento** (skill `deteccao-momentos`): trecho de 30 a 45 s com gancho forte.
4. **Falas do jogo/trailer** (skill `legenda-bilingue`): `node E/falas-jogo.mjs work INICIO FIM` lista as falas em inglês; traduza e grave em `secundarias`.
5. **Inserts** (skill `broll-licenciado`): 1 a 3 por corte, cada um ligado a um trecho da fala.
6. **Textos** (skills `resenha-ptbr` e `metadados`): gancho, destaques, título, descrição, hashtags, justificativa.
7. Grave `work/cortes.json` e rode:

```bash
node E/vertical.mjs work config/canais/<canal>.json <pasta_de_saida> [--clip ID]
```

8. Leia `<saida>/<id>-checagem.md`. **Código de saída 2 = reprovado**: corrija o que estiver em "Falhas" no `cortes.json` e rode de novo. Ritmo, legenda faltando e áudio o script corrige sozinho.

## `cortes.json`

Tempos em **segundos do vídeo de origem** (os mesmos do `transcript-text.mjs`).

```json
{
  "origem": {"url": "https://www.youtube.com/watch?v=..."},
  "clips": [
    {
      "id": "v01-injogavel",
      "start": 1424.4,
      "end": 1464.8,
      "gancho": "TIROTEIO E ELAS NEM LIGAM",
      "secundarias": [{"inicio": 294.4, "fim": 296.8, "texto": "Raymond, que porra é essa?", "rotulo": "TRAILER"}],
      "inserts": [
        {"tipo": "broll", "inicio": 1440.0, "fim": 1442.4, "busca": "assault rifle firing slow motion"},
        {"tipo": "broll", "inicio": 1451.6, "fim": 1454.4, "busca": "Rio de Janeiro skyline", "modo": "cheio"}
      ],
      "destaques": [{"inicio": 1437.6, "texto": "JOGO MAL FEITO?"}],
      "metadados": {
        "titulo": "até 60 caracteres",
        "descricao": "uma ou duas frases",
        "hashtags": ["#gta6", "... 5 a 8"],
        "justificativa": "por que esse momento prende"
      }
    }
  ]
}
```

| Campo | Regra |
|---|---|
| `gancho` | Frase curta (até ~6 palavras), caixa alta, aparece nos primeiros 1,5 s com zoom. |
| `inserts[].tipo` | `zoom` (aproxima numa região do que está na tela, `rect` em pixels da origem), `replay` (repete sem som um momento anterior: `de` = segundo da origem onde começa, `rect` opcional), `broll` (busca online, ver skill), `arquivo` (+ `licenca`), ou `origem`. `cartao` existe, mas **não use**. |
| `inserts[].modo` | `baixo` (só a metade de baixo; padrão de `zoom`/`replay`, o streamer continua em cima), `cheio` (tela toda; padrão de `broll`, 2 a 3 s) ou `pip`. |
| `inserts[]` | Sempre sobre um trecho com fala relacionada. Insert sem fala embaixo é ignorado. |
| `destaques` | Texto de impacto que pula na tela por 1,2 s (conta como mudança visual). |
| `solos` | Trechos (`inicio`/`fim`) com o streamer **sozinho** em tela cheia. Use pouco: o padrão (e o preferido) é a tela dividida o tempo todo, mesmo com o vídeo de baixo pausado. `"layout": "solo"` usa só o streamer. |

**Layout (preferência do usuário, 15/11/2026):** tela dividida como base, o tempo todo; ficar muito tempo só com o streamer "fica vazio". A dinâmica vem dos **inserts por cima das duas metades** e dos cortes com zoom. Na tela dividida a legenda fica na divisa (y = 960) e a secundária logo abaixo.

**Quando pôr insert (feedback de 15/11/2026):** só para **preencher vazio**: imagem de baixo parada (`node E/trechos-parados.mjs work config/canais/<canal>.json INICIO FIM` mostra onde) ou o streamer falando de algo que não está na tela. Se está acontecendo alguma coisa embaixo, deixe a tela dividida rolar. Prefira o **próprio vídeo** a clipe genérico: o streamer fala da mulher atirando → `zoom` na mulher, ou `replay` do momento em que ela atirou. Clipe de fora só quando ele cita algo que não é do jogo e que combina de verdade (FIFA, Rio); nada de associação literal fraca ("videogame" → controle de Xbox).

**Transições:** todo insert entra e sai com o mesmo fade curto (0,2 s). Dois inserts colados viram fusão (o de baixo fica até o de cima terminar de aparecer).

**Layout por vídeo:** a câmera e a área do jogo mudam de VOD para VOD; ponha `"layoutOrigem": {"cameras": [...], "jogo": {...}}` no `cortes.json` para sobrescrever a configuração do canal.

**Rodada de 17/11/2026 (live do alanzoka):** legenda **só enquanto o streamer fala** (some ~0,25 s depois da última palavra); **sem `destaques`** (texto por cima da legenda ficou desconexo); **sem zoom in/zoom out** a cada plano (zoom constante). O ritmo vem do conteúdo: `"trechos": [{"inicio", "fim"}, ...]` emenda só as partes boas com corte seco, e `"inteiro": true` num trecho mantém a gameplay sem fala (ex.: a luta antes da reação). `"correcoes": {"arregaceu": "arregacei"}` corrige palavras que o whisper errou. B-roll **só para referência de fora do contexto** (outro jogo citado como zoeira, cidade, país, pessoa); se o streamer fala do gênero do próprio jogo (MOBA jogando MOBA), sem insert.

**Sem cartões gráficos:** não use `tipo: "cartao"` (texto animado sobre fundo colorido); o usuário achou "nada a ver". Se não houver clipe ou imagem do assunto, o insert é descartado.

**Referência fora do GTA = insert:** quando o streamer cita algo que não é do GTA (outro jogo, cidade, país, marca, pessoa, filme), cubra a fala com um `broll` desse assunto (ex.: "É tipo FIFA?" → gameplay de FIFA; "o Rio não é assim" → Rio de Janeiro; "coisa de americano" → bandeira dos EUA).
| `secundarias` | Falas do jogo/trailer **traduzidas**; os trechos saem da legenda principal. |

## O que o `vertical.mjs` garante

- Pausas acima de 0,2 s entre falas são removidas, cortando sempre entre palavras.
- Planos de até ~2,5 s, cada troca com zoom (zoom alterna); se a checagem achar mais de 3 s sem mudança, encurta os planos e refaz.
- Rosto no centro horizontal e em y ≈ 820 (terço central). Câmera pequena (ampliação > 3x) usa o modo **desfocado**: câmera na largura toda sobre uma cópia desfocada dela.
- Legenda principal em y ≈ 1300 e secundária em y ≈ 1450, dentro da faixa 384–1536 (fora dos 20% de cima e de baixo).
- Palavras que o whisper marcou dentro de silêncio vão para onde a fala está; palavras depois de pausa são alinhadas ao início do som.
- Inserts não se sobrepõem; SFX só com licença registrada (ou modo relaxado).
- Áudio: música opcional com ducking + loudnorm em 2 passadas.
