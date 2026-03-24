import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { session, profile, loading, needsWelcome } = useAuth();

  // Show loading indicator while auth is initializing
  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#3e64df" />
      </View>
    );
  }

  // Redirect based on auth state
  if (needsWelcome) {
    return <Redirect href="/welcome" />;
  }

  if (profile && !profile.username) {
    return <Redirect href="/onboarding" />;
  }

  if (session || profile) {
    return <Redirect href="/(tabs)" />;
  }

  // No session, redirect to auth
  return <Redirect href="/auth" />;
}
