import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Skia, useCanvasRef } from "@shopify/react-native-skia";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PixelRatio,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Container } from "@/components/Container";
import { ImageEditorModal } from "@/components/ImageEditorModal";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getStorageUrl } from "@/lib/utils";
import { useHypeStore } from "@/store/hypeStore";
import { useStreakStore } from "@/store/streakStore";
import { useUserStore } from "@/store/userStore";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator } from "react-native";
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
  const {
    user,
    profile,
    signOut,
    deleteAccount,
    refreshProfile,
    loading: authLoading,
  } = useAuth();
  const { profile: persistedProfile } = useUserStore();
  const { syncWithSupabase: syncStreakWithSupabase } = useStreakStore();
  const { syncWithSupabase: syncHypeWithSupabase } = useHypeStore();
  // Use context profile as primary, persisted profile as fallback
  const currentProfile = profile || persistedProfile;
  const avatarUrl = getStorageUrl(currentProfile?.avatar_url, "avatars");
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [selectedPostImage, setSelectedPostImage] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [deletingAllPosts, setDeletingAllPosts] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [updatingName, setUpdatingName] = useState(false);
  const [showBoostedModal, setShowBoostedModal] = useState(false);
  const canvasRef = useCanvasRef();
  const pixelDensity = PixelRatio.get();

  //   // Blue glow effect shader for logo
  //   const blueGlowEffect = useMemo(() => {
  //     const source = Skia.RuntimeEffect.Make(`
  // uniform shader image;
  // uniform float2 resolution;
  // uniform float glowRadius;
  // uniform float glowIntensity;

  // half4 main(float2 xy) {
  //   // Get the original image color
  //   half4 originalColor = image.eval(xy);

  //   // Calculate UV coordinates
  //   float2 uv = xy / resolution;

  //   // Blue glow color (#0561e0 = RGB(5, 97, 224))
  //   float3 glowColor = float3(0.0196, 0.3804, 0.8784);

  //   // Sample surrounding pixels to create glow
  //   // Use constant loop bound (16 samples) - SKSL requires compile-time constants
  //   const int SAMPLES = 16;
  //   float glowAlpha = 0.0;
  //   float step = glowRadius / float(SAMPLES);

  //   for (int i = 0; i < SAMPLES; i++) {
  //     float angle = (float(i) / float(SAMPLES)) * 6.28318; // 2 * PI
  //     float2 offset = float2(cos(angle), sin(angle)) * step * float(i + 1);
  //     float2 sampleUV = uv + offset / resolution;

  //     // Sample the image at offset position
  //     half4 sampleColor = image.eval(sampleUV * resolution);

  //     // Accumulate glow based on alpha of sampled pixels
  //     glowAlpha += sampleColor.a * (1.0 - float(i) / float(SAMPLES));
  //   }

  //   glowAlpha = glowAlpha / float(SAMPLES) * glowIntensity;

  //   // Blend original color with glow
  //   float3 finalColor = originalColor.rgb + glowColor * glowAlpha;

  //   return half4(
  //     clamp(finalColor.r, 0.0, 1.0),
  //     clamp(finalColor.g, 0.0, 1.0),
  //     clamp(finalColor.b, 0.0, 1.0),
  //     max(originalColor.a, glowAlpha)
  //   );
  // }
  // // `);
  //     if (!source) {
  //       console.error("Failed to create glow effect");
  //       return null;
  //     }
  //     return source;
  //   }, []);

  const { top, bottom } = useSafeAreaInsets();

  // Fetch user's posts from the past week
  const fetchUserPosts = async () => {
    if (!currentProfile?.id || !user?.id) return;

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

  // // Fetch profile if user exists but profile is missing
  // useEffect(() => {
  //   if (user?.id && !currentProfile) {
  //     console.log("Profile missing, fetching...");
  //     refreshProfile();
  //   }
  // }, [user?.id, currentProfile, refreshProfile]);

  // Sync streak and hype from Supabase when profile loads
  useEffect(() => {
    if (currentProfile?.streak !== undefined) {
      syncStreakWithSupabase(currentProfile.streak);
    }
    if (currentProfile?.hype !== undefined) {
      syncHypeWithSupabase(currentProfile.hype);
    }
  }, [
    currentProfile?.streak,
    currentProfile?.hype,
    syncStreakWithSupabase,
    syncHypeWithSupabase,
  ]);

  // Fetch user posts when component mounts or user changes
  useEffect(() => {
    fetchUserPosts();
  }, [currentProfile?.id]);

  // Set up realtime subscription for profile updates (hype, streak, etc.)
  useEffect(() => {
    if (!currentProfile?.id) return;

    const channelName = `profile_updates_${currentProfile.id}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${currentProfile.id}`,
        },
        (payload) => {
          const updatedProfile = payload.new as typeof profile;
          console.log("Profile updated via realtime:", updatedProfile);

          // Refresh profile to get latest data (don't redirect)
          refreshProfile({ replaceToTabs: false });
        },
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
  }, [currentProfile?.id, refreshProfile]);

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
        mediaTypes: ["images"],
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

      // Refresh profile in context (don't redirect - user is already on profile)
      await refreshProfile({ replaceToTabs: false });
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
          "Please grant permission to save images to your gallery",
        );
        return;
      }

      // Download the image from URL first
      const tempImageUri = `${
        FileSystem.cacheDirectory
      }temp_post_${Date.now()}.jpg`;
      const downloadResult = await FileSystem.downloadAsync(
        selectedPostImage,
        tempImageUri,
      );

      if (!downloadResult.uri) {
        throw new Error("Failed to download image");
      }

      // Read images as base64
      const postImageBase64 = await FileSystem.readAsStringAsync(
        downloadResult.uri,
        {
          encoding: FileSystem.EncodingType.Base64,
        },
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

  // const handleDeleteAllPosts = async () => {
  //   Alert.alert(
  //     "Delete All Posts",
  //     "Are you sure you want to delete ALL posts? This action cannot be undone.",
  //     [
  //       {
  //         text: "Cancel",
  //         style: "cancel",
  //       },
  //       {
  //         text: "Delete All",
  //         style: "destructive",
  //         onPress: async () => {
  //           try {
  //             setDeletingAllPosts(true);
  //             const { data, error } = await supabase.functions.invoke(
  //               "delete-week-posts",
  //               {
  //                 body: JSON.stringify({}),
  //               }
  //             );

  //             if (error) {
  //               console.error("Error deleting all posts:", error);
  //               throw error;
  //             }

  //             console.log("Delete all posts result:", data);
  //             Alert.alert(
  //               "Success",
  //               data?.message || `Deleted ${data?.deletedPosts || 0} posts`,
  //               [
  //                 {
  //                   text: "OK",
  //                   onPress: () => {
  //                     // Refresh posts after deletion
  //                     fetchUserPosts();
  //                   },
  //                 },
  //               ]
  //             );
  //           } catch (error) {
  //             console.error("Error deleting all posts:", error);
  //             Alert.alert(
  //               "Error",
  //               "Failed to delete all posts. Please try again."
  //             );
  //           } finally {
  //             setDeletingAllPosts(false);
  //           }
  //         },
  //       },
  //     ]
  //   );
  // };

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
        "Failed to delete account. Please try again or contact support.",
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

  const displayName = currentProfile?.full_name || "User";

  const handleEditName = () => {
    setEditingName(currentProfile?.full_name || "");
    setShowEditNameModal(true);
  };

  const handleSaveName = async () => {
    if (!user?.id) {
      Alert.alert("Error", "User not found");
      return;
    }

    const trimmedName = editingName.trim();
    if (!trimmedName) {
      Alert.alert("Error", "Name cannot be empty");
      return;
    }

    try {
      setUpdatingName(true);

      // Update in Supabase
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: trimmedName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating name:", updateError);
        throw updateError;
      }

      // Refresh profile in context (don't redirect - user is on profile)
      await refreshProfile({ replaceToTabs: false });

      setShowEditNameModal(false);
      setEditingName("");
      Alert.alert("Success", "Profile name updated!");
    } catch (error) {
      console.error("Error updating name:", error);
      Alert.alert("Error", "Failed to update profile name");
    } finally {
      setUpdatingName(false);
    }
  };

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
    <View className="items-center mt-8 mb-6">
      <TouchableOpacity
        onPress={pickImage}
        onLongPress={() => {
          const uri = avatarUrl || currentProfile?.avatar_url;
          if (uri) {
            router.push({
              pathname: "/post-image",
              params: { image: uri },
            });
          }
        }}
        disabled={uploading}
        className="relative"
        activeOpacity={0.8}
      >
        <View className="w-44 h-44 rounded-full bg-secondary items-center justify-center overflow-hidden border-2 border-white/20">
          {profileImageUri ? (
            <Image
              source={{ uri: profileImageUri }}
              style={{ width: 178, height: 178 }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : currentProfile?.avatar_url ? (
            <Image
              source={{ uri: currentProfile.avatar_url }}
              style={{ width: 178, height: 178 }}
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
                {currentProfile?.full_name?.charAt(0).toUpperCase() || "?"}
              </Text>
            </View>
          )}
        </View>
        {/* Edit Icon Overlay */}
        <View className="absolute bottom-0 right-0 w-12 h-12 bg-white rounded-full items-center justify-center border-2 border-black">
          <Ionicons name="camera" size={22} color="#000" />
        </View>
      </TouchableOpacity>
      {uploading && (
        <Text className="text-gray-400 text-sm mt-2">Uploading...</Text>
      )}
      <View className="w-full gap-2">
        <View className="w-full flex-row items-center justify-center gap-2 mt-4">
          <Text className="text-white text-3xl font-bold">{displayName}</Text>
          <TouchableOpacity
            onPress={handleEditName}
            className="p-1"
            activeOpacity={0.7}
          >
            <Feather name="edit" size={20} color="white" />
          </TouchableOpacity>
        </View>
        {/* <View className="w-full  flex-row items-center gap-0">
          <TouchableOpacity
            onPress={handleEditName}
            className="p-1"
            activeOpacity={0.7}
          >
            <MaterialIcons name="edit" size={18} color="#acacac" />
          </TouchableOpacity>
          <Text className="text-[#acacac] text-sm">
            Drop a line that sums you up...
          </Text>
        </View> */}
      </View>
      <View className="flex-row gap-3 mt-0">
        {/* {profile?.streak !== undefined && profile.streak > 0 && (
          <View className="flex-row bg-secondary px-4 py-2 border border-white/10 rounded-full items-center">
            <Ionicons name="flame" size={20} color="#0052c8" />
            <Text className="text-white text-lg font-semibold ml-2">
              {profile.streak}
            </Text>
          </View>
        )} */}
        {/* {profile?.hype !== undefined && profile.hype > 0 && ( */}
        <View className="flex-row items-center w-full justify-between">
          <Text className="text-white text-xl font-semibold">Your moments</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowBoostedModal(true);
            }}
          >
            <View className="flex-row bg-secondary px-4 py-2 border border-white/10 rounded-full items-center gap-2 justify-center">
              <Text className="text-white text-3xl font-semibold">📸</Text>
              <Text className="text-white text-lg pt-1 font-semibold">
                {currentProfile?.hype ?? 0}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        {/* )} */}
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
        {/* <TouchableOpacity
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
        </TouchableOpacity> */}

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
        <Text className="text-white/50 text-center text-sm">
          v{Application.nativeApplicationVersion}
        </Text>
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
          <View className="items-center justify-center gap-2">
            <Ionicons name="image-outline" size={45} color="white" />
            <Text className="text-white text-center font-semibold mb-2">
              Nothing captured yet
            </Text>
          </View>
        )}
      </View>
    );
  };

  // Show loading state only during initial auth loading
  // Once auth is loaded, always render the profile screen (even if profile is null)
  if (authLoading) {
    return (
      <Container>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#fff" />
          <Text className="text-white/60 mt-4">Loading...</Text>
        </View>
      </Container>
    );
  }

  // Always render the profile screen - user should exist if we're here
  // Handle null profile gracefully in the UI
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
            <Text className="text-white text-2xl  font-bold mt-4 mb-6 text-center">
              Save to Gallery
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
      {(currentProfile?.hype ?? 0) > 0 && (
        <Modal
          visible={showBoostedModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBoostedModal(false)}
        >
          <View className="flex-1 bg-black/70 items-center justify-center p-6">
            <View className="bg-secondary items-center justify-center rounded-2xl p-6 w-full max-w-sm">
              <Text className="text-white text-6xl font-semibold">📸</Text>
              <Text className="text-white text-2xl font-bold mt-4 mb-2 text-center">
                Your boosts
              </Text>
              <Text className="text-white/80 text-base mb-6 text-center">
                You have been boosted {currentProfile?.hype ?? 0} times. Keep it
                up!
              </Text>
              <TouchableOpacity
                onPress={() => setShowBoostedModal(false)}
                className="bg-primary p-4 rounded-lg items-center w-full"
                activeOpacity={0.8}
              >
                <Text className="text-white font-semibold text-base">
                  Let's go
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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

      <Modal
        visible={showEditNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowEditNameModal(false);
          setEditingName("");
        }}
      >
        <View className="flex-1 bg-black/70 items-center justify-center p-6">
          <View className="bg-secondary items-center justify-center rounded-2xl p-6 w-full max-w-sm">
            <Text className="text-white text-2xl font-bold mb-2">
              Edit Profile Name
            </Text>
            <TextInput
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Enter your name"
              placeholderTextColor="#8a8a8a"
              selectionColor={"white"}
              className="bg-background text-white p-4 rounded-lg border border-white/20 w-full mt-4 mb-6"
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
            />
            <View className="w-full gap-3">
              <TouchableOpacity
                onPress={handleSaveName}
                disabled={updatingName || !editingName.trim()}
                className={`bg-primary p-4 rounded-lg items-center ${
                  updatingName || !editingName.trim() ? "opacity-50" : ""
                }`}
                activeOpacity={0.7}
              >
                {updatingName ? (
                  <Text className="text-white font-semibold">Updating...</Text>
                ) : (
                  <Text className="text-white font-semibold">Save</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowEditNameModal(false);
                  setEditingName("");
                }}
                disabled={updatingName}
                className="bg-background p-4 rounded-lg items-center"
                activeOpacity={0.7}
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ImageEditorModal
        visible={showImageEditor}
        imageUri={profileImageUri}
        onCancel={handleImageEditorCancel}
        onConfirm={handleImageEditorConfirm}
      />
    </Container>
  );
}
