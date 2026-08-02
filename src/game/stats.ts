/**
 * 对局统计：记录玩家在各难度下的胜/负/平场次
 * H5 用 localStorage 持久化；小程序用 Taro storage；均无则降级内存。
 */
import { Difficulty } from './constants';

export type Outcome = 'win' | 'lose' | 'draw';

export interface DiffStat {
  win: number;
  lose: number;
  draw: number;
}

export interface Stats {
  /** 按难度分桶 */
  byDifficulty: Record<Difficulty, DiffStat>;
  /** 总对局数 */
  total: number;
}

const KEY = 'gomoku:stats:v1';

function emptyDiff(): DiffStat {
  return { win: 0, lose: 0, draw: 0 };
}

function emptyStats(): Stats {
  return {
    byDifficulty: {
      [Difficulty.Easy]: emptyDiff(),
      [Difficulty.Medium]: emptyDiff(),
      [Difficulty.Hard]: emptyDiff(),
    },
    total: 0,
  };
}

/** 内存兜底（无存储环境时用） */
let memoryStore: Stats | null = null;

const IS_H5 = typeof window !== 'undefined' && !!(window as any).localStorage;

/** 取 Taro 存储 API（小程序环境）。H5/Node 返回 null。 */
function getTaroStorage(): { get(k: string): any; set(k: string, v: string): void } | null {
  try {
    const Taro = (globalThis as any).Taro;
    if (Taro?.getStorageSync && Taro?.setStorageSync) {
      return {
        get: (k) => Taro.getStorageSync(k),
        set: (k, v) => Taro.setStorageSync(k, v),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readRaw(): string | null {
  try {
    if (IS_H5) return window.localStorage.getItem(KEY);
    const t = getTaroStorage();
    if (t) {
      const v = t.get(KEY);
      return typeof v === 'string' && v ? v : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeRaw(s: string): void {
  try {
    if (IS_H5) {
      window.localStorage.setItem(KEY, s);
      return;
    }
    getTaroStorage()?.set(KEY, s);
  } catch {
    /* ignore */
  }
}

/** 读取统计（损坏则重置） */
export function getStats(): Stats {
  const raw = readRaw();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Stats;
      // 兜底校验结构
      if (parsed && parsed.byDifficulty && typeof parsed.total === 'number') {
        return {
          byDifficulty: {
            [Difficulty.Easy]: { ...emptyDiff(), ...parsed.byDifficulty[Difficulty.Easy] },
            [Difficulty.Medium]: { ...emptyDiff(), ...parsed.byDifficulty[Difficulty.Medium] },
            [Difficulty.Hard]: { ...emptyDiff(), ...parsed.byDifficulty[Difficulty.Hard] },
          },
          total: parsed.total,
        };
      }
    } catch {
      /* fallthrough */
    }
  }
  if (memoryStore) return memoryStore;
  return emptyStats();
}

/** 记录一局结果 */
export function recordGame(difficulty: Difficulty, outcome: Outcome): Stats {
  const s = getStats();
  s.byDifficulty[difficulty][outcome]++;
  s.total++;
  memoryStore = s;
  writeRaw(JSON.stringify(s));
  return s;
}

/** 清空统计 */
export function resetStats(): Stats {
  const s = emptyStats();
  memoryStore = s;
  writeRaw(JSON.stringify(s));
  return s;
}

/** 玩家胜率（0..1），无对局返回 0 */
export function winRate(d: DiffStat): number {
  const n = d.win + d.lose + d.draw;
  return n === 0 ? 0 : d.win / n;
}
