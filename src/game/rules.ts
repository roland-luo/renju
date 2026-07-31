/**
 * 规则判定：胜负 + 黑棋禁手（三三 / 四四 / 长连）
 *
 * 采用竞技规则：
 * - 五连优先：黑棋一手成五即胜，不算禁手
 * - 黑棋禁手：长连(≥6)、双活三、双四（活四/冲四）
 * - 白棋无禁手，长连也算胜
 */
import { Board, Move, Stone } from './constants';
import { getStone, inBounds } from './board';

/** 四个方向：横、竖、主斜、副斜 */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** 对手 */
export function opponent(color: Stone): Stone {
  return color === Stone.Black ? Stone.White : Stone.Black;
}

/** 从 (x,y) 沿 (dx,dy) 方向连续同色子数（不含起点） */
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

/** 某点某方向（双向）连续同色总数（含起点） */
export function countLine(
  board: Board,
  x: number,
  y: number,
  dx: number,
  dy: number
): number {
  const color = getStone(board, x, y);
  if (color === Stone.Empty) return 0;
  return (
    1 +
    countDir(board, x, y, dx, dy, color) +
    countDir(board, x, y, -dx, -dy, color)
  );
}

/** 是否五连及以上 */
export function isWinAt(board: Board, x: number, y: number): boolean {
  const color = getStone(board, x, y);
  if (color === Stone.Empty) return false;
  for (const [dx, dy] of DIRS) {
    if (countLine(board, x, y, dx, dy) >= 5) return true;
  }
  return false;
}

/** 取 winning line（若存在） */
export function getWinLine(board: Board, x: number, y: number): Move[] | null {
  const color = getStone(board, x, y);
  if (color === Stone.Empty) return null;
  for (const [dx, dy] of DIRS) {
    if (countLine(board, x, y, dx, dy) >= 5) {
      const line: Move[] = [{ x, y, color }];
      // 正向
      let nx = x + dx;
      let ny = y + dy;
      while (inBounds(nx, ny) && board[ny][nx] === color) {
        line.push({ x: nx, y: ny, color });
        nx += dx;
        ny += dy;
      }
      // 反向
      nx = x - dx;
      ny = y - dy;
      while (inBounds(nx, ny) && board[ny][nx] === color) {
        line.push({ x: nx, y: ny, color });
        nx -= dx;
        ny -= dy;
      }
      return line.slice(0, 5);
    }
  }
  return null;
}

/**
 * —— 禁手判定的辅助：棋型识别 ——
 * 在某空点假设落 color 子后，判断该方向形成的棋型。
 * 返回 { overline, four, openThree } 三类计数所需的信息。
 */

interface PatternInfo {
  /** 是否长连（≥6，仅对黑有意义） */
  overline: boolean;
  /** 是否成四（活四或冲四） */
  isFour: boolean;
  /** 是否活三 */
  isOpenThree: boolean;
}

/**
 * 分析在某空点 (x,y) 落 color 子后，沿 (dx,dy) 方向形成的棋型。
 * 该点当前应为空。
 */
function analyzeDir(
  board: Board,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: Stone
): PatternInfo {
  // 假设在 (x,y) 落子
  board[y][x] = color;

  const total = countLine(board, x, y, dx, dy);

  const info: PatternInfo = {
    overline: total >= 6,
    isFour: false,
    isOpenThree: false,
  };

  if (total === 4) {
    // 成四：判断两端是否至少一端为空（冲四/活四都算"四"用于四四禁手）
    const open1 = isOpenEnd(board, x, y, dx, dy, color, +1);
    const open2 = isOpenEnd(board, x, y, dx, dy, color, -1);
    info.isFour = open1 || open2;
  } else if (total === 3) {
    // 活三：两端皆空，且至少一端延长后仍不成死
    const open1 = isOpenEnd(board, x, y, dx, dy, color, +1);
    const open2 = isOpenEnd(board, x, y, dx, dy, color, -1);
    if (open1 && open2) {
      // 进一步确认是真活三（任一端可成活四）
      info.isOpenThree =
        canFormOpenFour(board, x, y, dx, dy, color, +1) ||
        canFormOpenFour(board, x, y, dx, dy, color, -1);
    }
  }

  // 撤销假设
  board[y][x] = Stone.Empty;
  return info;
}

/** 该方向的某端是否为空点（可落子延伸） */
function isOpenEnd(
  board: Board,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: Stone,
  sign: 1 | -1
): boolean {
  // 沿 sign 方向越过所有同色子，看下一格
  let nx = x;
  let ny = y;
  while (inBounds(nx, ny) && board[ny][nx] === color) {
    nx += dx * sign;
    ny += dy * sign;
  }
  return inBounds(nx, ny) && board[ny][nx] === Stone.Empty;
}

/** 活三的某端延长一格后是否能成活四（用于确认真活三） */
function canFormOpenFour(
  board: Board,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: Stone,
  sign: 1 | -1
): boolean {
  // 找到该端第一个空点
  let nx = x;
  let ny = y;
  while (inBounds(nx, ny) && board[ny][nx] === color) {
    nx += dx * sign;
    ny += dy * sign;
  }
  if (!inBounds(nx, ny) || board[ny][nx] !== Stone.Empty) return false;
  // 在该空点再落一子，看是否成四且至少一端空（即活四/可成五）
  board[ny][nx] = color;
  const total = countLine(board, nx, ny, dx, dy);
  let open = false;
  if (total === 4) {
    open =
      isOpenEnd(board, nx, ny, dx, dy, color, +1) ||
      isOpenEnd(board, nx, ny, dx, dy, color, -1);
  }
  board[ny][nx] = Stone.Empty;
  return open;
}

export type ForbiddenKind = 'overline' | 'double-three' | 'double-four' | null;

/**
 * 判断在空点 (x,y) 落 color 子是否为禁手。
 * 仅黑棋有禁手；白棋恒返回 null。
 * 五连优先：若该手成五，返回 null（不算禁手）。
 */
export function checkForbidden(
  board: Board,
  x: number,
  y: number,
  color: Stone
): ForbiddenKind {
  if (color !== Stone.Black) return null;
  if (getStone(board, x, y) !== Stone.Empty) return null;

  // 五连优先：先模拟落子看成五则直接非禁手
  board[y][x] = color;
  const wins = isWinAt(board, x, y);
  board[y][x] = Stone.Empty;
  if (wins) return null;

  let overline = false;
  let fourCount = 0;
  let threeCount = 0;

  for (const [dx, dy] of DIRS) {
    const info = analyzeDir(board, x, y, dx, dy, color);
    if (info.overline) overline = true;
    if (info.isFour) fourCount++;
    if (info.isOpenThree) threeCount++;
  }

  if (overline) return 'overline';
  if (fourCount >= 2) return 'double-four';
  if (threeCount >= 2) return 'double-three';
  return null;
}

/** 禁手文案 */
export function forbiddenText(kind: ForbiddenKind): string {
  switch (kind) {
    case 'overline':
      return '长连禁手';
    case 'double-three':
      return '三三禁手';
    case 'double-four':
      return '四四禁手';
    default:
      return '';
  }
}
