import { Container } from "@/components/Container";
import { ImageEditorModal } from "@/components/ImageEditorModal";
import { useAuth } from "@/contexts/AuthContext";
import { registerForPushNotificationsAsync } from "@/lib/registerNotifications";
import { supabase } from "@/lib/supabase";
import { getStorageUrl } from "@/lib/utils";
import EvilIcons from "@expo/vector-icons/EvilIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function OnboardingScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const avatarUrl = getStorageUrl(profile?.avatar_url, "avatars");
  const [fullName, setFullName] = useState("");
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [agreedToEula, setAgreedToEula] = useState(false);

  // Pre-fill form if profile exists but just missing username
  useEffect(() => {
    async function getNotificationToken() {
      if (!user) return;
      const token = await registerForPushNotificationsAsync();

      const { error } = await supabase
        .from("profiles")
        .update({
          expo_token: token,
        })
        .eq("id", user.id);

      console.log("error: ", error);
    }
    getNotificationToken();
  }, [profile]);

  const pickImage = async () => {
    try {
      // Request permission
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Please grant permission to access your photos",
        );
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        setProfileImageUri(result.assets[0].uri);
        setShowImageEditor(true);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const handleImageEditorCancel = () => {
    setShowImageEditor(false);
    setProfileImageUri(null);
  };

  const handleImageEditorConfirm = async (editedUri: string) => {
    setShowImageEditor(false);
    await uploadImage(editedUri);
  };

  const uploadImage = async (uri: string): Promise<void> => {
    try {
      if (!user?.id) {
        throw new Error("User not found");
      }

      setUploading(true);

      // Get file extension
      const fileExtension = uri.split(".").pop() || "jpg";
      const fileName = `${user.id}/${Date.now()}.${fileExtension}`;
      const filePath = fileName;

      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert Uint8Array to ArrayBuffer
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from("avatars")
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExtension}`,
          upsert: true,
        });

      if (error) {
        console.error("Upload error:", error);
        throw error;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }

      // Refresh profile in context (don't redirect - user is on onboarding)
      await refreshProfile({ replaceToTabs: false });
      setProfileImageUri(null);
      Alert.alert("Success", "Profile picture updated!");
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert(
        "Error",
        error instanceof Error
          ? error.message
          : "Failed to update profile picture",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    if (!fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }

    if (!agreedToEula) {
      Alert.alert(
        "Agreement required",
        "Please agree to the Terms of Use and Community Guidelines to continue.",
      );
      return;
    }

    if (!user?.id) {
      Alert.alert("Error", "User not found");
      return;
    }

    // Generate a username from full name (you can make this more sophisticated)

    const username = `${fullName}`;

    // Check if username is more than 10 characters
    if (username.length > 10) {
      setUsernameError("Username must be 10 characters or less");
      return;
    }

    // Clear any previous errors
    setUsernameError(null);

    try {
      setUploading(true);

      // Avatar was already uploaded in pickImage/uploadImage and saved to profile
      const avatarUrl = profile?.avatar_url ?? null;

      // Update or insert profile
      const { error: updateError } = await supabase.from("profiles").upsert({
        id: user.id,
        full_name: fullName.trim(),
        username,
        avatar_url: avatarUrl,
        eula_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (updateError) {
        console.error("Update error:", updateError);
        Alert.alert("Error", "Failed to update profile");
        setUploading(false);
        return;
      }

      // Refresh profile in context
      await refreshProfile();

      // Navigation will be handled by index.tsx
      // Just reload to trigger navigation check
      router.replace("/");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Container>
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : insets.top}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingBottom: Platform.OS === "android" ? 100 : 40,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-md gap-4">
            <Text className="text-white text-3xl font-bold mb-2 text-center">
              Complete Your Profile
            </Text>

            {/* Profile Picture Section */}
            <View className="items-center mb-0">
              <TouchableOpacity
                onPress={pickImage}
                className="w-32 h-32 rounded-full bg-secondary items-center justify-center overflow-hidden border-2 border-white/20"
              >
                {profileImageUri ? (
                  <Image
                    source={{ uri: profileImageUri }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                ) : profile?.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                ) : avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="items-center gap-2">
                    {/* <Text className="text-white text-4xl mb-2">📷</Text> */}
                    {/* <Feather name="camera" size={35} color="white" /> */}
                    <EvilIcons name="camera" size={50} color="white" />
                    <Text className="text-white font-medium text-sm">
                      Tap to add
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              {uploading && (
                <Text className="text-gray-400 text-sm mt-2">Uploading...</Text>
              )}
            </View>

            {/* Full Name Input */}
            <View className="mb-0">
              <Text className="text-white text-lg font-semibold mb-2">
                Username
              </Text>
              <TextInput
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  // Clear error when user starts typing
                  if (usernameError) {
                    setUsernameError(null);
                  }
                }}
                placeholder="Enter a unique username"
                placeholderTextColor="#8a8a8a"
                selectionColor={"white"}
                className="bg-secondary text-white p-4 rounded-lg border border-white/20"
                autoCapitalize="words"
                autoCorrect={false}
              />
              {usernameError && (
                <Text className="text-red-500 text-sm mt-1">
                  {usernameError}
                </Text>
              )}
            </View>

            {/* EULA / Terms agreement */}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAgreedToEula((prev) => !prev);
              }}
              activeOpacity={0.7}
              className="flex-row items-center gap-3 mb-2"
            >
              <View className="pt-0.5">
                <Ionicons
                  name={agreedToEula ? "checkmark-circle" : "ellipse-outline"}
                  size={24}
                  color={agreedToEula ? "#3e64df" : "#8a8a8a"}
                />
              </View>
              <Text className="text-gray-300 text-sm flex-1">
                I agree to the Terms of Use and Community Guidelines. We have
                zero tolerance for objectionable content or abusive behavior.
              </Text>
            </TouchableOpacity>

            {/* Complete Button */}
            <TouchableOpacity
              onPress={handleComplete}
              disabled={uploading || !fullName.trim() || !agreedToEula}
              className={`bg-primary py-4 rounded-lg items-center ${
                uploading || !fullName.trim() || !agreedToEula
                  ? "opacity-50"
                  : ""
              }`}
            >
              {uploading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-semibold text-lg">
                  Complete Setup
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ImageEditorModal
        visible={showImageEditor}
        imageUri={profileImageUri}
        onCancel={handleImageEditorCancel}
        onConfirm={handleImageEditorConfirm}
      />
    </Container>
  );
}
