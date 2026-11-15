---
name: legenda-bilingue
description: Separa as falas do jogo/trailer (em inglês) da fala do streamer e as transforma em legenda secundária traduzida para pt-BR, com rótulo JOGO ou TRAILER. Use ao montar um corte vertical que tenha falas em inglês do jogo ou do trailer.
---

# Legenda bilíngue

O corte tem duas legendas:

- **Principal**: a fala do streamer, palavra por palavra, faixa do meio (y ≈ 1300), palavra falada em amarelo. Sai sozinha da transcrição.
- **Secundária**: falas do jogo ou do trailer, **traduzidas para pt-BR**, numa faixa menor abaixo (y ≈ 1450), itálico, cinza-azulado, com o rótulo `JOGO` ou `TRAILER`. Você escreve essas.

Ambas ficam fora dos 20% de cima e de baixo da tela (interface das redes).

## Passo a passo

1. Liste as falas que parecem ser do jogo no trecho do corte:

   ```bash
   node ~/.maquina-cortes-gta/engine/scripts/falas-jogo.mjs work INICIO FIM
   ```

   Sem trilha separada, a separação é por idioma (heurística). **Confira cada linha**: o whisper às vezes repete uma frase várias vezes (alucinação) ou já traduz o inglês para o português de forma estranha ("Dê-me um hug"). Na dúvida, ouça: `ffmpeg -ss INICIO -t 4 -i work/source.mp4 trecho.wav`.
2. Com `trilhaJogo` na configuração do canal, transcreva só a trilha do jogo em inglês e use essa pasta no passo 1 (aí tudo é do jogo):

   ```bash
   node ~/.maquina-cortes-gta/engine/scripts/transcribe.mjs CAMINHO_DA_TRILHA work/jogo en
   node ~/.maquina-cortes-gta/engine/scripts/falas-jogo.mjs work/jogo INICIO FIM
   ```
3. Traduza para pt-BR **natural e curto** (legenda, não tradução literal): "Raymond, the fuck is that?" → "Raymond, que porra é essa?". Mantenha palavrão quando o original tem. Nomes próprios ficam como estão.
4. Grave em `secundarias` no `cortes.json`: `{"inicio": 294.4, "fim": 296.8, "texto": "...", "rotulo": "TRAILER"}` (`JOGO` para gameplay, `TRAILER` para trailer). Esses trechos saem da legenda principal automaticamente e **não** são tratados como pausa.

## Sincronia

O `vertical.mjs` usa os tempos por palavra do whisper.cpp, corrige palavras "esticadas" sobre silêncio, alinha o início das palavras depois de pausa ao início do som e remapeia tudo depois dos cortes. O relatório traz o erro medido antes da correção (média e máximo) e o erro de arredondamento para quadros (máx. ~17 ms). Tolerância: 100 ms.
