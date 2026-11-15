# Terceiros

## skills/sound-effects

Cópia, sem alterações, da skill **sound-effects** de Gleb Kalinin ([glebis/humane-agentic-design](https://github.com/glebis/humane-agentic-design), pasta `humane/skills/sound-effects`, também listada no [Skills Directory](https://www.skillsdirectory.com/skills/glebis-sound-effects)), licença **MIT**. O texto da licença está em [`skills/sound-effects/LICENSE`](skills/sound-effects/LICENSE).

Este projeto usa só o gerador dela (`scripts/generate_sound.py` com o adaptador da ElevenLabs) para criar os efeitos dos cortes. O restante da skill original trata de efeitos sonoros de interface e não é usado aqui.

Para instalar a original sozinha: `npx -y skills add glebis/humane-agentic-design --skill sound-effects --agent claude-code`.

## Referências da fase 1 (corte vertical)

Usados **só como referência de abordagem**; nenhum arquivo foi copiado.

- **claude-shorts**, de AgriciDaniel ([github.com/AgriciDaniel/claude-shorts](https://github.com/AgriciDaniel/claude-shorts)), licença **MIT** ([LICENSE](https://github.com/AgriciDaniel/claude-shorts/blob/main/LICENSE)). Ideias: Claude como orquestrador, legenda palavra por palavra renderizada no Remotion, texto de gancho e reenquadramento 16:9 → 9:16 (lá com MediaPipe; aqui por coordenadas da configuração do canal).
- **clipify**, de Louise de Sadeleer ([github.com/louisedesadeleer/clipify](https://github.com/louisedesadeleer/clipify)), licença **MIT** ([LICENSE](https://github.com/louisedesadeleer/clipify/blob/main/LICENSE)). Ideia: saber quem fala pela energia de movimento na região da boca de cada câmera (FFmpeg, sem modelo de IA), usada em `speakerTimeline` do `vertical.mjs`.
- Atenção: existe um projeto homônimo, [GetRepliq/Clipify](https://github.com/GetRepliq/Clipify), sob **GPL-3.0**. Ele **não** é usado aqui (copiar código dele obrigaria este repositório, MIT, a mudar de licença).
