/**
 * AI：三档难度
 * - 初级 Easy：贪心单点评分（进攻+防守），带随机扰动
 * - 中级 Medium：Minimax + Alpha-Beta 剪枝，深度2
 * - 高级 Hard：Alpha-Beta 深度4 + 必胜/必防快速通道 + 候选点裁剪排序
 *
 * AI 执黑时规避禁手点。
 */
import { Board, BOARD_SIZE, Difficulty, Move, Stone } from './constants';
import { cloneBoard, centerPoint, inBounds } from './board';
import { checkForbidden, isWinAt, opponent } from './rules';
import {
  evaluateBoard,
  evaluatePointCombined,
  SCORE,
} from './evaluate';

/** 候选点搜索半径（已有棋子周围 R 格内的空点） */
const CANDIDATE_RADIUS = 2;
/** Alpha-Beta 每层最多考虑的候选点数 */
const MAX_BRANCH = 12;

function hasNeighbor(board: Board, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny) && board[ny][nx] !== Stone.Empty) return true;
    }
  }
  return false;
}

interface Candidate {
  x: number;
  y: number;
  score: number;
}

/** 生成候选点（已有棋子邻近的空点），按综合价值降序 */
function getCandidates(board: Board, color: Stone): Candidate[] {
  const list: Candidate[] = [];
  let anyStone = false;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== Stone.Empty) {
        anyStone = true;
        continue;
      }
      if (!hasNeighbor(board, x, y, CANDIDATE_RADIUS)) continue;
      // 黑棋规避禁手
      if (color === Stone.Black && checkForbidden(board, x, y, color)) {
        continue;
      }
      list.push({ x, y, score: evaluatePointCombined(board, x, y, color) });
    }
  }
  // 空棋盘：天元
  if (!anyStone) {
    const c = centerPoint();
    return [{ x: c.x, y: c.y, score: 0 }];
  }
  list.sort((a, b) => b.score - a.score);
  return list;
}

/** 快速通道：找立即成五的点 */
function findWinningMove(board: Board, color: Stone): Move | null {
  const cands = getCandidates(board, color);
  for (const c of cands) {
    board[c.y][c.x] = color;
    const win = isWinAt(board, c.x, c.y);
    board[c.y][c.x] = Stone.Empty;
    if (win) return { x: c.x, y: c.y, color };
  }
  return null;
}

/** 初级 AI：贪心 + 随机扰动 */
function easyMove(board: Board, color: Stone): Move | null {
  const cands = getCandidates(board, color);
  if (cands.length === 0) return null;
  // 取前若干名做随机，保证变化
  const top = cands.slice(0, Math.min(5, cands.length));
  // 80% 取最优，20% 在前几名里随机
  const pick =
    Math.random() < 0.8
      ? top[0]
      : top[Math.floor(Math.random() * top.length)];
  return { x: pick.x, y: pick.y, color };
}

/** Alpha-Beta 搜索 */
function alphaBeta(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  aiColor: Stone
): number {
  const current = maximizing ? aiColor : opponent(aiColor);

  // 终端：有人刚赢（在上一层落子时已判），这里用评分兜底
  if (depth === 0) {
    return evaluateBoard(board, aiColor);
  }

  const cands = getCandidates(board, current).slice(0, MAX_BRANCH);
  if (cands.length === 0) return evaluateBoard(board, aiColor);

  if (maximizing) {
    let value = -Infinity;
    for (const c of cands) {
      board[c.y][c.x] = current;
      // 直接成五：极大值
      if (isWinAt(board, c.x, c.y)) {
        board[c.y][c.x] = Stone.Empty;
        return SCORE.FIVE + depth; // 越快赢越好
      }
      const score = alphaBeta(board, depth - 1, alpha, beta, false, aiColor);
      board[c.y][c.x] = Stone.Empty;
      value = Math.max(value, score);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  } else {
    let value = Infinity;
    for (const c of cands) {
      board[c.y][c.x] = current;
      if (isWinAt(board, c.x, c.y)) {
        board[c.y][c.x] = Stone.Empty;
        return -(SCORE.FIVE + depth);
      }
      const score = alphaBeta(board, depth - 1, alpha, beta, true, aiColor);
      board[c.y][c.x] = Stone.Empty;
      value = Math.min(value, score);
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }
}

/** 中/高级 AI：Alpha-Beta */
function searchMove(
  board: Board,
  color: Stone,
  depth: number
): Move | null {
  // 快速通道：能赢直接赢
  const win = findWinningMove(board, color);
  if (win) return win;
  // 必防：对手能赢则堵
  const oppWin = findWinningMove(board, opponent(color));
  if (oppWin) {
    // 若堵点本身是黑棋禁手点则仍需堵（堵四优先），但黑棋堵点一般不冲突
    return { x: oppWin.x, y: oppWin.y, color };
  }

  const cands = getCandidates(board, color).slice(0, MAX_BRANCH);
  if (cands.length === 0) {
    const c = centerPoint();
    return { x: c.x, y: c.y, color };
  }

  let best: Candidate | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const c of cands) {
    board[c.y][c.x] = color;
    let score: number;
    if (isWinAt(board, c.x, c.y)) {
      score = SCORE.FIVE + depth;
    } else {
      score = alphaBeta(board, depth - 1, alpha, beta, false, color);
    }
    board[c.y][c.x] = Stone.Empty;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
    alpha = Math.max(alpha, bestScore);
  }

  if (!best) return null;
  return { x: best.x, y: best.y, color };
}

/**
 * 统一入口：获取最佳落子
 * @param board 当前棋盘（不会被修改）
 * @param color AI 执子
 * @param difficulty 难度
 */
export function getBestMove(
  board: Board,
  color: Stone,
  difficulty: Difficulty
): Move | null {
  const b = cloneBoard(board);
  switch (difficulty) {
    case Difficulty.Easy:
      return easyMove(b, color);
    case Difficulty.Medium:
      return searchMove(b, color, 2);
    case Difficulty.Hard:
      return searchMove(b, color, 4);
    default:
      return easyMove(b, color);
  }
}
