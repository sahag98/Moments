import { useNetwork } from "@/contexts/NetworkContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Container } from "./Container";

export function OfflineScreen() {
  const { checkNetwork, isChecking } = useNetwork();

  const handleTryAgain = async () => {
    await checkNetwork();
  };

  return (
    <Container>
      <View className="flex-1 items-center justify-center">
        <View className="mb-8 opacity-90">
          <Ionicons name="cloud-offline-outline" size={80} color="#fff" />
        </View>
        <Text className="text-white text-2xl font-bold text-center mb-4 tracking-wide">
          You're Offline
        </Text>

        <Text className="text-[#e0e0e0] text-base text-center font-light px-2 mb-8">
          Don't worry, we'll be here when you're ready to reconnect!
        </Text>

        <TouchableOpacity
          onPress={handleTryAgain}
          disabled={isChecking}
          className="bg-[#0052c8] border border-white/20 px-6 py-3 rounded-xl items-center justify-center min-w-[140px]"
          activeOpacity={0.7}
        >
          {isChecking ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <View className="flex-row items-center gap-2">
              <Ionicons name="refresh-outline" size={20} color="#fff" />
              <Text className="text-white text-base font-semibold">
                Try Again
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </Container>
  );
}
