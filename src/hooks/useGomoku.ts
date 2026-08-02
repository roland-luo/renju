/**
 * useGomoku：连接 game 核心逻辑与 React 状态
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Board,
  Difficulty,
  GameResult,
  MAX_UNDO,
  Move,
  Stone,
  createBoard,
} from '@game/constants';
import { cloneBoard, isFull } from '@game/board';
import {
  checkForbidden,
  forbiddenText,
  getWinLine,
  isWinAt,
  opponent,
} from '@game/rules';
import { getBestMoveAsync } from '@game/ai';
import { BoardAnimator } from '@game/anim';
import { playSound, unlockAudio } from '@game/sound';
import { getStats, recordGame, Stats } from '@game/stats';

export interface GomokuState {
  board: Board;
  moves: Move[];
  current: Stone; // 当前该谁落子
  playerColor: Stone; // 玩家执子
  difficulty: Difficulty;
  result: GameResult;
  undoLeft: number;
  thinking: boolean; // AI 思考中
  lastMove: Move | null;
  winLine: Move[] | null;
  showForbiddenHint: boolean;
  /** 禁手/非法落子抖动目标（一次性），消费后清除 */
  shakeAt: { x: number; y: number } | null;
  /** 动画版本号：落子/悔棋/重开时 +1，驱动 Canvas 动画循环 */
  animTick: number;
  /** 复盘：当前回放到第几手；null=正常对局（非复盘） */
  reviewIndex: number | null;
  /** 复盘模式是否激活（终局后可回放） */
  reviewing: boolean;
}

export function useGomoku() {
  const [board, setBoard] = useState<Board>(() => createBoard());
  const [moves, setMoves] = useState<Move[]>([]);
  const [playerColor, setPlayerColor] = useState<Stone>(Stone.Black);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.Medium);
  const [result, setResult] = useState<GameResult>({ status: 'playing' });
  const [undoLeft, setUndoLeft] = useState<number>(MAX_UNDO);
  const [thinking, setThinking] = useState<boolean>(false);
  const [showForbiddenHint, setShowForbiddenHint] = useState<boolean>(true);
  const [message, setMessage] = useState<string>('');
  const [shakeAt, setShakeAt] = useState<{ x: number; y: number } | null>(null);
  const [animTick, setAnimTick] = useState<number>(0);
  /** 复盘：回看指针（0=开局空盘，moves.length=终局）；null=正常对局 */
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  /** 对局统计 */
  const [stats, setStats] = useState<Stats>(() => getStats());
  /** 本局是否已计入统计（防止重复） */
  const recordedRef = useRef(false);

  /** 棋盘动画器（跨渲染稳定） */
  const animatorRef = useRef<BoardAnimator | null>(null);
  if (!animatorRef.current) animatorRef.current = new BoardAnimator();
  const animator = animatorRef.current;

  const aiColor = opponent(playerColor);
  const current: Stone = moves.length % 2 === 0 ? Stone.Black : Stone.White;
  const lastMove = moves.length > 0 ? moves[moves.length - 1] : null;

  const winLine = useMemo(() => {
    if (result.status === 'win' && lastMove) {
      return getWinLine(board, lastMove.x, lastMove.y);
    }
    return null;
  }, [result, board, lastMove]);

  // 用 ref 保存最新 state 供异步 AI 使用
  const stateRef = useRef({ board, moves, result, playerColor, difficulty });
  stateRef.current = { board, moves, result, playerColor, difficulty };

  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** AI 搜索取消标志：悔棋/重开/组件卸载时置真，让进行中的搜索提前返回 */
  const aiCancelled = useRef(false);

  const clearAiTimer = () => {
    if (aiTimer.current) {
      clearTimeout(aiTimer.current);
      aiTimer.current = null;
    }
  };

  /** 取消进行中的 AI 搜索 */
  const cancelAi = () => {
    aiCancelled.current = true;
    clearAiTimer();
  };

  /** 终局音效：玩家视角（胜=win / 负=lose / 平=draw） */
  const playResult = (res: GameResult) => {
    if (res.status === 'win') {
      playSound(res.winner === playerColor ? 'win' : 'lose');
    } else if (res.status === 'draw') {
      playSound('draw');
    }
  };

  /** 终局判定（在落子后调用） */
  const judgeAfter = useCallback(
    (b: Board, mv: Move): GameResult => {
      if (isWinAt(b, mv.x, mv.y)) {
        return { status: 'win', winner: mv.color };
      }
      // 黑棋禁手：落子后未赢但被禁（长连等）—— 实际上禁手点在落子前拦截，
      // 此处主要兜底长连（落子成六但未成五的场景几乎不存在，双三双四已在落子前拦截）
      if (isFull(b)) {
        return { status: 'draw' };
      }
      return { status: 'playing' };
    },
    []
  );

  /** 玩家尝试落子 */
  const playAt = useCallback(
    (x: number, y: number): boolean => {
      const { board: b, moves: mv, result: res, playerColor: pc } = stateRef.current;
      if (res.status !== 'playing') return false;
      const cur: Stone = mv.length % 2 === 0 ? Stone.Black : Stone.White;
      if (cur !== pc) return false; // 不是玩家回合
      if (b[y][x] !== Stone.Empty) return false;

      // 黑棋禁手拦截
      if (pc === Stone.Black) {
        const fb = checkForbidden(b, x, y, Stone.Black);
        if (fb) {
          setMessage(`禁手：${forbiddenText(fb)}`);
          setShakeAt({ x, y });
          animator.onForbidden(x, y);
          setAnimTick((t) => t + 1);
          playSound('forbidden');
          return false;
        }
      }

      const nb = cloneBoard(b);
      nb[y][x] = pc;
      const move: Move = { x, y, color: pc };
      const nextMoves = [...mv, move];
      setBoard(nb);
      setMoves(nextMoves);
      setMessage('');
      setShakeAt(null);
      animator.onPlace(x, y);
      setAnimTick((t) => t + 1);
      playSound(pc === Stone.Black ? 'place-black' : 'place-white');
      const res2 = judgeAfter(nb, move);
      setResult(res2);
      playResult(res2);
      return true;
    },
    [judgeAfter]
  );

  /** AI 落子（在轮到 AI 时触发） */
  useEffect(() => {
    if (result.status !== 'playing') return;
    if (current !== aiColor) return;

    setThinking(true);
    cancelAi();
    aiCancelled.current = false;
    // 延迟让出主线程，先渲染玩家落子
    aiTimer.current = setTimeout(() => {
      const { board: b, moves: mv } = stateRef.current;
      // 异步分片搜索：Hard 不阻塞 UI；悔棋/重开时被取消
      getBestMoveAsync(b, aiColor, difficulty, () => aiCancelled.current)
        .then((mv0) => {
          if (aiCancelled.current) return; // 已被取消（悔棋/重开）
          setThinking(false);
          if (!mv0) {
            setResult({ status: 'draw' });
            return;
          }
          const nb = cloneBoard(b);
          nb[mv0.y][mv0.x] = aiColor;
          const nextMoves = [...mv, mv0];
          setBoard(nb);
          setMoves(nextMoves);
          animator.onPlace(mv0.x, mv0.y);
          setAnimTick((t) => t + 1);
          playSound(aiColor === Stone.Black ? 'place-black' : 'place-white');
          const res2 = judgeAfter(nb, mv0);
          setResult(res2);
          playResult(res2);
        })
        .catch(() => setThinking(false));
    }, 200);

    return cancelAi;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves.length, result.status, aiColor, difficulty]);

  /** 胜利连线变化 → 同步脉冲动画 */
  useEffect(() => {
    animator.setWinLine(winLine);
    if (winLine) setAnimTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winLine]);

  /** 终局 → 记录统计（每局一次） */
  useEffect(() => {
    if (result.status === 'playing') return;
    if (recordedRef.current) return;
    // 至少下过一手才算一局（避免空盘直接判负等边界）
    if (stateRef.current.moves.length === 0) return;
    recordedRef.current = true;
    const outcome =
      result.status === 'draw'
        ? 'draw'
        : result.status === 'win' && result.winner === playerColor
        ? 'win'
        : 'lose';
    setStats(recordGame(difficulty, outcome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.status]);

  /** 悔棋：回退玩家+AI 各一手（2 手），上限 MAX_UNDO */
  const undo = useCallback((): boolean => {
    const { moves: mv, result: res } = stateRef.current;
    if (undoLeft <= 0) return false;
    if (mv.length === 0) return false;

    // 计算回退手数：尽量退到玩家落子前
    // 若当前已结束，先退 AI 最后一手，再退玩家一手
    let steps = 0;
    const last = mv[mv.length - 1];
    if (res.status !== 'playing' || last.color === aiColor) {
      steps = Math.min(2, mv.length); // 退 AI + 玩家
    } else {
      steps = 1; // 只退玩家一手（AI 尚未应）
    }
    // 玩家执白开局：棋盘只有 AI 一手时，悔棋退掉该手由玩家先走不合理，
    // 但为简单起见，玩家执白时开局 AI 落子不算玩家可悔手数（此时 mv.length=1 且为黑），不允许悔
    if (mv.length === 1 && mv[0].color === Stone.Black && playerColor === Stone.White) {
      return false;
    }

    const nb = cloneBoard(stateRef.current.board);
    const remain = mv.slice(0, mv.length - steps);
    for (let i = mv.length - steps; i < mv.length; i++) {
      nb[mv[i].y][mv[i].x] = Stone.Empty;
    }
    setBoard(nb);
    setMoves(remain);
    setResult({ status: 'playing' });
    setUndoLeft((n) => n - 1);
    setMessage('');
    setShakeAt(null);
    animator.reset();
    setAnimTick((t) => t + 1);
    playSound('undo');
    cancelAi();
    setThinking(false);
    setReviewIndex(null);
    return true;
  }, [undoLeft, aiColor, playerColor]);

  /** 重新开始（可更换执子/难度） */
  const restart = useCallback(
    (opts?: { playerColor?: Stone; difficulty?: Difficulty }) => {
      cancelAi();
      const pc = opts?.playerColor ?? stateRef.current.playerColor;
      const df = opts?.difficulty ?? stateRef.current.difficulty;
      if (opts?.playerColor) setPlayerColor(pc);
      if (opts?.difficulty) setDifficulty(df);
      setBoard(createBoard());
      setMoves([]);
      setResult({ status: 'playing' });
      setUndoLeft(MAX_UNDO);
      setThinking(false);
      setMessage('');
      setShakeAt(null);
      animator.reset();
      setAnimTick((t) => t + 1);
      setReviewIndex(null);
      recordedRef.current = false;
    },
    []
  );

  /** 仅切换难度（不影响当前局，立即生效于 AI 下一手） */
  const changeDifficulty = useCallback((d: Difficulty) => {
    setDifficulty(d);
  }, []);

  /** 重新读取统计（清空后刷新用） */
  const refreshStats = useCallback(() => {
    setStats(getStats());
  }, []);

  const canUndo =
    undoLeft > 0 &&
    moves.length > 0 &&
    !(moves.length === 1 && moves[0].color === Stone.Black && playerColor === Stone.White);

  /** 复盘是否激活（终局后进入回放） */
  const reviewing = reviewIndex !== null;

  /** 复盘棋盘：根据 reviewIndex 重建前 N 手（正常对局时用实时 board） */
  const reviewBoard = useMemo((): Board => {
    if (reviewIndex === null) return board;
    const b = createBoard();
    for (let i = 0; i < reviewIndex && i < moves.length; i++) {
      b[moves[i].y][moves[i].x] = moves[i].color;
    }
    return b;
  }, [reviewIndex, board, moves]);

  /** 复盘时的"最后一手"标记 */
  const reviewLastMove = useMemo((): Move | null => {
    if (reviewIndex === null) return lastMove;
    if (reviewIndex <= 0 || reviewIndex > moves.length) return null;
    return moves[reviewIndex - 1];
  }, [reviewIndex, lastMove, moves]);

  /** 手数序号映射（复盘时显示在棋子上） */
  const moveNumbers = useMemo((): Map<string, number> | null => {
    if (reviewIndex === null) return null;
    const m = new Map<string, number>();
    for (let i = 0; i < reviewIndex && i < moves.length; i++) {
      m.set(`${moves[i].x},${moves[i].y}`, i + 1);
    }
    return m;
  }, [reviewIndex, moves]);

  /** 进入复盘：从终局（或当前）开始回看 */
  const startReview = useCallback(() => {
    const { moves: mv } = stateRef.current;
    if (mv.length === 0) return;
    cancelAi();
    setThinking(false);
    setReviewIndex(mv.length);
    animator.reset();
    setAnimTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 退出复盘，回到实时棋盘 */
  const exitReview = useCallback(() => {
    setReviewIndex(null);
    animator.reset();
    setAnimTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 复盘步进：delta=±1，或 jump 到指定手 */
  const reviewStep = useCallback(
    (delta: number) => {
      setReviewIndex((idx) => {
        const cur = idx === null ? stateRef.current.moves.length : idx;
        const next = Math.max(0, Math.min(stateRef.current.moves.length, cur + delta));
        return next;
      });
      setAnimTick((t) => t + 1);
    },
    []
  );

  const reviewJump = useCallback((index: number) => {
    setReviewIndex(() =>
      Math.max(0, Math.min(stateRef.current.moves.length, index))
    );
    setAnimTick((t) => t + 1);
  }, []);

  const state: GomokuState = {
    board,
    moves,
    current,
    playerColor,
    difficulty,
    result,
    undoLeft,
    thinking,
    lastMove,
    winLine,
    showForbiddenHint,
    shakeAt,
    animTick,
    reviewIndex,
    reviewing,
  };

  return {
    state,
    message,
    animator,
    stats,
    playAt,
    undo,
    restart,
    changeDifficulty,
    setShowForbiddenHint,
    canUndo,
    unlockAudio,
    refreshStats,
    // 复盘
    reviewBoard,
    reviewLastMove,
    moveNumbers,
    startReview,
    exitReview,
    reviewStep,
    reviewJump,
  };
}
