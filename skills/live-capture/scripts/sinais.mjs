#!/usr/bin/env node
// Sinais objetivos de um bloco da live para achar os momentos EXPLOSIVOS (os que viram corte vertical). Mede, em
// janelas de 5 s:
//   VOZ    — volume da voz do streamer acima do normal DELE (o áudio do bloco já passa pelo filtro de voz, então o som
//            do jogo pesa pouco) e velocidade da fala (fala acelerada = exaltação);
//   FALA   — palavrões/rage, espanto/surpresa, elogio ao jogo, xingamento ao jogo, risada, "não!"/gritos curtos;
//   TELA   — quanto a imagem muda (luta, explosão, cena nova, menu de vitória): evento no jogo;
//   CHAT   — rajada de mensagens e expressões repetidas (kkkk, KEKW, OMEGALUL, "?").
// Junta tudo numa ENERGIA de 0 a 10 por janela e um rótulo (RAGE, RISADA, ESPANTO, ELOGIO, XINGA O JOGO, DESCOBERTA,
// TENSÃO). O chat reage depois: cada rajada aponta para o vídeo ~3–15 s antes.
//
//   node sinais.mjs <pasta_da_live> <pasta_de_trabalho_do_bloco> [--todas] [--json]
//
// Tempos em segundos do source.mp4 do bloco (os mesmos do transcript-text). --todas imprime todas as janelas.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const [live, work] = args;
if (!live || !work) {
  console.error('Uso: node sinais.mjs <pasta_da_live> <pasta_de_trabalho_do_bloco> [--todas]');
  process.exit(1);
}
const read = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const bloco = read(path.join(work, 'bloco.json'), null);
const grav = read(path.join(live, 'gravacao.json'), {});
if (!bloco) {
  console.error(`Sem bloco.json em ${work}`);
  process.exit(1);
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const W = 5;
const dur = bloco.duracao;
const nJan = Math.ceil(dur / W);
const jan = Array.from({length: nJan}, (_, i) => ({s: i * W, voz: 0, wps: 0, termos: {}, tela: 0, chat: 0, chatRep: [], rotulos: new Set()}));

// ---------- VOZ: envelope de 100 ms do áudio (filtrado na faixa da voz pelo transcribe.mjs)
const wav = fs.readFileSync(path.join(work, 'audio16k.wav'));
let p = 12;
while (p < wav.length - 8 && wav.toString('ascii', p, p + 4) !== 'data') p += 8 + wav.readUInt32LE(p + 4);
const data = p + 8;
const n = Math.floor((wav.length - data) / 2);
const hop = 1600;
const db = [];
for (let i = 0; i + hop <= n; i += hop) {
  let s = 0;
  for (let k = 0; k < hop; k++) {
    const v = wav.readInt16LE(data + (i + k) * 2) / 32768;
    s += v * v;
  }
  db.push(10 * Math.log10(s / hop + 1e-10));
}
// "normal" da voz dele = mediana dos trechos com fala (acima do piso de ruído)
const piso = [...db].sort((a, b) => a - b)[Math.floor(db.length * 0.3)];
const falando = db.filter((x) => x > piso + 6).sort((a, b) => a - b);
const vozNormal = falando.length ? falando[Math.floor(falando.length / 2)] : piso + 10;
for (const j of jan) {
  const w = db.slice(j.s * 10, (j.s + W) * 10).sort((a, b) => b - a);
  // média dos 5 picos (0,5 s) da janela: um grito curto conta, um clique isolado não
  const top = w.slice(0, 5);
  j.voz = top.length ? top.reduce((a, b) => a + b, 0) / top.length - vozNormal : -99;
}

// ---------- FALA: velocidade e termos
const LEX = {
  rage: /^(porra|caralho|puta|putaria|merda|desgraça|desgraçado|fdp|cacete|inferno|bosta|droga|maldito|animal|burro|burra|horroroso|lixo|ódio|odeio|cala|vagabundo|arrombado|otário|idiota|imbecil)$/,
  espanto: /^(nossa|caraca|caramba|socorro|absurdo|bizarro|insano|surreal|inacreditável|impossível|mentira|cadê|oxe|eita|uau|wow)$/,
  elogio: /^(lindo|linda|perfeito|perfeita|sensacional|incrível|maravilhoso|maravilha|lindíssimo|brabo|braba|pica|genial|gênio|top|demais|magnífico|espetacular|foda)$/,
  risada: /^(k{3,}|(ha){2,}h?|(he){2,}|rs+|risos)$/,
  grito: /^(não|nao|para|vai|corre|sai|socorro|morre|mata|ai|ah|aaa+|oh|ô)$/,
};
const FRASES = {
  espanto: /(que isso|meu deus|não acredito|olha isso|como assim|o que é isso|mano do céu|que porra é essa|tá de brincadeira|olha que)/,
  xingaJogo: /(jogo (lixo|ruim|horroroso|quebrado|bugado|de merda)|esse jogo|que jogo (ruim|lixo)|bugou|tá bugado|injogável|odeio esse jogo|me transforma)/,
  elogioJogo: /(que jogo|jogo (lindo|perfeito|bonito|incrível|foda)|que (lindo|bonito|gráfico|detalhe)|olha (o|a) detalhe|muito bonito)/,
  descoberta: /(segredo|secreto|easter ?egg|escondido|descobri|achei|olha (aqui|isso|ali)|não sabia|tem isso|dá pra)/,
};
const words = read(path.join(work, 'captions.json'), []);
const norm = (t) => t.toLowerCase().normalize('NFC').replace(/[^a-zà-ú0-9ç]/g, '');
for (const j of jan) {
  const ws = words.filter((w) => w.startMs / 1000 >= j.s && w.startMs / 1000 < j.s + W);
  const reais = ws.filter((w) => !/^[[(]/.test(w.text.trim()));
  j.wps = reais.length / W;
  const txt = reais.map((w) => w.text.toLowerCase()).join(' ');
  j.texto = reais.map((w) => w.text).join(' ');
  for (const w of reais) {
    const t = norm(w.text);
    for (const [k, re] of Object.entries(LEX)) if (re.test(t)) j.termos[k] = (j.termos[k] || 0) + 1;
    if (/!$/.test(w.text.trim())) j.termos.exclamacao = (j.termos.exclamacao || 0) + 1;
  }
  if (ws.some((w) => /risos|risadas|laugh/i.test(w.text))) j.termos.risada = (j.termos.risada || 0) + 2;
  for (const [k, re] of Object.entries(FRASES)) if (re.test(txt)) j.termos[k] = (j.termos[k] || 0) + 1;
}
const wpsMed = [...jan.map((j) => j.wps).filter((x) => x > 0)].sort((a, b) => a - b);
const wpsNormal = wpsMed.length ? wpsMed[Math.floor(wpsMed.length / 2)] : 2;

// ---------- TELA: quanto a imagem muda (score de troca de cena do FFmpeg, 4 quadros/s em baixa resolução)
const sc = spawnSync('ffmpeg', ['-hide_banner', '-i', path.join(work, 'source.mp4'), '-vf', "fps=4,scale=160:-2,select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file=-", '-an', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 26});
const scores = [...(sc.stdout || '').matchAll(/scene_score=([0-9.]+)/g)].map((m) => Number(m[1]));
const telaMed = [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)] || 0.01;
for (const j of jan) {
  const w = scores.slice(j.s * 4, (j.s + W) * 4);
  j.tela = w.length ? Math.max(...w) : 0;
  j.telaMedia = w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0;
}

// ---------- CHAT (relógio do PC, o mesmo da gravação); a reação chega ~3–15 s depois
const inicioGrav = grav.inicio ? Date.parse(grav.inicio) : null;
const chatF = path.join(live, 'chat.jsonl');
let chatBase = 0;
let chatTotal = 0;
if (inicioGrav && fs.existsSync(chatF)) {
  const ini = inicioGrav + bloco.offset * 1000;
  const msgs = fs.readFileSync(chatF, 'utf8').trim().split('\n').map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter((m) => m && m.t >= ini && m.t < ini + (dur + 15) * 1000);
  chatTotal = msgs.length;
  const COMUNS = new Set('a o e é de da do pra para um uma que eu vc você ele ela mano não nao sim na no em com se tá ta isso esse essa mais muito kk só'.split(' '));
  const porJanela = Array.from({length: nJan + 3}, (_, i) => msgs.filter((m) => m.t >= ini + i * W * 1000 && m.t < ini + (i + 1) * W * 1000));
  const ns = porJanela.map((x) => x.length).sort((a, b) => a - b);
  chatBase = ns[Math.floor(ns.length / 2)] || 0;
  // atribui a reação do chat à janela de vídeo 1 a 2 janelas ANTES (5–10 s)
  porJanela.forEach((ms, i) => {
    const cont = {};
    for (const m of ms)
      for (const tok of new Set(m.texto.split(/\s+/).map((x) => x.replace(/k{3,}/gi, 'kkkk').replace(/[!.]+$/, '')).filter((x) => x.length >= 1 && !COMUNS.has(x.toLowerCase()))))
        cont[tok] = (cont[tok] || 0) + 1;
    const rep = Object.entries(cont).filter(([, c]) => c >= 4).sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const alvo of [i - 1, i - 2]) {
      if (alvo < 0 || alvo >= nJan) continue;
      jan[alvo].chat = Math.max(jan[alvo].chat, ms.length);
      if (rep.length && !jan[alvo].chatRep.length) jan[alvo].chatRep = rep;
    }
  });
}

// ---------- ENERGIA 0–10 e rótulos
for (const j of jan) {
  const t = j.termos;
  const vozPts = Math.max(0, Math.min(3, (j.voz - 2) / 3)); // +5 dB sobre o normal dele = 1; +11 = 3
  const ritmoPts = j.wps > wpsNormal * 1.5 && j.wps > 2.5 ? 0.5 : 0;
  const emoTermos = (t.rage || 0) + (t.espanto || 0) * 1.2 + (t.elogio || 0) + (t.risada || 0) * 1.5 + (t.xingaJogo || 0) * 2 + (t.elogioJogo || 0) * 2 + (t.descoberta || 0) * 1.5 + (t.grito || 0) * 0.5 + (t.exclamacao || 0) * 0.4;
  const emoPts = Math.min(3, emoTermos * 0.8);
  const telaPts = Math.min(2, Math.max(0, (j.tela - Math.max(0.25, telaMed * 3)) * 4) + (j.telaMedia > telaMed * 2.5 ? 0.5 : 0));
  const chatPts = chatBase || chatTotal ? Math.min(2, Math.max(0, (j.chat - chatBase * 1.5) / Math.max(4, chatBase)) + (j.chatRep.some(([k, c]) => /kkk|kek|lul|omegalul|lol|\?|pog|wtf|D:/i.test(k) && c >= 4) ? 0.8 : 0)) : 0;
  j.energia = Math.round(Math.min(10, vozPts + ritmoPts + emoPts + telaPts + chatPts) * 10) / 10;
  j.partes = {voz: vozPts, emo: emoPts, tela: telaPts, chat: chatPts};
  if ((t.rage || 0) + (t.xingaJogo || 0) >= 2 || ((t.rage || 0) >= 1 && vozPts >= 1.5)) j.rotulos.add('RAGE');
  if ((t.risada || 0) >= 1 || j.chatRep.some(([k]) => /kkk|kek|lul|lol/i.test(k))) j.rotulos.add('RISADA');
  if ((t.espanto || 0) >= 1 && vozPts >= 1) j.rotulos.add('ESPANTO');
  if ((t.elogio || 0) + (t.elogioJogo || 0) >= 2 || (t.elogioJogo || 0) >= 1) j.rotulos.add('ELOGIA O JOGO');
  if ((t.xingaJogo || 0) >= 1) j.rotulos.add('XINGA O JOGO');
  if ((t.descoberta || 0) >= 1 && ((t.espanto || 0) >= 1 || telaPts >= 1)) j.rotulos.add('DESCOBERTA');
  if (telaPts >= 1 && vozPts >= 1.5) j.rotulos.add('AÇÃO + REAÇÃO');
  if (vozPts < 0.5 && emoPts < 0.5 && telaPts < 0.5) j.rotulos.add('morno');
}

// --json: saída para a triagem automática (triagem.mjs)
if (args.includes('--json')) {
  console.log(JSON.stringify({bloco: bloco.bloco, offset: bloco.offset, duracao: dur, vozNormal, wpsNormal, chatBase, chatTotal,
    janelas: jan.map((j) => ({s: j.s, fim: j.s + W, energia: j.energia, rotulos: [...j.rotulos], voz: j.voz, tela: j.tela, chat: j.chat, chatRep: j.chatRep, termos: j.termos, texto: j.texto || '', partes: j.partes}))}));
  process.exit(0);
}
console.log(`# Sinais do ${bloco.bloco} (live ${mmss(bloco.offset)}–${mmss(bloco.offset + dur)}) · voz normal ${vozNormal.toFixed(1)} dB · fala normal ${wpsNormal.toFixed(1)} palavras/s · chat normal ${chatBase} msgs/5 s`);
const fmt = (j) => {
  const t = Object.entries(j.termos).map(([k, v]) => `${k}×${v}`).join(' ');
  return `  ${mmss(j.s)}–${mmss(j.s + W)}  energia ${j.energia.toFixed(1).padStart(4)}  [${[...j.rotulos].join(', ') || '—'}]  voz ${j.voz >= -50 ? (j.voz >= 0 ? '+' : '') + j.voz.toFixed(0) + ' dB' : '—'} · tela ${j.tela.toFixed(2)} · chat ${j.chat}${j.chatRep.length ? ' (' + j.chatRep.map(([k, c]) => `${k}×${c}`).join(', ') + ')' : ''}${t ? ' · ' + t : ''}\n      "${(j.texto || '').slice(0, 110)}"`;
};
const ordenadas = [...jan].sort((a, b) => b.energia - a.energia);
if (args.includes('--todas')) console.log(jan.map(fmt).join('\n'));
else {
  console.log('Janelas mais explosivas (candidatas a corte vertical: energia ≥ 5 e com rótulo de emoção):');
  console.log(ordenadas.filter((j) => j.energia >= 3).slice(0, 8).map(fmt).join('\n') || '  nenhuma janela com energia ≥ 3 (bloco morno: material para o vídeo longo, não para corte)');
}
