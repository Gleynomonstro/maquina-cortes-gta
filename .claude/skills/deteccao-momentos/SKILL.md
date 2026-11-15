---
name: deteccao-momentos
description: Escolhe os melhores momentos de um VOD ou live transcrito para virarem cortes verticais de 30 a 45 s, e escreve o gancho de cada um. Use quando for decidir O QUE cortar (antes de montar o cortes.json do corte vertical).
---

# Detecção de momentos

Entrada: a transcrição (`node ~/.maquina-cortes-gta/engine/scripts/transcript-text.mjs work`) e, se for útil, um mosaico de quadros (`live-quadros.mjs work/source.mp4 work/quadros.jpg --cada 30`). Saída: para cada corte, `start`, `end`, `gancho` e `metadados.justificativa` no `cortes.json` (formato em `skills/maquina-cortes-gta/references/vertical.md`).

## O que procurar (em ordem de força)

1. **Reação forte a algo na tela**: choque, gargalhada, indignação ("QUE ISSO?", "INJOGÁVEL"). O que ele vê precisa caber num insert `origem`.
2. **Opinião polêmica ou comparação**: "o 5 que se foda", "nível FF17", "os gráficos chegaram no limite?". Gera comentário.
3. **Fato concreto**: número, data, nome, preço, tamanho ("19 de novembro", "212 GB").
4. **História curta com virada**: começo, problema, desfecho em menos de 45 s.
5. **Interação com o chat** que se entende sem contexto.

Descarte: trechos que dependem do que veio antes, leitura de tela sem reação, silêncio longo, conversa sobre outro assunto sem gancho, e trechos onde o whisper repetiu frases (sinal de transcrição ruim: confira no áudio antes de usar).

## Regras do corte

- **30 a 45 s** de fala depois de tirar as pausas (máximo 60). Lembre que o script remove pausas > 0,2 s: 50 s de origem costumam virar 30 a 40 s.
- **Começa no gancho**: a primeira frase já é a mais forte ou a que abre a curiosidade. Nada de "então, galera".
- **Termina no payoff**: a resposta, a piada, a conclusão. Nunca no meio da ideia.
- Um assunto por corte; cortes diferentes não repetem o mesmo gancho.
- **Nota de 0 a 10** na justificativa (gancho, especificidade, conflito, payoff, entende sozinho); abaixo de 6, não faça.
- Confira as bordas: o whisper às vezes adianta palavras para dentro de um silêncio; o script corrige, mas a frase pode "andar" para depois do `end`. Se o relatório disser que um insert não cobre fala, estenda o `end`.

## Gancho (texto na tela nos primeiros 1,5 s)

Não é transcrição: é a **promessa** do corte, em até ~6 palavras, caixa alta, no tom da skill `resenha-ptbr`. Ex.: a fala é "vocês as mulheres não perceberam que tá dando merda?" → gancho "TIROTEIO E ELAS NEM LIGAM".

## Justificativa (vai para o JSON)

Uma frase com o porquê, mais a nota: "Reação forte + comparação com o Rio; NPCs ignorando tiroteio é visual e entende sozinho. Nota 9."
