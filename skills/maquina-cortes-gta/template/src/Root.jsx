import React from 'react';
import {Composition} from 'remotion';
import {SplitCut} from './SplitCut.jsx';
import {Vertical} from './Vertical.jsx';

export const FPS = 30;

// Valores de exemplo (o build.mjs sobrescreve tudo com --props).
const defaultProps = {
  totalSeconds: 5,
  segments: [{from: 0, to: 5}],
  sourceFile: 'source.mp4',
  bottomFile: 'bottom.mp4',
  bottomStart: 0,
  bottomDuration: 0,
  focus: {x: 50, y: 35},
  crop: null,
  sourceWidth: 1280,
  sourceHeight: 720,
  pages: [],
  watermark: {logo: 'logo.png', name: 'SEU PERFIL'},
};

const meta = ({props}) => ({durationInFrames: Math.max(1, Math.round(props.totalSeconds * FPS)), fps: FPS});

export const Root = () => (
  <>
    <Composition id="SplitCut" component={SplitCut} width={1080} height={1920} fps={FPS} durationInFrames={FPS * 5} defaultProps={defaultProps} calculateMetadata={meta} />
    {/* fase 1: streamer centralizado em tela cheia (props montadas pelo scripts/vertical.mjs) */}
    <Composition id="Vertical" component={Vertical} width={1080} height={1920} fps={FPS} durationInFrames={FPS * 5} defaultProps={{totalSeconds: 5, shots: [], inserts: [], pages: [], secundarias: [], destaques: [], sfx: [], hook: {texto: '', dur: 1.5}, cores: {palavraAtiva: '#FFD400', secundaria: '#9DB4D0', gancho: '#FFD400', cartao: ['#2B0A4A', '#C2185B']}, layout: {legendaTop: 1260, secundariaTop: 1420}, watermark: {logo: null, name: '', posicao: 'superior-direito'}, sourceFile: 'source.mp4', sourceWidth: 1920, sourceHeight: 1080}} calculateMetadata={meta} />
  </>
);
