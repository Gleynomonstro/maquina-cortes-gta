#!/usr/bin/env node
// Apaga do disco o que já foi processado de um bloco (aprovado ou descartado), para não acumular GB durante a live.
//
//   node limpar.mjs <pasta_da_live> <bloco>          ex.: node limpar.mjs lives/canal bloco-004
//
// Remove: trabalho/<bloco>/ (source.mp4, áudio, transcrição, props) e blocos/<bloco>.ts — este só quando o bloco
// SEGUINTE já foi preparado (ele usa o fim deste como sobreposição) ou quando a captura terminou.
// Os cortes prontos ficam em <pasta_da_live>/cortes/ e não são tocados. A duração do bloco continua em blocos.json,
// então a linha do tempo da live não muda.
import fs from 'node:fs';
import path from 'node:path';

const [live, bloco] = process.argv.slice(2);
if (!live || !bloco) {
  console.error('Uso: node limpar.mjs <pasta_da_live> <bloco>');
  process.exit(1);
}
const read = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const estado = read(path.join(live, 'estado.json'), {preparados: []});
const ativo = read(path.join(live, 'gravacao.json'), {}).ativo;
const n = Number(bloco.match(/\d+/)[0]);
const seguinte = `bloco-${String(n + 1).padStart(3, '0')}`;
const liberado = !ativo || estado.preparados.includes(seguinte);
const tamanho = (p) => (fs.existsSync(p) ? (fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((t, f) => t + tamanho(path.join(p, f)), 0) : fs.statSync(p).size) : 0);

let liberou = 0;
const trab = path.join(live, 'trabalho', bloco);
liberou += tamanho(trab);
fs.rmSync(trab, {recursive: true, force: true});
const ts = path.join(live, 'blocos', `${bloco}.ts`);
if (liberado) {
  liberou += tamanho(ts);
  fs.rmSync(ts, {force: true});
}
console.log(JSON.stringify({bloco, apagouTrabalho: true, apagouBloco: liberado, motivoMantido: liberado ? null : `${seguinte} ainda precisa do fim deste bloco`, liberadoMB: Math.round(liberou / 1e6)}));
