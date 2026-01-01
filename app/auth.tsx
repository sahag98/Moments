import { Container } from "@/components/Container";
import { useAuth } from "@/contexts/AuthContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { Redirect } from "expo-router";
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
  } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      Alert.alert(
        "Sign In Error",
        err instanceof Error
          ? err.message
          : "Failed to sign in with Google. Please try again."
      );
    }
  };

  const handleAppleSignIn = async () => {
    try {
      await signInWithApple();
    } catch (err) {
      Alert.alert(
        "Sign In Error",
        err instanceof Error
          ? err.message
          : "Failed to sign in with Apple. Please try again."
      );
    }
  };

  // Show loading during initial auth check only (when no session)
  // if (loading && !session) {
  //   return (
  //     <Container>
  //       <View className="flex-1 items-center justify-center">
  //         <ActivityIndicator size="large" color="#fff" />
  //         <Text className="text-white mt-4">
  //           Loading checking authentication...
  //         </Text>
  //       </View>
  //     </Container>
  //   );
  // }

  // // If user has a session, render empty container and let layout handle routing
  // // Layout will redirect to onboarding or tabs based on profile state
  // if (session) {
  //   return (
  //     <Container>
  //       <Text>Loading checking authentication...</Text>
  //       <View />
  //     </Container>
  //   );
  // }

  if (needsWelcome) {
    return <Redirect href="/welcome" />;
  }

  if (profile && !profile.username) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Container>
      <View className="flex-1 items-center justify-center">
        <View className="w-full">
          <Image
            source={require("@/assets/images/image-logo.png")}
            style={{
              width: 200,
              height: 200,
              tintColor: "#0561e0",
              alignSelf: "center",
            }}
            className="w-20 h-20"
          />
          <Text className="text-5xl font-bold text-white text-center mb-2">
            Moments
          </Text>
          <Text className="text-gray-300 text-center text-wrap truncate text-lg mb-6">
            Start capturing and sharing intentional moments from your day.
          </Text>

          {error && (
            <View className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-6">
              <Text className="text-red-400 text-center">
                {error.message || "An authentication error occurred"}
              </Text>
            </View>
          )}
          {Platform.OS === "ios" ? (
            <>
              <TouchableOpacity
                onPress={handleAppleSignIn}
                className="bg-primary mb-4 border-2 border-primary rounded-lg p-4 flex-row items-center justify-center"
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
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={handleGoogleSignIn}
                className="bg-primary rounded-lg py-4 px-6 mb-4 flex-row items-center justify-center"
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={24} color="#000" />
                <Text className="text-background font-semibold text-lg ml-3">
                  Continue with Google
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleAppleSignIn}
                className="bg-black border-2 border-white rounded-lg py-4 px-6 flex-row items-center justify-center"
                activeOpacity={0.8}
              >
                <Ionicons name="logo-apple" size={24} color="#fff" />
                <Text className="text-white font-semibold text-lg ml-3">
                  Continue with Apple
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Container>
  );
}
