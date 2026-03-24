import { Container } from "@/components/Container";
import { useAuth } from "@/contexts/AuthContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect } from "react";
import { Alert, Platform, Text, TouchableOpacity, View } from "react-native";

export default function AuthScreen() {
  const {
    session,
    profile,
    loading,
    signInWithGoogle,
    signInWithApple,
    error,
    needsWelcome,
    refreshProfile,
  } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      console.log("attempting to sign in with google");
      await signInWithGoogle();
      router.replace("/(tabs)");
    } catch (err) {
      Alert.alert(
        "Sign In Error",
        err instanceof Error
          ? err.message
          : "Failed to sign in with Google. Please try again.",
      );
    }
  };

  const handleAppleSignIn = async () => {
    try {
      await signInWithApple();

      // Wait a bit for profile to be fetched, then refresh to ensure it's available
      setTimeout(async () => {
        console.log("Refreshing profile after Apple sign-in");
        await refreshProfile();
      }, 500);
    } catch (err) {
      Alert.alert(
        "Sign In Error",
        err instanceof Error
          ? err.message
          : "Failed to sign in with Apple. Please try again.",
      );
    }
  };

  // Handle navigation - all navigation logic is here in the auth screen
  useEffect(() => {
    if (loading) return; // Don't navigate while loading

    if (needsWelcome) {
      console.log("Navigating to welcome");
      router.replace("/welcome");
      return;
    }

    if (!session) {
      // No session, stay on auth screen
      return;
    }

    // Session exists, check profile
    if (profile) {
      if (!profile.username) {
        console.log("Navigating to onboarding (no username)");
        router.replace("/onboarding");
      } else {
        console.log("Navigating to tabs (has profile and username)");
        router.replace("/(tabs)");
      }
    } else {
      // Session exists but profile not loaded yet - wait a bit and refresh
      console.log("Session exists but profile not loaded, refreshing...");
      const timer = setTimeout(async () => {
        await refreshProfile();
        // After refresh, the useEffect will run again and navigate
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [session, profile, loading, needsWelcome, refreshProfile]);

  return (
    <Container>
      <View className="flex-1 items-center justify-center">
        <View className="w-full">
          <Image
            source={require("@/assets/images/icon.png")}
            style={{
              width: 150,
              height: 150,
              marginBottom: 20,
              // tintColor: "#0561e0",
              borderRadius: 30,
              alignSelf: "center",
            }}
            className="w-20 h-20"
          />
          <Text className="text-5xl font-bold text-white text-center mb-4">
            Moments
          </Text>
          <Text className="text-gray-300 text-center text-wrap truncate text-lg mb-6">
            Capture and share intentional moments from your everyday life.
          </Text>

          {Platform.OS === "ios" ? (
            <View className="w-full gap-0">
              <TouchableOpacity
                onPress={handleAppleSignIn}
                className="bg-primary mb-3 border-2 border-primary rounded-lg p-4 flex-row items-center justify-center"
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={24} color="#ffff" />
                <Text className="text-white font-semibold text-lg ml-3">
                  Continue with Apple
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleGoogleSignIn}
                className="bg-none border-2 border-primary rounded-lg p-4 flex-row items-center justify-center"
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={24} color="#3e64df" />
                <Text className="text-primary font-semibold text-lg ml-3">
                  Continue with Google
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="w-full gap-0">
              <TouchableOpacity
                onPress={handleGoogleSignIn}
                className="bg-primary rounded-lg py-4 px-6 mb-3 flex-row items-center justify-center"
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={24} color="#fff" />
                <Text className="text-white font-semibold text-lg ml-3">
                  Continue with Google
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleAppleSignIn}
                className="bg-none border-2 border-primary rounded-lg py-4 px-6 flex-row items-center justify-center"
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={24} color="#3e64df" />
                <Text className="text-primary font-semibold text-lg ml-3">
                  Continue with Apple
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {error && (
            <View className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-2">
              <Text className="text-red-400 text-center">
                Something went wrong. Please try again.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Container>
  );
}
