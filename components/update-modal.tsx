import {
  APP_VERSION_QUERY_KEY,
  fetchAppVersionNum,
} from "@/lib/queries/appVersion";
import { useQuery } from "@tanstack/react-query";
import { nativeApplicationVersion } from "expo-application";
import React from "react";
import {
  Linking,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const VERSION_STALE_MS = 24 * 60 * 60 * 1000;

export const UpdateModal = () => {
  const [dismissed, setDismissed] = React.useState(false);

  const { data: serverVersion } = useQuery({
    queryKey: APP_VERSION_QUERY_KEY,
    queryFn: fetchAppVersionNum,
    staleTime: VERSION_STALE_MS,
    gcTime: 48 * 60 * 60 * 1000,
  });

  const versionMismatch =
    serverVersion != null &&
    serverVersion !== nativeApplicationVersion.toString();

  const visible = versionMismatch && !dismissed;

  const handleCloseModal = () => {
    setDismissed(true);
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={handleCloseModal}
      statusBarTranslucent
    >
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      >
        <View className="bg-secondary p-4 rounded-xl dark:bg-dark-secondary w-10/12">
          <View className="gap-4 items-center">
            <Text className=" text-2xl font-bold text-white dark:text-dark-primary">
              New Update ✅
            </Text>
            <Text className="text-white  mt-1 text-center font-inter-regular">
              Update your app to the latest version and check out our newly
              added features.
            </Text>
          </View>
          <View className="mt-6 items-center justify-between">
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === "android") {
                  Linking.openURL(
                    "https://play.google.com/store/apps/details?id=com.sahag98.moments&pcampaignid=web_share",
                  );
                }
                if (Platform.OS === "ios") {
                  Linking.openURL(
                    "https://apps.apple.com/us/app/capture-moments/id6755897645",
                  );
                }
              }}
              className=" bg-primary justify-center items-center w-full p-3 rounded-lg"
            >
              <Text className=" text-white text-lg font-semibold">
                Update Now
              </Text>
            </TouchableOpacity>
            <TouchableOpacity className="mt-2" onPress={handleCloseModal}>
              <Text className=" p-2 font-medium text-white/50">Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
