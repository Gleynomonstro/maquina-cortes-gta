#!/usr/bin/env node
// Lê o chat de um canal da Twitch como VISITANTE ANÔNIMO (IRC por WebSocket, usuário "justinfan"), só leitura.
// Não usa credenciais nem a API Helix: é a mesma conexão que qualquer pessoa deslogada usa para ver o chat.
// Guarda só o horário (do servidor da Twitch) e o texto de cada mensagem, sem o nome de quem mandou.
//
//   node chat-irc.mjs <login_do_canal> <pasta_da_live>
//
// Saída: <pasta>/chat.jsonl (uma linha por mensagem: {"t": chegada no relógio do PC, "ts": hora do servidor, "texto"})
// e <pasta>/chat-status.json.
// Para quando existir <pasta>/PARAR ou quando a captura (gravacao.json) terminar. Se a conexão cair, registra o erro
// em chat-status.json e termina (não reconecta sozinho).
import fs from 'node:fs';
import path from 'node:path';

const [canal, live] = process.argv.slice(2);
if (!canal || !live) {
  console.error('Uso: node chat-irc.mjs <login_do_canal> <pasta_da_live>');
  process.exit(1);
}
fs.mkdirSync(live, {recursive: true});
const out = fs.createWriteStream(path.join(live, 'chat.jsonl'), {flags: 'a'});
const statusFile = path.join(live, 'chat-status.json');
const status = {canal, conectado: false, mensagens: 0, inicio: new Date().toISOString(), erro: null};
const save = () => fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
save();

const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
let encerrando = false;
const fim = (erro) => {
  if (encerrando) return;
  encerrando = true;
  status.conectado = false;
  status.erro = erro || null;
  status.fim = new Date().toISOString();
  save();
  try {
    ws.close();
  } catch {}
  out.end(() => process.exit(erro ? 1 : 0));
};
ws.addEventListener('open', () => {
  ws.send('CAP REQ :twitch.tv/tags');
  ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 89999)}`);
  ws.send(`JOIN #${canal.toLowerCase()}`);
});
ws.addEventListener('message', (ev) => {
  for (const line of String(ev.data).split('\r\n')) {
    if (!line) continue;
    if (line.startsWith('PING')) {
      ws.send(line.replace('PING', 'PONG'));
      continue;
    }
    if (/ 366 /.test(line)) {
      status.conectado = true;
      save();
      console.log(`> Lendo o chat de #${canal} (anônimo)`);
    }
    const m = line.match(/^@([^ ]+) :[^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
    if (!m) continue;
    const tags = Object.fromEntries(m[1].split(';').map((kv) => kv.split('=')));
    // `t` = hora de CHEGADA pelo relógio deste PC (o mesmo relógio da gravação, para cruzar com o vídeo);
    // `ts` = hora do servidor da Twitch (pode divergir se o relógio do PC estiver errado)
    out.write(JSON.stringify({t: Date.now(), ts: Number(tags['tmi-sent-ts']) || null, texto: m[2]}) + '\n');
    status.mensagens++;
  }
});
ws.addEventListener('close', () => fim(encerrando ? null : 'conexão com o chat fechada pela Twitch'));
ws.addEventListener('error', (e) => fim(`erro na conexão do chat: ${e.message || 'desconhecido'}`));
setInterval(() => {
  save();
  let ativo = true;
  try {
    ativo = JSON.parse(fs.readFileSync(path.join(live, 'gravacao.json'), 'utf8')).ativo !== false;
  } catch {}
  if (fs.existsSync(path.join(live, 'PARAR')) || !ativo) fim(null);
}, 3000);
