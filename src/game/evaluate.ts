/**
 * 局面评分：棋型分值表 + 单点价值 + 全盘静态评分
 */
import { Board, BOARD_SIZE, Stone } from './constants';
import { getStone, inBounds } from './board';
import { opponent } from './rules';

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** 棋型分值（供评分使用） */
export const SCORE = {
  FIVE: 1000000, // 连五
  OPEN_FOUR: 100000, // 活四
  FOUR: 10000, // 冲四/眠四
  OPEN_THREE: 10000, // 活三
  THREE: 1000, // 眠三
  OPEN_TWO: 1000, // 活二
  TWO: 100, // 眠二
  ONE: 10,
} as const;

function countDir(
  board: Board,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: Stone
): number {
  let n = 0;
  let nx = x + dx;
  let ny = y + dy;
  while (inBounds(nx, ny) && board[ny][nx] === color) {
    n++;
    nx += dx;
    ny += dy;
  }
  return n;
}

function openEnd(
  board: Board,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: Stone,
  sign: 1 | -1
): boolean {
  let nx = x;
  let ny = y;
  while (inBounds(nx, ny) && board[ny][nx] === color) {
    nx += dx * sign;
    ny += dy * sign;
  }
  return inBounds(nx, ny) && board[ny][nx] === Stone.Empty;
}

/**
 * 评估在空点 (x,y) 落 color 子后的单方向棋型分
 */
function evalDirScore(
  board: Board,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: Stone
): number {
  board[y][x] = color;
  const total =
    1 +
    countDir(board, x, y, dx, dy, color) +
    countDir(board, x, y, -dx, -dy, color);
  const o1 = openEnd(board, x, y, dx, dy, color, +1);
  const o2 = openEnd(board, x, y, dx, dy, color, -1);
  const openEnds = (o1 ? 1 : 0) + (o2 ? 1 : 0);
  board[y][x] = Stone.Empty;

  if (total >= 5) return SCORE.FIVE;
  if (total === 4) {
    if (openEnds === 2) return SCORE.OPEN_FOUR;
    if (openEnds === 1) return SCORE.FOUR;
    return 0;
  }
  if (total === 3) {
    if (openEnds === 2) return SCORE.OPEN_THREE;
    if (openEnds === 1) return SCORE.THREE;
    return 0;
  }
  if (total === 2) {
    if (openEnds === 2) return SCORE.OPEN_TWO;
    if (openEnds === 1) return SCORE.TWO;
    return 0;
  }
  if (total === 1 && openEnds === 2) return SCORE.ONE;
  return 0;
}

/**
 * 单点价值：在空点 (x,y) 对 color 方的进攻得分
 */
export function evaluatePoint(
  board: Board,
  x: number,
  y: number,
  color: Stone
): number {
  if (getStone(board, x, y) !== Stone.Empty) return 0;
  let sum = 0;
  for (const [dx, dy] of DIRS) {
    sum += evalDirScore(board, x, y, dx, dy, color);
  }
  return sum;
}

/**
 * 单点综合价值：进攻 + 防守（用于初级 AI 与候选点排序）
 */
export function evaluatePointCombined(
  board: Board,
  x: number,
  y: number,
  color: Stone
): number {
  const attack = evaluatePoint(board, x, y, color);
  const defense = evaluatePoint(board, x, y, opponent(color));
  return attack + defense * 0.9;
}

/**
 * 全盘静态评分：color 方视角（正 = color 占优）
 * 供 Alpha-Beta 叶子节点使用
 */
export function evaluateBoard(board: Board, color: Stone): number {
  let myScore = 0;
  let oppScore = 0;
  const opp = opponent(color);
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== Stone.Empty) continue;
      myScore += evaluatePoint(board, x, y, color);
      oppScore += evaluatePoint(board, x, y, opp);
    }
  }
  return myScore - oppScore;
}
