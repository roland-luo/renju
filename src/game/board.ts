/**
 * 棋盘状态操作：落子 / 撤销 / 校验
 */
import { Board, BOARD_SIZE, Move, Stone, createBoard } from './constants';

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function getStone(board: Board, x: number, y: number): Stone {
  if (!inBounds(x, y)) return Stone.Empty;
  return board[y][x];
}

/** 可落子：在界内且为空 */
export function canPlace(board: Board, x: number, y: number): boolean {
  return inBounds(x, y) && board[y][x] === Stone.Empty;
}

/**
 * 落子（原地修改 board 并返回 Move），非法返回 null
 */
export function placeStone(
  board: Board,
  x: number,
  y: number,
  color: Stone
): Move | null {
  if (!canPlace(board, x, y)) return null;
  board[y][x] = color;
  return { x, y, color };
}

/** 撤销指定点（置空） */
export function removeStone(board: Board, x: number, y: number): void {
  if (inBounds(x, y)) board[y][x] = Stone.Empty;
}

/** 复制棋盘 */
export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

/** 是否已满（平局判定用） */
export function isFull(board: Board): boolean {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === Stone.Empty) return false;
    }
  }
  return true;
}

/** 天元（中心点） */
export function centerPoint(): { x: number; y: number } {
  const c = Math.floor(BOARD_SIZE / 2);
  return { x: c, y: c };
}

export { createBoard };
