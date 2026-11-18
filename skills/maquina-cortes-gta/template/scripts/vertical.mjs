#!/usr/bin/env node
// Corte vertical da FASE 1: streamer centralizado em tela cheia, gancho nos primeiros 1,5 s, mudança visual a cada
// 2-3 s, pausas > 0,2 s removidas, inserts de B-roll licenciado (ou cartão), legenda principal + legenda do jogo,
// SFX, loudnorm a -14 LUFS, metadados com registro de fontes e checagem final.
//
//   node vertical.mjs <pasta_de_trabalho> <config_do_canal.json> <pasta_de_saida> [--clip ID] [--sem-render]
//
// A pasta de trabalho precisa de: source.mp4, captions.json, silences.json, meta.json, audio16k.wav (do transcribe.mjs)
// e cortes.json (escrito pelo Claude com a skill de detecção de momentos; formato em references/vertical.md).
// Saídas: <saida>/<id>.mp4, <id>.json (metadados + fontes + checagem) e <id>-checagem.md.
// Código de saída 2 = a checagem achou algo que só o Claude corrige (texto, duração): leia o relatório.
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buscarBroll} from './broll.mjs';

const args = process.argv.slice(2);
const [work, canalFile, outDir] = args;
if (!work || !canalFile || !outDir) {
  console.error('Uso: node vertical.mjs <pasta_de_trabalho> <config_do_canal.json> <pasta_de_saida> [--clip ID] [--sem-render]');
  process.exit(1);
}
const opt = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : null);
const onlyClip = opt('--clip');
const semRender = args.includes('--sem-render');

const FPS = 30;
const W = 1080;
const H = 1920;
const HOME = path.join(os.homedir(), '.maquina-cortes-gta');
const ENGINE = path.join(HOME, 'engine');
const tilde = (p) => (p && p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const read = (f) => readJson(path.join(work, f));
const hms = (s) => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = (s % 60).toFixed(1).padStart(4, '0');
  return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${ss}`;
};

const cortes = read('cortes.json');
// a posição da câmera e da área do jogo muda de vídeo para vídeo: `layoutOrigem` no cortes.json sobrescreve a do canal
const canalBase = {...readJson(canalFile), ...(cortes.layoutOrigem || {})};
let canal = canalBase; // cada corte pode ter o próprio `layoutOrigem` (o layout muda no meio do VOD)
const meta = read('meta.json');
const silences = read('silences.json');
// "licencas": "relaxado" (decisão do usuário): aceita material sem licença verificada (YouTube, qualquer licença do
// Wikimedia, arquivos e SFX sem licença). Tudo continua registrado nas fontes, marcado como não verificado.
const relaxado = canal.licencas === 'relaxado';
const cores = {palavraAtiva: '#FFD400', secundaria: '#9DB4D0', gancho: '#FFD400', cartao: ['#2B0A4A', '#C2185B'], ...(canal.cores || {})};
fs.mkdirSync(outDir, {recursive: true});

// ---------------------------------------------------------------- palavras
// 1) tira marcações do whisper ([música], (risos)), mesmo partidas em várias palavras
function loadWords() {
  const out = [];
  let tag = null;
  for (const w of read('captions.json')) {
    const t = w.text.trim();
    if (!tag && /^[[(]/.test(t)) tag = t[0] === '[' ? ']' : ')';
    if (tag) {
      if (t.endsWith(tag)) tag = null;
      continue;
    }
    // traço de diálogo do whisper ("- Beleza.") não vai para a legenda
    const limpo = t.replace(/^[-–—]+s*/, "");
    if (!limpo) continue;
    out.push({...w, text: limpo});
  }
  // o whisper às vezes devolve palavras fora de ordem ou com fim antes do início: ordena e corrige
  return out.map((w) => ({...w, endMs: Math.max(w.endMs, w.startMs + 50)})).sort((a, b) => a.startMs - b.startMs);
}
// 2) palavras que o whisper marcou dentro de um silêncio vão para os trechos com som logo depois
function unstick(words) {
  const inSil = (t) => silences.find((s) => s.end - s.start >= 0.45 && t > s.start + 0.05 && t < s.end - 0.05);
  for (let i = 0; i < words.length; ) {
    const sil = inSil(words[i].startMs / 1000);
    if (!sil) {
      i++;
      continue;
    }
    let j = i;
    while (j < words.length && inSil(words[j].startMs / 1000) === sil) j++;
    const n = j - i;
    const from = sil.end + 0.02;
    const next = Math.max(from + n * 0.1, j < words.length ? words[j].startMs / 1000 : from + n * 0.3);
    const speech = [];
    let c = from;
    for (const s of silences) {
      if (s.end - s.start < 0.45 || s.end <= c || s.start >= next) continue;
      if (s.start > c) speech.push([c, s.start]);
      c = Math.max(c, s.end);
    }
    if (next > c) speech.push([c, next]);
    const L = speech.reduce((t, [a, b]) => t + b - a, 0);
    const at = (x) => {
      for (const [a, b] of speech) {
        if (x <= b - a) return a + x;
        x -= b - a;
      }
      return next;
    };
    const step = L / n;
    for (let k = 0; k < n; k++) {
      const s = L > 0.05 ? at(k * step) : from + k * 0.1;
      words[i + k].startMs = Math.round(s * 1000);
      words[i + k].endMs = Math.round((s + Math.max(0.08, Math.min(0.5, step - 0.02))) * 1000);
    }
    i = j;
  }
  return words;
}
// 3) sincronia fina: a palavra que vem depois de uma pausa começa onde o SOM começa (envelope do áudio, 10 ms).
//    Mede o erro antes de corrigir (é o número do relatório) e corrige até 250 ms.
function loadEnvelope() {
  const f = path.join(work, 'audio16k.wav');
  if (!fs.existsSync(f)) return null;
  const buf = fs.readFileSync(f);
  let p = 12;
  while (p < buf.length - 8 && buf.toString('ascii', p, p + 4) !== 'data') p += 8 + buf.readUInt32LE(p + 4);
  const data = p + 8;
  const n = Math.floor((buf.length - data) / 2);
  const hop = 160; // 10 ms a 16 kHz
  const db = new Float32Array(Math.floor(n / hop));
  for (let i = 0; i < db.length; i++) {
    let s = 0;
    for (let k = 0; k < hop; k++) {
      const v = buf.readInt16LE(data + (i * hop + k) * 2) / 32768;
      s += v * v;
    }
    db[i] = 10 * Math.log10(s / hop + 1e-10);
  }
  return db;
}
function snapOnsets(words, env) {
  const errs = [];
  if (!env) return {errs, corrigidas: 0};
  const dbAt = (t) => env[Math.max(0, Math.min(env.length - 1, Math.round(t * 100)))];
  let corrigidas = 0;
  words.forEach((w, i) => {
    const s = w.startMs / 1000;
    const prevEnd = i ? words[i - 1].endMs / 1000 : -1;
    if (s - prevEnd < 0.15) return; // só palavras depois de uma pausa têm um início de som claro
    let floor = Infinity;
    for (let t = s - 0.35; t <= s - 0.05; t += 0.01) floor = Math.min(floor, dbAt(t));
    const thr = Math.max(floor + 10, -45);
    let onset = null;
    for (let t = Math.max(prevEnd + 0.02, s - 0.25); t <= s + 0.25; t += 0.01) {
      if (dbAt(t) >= thr) {
        onset = t;
        break;
      }
    }
    if (onset === null) return;
    const err = s - onset;
    errs.push(Math.abs(err));
    if (Math.abs(err) > 0.03 && onset < w.endMs / 1000 - 0.05) {
      w.startMs = Math.round(onset * 1000);
      corrigidas++;
    }
  });
  return {errs, corrigidas};
}

// ---------------------------------------------------------------- quem fala (2+ câmeras, sem trilha separada)
// Método do clipify (MIT): energia de movimento na região da boca de cada câmera; quem mexe mais, fala.
function speakerTimeline(cams, start, end) {
  const series = cams.map((c) => {
    const b = c.boca || {x: 0.5, y: 0.65, w: 0.35, h: 0.2};
    const x = Math.round(c.rect.x + c.rect.w * (b.x - b.w / 2));
    const y = Math.round(c.rect.y + c.rect.h * (b.y - b.h / 2));
    const w = Math.round(c.rect.w * b.w);
    const h = Math.round(c.rect.h * b.h);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(start), '-to', String(end), '-i', path.join(work, 'source.mp4'),
      '-vf', `crop=${w}:${h}:${x}:${y},scale=64:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`,
      '-an', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 26});
    const vals = [...r.stdout.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
    return vals;
  });
  const n = Math.min(...series.map((s) => s.length));
  const fps = n / Math.max(0.1, end - start);
  const win = Math.max(1, Math.round(fps * 0.5));
  const smooth = series.map((s) => s.slice(0, n).map((_, i) => {
    let a = 0;
    let k = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++, k++) a += s[j];
    return a / k;
  }));
  const tl = [];
  let cur = 0;
  let since = 0;
  for (let i = 0; i < n; i++) {
    const best = smooth.reduce((bi, s, k) => (s[i] > smooth[bi][i] ? k : bi), 0);
    if (best !== cur && (i - since) / fps >= 1.2) {
      cur = best;
      since = i;
    }
    tl.push(cur);
  }
  return (t) => tl[Math.max(0, Math.min(tl.length - 1, Math.round((t - start) * fps)))] ?? 0;
}

// ---------------------------------------------------------------- enquadramento (streamer centralizado)
const LEG_TOP = {cheio: 1300, desfocado: 1300};
function camGeom(cam) {
  const rect = cam.rect;
  const rx = cam.rosto?.x ?? 0.5;
  const ry = cam.rosto?.y ?? 0.42;
  const faceY = 820; // centro do rosto: terço central (640 a 1280)
  const cropH = Math.min(rect.h, (rect.w * 16) / 9);
  const sCheio = H / cropH;
  if (sCheio <= 3) {
    // recorte 9:16 em volta do rosto, sem sair da câmera (se precisar, o rosto sai um pouco do centro e isso é medido)
    const fx = rect.x + rect.w * rx;
    const half = W / 2 / sCheio;
    const left = Math.min(Math.max(fx - half, rect.x), rect.x + rect.w - 2 * half);
    const faceX = W / 2 + (fx - (left + half)) * sCheio;
    return {modo: 'cheio', escala: sCheio, faceOut: {x: faceX, y: faceY}, caixa: null, cam: {...rect, rostoX: rx, rostoY: ry}, ampliacao: sCheio};
  }
  // câmera pequena: largura toda, rosto no terço central, fundo desfocado
  const escala = W / rect.w;
  const h = rect.h * escala;
  const top = Math.max(0, Math.min(H - h, faceY - ry * h));
  return {modo: 'desfocado', escala, faceOut: {x: W / 2, y: top + ry * h}, caixa: {top, height: h}, cam: {...rect, rostoX: rx, rostoY: ry}, ampliacao: escala};
}

// tela dividida (react): em cima a câmera do streamer preenchendo a metade (rosto centralizado nela), embaixo a área
// do jogo/trailer (`jogo` na configuração), sincronizada com a fala
function splitGeom(cam, jogo) {
  const half = H / 2;
  const rx = cam.rosto?.x ?? 0.5;
  const ry = cam.rosto?.y ?? 0.42;
  const r = cam.rect;
  const s = Math.max(W / r.w, half / r.h);
  const fx = r.x + r.w * rx;
  const fy = r.y + r.h * ry;
  const left = Math.min(Math.max(fx - W / 2 / s, r.x), r.x + r.w - W / s);
  const top = Math.min(Math.max(fy - (half * 0.45) / s, r.y), r.y + r.h - half / s);
  const sb = Math.max(W / jogo.w, half / jogo.h);
  return {
    layout: 'dividido',
    top: {escala: s, faceOut: {x: (fx - left) * s, y: (fy - top) * s}},
    // panX: quanto da largura do jogo fica de fora; a metade de baixo desliza devagar para mostrar a imagem inteira
    bottom: {escala: sb, cx: jogo.x + jogo.w / 2, cy: jogo.y + jogo.h / 2, panX: Math.max(0, (jogo.w - W / sb) / 2)},
    cam: {...r, rostoX: rx, rostoY: ry},
    ampliacao: s,
  };
}

function makePages(list) {
  list = [...list];
  const pages = [];
  let cur = [];
  const flush = () => {
    if (cur.length) pages.push({words: cur, startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs});
    cur = [];
  };
  // palavra "esticada" pelo whisper não fica acesa por mais de 0,6 s nem invade a próxima
  list = list.map((w, i) => {
    const next = list[i + 1];
    const end = Math.min(w.endMs, w.startMs + 600, next ? next.startMs : Infinity);
    return {...w, endMs: Math.max(end, w.startMs + 120)};
  });
  for (const w of list) {
    const gap = cur.length ? w.startMs - cur[cur.length - 1].endMs : 0;
    const chars = cur.reduce((n, x) => n + x.text.length, 0) + w.text.length;
    if (cur.length >= 3 || chars > 18 || gap > 500) flush();
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) flush();
  }
  flush();
  pages.forEach((p, i) => {
    const next = pages[i + 1];
    // a legenda aparece só enquanto ele fala: some ~0,25 s depois da última palavra (preferência do usuário,
    // 17/11/2026: sem legenda parada nas pausas)
    p.endMs = Math.min(next ? next.startMs : Infinity, p.endMs + 250);
    p.words = p.words.map((w) => ({...w, text: w.text.replace(/[,;:]$/, '')}));
  });
  return pages;
}

const PROIBIDAS = ['neste vídeo', 'nesse vídeo', 'é importante notar', 'vamos explorar', 'em resumo', 'mergulhar', 'no mundo de', 'não é apenas'];
const emojis = (s) => (String(s).match(/\p{Extended_Pictographic}/gu) || []).length;

// ---------------------------------------------------------------- um corte
async function buildClip(clip) {
  canal = {...canalBase, ...(clip.layoutOrigem || {})};
  const id = clip.id;
  const falhas = [];
  const avisos = [];
  const fontes = [];
  const pub = (src, name) => {
    fs.copyFileSync(src, path.join(work, name));
    return name;
  };

  // palavras do streamer (sem as falas do jogo, que viram legenda secundária)
  let words = unstick(loadWords());
  const sec = (clip.secundarias || []).map((s) => ({...s}));
  const inSec = (t) => sec.some((s) => t >= s.inicio - 0.05 && t < s.fim);
  // `trechos` (opcional): só as partes mais interessantes do momento, emendadas com corte seco. É assim que o corte
  // fica dinâmico (preferência do usuário, 17/11/2026), em vez de zoom in/zoom out artificial.
  const trechos = Array.isArray(clip.trechos) && clip.trechos.length ? clip.trechos : [{inicio: clip.start, fim: clip.end}];
  const trechoDe = (t) => trechos.findIndex((r) => t >= r.inicio - 0.05 && t < r.fim);
  words = words.filter((w) => trechoDe(w.startMs / 1000) >= 0 && !inSec(w.startMs / 1000));
  if (!words.length) throw new Error(`${id}: nenhuma fala do streamer entre ${clip.start} e ${clip.end}`);
  // correções de palavras que o whisper errou (ex.: {"arregaceu": "arregacei"}); só troca o texto, não o tempo
  const corr = Object.fromEntries(Object.entries(clip.correcoes || {}).map(([k, v]) => [k.toLowerCase(), v]));
  words = words.map((w) => {
    const m = w.text.match(/^(.*?)([.,!?…]*)$/);
    const fix = corr[m[1].toLowerCase()];
    return fix ? {...w, text: fix + m[2]} : w;
  });
  const sync = snapOnsets(words, loadEnvelope());

  // trechos com fala (streamer + jogo); pausas > 0,2 s entre eles são removidas, cortando sempre entre palavras
  // trecho com `inteiro: true` mantém tudo, mesmo sem fala (ex.: a luta antes da reação): gameplay que dá contexto
  const units = [
    ...words.map((w) => [w.startMs / 1000, w.endMs / 1000]),
    ...sec.filter((s) => trechoDe(s.inicio) >= 0).map((s) => [s.inicio, s.fim]),
    ...trechos.filter((t) => t.inteiro).map((t) => [t.inicio, t.fim - 0.1]),
  ].sort((a, b) => a[0] - b[0]);
  const PRE = 0.06;
  const POS = 0.1;
  const segs = [];
  let pausas = 0;
  let pausaTempo = 0;
  let a = Math.max(trechos[trechoDe(units[0][0])]?.inicio ?? clip.start, units[0][0] - PRE);
  let b = units[0][1] + POS;
  for (let i = 1; i < units.length; i++) {
    const [s, e] = units[i];
    // corte obrigatório na troca de trecho; dentro do trecho, pausas > 0,2 s
    const outroTrecho = trechoDe(s) !== trechoDe(units[i - 1][0]);
    if (outroTrecho || (s - (b - POS) > 0.2 && s - PRE > b)) {
      pausas++;
      pausaTempo += s - PRE - b;
      segs.push({from: a, to: b});
      a = s - PRE;
    }
    b = Math.max(b, e + POS);
  }
  segs.push({from: a, to: Math.min(b, clip.end + 0.3)});

  // planos: quebra cada trecho em pedaços de até `alvo` s, sempre no começo de uma palavra
  const cams = canal.cameras || [];
  if (!cams.length) throw new Error('A configuração do canal não tem câmeras. Preencha `cameras` (ver config/canais/LEIAME.md): o rastreamento de rosto precisa do Python + MediaPipe, ainda não instalados.');
  const quem = cams.length > 1 ? speakerTimeline(cams, clip.start, clip.end) : () => 0;
  const geoms = cams.map(camGeom);
  const starts = words.map((w) => w.startMs / 1000);
  const plan = (alvo) => {
    const shots = [];
    for (const s of segs) {
      let c = s.from;
      while (s.to - c > alvo + 0.4) {
        const cand = starts.filter((t) => t > c + 0.8 && t < s.to - 0.6).sort((x, y) => Math.abs(x - (c + alvo)) - Math.abs(y - (c + alvo)))[0];
        if (!cand || cand - c > alvo + 0.6) {
          // nenhuma palavra começa perto do ponto de corte (fala esparsa, som de jogo alto): corta no ponto alvo se
          // ele cair entre palavras; se cair no meio de uma palavra, corta logo depois dela
          let t = c + alvo;
          const dentro = words.find((w) => t > w.startMs / 1000 && t < w.endMs / 1000);
          // palavra "esticada" pelo whisper (mais de 1 s) não é confiável: corta no alvo mesmo
          if (dentro && dentro.endMs - dentro.startMs <= 1000) t = dentro.endMs / 1000 + 0.02;
          if (t >= s.to - 0.6 || t - c < 0.8) break;
          shots.push({from: c, to: t});
          c = t;
          continue;
        }
        shots.push({from: c, to: cand});
        c = cand;
      }
      shots.push({from: c, to: s.to});
    }
    // ABERTURA "clímax primeiro" (cold open): 1 a 2 s do ponto mais forte do próprio corte vêm antes de tudo; depois
    // um flash e a sequência começa do início. `abertura: {"tipo": "climax", "inicio": s, "fim": s}` (tempos da origem).
    const ab = clip.abertura;
    if (ab && ab.tipo === 'climax' && ab.fim > ab.inicio) shots.unshift({from: ab.inicio, to: Math.min(ab.fim, ab.inicio + 2.2), cold: true});
    let out = 0;
    // layout de cada plano: "dividido" (streamer em cima, o que ele vê embaixo, sincronizado) é o PADRÃO sempre que
    // a configuração tem a área `jogo` (preferência do usuário, 15/11/2026: fica menos vazio, mesmo com o vídeo
    // pausado). `solos` no corte marca trechos com o streamer sozinho em tela cheia; `layout: "solo"` usa só ele;
    // `divididos` (formato antigo) ainda é aceito.
    const dividido = (sh) => {
      if (!canal.jogo || clip.layout === 'solo') return false;
      const mid = (sh.from + sh.to) / 2;
      if (clip.solos) return !clip.solos.some((r) => mid >= r.inicio && mid < r.fim);
      if (clip.divididos) return clip.divididos.some((r) => mid >= r.inicio && mid < r.fim);
      return true;
    };
    return shots.map((sh, i) => {
      const k = quem((sh.from + sh.to) / 2);
      const div = dividido(sh);
      const g = div ? splitGeom(cams[k], canal.jogo) : {...geoms[k], layout: 'solo'};
      // zoom alterna a cada plano (nunca abaixo de 1,04-1,06 quando a moldura da câmera poderia aparecer)
      const base = div ? 1.04 : g.modo === 'desfocado' ? 1.06 : 1.0;
      // zoom constante (sem zoom in/zoom out a cada plano: o usuário achou artificial, 17/11/2026); só a abertura
      // "clímax primeiro" fica um pouco mais perto
      const r = {...sh, ...g, camIndex: k, zoom: sh.cold ? base + 0.1 : base, outStart: out, turn: i === 1 && !!shots[0].cold};
      out += Math.max(1, Math.round((sh.to - sh.from) * FPS)) / FPS;
      return r;
    });
  };

  let alvo = 2.5;
  let shots;
  let props;
  let checks;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    shots = plan(alvo);
    const total = shots.reduce((t, s) => t + Math.max(1, Math.round((s.to - s.from) * FPS)) / FPS, 0);
    // o trecho repetido da abertura não conta para o mapeamento: cada tempo da origem aponta para a sequência normal
    const normais = shots.filter((x) => !x.cold);
    const cold = shots.find((x) => x.cold);
    const toOut = (t) => {
      const s = normais.find((x) => t >= x.from - 0.02 && t < x.to) ?? (t < normais[0].from ? normais[0] : normais[normais.length - 1]);
      return Math.min(total, Math.max(0, s.outStart + Math.min(t, s.to) - s.from));
    };
    const quant = [];
    const remap = words
      .map((w) => {
        const s = w.startMs / 1000;
        if (!normais.some((x) => s >= x.from - 0.02 && s < x.to)) return null;
        const o = toOut(s);
        quant.push(Math.abs(Math.round(o * FPS) / FPS - o));
        return {text: w.text.toUpperCase(), startMs: Math.round(o * 1000), endMs: Math.round(Math.min(total, o + Math.max(0.12, (w.endMs - w.startMs) / 1000)) * 1000)};
      })
      .filter(Boolean);
    let pages = makePages(remap);
    if (cold) {
      // as palavras do clímax aparecem duas vezes: na abertura e no lugar delas na sequência
      const coldWords = words
        .filter((w) => w.startMs / 1000 >= cold.from - 0.02 && w.startMs / 1000 < cold.to)
        .map((w) => {
          const o = cold.outStart + w.startMs / 1000 - cold.from;
          return {text: w.text.toUpperCase(), startMs: Math.round(o * 1000), endMs: Math.round(Math.min(cold.outStart + cold.to - cold.from, o + Math.max(0.12, (w.endMs - w.startMs) / 1000)) * 1000)};
        });
      const cp = makePages(coldWords);
      const coldFim = Math.round((cold.outStart + cold.to - cold.from) * 1000);
      cp.forEach((p) => (p.endMs = Math.min(p.endMs, coldFim)));
      pages = [...cp, ...pages];
    }
    const secundarias = sec.map((s) => ({texto: s.texto, rotulo: (s.rotulo || 'JOGO').toUpperCase(), startMs: Math.round(toOut(s.inicio) * 1000), endMs: Math.round(toOut(s.fim) * 1000)}));

    // inserts (na primeira tentativa resolve os arquivos; depois só recalcula tempos)
    if (tentativa === 0) {
      for (const [k, ins] of (clip.inserts || []).entries()) {
        const fala = words.filter((w) => w.startMs / 1000 >= ins.inicio - 0.05 && w.startMs / 1000 < ins.fim).map((w) => w.text).join(' ');
        ins._fala = fala;
        if (!fala && !(clip.secundarias || []).some((s) => s.fim > ins.inicio && s.inicio < ins.fim)) {
          avisos.push(`insert ${k} (${ins.busca || ins.texto}) não cobre nenhuma fala: foi ignorado (B-roll sempre ligado a um trecho da fala).`);
          ins._skip = true;
          continue;
        }
        if (ins.tipo === 'cartao') {
          ins._r = {tipo: 'cartao'};
          continue;
        }
        // zoom (aproxima numa região do que está na tela agora) e replay (repete, sem som, um momento anterior):
        // material do próprio VOD, sem busca
        if (ins.tipo === 'zoom' || ins.tipo === 'replay') {
          const rect = ins.rect || canal.jogo || {x: 0, y: 0, w: meta.width, h: meta.height};
          if (ins.tipo === 'replay' && typeof ins.de !== 'number') {
            avisos.push(`insert ${k} (replay) sem "de" (segundo da origem onde começa o replay): removido.`);
            ins._skip = true;
            continue;
          }
          ins._r = {tipo: 'jogo', rect, startIn: ins.tipo === 'replay' ? ins.de : ins.inicio, zoomDe: ins.tipo === 'zoom' ? 1.0 : 1.0, zoomAte: ins.tipo === 'zoom' ? 1.15 : 1.08,
            fonte: {tipo: 'origem', fonte: `VOD de origem (${ins.tipo})`, url: cortes.origem?.url || null, autor: canal.nome, licenca: canal.autorizacao?.registrada ? 'autorização do canal registrada' : 'AUTORIZAÇÃO PENDENTE', licencaUrl: null}};
          continue;
        }
        if (ins.tipo === 'origem') {
          ins._r = {tipo: 'video', file: 'source.mp4', startIn: ins.inicio, fonte: {tipo: 'origem', fonte: 'VOD de origem', url: cortes.origem?.url || null, autor: canal.nome, licenca: canal.autorizacao?.registrada ? 'autorização do canal registrada' : 'AUTORIZAÇÃO PENDENTE', licencaUrl: null}};
          continue;
        }
        if (ins.arquivo) {
          if (!ins.licenca && !relaxado) {
            avisos.push(`insert ${k}: arquivo ${ins.arquivo} sem licença informada; removido.`);
            ins._skip = true;
            continue;
          }
          const ext = path.extname(ins.arquivo);
          ins._r = {tipo: /\.(mp4|mov|webm)$/i.test(ext) ? 'video' : 'imagem', file: pub(ins.arquivo, `ins-${id}-${k}${ext}`), fonte: {fonte: ins.fonte || 'arquivo', url: ins.url || null, autor: ins.autor || null, licenca: ins.licenca || 'NÃO VERIFICADA (modo relaxado)', licencaUrl: ins.licencaUrl || null, verificada: !!ins.licenca}};
          continue;
        }
        // cache: o mesmo insert (mesma busca/vídeo/trecho) reaproveita o arquivo já escolhido; a busca do YouTube muda
        // de uma vez para outra e um insert bom poderia piorar ao renderizar de novo
        const cacheF = path.join(work, 'broll', 'cache.json');
        const cache = fs.existsSync(cacheF) ? readJson(cacheF) : {};
        // B-roll na metade de baixo pode rodar mais tempo (até 12 s), cobrindo o assunto inteiro da fala
        const durB = ins.modo === 'baixo' ? Math.min(12, Math.max(4, Math.ceil(ins.fim - ins.inicio + 1))) : 4;
        const chave = JSON.stringify([ins.busca || ins.texto || '', ins.youtube || null, ins.trecho ?? null, ...(durB !== 4 ? [durB] : [])]);
        let resultado = cache[chave] && fs.existsSync(cache[chave].arquivo) ? cache[chave] : null;
        let tentativas = [];
        if (!resultado) {
          ({resultado, tentativas} = await buscarBroll(canal, ins.busca || ins.texto || '', path.join(work, 'broll'), `${id}-${k}`, {trecho: ins.trecho, youtube: ins.youtube, dur: durB}));
          if (resultado) {
            cache[chave] = resultado;
            fs.mkdirSync(path.dirname(cacheF), {recursive: true});
            fs.writeFileSync(cacheF, JSON.stringify(cache, null, 1));
          }
        }
        if (resultado) {
          const ext = path.extname(resultado.arquivo);
          ins._r = {tipo: resultado.tipo, file: pub(resultado.arquivo, `ins-${id}-${k}${ext}`), fonte: resultado};
        } else {
          avisos.push(`insert ${k} ("${ins.busca}"): sem B-roll licenciado (${tentativas.join('; ')}); insert removido (sem cartão gráfico no lugar).`);
          ins._skip = true;
        }
      }
    }
    const inserts = [];
    for (const [k, ins] of (clip.inserts || []).entries()) {
      if (ins._skip) continue;
      // começa no começo da palavra mais próxima (sincronizado com a fala)
      const w0 = words.map((w) => w.startMs / 1000).sort((x, y) => Math.abs(x - ins.inicio) - Math.abs(y - ins.inicio))[0];
      const at = toOut(Math.abs(w0 - ins.inicio) < 0.5 ? w0 : ins.inicio);
      const r0 = ins._r;
      // zoom/replay ficam na metade de baixo por padrão (o streamer continua em cima)
      const modo = ins.modo === 'pip' ? 'pip' : ins.modo === 'cheio' ? 'cheio' : r0.tipo === 'jogo' || ins.modo === 'baixo' ? 'baixo' : 'cheio';
      const longo = modo === 'baixo' && r0.tipo === 'video'; // B-roll embaixo: roda o trecho inteiro da fala (até 12 s)
      const dur = Math.min(Math.max(toOut(ins.fim) - at, 2), modo === 'cheio' ? 3 : longo ? 12 : 4, total - at);
      if (dur < 1) continue;
      const r = ins._r;
      inserts.push({
        tipo: r.tipo === 'cartao' ? 'cartao' : r.tipo, modo, at, dur, file: r.file, startIn: r.startIn || 0,
        texto: (ins.texto || ins.busca || '').toUpperCase(), subtexto: ins.subtexto ? ins.subtexto.toUpperCase() : null,
        // crédito na tela só para licença verificada (ex.: CC BY exige); o não verificado fica só no registro de fontes
        credito: r.fonte && r.fonte.autor && r.fonte.tipo !== 'origem' && r.fonte.verificada !== false ? `${r.fonte.autor} · ${r.fonte.licenca}` : null,
        rect: r.rect, zoomDe: r.zoomDe, zoomAte: r.zoomAte, fadeIn: longo ? 15 : 6, fadeOut: longo ? 15 : 6, longo,
        _fonte: r.fonte, _src: [ins.inicio, ins.fim], _fala: ins._fala,
      });
    }
    // inserts não se sobrepõem: o anterior termina quando o próximo entra (mínimo 1,2 s); se não couber, o próximo espera
    inserts.sort((x, y) => x.at - y.at);
    for (let i = 1; i < inserts.length; i++) {
      const p = inserts[i - 1];
      const c = inserts[i];
      if (c.at >= p.at + p.dur) continue;
      if (c.at - p.at >= 1.2) p.dur = c.at - p.at;
      else {
        // o anterior fica 1,2 s e o próximo entra logo depois, mantendo pelo menos 2 s
        const fim = Math.max(c.at + c.dur, p.at + 1.2 + 2);
        p.dur = 1.2;
        c.at = p.at + 1.2;
        c.dur = Math.min(fim - c.at, c.modo === 'pip' ? 4 : 3);
      }
    }
    for (let i = inserts.length - 1; i >= 0; i--) if (inserts[i].dur < 1) inserts.splice(i, 1);
    // B-roll longo embaixo: fresta curta (< 1,5 s) entre dois inserts some. O longo começa um pouco antes (ou o anterior
    // longo dura um pouco mais), para a imagem do jogo não piscar no meio da sequência
    for (let i = 1; i < inserts.length; i++) {
      const p = inserts[i - 1];
      const c = inserts[i];
      const gap = c.at - (p.at + p.dur);
      if (gap <= 0 || gap >= 1.5) continue;
      if (c.longo) {
        c.at -= gap;
        c.dur += gap;
      } else if (p.longo) p.dur += gap;
    }
    // transições: cada insert entra e sai com o mesmo fade curto. Dois inserts colados (menos de 0,25 s entre eles)
    // viram uma FUSÃO: o anterior fica inteiro por baixo até o próximo terminar de aparecer por cima (nada de "sai um,
    // entra o outro" no mesmo instante).
    for (let i = 1; i < inserts.length; i++) {
      const p = inserts[i - 1];
      const c = inserts[i];
      if (c.at - (p.at + p.dur) < 0.25 && (p.modo === c.modo || c.modo === 'cheio')) {
        // o anterior continua por baixo enquanto o próximo aparece (troca suave, sem corte seco)
        p.dur = c.at - p.at + Math.max(0.2, (c.fadeIn || 6) / 30);
        p.fadeOut = 0;
      }
    }
    const destaques = (clip.destaques || []).map((d) => ({texto: d.texto.toUpperCase(), at: toOut(d.inicio), dur: 1.2}));
    const hook = {texto: clip.gancho || '', dur: Math.min(2.2, Math.max(1.5, clip.ganchoDuracao || 1.6))};

    // SFX: impacto no gancho, whoosh nos inserts, pop nos destaques e cartões (biblioteca com licença registrada)
    const sfx = [];
    const sfxDir = tilde(canal.sfx);
    const sfxLic = sfxDir && fs.existsSync(path.join(sfxDir, 'licencas.json')) ? readJson(path.join(sfxDir, 'licencas.json')) : {};
    const sfxFile = (n) => {
      if (!sfxDir) return null;
      const f = ['.mp3', '.wav'].map((e) => path.join(sfxDir, n + e)).find((p) => fs.existsSync(p));
      if (!f) return null;
      if (!sfxLic[n] && !sfxLic[path.basename(f)] && !relaxado) {
        avisos.push(`SFX "${n}" sem licença em ${sfxDir}/licencas.json: não usado.`);
        return null;
      }
      return pub(f, `sfx-${n}${path.extname(f)}`);
    };
    const imp = sfxFile('impacto');
    const who = sfxFile('whoosh');
    const pop = sfxFile('pop');
    if (imp) sfx.push({file: imp, at: 0, volume: 0.35});
    for (const i of inserts) if (who) sfx.push({file: who, at: Math.max(0, i.at - 0.08), volume: 0.3});
    const virada = shots.find((x) => x.turn);
    if (virada && who) sfx.push({file: who, at: Math.max(0, virada.outStart - 0.1), volume: 0.35});
    for (const d of destaques) if (pop) sfx.push({file: pop, at: d.at, volume: 0.3});

    // ---- checagens que dá para corrigir sozinho antes do render
    const eventos = [0, hook.dur, ...shots.map((s) => s.outStart), ...inserts.flatMap((i) => [i.at, i.at + i.dur]), ...destaques.map((d) => d.at)].filter((t) => t <= total).sort((x, y) => x - y);
    eventos.push(total);
    let maxSem = 0;
    for (let i = 1; i < eventos.length; i++) maxSem = Math.max(maxSem, eventos[i] - eventos[i - 1]);
    const visivel = (t) =>
      pages.some((p) => t * 1000 >= p.startMs && t * 1000 < p.endMs) ||
      secundarias.some((p) => t * 1000 >= p.startMs && t * 1000 < p.endMs) ||
      t < hook.dur ||
      destaques.some((d) => t >= d.at && t < d.at + d.dur) ||
      inserts.some((i) => i.tipo === 'cartao' && t >= i.at && t < i.at + i.dur);
    const semLegenda = [];
    for (let s = 0; s < Math.floor(total); s++) {
      let ok = false;
      for (let t = s; t < s + 1; t += 0.1) if (visivel(t)) ok = true;
      if (!ok) semLegenda.push(s);
    }
    const brollT = inserts.filter((i) => i.tipo !== 'cartao' && i.modo === 'cheio').reduce((t, i) => t + i.dur, 0);
    const solo = new Set(shots.map((s) => s.camIndex)).size === 1;
    const soloShots = shots.filter((s) => s.layout === 'solo');
    const centro = (soloShots.length ? soloShots : shots.map((s) => ({faceOut: {x: W / 2, y: 820}}))).map((s) => ({dx: Math.abs(s.faceOut.x - W / 2), y: s.faceOut.y}));
    const legTop = LEG_TOP[geoms[0].modo];
    const secTop = legTop + 150;
    const faixas = shots.map((s) => {
      const d = Math.max(1, Math.round((s.to - s.from) * FPS)) / FPS;
      return s.layout === 'dividido'
        ? {startMs: Math.round(s.outStart * 1000), endMs: Math.round((s.outStart + d) * 1000), legenda: H / 2, secundaria: H / 2 + 150}
        : {startMs: Math.round(s.outStart * 1000), endMs: Math.round((s.outStart + d) * 1000), legenda: legTop, secundaria: secTop};
    });
    const tops = faixas.flatMap((f) => [f.legenda, f.secundaria]);
    checks = {
      duracao: total,
      pausasRemovidas: pausas,
      tempoDePausaRemovido: Number(pausaTempo.toFixed(2)),
      trocasDePlano: shots.length - 1,
      maxSemMudanca: Number(maxSem.toFixed(2)),
      brollPercentual: Number(((brollT / total) * 100).toFixed(1)),
      segundosSemLegenda: semLegenda,
      centralizado: {solo, maxDesvioX: Number(Math.max(...centro.map((c) => c.dx)).toFixed(1)), rostoYMin: Math.round(Math.min(...centro.map((c) => c.y))), rostoYMax: Math.round(Math.max(...centro.map((c) => c.y)))},
      legendaNaFaixaSegura: Math.min(...tops) - 70 >= H * 0.2 && Math.max(...tops) + 40 <= H * 0.8,
      layouts: {sozinho: soloShots.length, dividido: shots.length - soloShots.length},
      sincronia: {
        palavrasMedidas: sync.errs.length,
        corrigidas: sync.corrigidas,
        erroAntesMedioMs: sync.errs.length ? Math.round((sync.errs.reduce((x, y) => x + y, 0) / sync.errs.length) * 1000) : null,
        erroAntesMaxMs: sync.errs.length ? Math.round(Math.max(...sync.errs) * 1000) : null,
        erroQuadroMaxMs: Math.round(Math.max(0, ...quant) * 1000),
      },
      ampliacaoCamera: Number(Math.max(...shots.map((s) => s.ampliacao)).toFixed(2)),
      modoEnquadramento: shots[0].modo,
    };
    props = {
      totalSeconds: total, sourceFile: 'source.mp4', sourceWidth: meta.width, sourceHeight: meta.height,
      shots: shots.map((s) => ({from: s.from, to: s.to, turn: !!s.turn, cold: !!s.cold, layout: s.layout, modo: s.modo, escala: s.escala, zoom: s.zoom, faceOut: s.faceOut, caixa: s.caixa, cam: s.cam, top: s.top, bottom: s.bottom})),
      faixas,
      inserts: inserts.map(({_fonte, _src, _fala, ...i}) => i),
      pages, secundarias, destaques, hook, sfx, cores,
      layout: {legendaTop: legTop, secundariaTop: secTop},
      watermark: {logo: null, name: canal.marca?.perfil || '', posicao: canal.marca?.posicao || 'superior-direito'},
    };
    props._inserts = inserts;
    // o ritmo agora vem do conteúdo (trechos emendados, inserts), não de dividir planos: uma passada basta
    break;
    alvo = Math.max(1.6, alvo - 0.3); // corrige: planos mais curtos e tenta de novo
  }

  // ---- checagens que só o Claude corrige (texto e duração)
  const md = clip.metadados || {};
  const durMax = Number(canal.duracaoMax) || 60;
  if (checks.duracao > durMax) falhas.push(`duração ${checks.duracao.toFixed(1)} s (máximo ${durMax}): escolha um trecho menor.`);
  if (checks.duracao < 15) avisos.push(`duração ${checks.duracao.toFixed(1)} s: curto (ideal 30 a 45 s).`);
  // sem zoom artificial, trechos longos sem corte são possíveis: vira aviso (encurte com `trechos` se ficar arrastado)
  if (checks.maxSemMudanca > 6) avisos.push(`${checks.maxSemMudanca} s seguidos sem corte nem insert: se ficar arrastado, use "trechos" para emendar só as partes boas.`);
  if (!clip.gancho) falhas.push('falta o texto do gancho (campo "gancho").');
  if (!md.titulo || md.titulo.length > 60) falhas.push(`título ausente ou com mais de 60 caracteres (${(md.titulo || '').length}).`);
  if (!Array.isArray(md.hashtags) || md.hashtags.length < 5 || md.hashtags.length > 8) falhas.push('use de 5 a 8 hashtags.');
  if (!md.descricao) falhas.push('falta a descrição.');
  if (!md.justificativa) falhas.push('falta a justificativa do momento.');
  const textos = [clip.gancho, md.titulo, md.descricao, ...(clip.destaques || []).map((d) => d.texto), ...(clip.inserts || []).map((i) => i.texto || '')].join(' \n ');
  for (const p of PROIBIDAS) if (textos.toLowerCase().includes(p)) falhas.push(`frase proibida pelo guia de resenha: "${p}".`);
  if (emojis(textos) > 2) falhas.push(`emojis demais (${emojis(textos)}; máximo 2).`);
  if (!checks.centralizado.solo) avisos.push('mais de um falante: cada plano centraliza quem fala.');
  if (checks.centralizado.maxDesvioX > 60) falhas.push(`rosto fora do centro em até ${checks.centralizado.maxDesvioX}px: confira a posição da câmera e do rosto na configuração.`);
  if (checks.centralizado.rostoYMin < 640 || checks.centralizado.rostoYMax > 1280) falhas.push('rosto fora do terço central vertical.');
  if (checks.sincronia.erroQuadroMaxMs > 100) falhas.push('erro de sincronia acima de 100 ms.');
  if (checks.ampliacaoCamera > 2.5) avisos.push(`a câmera foi ampliada ${checks.ampliacaoCamera}x: pode ficar suave (origem com câmera pequena).`);
  if (!canal.autorizacao?.registrada) avisos.push('autorização do canal de origem NÃO registrada na configuração.');

  // fontes de todo material externo
  for (const i of props._inserts) {
    if (!i._fonte) continue;
    fontes.push({
      tipo: i.tipo, modo: i.modo, fonte: i._fonte.fonte, url: i._fonte.url, autor: i._fonte.autor || null, autorUrl: i._fonte.autorUrl || null,
      licenca: i._fonte.licenca, licencaUrl: i._fonte.licencaUrl || null, licencaVerificada: i._fonte.verificada !== false && i._fonte.tipo !== 'origem',
      trechoOrigem: {inicio: i._src[0], fim: i._src[1]}, trechoCorte: {inicio: Number(i.at.toFixed(2)), fim: Number((i.at + i.dur).toFixed(2))}, fala: i._fala,
    });
  }
  if (props.sfx.length) {
    const sfxDir = tilde(canal.sfx);
    const lf = path.join(sfxDir, 'licencas.json');
    const lic = fs.existsSync(lf) ? readJson(lf) : {};
    for (const s of props.sfx) {
      const n = s.file.replace(/^sfx-/, '').replace(/\.\w+$/, '');
      fontes.push({tipo: 'sfx', arquivo: n, licenca: 'NÃO VERIFICADA (modo relaxado)', ...(lic[n] || {}), licencaVerificada: !!lic[n], trechoCorte: {inicio: s.at}});
    }
  }
  const naoVerificadas = fontes.filter((f) => f.licencaVerificada === false).length;
  if (naoVerificadas) avisos.push(`${naoVerificadas} fonte(s) com licença NÃO verificada${relaxado ? ' (modo relaxado)' : ''}: revisar antes de publicar comercialmente.`);

  // marca d'água
  const logo = tilde(canal.marca?.logo);
  if (logo && fs.existsSync(logo)) props.watermark.logo = pub(logo, `wm-${path.basename(logo)}`);
  delete props._inserts;

  const propsFile = path.resolve(work, `vprops-${id}.json`);
  fs.writeFileSync(propsFile, JSON.stringify(props));
  const raw = path.resolve(work, `vraw-${id}.mp4`);
  const final = path.resolve(outDir, `${id}.mp4`);
  let audio = null;

  if (!semRender) {
    console.log(`> Renderizando ${id} (${checks.duracao.toFixed(1)} s, ${props.shots.length} planos, ${props.inserts.length} inserts)`);
    const cli = path.join(ENGINE, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
    const r = spawnSync(process.execPath, [cli, 'render', 'src/index.js', 'Vertical', raw, `--props=${propsFile}`, `--public-dir=${path.resolve(work)}`, '--codec=h264', '--crf=19', '--log=error'], {cwd: ENGINE, stdio: 'inherit'});
    if (r.status !== 0) throw new Error(`render de ${id} falhou`);
    audio = masterAudio(raw, final);
    fs.rmSync(raw, {force: true});
    if (Math.abs(audio.integrado - -14) > 1) falhas.push(`áudio a ${audio.integrado} LUFS (alvo -14 ± 1).`);
    if (audio.picoReal > -1) falhas.push(`pico real ${audio.picoReal} dBTP (máximo -1).`);
  }

  const origem = cortes.origem || {};
  const metaOut = {
    id,
    arquivo: semRender ? null : final,
    formato: {resolucao: '1080x1920', fps: FPS, video: 'H.264', audio: 'AAC 48 kHz', loudnessAlvo: '-14 LUFS'},
    titulo: md.titulo, descricao: md.descricao, hashtags: md.hashtags, justificativa: md.justificativa,
    gancho: clip.gancho,
    // corte de reserva (nota 5–6): gerado para o usuário avaliar, não é prioridade
    reserva: !!clip.reserva,
    nota: clip.nota ?? null,
    abertura: clip.abertura?.tipo === 'climax'
      ? {tipo: 'climax-primeiro', trechoOrigem: {inicio: clip.abertura.inicio, fim: clip.abertura.fim}, porque: clip.abertura.porque || null}
      : {tipo: 'acao-direta', porque: clip.abertura?.porque || null},
    live: cortes.live?.inicioGravacao
      ? (() => {
          const momento = Date.parse(cortes.live.inicioGravacao) + ((cortes.live.offset || 0) + (clip.abertura?.tipo === 'climax' ? clip.abertura.inicio : clip.start)) * 1000;
          const pronto = Date.now();
          return {momento: new Date(momento).toISOString(), pronto: new Date(pronto).toISOString(), atrasoSegundos: Math.round((pronto - momento) / 1000), horarioNaLive: hms((cortes.live.offset || 0) + clip.start)};
        })()
      : null,
    origem: {url: origem.url || null, canal: canal.nome, autorizacao: canal.autorizacao || null, inicio: clip.start, fim: clip.end, inicioHms: hms(clip.start), fimHms: hms(clip.end)},
    fontes,
    checagem: {...checks, audio, aprovado: !falhas.length, falhas, avisos},
  };
  fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(metaOut, null, 2));
  fs.writeFileSync(path.join(outDir, `${id}-checagem.md`), relatorio(metaOut));
  return metaOut;
}

// áudio final: música opcional com ducking sob a fala + loudnorm em 2 passadas (-14 LUFS, pico -1,5 dBTP), AAC 48 kHz
function masterAudio(raw, final) {
  const musica = tilde(canal.musica);
  const temMusica = musica && fs.existsSync(musica);
  const inputs = ['-i', raw, ...(temMusica ? ['-stream_loop', '-1', '-i', musica] : [])];
  const pre = temMusica
    ? '[1:a]volume=0.22,aresample=48000[m];[0:a]aresample=48000,asplit=2[v][sc];[m][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[md];[v][md]amix=inputs=2:duration=first:normalize=0'
    : '[0:a]aresample=48000';
  const LN = 'loudnorm=I=-14:TP=-1.5:LRA=11';
  const p1 = spawnSync('ffmpeg', ['-hide_banner', ...inputs, '-filter_complex', `${pre},${LN}:print_format=json[a]`, '-map', '[a]', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 26});
  const m = JSON.parse(p1.stderr.slice(p1.stderr.lastIndexOf('{'), p1.stderr.lastIndexOf('}') + 1));
  const ln2 = `${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', `${pre},${ln2},aresample=48000[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', final]);
  const medir = (file) => {
    const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8', maxBuffer: 1 << 26});
    const sum = e.stderr.slice(e.stderr.lastIndexOf('Summary'));
    const num = (re) => Number((sum.match(re) || [])[1]);
    return {integrado: num(/I:\s+(-?[0-9.]+) LUFS/), picoReal: num(/Peak:\s+(-?[0-9.]+) dBFS/)};
  };
  let r = medir(final);
  // som com picos altos (jogo, gritos): o loudnorm linear não chega a -14 sem estourar o pico. Corrige com ganho +
  // limitador (pico máximo ~-1,5 dBFS) e mede de novo, até 2 vezes
  for (let i = 0; i < 2 && Math.abs(r.integrado + 14) > 0.5; i++) {
    const tmp = final.replace(/\.mp4$/, '.ajuste.mp4');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', final, '-af', `volume=${(-14 - r.integrado).toFixed(2)}dB,alimiter=limit=0.84:attack=5:release=50:level=false,aresample=48000`, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', tmp]);
    fs.renameSync(tmp, final);
    r = medir(final);
  }
  return {...r, musica: temMusica ? musica : null};
}

function relatorio(m) {
  const c = m.checagem;
  const ok = (b) => (b ? '✅' : '❌');
  const s = c.sincronia;
  return `# Checagem: ${m.id}

**Resultado: ${c.aprovado ? 'APROVADO' : 'REPROVADO'}**

| Item | Valor | OK |
|---|---|---|
| Duração | ${c.duracao.toFixed(1)} s (máx. ${Number(canal.duracaoMax) || 60}, ideal 30–45) | ${ok(c.duracao <= (Number(canal.duracaoMax) || 60))} |
| Pausas removidas | ${c.pausasRemovidas} (${c.tempoDePausaRemovido} s) | ✅ |
| Trocas de plano | ${c.trocasDePlano} | ✅ |
| Maior intervalo sem corte/insert | ${c.maxSemMudanca} s (aviso acima de 6) | ${c.maxSemMudanca <= 6 ? '✅' : '⚠️'} |
| Tempo com B-roll | ${c.brollPercentual}% | ✅ |
| Sincronia da legenda | antes da correção: média ${s.erroAntesMedioMs ?? '–'} ms, máx. ${s.erroAntesMaxMs ?? '–'} ms em ${s.palavrasMedidas} palavras após pausa; ${s.corrigidas} corrigidas; erro de quadro máx. ${s.erroQuadroMaxMs} ms | ${ok(s.erroQuadroMaxMs <= 100)} |
| Áudio | ${c.audio ? `${c.audio.integrado} LUFS, pico ${c.audio.picoReal} dBTP` : 'não renderizado'} (alvo -14) | ${ok(!c.audio || Math.abs(c.audio.integrado + 14) <= 1)} |
| Legenda | só durante a fala (some nas pausas); ${c.segundosSemLegenda.length} s sem legenda | ✅ |
| Legendas fora dos 20% de cima e de baixo | ${c.legendaNaFaixaSegura ? 'sim' : 'não'} | ${ok(c.legendaNaFaixaSegura)} |
| Streamer centralizado | ${c.centralizado.solo ? 'sozinho' : 'vários falantes'}; desvio máx. ${c.centralizado.maxDesvioX}px; rosto entre y=${c.centralizado.rostoYMin} e ${c.centralizado.rostoYMax} (terço central: 640–1280) | ${ok(c.centralizado.maxDesvioX <= 60 && c.centralizado.rostoYMin >= 640 && c.centralizado.rostoYMax <= 1280)} |
| Enquadramento | ${c.modoEnquadramento}, câmera ampliada ${c.ampliacaoCamera}x | ✅ |

Sobre a sincronia: o remapeamento depois dos cortes é exato (o erro restante é o arredondamento para quadros de 1/30 s). O "antes da correção" compara o início de cada palavra que vem depois de uma pausa com o início do som no áudio; é uma medida aproximada (som do jogo alto pode enganar), e essas palavras são ajustadas para o início do som.

${c.falhas.length ? '## Falhas\n\n' + c.falhas.map((f) => `- ${f}`).join('\n') + '\n\n' : ''}${c.avisos.length ? '## Avisos\n\n' + c.avisos.map((f) => `- ${f}`).join('\n') + '\n\n' : ''}## Fontes externas

${m.fontes.length ? m.fontes.map((f) => `- **${f.tipo}** ${f.fonte || ''}: ${f.url || f.arquivo || ''}, autor ${f.autor || '–'}, licença ${f.licenca || '–'}${f.trechoCorte ? `, no corte em ${f.trechoCorte.inicio}s` : ''}`).join('\n') : 'Nenhuma.'}
`;
}

const lista = cortes.clips.filter((c) => !onlyClip || c.id === onlyClip);
let reprovado = false;
for (const clip of lista) {
  const m = await buildClip(clip);
  console.log(JSON.stringify({id: m.id, arquivo: m.arquivo, aprovado: m.checagem.aprovado, falhas: m.checagem.falhas, avisos: m.checagem.avisos}, null, 1));
  if (!m.checagem.aprovado) reprovado = true;
}
process.exit(reprovado ? 2 : 0);
