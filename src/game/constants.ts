/**
 * 五子棋核心常量与类型定义
 * 与框架无关，可在 H5 / 小程序 / Node 单测中复用
 */

/** 棋盘尺寸（15×15 标准棋盘） */
export const BOARD_SIZE = 15;

/** 棋子 */
export enum Stone {
  Empty = 0,
  Black = 1,
  White = 2,
}

/** 难度档位 */
export enum Difficulty {
  Easy = 'easy', // 初级：贪心评分
  Medium = 'medium', // 中级：Alpha-Beta 深度2
  Hard = 'hard', // 高级：Alpha-Beta 深度4
}

/** 悔棋上限 */
export const MAX_UNDO = 3;

/** 落子 */
export interface Move {
  x: number; // 列 0..14
  y: number; // 行 0..14
  color: Stone;
}

/** 棋盘：board[y][x] */
export type Board = Stone[][];

/** 游戏结果 */
export type GameResult =
  | { status: 'playing' }
  | { status: 'win'; winner: Stone; line?: Move[] }
  | { status: 'draw' }
  | { status: 'forbidden'; loser: Stone; reason: string };

/** 创建空棋盘 */
export function createBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    new Array<Stone>(BOARD_SIZE).fill(Stone.Empty)
  );
}

/** 主题配色（供 Canvas 与样式共用） */
export const THEME = {
  boardBg: '#e3b874', // 棋盘木色
  boardBgDeep: '#d4a75e',
  gridLine: '#7a5a33', // 网格线
  star: '#5a4023', // 星位
  blackStone: '#1a1a1a',
  blackHighlight: '#4d4d4d',
  whiteStone: '#f5f5f5',
  whiteHighlight: '#ffffff',
  lastMove: '#d8452b', // 最后一手标记
  forbidden: 'rgba(216, 69, 43, 0.55)', // 禁手提示
} as const;
