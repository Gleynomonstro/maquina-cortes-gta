---
name: efeitos-sonoros
description: Monta e mantém a biblioteca de efeitos sonoros dos cortes (impacto, whoosh, pop) com licença registrada, e a música de fundo opcional. Use quando faltarem efeitos, quando o usuário quiser trocar os sons ou adicionar música.
---

# Efeitos sonoros

O `vertical.mjs` usa três sons, se existirem na pasta `sfx` da configuração do canal (padrão `~/.maquina-cortes-gta/sfx`):

| Arquivo | Onde toca | Volume |
|---|---|---|
| `impacto.mp3/.wav` | no começo, junto do gancho | baixo (0,35) |
| `whoosh.mp3/.wav` | entrada de cada insert | 0,3 |
| `pop.mp3/.wav` | cada destaque de texto | 0,3 |

Cada som precisa de uma entrada em `licencas.json` na mesma pasta (no modo estrito, som sem licença não é usado):

```json
{
  "impacto": {"fonte": "elevenlabs", "autor": "gerado pela conta do usuário", "licenca": "termos ElevenLabs (plano pago = uso comercial)", "url": null, "data": "2026-11-15"},
  "whoosh": {"fonte": "freesound", "autor": "NOME", "licenca": "CC0", "url": "https://freesound.org/s/ID/", "data": "2026-11-15"}
}
```

## De onde tirar

1. **ElevenLabs** (créditos da conta do usuário, `ELEVENLABS_API_KEY`): `node skills/maquina-cortes-gta/scripts/gerar-paleta-sfx.mjs`. Pergunte antes (gasta créditos). Confira o plano: no gratuito o uso comercial pode não estar liberado.
2. **Freesound** (API, `FREESOUND_API_KEY`): só **CC0** ou **CC BY** (com crédito na descrição). Nunca CC BY-NC.
3. **Biblioteca própria** do usuário, com a origem anotada.

Nunca peça a chave no chat: o usuário define a variável de ambiente.

## Música de fundo (opcional)

`"musica": "CAMINHO.mp3"` na configuração. Fica baixa (~22%) e abaixa sozinha quando há fala (ducking). Só música com licença clara para o uso (biblioteca própria, CC0/CC BY ou plano pago de banco de música); registre a origem. Sem música é o padrão.

## Regras de uso

Menos é mais: whoosh só em virada (insert), pop só em destaque, um impacto no começo. Os efeitos ficam bem abaixo da voz; o loudnorm final deixa o corte em −14 LUFS.
