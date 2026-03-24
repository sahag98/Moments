// @ts-nocheck
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

import { supabase } from "@/lib/supabase";

export const UpdateModal = () => {
  const [hasUpdate, setHasUpdate] = React.useState(false);

  async function fetchUpdate() {
    console.log("fetchUpdate");
    try {
      const { data: update } = await supabase.from("version").select("num");

      if (!update.length) {
        return;
      }

      if (update[0].num !== nativeApplicationVersion.toString()) {
        setHasUpdate(true);
      } else {
        setHasUpdate(false);
      }
    } catch (error) {
      console.log("fetchUpdate", error);
    }
  }

  React.useEffect(() => {
    fetchUpdate();
  }, []);

  const handleCloseModal = () => {
    setHasUpdate(false);
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={hasUpdate}
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
                    "https://play.google.com/store/apps/details?id=com.sahag98.prayerListApp"
                  );
                }
                if (Platform.OS === "ios") {
                  Linking.openURL(
                    "https://apps.apple.com/us/app/prayse-prayer-journal/id6443480347"
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
