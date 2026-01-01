import { useAuth } from "@/contexts/AuthContext";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator } from "react-native";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();

  useEffect(() => {
    // Only redirect if loading is complete
    if (!loading) {
      if (!session) {
        // No session - redirect to auth
        router.replace("/auth");
      } else if (session && !profile?.username) {
        // Has session but no username - redirect to onboarding
        // Only redirect if we're sure the profile has been checked
        router.replace("/onboarding");
      }
    }
  }, [session, profile, loading]);

  // // Show loading screen while checking auth state
  // if (loading) {
  //   return (
  //     <View className="flex-1 items-center justify-center bg-black">
  //       <ActivityIndicator size="large" color="#fff" />
  //       <Text className="text-white mt-4">Loading...</Text>
  //     </View>
  //   );
  // }

  // Don't render anything if redirecting
  if (!session) {
    return <ActivityIndicator size="large" color="#fff" />; // Will redirect to auth
  }

  if (!profile?.username) {
    return <ActivityIndicator size="large" color="#fff" />; // Will redirect to onboarding
  }

  return <>{children}</>;
}
