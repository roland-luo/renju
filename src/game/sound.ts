/**
 * 音效引擎：程序化合成（零音频资源，跨端可用）
 *
 * - H5：WebAudio 振荡器实时合成（落子/胜负/禁手/悔棋）
 * - 小程序：无 WebAudio，优雅降级为静音（不抛错）
 *
 * 设计：所有音色用正弦/三角波 + 指数衰减包络，短促干净，
 *      符合"简洁大气"的棋盘气质，不喧宾夺主。
 */

export type SoundName =
  | 'place-black' // 黑子落下：低频闷响
  | 'place-white' // 白子落下：略高频脆响
  | 'forbidden' // 禁手/非法：短促低鸣
  | 'undo' // 悔棋：上行滑音
  | 'win' // 胜利：明快上行琶音
  | 'lose' // 失败：下行沉闷
  | 'draw'; // 平局：中性双音

/** 是否启用（默认开，可持久化到本地） */
let enabled = true;

/** WebAudio 上下文（懒创建，需用户手势后 resume） */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

const IS_H5 = typeof window !== 'undefined';

function getCtx(): AudioContext | null {
  if (!IS_H5) return null;
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    (window as any).AudioContext || (window as any).webkitAudioContext;
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
  const c = getCtx();
  if (c && c.state === 'suspended') {
    c.resume().catch(() => {});
  }
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    if (IS_H5 && (window as any).localStorage) {
      window.localStorage.setItem('gomoku:sound', on ? '1' : '0');
    }
  } catch {}
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/** 启动时从本地恢复偏好 */
export function initSound(): void {
  try {
    if (IS_H5 && (window as any).localStorage) {
      const v = window.localStorage.getItem('gomoku:sound');
      if (v === '0') enabled = false;
      if (v === '1') enabled = true;
    }
  } catch {}
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

/** 音符序列 */
function play(name: SoundName): void {
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

/** 对外统一入口：静音或环境不支持时静默返回 */
export function playSound(name: SoundName): void {
  if (!enabled) return;
  try {
    play(name);
  } catch {
    /* 忽略音频异常 */
  }
}
