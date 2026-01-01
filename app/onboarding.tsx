import { Container } from "@/components/Container";
import { useAuth } from "@/contexts/AuthContext";
import { registerForPushNotificationsAsync } from "@/lib/registerNotifications";
import { supabase } from "@/lib/supabase";
import EvilIcons from "@expo/vector-icons/EvilIcons";
import * as FileSystem from "expo-file-system/legacy";
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

export default function OnboardingScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

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
          "Please grant permission to access your photos"
        );
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProfileImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      if (!user?.id) {
        throw new Error("User not found");
      }

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

      // Convert Uint8Array to ArrayBuffer (required by Supabase storage)
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
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

      return publicUrl;
    } catch (error) {
      console.error("Error uploading image:", error);
      return null;
    }
  };

  const handleComplete = async () => {
    if (!fullName.trim()) {
      Alert.alert("Error", "Please enter your full name");
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

      let avatarUrl: string | null = null;

      // Upload image if selected
      if (profileImageUri) {
        avatarUrl = await uploadImage(profileImageUri);
        if (!avatarUrl) {
          Alert.alert("Error", "Failed to upload profile picture");
          setUploading(false);
          return;
        }
      }

      // Update or insert profile
      const { error: updateError } = await supabase.from("profiles").upsert({
        id: user.id,
        full_name: fullName.trim(),
        username,
        avatar_url: avatarUrl,
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ScrollView
          contentContainerClassName="flex-grow items-center justify-center"
          keyboardShouldPersistTaps="handled"
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

            {/* Complete Button */}
            <TouchableOpacity
              onPress={handleComplete}
              disabled={uploading || !fullName.trim()}
              className={`bg-primary py-4 rounded-lg items-center ${
                uploading || !fullName.trim() ? "opacity-50" : ""
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
    </Container>
  );
}
