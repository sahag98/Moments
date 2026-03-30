import { OfflineScreen } from "@/components/OfflineScreen";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NetworkProvider, useNetwork } from "@/contexts/NetworkContext";
import { createAppQueryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { vexo } from "vexo-analytics";
import "../global.css";

export const unstable_settings = {
  // Let the index route handle initial routing based on auth state
  initialRouteName: "index",
};

SplashScreen.preventAutoHideAsync();

if (!__DEV__) {
  vexo(process.env.EXPO_PUBLIC_VEXO_API_KEY!);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.setOptions({
  fade: true,
});

function AuthInitializedContent() {
  const { loading } = useAuth();
  const { isConnected, isInternetReachable } = useNetwork();
  const [splashHidden, setSplashHidden] = useState(false);

  // Hide splash screen once auth is initialized
  useEffect(() => {
    // Only hide splash when loading is complete AND we have network status
    // isConnected can be null initially, so we wait for it to be determined
    const shouldHide =
      !loading && isConnected !== null && isInternetReachable !== null;

    if (shouldHide && !splashHidden) {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {
          // Ignore errors if splash screen is already hidden
        });
        setSplashHidden(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, isConnected, isInternetReachable, splashHidden]);

  // Show offline screen if we've checked connectivity and there's no internet
  const isOffline =
    isConnected !== null &&
    isInternetReachable !== null &&
    (!isConnected || !isInternetReachable);

  if (isOffline) {
    return <OfflineScreen />;
  }

  // Always render the Stack - it will handle routing based on auth state
  // Don't wait for loading to complete, let the routes handle redirects
  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar translucent backgroundColor="transparent" style="light" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: "#050505" },
        }}
      >
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
        <Stack.Screen
          name="post-image"
          options={{
            animation: "fade",
            headerShown: false,
            presentation: "fullScreenModal",
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

function AppContent() {
  return (
    <AuthProvider>
      <AuthInitializedContent />
    </AuthProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => createAppQueryClient());

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <AppContent />
        </NetworkProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
