import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const STORAGE_KEY = "@moments_sneak_peek_update_viewed_v1";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/** App primary — border & accents */
const PRIMARY_DARK = "#005bb5";
const PRIMARY = "#0071e2";
const PRIMARY_LIGHT = "#4da3ff";
const PRIMARY_SOFT = "rgba(0, 113, 226, 0.14)";
const PRIMARY_FAINT = "rgba(0, 113, 226, 0.06)";

const CARD_SURFACE = "#161616";

/** Shared chrome: gradient frame + inner surface (matches home teaser + modal) */
function PrimaryGradientFrame({
  children,
  borderRadius = 20,
}: {
  children: React.ReactNode;
  borderRadius?: number;
}) {
  return (
    <LinearGradient
      colors={[PRIMARY_DARK, PRIMARY, PRIMARY_LIGHT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius,
        padding: 2,
      }}
    >
      <View
        className="overflow-hidden"
        style={{
          borderRadius: borderRadius - 2,
          backgroundColor: CARD_SURFACE,
        }}
      >
        <LinearGradient
          colors={[PRIMARY_SOFT, PRIMARY_FAINT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: borderRadius - 2 }}
        >
          {children}
        </LinearGradient>
      </View>
    </LinearGradient>
  );
}

function HeaderIconBadge() {
  return (
    <LinearGradient
      colors={[PRIMARY_DARK, PRIMARY_LIGHT]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="sparkles" size={24} color="#fff" />
    </LinearGradient>
  );
}

/** Upcoming features — shown in the modal list */
export const UPCOMING_FEATURES_PLACEHOLDER = [
  "Tag people on your posts",
  "Capture photos with the volume buttons",
  "Posting streak, showing consecutive days you’ve posted",
  "Notification center for all your alerts",
  "Profile bio",
];

const SNEAK_PEEK_TITLE = "What’s next";
const SNEAK_PEEK_SUBTITLE =
  "A quick look at what we’re building for the next version of Moments.";

const FEEDBACK_INVITE =
  "Have an idea we didn’t mention? We’d love to hear you’re thoughts.";

export function SneakPeekUpdateCard() {
  const [hydrated, setHydrated] = useState(false);
  const [showCard, setShowCard] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && v === "true") {
          setShowCard(false);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openModal = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* still show modal */
    }
    setShowCard(false);
    setModalVisible(true);
  };
  const handlePressFeedback = async () => {
    try {
      await Linking.openURL("https://moments.canny.io/feature-requests");
    } catch (error) {
      console.error("Failed to open feedback URL:", error);
    } finally {
      setModalVisible(false);
    }
  };

  const closeModal = () => setModalVisible(false);

  if (!hydrated) {
    return null;
  }

  if (!showCard && !modalVisible) {
    return null;
  }

  return (
    <>
      {showCard ? (
        <View className="mx-1 mb-3">
          <PrimaryGradientFrame borderRadius={20}>
            <View className="p-4">
              <View className="flex  flex-col gap-3">
                <View className="flex-row items-center gap-2">
                  <HeaderIconBadge />
                  <Text className="text-white text-xl font-bold tracking-tight">
                    {SNEAK_PEEK_TITLE} 🙌
                  </Text>
                </View>
                <View className="">
                  <Text className="text-gray-300 text-base leading-5 mt-1.5">
                    {SNEAK_PEEK_SUBTITLE}
                  </Text>
                  <TouchableOpacity
                    onPress={openModal}
                    activeOpacity={0.88}
                    className="mt-4 w-full flex-row items-center justify-center gap-2 py-3 rounded-xl"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    <Text className="text-white font-semibold text-[15px]">
                      View
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </PrimaryGradientFrame>
        </View>
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={modalVisible}
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <View
          className="flex-1 justify-center items-center px-5"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        >
          <Pressable
            className="absolute inset-0"
            onPress={closeModal}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          <View
            className="w-full"
            style={{
              maxWidth: 400,
              maxHeight: SCREEN_HEIGHT * 0.78,
            }}
          >
            <PrimaryGradientFrame borderRadius={22}>
              <View className="p-5 pb-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-row items-start gap-3 flex-1 min-w-0">
                    <HeaderIconBadge />
                    <View className="flex-1 min-w-0 pt-0.5">
                      <Text className="text-white text-xl font-bold leading-6">
                        Coming in the next update
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={closeModal}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    className="p-2 rounded-full bg-white/10"
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  className="mt-4"
                  style={{ maxHeight: SCREEN_HEIGHT * 0.42 }}
                  showsVerticalScrollIndicator={false}
                  bounces
                >
                  {UPCOMING_FEATURES_PLACEHOLDER.map((line, i) => (
                    <View
                      key={i}
                      className="flex-row items-center gap-3 py-3 border-b border-white/10"
                    >
                      <View
                        className="w-7 h-7 rounded-lg items-center justify-center mt-0.5 shrink-0"
                        style={{
                          backgroundColor: "rgba(0, 113, 226, 0.22)",
                        }}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={PRIMARY_LIGHT}
                        />
                      </View>
                      <Text className="text-gray-200 text-[15px] leading-6 flex-1">
                        {line}
                      </Text>
                    </View>
                  ))}
                </ScrollView>

                <Text className="text-gray-300 text-sm leading-5 mt-4 px-0.5">
                  {FEEDBACK_INVITE}
                </Text>
                <TouchableOpacity
                  onPress={handlePressFeedback}
                  className="bg-primary p-3 rounded-xl items-center w-full mt-4"
                >
                  <Text className="text-white text-sm font-semibold">
                    Feedback
                  </Text>
                </TouchableOpacity>
              </View>
            </PrimaryGradientFrame>
          </View>
        </View>
      </Modal>
    </>
  );
}
