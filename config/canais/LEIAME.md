# Configuração por canal

Um arquivo por canal de origem: `config/canais/<nome>.json`. Ele diz **de onde vem o vídeo** (câmeras, idioma, trilha do jogo, autorização) e **como fica a sua marca** nos cortes.

| Campo | Obrigatório | O que é |
|---|---|---|
| `nome` | sim | Nome do canal de origem (vai para o registro de fontes). |
| `idioma` | sim | Idioma principal da fala (`pt`). |
| `licencas` | não | `"estrito"` (padrão): só material com licença verificada (Pexels, Pixabay, Wikimedia CC0/CC BY/domínio público, mídia própria com `licenca.json`). `"relaxado"`: aceita também trechos do YouTube, qualquer licença do Wikimedia e arquivos/SFX sem licença. **Tudo continua registrado** no JSON de cada corte com `licencaVerificada: false`, para revisar antes de publicar. Risco de strike/remoção fica com quem publica. |
| `trilhaJogo` | não | Caminho de um arquivo só com o áudio do jogo, se o streamer gravar separado. Com ele, a legenda secundária (falas do jogo) fica exata. `null` se não houver. |
| `autorizacao.registrada` | sim | `true` só quando houver permissão do canal registrada em `detalhes`. Com `false`, o metadado de cada corte sai marcado como **autorização pendente**. |
| `cameras` | sim* | Uma entrada por pessoa que fala. `rect` = retângulo da câmera em **pixels do vídeo de origem**; `rosto` = centro do rosto dentro do retângulo (0 a 1); `boca` = região da boca dentro do retângulo (0 a 1), usada para saber quem fala quando há duas ou mais câmeras. *Sem câmeras configuradas, seria preciso rastrear o rosto (precisa do Python + MediaPipe, ainda não instalado). |
| `marca.perfil` | sim | Nome na marca d'água (ex.: `@capivaracity.vi`). |
| `marca.logo` | sim | Caminho da logo (aceita `~`). |
| `marca.posicao` | sim | `superior-direito`, `superior-esquerdo`, `inferior-direito` ou `inferior-esquerdo`. |
| `cores` | não | `palavraAtiva` (palavra falada), `secundaria` (legenda do jogo), `gancho`, `cartao` (duas cores do fundo dos cartões). |
| `midiaPropria` | não | Pasta com mídia do próprio canal **com licença confirmada**. Precisa de um `licenca.json` dentro: `{"titular": "...", "permissao": "...", "data": "aaaa-mm-dd"}`. |
| `sfx` | não | Pasta com `impacto`, `whoosh` e `pop` (mp3 ou wav) e um `licencas.json` com a origem de cada um. |
| `musica` | não | Arquivo de música de fundo **licenciada** (fica baixa e abaixa sob a fala). |
| `rockstarAprovadas` | não | Lista de URLs de páginas de imprensa da Rockstar que **você aprovou**, cada uma com o link dos termos. Sem aprovação, nada da Rockstar é usado. |

## Como achar o retângulo da câmera

Extraia um quadro (`ffmpeg -ss 60 -i source.mp4 -frames:v 1 quadro.png`), abra num editor de imagem e anote o canto superior esquerdo (`x`, `y`) e o tamanho (`w`, `h`) da câmera, sem a moldura. Se o streamer ocupa a tela toda (podcast), use o quadro inteiro: `{"x": 0, "y": 0, "w": 1920, "h": 1080}`.

## Chaves de API (variáveis de ambiente, nunca neste arquivo)

- `PEXELS_API_KEY`, `PIXABAY_API_KEY`: B-roll licenciado (Wikimedia Commons não precisa de chave).
- `ELEVENLABS_API_KEY` ou `FREESOUND_API_KEY`: efeitos sonoros.
