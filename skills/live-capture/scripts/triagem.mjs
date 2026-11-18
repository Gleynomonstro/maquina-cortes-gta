#!/usr/bin/env node
// TRIAGEM AUTOMÁTICA da live: roda sozinha, em segundo plano, junto com a captura, sem esperar o Claude.
// Para cada bloco que fecha: prepara + transcreve (TODOS os blocos), mede a energia (sinais.mjs), acha os momentos,
// escreve um RASCUNHO de corte para cada um e já renderiza os mais fortes. O Claude depois só revisa.
//
//   node triagem.mjs <pasta_da_live> <config_do_canal.json> [--layout layout.json] [--sobreposicao 40]
//                    [--retencao 30] [--sem-render]
//
// Segurança para NÃO perder momento:
//   - todo bloco é transcrito e analisado (nada é pulado por pré-filtro);
//   - limite baixo para virar candidato (energia ≥ 4, ou rótulo de emoção com energia ≥ 3, ou rajada de chat);
//   - momentos que cruzam blocos são pegos pela sobreposição (40 s) e deduplicados pelo horário da live;
//   - TUDO fica registrado em triagem/log.md e triagem/<bloco>.json, inclusive o que não virou corte e por quê;
//   - blocos brutos só são apagados depois de `--retencao` minutos (padrão 30) e com os renders do bloco prontos;
//     transcrição, sinais e rascunhos ficam para sempre;
//   - a VOD da Twitch continua sendo a rede de segurança final (qualquer trecho pode ser buscado depois).
//
// Saídas: <live>/cortes/rascunhos/ (nota estimada 7+, renderizados na hora), <live>/cortes/reserva/ (nota 5–6,
// renderizados quando a fila esvazia), <live>/triagem/log.md, <live>/triagem/momentos.json, <live>/triagem/<bloco>.json.
// Para quando a captura termina (gravacao.json ativo=false) e não há mais blocos nem renders pendentes.
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
const [live, canalFile] = args;
if (!live || !canalFile) {
  console.error('Uso: node triagem.mjs <pasta_da_live> <config_do_canal.json> [--layout layout.json] [--sobreposicao 40] [--retencao 30] [--sem-render]');
  process.exit(1);
}
const opt = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const overlap = Number(opt('--sobreposicao', 40));
const retencaoMin = Number(opt('--retencao', 30));
const semRender = args.includes('--sem-render');
const layout = opt('--layout') ? JSON.parse(fs.readFileSync(opt('--layout'), 'utf8')) : null;
const S = path.dirname(fileURLToPath(import.meta.url));
const E = path.join(os.homedir(), '.maquina-cortes-gta', 'engine', 'scripts');
const T = path.join(live, 'triagem');
fs.mkdirSync(T, {recursive: true});
const canal = JSON.parse(fs.readFileSync(canalFile, 'utf8').replace(/^﻿/, ''));
const read = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const mmss = (s) => `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const agora = () => new Date().toLocaleTimeString('pt-BR');
const log = (linha) => {
  fs.appendFileSync(path.join(T, 'log.md'), linha + '\n');
  console.log(linha);
};
const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const momentosF = path.join(T, 'momentos.json');
const momentos = read(momentosF, []);

// ---------- fila de render (1 de cada vez; prioritários primeiro)
const filaRender = [];
const pendentesPorBloco = {};
let renderizando = false;
function proximoRender(ocioso) {
  if (renderizando || semRender) return;
  const i = filaRender.findIndex((r) => r.prioridade || ocioso);
  if (i < 0) return;
  const r = filaRender.splice(i, 1)[0];
  renderizando = true;
  const out = path.join(live, 'cortes', r.prioridade ? 'rascunhos' : 'reserva');
  fs.mkdirSync(out, {recursive: true});
  const t0 = Date.now();
  const p = spawn(process.execPath, [path.join(E, 'vertical.mjs'), r.work, canalFile, out, '--clip', r.id], {stdio: ['ignore', 'pipe', 'pipe']});
  // render com prioridade BAIXA (os processos filhos, como o Chrome do Remotion, herdam no Windows): a transcrição do
  // próximo bloco sempre tem preferência e a fila não acumula atraso
  try {
    os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {}
  let txt = '';
  p.stdout.on('data', (d) => (txt += d));
  p.on('exit', (code) => {
    renderizando = false;
    pendentesPorBloco[r.bloco] = (pendentesPorBloco[r.bloco] || 1) - 1;
    const meta = read(path.join(out, `${r.id}.json`), null);
    const atraso = meta?.live?.atrasoSegundos;
    log(`- ${agora()} 🎬 **${r.id}** ${code === 0 || code === 2 ? 'renderizado' : 'FALHOU no render'} em ${Math.round((Date.now() - t0) / 1000)} s → \`${path.relative(live, path.join(out, r.id + '.mp4'))}\`${atraso ? ` · pronto ${Math.floor(atraso / 60)} min ${atraso % 60} s depois do momento` : ''}${meta && !meta.checagem?.aprovado ? ' · checagem: ' + (meta.checagem?.falhas || []).join(' ') : ''}`);
    proximoRender(filaRender.every((x) => !x.prioridade));
  });
}

// ---------- montar o rascunho de corte de um momento
function rascunho(m, bloco, work, words, sinais, idx) {
  // o whisper às vezes devolve palavras fora de ordem ou com fim antes do início: ordena e corrige
  const ws = words
    .filter((w) => !/^[[(]/.test(w.text.trim()))
    .map((w) => ({...w, s: w.startMs / 1000, e: Math.max(w.endMs, w.startMs + 50) / 1000}))
    .sort((a, b) => a.s - b.s);
  // começo: ~8 s antes do momento (o gatilho), recuado até o início da frase
  let start = Math.max(0, m.ini - 8);
  const antes = ws.filter((w) => w.s < start && w.s > start - 7);
  for (let i = antes.length - 1; i >= 0; i--) {
    const prev = ws[ws.indexOf(antes[i]) - 1];
    if (!prev || antes[i].s - prev.e >= 0.6) {
      start = Math.max(0, antes[i].s - 0.1);
      break;
    }
  }
  // fim: ~5 s depois, estendido até a frase terminar (pausa ≥ 0,8 s), no máximo +12 s
  let end = Math.min(bloco.duracao, m.fim + 5);
  const depois = ws.filter((w) => w.s >= end - 1 && w.s < end + 12);
  for (let i = 0; i < depois.length; i++) {
    const nx = depois[i + 1];
    if (!nx || nx.s - depois[i].e >= 0.8) {
      end = Math.min(bloco.duracao, depois[i].e + 0.3);
      break;
    }
  }
  if (end - start < 18) {
    const falta = 18 - (end - start);
    start = Math.max(0, start - falta / 2);
    end = Math.min(bloco.duracao, end + falta / 2);
  }
  if (end - start > 55) end = start + 55;
  // gameplay sem fala antes do momento (a ação que leva à reação) fica inteira
  const falaAntes = ws.some((w) => w.s >= start && w.s < m.ini);
  const trechos = falaAntes ? null : [{inicio: start, fim: m.ini, inteiro: true}, {inicio: m.ini, fim: end}];
  // abertura: clímax primeiro só quando o pico é forte e está longe do começo; senão, ação direta
  const pico = m.janelaPico;
  const wPico = ws.find((w) => w.s >= pico.s && w.s < pico.fim);
  const climax = pico.energia >= 7 && pico.s - start >= 6 && wPico;
  const abertura = climax
    ? {tipo: 'climax', inicio: wPico.s - 0.1, fim: Math.min(wPico.s + 1.8, pico.fim + 1), porque: `Rascunho automático: pico de energia ${pico.energia} a ${(pico.s - start).toFixed(0)} s do começo.`}
    : {tipo: 'acao', porque: `Rascunho automático: o corte começa no gatilho do momento (pico de energia ${pico.energia}).`};
  // gancho e título PROVISÓRIOS (o Claude reescreve na revisão, no tom da skill resenha-ptbr)
  const frase = (pico.texto || m.texto || '').replace(/\[[^\]]*\]/g, '').replace(/["“”]/g, '').trim();
  const gancho = frase.split(/\s+/).slice(0, 6).join(' ').replace(/[.,!?…]+$/, '').toUpperCase() || 'MOMENTO DA LIVE';
  const nomeCanal = canal.nome?.split(/[ (]/)[0] || 'streamer';
  const titulo = `${nomeCanal}: "${frase.slice(0, 60 - nomeCanal.length - 5).trim()}"`.slice(0, 60);
  const id = `t${bloco.bloco.replace(/\D/g, '')}-${idx + 1}-${slug(gancho) || 'momento'}`;
  return {
    id, start, end, ...(trechos ? {trechos} : {}), gancho, abertura, inserts: [], nota: m.nota, reserva: m.nota < 7,
    metadados: {
      titulo, descricao: 'RASCUNHO automático da triagem: revisar gancho, título e recorte.',
      hashtags: canal.hashtags || [`#${slug(nomeCanal).replace(/-/g, '')}`, '#twitch', '#gamer', '#clips', '#cortes'],
      justificativa: `Triagem automática: energia máx. ${m.energia} [${m.rotulos.join(', ') || 'sem rótulo'}], ${m.janelas} janela(s) de 5 s, nota estimada ${m.nota}.`,
    },
  };
}

// ---------- analisar um bloco preparado
function analisarBloco(info) {
  const work = info.trabalho;
  const bloco = read(path.join(work, 'bloco.json'), info);
  const r = spawnSync(process.execPath, [path.join(S, 'sinais.mjs'), live, work, '--json'], {encoding: 'utf8', maxBuffer: 1 << 26});
  let sinais;
  try {
    sinais = JSON.parse(r.stdout);
  } catch {
    log(`- ${agora()} ⚠️ ${bloco.bloco}: sinais.mjs falhou (${(r.stderr || '').slice(0, 200)}); bloco mantido para revisão manual`);
    return;
  }
  const words = read(path.join(work, 'captions.json'), []);
  const chatAlto = Math.max(sinais.chatBase * 2, sinais.chatBase + 8);
  const cand = sinais.janelas.map((j) => j.energia >= 4 || (j.energia >= 3 && j.rotulos.some((x) => x !== 'morno')) || j.chat >= chatAlto);
  // junta janelas candidatas vizinhas (tolera 1 janela fria no meio) num momento
  const grupos = [];
  sinais.janelas.forEach((j, i) => {
    if (!cand[i]) return;
    const g = grupos[grupos.length - 1];
    if (g && i - g.ultimo <= 2) {
      g.js.push(j);
      g.ultimo = i;
    } else grupos.push({js: [j], ultimo: i});
  });
  const novos = [];
  for (const g of grupos) {
    const pico = g.js.reduce((a, b) => (b.energia > a.energia ? b : a));
    const energia = pico.energia;
    const nota = Math.max(0, Math.min(10, Math.round(energia * 0.9 + 1.5 + 0.3 * Math.min(3, g.js.length - 1))));
    const m = {
      bloco: bloco.bloco, ini: g.js[0].s, fim: g.js[g.js.length - 1].fim, energia, nota, janelas: g.js.length, janelaPico: pico,
      rotulos: [...new Set(g.js.flatMap((j) => j.rotulos).filter((x) => x !== 'morno'))],
      texto: g.js.map((j) => j.texto).join(' ').trim(),
      liveIni: bloco.offset + g.js[0].s, liveFim: bloco.offset + g.js[g.js.length - 1].fim,
    };
    // dedupe pelo horário da live (o mesmo momento aparece em dois blocos por causa da sobreposição)
    const dup = momentos.find((x) => Math.min(x.liveFim, m.liveFim) - Math.max(x.liveIni, m.liveIni) > 0.4 * (m.liveFim - m.liveIni));
    if (dup) {
      m.status = `duplicado de ${dup.id || dup.bloco}`;
      if (m.energia <= dup.energia) {
        novos.push(m);
        continue;
      }
      dup.status = `substituído por versão de ${m.bloco} (energia maior)`;
    }
    novos.push(m);
  }
  // decide e escreve
  const clips = [];
  let idx = 0;
  for (const m of novos.filter((x) => !x.status?.startsWith('duplicado')).sort((a, b) => b.energia - a.energia)) {
    if (m.nota < 5) {
      m.status = 'não gerado (nota estimada < 5)';
      continue;
    }
    const c = rascunho(m, bloco, work, words, sinais, idx++);
    m.id = c.id;
    m.status = c.reserva ? 'reserva (nota 5–6)' : 'prioridade (nota 7+)';
    clips.push(c);
  }
  momentos.push(...novos.map(({janelaPico, ...x}) => x));
  fs.writeFileSync(momentosF, JSON.stringify(momentos, null, 2));
  fs.writeFileSync(path.join(T, `${bloco.bloco}.json`), JSON.stringify({bloco: bloco.bloco, offset: bloco.offset, momentos: novos.map(({janelaPico, ...x}) => x), janelas: sinais.janelas}, null, 2));
  if (clips.length) {
    const grav = read(path.join(live, 'gravacao.json'), {});
    fs.writeFileSync(path.join(work, 'cortes.json'), JSON.stringify({origem: {url: `https://www.twitch.tv/${grav.canal || ''}`}, live: {inicioGravacao: grav.inicio, offset: bloco.offset}, ...(layout ? {layoutOrigem: layout} : {}), clips}, null, 2));
    pendentesPorBloco[bloco.bloco] = clips.length;
    for (const c of clips) filaRender.push({id: c.id, work, bloco: bloco.bloco, prioridade: !c.reserva});
  }
  const resumo = novos.length
    ? novos.map((m) => `  - live ${mmss(m.liveIni)}–${mmss(m.liveFim)} · energia ${m.energia} · nota ~${m.nota} · [${m.rotulos.join(', ') || '—'}] · **${m.status}** · "${m.texto.slice(0, 90)}"`).join('\n')
    : '  - nenhum momento (bloco morno: fica só no vídeo longo)';
  log(`### ${agora()} · ${bloco.bloco} (live ${mmss(bloco.offset)}–${mmss(bloco.offset + bloco.duracao)})\n${resumo}`);
}

// ---------- retenção: apaga brutos antigos (mantém análise, transcrição e rascunhos)
function limparAntigos(ultimoOffset) {
  const est = read(path.join(live, 'estado.json'), {preparados: []});
  for (const b of est.preparados) {
    const bj = read(path.join(live, 'trabalho', b, 'bloco.json'), null);
    if (!bj || ultimoOffset - bj.offset < retencaoMin * 60 || (pendentesPorBloco[b] || 0) > 0) continue;
    for (const f of ['source.mp4', 'audio16k.wav']) fs.rmSync(path.join(live, 'trabalho', b, f), {force: true});
    fs.rmSync(path.join(live, 'blocos', `${b}.ts`), {force: true});
  }
}

// ---------- laço principal
log(`\n## ${agora()} · triagem iniciada (sobreposição ${overlap} s, retenção ${retencaoMin} min${semRender ? ', sem render' : ''})`);
for (;;) {
  const r = spawnSync(process.execPath, [path.join(E, 'live-bloco.mjs'), live, '--sobreposicao', String(overlap), '--esperar', '60'], {encoding: 'utf8', maxBuffer: 1 << 26});
  const ultima = (r.stdout || '').trim().split('\n').pop();
  let info;
  try {
    info = JSON.parse(ultima);
  } catch {
    log(`- ${agora()} ⚠️ live-bloco falhou: ${(r.stderr || ultima || '').slice(0, 300)} — triagem PARADA (avise o usuário)`);
    process.exit(1);
  }
  if (info.fim) {
    log(`- ${agora()} captura encerrada; esperando ${filaRender.length + (renderizando ? 1 : 0)} render(s) pendente(s)`);
    break;
  }
  if (info.aguardando) {
    proximoRender(true); // fila vazia de blocos: aproveita para renderizar reservas
    await new Promise((res) => setTimeout(res, 5000));
    continue;
  }
  if (info.atrasando) log(`- ${agora()} ⚠️ ${info.bloco}: transcrição mais lenta que o bloco (${info.transcricaoSegundos} s)`);
  analisarBloco(info);
  proximoRender(false);
  limparAntigos(info.offset);
}
// termina a fila (inclusive reservas) antes de sair
await new Promise((res) => {
  const tick = () => {
    if (!renderizando && !filaRender.length) return res();
    proximoRender(true);
    setTimeout(tick, 3000);
  };
  tick();
});
log(`## ${agora()} · triagem encerrada: ${momentos.filter((m) => m.id).length} rascunhos (${momentos.filter((m) => m.status?.startsWith('prioridade')).length} prioritários, ${momentos.filter((m) => m.status?.startsWith('reserva')).length} reservas), ${momentos.length} momentos registrados`);
