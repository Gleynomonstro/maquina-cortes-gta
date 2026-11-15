---
name: metadados
description: Escreve título, descrição, hashtags e justificativa de cada corte vertical e confere o JSON de metadados (origem, registro de fontes, checagem) antes da entrega. Use ao fechar um corte para publicação.
---

# Metadados

Você escreve no `cortes.json` (campo `metadados` de cada corte); o `vertical.mjs` junta com a origem, as fontes e a checagem em `<saida>/<id>.json`.

## O que escrever

| Campo | Regra |
|---|---|
| `titulo` | **Até 60 caracteres.** Fala citada, conflito ou número. Nome do streamer se ajudar ("Casimiro: ..."). Tom da skill `resenha-ptbr`. |
| `descricao` | 1 ou 2 frases curtas que completam o título sem repetir. Se houver fonte com licença CC BY, acrescente o crédito ("Imagem: AUTOR, CC BY 4.0"). |
| `hashtags` | **5 a 8**, minúsculas, do geral ao específico: `#gta6 #gtavi #gta` + streamer + assunto (`#casimiro #graficos`). Sem hashtags genéricas demais (`#fyp`, `#viral`) mais de uma vez. |
| `justificativa` | Por que esse momento prende + nota de 0 a 10 (ver `deteccao-momentos`). |

## O que o script acrescenta (confira antes de entregar)

- `origem`: URL do VOD, canal, **autorização** (se `registrada: false`, avise o usuário), início e fim no VOD (segundos e `hh:mm:ss`).
- `fontes`: todo material externo (inserts, SFX) com URL, autor, licença, link, `licencaVerificada` e o trecho usado.
- `checagem`: duração, pausas, trocas de plano, intervalo máximo sem mudança, % de B-roll, sincronia, áudio, legenda, centralização, `aprovado`, `falhas` e `avisos`.
- `formato`: 1080×1920, 30 fps, H.264, AAC 48 kHz, −14 LUFS.

## Entrega

Só entregue cortes com `checagem.aprovado: true`. Mostre ao usuário: arquivo, título, duração e, em uma linha, os avisos que importam (autorização pendente, fontes não verificadas, câmera ampliada). Publicação automática fica para a fase futura (OAuth das APIs oficiais); não peça nem guarde senhas.
