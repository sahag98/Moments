import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { getStorageUrl } from "@/lib/utils";
import Ionicons from "@expo/vector-icons/Ionicons";
import Octicons from "@expo/vector-icons/Octicons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

export default function TabLayout() {
  const { profile } = useAuth();
  const avatarUrl = getStorageUrl(profile?.avatar_url, "avatars");

  console.log("on tabs layout: profile", profile);

  if (!profile) {
    console.log("no profile");
  }

  // if (!profile) {
  //   return <Redirect href="/auth" />;
  // }

  if (profile && !profile.username) {
    return <Redirect href="/onboarding" />;
  }

  return (
    // <ProtectedRoute>
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        animation: "shift",
        tabBarActiveTintColor: Colors["dark"].tint,
        tabBarStyle: {
          position: "absolute",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 10,
        },
        headerShown: false,
        tabBarShowLabel: false,
        tabBarButton: HapticTab,
        tabBarBackground: () => (
          <BlurView
            intensity={30}
            style={{
              ...StyleSheet.absoluteFillObject,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              overflow: "hidden",
              backgroundColor: "rgba(5, 5, 5, 0.5)",
            }}
          />
        ),
      }}
    >
      <Tabs.Protected guard={!!profile}>
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => (
              <Octicons
                name={focused ? "home-fill" : "home"}
                size={24}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="camera"
          options={{
            title: "Camera",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "camera" : "camera-outline"}
                size={28}
                color={focused ? color : "#a8a7a7"}
              />
            ),
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => {
              if (avatarUrl) {
                return (
                  <View
                    style={[
                      styles.avatarContainer,
                      focused && { borderColor: color },
                    ]}
                  >
                    <Image
                      source={{ uri: profile?.avatar_url || "" }}
                      style={styles.avatar}
                      contentFit="cover"
                    />
                  </View>
                );
              }
              return (
                <Ionicons
                  name={focused ? "person-sharp" : "person-outline"}
                  size={24}
                  color={focused ? color : "#a8a7a7"}
                />
              );
            },
          }}
        />
      </Tabs.Protected>
    </Tabs>
    // </ProtectedRoute>
  );
}

const styles = StyleSheet.create({
  avatarContainer: {
    width: 26,
    height: 26,
    borderRadius: 50,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "#989898",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
});
