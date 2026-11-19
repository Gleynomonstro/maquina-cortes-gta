# Finalização do vídeo

Tela final dos vídeos LONGOS (1920×1080): "Obrigado por assistir!", botão "Inscreva-se no canal" e "Siga o canal",
com o último quadro do vídeo escurecido e desfocado ao fundo, logo do perfil e 12 s de duração.

- `tela-final.json`: modelo de configuração (textos, duração, cores). O `setup.mjs` copia para `~/.maquina-cortes-gta/tela-final.json`; edite lá.
- O `montar-longo.mjs` já acrescenta a tela no fim de todo vídeo longo (desligue com `"ativo": false` na config, ou `--sem-tela-final`).
- Gerador: `skills/maquina-cortes-gta/template/scripts/tela-final.mjs`. Para usar num vídeo pronto:
  `node E/tela-final.mjs caminho/video.mp4` (gera `video-final.mp4` ao lado).
