#!/usr/bin/env node
// Mostra onde a imagem da área do jogo/vídeo fica PARADA (pausado, cena estática) num trecho da origem: é ali que um
// insert preenche o vazio. Onde a imagem se move (tem coisa acontecendo), deixe a tela dividida rolar sem insert.
//
//   node trechos-parados.mjs <pasta_de_trabalho> <config_do_canal.json> <inicio_s> <fim_s> [--min 1.5]
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const [work, canalFile, a, b] = args;
if (!work || !canalFile || a === undefined || b === undefined) {
  console.error('Uso: node trechos-parados.mjs <pasta_de_trabalho> <config_do_canal.json> <inicio_s> <fim_s> [--min 1.5]');
  process.exit(1);
}
const min = Number(args.includes('--min') ? args[args.indexOf('--min') + 1] : 1.5);
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const cortesF = path.join(work, 'cortes.json');
const canal = {...read(canalFile), ...(fs.existsSync(cortesF) ? read(cortesF).layoutOrigem || {} : {})};
const j = canal.jogo;
const crop = j ? `crop=${j.w}:${j.h}:${j.x}:${j.y},` : '';
const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(a), '-to', String(b), '-i', path.join(work, 'source.mp4'), '-vf', `${crop}scale=240:-2,freezedetect=n=-45dB:d=${min}`, '-an', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 26});
const ini = [...r.stderr.matchAll(/freeze_start: ([0-9.]+)/g)].map((m) => Number(m[1]) + Number(a));
const fim = [...r.stderr.matchAll(/freeze_end: ([0-9.]+)/g)].map((m) => Number(m[1]) + Number(a));
const out = ini.map((s, i) => ({inicio: Number(s.toFixed(1)), fim: Number((fim[i] ?? Number(b)).toFixed(1))}));
console.log(out.length ? out.map((x) => `parado: ${x.inicio}–${x.fim} s (${(x.fim - x.inicio).toFixed(1)} s)`).join('\n') : 'nenhum trecho parado (a imagem se move o tempo todo)');
