/**
 * StatsPanel：对局统计面板（可折叠）
 * 展示总场次与各难度 胜/负/平 及胜率。
 */
import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import { Difficulty } from '@game/constants';
import { Stats, winRate } from '@game/stats';

interface Props {
  stats: Stats;
  onReset: () => void;
}

const DIFF_LABEL: Record<Difficulty, string> = {
  [Difficulty.Easy]: '初级',
  [Difficulty.Medium]: '中级',
  [Difficulty.Hard]: '高级',
};

const DIFFS = [Difficulty.Easy, Difficulty.Medium, Difficulty.Hard];

export default function StatsPanel(props: Props) {
  const { stats, onReset } = props;
  const [open, setOpen] = useState(false);

  const totalWin =
    stats.byDifficulty[Difficulty.Easy].win +
    stats.byDifficulty[Difficulty.Medium].win +
    stats.byDifficulty[Difficulty.Hard].win;

  return (
    <View className="stats-panel">
      <View className="stats-head" onClick={() => setOpen((o) => !o)}>
        <Text className="stats-title">
          战绩 · {stats.total} 场 {stats.total > 0 ? `· 胜 ${totalWin}` : ''}
        </Text>
        <Text className={`stats-caret ${open ? 'stats-caret--open' : ''}`}>▾</Text>
      </View>

      {open && (
        <View className="stats-body">
          <View className="stats-row stats-row--head">
            <Text className="stats-cell stats-cell--label">难度</Text>
            <Text className="stats-cell">胜</Text>
            <Text className="stats-cell">负</Text>
            <Text className="stats-cell">平</Text>
            <Text className="stats-cell">胜率</Text>
          </View>
          {DIFFS.map((d) => {
            const s = stats.byDifficulty[d];
            const rate = winRate(s);
            return (
              <View className="stats-row" key={d}>
                <Text className="stats-cell stats-cell--label">{DIFF_LABEL[d]}</Text>
                <Text className="stats-cell stats-cell--win">{s.win}</Text>
                <Text className="stats-cell stats-cell--lose">{s.lose}</Text>
                <Text className="stats-cell">{s.draw}</Text>
                <Text className="stats-cell">
                  {s.win + s.lose + s.draw === 0 ? '—' : `${Math.round(rate * 100)}%`}
                </Text>
              </View>
            );
          })}
          {stats.total > 0 && (
            <View className="stats-reset" onClick={onReset}>
              <Text className="stats-reset-text">清空战绩</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
