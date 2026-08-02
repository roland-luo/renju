/**
 * ReviewBar：复盘控制条
 * 终局后出现，支持 首/上一步/下一步/末 回放，显示当前手数。
 */
import { View, Text } from '@tarojs/components';

interface Props {
  /** 当前回放到第几手（0=开局） */
  index: number;
  /** 总手数 */
  total: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onExit: () => void;
}

export default function ReviewBar(props: Props) {
  const { index, total, onFirst, onPrev, onNext, onLast, onExit } = props;

  const atStart = index <= 0;
  const atEnd = index >= total;

  return (
    <View className="review-bar">
      <View className="review-title">
        <Text className="review-label">复盘</Text>
        <Text className="review-counter">
          {index} / {total}
        </Text>
      </View>

      <View className="review-controls">
        <View
          className={`review-btn ${atStart ? 'review-btn--disabled' : ''}`}
          onClick={() => !atStart && onFirst()}
        >
          ⏮
        </View>
        <View
          className={`review-btn ${atStart ? 'review-btn--disabled' : ''}`}
          onClick={() => !atStart && onPrev()}
        >
          ◀
        </View>
        <View
          className={`review-btn ${atEnd ? 'review-btn--disabled' : ''}`}
          onClick={() => !atEnd && onNext()}
        >
          ▶
        </View>
        <View
          className={`review-btn ${atEnd ? 'review-btn--disabled' : ''}`}
          onClick={() => !atEnd && onLast()}
        >
          ⏭
        </View>
        <View className="review-btn review-btn--exit" onClick={onExit}>
          退出
        </View>
      </View>
    </View>
  );
}
