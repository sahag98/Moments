import { Container } from "@/components/Container";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Directions,
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  runOnJS,
} from "react-native-reanimated";

const WELCOME_COMPLETED_KEY = "@welcome_completed";

const slides = [
  {
    id: 1,
    title: "Welcome to Moments",
    description:
      "An app that helps you capture and share unique moments from your day.",
    emoji: (
      <Image
        source={require("@/assets/images/moments-LOGO.png")}
        style={{
          width: 120,
          height: 120,
          alignSelf: "center",
        }}
      />
    ),
  },
  {
    id: 2,
    title: "Share",
    description:
      "Take intentional photos that you'll want to remember and share.",
    emoji: (
      <Image
        source={require("@/assets/images/people.png")}
        style={{
          width: 120,
          height: 120,
          alignSelf: "center",
        }}
      />
    ),
  },
  {
    id: 3,
    title: "Intentional",
    description:
      "One photo a day to slow down and capture the moments that matter.",
    emoji: (
      <Image
        source={require("@/assets/images/camera.png")}
        style={{
          width: 120,
          height: 120,
          alignSelf: "center",
        }}
      />
    ),
  },
  // {
  //   id: 4,
  //   title: "Enjoy",
  //   description: "Enjoy your photos and relive the moment.",
  //   emoji: "🎉",
  // },
];

export default function WelcomeScreen() {
  const { refreshWelcomeStatus } = useAuth();
  const [screenIndex, setScreenIndex] = useState(0);
  const data = slides[screenIndex];

  const endOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(WELCOME_COMPLETED_KEY, "true");
      // Refresh welcome status in context
      await refreshWelcomeStatus();
      // Navigation will be handled by index.tsx
      router.replace("/");
    } catch (error) {
      console.error("Error saving welcome completion:", error);
    }
  }, [refreshWelcomeStatus]);

  const onContinue = useCallback(() => {
    const isLastScreen = screenIndex === slides.length - 1;
    if (isLastScreen) {
      endOnboarding();
    } else {
      setScreenIndex((prev) => prev + 1);
    }
  }, [screenIndex, endOnboarding]);

  const onBack = useCallback(() => {
    const isFirstScreen = screenIndex === 0;
    if (isFirstScreen) {
      endOnboarding();
    } else {
      setScreenIndex((prev) => prev - 1);
    }
  }, [screenIndex, endOnboarding]);

  const swipes = useMemo(() => {
    const leftFling = Gesture.Fling()
      .direction(Directions.LEFT)
      .onEnd(() => {
        "worklet";
        runOnJS(onContinue)();
      });

    const rightFling = Gesture.Fling()
      .direction(Directions.RIGHT)
      .onEnd(() => {
        "worklet";
        runOnJS(onBack)();
      });

    return Gesture.Race(leftFling, rightFling);
  }, [onContinue, onBack]);

  return (
    <Container>
      {/* Progress Bar */}
      <View className="flex-row gap-2 mx-4 mt-4">
        {slides.map((_, index) => (
          <View
            key={index}
            className="flex-1 h-1 bg-gray-700 rounded-lg"
            style={{
              backgroundColor: index === screenIndex ? "#fff" : "#4a4a4a",
            }}
          />
        ))}
      </View>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={swipes}>
          <Animated.View
            className="flex-1"
            key={screenIndex}
            collapsable={false}
          >
            {/* Centered Content - Emoji, Title, Description */}
            <View className="flex-1 gap-4 justify-center items-center px-5">
              {/* Emoji Icon */}
              <Animated.View
                className="rounded-3xl overflow-hidden mb-2 items-center justify-center"
                style={{ height: 120, width: 120 }}
                entering={FadeIn}
                exiting={FadeOut}
              >
                {data.emoji}
              </Animated.View>

              {/* Title */}
              <Animated.Text
                entering={SlideInRight}
                exiting={SlideOutLeft}
                className="text-white text-4xl font-bold text-center"
              >
                {data.title}
              </Animated.Text>

              {/* Description */}
              <Animated.Text
                entering={SlideInRight.delay(50)}
                exiting={SlideOutLeft}
                className="text-gray-300 text-base mt-0 text-center max-w-xs"
              >
                {data.description}
              </Animated.Text>
            </View>

            {/* Bottom Buttons - Fixed at bottom */}
            <View className="flex-row w-full items-center gap-5 px-5 pb-12">
              <Pressable
                onPress={onContinue}
                className="bg-primary p-4 flex-1 rounded-xl justify-center items-center"
              >
                <Text className="text-white font-semibold text-lg">
                  {screenIndex === slides.length - 1
                    ? "Get Started"
                    : "Continue"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Container>
  );
}
