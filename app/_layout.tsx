import { OfflineScreen } from "@/components/OfflineScreen";
import { AuthProvider } from "@/contexts/AuthContext";
import { NetworkProvider, useNetwork } from "@/contexts/NetworkContext";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";
import "../global.css";

export const unstable_settings = {
  anchor: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

function AppContent() {
  const { isConnected, isInternetReachable } = useNetwork();

  // Show offline screen if we've checked connectivity and there's no internet
  const isOffline =
    isConnected !== null &&
    isInternetReachable !== null &&
    (!isConnected || !isInternetReachable);

  if (isOffline) {
    return <OfflineScreen />;
  }

  return (
    <AuthProvider>
      <ThemeProvider value={DarkTheme}>
        <StatusBar translucent backgroundColor="transparent" style="light" />
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="welcome"
            options={{ animation: "fade", headerShown: false }}
          />
          <Stack.Screen
            name="auth"
            options={{ animation: "fade", headerShown: false }}
          />
          <Stack.Screen
            name="onboarding"
            options={{ animation: "fade", headerShown: false }}
          />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
          <Stack.Screen
            name="post-preview"
            options={{ animation: "fade", headerShown: false }}
          />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  useEffect(() => {
    async function prepare() {
      try {
        // Artificial delay for loading experience
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the application to render
        setAppIsReady(true);
        SplashScreen.hide();
      }
    }

    prepare();
  }, []);

  if (!appIsReady) {
    return null;
  }

  return (
    <NetworkProvider>
      <AppContent />
    </NetworkProvider>
  );
}
