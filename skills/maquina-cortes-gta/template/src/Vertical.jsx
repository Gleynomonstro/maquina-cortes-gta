// Corte vertical (fase 1): o streamer SEMPRE centralizado em tela cheia, com o rosto no terço central.
// Gameplay, trailer e B-roll entram só como inserts (tela cheia por 2 a 3 s ou picture-in-picture no alto).
// Todas as posições e tempos vêm prontos do vertical.mjs; aqui só se desenha.
import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Html5Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Montserrat';

const {fontFamily} = loadFont('normal', {weights: ['700', '800', '900'], subsets: ['latin']});
const W = 1080;
const H = 1920;

// ---------- o streamer ----------
// shot.modo "cheio": recorte 9:16 em volta do rosto, ampliado até a tela toda.
// shot.modo "desfocado" (câmera pequena demais para ampliar até a tela toda sem borrar demais): a câmera inteira na
// largura da tela, com o rosto no terço central, sobre uma cópia desfocada dela mesma.
const placeVideo = (sx, sy, s, fx, fy, outX, outY, srcW, srcH) => ({
  position: 'absolute',
  width: srcW * s,
  height: srcH * s,
  left: outX - fx * s,
  top: outY - fy * s,
  objectFit: 'fill',
});

const Shot = ({shot, sourceFile, srcW, srcH, startFrame, frames}) => {
  const frame = useCurrentFrame();
  // "punch": cada plano entra com um zoom curto (6% → 0) para marcar a troca
  // sem "punch" de zoom a cada plano (o usuário achou artificial, 17/11/2026)
  const punch = shot.punch ? interpolate(frame, [0, 7], [1.06, 1], {extrapolateRight: "clamp", easing: Easing.out(Easing.cubic)}) : 1;
  const z = shot.zoom * punch;
  const {cam, faceOut} = shot;
  const fx = cam.x + cam.w * cam.rostoX;
  const fy = cam.y + cam.h * cam.rostoY;
  const video = (style, muted) => (
    <OffthreadVideo src={staticFile(sourceFile)} startFrom={startFrame} endAt={startFrame + frames} muted={muted} style={style} />
  );
  if (shot.layout === 'dividido') {
    // tela dividida (react): o streamer em cima, o que ele está vendo embaixo, no mesmo instante
    const half = H / 2;
    const st = shot.top;
    const sb = shot.bottom;
    const s = st.escala * z;
    return (
      <AbsoluteFill style={{background: '#000'}}>
        <div style={{position: 'absolute', left: 0, top: 0, width: W, height: half, overflow: 'hidden'}}>
          {video(placeVideo(0, 0, s, fx, fy, st.faceOut.x, st.faceOut.y, srcW, srcH), false)}
        </div>
        <div style={{position: 'absolute', left: 0, top: half, width: W, height: half, overflow: 'hidden'}}>
          {video(placeVideo(0, 0, sb.escala, sb.cx + (sb.panX || 0) * Math.sin((2 * Math.PI * (startFrame + frame)) / (30 * 24)), sb.cy, W / 2, half / 2, srcW, srcH), true)}
        </div>
      </AbsoluteFill>
    );
  }
  if (shot.modo === 'cheio') {
    const s = shot.escala * z;
    return <AbsoluteFill style={{overflow: 'hidden', background: '#000'}}>{video(placeVideo(0, 0, s, fx, fy, faceOut.x, faceOut.y, srcW, srcH), false)}</AbsoluteFill>;
  }
  // desfocado
  const sBg = Math.max(W / cam.w, H / cam.h) * 1.15;
  const s = shot.escala * z;
  const box = shot.caixa; // {top, height}: a faixa onde a câmera aparece nítida
  return (
    <AbsoluteFill style={{overflow: 'hidden', background: '#000'}}>
      <AbsoluteFill style={{filter: 'blur(38px) brightness(0.5) saturate(1.2)'}}>
        {video(placeVideo(0, 0, sBg, cam.x + cam.w / 2, cam.y + cam.h / 2, W / 2, H / 2, srcW, srcH), true)}
      </AbsoluteFill>
      <div style={{position: 'absolute', left: 0, top: box.top, width: W, height: box.height, overflow: 'hidden', boxShadow: '0 0 60px rgba(0,0,0,0.6)'}}>
        {video(placeVideo(0, 0, s, fx, fy, faceOut.x, faceOut.y - box.top, srcW, srcH), false)}
      </div>
    </AbsoluteFill>
  );
};

// flash rápido na virada da abertura "clímax primeiro" para o começo da sequência (o whoosh toca junto, via sfx)
const Flash = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 6], [0.85, 0], {extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{background: '#fff', opacity: o}} />;
};

// ---------- inserts ----------
const KenBurns = ({file, frames}) => {
  const frame = useCurrentFrame();
  const s = interpolate(frame, [0, frames], [1.0, 1.14]);
  const x = interpolate(frame, [0, frames], [0, -30]);
  return (
    <AbsoluteFill style={{overflow: 'hidden', background: '#000'}}>
      <AbsoluteFill style={{filter: 'blur(30px) brightness(0.45)'}}>
        <Img src={staticFile(file)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
      </AbsoluteFill>
      <Img src={staticFile(file)} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${s}) translateX(${x}px)`}} />
    </AbsoluteFill>
  );
};

const Card = ({texto, subtexto, cores, frames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 11, stiffness: 160}});
  const angle = interpolate(frame, [0, frames], [120, 200]);
  const sub = interpolate(frame, [Math.round(frames * 0.45), Math.round(frames * 0.45) + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const size = texto.length <= 8 ? 170 : texto.length <= 16 ? 118 : texto.length <= 28 ? 88 : 70;
  return (
    <AbsoluteFill style={{background: `linear-gradient(${angle}deg, ${cores[0]}, ${cores[1]})`, alignItems: 'center', justifyContent: 'center'}}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 520 + i * 260,
            height: 520 + i * 260,
            borderRadius: '50%',
            border: '6px solid rgba(255,255,255,0.12)',
            transform: `scale(${0.6 + pop * 0.5 + i * 0.05}) rotate(${frame * (i + 1)}deg)`,
          }}
        />
      ))}
      <div style={{textAlign: 'center', padding: '0 70px', transform: `scale(${0.6 + 0.4 * pop}) rotate(-2deg)`}}>
        <div style={{fontFamily, fontWeight: 900, fontSize: size, lineHeight: 1.02, color: '#fff', textTransform: 'uppercase', WebkitTextStroke: '10px #000', paintOrder: 'stroke fill'}}>
          {texto}
        </div>
        {subtexto ? (
          <div style={{marginTop: 34, opacity: sub, transform: `translateY(${(1 - sub) * 40}px)`, fontFamily, fontWeight: 800, fontSize: 52, color: '#FFD400', textTransform: 'uppercase', WebkitTextStroke: '6px #000', paintOrder: 'stroke fill'}}>
            {subtexto}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// Insert do PRÓPRIO jogo (sem som): `zoom` (aproxima numa região do que está na tela agora) ou `replay` (mostra de
// novo um momento anterior). Ocupa só a metade de baixo (modo "baixo", o streamer continua em cima) ou a tela toda.
const JogoInsert = ({ins, sourceFile, srcW, srcH, frames}) => {
  const frame = useCurrentFrame();
  const area = ins.modo === 'cheio' ? {top: 0, height: H} : {top: H / 2, height: H / 2};
  const r = ins.rect;
  // empurra o zoom devagar durante o insert (movimento contínuo, sem plano parado)
  const z = interpolate(frame, [0, frames], [ins.zoomDe || 1, ins.zoomAte || 1.12]);
  const s = Math.max(W / r.w, area.height / r.h) * z;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return (
    <div style={{position: 'absolute', left: 0, top: area.top, width: W, height: area.height, overflow: 'hidden', background: '#000'}}>
      <OffthreadVideo
        src={staticFile(sourceFile)}
        startFrom={Math.round(ins.startIn * 30)}
        muted
        style={{position: 'absolute', width: srcW * s, height: srcH * s, left: W / 2 - cx * s, top: area.height / 2 - cy * s, objectFit: 'fill'}}
      />
    </div>
  );
};

const Insert = ({ins, cores, sourceFile, srcW, srcH}) => {
  const frames = Math.max(1, Math.round(ins.dur * 30));
  const frame = useCurrentFrame();
  // entra e sai do mesmo jeito (fade curto nos dois lados); entre dois inserts colados, o script zera um dos lados
  // e o outro faz a fusão por cima
  const fi = ins.fadeIn ?? 6;
  const fo = ins.fadeOut ?? 6;
  const enter = Math.min(
    fi ? interpolate(frame, [0, fi], [0, 1], {extrapolateRight: 'clamp'}) : 1,
    fo ? interpolate(frame, [frames - fo, frames], [1, 0], {extrapolateLeft: 'clamp'}) : 1,
  );
  if (ins.tipo === 'jogo') {
    return (
      <AbsoluteFill style={{opacity: enter}}>
        <JogoInsert ins={ins} sourceFile={sourceFile} srcW={srcW} srcH={srcH} frames={frames} />
      </AbsoluteFill>
    );
  }
  if (ins.modo === 'pip') {
    return (
      <div style={{position: 'absolute', left: 48, top: 420, width: 470, height: 264, borderRadius: 22, overflow: 'hidden', border: '5px solid #fff', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', transform: `scale(${0.8 + 0.2 * enter})`, opacity: enter, transformOrigin: 'top left'}}>
        {ins.tipo === 'video' ? (
          <OffthreadVideo src={staticFile(ins.file)} startFrom={Math.round((ins.startIn || 0) * 30)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        ) : (
          <Img src={staticFile(ins.file)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        )}
      </div>
    );
  }
  // modo "baixo": B-roll só na metade de baixo (o streamer continua em cima), no lugar da tela do jogo
  if (ins.modo === 'baixo' && (ins.tipo === 'video' || ins.tipo === 'imagem')) {
    return (
      <div style={{position: 'absolute', left: 0, top: H / 2, width: W, height: H / 2, overflow: 'hidden', background: '#000', opacity: enter}}>
        {ins.tipo === 'video' ? (
          <OffthreadVideo src={staticFile(ins.file)} startFrom={Math.round((ins.startIn || 0) * 30)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        ) : (
          <Img src={staticFile(ins.file)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        )}
      </div>
    );
  }
  return (
    <AbsoluteFill style={{opacity: enter}}>
      {ins.tipo === 'video' ? (
        <AbsoluteFill style={{background: '#000'}}>
          <OffthreadVideo src={staticFile(ins.file)} startFrom={Math.round((ins.startIn || 0) * 30)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        </AbsoluteFill>
      ) : ins.tipo === 'imagem' ? (
        <KenBurns file={ins.file} frames={frames} />
      ) : (
        <Card texto={ins.texto} subtexto={ins.subtexto} cores={cores} frames={frames} />
      )}
      {ins.credito ? (
        <div style={{position: 'absolute', left: 40, bottom: 400, fontFamily, fontWeight: 700, fontSize: 22, color: 'rgba(255,255,255,0.75)'}}>{ins.credito}</div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- textos ----------
const Hook = ({texto, cor, frames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 10, stiffness: 190}});
  const out = interpolate(frame, [frames - 5, frames], [1, 0], {extrapolateLeft: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 60, right: 60, top: 470, display: 'flex', justifyContent: 'center', opacity: out}}>
      <div
        style={{
          background: cor,
          padding: '20px 34px',
          borderRadius: 18,
          transform: `scale(${0.5 + 0.5 * pop}) rotate(-2deg)`,
          fontFamily,
          fontWeight: 900,
          fontSize: texto.length > 34 ? 66 : 80,
          lineHeight: 1.04,
          color: '#000',
          textTransform: 'uppercase',
          textAlign: 'center',
          boxShadow: '0 14px 0 rgba(0,0,0,0.45)',
        }}
      >
        {texto}
      </div>
    </div>
  );
};

const Destaque = ({texto, frames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 9, stiffness: 220}});
  const out = interpolate(frame, [frames - 4, frames], [1, 0], {extrapolateLeft: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 50, right: 50, top: 520, textAlign: 'center', opacity: out, transform: `scale(${0.4 + 0.6 * pop}) rotate(3deg)`}}>
      <span style={{fontFamily, fontWeight: 900, fontSize: 104, color: '#FFD400', textTransform: 'uppercase', WebkitTextStroke: '12px #000', paintOrder: 'stroke fill'}}>{texto}</span>
    </div>
  );
};

// legenda principal: fala do streamer, palavra por palavra, palavra falada em cor de destaque (faixa do meio)
// a posição da legenda acompanha o layout do plano atual (na tela dividida ela fica na divisa)
const topAt = (faixas, ms, padrao) => (faixas.find((f) => ms >= f.startMs && ms < f.endMs) || {})[padrao] ?? null;

const Captions = ({pages, cor, faixas}) => {
  const frame = useCurrentFrame();
  const ms = (frame / 30) * 1000;
  const page = pages.find((p) => ms >= p.startMs && ms < p.endMs);
  if (!page) return null;
  const top = topAt(faixas, ms, 'legenda') ?? 1300;
  return (
    <div style={{position: 'absolute', left: 50, width: W - 100, top, transform: 'translateY(-50%)', textAlign: 'center', fontFamily, fontWeight: 900, fontSize: 88, lineHeight: 1.05, textTransform: 'uppercase', color: '#fff', WebkitTextStroke: '11px #000', paintOrder: 'stroke fill', textShadow: '0 7px 0 rgba(0,0,0,0.35)'}}>
      {page.words.map((w, i) => (
        <span key={i} style={{color: ms >= w.startMs && ms < w.endMs ? cor : '#fff', display: 'inline-block', margin: '0 11px'}}>
          {w.text}
        </span>
      ))}
    </div>
  );
};

// legenda secundária: fala do jogo/trailer traduzida, menor, em itálico, cor fria, com rótulo
const Secondary = ({items, cor, faixas}) => {
  const frame = useCurrentFrame();
  const ms = (frame / 30) * 1000;
  const it = items.find((p) => ms >= p.startMs && ms < p.endMs);
  if (!it) return null;
  const top = topAt(faixas, ms, 'secundaria') ?? 1450;
  return (
    <div style={{position: 'absolute', left: 70, right: 70, top, textAlign: 'center'}}>
      <span style={{display: 'inline-block', fontFamily, fontWeight: 800, fontSize: 24, letterSpacing: 2, color: '#0b1520', background: cor, borderRadius: 8, padding: '4px 12px', marginRight: 14, verticalAlign: 'middle'}}>
        {it.rotulo}
      </span>
      <span style={{fontFamily, fontWeight: 700, fontStyle: 'italic', fontSize: 44, lineHeight: 1.2, color: cor, WebkitTextStroke: '5px #000', paintOrder: 'stroke fill', verticalAlign: 'middle'}}>
        {it.texto}
      </span>
    </div>
  );
};

// pop-up final (últimos 5 s, embaixo): "INSCREVA-SE" e "DEIXE SEU LIKE". Entra com mola, pulsa de leve e some no fim.
const EndCta = ({frames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 10, stiffness: 170}});
  const out = interpolate(frame, [frames - 8, frames], [1, 0], {extrapolateLeft: 'clamp'});
  const pulse = 1 + 0.035 * Math.sin((frame / fps) * Math.PI * 2 * 1.2);
  const pill = {fontFamily, fontWeight: 900, fontSize: 40, lineHeight: 1, textTransform: 'uppercase', color: '#fff', WebkitTextStroke: '5px #000', paintOrder: 'stroke fill', padding: '26px 30px', borderRadius: 999, boxShadow: '0 10px 0 rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap'};
  return (
    <div style={{position: 'absolute', left: 0, right: 0, top: 1090, display: 'flex', justifyContent: 'center', opacity: out}}>
      <div style={{display: 'flex', gap: 18, alignItems: 'center', transform: `scale(${(0.4 + 0.6 * pop) * pulse})`, transformOrigin: 'center'}}>
        <div style={{...pill, background: '#FF1E3C'}}>INSCREVA-SE</div>
        <div style={{...pill, background: '#FFD400', color: '#000', WebkitTextStroke: '0px #000', textShadow: 'none'}}>
          <svg width="46" height="46" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#000" d="M2 9h4v12H2zM8 9.5l4.6-6.4c.5-.7 1.6-.3 1.6.6V9h5.2c1.3 0 2.3 1.2 2.1 2.5l-1.3 8c-.2 1-1 1.7-2 1.7H8z" />
          </svg>
          DEIXE SEU LIKE
        </div>
      </div>
    </div>
  );
};

const POS = {
  'superior-direito': {top: 150, right: 40},
  'superior-esquerdo': {top: 150, left: 40},
  'inferior-direito': {bottom: 150, right: 40},
  'inferior-esquerdo': {bottom: 150, left: 40},
};
const Watermark = ({logo, name, posicao}) => (
  <div style={{position: 'absolute', ...(POS[posicao] || POS['superior-direito']), display: 'flex', alignItems: 'center', gap: 12}}>
    {logo ? <Img src={staticFile(logo)} style={{width: 92, height: 92, borderRadius: '50%', objectFit: 'cover', border: '4px solid #fff'}} /> : null}
    <span style={{fontFamily, fontWeight: 900, fontSize: 36, textTransform: 'uppercase', color: '#fff', WebkitTextStroke: '7px #14002a', paintOrder: 'stroke fill'}}>{name}</span>
  </div>
);

export const Vertical = (p) => {
  let offset = 0;
  const totalFrames = p.shots.reduce((n, shot) => n + Math.max(1, Math.round((shot.to - shot.from) * 30)), 0);
  // pop-up de inscrição/like nos últimos 5 s (desligue com "cta": false no cortes.json, se precisar)
  const ctaFrames = p.cta === false ? 0 : Math.min(totalFrames, Math.round((p.ctaDur ?? 5) * 30));
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {p.shots.map((shot, i) => {
        const frames = Math.max(1, Math.round((shot.to - shot.from) * 30));
        const from = offset;
        offset += frames;
        return (
          <Sequence key={`s${i}`} from={from} durationInFrames={frames}>
            <Shot shot={shot} sourceFile={p.sourceFile} srcW={p.sourceWidth} srcH={p.sourceHeight} startFrame={Math.round(shot.from * 30)} frames={frames} />
            {shot.turn ? <Flash /> : null}
          </Sequence>
        );
      })}
      {p.inserts.map((ins, i) => (
        <Sequence key={`i${i}`} from={Math.round(ins.at * 30)} durationInFrames={Math.max(1, Math.round(ins.dur * 30))}>
          <Insert ins={ins} cores={p.cores.cartao} sourceFile={p.sourceFile} srcW={p.sourceWidth} srcH={p.sourceHeight} />
        </Sequence>
      ))}
      <Captions pages={p.pages} cor={p.cores.palavraAtiva} faixas={p.faixas || []} />
      <Secondary items={p.secundarias} cor={p.cores.secundaria} faixas={p.faixas || []} />
      {p.destaques.map((d, i) => (
        <Sequence key={`d${i}`} from={Math.round(d.at * 30)} durationInFrames={Math.round(d.dur * 30)}>
          <Destaque texto={d.texto} frames={Math.round(d.dur * 30)} />
        </Sequence>
      ))}
      <Sequence from={0} durationInFrames={Math.round(p.hook.dur * 30)}>
        <Hook texto={p.hook.texto} cor={p.cores.gancho} frames={Math.round(p.hook.dur * 30)} />
      </Sequence>
      {ctaFrames > 0 ? (
        <Sequence from={totalFrames - ctaFrames} durationInFrames={ctaFrames}>
          <EndCta frames={ctaFrames} />
        </Sequence>
      ) : null}
      <Watermark logo={p.watermark.logo} name={p.watermark.name} posicao={p.watermark.posicao} />
      {p.sfx.map((s, i) => (
        <Sequence key={`x${i}`} from={Math.max(0, Math.round(s.at * 30))} durationInFrames={90}>
          <Html5Audio src={staticFile(s.file)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
