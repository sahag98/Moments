import Ionicons from "@expo/vector-icons/Ionicons";
import { Skia, useCanvasRef } from "@shopify/react-native-skia";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PixelRatio,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Container } from "@/components/Container";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getStorageUrl } from "@/lib/utils";
import { useHypeStore } from "@/store/hypeStore";
import { useStreakStore } from "@/store/streakStore";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const PADDING = 16;
const GAP = 16;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - PADDING * 2 - GAP) / 2; // 2 columns with padding and gap

interface Post {
  id: number;
  image: string;
  created_at: string;
}

export default function ProfileScreen() {
  const { user, profile, signOut, deleteAccount, refreshProfile } = useAuth();
  const { syncWithSupabase: syncStreakWithSupabase } = useStreakStore();
  const { syncWithSupabase: syncHypeWithSupabase } = useHypeStore();
  const avatarUrl = getStorageUrl(profile?.avatar_url, "avatars");
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [selectedPostImage, setSelectedPostImage] = useState<string | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [deletingAllPosts, setDeletingAllPosts] = useState(false);
  const canvasRef = useCanvasRef();
  const pixelDensity = PixelRatio.get();

  // Blue glow effect shader for logo
  const blueGlowEffect = useMemo(() => {
    const source = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float2 resolution;
uniform float glowRadius;
uniform float glowIntensity;

half4 main(float2 xy) {
  // Get the original image color
  half4 originalColor = image.eval(xy);
  
  // Calculate UV coordinates
  float2 uv = xy / resolution;
  
  // Blue glow color (#0561e0 = RGB(5, 97, 224))
  float3 glowColor = float3(0.0196, 0.3804, 0.8784);
  
  // Sample surrounding pixels to create glow
  // Use constant loop bound (16 samples) - SKSL requires compile-time constants
  const int SAMPLES = 16;
  float glowAlpha = 0.0;
  float step = glowRadius / float(SAMPLES);
  
  for (int i = 0; i < SAMPLES; i++) {
    float angle = (float(i) / float(SAMPLES)) * 6.28318; // 2 * PI
    float2 offset = float2(cos(angle), sin(angle)) * step * float(i + 1);
    float2 sampleUV = uv + offset / resolution;
    
    // Sample the image at offset position
    half4 sampleColor = image.eval(sampleUV * resolution);
    
    // Accumulate glow based on alpha of sampled pixels
    glowAlpha += sampleColor.a * (1.0 - float(i) / float(SAMPLES));
  }
  
  glowAlpha = glowAlpha / float(SAMPLES) * glowIntensity;
  
  // Blend original color with glow
  float3 finalColor = originalColor.rgb + glowColor * glowAlpha;
  
  return half4(
    clamp(finalColor.r, 0.0, 1.0),
    clamp(finalColor.g, 0.0, 1.0),
    clamp(finalColor.b, 0.0, 1.0),
    max(originalColor.a, glowAlpha)
  );
}
`);
    if (!source) {
      console.error("Failed to create glow effect");
      return null;
    }
    return source;
  }, []);

  const { top, bottom } = useSafeAreaInsets();

  // Fetch user's posts from the past week
  const fetchUserPosts = async () => {
    if (!user?.id) return;

    try {
      setLoadingPosts(true);
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const oneWeekAgoISO = oneWeekAgo.toISOString();

      const { data, error } = await supabase
        .from("posts")
        .select("id, image, created_at")
        .eq("user_id", user.id)
        .gte("created_at", oneWeekAgoISO)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching user posts:", error);
        return;
      }

      if (data) {
        setUserPosts(data as Post[]);
      }
    } catch (error) {
      console.error("Error fetching user posts:", error);
    } finally {
      setLoadingPosts(false);
    }
  };

  // Sync streak and hype from Supabase when profile loads
  useEffect(() => {
    if (profile?.streak !== undefined) {
      syncStreakWithSupabase(profile.streak);
    }
    if (profile?.hype !== undefined) {
      syncHypeWithSupabase(profile.hype);
    }
  }, [
    profile?.streak,
    profile?.hype,
    syncStreakWithSupabase,
    syncHypeWithSupabase,
  ]);

  // Fetch user posts when component mounts or user changes
  useEffect(() => {
    fetchUserPosts();
  }, [user?.id]);

  // Set up realtime subscription for profile updates (hype, streak, etc.)
  useEffect(() => {
    if (!user?.id) return;

    const channelName = `profile_updates_${user.id}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const updatedProfile = payload.new as typeof profile;
          console.log("Profile updated via realtime:", updatedProfile);

          // Refresh profile to get latest data
          refreshProfile();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Subscribed to profile updates channel");
        } else if (status === "CHANNEL_ERROR") {
          console.error("Profile channel error:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshProfile]);

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
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image");
    }
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

      // Refresh profile in context
      await refreshProfile();
      setProfileImageUri(null);
      Alert.alert("Success", "Profile picture updated!");
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert("Error", "Failed to update profile picture");
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSavePost = (imageUrl: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPostImage(imageUrl);
    setShowSaveModal(true);
  };

  const confirmSavePost = async () => {
    if (!selectedPostImage) return;

    try {
      setSaving(true);
      setShowSaveModal(false);

      // Request media library permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "Please grant permission to save images to your gallery"
        );
        return;
      }

      // Download the image from URL first
      const tempImageUri = `${
        FileSystem.cacheDirectory
      }temp_post_${Date.now()}.jpg`;
      const downloadResult = await FileSystem.downloadAsync(
        selectedPostImage,
        tempImageUri
      );

      if (!downloadResult.uri) {
        throw new Error("Failed to download image");
      }

      // Read images as base64
      const postImageBase64 = await FileSystem.readAsStringAsync(
        downloadResult.uri,
        {
          encoding: FileSystem.EncodingType.Base64,
        }
      );

      // Load images into Skia using Data.fromBase64
      const postImageData = Skia.Data.fromBase64(postImageBase64);
      const postSkiaImage = Skia.Image.MakeImageFromEncoded(postImageData);

      if (!postSkiaImage) {
        throw new Error("Failed to load image for composition");
      }

      // Use standard post dimensions (1080x1350)
      const imageWidth = 1080;
      const imageHeight = 1350;
      const scaledWidth = imageWidth * pixelDensity;
      const scaledHeight = imageHeight * pixelDensity;

      // Create a surface to composite the image with logo
      const surface = Skia.Surface.Make(scaledWidth, scaledHeight);
      if (!surface) {
        throw new Error("Failed to create canvas surface");
      }

      const canvas = surface.getCanvas();
      canvas.clear(Skia.Color("transparent"));

      // Draw the post image (scale to fit the canvas)
      const postWidth = postSkiaImage.width();
      const postHeight = postSkiaImage.height();
      const scaleX = scaledWidth / postWidth;
      const scaleY = scaledHeight / postHeight;
      canvas.save();
      canvas.scale(scaleX, scaleY);
      canvas.drawImage(postSkiaImage, 0, 0);
      canvas.restore();

      // Capture the canvas
      const snapshot = surface.makeImageSnapshot();
      if (!snapshot) {
        throw new Error("Failed to capture canvas");
      }

      // Encode to PNG
      const pngData = snapshot.encodeToBase64();
      if (!pngData) {
        throw new Error("Failed to encode image");
      }

      // Save to a temporary file
      const fileName = `moments_${Date.now()}.png`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, pngData, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Save to gallery
      await MediaLibrary.createAssetAsync(fileUri);

      // Clean up temp files
      await FileSystem.deleteAsync(tempImageUri, { idempotent: true });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Image saved to your gallery!");
    } catch (error) {
      console.error("Error saving image:", error);
      Alert.alert("Error", "Failed to save image to gallery");
    } finally {
      setSaving(false);
      setSelectedPostImage(null);
    }
  };

  const handleDeleteAllPosts = async () => {
    Alert.alert(
      "Delete All Posts",
      "Are you sure you want to delete ALL posts? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingAllPosts(true);
              const { data, error } = await supabase.functions.invoke(
                "delete-week-posts",
                {
                  body: JSON.stringify({}),
                }
              );

              if (error) {
                console.error("Error deleting all posts:", error);
                throw error;
              }

              console.log("Delete all posts result:", data);
              Alert.alert(
                "Success",
                data?.message || `Deleted ${data?.deletedPosts || 0} posts`,
                [
                  {
                    text: "OK",
                    onPress: () => {
                      // Refresh posts after deletion
                      fetchUserPosts();
                    },
                  },
                ]
              );
            } catch (error) {
              console.error("Error deleting all posts:", error);
              Alert.alert(
                "Error",
                "Failed to delete all posts. Please try again."
              );
            } finally {
              setDeletingAllPosts(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data } = await supabase.functions.invoke("delete-account", {
        body: JSON.stringify({
          userId: user?.id,
        }),
      });
      console.log("data", data);
    } catch (error) {
      Alert.alert(
        "Error",
        "Failed to delete account. Please try again or contact support."
      );
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      await deleteAccount();
      // const { data } = await supabase.functions.invoke("delete-account", {
      //   body: JSON.stringify({
      //     userId: user?.id,
      //   }),
      // });
    }
  };

  const displayName =
    profile?.full_name || profile?.username || user?.email || "User";

  if (!profile) return null;

  const renderPostItem = ({ item }: { item: (typeof userPosts)[0] }) => (
    <View
      style={{
        width: GRID_ITEM_SIZE,
        height: GRID_ITEM_SIZE * (1350 / 1080), // Maintain 4:5 aspect ratio
        marginBottom: 0,
      }}
      className="rounded-xl border border-white/15 overflow-hidden bg-secondary"
    >
      <ExpoImage
        source={{ uri: item.image }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={200}
      />
      <LinearGradient
        colors={[
          "transparent",
          "rgba(0,0,0,0.3)",
          "rgba(0,0,0,0.5)",
          "rgba(0,0,0,0.7)",
        ]}
        locations={[0, 0.5, 0.8, 1]}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "40%",
          zIndex: 5,
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
        }}
      />
      {/* Save Button */}
      <TouchableOpacity
        onPress={() => handleSavePost(item.image)}
        disabled={saving}
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          zIndex: 10,
        }}
        className="bg-white/20 border-2 border-white/20 size-12 items-center justify-center backdrop-blur-sm rounded-xl p-2"
        activeOpacity={0.7}
      >
        <Ionicons name="download-outline" size={25} color="white" />
      </TouchableOpacity>
    </View>
  );

  const ListHeaderComponent = () => (
    <View className="items-center mt-8 mb-8">
      <TouchableOpacity
        onPress={pickImage}
        disabled={uploading}
        className="relative"
        activeOpacity={0.8}
      >
        <View className="w-32 h-32 rounded-full bg-secondary items-center justify-center overflow-hidden border-2 border-white/20">
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile?.avatar_url }}
              style={{ width: 128, height: 128 }}
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
            <View className="items-center justify-center">
              <Text className="text-white text-4xl">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {/* Edit Icon Overlay */}
        <View className="absolute bottom-0 right-0 w-10 h-10 bg-white rounded-full items-center justify-center border-2 border-black">
          <Ionicons name="camera" size={20} color="#000" />
        </View>
      </TouchableOpacity>
      {uploading && (
        <Text className="text-gray-400 text-sm mt-2">Uploading...</Text>
      )}
      <Text className="text-white text-2xl font-bold mt-4">{displayName}</Text>
      <View className="flex-row gap-3 mt-4">
        {profile?.streak !== undefined && profile.streak > 0 && (
          <View className="flex-row bg-secondary px-4 py-2 border border-white/10 rounded-full items-center">
            <Ionicons name="flame" size={20} color="#0052c8" />
            <Text className="text-white text-lg font-semibold ml-2">
              {profile.streak}
            </Text>
          </View>
        )}
        {profile?.hype !== undefined && profile.hype > 0 && (
          <View className="flex-row bg-secondary px-4 py-2 border border-white/10 rounded-full items-center">
            <Ionicons name="flash" size={20} color="#FFD700" />
            <Text className="text-white text-lg font-semibold ml-2">
              {profile.hype} hype
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const ListFooterComponent = () => {
    // Tab bar height is typically ~60px + safe area bottom (~34px on iPhone with notch)
    // Add extra padding to ensure buttons are fully visible and clickable
    const tabBarHeight = 80; // Approximate tab bar height
    const footerBottomPadding = bottom + tabBarHeight + 20; // Safe area + tab bar + extra spacing

    return (
      <View
        className="gap-3"
        style={{
          width: "100%",
          paddingTop: 20,
          paddingBottom: footerBottomPadding,
        }}
      >
        <TouchableOpacity
          onPress={handleDeleteAllPosts}
          disabled={deletingAllPosts}
          className="bg-red-600/20 py-3 border-2 border-red-600/50 rounded-lg flex-row items-center justify-center gap-2"
          activeOpacity={0.7}
        >
          {deletingAllPosts ? (
            <Text className="text-red-400 font-semibold text-base">
              Deleting All Posts...
            </Text>
          ) : (
            <Text className="text-red-400 font-semibold text-base">
              Delete All Posts
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSignOut}
          className="bg-[#212121] py-3 border-2 border-[#212121] rounded-lg flex-row items-center justify-center gap-2"
          activeOpacity={0.7}
        >
          <Text className="text-white font-semibold text-base">Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowDeleteModal(true)}
          className=" p-3 rounded-lg flex-row items-center justify-center gap-2"
          activeOpacity={0.7}
        >
          <Text className="text-white/50 underline font-semibold text-base">
            Delete Account
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const ListEmptyComponent = () => {
    return (
      <View
        className="items-center justify-center py-12"
        style={{ minHeight: SCREEN_HEIGHT * 0.5 }} // Ensure empty state takes up space
      >
        {loadingPosts ? (
          <Text className="text-white/60">Loading posts...</Text>
        ) : (
          <View className="items-center justify-center">
            <Text className="text-white text-center text-xl font-semibold mb-2">
              No moments captured yet
            </Text>
            <Text className="text-white/80 text-center text-sm">
              You can only see and save posts that are a week old or less.
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Container>
      <FlatList
        data={userPosts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        style={{
          flex: 1,
          width: "100%",
        }}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={{
          paddingHorizontal: 8,
          minHeight: SCREEN_HEIGHT - top, // Ensure content fills screen so buttons require scrolling
          flexGrow: 1,
        }}
        columnWrapperStyle={{
          justifyContent: "space-between",
          marginBottom: GAP,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Save Post Confirmation Modal */}
      <Modal
        visible={showSaveModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowSaveModal(false);
          setSelectedPostImage(null);
        }}
      >
        <View className="flex-1 bg-black/70 items-center justify-center p-6">
          <View className="bg-secondary items-center justify-center rounded-2xl p-6 w-full max-w-sm">
            <Ionicons name="information-circle" size={48} color="white" />
            <Text className="text-white text-2xl font-bold mt-4 mb-2 text-center">
              Save to Gallery
            </Text>
            <Text className="text-white/70 text-center text-base mb-6">
              Each post expires after 7 days. Make sure to save your favorite
              moments to your gallery before they disappear!
            </Text>
            <View className="w-full gap-3">
              <TouchableOpacity
                onPress={confirmSavePost}
                disabled={saving}
                className="bg-primary p-4 rounded-lg items-center"
                activeOpacity={0.7}
              >
                {saving ? (
                  <Text className="text-white font-semibold">Saving...</Text>
                ) : (
                  <Text className="text-white font-semibold">Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowSaveModal(false);
                  setSelectedPostImage(null);
                }}
                disabled={saving}
                className="bg-background p-4 rounded-lg items-center"
                activeOpacity={0.7}
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View className="flex-1 bg-black/70 items-center justify-center p-6">
          <View className="bg-secondary items-center justify-center rounded-2xl p-4 w-full">
            <Text className="text-white text-2xl font-bold mb-2">
              Delete Account
            </Text>
            <Text className="text-white/60 text-center text-wrap text-base mb-6">
              Are you sure you want to delete your account? This action cannot
              be undone. All your posts and data will be permanently deleted.
            </Text>
            <View className="w-full gap-3">
              <TouchableOpacity
                onPress={handleDeleteAccount}
                disabled={deleting}
                className=" bg-red-600 p-4 rounded-lg items-center"
                activeOpacity={0.7}
              >
                {deleting ? (
                  <Text className="text-white font-semibold">Deleting...</Text>
                ) : (
                  <Text className="text-white font-semibold">Delete</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDeleteModal(false)}
                className=" bg-background p-4 rounded-lg items-center"
                activeOpacity={0.7}
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Container>
  );
}
