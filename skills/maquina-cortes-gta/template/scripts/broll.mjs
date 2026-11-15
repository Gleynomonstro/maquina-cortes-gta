// Busca de B-roll LICENCIADO, na ordem de prioridade da fase 1:
//   a) mídia própria do canal (pasta com licenca.json)          → config.midiaPropria
//   b) Pexels (API oficial, PEXELS_API_KEY), Pixabay (API oficial, PIXABAY_API_KEY), Wikimedia Commons (API, sem chave)
//   c) imprensa da Rockstar: SÓ arquivos de páginas que o usuário aprovou (config.rockstarAprovadas) — não é buscado aqui
//   d) nada serviu → quem chama cria um cartão de texto
// Nunca baixa de YouTube/Twitch nem de sites sem licença. Cada resultado volta com url, autor, licença e link da licença.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Wikimedia pede um User-Agent que identifique o programa (sem dados pessoais).
const UA = 'maquina-cortes-gta/1.0 (https://github.com/pedroxcardoso/maquina-cortes-gta)';

async function download(url, dest, headers = {}) {
  const r = await fetch(url, {headers: {'User-Agent': UA, ...headers}});
  if (!r.ok) throw new Error(`HTTP ${r.status} ao baixar ${url}`);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return dest;
}

const words = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);

// a) mídia própria: arquivo cujo nome contém as palavras da busca
function propria(cfg, query) {
  const dir = cfg.midiaPropria;
  if (!dir || !fs.existsSync(dir)) return null;
  const licFile = path.join(dir, 'licenca.json');
  if (!fs.existsSync(licFile)) {
    console.warn(`Mídia própria em ${dir} ignorada: falta licenca.json (titular, permissão, data).`);
    return null;
  }
  const lic = JSON.parse(fs.readFileSync(licFile, 'utf8').replace(/^﻿/, ''));
  const q = words(query);
  const files = fs.readdirSync(dir).filter((f) => /\.(mp4|mov|webm|jpg|jpeg|png|webp)$/i.test(f));
  const best = files
    .map((f) => ({f, score: q.filter((w) => words(f).includes(w)).length}))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0];
  if (!best) return null;
  return {
    arquivo: path.join(dir, best.f),
    tipo: /\.(mp4|mov|webm)$/i.test(best.f) ? 'video' : 'imagem',
    fonte: 'midia-propria',
    url: null,
    autor: lic.titular,
    licenca: `Permissão do titular (${lic.permissao}, ${lic.data})`,
    licencaUrl: null,
  };
}

async function pexels(query, destDir, id) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8&orientation=portrait`, {headers: {Authorization: key}});
  if (!r.ok) throw new Error(`Pexels HTTP ${r.status}`);
  const j = await r.json();
  for (const v of j.videos || []) {
    const file = (v.video_files || [])
      .filter((f) => f.file_type === 'video/mp4' && f.height >= 1280)
      .sort((a, b) => a.height - b.height)[0];
    if (!file) continue;
    const dest = path.join(destDir, `${id}-pexels-${v.id}.mp4`);
    await download(file.link, dest);
    return {arquivo: dest, tipo: 'video', fonte: 'pexels', url: v.url, autor: v.user?.name, autorUrl: v.user?.url, licenca: 'Pexels License', licencaUrl: 'https://www.pexels.com/license/'};
  }
  return null;
}

async function pixabay(query, destDir, id) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  const r = await fetch(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&per_page=8&safesearch=true`);
  if (!r.ok) throw new Error(`Pixabay HTTP ${r.status}`);
  const j = await r.json();
  for (const h of j.hits || []) {
    const v = h.videos?.large?.url ? h.videos.large : h.videos?.medium;
    if (!v?.url) continue;
    const dest = path.join(destDir, `${id}-pixabay-${h.id}.mp4`);
    await download(v.url, dest);
    return {arquivo: dest, tipo: 'video', fonte: 'pixabay', url: h.pageURL, autor: h.user, licenca: 'Pixabay Content License', licencaUrl: 'https://pixabay.com/service/license-summary/'};
  }
  return null;
}

// Wikimedia Commons: só domínio público, CC0 e CC BY (sem "SA", que poderia exigir a mesma licença no vídeo inteiro)
const LIC_OK = /^(public domain|pd|cc0|cc0 1\.0|cc by \d(\.\d)?)$/i;
async function wikimedia(query, destDir, id, qualquerLicenca = false) {
  const api = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '15',
    gsrsearch: `${query} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1920',
  });
  const r = await fetch(api, {headers: {'User-Agent': UA}});
  if (!r.ok) throw new Error(`Wikimedia HTTP ${r.status}`);
  const j = await r.json();
  const pages = Object.values(j.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/image\/(jpeg|png)/.test(ii.mime) || ii.width < 800) continue;
    const m = ii.extmetadata || {};
    const lic = (m.LicenseShortName?.value || '').trim();
    if (!qualquerLicenca && !LIC_OK.test(lic)) continue;
    const autor = (m.Artist?.value || '').replace(/<[^>]+>/g, '').trim() || 'desconhecido';
    const ext = ii.mime === 'image/png' ? '.png' : '.jpg';
    const dest = path.join(destDir, `${id}-wikimedia-${p.pageid}${ext}`);
    await download(ii.thumburl || ii.url, dest);
    return {arquivo: dest, tipo: 'imagem', fonte: 'wikimedia-commons', url: ii.descriptionurl, autor, licenca: lic, licencaUrl: m.LicenseUrl?.value || null, verificada: LIC_OK.test(lic)};
  }
  return null;
}

// MODO RELAXADO (config "licencas": "relaxado", decisão do usuário): busca no YouTube um trecho curto do vídeo mais
// relevante (ex.: trailer do GTA 6). A licença NÃO é verificada; a origem fica registrada para revisão futura.
async function youtube(query, destDir, id) {
  fs.mkdirSync(destDir, {recursive: true});
  const info = spawnSync('yt-dlp', ['--no-warnings', '--no-playlist', '--print', '%(id)s\t%(duration)s\t%(channel)s\t%(webpage_url)s\t%(title)s', `ytsearch5:${query}`], {encoding: 'utf8'});
  const cands = (info.stdout || '').trim().split(/\r?\n/).map((l) => l.split('\t')).filter((c) => Number(c[1]) >= 20);
  for (const [vid, dur, canal, url, titulo] of cands) {
    // pula a abertura: pega 4 s a partir de ~30% do vídeo
    const ini = Math.max(5, Math.floor(Number(dur) * 0.3));
    const dest = path.join(destDir, `${id}-youtube-${vid}.mp4`);
    const r = spawnSync('yt-dlp', ['--no-warnings', '-q', '-f', 'bv*[height<=1080][ext=mp4]/bv*[height<=1080]/b', '--download-sections', `*${ini}-${ini + 4}`, '--force-keyframes-at-cuts', '--recode-video', 'mp4', '-o', dest, url], {encoding: 'utf8'});
    if (r.status === 0 && fs.existsSync(dest)) {
      return {arquivo: dest, tipo: 'video', fonte: 'youtube', url: `${url}&t=${ini}`, autor: canal, titulo, licenca: 'NÃO VERIFICADA (modo relaxado)', licencaUrl: null, verificada: false};
    }
  }
  return null;
}
async function wikimediaQualquer(query, destDir, id) {
  return wikimedia(query, destDir, id, true);
}

// Tenta as fontes na ordem; devolve {resultado, tentativas} (tentativas explica por que cada fonte não serviu).
export async function buscarBroll(cfg, query, destDir, id) {
  const tentativas = [];
  const relaxado = cfg.licencas === 'relaxado';
  const p = propria(cfg, query);
  if (p) return {resultado: p, tentativas};
  tentativas.push('mídia própria: nada com esse assunto');
  const ordem = relaxado
    ? [['youtube', youtube, null], ['pexels', pexels, 'PEXELS_API_KEY'], ['pixabay', pixabay, 'PIXABAY_API_KEY'], ['wikimedia', wikimediaQualquer, null]]
    : [['pexels', pexels, 'PEXELS_API_KEY'], ['pixabay', pixabay, 'PIXABAY_API_KEY'], ['wikimedia', wikimedia, null]];
  for (const [nome, fn, precisa] of ordem) {
    if (precisa && !process.env[precisa]) {
      tentativas.push(`${nome}: sem ${precisa}`);
      continue;
    }
    try {
      const res = await fn(query, destDir, id);
      if (res) return {resultado: res, tentativas};
      tentativas.push(`${nome}: nenhum resultado com licença aceita`);
    } catch (e) {
      tentativas.push(`${nome}: ${e.message}`);
    }
  }
  return {resultado: null, tentativas};
}
