import { Modal, Text, TouchableOpacity, View } from "react-native";

interface DailyHypeLimitModalProps {
  visible: boolean;
  onClose: () => void;
}

export function DailyHypeLimitModal({
  visible,
  onClose,
}: DailyHypeLimitModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/70 justify-center items-center px-6">
        <View className="bg-[#1a1a1a] rounded-3xl p-6 w-full max-w-sm border border-white/10">
          <View className="items-center mb-4">
            <View className="bg-white/10 rounded-full p-5 mb-4">
              <Text className="text-white text-4xl font-semibold">📸</Text>
            </View>
            <Text className="text-white text-2xl font-bold text-center mb-2">
              Moment Boosted
            </Text>
            <Text className="text-[#e0e0e0] text-base text-center leading-6 text-wrap">
              You've already boosted a moment today. Come back tomorrow to boost
              more!
            </Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            className="bg-primary rounded-xl py-4 mt-4"
            activeOpacity={0.8}
          >
            <Text className="text-white text-base font-semibold text-center">
              Got it
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
