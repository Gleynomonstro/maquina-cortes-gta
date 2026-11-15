# Corte vertical (fase 1)

Um corte de **até 60 s (ideal 30 a 45)**, 1080×1920, 30 fps, H.264, AAC 48 kHz a −14 LUFS, com o **streamer centralizado em tela cheia**, gancho nos primeiros 1,5 s e mudança visual a cada 2 a 3 s. Junto saem um JSON de metadados (com o registro de fontes) e um relatório de checagem.

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
        {"tipo": "origem", "inicio": 1440.0, "fim": 1442.6},
        {"tipo": "cartao", "inicio": 1450.6, "fim": 1451.5, "texto": "INJOGÁVEL", "subtexto": "segundo o Casimiro"},
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
| `inserts[].tipo` | `origem` (o gameplay/trailer do próprio VOD, coberto pela autorização do VOD), `broll` (busca online, ver skill), `cartao` (texto grande animado), ou `arquivo` + `licenca` para um arquivo seu. |
| `inserts[].modo` | `cheio` (tela toda, 2 a 3 s) ou `pip` (pequeno no alto, 2 a 4 s, o streamer continua). |
| `inserts[]` | Sempre sobre um trecho com fala relacionada. Insert sem fala embaixo é ignorado. |
| `destaques` | Texto de impacto que pula na tela por 1,2 s (conta como mudança visual). |
| `secundarias` | Falas do jogo/trailer **traduzidas**; os trechos saem da legenda principal. |

## O que o `vertical.mjs` garante

- Pausas acima de 0,2 s entre falas são removidas, cortando sempre entre palavras.
- Planos de até ~2,5 s, cada troca com zoom (zoom alterna); se a checagem achar mais de 3 s sem mudança, encurta os planos e refaz.
- Rosto no centro horizontal e em y ≈ 820 (terço central). Câmera pequena (ampliação > 3x) usa o modo **desfocado**: câmera na largura toda sobre uma cópia desfocada dela.
- Legenda principal em y ≈ 1300 e secundária em y ≈ 1450, dentro da faixa 384–1536 (fora dos 20% de cima e de baixo).
- Palavras que o whisper marcou dentro de silêncio vão para onde a fala está; palavras depois de pausa são alinhadas ao início do som.
- Inserts não se sobrepõem; SFX só com licença registrada (ou modo relaxado).
- Áudio: música opcional com ducking + loudnorm em 2 passadas.
