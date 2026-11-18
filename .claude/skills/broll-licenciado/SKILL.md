---
name: broll-licenciado
description: Escolhe e busca B-roll (vídeo ou imagem) para cobrir trechos em que o streamer fala de algo mostrável, com licença registrada, e define os inserts do corte vertical. Use ao montar os inserts de um corte.
---

# B-roll licenciado

Quando o streamer fala de algo que pede imagem (lugar, personagem, trailer, mecânica, número), cubra com um **insert** de 2 a 3 s (tela cheia) ou 2 a 4 s (picture-in-picture no alto). **Todo insert fica em cima de uma fala relacionada**; um insert sem fala embaixo é descartado pelo script.

**Primeiro, o próprio vídeo.** Insert é para preencher vazio (imagem de baixo parada: `trechos-parados.mjs`) ou mostrar algo que não está na tela. Se ele comenta algo do jogo, use `zoom` (aproxima na região onde aquilo aparece) ou `replay` (repete sem som o momento anterior em que aconteceu), não um clipe genérico. Ex.: "a mulher dando tiro" → `zoom` na mulher com a arma ou `replay` do tiro. Evite associação literal fraca: "videogame" → controle de Xbox, "tiroteio" → um cara qualquer com arma. Isso ficou "nada a ver".

**Depois, referências de fora do contexto** (o que NÃO está na tela nem é o próprio jogo: se ele fala de MOBA jogando um MOBA, nada de outro jogo; se manda o amigo "ir jogar Stardew Valley", aí sim). Toda vez que o streamer citar algo que não é do jogo (outro jogo, cidade, país, marca, pessoa, filme, comida), coloque um insert desse assunto em cima da fala: é o que dá dinâmica. Ex.: "É tipo FIFA?" → gameplay de FIFA; "o Rio de Janeiro é assim?" → Rio; "isso é coisa de americano" → bandeira dos EUA. O que ele está vendo do próprio GTA já aparece embaixo, na tela dividida (o padrão), então não precisa de insert. **Quanto mais inserts ligados à fala, melhor**: o usuário quer o corte cheio, não vazio (um a cada 5 a 8 s é um bom ritmo).

## Tipos de insert (`cortes.json` → `inserts`)

| Tipo | Quando | Fonte |
|---|---|---|
| `zoom` + `rect` | aproximar no que está na tela agora (metade de baixo) | o VOD de origem |
| `replay` + `de` (+ `rect`) | repetir sem som um momento anterior (metade de baixo) | o VOD de origem |
| `origem` | trecho do VOD em tela cheia | o VOD de origem; vale a autorização do VOD |
| `broll` + `busca` | assunto genérico ou específico que precisa de imagem | busca automática (abaixo) |
| `arquivo` + `licenca` | um arquivo que você já tem, com licença | o seu arquivo |

## Ordem das fontes na busca (`broll.mjs`)

**Modo estrito** (padrão, `"licencas": "estrito"` ou ausente):

1. Mídia própria do canal (`midiaPropria` na configuração, com `licenca.json`): arquivo cujo nome contém as palavras da busca.
2. **Pexels** (API, `PEXELS_API_KEY`): vídeo vertical, Pexels License.
3. **Pixabay** (API, `PIXABAY_API_KEY`): vídeo, Pixabay Content License.
4. **Wikimedia Commons** (API, sem chave): só domínio público, CC0 e CC BY (sem SA). O autor aparece na tela.
5. Nada serviu → o insert é **descartado** (sem cartão gráfico: o usuário não gostou deles).

Imprensa da Rockstar: só arquivos de páginas listadas em `rockstarAprovadas`, usados como `arquivo` + `licenca` com o link dos termos.

**Modo relaxado** (`"licencas": "relaxado"`, decisão do usuário): procura primeiro um trecho de 4 s no **YouTube** (`ytsearch`), depois Pexels/Pixabay e qualquer licença do Wikimedia; aceita arquivos sem licença. Tudo é registrado com `licencaVerificada: false` para revisar depois.

## Conferir antes de entregar (obrigatório)

A busca automática erra: pegou tela preta, tutorial do Windows e meme no lugar do assunto. Depois do render, extraia **um quadro do meio de cada insert** e olhe. Se não mostrar claramente o que o streamer disse:

1. Baixe o vídeo candidato em 360p (`yt-dlp -f "bv*[height<=360]" -o cand.mp4 URL`), tire quadros em vários segundos e escolha o melhor.
2. **Fixe** no insert: `"youtube": "https://www.youtube.com/watch?v=ID", "trecho": SEGUNDO` (o insert usa 4 s a partir de `trecho`).
3. Se não achar nada que combine, **tire o insert** (não ponha qualquer coisa).

Sem `trecho`, o script usa o pico do "mais reproduzido" do YouTube (quando existe) ou 30% do vídeo, e descarta trechos escuros. O resultado de cada insert fica em `work/broll/cache.json`: renderizar de novo **não** muda um insert que já estava bom (só muda se a busca, o vídeo ou o trecho mudarem).

## Como escrever a busca

- Em inglês, 2 a 4 palavras, o que **aparece** na imagem: "Miami beach aerial", "police car chase night", "Rio de Janeiro skyline".
- Específico do GTA (personagem, missão, mapa): no modo estrito não existe em banco livre; use `origem` (se o VOD mostra) ou deixe sem insert. No modo relaxado, "GTA 6 trailer Lucia" funciona.
- Nunca use imagem com marca d'água de outro canal.

## Registro

O JSON de cada corte (`fontes`) traz, para cada insert: fonte, URL, autor, licença, link da licença, se foi verificada, trecho de origem, trecho no corte e a fala que ele cobre.
