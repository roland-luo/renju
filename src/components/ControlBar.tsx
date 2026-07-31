/**
 * ControlBar：难度 / 执子选择 / 悔棋 / 重新开始 / 禁手提示开关
 */
import { View, Text, Button } from '@tarojs/components';
import { Difficulty, Stone } from '@game/constants';

interface Props {
  difficulty: Difficulty;
  playerColor: Stone;
  undoLeft: number;
  canUndo: boolean;
  thinking: boolean;
  onRestart: (opts: { playerColor: Stone; difficulty: Difficulty }) => void;
  onUndo: () => void;
  onDifficulty: (d: Difficulty) => void;
}

const DIFFS: Array<{ key: Difficulty; label: string }> = [
  { key: Difficulty.Easy, label: '初级' },
  { key: Difficulty.Medium, label: '中级' },
  { key: Difficulty.Hard, label: '高级' },
];

export default function ControlBar(props: Props) {
  const {
    difficulty,
    playerColor,
    undoLeft,
    canUndo,
    thinking,
    onRestart,
    onUndo,
    onDifficulty,
  } = props;

  return (
    <View className="control-bar">
      {/* 难度 */}
      <View className="control-group">
        <Text className="control-label">难度</Text>
        <View className="seg">
          {DIFFS.map((d) => (
            <View
              key={d.key}
              className={`seg-item ${difficulty === d.key ? 'seg-item--active' : ''}`}
              onClick={() => onDifficulty(d.key)}
            >
              {d.label}
            </View>
          ))}
        </View>
      </View>

      {/* 执子 */}
      <View className="control-group">
        <Text className="control-label">执子</Text>
        <View className="seg">
          <View
            className={`seg-item ${playerColor === Stone.Black ? 'seg-item--active' : ''}`}
            onClick={() => onRestart({ playerColor: Stone.Black, difficulty })}
          >
            <View className="dot dot--black" /> 执黑
          </View>
          <View
            className={`seg-item ${playerColor === Stone.White ? 'seg-item--active' : ''}`}
            onClick={() => onRestart({ playerColor: Stone.White, difficulty })}
          >
            <View className="dot dot--white" /> 执白
          </View>
        </View>
      </View>

      {/* 操作按钮 */}
      <View className="control-actions">
        <Button
          className={`btn btn--ghost ${!canUndo || thinking ? 'btn--disabled' : ''}`}
          disabled={!canUndo || thinking}
          onClick={onUndo}
        >
          悔棋（{undoLeft}）
        </Button>
        <Button
          className="btn btn--primary"
          onClick={() => onRestart({ playerColor, difficulty })}
        >
          重新开始
        </Button>
      </View>
    </View>
  );
}
