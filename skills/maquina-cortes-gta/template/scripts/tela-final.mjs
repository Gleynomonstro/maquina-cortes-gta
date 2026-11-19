#!/usr/bin/env node
// Tela de finalização para vídeos longos, no clima GTA 6 / Vice City (pôr do sol, neon, palmeiras, cidade e mar):
// "Obrigado por assistir", "Inscreva-se" e "Siga o canal". A imagem é desenhada em HTML e fotografada por um Chrome headless.
//   node tela-final.mjs <video.mp4> [saida.mp4]
// Config em ~/.maquina-cortes-gta/tela-final.json (modelo em finalizacao/tela-final.json do repositório).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {readJson} from './live-comum.mjs';

const DEFAULTS = {
  ativo: true, duracao: 12, titulo: 'OBRIGADO POR ASSISTIR!', botaoInscrever: 'INSCREVA-SE NO CANAL',
  botaoSeguir: 'SIGA O CANAL', rodape: 'Deixe seu like e ative o sininho',
};
const HOME = path.join(os.homedir(), '.maquina-cortes-gta');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

function acharChrome() {
  const ach = (dir, nome) => {
    try {
      for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { const r = ach(p, nome); if (r) return r; } else if (e.name === nome) return p;
      }
    } catch {}
    return null;
  };
  const remotion = ach(path.join(HOME, 'engine', 'node_modules', '.remotion'), os.platform() === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
  const fixos = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return [...fixos, remotion].find((p) => p && fs.existsSync(p)) || null;
}

const PALMEIRA = `<g fill="#0a0318"><path d="M150 560C160 430 152 300 118 150c10 0 14 2 22 6 30 140 34 280 44 404z"/>
<g transform="translate(128 150)">
<path d="M0 0Q-80-50-170 20Q-90-20 0 0Z"/><path d="M0 0Q-60-70-130-60Q-60-40 0 0Z"/><path d="M0 0Q-30-90-90-110Q-30-60 0 0Z"/>
<path d="M0 0Q20-100 80-120Q30-60 0 0Z"/><path d="M0 0Q60-70 130-60Q60-40 0 0Z"/><path d="M0 0Q80-50 170 20Q90-20 0 0Z"/>
<path d="M0 0Q-70 10-140 90Q-70 30 0 0Z"/><path d="M0 0Q70 10 140 90Q70 30 0 0Z"/></g></g>`;

function htmlTela(cfg, logoUrl, perfil) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  body{width:1920px;height:1080px;overflow:hidden;position:relative;font-family:"Segoe UI Black","Arial Black","Segoe UI",sans-serif;
    background:linear-gradient(180deg,#12062e 0%,#2b0a4a 28%,#7a1f9c 50%,#d8338e 66%,#ff7a3d 80%,#ffc23d 92%)}
  .bg{position:absolute;inset:-30px;filter:blur(5px)}
  .stars{position:absolute;left:0;right:0;top:0;height:46%;background-image:radial-gradient(circle,#fff 0 1.4px,transparent 1.9px);background-size:83px 71px;opacity:.4;mask-image:linear-gradient(180deg,#000,transparent)}
  .sun{position:absolute;left:50%;top:380px;width:760px;height:760px;margin-left:-380px;border-radius:50%;
    background:linear-gradient(180deg,#ffe36a 0%,#ff9a3d 45%,#ff3d9a 100%);
    -webkit-mask-image:repeating-linear-gradient(180deg,#000 0 30px,transparent 30px 40px);}
  .sea{position:absolute;left:0;right:0;top:760px;bottom:0;background:linear-gradient(180deg,#ff6aa0 0%,#c0267f 18%,#4a1280 55%,#1a0640 100%)}
  .refl{position:absolute;left:50%;top:765px;width:520px;height:300px;margin-left:-260px;
    background:repeating-linear-gradient(180deg,rgba(255,214,90,.75) 0 7px,transparent 7px 24px);mask-image:linear-gradient(180deg,#000,transparent)}
  .city{position:absolute;left:0;right:0;top:560px;height:210px}
  .palm{position:absolute;bottom:-20px}
  .shade{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,rgba(10,3,24,.55) 0%,rgba(10,3,24,.15) 55%,rgba(10,3,24,.5) 100%)}
  .grid{position:absolute;left:0;right:0;bottom:0;height:0}
  .wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center}
  .logo{margin-top:52px;width:170px;height:170px;border-radius:50%;background:url("${logoUrl}") center/cover;border:5px solid #ffd400;
    box-shadow:0 0 0 5px #ff2d95,0 0 40px 10px rgba(255,45,149,.75),0 0 90px 20px rgba(255,138,61,.4)}
  .perfil{margin-top:14px;font-size:34px;color:#fff;letter-spacing:.04em;text-shadow:0 0 14px #ff2d95,0 3px 0 #2b0a4a}
  h1{margin-top:26px;font-size:104px;line-height:1;letter-spacing:.01em;text-align:center;
    background:linear-gradient(180deg,#fff7c2 0%,#ffd400 38%,#ff7a3d 70%,#ff2d95 100%);-webkit-background-clip:text;color:transparent;
    filter:drop-shadow(0 4px 0 #2b0a4a) drop-shadow(0 0 22px rgba(255,45,149,.85))}
  .btns{margin-top:54px;display:flex;gap:46px;align-items:center}
  .btn{display:flex;align-items:center;gap:20px;padding:26px 52px;border-radius:70px;font-size:50px;color:#fff;letter-spacing:.02em;white-space:nowrap}
  .b1{background:linear-gradient(90deg,#ff1e6e,#ff6a2d);border:4px solid #ffe08a;box-shadow:0 0 0 4px #2b0a4a,0 0 36px 8px rgba(255,45,149,.8),0 12px 30px rgba(0,0,0,.5);text-shadow:0 3px 0 rgba(43,10,74,.7)}
  .b2{background:linear-gradient(90deg,#3a0f7a,#8a2bd0);border:4px solid #ffd400;color:#ffd400;box-shadow:0 0 0 4px #2b0a4a,0 0 36px 8px rgba(138,43,208,.85),0 12px 30px rgba(0,0,0,.5);text-shadow:0 0 14px rgba(255,212,0,.7),0 3px 0 #1a0640}
  .btn svg{width:56px;height:56px;flex:none}
  .rod{margin-top:46px;font-size:40px;color:#fff;font-family:"Segoe UI",sans-serif;font-weight:700;padding:14px 38px;border-radius:50px;background:rgba(18,6,46,.62);border:2px solid rgba(255,255,255,.3);text-shadow:0 2px 0 #12062e}
  .rod b{color:#ffd400}
</style></head><body>
<div class="bg">
  <div class="stars"></div><div class="sun"></div>
  <svg class="city" id="city" viewBox="0 0 1960 210" preserveAspectRatio="none"></svg>
  <div class="sea"></div><div class="refl"></div>
  <svg class="palm" style="left:-70px;width:520px;height:900px" viewBox="0 0 330 560">${PALMEIRA}</svg>
  <svg class="palm" style="right:-90px;width:560px;height:960px;transform:scaleX(-1)" viewBox="0 0 330 560">${PALMEIRA}</svg>
  <svg class="palm" style="left:250px;width:300px;height:520px;bottom:-30px" viewBox="0 0 330 560">${PALMEIRA}</svg>
  <svg class="palm" style="right:250px;width:300px;height:520px;bottom:-30px;transform:scaleX(-1)" viewBox="0 0 330 560">${PALMEIRA}</svg>
</div>
<div class="shade"></div>
<div class="wrap">
  <div class="logo"></div>
  ${perfil ? `<div class="perfil">${esc(perfil)}</div>` : ''}
  <h1>${esc(cfg.titulo)}</h1>
  <div class="btns">
    <div class="btn b1"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 22a2.4 2.4 0 0 0 2.4-2.4h-4.8A2.4 2.4 0 0 0 12 22zm7-6.2V11a7 7 0 0 0-5.2-6.8V3.5a1.8 1.8 0 0 0-3.6 0v.7A7 7 0 0 0 5 11v4.8l-2 2V19h18v-1.2z"/></svg>${esc(cfg.botaoInscrever)}</div>
    <div class="btn b2"><svg viewBox="0 0 24 24" fill="#ffd400"><path d="M12 21s-7.5-4.6-9.6-9.2C1 8.600 2.800 5 6.300 5c2.100 0 3.700 1.200 5.700 3.400C14 6.200 15.600 5 17.700 5 21.200 5 23 8.600 21.600 11.800 19.500 16.400 12 21 12 21z"/></svg>${esc(cfg.botaoSeguir)}</div>
  </div>
  <div class="rod">${esc(cfg.rodape)}</div>
</div>
<script>
  // skyline de Miami: prédios em silhueta com janelas acesas em rosa, ciano e amarelo
  let s=7;const r=()=>{s=(s*16807)%2147483647;return s/2147483647};
  const svg=document.getElementById('city');let x=0,h='';
  while(x<1960){const w=50+r()*90,ht=50+r()*(x>560&&x<1400?110:150);
    h+='<rect x="'+x+'" y="'+(210-ht)+'" width="'+w+'" height="'+ht+'" fill="#12062e"/>';
    if(r()<.25)h+='<rect x="'+(x+w/2-2)+'" y="'+(210-ht-26)+'" width="4" height="26" fill="#12062e"/>';
    for(let yy=210-ht+10;yy<200;yy+=17)for(let xx=x+8;xx<x+w-10;xx+=15)if(r()<.3)h+='<rect x="'+xx+'" y="'+yy+'" width="6" height="8" fill="'+['#ff2d95','#31e1ff','#ffd400'][Math.floor(r()*3)]+'" opacity=".85"/>';
    x+=w+r()*10;}
  svg.innerHTML=h;
</script></body></html>`;
}

// Gera <saida> = vídeo + tela final. Devolve o caminho de saída (ou o original se desligada/sem navegador).
export function acrescentarTelaFinal(video, saida, {preset = 'veryfast'} = {}) {
  const c = readJson(path.join(HOME, 'config.json'), {});
  const cfg = {...DEFAULTS, ...readJson(path.join(HOME, 'tela-final.json'), {})};
  if (!cfg.ativo) return video;
  const chrome = acharChrome();
  if (!chrome) {
    console.warn('Sem Chrome/Edge para desenhar a tela final: o vídeo sai sem ela.');
    return video;
  }
  const dur = Math.max(5, Number(cfg.duracao) || 12);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'telafinal-'));
  try {
    const logo = c.logo && path.join(HOME, c.logo);
    const logoUrl = logo && fs.existsSync(logo) ? pathToFileURL(logo).href : '';
    const html = path.join(tmp, 'tela.html');
    const png = path.join(tmp, 'tela.png');
    fs.writeFileSync(html, htmlTela(cfg, logoUrl, c.profileName || ''));
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1920,1080',
      '--virtual-time-budget=2000', `--screenshot=${png}`, pathToFileURL(html).href], {stdio: 'ignore', timeout: 90000});
    if (!fs.existsSync(png)) throw new Error('Chrome não gerou a imagem da tela final');
    if (process.env.TELA_FINAL_PREVIA) fs.copyFileSync(png, process.env.TELA_FINAL_PREVIA);
    const parte = path.join(tmp, 'fim.mp4');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-t', String(dur), '-i', png,
      '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo',
      '-vf', `scale=1920:1080,fade=t=in:d=0.6,fade=t=out:st=${dur - 0.5}:d=0.5,format=yuv420p`, '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', preset, '-crf', '20', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-shortest', parte]);
    const lista = path.join(tmp, 'lista.txt');
    const f = (p) => `file '${path.resolve(p).replace(/\\/g, '/')}'`;
    fs.writeFileSync(lista, [f(video), f(parte)].join('\n'));
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', saida]);
    return saida;
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [video, saida] = process.argv.slice(2);
  if (!video) {
    console.error('Uso: node tela-final.mjs <video.mp4> [saida.mp4]');
    process.exit(1);
  }
  console.log(acrescentarTelaFinal(video, saida || video.replace(/\.mp4$/i, '') + '-final.mp4'));
}
