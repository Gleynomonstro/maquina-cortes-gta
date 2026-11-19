# Finalização do vídeo

Tela final dos vídeos LONGOS (1920×1080): "Obrigado por assistir!", botão "Inscreva-se no canal" e "Siga o canal",
num fundo estilo GTA 6 / Vice City (pôr do sol roxo e laranja, sol listrado, prédios com neon, palmeiras e mar, desfocado), com a logo, o @ do perfil, botões neon e 12 s de duração. Desenhada em HTML e fotografada pelo Chrome/Edge instalado (para ver a prévia: `TELA_FINAL_PREVIA=previa.png node tela-final.mjs video.mp4`).

- `tela-final.json`: modelo de configuração (textos, duração, cores). O `setup.mjs` copia para `~/.maquina-cortes-gta/tela-final.json`; edite lá.
- O `montar-longo.mjs` já acrescenta a tela no fim de todo vídeo longo (desligue com `"ativo": false` na config, ou `--sem-tela-final`).
- Gerador: `skills/maquina-cortes-gta/template/scripts/tela-final.mjs`. Para usar num vídeo pronto:
  `node E/tela-final.mjs caminho/video.mp4` (gera `video-final.mp4` ao lado).
