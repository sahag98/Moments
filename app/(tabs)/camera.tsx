import { useImageStore } from "@/store/imageStore";
import { usePostStore } from "@/store/postStore";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
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
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";
import { router, useFocusEffect, useNavigation } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  PixelRatio,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
// import { VolumeManager } from "react-native-volume-manager";

// // Disable the native volume toast globally (iOS, Android)
// VolumeManager.showNativeVolumeUI({ enabled: false });

// Listen to volume changes

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Find Ultra Wide lens from available lenses
const findUltraWideLens = (lenses: string[]): string | undefined => {
  // Common identifiers for Ultra Wide lens
  // Matches: "Back Ultra Wide Camera", "builtInUltraWideCamera", etc.
  return lenses.find(
    (lens) =>
      lens.toLowerCase().includes("back ultra wide camera") ||
      lens.toLowerCase().includes("ultrawide") ||
      lens === "builtInUltraWideCamera",
  );
};

// Find default/main camera lens (for 1x)
const findDefaultLens = (lenses: string[]): string | undefined => {
  if (!lenses || lenses.length === 0) return undefined;

  // Look for "Back Camera" (the main/default camera) - exact match first
  const backCamera = lenses.find((lens) => lens === "Back Camera");
  if (backCamera) return backCamera;

  // Fallback: look for any lens that is just "Back Camera" (case insensitive)
  const backCameraCaseInsensitive = lenses.find(
    (lens) => lens.toLowerCase() === "back camera",
  );
  if (backCameraCaseInsensitive) return backCameraCaseInsensitive;

  // Last resort: look for any back camera that isn't ultra wide, telephoto, lidar, or dual
  return lenses.find(
    (lens) =>
      lens.toLowerCase().includes("back") &&
      !lens.toLowerCase().includes("ultra wide") &&
      !lens.toLowerCase().includes("telephoto") &&
      !lens.toLowerCase().includes("lidar") &&
      lens.toLowerCase() !== "back dual camera" &&
      !lens.toLowerCase().includes("dual wide"),
  );
};

export default function CameraScreen() {
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Zoom level: "0.5x", "1x", or "3x" (for UI display)
  const [zoomLevel, setZoomLevel] = useState<"0.5x" | "1x" | "3x">("0.5x");
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [selectedLens, setSelectedLens] = useState<string | undefined>(
    undefined,
  );
  const { checkIfCanPost } = usePostStore();
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [flashMode, setFlashMode] = useState<"on" | "off" | "auto">("off");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const cameraRef = useRef<CameraView>(null);
  const canvasRef = useCanvasRef();
  const pixelDensity = PixelRatio.get();
  const lensInitializedRef = useRef(false);

  // Gesture values for pinch-to-zoom
  // CameraView zoom prop is 0-1 where 0 = no zoom, 1 = max zoom
  const zoom = useSharedValue(0); // Current zoom value (0-1)
  const savedZoom = useSharedValue(0); // Saved zoom value at gesture end
  const [currentZoom, setCurrentZoom] = useState(0); // React state for CameraView prop
  const currentZoomRef = useRef(0); // Ref to access currentZoom in worklets

  // Keep ref in sync with state (for gesture to read current zoom)
  useEffect(() => {
    currentZoomRef.current = currentZoom;
  }, [currentZoom]);

  // useEffect(() => {
  //   if (!isCameraReady) return;

  //   const volumeListener = VolumeManager.addVolumeListener((result) => {
  //     console.log("volume changed", result);
  //     takePicture();
  //   });

  //   return () => {
  //     volumeListener.remove();
  //   };
  // }, [isCameraReady]);

  // Clear captured image when screen comes into focus (e.g., returning from modal)
  useFocusEffect(
    useCallback(() => {
      setCapturedImageUri(null);
    }, []),
  );

  // Smoothly animate zoom changes from shared value to React state
  // Using useAnimatedReaction to sync the animated zoom value to React state
  // This provides smooth, real-time updates during pinch gestures
  useAnimatedReaction(
    () => zoom.value,
    (currentZoomValue) => {
      // Update React state immediately for responsive camera zoom
      // Reanimated handles this efficiently on the UI thread
      runOnJS(setCurrentZoom)(currentZoomValue);
    },
    [currentZoom],
  );

  // Use captured image if available
  const image = useImage(capturedImageUri);

  const cinematicMatrix = [
    // R' row - increased red and added yellow tint
    1.25, 0.05, -0.15, 0, 0.02,
    // G' row - increased green for yellow warmth
    0.05, 1.15, -0.1, 0, 0.01,
    // B' row - reduced blue to enhance yellow/cinematic look
    -0.1, -0.05, 1.2, 0, -0.01,
    // A' row
    0, 0, 0, 1, 0,
  ];

  // Step 2: Create grain shader effect for minimal film grain
  const grainEffect = useMemo(() => {
    const source = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float intensity;
uniform float2 resolution;

//create variables for shadow intensity and increase it through a function
uniform float shadowIntensity;
uniform float2 shadowOffset;    







float random(float2 uv) {
  return fract(sin(dot(uv, float2(12.9898, 78.233))) * 43758.5453);
}

half4 main(float2 xy) {
  // Get the input image color
  half4 color = image.eval(xy);
  
  // Calculate UV coordinates
  float2 uv = xy / resolution;
  
  // Generate fine grain noise
  float noise = random(uv * 400.0);
  float g = (noise - 0.5) * intensity;

  // Apply minimal grain to all color channels
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

  const { setCapturedImageUri: setImageStoreUri } = useImageStore();

  const takePicture = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const canPost = await checkIfCanPost();
    if (!canPost) {
      Alert.alert(
        "Daily Limit Reached",
        "You can only post once per day. Come back tomorrow to share another moment!",
        [
          {
            text: "OK",
            style: "default",
            onPress: () => {
              router.back();
            },
          },
        ],
      );
      return;
    }
    // Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (cameraRef.current) {
      try {
        setIsProcessing(true);
        setProcessingMessage("Capturing your moment...");

        const photo = await cameraRef.current.takePictureAsync();
        if (photo && photo.uri) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          setProcessingMessage("Processing your photo...");

          // Resize image maintaining aspect ratio
          // Resize to 1080px width, height will be calculated to maintain aspect ratio
          // This prevents the image from being stretched wider than it should be
          const manipulatedImage = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{ resize: { width: 1080 } }],
            { compress: 1, format: ImageManipulator.SaveFormat.PNG },
          );

          // Store resized image URI in Zustand store for post-preview screen
          setImageStoreUri(manipulatedImage.uri);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          // Wait 3 seconds with encouraging message
          setProcessingMessage("Almost ready...");
          await new Promise((resolve) => setTimeout(resolve, 3000));

          setIsProcessing(false);
          router.push("/post-preview");
          // Additional 3 second delay before navigation
        }
      } catch (error) {
        console.error("Error taking picture:", error);
        setIsProcessing(false);
      }
    }
  };

  const retakePicture = () => {
    setCapturedImageUri(null);
  };

  // Convert zoom level label to CameraView zoom value (0-1)
  // Note: expo-camera zoom prop is 0-1 where 0 = no zoom, 1 = max zoom
  // Ultra-wide (0.5x) can't be achieved with zoom prop alone as it requires switching camera lenses
  // We'll use 0 for both 0.5x and 1x since zoom can't go below 0
  const getZoomValue = (level: "0.5x" | "1x" | "3x"): number => {
    switch (level) {
      case "0.5x":
        return 0; // Ultra-wide - requires device support (zoom can't go negative)
      case "1x":
        return 0; // Regular/no zoom (default)
      case "3x":
        return 0.2; // High zoom
      default:
        return 0;
    }
  };

  // Helper function to select the appropriate lens based on zoom level
  // Returns the lens ID immediately for synchronous use
  const selectLensForZoomLevel = useCallback(
    (lenses: string[], level: "0.5x" | "1x" | "3x"): string | undefined => {
      if (lenses.length === 0) return undefined;

      let lensToSelect: string | undefined = undefined;

      if (level === "0.5x") {
        // Use ultra wide lens for 0.5x
        const ultraWideLens = findUltraWideLens(lenses);
        if (ultraWideLens) {
          lensToSelect = ultraWideLens;
        } else {
          // Fallback: try to find any lens that might be ultra wide
          const fallbackLens = lenses.find(
            (lens) =>
              lens.toLowerCase().includes("wide") &&
              !lens.toLowerCase().includes("telephoto"),
          );
          if (fallbackLens) {
            lensToSelect = fallbackLens;
          }
        }
      } else {
        // For 1x and 3x, use default camera lens
        const defaultLens = findDefaultLens(lenses);
        lensToSelect = defaultLens;
      }

      // Set the lens immediately
      setSelectedLens(lensToSelect);
      return lensToSelect;
    },
    [],
  );

  // Handle available lenses change - set lens immediately for fast initialization
  const handleAvailableLensesChanged = useCallback(
    (event: { lenses: string[] }) => {
      const { lenses } = event;

      // Set available lenses immediately
      setAvailableLenses(lenses);

      // Immediately set the lens based on current zoom level for fast initialization
      // Only do this on first initialization to avoid overriding user selections
      if (lenses.length > 0 && !lensInitializedRef.current) {
        lensInitializedRef.current = true;
        // Select lens synchronously - this will update state immediately
        selectLensForZoomLevel(lenses, zoomLevel);
      }
    },
    [zoomLevel, selectLensForZoomLevel],
  );

  // // Update selected lens when zoom level changes (but only if lenses are already available and initialized)
  // useEffect(() => {
  //   if (availableLenses.length > 0 && lensInitializedRef.current) {
  //     selectLensForZoomLevel(availableLenses, zoomLevel);
  //   }
  // }, [zoomLevel, availableLenses, selectLensForZoomLevel]);

  const handleZoomLevelChange = (level: "0.5x" | "1x" | "3x") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Calculate zoom value once
    const zoomValue = getZoomValue(level);

    // Update all state synchronously - React 18 batches these automatically
    // But we do them in sequence to ensure they all happen in the same render cycle
    setZoomLevel(level);
    setCurrentZoom(zoomValue);

    // Update reanimated values immediately (these are synchronous)
    zoom.value = zoomValue;
    savedZoom.value = zoomValue;

    // Immediately update lens - this must happen after availableLenses is set
    // Use the helper function which sets state immediately
    if (availableLenses.length > 0) {
      selectLensForZoomLevel(availableLenses, level);
    }
  };

  const flipCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((prev) => {
      const newFacing = prev === "back" ? "front" : "back";
      // Disable flash when switching to front camera
      if (newFacing === "front") {
        setFlashMode("off");
      }
      return newFacing;
    });
    // Reset zoom when flipping camera
    setCurrentZoom(0);
    zoom.value = 0;
    savedZoom.value = 0;
    // Reset lens selection when flipping - allow re-initialization for new camera
    setSelectedLens(undefined);
    lensInitializedRef.current = false;
  };

  const toggleFlash = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlashMode((prev) => {
      switch (prev) {
        case "off":
          return "on";
        case "on":
          return "auto";
        case "auto":
          return "off";
        default:
          return "off";
      }
    });
  };

  // Pinch gesture for zoom - following latest react-native-gesture-handler patterns
  // Pinch gesture for zoom - following latest react-native-gesture-handler patterns
  const pinchGesture = useMemo(() => {
    return Gesture.Pinch()
      .onBegin(() => {
        "worklet";
        // Get current zoom from ref (which is synced with state)
        const current = currentZoomRef.current;
        // Save the starting zoom value for this gesture
        savedZoom.value = current;
        zoom.value = current;
      })
      .onUpdate((event: { scale: number }) => {
        "worklet";
        // Natural zoom calculation
        // Scale typically ranges from ~0.5 (pinch in) to ~2-3 (pinch out)
        const baseZoom = savedZoom.value;
        const scaleChange = event.scale - 1.0; // Change from starting scale (1.0)

        // Map scale change directly to zoom change
        const zoomSensitivity = 0.45;

        // Apply scale change to base zoom
        let newZoom = baseZoom + scaleChange * zoomSensitivity;

        // Clamp zoom between 0 and 1
        newZoom = Math.max(0, Math.min(1, newZoom));

        // Update zoom value directly during gesture for immediate feedback
        // The useAnimatedReaction will smoothly sync this to React state
        zoom.value = newZoom;
      })
      .onEnd(() => {
        "worklet";
        // Save the final zoom value for the next gesture
        savedZoom.value = zoom.value;
        // The useAnimatedReaction will smoothly update React state
        // No need for additional animation here
      });
  }, []);

  const saveImageToGallery = async () => {
    if (!canvasRef.current || !image) {
      Alert.alert("Error", "Image not ready");
      return;
    }

    try {
      setIsSaving(true);

      // Request media library permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission denied",
          "Please grant permission to save images",
        );
        return;
      }

      // Capture the canvas as an image
      const skiaImage = canvasRef.current.makeImageSnapshot();
      if (!skiaImage) {
        Alert.alert("Error", "Failed to capture image");
        return;
      }

      // Encode to base64
      const base64 = skiaImage.encodeToBase64();

      // Save to a temporary file
      const fileName = `lapse_${Date.now()}.png`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Save to gallery
      await MediaLibrary.createAssetAsync(fileUri);

      Alert.alert("Success", "Image saved to gallery!");
    } catch (error) {
      console.error("Error saving image:", error);
      Alert.alert("Error", "Failed to save image");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle camera permissions: request automatically when camera screen is shown (no custom pre-permission button)
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission?.granted, permission?.canAskAgain]);

  if (!permission) {
    return <View className="flex-1 bg-black" />;
  }

  // Only show custom UI when user has already denied (canAskAgain is false). Otherwise show camera and system dialog will appear.
  if (!permission.granted && !permission.canAskAgain) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <View className="absolute top-10 left-2 z-50 pt-12 px-4">
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                router.replace("/(tabs)");
              }
            }}
            className="size-16 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(31, 31, 31, 0.8)" }}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
        </View>
        <Text className="text-white text-center px-6 mb-4">
          Camera access is needed to take photos. You can enable it in Settings.
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openSettings()}
          className="bg-white px-6 py-3 rounded-lg"
        >
          <Text className="text-black font-semibold">Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show camera if no image captured yet (only mount CameraView when permission.granted so feed shows immediately after Allow)
  if (!capturedImageUri) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={pinchGesture}>
          <View className="flex-1" collapsable={false}>
            <View className="flex-1 mx-0 bg rounded-3xl overflow-hidden">
              {/* Back button */}
              <View className="absolute top-10 left-2 z-50 pt-12 px-4">
                <TouchableOpacity
                  onPress={() => {
                    if (navigation.canGoBack()) {
                      navigation.goBack();
                    } else {
                      router.replace("/(tabs)");
                    }
                  }}
                  className="size-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(31, 31, 31, 0.8)" }}
                >
                  <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
              </View>
              {permission.granted ? (
                <CameraView
                  ref={cameraRef}
                  style={{ flex: 1 }}
                  facing={facing}
                  zoom={currentZoom}
                  mirror={facing === "front"}
                  flash={flashMode}
                  selectedLens={selectedLens}
                  onAvailableLensesChanged={handleAvailableLensesChanged}
                  onCameraReady={() => setIsCameraReady(true)}
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: "black" }} />
              )}
              {/* Fading bottom border */}
              <View
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: 1,
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {Array.from({ length: 60 }).map((_, index) => {
                  const center = 30;
                  const distance = Math.abs(index - center);
                  const maxDistance = 30;
                  const opacity = Math.max(
                    0,
                    1 - (distance / maxDistance) * 1.2,
                  );
                  const width = SCREEN_WIDTH / 60;

                  return (
                    <View
                      key={index}
                      style={{
                        width: width,
                        height: 1,
                        backgroundColor: `rgba(255, 255, 255, ${
                          opacity * 0.3
                        })`,
                      }}
                    />
                  );
                })}
              </View>
              <View className="flex-row absolute bottom-0 left-0 right-0 items-center px-4 mb-3 justify-between ">
                <TouchableOpacity
                  onPress={flipCamera}
                  className="size-14 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(31, 31, 31, 0.8)" }}
                >
                  <FontAwesome6 name="arrows-rotate" size={20} color="white" />
                </TouchableOpacity>
                {facing === "back" && (
                  <View className="self-center z-10 items-center justify-center">
                    <View
                      style={{ backgroundColor: "rgba(31, 31, 31, 0.8)" }}
                      className="flex-row gap-2 items-center  px-4 py-2 rounded-full"
                    >
                      <TouchableOpacity
                        onPress={() => handleZoomLevelChange("0.5x")}
                        className={`px-4 py-2 rounded-full ${
                          zoomLevel === "0.5x" ? "bg-background" : "bg-none"
                        }`}
                      >
                        <Text
                          className={`font-semibold ${
                            zoomLevel === "0.5x" ? "text-primary" : "text-white"
                          }`}
                        >
                          .5{zoomLevel === "0.5x" ? "x" : ""}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleZoomLevelChange("1x")}
                        className={`px-4 py-2 rounded-full ${
                          zoomLevel === "1x" ? "bg-background" : "bg-none"
                        }`}
                      >
                        <Text
                          className={`font-semibold ${
                            zoomLevel === "1x" ? "text-primary" : "text-white"
                          }`}
                        >
                          1{zoomLevel === "1x" ? "x" : ""}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleZoomLevelChange("3x")}
                        className={`px-4 py-2 rounded-full ${
                          zoomLevel === "3x" ? "bg-background" : "bg-none"
                        }`}
                      >
                        <Text
                          className={`font-semibold ${
                            zoomLevel === "3x" ? "text-primary" : "text-white"
                          }`}
                        >
                          3{zoomLevel === "3x" ? "x" : ""}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <TouchableOpacity
                  onPress={toggleFlash}
                  disabled={facing === "front"}
                  style={{ backgroundColor: "rgba(31, 31, 31, 0.8)" }}
                  className={`size-14 bg-secondary rounded-full items-center justify-center ${
                    facing === "front" ? "opacity-50" : ""
                  }`}
                >
                  {facing === "front" ? (
                    <Ionicons name="flash-off" size={20} color="white" />
                  ) : flashMode === "off" ? (
                    <Ionicons name="flash-off" size={20} color="white" />
                  ) : flashMode === "auto" ? (
                    <MaterialCommunityIcons
                      name="flash-auto"
                      size={20}
                      color="#3e64df"
                    />
                  ) : (
                    <Ionicons name="flash" size={20} color="#3e64df" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {/* Zoom buttons */}
            <View className="bottom-0 flex-2 w-full h-1/5">
              <View className=" bg-background flex-1 justify-center items-center">
                <View className="border border-white p-2 bg-background rounded-full">
                  <TouchableOpacity
                    onPress={takePicture}
                    disabled={isProcessing}
                    className={`w-20 h-20 rounded-full bg-white ${
                      isProcessing ? "opacity-50" : ""
                    }`}
                  />
                </View>
              </View>
            </View>
            {/* Processing overlay */}
            {isProcessing && (
              <View className="absolute inset-0 bg-background items-center justify-center z-50">
                <ActivityIndicator size="large" color="white" />
                <Text className="text-white mt-4 text-2xl">
                  {processingMessage}
                </Text>
                <Text className="text-white/70 mt-2 text-center px-6">
                  Your moment is being captured
                </Text>
              </View>
            )}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    );
  }

  // Show filtered image if captured
  if (!image) {
    return <View className="flex-1 bg-black" />;
  }

  // Calculate dimensions maintaining 1080x1350 aspect ratio (4:5)
  // This matches the aspect ratio the image was resized to during capture
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

  // Scale dimensions for supersampling
  const scaledImageWidth = imageWidth * pixelDensity;
  const scaledImageHeight = imageHeight * pixelDensity;

  return (
    <View className="flex-1 bg-background ">
      <View className="flex-1 items-center justify-center">
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
              {/* Step 2: Apply minimal grain effect */}
              {grainEffect && (
                <RuntimeShader
                  source={grainEffect}
                  uniforms={{
                    intensity: 0.12, // Super obvious intensity for testing
                    resolution: [scaledImageWidth, scaledImageHeight],
                  }}
                />
              )}
            </Image>
          </Group>
        </Canvas>
      </View>
      {/* Action buttons */}
      <View className="absolute z-10 bottom-8 left-0 right-0 items-center gap-4">
        <TouchableOpacity
          onPress={saveImageToGallery}
          disabled={isSaving}
          className="bg-blue-500 px-6 py-3 rounded-lg"
        >
          <Text className="text-white font-semibold">
            {isSaving ? "Saving..." : "Save to Gallery"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={retakePicture}
          className="bg-white px-6 py-3 rounded-lg"
        >
          <Text className="text-black font-semibold">Retake</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
