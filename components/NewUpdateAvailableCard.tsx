import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Linking, Platform, Text, TouchableOpacity, View } from "react-native";

const DISMISSED_KEY = "@new_update_available_dismissed_v1";

/** App primary — border & accents (match `SneakPeekUpdateCard`). */
const PRIMARY_DARK = "#005bb5";
const PRIMARY = "#0071e2";
const PRIMARY_LIGHT = "#4da3ff";
const PRIMARY_SOFT = "rgba(0, 113, 226, 0.14)";
const PRIMARY_FAINT = "rgba(0, 113, 226, 0.06)";
const CARD_SURFACE = "#161616";

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

function openStoreLink() {
  if (Platform.OS === "android") {
    return Linking.openURL(
      "https://play.google.com/store/apps/details?id=com.sahag98.moments&pcampaignid=web_share",
    );
  }
  if (Platform.OS === "ios") {
    return Linking.openURL(
      "https://apps.apple.com/us/app/capture-moments/id6755897645",
    );
  }
}

export function NewUpdateAvailableCard() {
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(DISMISSED_KEY);
        if (!cancelled) setDismissed(v === "true");
      } catch {
        if (!cancelled) setDismissed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed) return null;

  const handlePressUpdate = async () => {
    try {
      await AsyncStorage.setItem(DISMISSED_KEY, "true");
      setDismissed(true);
    } finally {
      void openStoreLink();
    }
  };

  return (
    <View className="mx-1 mb-3">
      <PrimaryGradientFrame borderRadius={20}>
        <View className="p-4">
          <View className="flex-row items-center gap-2">
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
              <Ionicons name="alert-circle" size={24} color="#fff" />
            </LinearGradient>
            <Text className="text-white text-xl font-bold tracking-tight">
              Update Reminder
            </Text>
          </View>

          <Text className="text-gray-300 text-base leading-5 mt-3">
            If you haven't already, make sure to update your app to the latest
            version to ensure all parts of the app work properly.
          </Text>

          <TouchableOpacity
            onPress={handlePressUpdate}
            activeOpacity={0.88}
            className="mt-4 w-full flex-row items-center justify-center gap-2 py-3 rounded-xl"
            style={{ backgroundColor: PRIMARY }}
          >
            <Text className="text-white font-semibold text-[15px]">Update</Text>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </PrimaryGradientFrame>
    </View>
  );
}
