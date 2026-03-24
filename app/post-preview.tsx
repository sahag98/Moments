import { Container } from "@/components/Container";
import { useAuth } from "@/contexts/AuthContext";
import { CheckReview } from "@/hooks/useShowReview";
import { supabase } from "@/lib/supabase";
import { useImageStore } from "@/store/imageStore";
import { usePostStore } from "@/store/postStore";
import { useStreakStore } from "@/store/streakStore";
import AntDesign from "@expo/vector-icons/AntDesign";
import {
  Canvas,
  ColorMatrix,
  Group,
  Image,
  RuntimeShader,
  Skia,
  useCanvasRef,
  useImage,
} from "@shopify/react-native-skia";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  PixelRatio,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const cinematicMatrix = [
  // R' row
  1.2, -0.1, -0.1, 0, 0,
  // G' row
  -0.1, 1.05, -0.1, 0, 0,
  // B' row
  -0.1, -0.1, 1.3, 0, 0,
  // A' row
  0, 0, 0, 1, 0,
];

export default function PostPreviewScreen() {
  const { capturedImageUri, clearCapturedImageUri } = useImageStore();
  const { user, profile, fetchAllProfiles, refreshProfile } = useAuth();
  const { addPost } = useStreakStore();

  const {
    checkIfCanPost,
    isShowingFirstReview,
    recordPost,
    postCount,
    hasShownFirstReview,
  } = usePostStore();
  const canvasRef = useCanvasRef();
  const pixelDensity = PixelRatio.get();
  const [isPosting, setIsPosting] = useState(false);
  const [postingMessage, setPostingMessage] = useState("");
  const [holdProgress, setHoldProgress] = useState(0);
  const holdIntervalRef = useRef<number | null>(null);
  const holdStartTimeRef = useRef<number | null>(null);
  const lastHapticTimeRef = useRef<number>(0);

  // Use the captured image from Zustand store
  const image = useImage(capturedImageUri);

  // Clear the image from store when component unmounts or user cancels
  useEffect(() => {
    return () => {
      // Only clear if we're navigating away (not posting)
      if (!isPosting) {
        clearCapturedImageUri();
      }
    };
  }, [isPosting, clearCapturedImageUri]);

  // Grain effect shader
  const grainEffect = useMemo(() => {
    const source = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float intensity;
uniform float2 resolution;

float random(float2 uv) {
  return fract(sin(dot(uv, float2(12.9898, 78.233))) * 43758.5453);
}

half4 main(float2 xy) {
  half4 color = image.eval(xy);
  float2 uv = xy / resolution;
  float noise = random(uv * 400.0);
  float g = (noise - 0.5) * intensity;
  return half4(
    clamp(color.r + g, 0.0, 1.0),
    clamp(color.g + g, 0.0, 1.0),
    clamp(color.b + g, 0.0, 1.0),
    color.a
  );
}
`);
    if (!source) {
      console.error("Failed to create grain effect");
      return null;
    }
    return source;
  }, []);

  const scaledWidth = SCREEN_WIDTH * pixelDensity;
  const scaledHeight = SCREEN_HEIGHT * pixelDensity;

  // Calculate dimensions maintaining 1080x1350 aspect ratio (4:5)
  // These calculations don't depend on image, so they can be done before conditional returns
  const targetAspectRatio = 1080 / 1350; // 0.8
  const screenAspectRatio = SCREEN_WIDTH / SCREEN_HEIGHT;

  let imageWidth = SCREEN_WIDTH;
  let imageHeight = SCREEN_HEIGHT;

  if (screenAspectRatio > targetAspectRatio) {
    // Screen is wider than target, fit to height
    imageHeight = SCREEN_HEIGHT;
    imageWidth = imageHeight * targetAspectRatio;
  } else {
    // Screen is taller than target, fit to width
    imageWidth = SCREEN_WIDTH;
    imageHeight = imageWidth / targetAspectRatio;
  }

  const borderWidth = 4;
  const borderRadius = 50;
  const scaledImageWidth = imageWidth * pixelDensity;
  const scaledImageHeight = imageHeight * pixelDensity;

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
      }
    };
  }, []);

  const handlePressIn = () => {
    if (isPosting) return;

    const startTime = Date.now();
    holdStartTimeRef.current = startTime;
    lastHapticTimeRef.current = 0;
    setHoldProgress(0);

    const HOLD_DURATION = 1; // 1 second total

    holdIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000; // elapsed time in seconds
      const progress = Math.min(elapsed / HOLD_DURATION, 1); // progress from 0 to 1 over 2 seconds
      setHoldProgress(progress);

      // No haptics until 25% (0.5 seconds)
      if (progress < 0.25) {
        return;
      }

      // Progressive haptic feedback - gradually increase intensity and frequency
      let currentHapticInterval = 200;
      let hapticStyle = Haptics.ImpactFeedbackStyle.Light;

      // Calculate progress after 25% (0 to 1 range from 25% to 100%)
      const hapticProgress = (progress - 0.25) / 0.75;

      if (hapticProgress < 0.33) {
        // 25-50%: Light haptics, gradually increasing frequency
        currentHapticInterval = 200 - hapticProgress * 50; // 200ms to 150ms
        hapticStyle = Haptics.ImpactFeedbackStyle.Light;
      } else if (hapticProgress < 0.67) {
        // 50-75%: Medium haptics, gradually increasing frequency
        currentHapticInterval = 150 - (hapticProgress - 0.33) * 50; // 150ms to 100ms
        hapticStyle = Haptics.ImpactFeedbackStyle.Medium;
      } else {
        // 75-100%: Heavy haptics, faster frequency
        currentHapticInterval = 100 - (hapticProgress - 0.67) * 30; // 100ms to 70ms
        hapticStyle = Haptics.ImpactFeedbackStyle.Heavy;
      }

      if (elapsed >= HOLD_DURATION) {
        // After 2 seconds, trigger the post
        if (holdIntervalRef.current) {
          clearInterval(holdIntervalRef.current);
          holdIntervalRef.current = null;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        handlePost();
        return;
      }

      // Trigger haptic if enough time has passed
      const elapsedMs = elapsed * 1000;
      const timeSinceLastHaptic = elapsedMs - lastHapticTimeRef.current;
      if (timeSinceLastHaptic >= currentHapticInterval) {
        Haptics.impactAsync(hapticStyle);
        lastHapticTimeRef.current = elapsedMs;
      }
    }, 50); // Check every 50ms for smooth progress
  };

  const handlePressOut = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    holdStartTimeRef.current = null;
    setHoldProgress(0);
  };

  const handlePost = async () => {
    if (!image || !canvasRef.current || !user) {
      Alert.alert("Error", "Missing required data to post");
      return;
    }

    // Check if user can post today
    const canPost = await checkIfCanPost();
    if (!canPost) {
      Alert.alert(
        "Daily Limit Reached",
        "You can only post once per day. Come back tomorrow for more!",
      );
      return;
    }

    try {
      setIsPosting(true);

      // Capture the canvas as an image
      const skiaImage = canvasRef.current.makeImageSnapshot();
      if (!skiaImage) {
        Alert.alert("Error", "Failed to capture image");
        return;
      }

      // Encode to base64
      const base64 = skiaImage.encodeToBase64();

      if (!base64) {
        Alert.alert("Error", "Failed to encode image");
        return;
      }

      // Convert base64 directly to ArrayBuffer
      // Remove data URL prefix if present (e.g., "data:image/png;base64,")
      const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;

      // Convert base64 to binary string
      let binaryString: string;
      try {
        binaryString = atob(base64Data);
      } catch (error) {
        console.error("Error decoding base64:", error);
        Alert.alert("Error", "Failed to process image data");
        return;
      }

      // Create ArrayBuffer directly
      const arrayBuffer = new ArrayBuffer(binaryString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }

      // Verify ArrayBuffer is created correctly
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        Alert.alert("Error", "Failed to create image buffer");
        return;
      }

      // Upload to Supabase storage
      const fileName = `post_${Date.now()}_${user.id}.png`;
      const filePath = `${user.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("post_images")
        .upload(filePath, arrayBuffer, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        Alert.alert("Error", "Failed to upload image");
        return;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("post_images").getPublicUrl(filePath);

      // Save post to database
      const { error: insertError } = await supabase.from("posts").insert({
        user_id: user.id,
        image: publicUrl,
        caption: null,
      });

      if (insertError) {
        console.error("Insert error:", insertError);
        Alert.alert("Error", "Failed to save post");
        setIsPosting(false);
        return;
      }

      // Record that user posted today (only after successful database insert)
      await recordPost();

      // Update streak
      const newStreak = await addPost();

      // Update streak in Supabase profile
      const { error: streakError } = await supabase
        .from("profiles")
        .update({
          streak: newStreak,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (streakError) {
        console.error("Error updating streak:", streakError);
        // Don't block the post flow if streak update fails
      } else {
        // Refresh profile to get updated streak
        await refreshProfile();
      }

      // Show encouraging message
      setPostingMessage("Your moment is being shared...");

      // Send notifications to all users
      try {
        const allProfiles = await fetchAllProfiles();
        const profilesWithTokens = allProfiles.filter(
          (p) => p.expo_token && p.id !== user.id,
        );

        const displayName =
          profile?.username || profile?.full_name || "Someone";

        // Send notifications to all users with expo tokens
        const notificationPromises = profilesWithTokens.map(async (p) => {
          if (!p.expo_token) return;

          const message = {
            to: p.expo_token,
            sound: "default",
            title: "Moments",
            body: `${displayName} posted a new moment!`,
            data: {
              route: "/(tabs)",
            },
          };

          try {
            const response = await fetch(
              "https://exp.host/--/api/v2/push/send",
              {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Accept-encoding": "gzip, deflate",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(message),
              },
            );

            if (!response.ok) {
              console.error(
                `Failed to send notification to ${p.id}:`,
                response.statusText,
              );
            }
          } catch (error) {
            console.error(`Error sending notification to ${p.id}:`, error);
          }
        });

        // Send all notifications in parallel (don't wait for them)
        Promise.all(notificationPromises).catch((error) => {
          console.error("Error sending notifications:", error);
        });
      } catch (error) {
        console.error("Error fetching profiles for notifications:", error);
        // Don't block the post flow if notifications fail
      }

      // Clear the image from store

      clearCapturedImageUri();

      // Success - navigate immediately to home tab to show the new post
      await new Promise((resolve) => setTimeout(resolve, 3000));
      router.replace("/(tabs)");
    } catch (error) {
      console.error("Error posting:", error);
      Alert.alert("Error", "Failed to post image");
    } finally {
      setIsPosting(false);

      if (postCount % 2 === 0 && hasShownFirstReview === false) {
        CheckReview();
        isShowingFirstReview();
      }

      if (postCount % 10 === 0 && hasShownFirstReview === true) {
        CheckReview();
      }
    }
  };

  // Show posting state with message (check this first to avoid showing loading image after posting)
  if (isPosting) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4 text-2xl">
          {postingMessage || "Posting your photo..."}
        </Text>
        <Text className="text-white/70 mt-2 text-center px-6">
          Take a moment to reflect on the moment you captured
        </Text>
      </View>
    );
  }

  // Then check if image is loaded (useImage is async)
  // This matches the camera screen pattern exactly
  // Only show this on initial load, not after posting starts
  if (!image) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4">Loading image...</Text>
      </View>
    );
  }

  // Step 1: Add supersampling - render at higher resolution, then scale down
  // This matches the camera screen exactly
  // Dimensions are already calculated above before conditional returns

  return (
    <Container>
      <View className="flex-1 p-2">
        <View className="flex-1 items-center justify-center">
          <View
            style={{
              borderRadius: borderRadius,
              overflow: "hidden",
              width: imageWidth - 20,
              height: imageHeight - 20,
            }}
          >
            <Canvas
              ref={canvasRef}
              style={{
                width: imageWidth,
                height: imageHeight,
              }}
            >
              {/* Scale down the entire rendering for supersampling */}
              <Group transform={[{ scale: 1 / pixelDensity }]}>
                {/* Render at higher resolution (scaled by pixel density) */}
                <Image
                  fit="cover"
                  image={image}
                  x={0}
                  y={0}
                  width={scaledImageWidth}
                  height={scaledImageHeight}
                >
                  <ColorMatrix matrix={cinematicMatrix} />
                  {grainEffect && (
                    <RuntimeShader
                      source={grainEffect}
                      uniforms={{
                        intensity: 0.15,
                        resolution: [scaledImageWidth, scaledImageHeight],
                      }}
                    />
                  )}
                </Image>
              </Group>
            </Canvas>
          </View>
        </View>
        <View className="flex-row w-full mb-4 justify-center items-center gap-2">
          <AntDesign name="info-circle" size={20} color="#a2a2a2" />
          <Text className="text-white/50 text-sm text-center">
            Remember you can only post once a day
          </Text>
        </View>
        {/* Bottom overlay with post button */}
        <View className="pb-4 flex-row gap-4 justify-between items-center">
          <TouchableOpacity
            onPress={() => {
              clearCapturedImageUri();
              router.back();
            }}
            disabled={isPosting}
            className="p-4 flex-2 items-center"
          >
            <Text className="text-white/70">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={isPosting}
            activeOpacity={0.8}
            className={`bg-primary flex-1 p-4 rounded-2xl items-center overflow-hidden ${
              isPosting ? "opacity-50" : ""
            }`}
          >
            {/* Progress indicator overlay */}
            {holdProgress > 0 && holdProgress < 1 && (
              <Animated.View
                className="absolute inset-0 bg-blue-600"
                style={{
                  width: `${holdProgress * 100}%`,
                }}
              />
            )}
            {isPosting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold text-lg relative z-10">
                {holdProgress > 0 && holdProgress < 1
                  ? `Hold... ${Math.ceil((1 - holdProgress) * 1)}s`
                  : "Hold to Post"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Container>
  );
}
