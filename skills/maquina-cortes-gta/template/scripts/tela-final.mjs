#!/usr/bin/env node
// Tela de finalização para vídeos longos: acrescenta no fim "Obrigado por assistir", "Inscreva-se" e "Siga o canal".
//   node tela-final.mjs <video.mp4> [saida.mp4]
// Config em ~/.maquina-cortes-gta/tela-final.json (modelo em finalizacao/tela-final.json do repositório).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {drawtextFont, filterPath, probeDuration, readJson} from './live-comum.mjs';

const DEFAULTS = {
  ativo: true, duracao: 12, titulo: 'OBRIGADO POR ASSISTIR!', botaoInscrever: 'INSCREVA-SE NO CANAL',
  botaoSeguir: 'SIGA O CANAL', rodape: 'Deixe seu like e ative o sininho',
  corFundo: '0x0B0B14', corInscrever: '0xFF1E3C', corSeguir: '0xFFD400',
};

// Gera <saida> = vídeo + tela final. Devolve o caminho de saída (ou o original se desligada/sem fonte).
export function acrescentarTelaFinal(video, saida, {preset = 'veryfast'} = {}) {
  const HOME = path.join(os.homedir(), '.maquina-cortes-gta');
  const cfg = {...DEFAULTS, ...readJson(path.join(HOME, 'tela-final.json'), {})};
  const font = drawtextFont();
  if (!cfg.ativo || !font) {
    if (cfg.ativo) console.warn('Sem fonte para a tela final: o vídeo sai sem ela.');
    return video;
  }
  const dur = Math.max(5, Number(cfg.duracao) || 12);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'telafinal-'));
  try {
    const total = probeDuration(video);
    const frame = path.join(tmp, 'ultimo.png');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', Math.max(0, total - 0.5).toFixed(2), '-i', video, '-frames:v', '1',
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2', frame]);
    // textos por arquivo, sem expansão: qualquer caractere aparece como está
    const txt = (nome, s) => {
      const f = path.join(tmp, nome);
      fs.writeFileSync(f, s);
      return filterPath(f);
    };
    const fade = ":alpha='min(1,t/0.5)'";
    const dt = (nome, s, size, cor, y, extra = '') =>
      `drawtext=fontfile='${font}':textfile='${txt(nome, s)}':expansion=none:fontsize=${size}:fontcolor=${cor}:x=(w-text_w)/2:y=${y}${extra}${fade}`;
    const caixa = (cor) => `:box=1:boxcolor=${cor}@0.97:boxborderw=34`;
    const c = readJson(path.join(HOME, 'config.json'), {});
    const logo = c.logo && path.join(HOME, c.logo);
    const temLogo = !!(logo && fs.existsSync(logo));
    const filtros = [
      '[0:v]scale=1920:1080,boxblur=24:2,eq=brightness=-0.32:saturation=0.8,format=yuv420p[bg]',
      `[bg]drawbox=x=0:y=0:w=iw:h=ih:color=${cfg.corFundo}@0.35:t=fill,` + [
        dt('t.txt', cfg.titulo, 92, 'white', 230, ':borderw=5:bordercolor=black@0.8'),
        dt('b1.txt', cfg.botaoInscrever, 64, 'white', 480, caixa(cfg.corInscrever)),
        dt('b2.txt', cfg.botaoSeguir, 64, 'black', 680, caixa(cfg.corSeguir)),
        dt('r.txt', cfg.rodape, 44, 'white', 900, ':borderw=3:bordercolor=black@0.8'),
      ].join(',') + '[v0]',
    ];
    const entradas = ['-loop', '1', '-framerate', '30', '-t', String(dur), '-i', frame];
    let mapV = '[v0]';
    if (temLogo) {
      entradas.push('-i', logo);
      filtros.push(
        "[1:v]scale=110:110:force_original_aspect_ratio=increase,crop=110:110,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-55,Y-55),55),255,0)'[lg]",
        '[v0][lg]overlay=(W-w)/2:70[v1]',
      );
      mapV = '[v1]';
    }
    const parte = path.join(tmp, 'fim.mp4');
    execFileSync('ffmpeg', ['-y', '-v', 'error', ...entradas, '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo',
      '-filter_complex', filtros.join(';'), '-map', mapV, '-map', `${temLogo ? 2 : 1}:a`, '-c:v', 'libx264', '-preset', preset, '-crf', '21',
      '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-shortest', parte]);
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
