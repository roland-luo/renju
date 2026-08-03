/**
 * 音效引擎：跨端
 *
 * - H5：WebAudio 振荡器实时合成（零音频资源）
 * - 小程序：无 WebAudio，改用 InnerAudioContext 播放预置 mp3
 *   （mp3 由 scripts/gen-audio-wav.js 按下方同一组参数离线合成，两端听感一致；
 *    经 copy.patterns 原样进包，以 /assets/audio/xxx.mp3 本地路径引用——
 *    InnerAudioContext.src 不支持 base64 dataUrl）
 *
 * 设计：所有音色用正弦/三角波 + 指数衰减包络，短促干净，
 *      符合"简洁大气"的棋盘气质，不喧宾夺主。
 */
import Taro from '@tarojs/taro';

// H5 端 import（Webpack asset 处理，输出真实 URL）；小程序端用下方常量路径。
import placeBlackMp3 from '@/assets/audio/place-black.mp3';
import placeWhiteMp3 from '@/assets/audio/place-white.mp3';
import forbiddenMp3 from '@/assets/audio/forbidden.mp3';
import undoMp3 from '@/assets/audio/undo.mp3';
import winMp3 from '@/assets/audio/win.mp3';
import loseMp3 from '@/assets/audio/lose.mp3';
import drawMp3 from '@/assets/audio/draw.mp3';

export type SoundName =
  | 'place-black' // 黑子落下：低频闷响
  | 'place-white' // 白子落下：略高频脆响
  | 'forbidden' // 禁手/非法：短促低鸣
  | 'undo' // 悔棋：上行滑音
  | 'win' // 胜利：明快上行琶音
  | 'lose' // 失败：下行沉闷
  | 'draw'; // 平局：中性双音

const IS_H5 = process.env.TARO_ENV === 'h5';

/** H5：import 产物 URL；小程序：包内本地路径 */
const SOUND_SRC: Record<SoundName, string> = {
  'place-black': IS_H5 ? placeBlackMp3 : '/assets/audio/place-black.mp3',
  'place-white': IS_H5 ? placeWhiteMp3 : '/assets/audio/place-white.mp3',
  forbidden: IS_H5 ? forbiddenMp3 : '/assets/audio/forbidden.mp3',
  undo: IS_H5 ? undoMp3 : '/assets/audio/undo.mp3',
  win: IS_H5 ? winMp3 : '/assets/audio/win.mp3',
  lose: IS_H5 ? loseMp3 : '/assets/audio/lose.mp3',
  draw: IS_H5 ? drawMp3 : '/assets/audio/draw.mp3',
};

/** 是否启用（默认开，可持久化到本地） */
let enabled = true;

const STORAGE_KEY = 'gomoku:sound';

/* ---------------- 偏好持久化：Taro storage 优先，localStorage 兜底 ---------------- */

function storageGet(key: string): string | null {
  try {
    const v = Taro.getStorageSync(key);
    if (typeof v === 'string' && v) return v;
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && (window as any).localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function storageSet(key: string, value: string): void {
  try {
    Taro.setStorageSync(key, value);
    return;
  } catch {
    /* fallthrough to localStorage */
  }
  try {
    if (typeof window !== 'undefined' && (window as any).localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* ignore */
  }
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  storageSet(STORAGE_KEY, on ? '1' : '0');
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/** 启动时从本地恢复偏好 */
export function initSound(): void {
  const v = storageGet(STORAGE_KEY);
  if (v === '0') enabled = false;
  if (v === '1') enabled = true;
}

/* ---------------- H5：WebAudio 合成 ---------------- */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    typeof window !== 'undefined'
      ? (window as any).AudioContext || (window as any).webkitAudioContext
      : undefined;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5; // 总音量
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** 浏览器自动播放策略：首次交互后调用以解锁音频 */
export function unlockAudio(): void {
  if (!IS_H5) return;
  const c = getCtx();
  if (c && c.state === 'suspended') {
    c.resume().catch(() => {});
  }
}

interface ToneOpts {
  /** 起始频率 Hz */
  freq: number;
  /** 结束频率（滑音），缺省与 freq 相同 */
  freqEnd?: number;
  /** 时长秒 */
  dur: number;
  /** 波形 */
  type?: OscillatorType;
  /** 音量 0..1 */
  gain?: number;
  /** 延迟开始秒（用于琶音） */
  delay?: number;
}

/** 播放单个音符：振荡器 + 指数衰减包络 */
function tone(c: AudioContext, o: ToneOpts): void {
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.freqEnd && o.freqEnd !== o.freq) {
    osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur);
  }
  const peak = o.gain ?? 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008); // 快速起音，防爆音
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g);
  g.connect(master!);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

/** H5 音符序列（与生成脚本中 NOTES 保持一致） */
function playH5(name: SoundName): void {
  const c = getCtx();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume().catch(() => {});

  switch (name) {
    case 'place-black':
      // 低频木鱼般的"笃"
      tone(c, { freq: 200, freqEnd: 120, dur: 0.09, type: 'sine', gain: 0.6 });
      tone(c, { freq: 90, dur: 0.06, type: 'triangle', gain: 0.3 });
      break;
    case 'place-white':
      // 略高、更脆
      tone(c, { freq: 320, freqEnd: 210, dur: 0.08, type: 'sine', gain: 0.55 });
      tone(c, { freq: 150, dur: 0.05, type: 'triangle', gain: 0.25 });
      break;
    case 'forbidden':
      tone(c, { freq: 140, freqEnd: 90, dur: 0.18, type: 'square', gain: 0.18 });
      break;
    case 'undo':
      tone(c, { freq: 300, freqEnd: 520, dur: 0.14, type: 'sine', gain: 0.35 });
      break;
    case 'win':
      // 上行琶音 C5 E5 G5 C6
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone(c, { freq: f, dur: 0.16, type: 'triangle', gain: 0.4, delay: i * 0.09 })
      );
      break;
    case 'lose':
      // 下行
      [392, 329.63, 261.63].forEach((f, i) =>
        tone(c, { freq: f, dur: 0.22, type: 'sine', gain: 0.32, delay: i * 0.13 })
      );
      break;
    case 'draw':
      tone(c, { freq: 440, dur: 0.15, type: 'sine', gain: 0.3 });
      tone(c, { freq: 440, dur: 0.15, type: 'sine', gain: 0.22, delay: 0.18 });
      break;
  }
}

/* ---------------- 小程序：InnerAudioContext ---------------- */

interface MiniAudio {
  src: string;
  play(): void;
  stop(): void;
  seek(position: number): void;
  onError(cb: (e: any) => void): void;
  destroy(): void;
}

const miniPool = new Map<SoundName, MiniAudio>();

function getMiniAudio(name: SoundName): MiniAudio | null {
  const cached = miniPool.get(name);
  if (cached) return cached;
  try {
    const a = Taro.createInnerAudioContext() as unknown as MiniAudio;
    a.src = SOUND_SRC[name];
    a.onError(() => {
      // 资源缺失或解码失败：丢弃实例，下次重建
      miniPool.delete(name);
      try {
        a.destroy();
      } catch {
        /* ignore */
      }
    });
    miniPool.set(name, a);
    return a;
  } catch {
    return null;
  }
}

function playMini(name: SoundName): void {
  const a = getMiniAudio(name);
  if (!a) return;
  try {
    // 重入（连点）时先回到起点，保证每次都有声音
    if (typeof a.seek === 'function') {
      try {
        a.stop();
      } catch {
        /* ignore */
      }
      a.seek(0);
    }
    a.play();
  } catch {
    /* ignore */
  }
}

/* ---------------- 对外统一入口 ---------------- */

/** 播放音效：静音或环境不支持时静默返回 */
export function playSound(name: SoundName): void {
  if (!enabled) return;
  try {
    if (IS_H5) {
      playH5(name);
    } else {
      playMini(name);
    }
  } catch {
    /* 忽略音频异常 */
  }
}
