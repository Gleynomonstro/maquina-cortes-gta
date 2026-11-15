#!/usr/bin/env node
// Lista as falas que provavelmente são do JOGO ou do TRAILER (em inglês), para virarem legenda secundária traduzida.
//
//   node falas-jogo.mjs <pasta_de_trabalho> [inicio_s] [fim_s]
//
// Sem trilha separada do jogo, a separação é por idioma: o whisper transcreve a mistura e as frases com cara de
// inglês (palavras comuns do inglês, sem palavras comuns do português) são marcadas. É uma heurística: o Claude
// confere cada linha, traduz para pt-BR e grava em "secundarias" do cortes.json.
// Com `trilhaJogo` na configuração, transcreva a trilha em inglês (transcribe.mjs <trilha> <pasta>/jogo en) e use
// essa pasta aqui: aí tudo que aparecer é do jogo.
import fs from 'node:fs';
import path from 'node:path';

const [work, a, b] = process.argv.slice(2);
if (!work) {
  console.error('Uso: node falas-jogo.mjs <pasta_de_trabalho> [inicio_s] [fim_s]');
  process.exit(1);
}
const ini = Number(a ?? 0);
const fim = Number(b ?? Infinity);
const words = JSON.parse(fs.readFileSync(path.join(work, 'captions.json'), 'utf8')).filter((w) => w.startMs / 1000 >= ini && w.startMs / 1000 < fim);
const EN = new Set('the you i a to is it that what are we my your me this be on for not with do have just he she they was all get go got know like man yo hey okay right up out if so no yeah gonna wanna fuck shit about there here can don\'t i\'m it\'s you\'re let\'s come look need want'.split(' '));
const PT = new Set('o a os as de do da que não é eu você tá pra para um uma com no na isso mano cara aí pô porra caralho vai então mas muito tem mesmo né aqui essa esse ele ela gente'.split(' '));
const norm = (t) => t.toLowerCase().replace(/[^a-z'çãõáéíóúâêô]/gi, '');

const lines = [];
let cur = [];
const flush = () => {
  if (!cur.length) return;
  const ws = cur.map((w) => norm(w.text));
  const en = ws.filter((w) => EN.has(w)).length;
  const pt = ws.filter((w) => PT.has(w)).length;
  lines.push({inicio: cur[0].startMs / 1000, fim: cur[cur.length - 1].endMs / 1000, texto: cur.map((w) => w.text).join(' '), en, pt});
  cur = [];
};
words.forEach((w, i) => {
  if (cur.length && w.startMs - words[i - 1].endMs > 700) flush();
  cur.push(w);
  if (/[.!?]$/.test(w.text)) flush();
});
flush();
for (const l of lines) {
  if (l.en >= 1 && l.en > l.pt) console.log(`[${l.inicio.toFixed(1)}–${l.fim.toFixed(1)}] ${l.texto}`);
}
