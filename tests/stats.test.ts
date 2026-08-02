/**
 * 对局统计单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Difficulty } from '../src/game/constants';
import { getStats, recordGame, resetStats, winRate } from '../src/game/stats';

beforeEach(() => {
  resetStats();
});

describe('对局统计', () => {
  it('初始为空', () => {
    const s = getStats();
    expect(s.total).toBe(0);
    expect(s.byDifficulty[Difficulty.Medium]).toEqual({ win: 0, lose: 0, draw: 0 });
  });

  it('记录胜负平并累加总数', () => {
    recordGame(Difficulty.Hard, 'win');
    recordGame(Difficulty.Hard, 'win');
    recordGame(Difficulty.Hard, 'lose');
    recordGame(Difficulty.Easy, 'draw');
    const s = getStats();
    expect(s.total).toBe(4);
    expect(s.byDifficulty[Difficulty.Hard]).toEqual({ win: 2, lose: 1, draw: 0 });
    expect(s.byDifficulty[Difficulty.Easy]).toEqual({ win: 0, lose: 0, draw: 1 });
  });

  it('胜率计算', () => {
    recordGame(Difficulty.Medium, 'win');
    recordGame(Difficulty.Medium, 'lose');
    recordGame(Difficulty.Medium, 'draw');
    const d = getStats().byDifficulty[Difficulty.Medium];
    expect(winRate(d)).toBeCloseTo(1 / 3);
  });

  it('无对局胜率为 0', () => {
    expect(winRate({ win: 0, lose: 0, draw: 0 })).toBe(0);
  });

  it('resetStats 清空', () => {
    recordGame(Difficulty.Easy, 'win');
    resetStats();
    expect(getStats().total).toBe(0);
  });
});
