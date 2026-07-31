/**
 * 主页面：组合 BoardCanvas + ControlBar + 状态栏
 */
import { View, Text } from '@tarojs/components';
import { useEffect, useState } from 'react';
import { useGomoku } from '@/hooks/useGomoku';
import BoardCanvas from '@components/BoardCanvas';
import ControlBar from '@components/ControlBar';
import { Difficulty, Stone } from '@game/constants';
import { initSound, isSoundEnabled, setSoundEnabled, playSound } from '@game/sound';
import './index.scss';

const DIFF_LABEL: Record<Difficulty, string> = {
  [Difficulty.Easy]: '初级',
  [Difficulty.Medium]: '中级',
  [Difficulty.Hard]: '高级',
};

export default function Index() {
  const {
    state,
    message,
    animator,
    playAt,
    undo,
    restart,
    changeDifficulty,
    canUndo,
    unlockAudio,
  } = useGomoku();

  const [soundOn, setSoundOn] = useState<boolean>(true);

  // 启动时恢复音效偏好
  useEffect(() => {
    initSound();
    setSoundOn(isSoundEnabled());
  }, []);

  const {
    board,
    result,
    current,
    playerColor,
    difficulty,
    thinking,
    lastMove,
    winLine,
    showForbiddenHint,
    undoLeft,
    animTick,
  } = state;

  const gameOver = result.status !== 'playing';

  /** 状态栏文案 */
  const statusText = (): { main: string; tone: string } => {
    if (result.status === 'win') {
      const youWon = result.winner === playerColor;
      return youWon
        ? { main: '🎉 你赢了！', tone: 'win' }
        : { main: '🤖 AI 获胜', tone: 'lose' };
    }
    if (result.status === 'draw') return { main: '平局', tone: 'draw' };
    if (thinking) return { main: 'AI 思考中…', tone: 'thinking' };
    if (message) return { main: message, tone: 'warn' };
    const yourTurn = current === playerColor;
    return yourTurn
      ? { main: '轮到你落子', tone: 'turn' }
      : { main: '等待 AI…', tone: 'thinking' };
  };

  const st = statusText();

  /** 切换音效 */
  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
    if (next) {
      unlockAudio();
      playSound('place-white'); // 立即反馈
    }
  };

  return (
    // 首次交互解锁音频（浏览器自动播放策略）
    <View className="page" onClick={unlockAudio} onTouchStart={unlockAudio}>
      {/* 顶部标题与状态 */}
      <View className="header">
        <View className="title-row">
          <Text className="title">五子棋</Text>
          <View className="title-right">
            <Text className="subtitle">
              你执{playerColor === Stone.Black ? '黑' : '白'} · {DIFF_LABEL[difficulty]}
            </Text>
            <View
              className={`sound-toggle ${soundOn ? 'sound-toggle--on' : ''}`}
              onClick={(e) => {
                e.stopPropagation?.();
                toggleSound();
              }}
            >
              {soundOn ? '🔊' : '🔇'}
            </View>
          </View>
        </View>
        <View className={`status status--${st.tone}`}>
          <View
            className={`status-stone ${
              current === Stone.Black ? 'status-stone--black' : 'status-stone--white'
            }`}
          />
          <Text className="status-text">{st.main}</Text>
        </View>
      </View>

      {/* 棋盘 */}
      <View className="board-wrap">
        <BoardCanvas
          board={board}
          lastMove={lastMove}
          winLine={winLine}
          playerColor={playerColor}
          showForbiddenHint={showForbiddenHint}
          interactive={!gameOver && !thinking && current === playerColor}
          animator={animator}
          animTick={animTick}
          onPlay={playAt}
        />
      </View>

      {/* 控制区 */}
      <ControlBar
        difficulty={difficulty}
        playerColor={playerColor}
        undoLeft={undoLeft}
        canUndo={canUndo}
        thinking={thinking}
        onRestart={(opts) => restart(opts)}
        onUndo={undo}
        onDifficulty={changeDifficulty}
      />
    </View>
  );
}
