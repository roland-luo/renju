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
import { getBestMove } from '@game/ai';
import { BoardAnimator } from '@game/anim';
import { playSound, unlockAudio } from '@game/sound';

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

  const clearAiTimer = () => {
    if (aiTimer.current) {
      clearTimeout(aiTimer.current);
      aiTimer.current = null;
    }
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
    clearAiTimer();
    // 延迟让出主线程，先渲染玩家落子
    aiTimer.current = setTimeout(() => {
      const { board: b, moves: mv } = stateRef.current;
      const mv0 = getBestMove(b, aiColor, difficulty);
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
    }, 350);

    return clearAiTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves.length, result.status, aiColor, difficulty]);

  /** 胜利连线变化 → 同步脉冲动画 */
  useEffect(() => {
    animator.setWinLine(winLine);
    if (winLine) setAnimTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winLine]);

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
    clearAiTimer();
    setThinking(false);
    return true;
  }, [undoLeft, aiColor, playerColor]);

  /** 重新开始（可更换执子/难度） */
  const restart = useCallback(
    (opts?: { playerColor?: Stone; difficulty?: Difficulty }) => {
      clearAiTimer();
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
    },
    []
  );

  /** 仅切换难度（不影响当前局，立即生效于 AI 下一手） */
  const changeDifficulty = useCallback((d: Difficulty) => {
    setDifficulty(d);
  }, []);

  const canUndo =
    undoLeft > 0 &&
    moves.length > 0 &&
    !(moves.length === 1 && moves[0].color === Stone.Black && playerColor === Stone.White);

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
  };

  return {
    state,
    message,
    animator,
    playAt,
    undo,
    restart,
    changeDifficulty,
    setShowForbiddenHint,
    canUndo,
    unlockAudio,
  };
}
