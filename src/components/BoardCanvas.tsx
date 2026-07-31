/**
 * BoardCanvas：Canvas 手绘棋盘
 * - 木纹底、15×15 网格、5 星位、立体棋子、最后一手标记、禁手提示
 * - 跨端：通过 Taro.createSelectorQuery 获取真实 canvas 节点（H5 与小程序统一）
 */
import { useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { Board, BOARD_SIZE, Move, Stone, THEME } from '@game/constants';
import { checkForbidden } from '@game/rules';
import { BoardAnimator, AnimSnapshot } from '@game/anim';

interface Props {
  board: Board;
  lastMove: Move | null;
  winLine: Move[] | null;
  playerColor: Stone;
  showForbiddenHint: boolean;
  interactive: boolean;
  /** 动画器（可选；缺省时静态渲染） */
  animator?: BoardAnimator;
  /** 动画版本号：变化时重启动画循环 */
  animTick?: number;
  onPlay: (x: number, y: number) => void;
}

const IS_H5 = process.env.TARO_ENV === 'h5';

/** 空快照（无动画时的默认） */
const EMPTY_SNAP: AnimSnapshot = { cells: new Map(), forbiddenShake: null };

export default function BoardCanvas(props: Props) {
  const {
    board,
    lastMove,
    winLine,
    playerColor,
    showForbiddenHint,
    interactive,
    animator,
    animTick,
    onPlay,
  } = props;

  const geomRef = useRef({ size: 0, padding: 0, cell: 0 });
  const canvasRef = useRef<any>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const readyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  // 保存最新 props 供 draw 使用（避免闭包过期）
  const propsRef = useRef(props);
  propsRef.current = props;

  const pointXY = (x: number, y: number) => {
    const { padding, cell } = geomRef.current;
    return { px: padding + x * cell, py: padding + y * cell };
  };

  const draw = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !readyRef.current) return;
    const {
      board: bd,
      lastMove: lm,
      winLine: wl,
      playerColor: pc,
      showForbiddenHint: showFb,
      animator: anim,
    } = propsRef.current;
    const { size, padding, cell } = geomRef.current;
    const snap: AnimSnapshot = anim ? anim.snapshot() : EMPTY_SNAP;

    ctx.save();
    ctx.clearRect(0, 0, size, size);

    // 棋盘底色（木纹渐变）
    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, THEME.boardBg);
    bg.addColorStop(1, THEME.boardBgDeep);
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, size, size, size * 0.02);
    ctx.fill();

    ctx.strokeStyle = 'rgba(90, 64, 35, 0.6)';
    ctx.lineWidth = Math.max(1, size * 0.004);
    roundRect(ctx, 0, 0, size, size, size * 0.02);
    ctx.stroke();

    // 网格线
    ctx.strokeStyle = THEME.gridLine;
    ctx.lineWidth = Math.max(0.8, size * 0.0016);
    ctx.beginPath();
    for (let i = 0; i < BOARD_SIZE; i++) {
      const a = pointXY(i, 0);
      const b = pointXY(i, BOARD_SIZE - 1);
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      const c = pointXY(0, i);
      const d = pointXY(BOARD_SIZE - 1, i);
      ctx.moveTo(c.px, c.py);
      ctx.lineTo(d.px, d.py);
    }
    ctx.stroke();

    // 外框加粗
    ctx.lineWidth = Math.max(1.4, size * 0.003);
    ctx.strokeRect(padding, padding, cell * (BOARD_SIZE - 1), cell * (BOARD_SIZE - 1));

    // 星位
    const stars = [3, 7, 11];
    ctx.fillStyle = THEME.star;
    for (const sx of stars) {
      for (const sy of stars) {
        const { px, py } = pointXY(sx, sy);
        ctx.beginPath();
        ctx.arc(px, py, cell * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 禁手提示（黑方禁点）
    if (showFb && pc === Stone.Black) {
      ctx.strokeStyle = THEME.forbidden;
      ctx.lineWidth = Math.max(1, cell * 0.06);
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (bd[y][x] !== Stone.Empty) continue;
          if (checkForbidden(bd, x, y, Stone.Black)) {
            const { px, py } = pointXY(x, y);
            const r = cell * 0.16;
            ctx.beginPath();
            ctx.moveTo(px - r, py - r);
            ctx.lineTo(px + r, py + r);
            ctx.moveTo(px + r, py - r);
            ctx.lineTo(px - r, py + r);
            ctx.stroke();
          }
        }
      }
    }

    // 棋子（带落子弹入 / 胜利脉冲）
    const inWin = new Set((wl ?? []).map((m) => `${m.x},${m.y}`));
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const s = bd[y][x];
        if (s === Stone.Empty) continue;
        const { px, py } = pointXY(x, y);
        const ca = snap.cells.get(`${x},${y}`);
        const place = ca ? ca.place : 1;
        let scale = Math.max(0.05, place);
        let alpha = 1;
        if (ca && ca.winPhase > 0) {
          // 胜利脉冲：轻微呼吸缩放
          scale *= 1 + 0.07 * Math.sin(ca.winPhase * Math.PI * 2);
        }
        if (place < 1) alpha = Math.min(1, place * 1.6);
        drawStone(ctx, px, py, cell * 0.44 * scale, s, inWin.has(`${x},${y}`), alpha);
      }
    }

    // 禁手/非法落子抖动标记（红圈 + 抖动）
    if (snap.forbiddenShake) {
      const { x, y, offset } = snap.forbiddenShake;
      const { px, py } = pointXY(x, y);
      const dx = offset * cell;
      ctx.strokeStyle = THEME.lastMove;
      ctx.lineWidth = Math.max(1.5, cell * 0.07);
      ctx.beginPath();
      ctx.arc(px + dx, py, cell * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 最后一手标记
    if (lm) {
      const { px, py } = pointXY(lm.x, lm.y);
      ctx.strokeStyle = THEME.lastMove;
      ctx.lineWidth = Math.max(1.2, cell * 0.06);
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }, []);

  /** 停止动画循环 */
  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      if (IS_H5) cancelAnimationFrame(rafRef.current);
      else clearTimeout(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** 启动动画循环：动画进行期间逐帧重绘，结束后停 */
  const startLoop = useCallback(() => {
    const anim = propsRef.current.animator;
    if (!anim) return;
    stopLoop();
    const step = () => {
      const a = propsRef.current.animator;
      draw();
      if (a && a.active) {
        rafRef.current = IS_H5
          ? requestAnimationFrame(step)
          : (setTimeout(step, 16) as unknown as number);
      } else {
        rafRef.current = null;
        draw(); // 收尾一帧，确保稳定态
      }
    };
    rafRef.current = IS_H5
      ? requestAnimationFrame(step)
      : (setTimeout(step, 16) as unknown as number);
  }, [draw, stopLoop]);

  /** 初始化 canvas（跨端统一用 selectorQuery 获取真实节点） */
  useEffect(() => {
    let cancelled = false;
    let resizeObs: ResizeObserver | null = null;
    const dpr = IS_H5
      ? window.devicePixelRatio || 1
      : Taro.getSystemInfoSync().pixelRatio || 1;

    const applyGeometry = (node: any, cssSize: number) => {
      const padding = cssSize * 0.055;
      const cell = (cssSize - padding * 2) / (BOARD_SIZE - 1);
      geomRef.current = { size: cssSize, padding, cell };
      node.width = Math.round(cssSize * dpr);
      node.height = Math.round(cssSize * dpr);
      const ctx = node.getContext('2d') as CanvasRenderingContext2D;
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    };

    const setup = (node: any, cssSize: number) => {
      if (cancelled || !node) return;
      const ctx = applyGeometry(node, cssSize);
      if (!ctx) return;
      ctxRef.current = ctx;
      canvasRef.current = node;
      readyRef.current = true;
      draw();

      // H5：监听尺寸变化，重算几何并重绘，保证绘制与点击换算永远一致
      if (IS_H5 && typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver((entries) => {
          const w = entries[0]?.contentRect?.width;
          if (!w || cancelled) return;
          const c = applyGeometry(node, w);
          if (c) {
            ctxRef.current = c;
            draw();
          }
        });
        resizeObs.observe(node);
      }
    };

    // 延迟一帧确保 canvas 已挂载
    const timer = setTimeout(() => {
      Taro.createSelectorQuery()
        .select('#gomoku-board')
        .fields({ node: true, size: true })
        .exec((res) => {
          const info = res?.[0];
          if (info?.node) {
            setup(info.node, info.width ?? 300);
          } else if (IS_H5) {
            // H5 兜底：fields node 不支持时取 DOM
            const el = document.getElementById('gomoku-board');
            const real =
              el?.tagName === 'CANVAS'
                ? (el as HTMLCanvasElement)
                : (el?.querySelector('canvas') as HTMLCanvasElement | null);
            if (real) setup(real, real.clientWidth || 300);
          }
        });
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      resizeObs?.disconnect();
      stopLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 状态变化重绘 */
  useEffect(() => {
    draw();
  }, [board, lastMove, winLine, showForbiddenHint, playerColor, draw]);

  /** 动画节拍变化 → 启动逐帧动画循环 */
  useEffect(() => {
    if (animator) startLoop();
    return stopLoop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animTick, animator]);

  /** 点击落子 */
  const toLocal = (clientX: number, clientY: number) => {
    const node = canvasRef.current;
    if (IS_H5 && node?.getBoundingClientRect) {
      const rect = node.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top, rect };
    }
    return { x: clientX, y: clientY, rect: null };
  };

  const handlePoint = (clientX: number, clientY: number) => {
    if (!interactive || !readyRef.current) return;
    const local = toLocal(clientX, clientY);

    // 用实时渲染尺寸反推几何，避免 CSS 缩放 / DPR / aspect-ratio 导致的累积偏移。
    // H5 下以 getBoundingClientRect 的真实 CSS 宽高为准；小程序用初始化缓存。
    let cssSize = geomRef.current.size;
    if (IS_H5 && local.rect && local.rect.width > 0) {
      cssSize = local.rect.width;
    }
    if (cssSize <= 0) return;
    const padding = cssSize * 0.055;
    const cell = (cssSize - padding * 2) / (BOARD_SIZE - 1);

    const x = Math.round((local.x - padding) / cell);
    const y = Math.round((local.y - padding) / cell);
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
    onPlay(x, y);
  };

  const onClick = (e: any) => {
    if (IS_H5) {
      handlePoint(e.clientX, e.clientY);
    }
  };

  const onTouch = (e: any) => {
    if (IS_H5) return;
    const t = e.touches?.[0] ?? e.changedTouches?.[0];
    if (t) handlePoint(t.x ?? t.clientX ?? 0, t.y ?? t.clientY ?? 0);
  };

  return (
    <Canvas
      id="gomoku-board"
      canvasId="gomoku-board"
      type="2d"
      className="gomoku-board"
      onClick={onClick}
      onTouchStart={onTouch}
    />
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStone(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  r: number,
  color: Stone,
  highlight: boolean,
  alpha = 1
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  // 投影
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();

  const grad = ctx.createRadialGradient(
    px - r * 0.35,
    py - r * 0.35,
    r * 0.1,
    px,
    py,
    r
  );
  if (color === Stone.Black) {
    grad.addColorStop(0, THEME.blackHighlight);
    grad.addColorStop(1, THEME.blackStone);
  } else {
    grad.addColorStop(0, THEME.whiteHighlight);
    grad.addColorStop(1, '#cfcfcf');
  }
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  if (highlight) {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.strokeStyle = THEME.lastMove;
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.stroke();
  }
  ctx.restore();
}
