import { useState } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

/**
 * The tactile response for every tappable surface: a quick scale down that
 * settles back, so a press feels like a press.
 */
export function PressableScale({
  children,
  style,
  ...props
}: PressableProps & { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [scale] = useState(() => new Animated.Value(1));

  const animate = (to: number) => {
    Animated.timing(scale, {
      toValue: to,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        animate(0.98);
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animate(1);
        props.onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
