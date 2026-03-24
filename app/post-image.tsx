import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useMemo } from "react";
import {
  Dimensions,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Ionicons from "@expo/vector-icons/Ionicons";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const MIN_SCALE = 1;
const MAX_SCALE = 4;

export default function PostImageScreen() {
  const params = useLocalSearchParams<{ image: string; caption?: string }>();
  const imageUri = params.image;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          "worklet";
          savedScale.value = scale.value;
        })
        .onUpdate((e) => {
          "worklet";
          const newScale = savedScale.value * e.scale;
          scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
        }),
    [scale, savedScale]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          "worklet";
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        })
        .onUpdate((e) => {
          "worklet";
          const maxTx = Math.max(0, (scale.value - 1) * SCREEN_WIDTH * 0.5);
          const maxTy = Math.max(0, (scale.value - 1) * SCREEN_HEIGHT * 0.5);
          translateX.value = Math.max(
            -maxTx,
            Math.min(maxTx, savedTranslateX.value + e.translationX)
          );
          translateY.value = Math.max(
            -maxTy,
            Math.min(maxTy, savedTranslateY.value + e.translationY)
          );
        }),
    [translateX, translateY, savedTranslateX, savedTranslateY]
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [pinchGesture, panGesture]
  );

  const animatedImageStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  if (!imageUri) {
    return null;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* Blurred background: same image, cover fit, then blurred */}
      <View style={StyleSheet.absoluteFill}>
        <Image
          source={{ uri: imageUri }}
          style={styles.backgroundImage}
          contentFit="cover"
          placeholder={{ blurhash: "L47BAmj[%Mj[j[fQfQfQ~qj[ayj[" }}
        />
        <BlurView
          intensity={70}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      </View>
      {/* Zoomable sharp image on top */}
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.imageWrap, animatedImageStyle]}>
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            contentFit="contain"
            placeholder={{ blurhash: "L47BAmj[%Mj[j[fQfQfQ~qj[ayj[" }}
          />
        </Animated.View>
      </GestureDetector>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backButton}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Ionicons name="arrow-back" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  backgroundImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  imageWrap: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  backButton: {
    position: "absolute",
    top: 56,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
});
