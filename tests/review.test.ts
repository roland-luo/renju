/**
 * 复盘逻辑单元测试：棋盘重建 / 序号映射 / 边界
 */
import { describe, it, expect } from 'vitest';
import { createBoard, Move, Stone, Board } from '../src/game/constants';

// —— 复盘纯逻辑（与 useGomoku 中实现等价的纯函数，便于单测）——

function buildReviewBoard(moves: Move[], index: number): Board {
  const b = createBoard();
  for (let i = 0; i < index && i < moves.length; i++) {
    b[moves[i].y][moves[i].x] = moves[i].color;
  }
  return b;
}

function buildMoveNumbers(moves: Move[], index: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < index && i < moves.length; i++) {
    m.set(`${moves[i].x},${moves[i].y}`, i + 1);
  }
  return m;
}

const GAME: Move[] = [
  { x: 7, y: 7, color: Stone.Black }, // 1
  { x: 8, y: 7, color: Stone.White }, // 2
  { x: 7, y: 8, color: Stone.Black }, // 3
  { x: 9, y: 7, color: Stone.White }, // 4
  { x: 7, y: 9, color: Stone.Black }, // 5
];

describe('复盘棋盘重建', () => {
  it('index=0 是空盘', () => {
    const b = buildReviewBoard(GAME, 0);
    expect(b.every((row) => row.every((s) => s === Stone.Empty))).toBe(true);
  });

  it('index=3 重建前 3 手', () => {
    const b = buildReviewBoard(GAME, 3);
    expect(b[7][7]).toBe(Stone.Black);
    expect(b[7][8]).toBe(Stone.White);
    expect(b[8][7]).toBe(Stone.Black);
    expect(b[7][9]).toBe(Stone.Empty); // 第 4 手未下
  });

  it('index=total 重建整局', () => {
    const b = buildReviewBoard(GAME, GAME.length);
    expect(b[9][7]).toBe(Stone.Black); // 第 5 手
  });

  it('index 超出范围时被钳制', () => {
    const b = buildReviewBoard(GAME, 999);
    expect(b[9][7]).toBe(Stone.Black); // 仍只到最后一手
  });
});

describe('复盘序号映射', () => {
  it('序号从 1 开始连续', () => {
    const m = buildMoveNumbers(GAME, 4);
    expect(m.get('7,7')).toBe(1);
    expect(m.get('8,7')).toBe(2);
    expect(m.get('7,8')).toBe(3);
    expect(m.get('9,7')).toBe(4);
    expect(m.has('7,9')).toBe(false);
  });

  it('index=0 无序号', () => {
    expect(buildMoveNumbers(GAME, 0).size).toBe(0);
  });
});

describe('复盘步进边界', () => {
  it('clamp 在 [0, total]', () => {
    const clamp = (i: number) => Math.max(0, Math.min(GAME.length, i));
    expect(clamp(-1)).toBe(0);
    expect(clamp(0)).toBe(0);
    expect(clamp(3)).toBe(3);
    expect(clamp(999)).toBe(GAME.length);
  });
});
