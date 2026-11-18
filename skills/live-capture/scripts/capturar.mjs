#!/usr/bin/env node
// Captura uma live da Twitch com o STREAMLINK, em blocos curtos (padrão 150 s = 2,5 min), sem parar enquanto os
// blocos anteriores são analisados.
//
//   node capturar.mjs <login_do_canal> <pasta_da_live> [--bloco 150] [--qualidade 720p60,720p,best]
//
// Saídas: <pasta>/blocos/bloco-000.ts, bloco-001.ts...; <pasta>/gravacao.json:
//   {ativo, canal, inicio (ISO, hora em que o primeiro dado chegou), blocoSegundos, motivoFim}
// Parar: crie <pasta>/PARAR. O bloco atual é fechado e a captura termina.
// Se o streamlink sair sozinho (live caiu, erro de rede), a captura termina e o motivo fica em gravacao.json:
// NÃO reinicia sozinha (quem orquestra avisa o usuário).
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const [canal, live] = args;
if (!canal || !live) {
  console.error('Uso: node capturar.mjs <login_do_canal> <pasta_da_live> [--bloco 150] [--qualidade 720p60,720p,best]');
  process.exit(1);
}
const opt = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const bloco = Number(opt('--bloco', 150));
const qualidade = opt('--qualidade', '720p60,720p,best');
const dir = path.join(live, 'blocos');
fs.mkdirSync(dir, {recursive: true});
const stateFile = path.join(live, 'gravacao.json');
const stopFile = path.join(live, 'PARAR');
fs.rmSync(stopFile, {force: true});
const state = {ativo: true, canal, inicio: null, blocoSegundos: bloco, pid: process.pid, motivoFim: null};
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
save();

// streamlink → stdout (MPEG-TS já com vídeo e áudio juntos) → ffmpeg corta em blocos sem recodificar
const sl = spawn('streamlink', ['--stdout', '--twitch-disable-ads', '--hls-live-edge', '2', '--retry-open', '2', `https://www.twitch.tv/${canal}`, qualidade], {stdio: ['ignore', 'pipe', 'pipe']});
const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', 'pipe:0', '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy',
  '-f', 'segment', '-segment_time', String(bloco), '-segment_format', 'mpegts', '-reset_timestamps', '1', path.join(dir, 'bloco-%03d.ts')], {stdio: ['pipe', 'inherit', 'inherit']});
sl.stdout.once('data', () => {
  state.inicio = new Date().toISOString();
  save();
  console.log(`> Gravando ${canal} em blocos de ${bloco} s (início ${state.inicio})`);
});
sl.stdout.pipe(ff.stdin);
ff.stdin.on('error', () => {});
let slErr = '';
sl.stderr.on('data', (d) => {
  slErr = (slErr + d).slice(-2000);
});

let parando = false;
const watcher = setInterval(() => {
  if (!parando && fs.existsSync(stopFile)) {
    parando = true;
    console.log('> PARAR recebido: fechando o bloco atual...');
    sl.kill();
  }
}, 2000);

sl.on('exit', (code) => {
  ff.stdin.end();
  if (!parando) state.motivoFim = `streamlink saiu sozinho (código ${code}): ${slErr.trim().split(/\r?\n/).slice(-3).join(' | ') || 'sem mensagem'}`;
  else state.motivoFim = 'parada pedida (arquivo PARAR)';
});
ff.on('exit', () => {
  clearInterval(watcher);
  state.ativo = false;
  state.pid = null;
  state.fim = new Date().toISOString();
  save();
  console.log(`> Captura encerrada: ${state.motivoFim}`);
});
