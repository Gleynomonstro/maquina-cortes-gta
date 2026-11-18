#!/usr/bin/env node
// VÍDEO LONGO de uma partida/missão completa a partir da VOD da Twitch (YouTube, 1920×1080), feito em paralelo aos
// cortes curtos. Baixa da VOD só o trecho [inicio, fim] (a VOD cresce enquanto a live acontece, então dá para pegar
// também o que aconteceu antes da captura começar) e monta com o montar-longo da Fase 1 (marca d'água, capítulos,
// remover/acelerar).
//
//   node partida.mjs <pasta_da_live> <id> <url_da_vod> <inicio_s> <fim_s> [--qualidade 1080] [--titulo "..."]
//                    [--capitulos capitulos.json] [--remover remover.json] [--margem-antes 90] [--margem-depois 150]
//
// <inicio_s>/<fim_s> = início e fim REAIS da partida/missão; as margens são somadas automaticamente.
//
// Tempos em segundos DA VOD. capitulos.json: [{"inicio": s_da_vod, "nome": "..."}]; remover.json: [{"inicio", "fim"}].
// Saída: <pasta>/longos/<id>.mp4 e <id>-capitulos.txt.
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const [live, id, vod, a, b] = args;
if (!live || !id || !vod || a === undefined || b === undefined) {
  console.error('Uso: node partida.mjs <pasta_da_live> <id> <url_da_vod> <inicio_s> <fim_s> [--qualidade 1080] [--titulo "..."] [--capitulos f.json] [--remover f.json]');
  process.exit(1);
}
const opt = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
// margem: o vídeo começa um pouco ANTES do início real (papo antes, seleção, carregamento) e termina um pouco DEPOIS
// do fim (análise, reclamação, piada pós-jogo). Pedido do usuário em 17/11/2026.
const margemAntes = Number(opt('--margem-antes', 90));
const margemDepois = Number(opt('--margem-depois', 150));
const ini = Math.max(0, Number(a) - margemAntes);
const fim = Number(b) + margemDepois;
const altura = Number(opt('--qualidade', 1080));
const readJson = (f, d) => (f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) : d);
const capitulos = readJson(opt('--capitulos'), []);
const remover = readJson(opt('--remover'), []);

// pasta própria da partida, no formato que o montar-longo entende (um "bloco" = o trecho inteiro da VOD)
const P = path.join(live, 'partidas', id);
fs.mkdirSync(path.join(P, 'blocos'), {recursive: true});
const mp4 = path.join(P, 'vod.mp4');
const ts = path.join(P, 'blocos', 'bloco-000.ts');
console.log(`> Baixando da VOD ${Math.floor(ini / 60)}:${String(Math.floor(ini % 60)).padStart(2, '0')} até ${Math.floor(fim / 60)}:${String(Math.floor(fim % 60)).padStart(2, '0')} (${((fim - ini) / 60).toFixed(1)} min, até ${altura}p)`);
const t0 = Date.now();
const r = spawnSync('yt-dlp', ['--no-warnings', '-q', '-f', `b[height<=${altura}]/bv*[height<=${altura}]+ba/b`, '--download-sections', `*${ini}-${fim}`, '--merge-output-format', 'mp4', '-o', mp4, vod], {stdio: 'inherit'});
if (r.status !== 0 || !fs.existsSync(mp4)) {
  console.error('Falha ao baixar o trecho da VOD.');
  process.exit(1);
}
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', mp4, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-f', 'mpegts', ts]);
fs.rmSync(mp4);
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', ts], {encoding: 'utf8'}).trim());
fs.writeFileSync(path.join(P, 'gravacao.json'), JSON.stringify({ativo: false, origem: vod, inicioVod: ini, fimVod: fim}, null, 2));
console.log(`> Trecho baixado: ${(dur / 60).toFixed(1)} min em ${Math.round((Date.now() - t0) / 1000)} s`);

// capítulos e remoções em tempo da VOD → tempo do trecho
const rel = (t) => Math.max(0, Math.min(dur, t - ini));
const marcos = [...capitulos].sort((x, y) => x.inicio - y.inicio);
const trechos = marcos.length
  ? marcos.map((c, i) => ({inicio: rel(c.inicio), fim: i + 1 < marcos.length ? rel(marcos[i + 1].inicio) : dur, capitulo: c.nome}))
  : [{inicio: 0, fim: dur, capitulo: 'Início'}];
if (trechos[0].inicio > 0.5) trechos.unshift({inicio: 0, fim: trechos[0].inicio, capitulo: 'Antes da partida'});
const longos = {videos: [{id, tipo: 'partida', titulo: opt('--titulo', id), status: 'fechado', trechos, remover: remover.map((x) => ({inicio: rel(x.inicio), fim: rel(x.fim)}))}]};
fs.writeFileSync(path.join(P, 'longos.json'), JSON.stringify(longos, null, 2));

const E = path.join(os.homedir(), '.maquina-cortes-gta', 'engine', 'scripts');
const m = spawnSync(process.execPath, [path.join(E, 'montar-longo.mjs'), P, id], {stdio: 'inherit'});
if (m.status !== 0) process.exit(m.status || 1);
const outDir = path.join(live, 'longos');
fs.mkdirSync(outDir, {recursive: true});
for (const f of [`${id}.mp4`, `${id}-capitulos.txt`]) {
  const src = path.join(P, 'longos', f);
  if (fs.existsSync(src)) fs.renameSync(src, path.join(outDir, f));
}
fs.rmSync(ts, {force: true}); // o trecho bruto não é mais necessário

// volume: loudnorm em 2 passadas a -14 LUFS (padrão do YouTube); só o áudio é refeito, o vídeo é copiado
export function normalizar(arquivo) {
  const LN = 'loudnorm=I=-14:TP=-1.5:LRA=11';
  const p1 = spawnSync('ffmpeg', ['-hide_banner', '-i', arquivo, '-af', `${LN}:print_format=json`, '-vn', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 26});
  const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
  const tmp = arquivo.replace(/\.mp4$/, '.norm.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', arquivo, '-af', `${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, arquivo);
}
console.log('> Normalizando o volume (-14 LUFS)');
normalizar(path.join(outDir, `${id}.mp4`));
console.log(JSON.stringify({id, arquivo: path.resolve(outDir, `${id}.mp4`), duracaoMin: Number((dur / 60).toFixed(1)), tempoTotalSeg: Math.round((Date.now() - t0) / 1000)}));
