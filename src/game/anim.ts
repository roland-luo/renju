/**
 * 棋盘动画状态：为 Canvas 渲染提供逐帧插值数据
 *
 * 与渲染解耦：BoardCanvas 每帧调用 snapshot() 拿到各点的
 * 进度 / 缩放 / 透明度，据此绘制落子弹入、胜利脉冲、禁手抖动。
 */

/** 单点动画进度 0..1 */
export interface CellAnim {
  /** 落子弹入进度（0=未出现，1=稳定） */
  place: number;
  /** 胜利连线脉冲相位（0=不脉冲） */
  winPhase: number;
}

export interface AnimSnapshot {
  /** key = `${x},${y}` */
  cells: Map<string, CellAnim>;
  /** 禁手点抖动偏移（像素比例 0..1，乘 cell 得偏移），无则为 null */
  forbiddenShake: { x: number; y: number; offset: number } | null;
}

const PLACE_MS = 180; // 落子弹入时长
const SHAKE_MS = 320; // 禁手抖动时长
const WIN_PERIOD = 900; // 胜利脉冲周期

/** 弹入缓动：回弹（轻微过冲） */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** 当前时间（毫秒）。抽出来便于测试与（可选的）外部时钟注入 */
function now(): number {
  return Date.now();
}

export class BoardAnimator {
  /** 每个落子点的开始时间 */
  private placeStart = new Map<string, number>();
  /** 禁手抖动：目标点 + 起始时间 */
  private shake: { x: number; y: number; start: number } | null = null;
  /** 胜利连线的起始时间（用于脉冲相位） */
  private winStart: number | null = null;
  private winKeys = new Set<string>();

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }

  /** 记录一次落子（开始弹入动画） */
  onPlace(x: number, y: number): void {
    this.placeStart.set(this.key(x, y), now());
    // 落新子即清除禁手抖动
    this.shake = null;
  }

  /** 触发禁手/非法落子抖动 */
  onForbidden(x: number, y: number): void {
    this.shake = { x, y, start: now() };
  }

  /** 设置胜利连线（开始脉冲）；清空传 null */
  setWinLine(points: Array<{ x: number; y: number }> | null): void {
    if (!points || points.length === 0) {
      this.winStart = null;
      this.winKeys.clear();
      return;
    }
    this.winKeys = new Set(points.map((p) => this.key(p.x, p.y)));
    this.winStart = now();
  }

  /** 清空所有动画（重开/悔棋时调用） */
  reset(): void {
    this.placeStart.clear();
    this.shake = null;
    this.winStart = null;
    this.winKeys.clear();
  }

  /** 悔棋/撤销某点：移除其弹入记录，使其立刻稳定 */
  clearCell(x: number, y: number): void {
    this.placeStart.delete(this.key(x, y));
  }

  /** 是否仍有进行中的动画（决定是否需要继续 rAF） */
  get active(): boolean {
    const t = now();
    if (this.shake && t - this.shake.start < SHAKE_MS) return true;
    if (this.winStart !== null) return true; // 胜利脉冲持续
    for (const s of this.placeStart.values()) {
      if (t - s < PLACE_MS) return true;
    }
    return false;
  }

  /** 取某一时刻的动画快照 */
  snapshot(): AnimSnapshot {
    const t = now();
    const cells = new Map<string, CellAnim>();

    for (const [k, start] of this.placeStart) {
      const raw = (t - start) / PLACE_MS;
      const place = raw >= 1 ? 1 : easeOutBack(Math.max(0, raw));
      cells.set(k, { place, winPhase: 0 });
    }

    // 胜利脉冲：对连线上的点叠加相位
    if (this.winStart !== null) {
      const phase = ((t - this.winStart) % WIN_PERIOD) / WIN_PERIOD;
      for (const k of this.winKeys) {
        const cur = cells.get(k) ?? { place: 1, winPhase: 0 };
        cur.winPhase = phase;
        cells.set(k, cur);
      }
    }

    let forbiddenShake: AnimSnapshot['forbiddenShake'] = null;
    if (this.shake) {
      const p = (t - this.shake.start) / SHAKE_MS;
      if (p < 1) {
        // 衰减正弦抖动
        const offset = Math.sin(p * Math.PI * 6) * (1 - p) * 0.28;
        forbiddenShake = { x: this.shake.x, y: this.shake.y, offset };
      } else {
        this.shake = null;
      }
    }

    return { cells, forbiddenShake };
  }
}
