import Animated from "react-native-reanimated";

export function HelloWave() {
  return (
    <Animated.Text
      style={{
        fontSize: 28,
        lineHeight: 32,
        marginTop: -6,
        animationName: {
          "50%": { transform: [{ rotate: "10deg" }] },
        },
        animationIterationCount: 3,
        animationDuration: "300ms",
      }}
    >
      👋
    </Animated.Text>
  );
}
