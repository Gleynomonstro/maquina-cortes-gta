---
name: broll-licenciado
description: Escolhe e busca B-roll (vídeo ou imagem) para cobrir trechos em que o streamer fala de algo mostrável, com licença registrada, e define os inserts do corte vertical. Use ao montar os inserts de um corte.
---

# B-roll licenciado

Quando o streamer fala de algo que pede imagem (lugar, personagem, trailer, mecânica, número), cubra com um **insert** de 2 a 3 s (tela cheia) ou 2 a 4 s (picture-in-picture no alto). **Todo insert fica em cima de uma fala relacionada**; um insert sem fala embaixo é descartado pelo script.

## Tipos de insert (`cortes.json` → `inserts`)

| Tipo | Quando | Fonte |
|---|---|---|
| `origem` | o que ele está vendo/reagindo (gameplay, trailer no próprio VOD) | o VOD de origem; vale a autorização do VOD |
| `broll` + `busca` | assunto genérico ou específico que precisa de imagem | busca automática (abaixo) |
| `cartao` + `texto` (+ `subtexto`) | número, nome, frase de efeito; ou quando não há imagem boa | gerado no render, sem risco |
| `arquivo` + `licenca` | um arquivo que você já tem, com licença | o seu arquivo |

## Ordem das fontes na busca (`broll.mjs`)

**Modo estrito** (padrão, `"licencas": "estrito"` ou ausente):

1. Mídia própria do canal (`midiaPropria` na configuração, com `licenca.json`): arquivo cujo nome contém as palavras da busca.
2. **Pexels** (API, `PEXELS_API_KEY`): vídeo vertical, Pexels License.
3. **Pixabay** (API, `PIXABAY_API_KEY`): vídeo, Pixabay Content License.
4. **Wikimedia Commons** (API, sem chave): só domínio público, CC0 e CC BY (sem SA). O autor aparece na tela.
5. Nada serviu → vira **cartão** com o texto.

Imprensa da Rockstar: só arquivos de páginas listadas em `rockstarAprovadas`, usados como `arquivo` + `licenca` com o link dos termos.

**Modo relaxado** (`"licencas": "relaxado"`, decisão do usuário): procura primeiro um trecho de 4 s no **YouTube** (`ytsearch`), depois Pexels/Pixabay e qualquer licença do Wikimedia; aceita arquivos sem licença. Tudo é registrado com `licencaVerificada: false` para revisar depois.

## Como escrever a busca

- Em inglês, 2 a 4 palavras, o que **aparece** na imagem: "Miami beach aerial", "police car chase night", "Rio de Janeiro skyline".
- Específico do GTA (personagem, missão, mapa): no modo estrito não existe em banco livre; use `origem` (se o VOD mostra) ou `cartao`. No modo relaxado, "GTA 6 trailer Lucia" funciona.
- Nunca use imagem com marca d'água de outro canal.

## Registro

O JSON de cada corte (`fontes`) traz, para cada insert: fonte, URL, autor, licença, link da licença, se foi verificada, trecho de origem, trecho no corte e a fala que ele cobre.
