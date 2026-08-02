/**
 * 动画状态机与音效降级的单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BoardAnimator } from '../src/game/anim';
import { playSound, setSoundEnabled, isSoundEnabled } from '../src/game/sound';

describe('BoardAnimator 落子弹入', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('落子后进度从 0 过渡到 1', () => {
    const a = new BoardAnimator();
    a.onPlace(7, 7);
    const s0 = a.snapshot().cells.get('7,7');
    expect(s0).toBeDefined();
    expect(s0!.place).toBeGreaterThanOrEqual(0);

    // 时间推进超过弹入时长 → 稳定为 1
    vi.advanceTimersByTime(200);
    const s1 = a.snapshot().cells.get('7,7');
    expect(s1!.place).toBe(1);
  });

  it('弹入中动画处于 active', () => {
    const a = new BoardAnimator();
    a.onPlace(3, 3);
    expect(a.active).toBe(true);
    vi.advanceTimersByTime(200);
    expect(a.active).toBe(false);
  });

  it('clearCell 移除弹入记录（悔棋后立即稳定）', () => {
    const a = new BoardAnimator();
    a.onPlace(5, 5);
    a.clearCell(5, 5);
    expect(a.snapshot().cells.get('5,5')).toBeUndefined();
  });

  it('reset 清空全部', () => {
    const a = new BoardAnimator();
    a.onPlace(1, 1);
    a.onForbidden(2, 2);
    a.setWinLine([{ x: 0, y: 0 }]);
    a.reset();
    const s = a.snapshot();
    expect(s.cells.size).toBe(0);
    expect(s.forbiddenShake).toBeNull();
    expect(a.active).toBe(false);
  });
});

describe('BoardAnimator 禁手抖动', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('触发后产生偏移，超时后消失', () => {
    const a = new BoardAnimator();
    a.onForbidden(6, 6);
    vi.advanceTimersByTime(60); // 抖动中段
    const s = a.snapshot();
    expect(s.forbiddenShake).not.toBeNull();
    expect([s.forbiddenShake!.x, s.forbiddenShake!.y]).toEqual([6, 6]);

    vi.advanceTimersByTime(400); // 超过抖动时长
    expect(a.snapshot().forbiddenShake).toBeNull();
  });

  it('落子会清除进行中的抖动', () => {
    const a = new BoardAnimator();
    a.onForbidden(6, 6);
    a.onPlace(7, 7);
    expect(a.snapshot().forbiddenShake).toBeNull();
  });
});

describe('BoardAnimator 胜利脉冲', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('连线上各点带脉冲相位，保持 active', () => {
    const a = new BoardAnimator();
    a.setWinLine([
      { x: 3, y: 7 },
      { x: 4, y: 7 },
      { x: 5, y: 7 },
      { x: 6, y: 7 },
      { x: 7, y: 7 },
    ]);
    vi.advanceTimersByTime(500);
    const s = a.snapshot();
    expect(s.cells.get('4,7')!.winPhase).toBeGreaterThan(0);
    expect(a.active).toBe(true);
  });

  it('setWinLine(null) 停止脉冲', () => {
    const a = new BoardAnimator();
    a.setWinLine([{ x: 0, y: 0 }]);
    a.setWinLine(null);
    expect(a.active).toBe(false);
  });
});

describe('音效降级', () => {
  it('Node 环境（无 window）播放不抛错', () => {
    expect(() => playSound('place-black')).not.toThrow();
    expect(() => playSound('win')).not.toThrow();
  });

  it('静音开关生效', () => {
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    expect(() => playSound('place-white')).not.toThrow();
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
  });
});
