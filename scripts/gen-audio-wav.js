/**
 * 音效生成脚本：按 src/game/sound.ts 的合成参数，离线渲染 WAV 到 /tmp。
 * 再由 ffmpeg 转成 mp3 进 src/assets/audio/（见 README）。
 *
 * 用法：node scripts/gen-audio-wav.js
 * 输出：/tmp/gomoku-audio/*.wav
 */
const fs = require('fs');
const path = require('path');

const SR = 44100; // 采样率
const MASTER = 0.5; // 总音量，与 sound.ts 的 master.gain 一致

/** 单个音符：与 sound.ts tone() 同参数 */
function renderTone(buf, o) {
  const freq = o.freq;
  const freqEnd = o.freqEnd ?? o.freq;
  const dur = o.dur;
  const type = o.type ?? 'sine';
  const peak = o.gain ?? 0.5;
  const delay = o.delay ?? 0;
  const attack = 0.008;

  const start = Math.floor(delay * SR);
  const len = Math.floor(dur * SR);
  let phase = 0;

  for (let i = 0; i < len; i++) {
    const t = i / SR;
    // 线性插值频率，积分相位以逼近 exponentialRamp 的平滑滑音
    const f = freq + (freqEnd - freq) * (t / dur);
    phase += (2 * Math.PI * f) / SR;

    let osc;
    switch (type) {
      case 'square':
        osc = Math.sign(Math.sin(phase));
        break;
      case 'triangle':
        osc = (2 / Math.PI) * Math.asin(Math.sin(phase));
        break;
      default: // sine
        osc = Math.sin(phase);
    }

    // 指数包络：快速起音防爆音，指数衰减
    let g;
    if (t < attack) {
      g = peak * Math.exp(Math.log(peak / 0.0001) * (t / attack));
    } else {
      g = peak * Math.exp(Math.log(0.0001 / peak) * ((t - attack) / (dur - attack)));
    }
    buf[start + i] = (buf[start + i] ?? 0) + osc * g;
  }
}

/** 各音效的音符序列，镜像 sound.ts play() 的 switch */
const NOTES = {
  'place-black': [
    { freq: 200, freqEnd: 120, dur: 0.09, type: 'sine', gain: 0.6 },
    { freq: 90, dur: 0.06, type: 'triangle', gain: 0.3 },
  ],
  'place-white': [
    { freq: 320, freqEnd: 210, dur: 0.08, type: 'sine', gain: 0.55 },
    { freq: 150, dur: 0.05, type: 'triangle', gain: 0.25 },
  ],
  forbidden: [{ freq: 140, freqEnd: 90, dur: 0.18, type: 'square', gain: 0.18 }],
  undo: [{ freq: 300, freqEnd: 520, dur: 0.14, type: 'sine', gain: 0.35 }],
  win: [523.25, 659.25, 783.99, 1046.5].map((f, i) => ({
    freq: f, dur: 0.16, type: 'triangle', gain: 0.4, delay: i * 0.09,
  })),
  lose: [392, 329.63, 261.63].map((f, i) => ({
    freq: f, dur: 0.22, type: 'sine', gain: 0.32, delay: i * 0.13,
  })),
  draw: [
    { freq: 440, dur: 0.15, type: 'sine', gain: 0.3 },
    { freq: 440, dur: 0.15, type: 'sine', gain: 0.22, delay: 0.18 },
  ],
};

/** 写一个 16-bit PCM 单声道 WAV */
function writeWav(file, buf) {
  const data = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const s = Math.max(-1, Math.min(1, buf[i] * MASTER));
    data[i] = Math.round(s * 32767);
  }
  const dataSize = data.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from(data.buffer)]));
}

const outDir = '/tmp/gomoku-audio';
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const [name, notes] of Object.entries(NOTES)) {
  const total = Math.max(...notes.map((n) => (n.delay ?? 0) + n.dur)) + 0.15;
  const buf = new Float32Array(Math.ceil(total * SR)).fill(0);
  notes.forEach((n) => renderTone(buf, n));
  writeWav(path.join(outDir, `${name}.wav`), buf);
  console.log(`rendered ${name}.wav (${total.toFixed(2)}s)`);
}
console.log(`\nWAV -> ${outDir}`);
