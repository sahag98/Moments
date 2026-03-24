import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImageManipulator from "expo-image-manipulator";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

interface ImageEditorModalProps {
  visible: boolean;
  imageUri: string | null;
  onCancel: () => void;
  onConfirm: (editedUri: string) => void;
}

export const ImageEditorModal = ({
  visible,
  imageUri,
  onCancel,
  onConfirm,
}: ImageEditorModalProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const frameSize = 288; // matches w-72 / h-72 container

  // Gesture state (shared with Reanimated)
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // JS copies of transform for crop math
  const jsScaleRef = useRef(1);
  const jsTranslateRef = useRef({ x: 0, y: 0 });

  const updateJsTransform = (s: number, x: number, y: number) => {
    jsScaleRef.current = s;
    jsTranslateRef.current = { x, y };
  };

  useEffect(() => {
    if (!imageUri) return;

    setImageSize(null);
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    jsScaleRef.current = 1;
    jsTranslateRef.current = { x: 0, y: 0 };

    Image.getSize(
      imageUri,
      (width, height) => {
        setImageSize({ width, height });
      },
      () => {
        Alert.alert("Error", "Unable to load image for editing.");
      },
    );
  }, [imageUri]);

  // Gestures: updated API (pinch + pan with fingers)
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      "worklet";
      let nextScale = savedScale.value * event.scale;
      if (nextScale < 1) nextScale = 1;
      if (nextScale > 4) nextScale = 4;
      scale.value = nextScale;
      runOnJS(updateJsTransform)(nextScale, translateX.value, translateY.value);
    })
    .onEnd(() => {
      "worklet";
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      "worklet";
      const nextX = savedTranslateX.value + event.translationX;
      const nextY = savedTranslateY.value + event.translationY;
      translateX.value = nextX;
      translateY.value = nextY;
      runOnJS(updateJsTransform)(scale.value, nextX, nextY);
    })
    .onEnd((event) => {
      "worklet";
      savedTranslateX.value = savedTranslateX.value + event.translationX;
      savedTranslateY.value = savedTranslateY.value + event.translationY;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const handleConfirm = async () => {
    if (!imageUri || !imageSize) return;

    try {
      setIsProcessing(true);

      const { width: imageW, height: imageH } = imageSize;
      const minSide = Math.min(imageW, imageH);

      // How the image is initially fit into the square frame
      const initialScale = frameSize / minSide;

      // Final scale the user applied in the preview
      const finalScale = initialScale * jsScaleRef.current;

      // Visible crop in original image coordinates
      const frameCenterX = 0;
      const frameCenterY = 0;

      // Translate values are in frame pixels; convert back to image space
      const offsetX = -jsTranslateRef.current.x / finalScale;
      const offsetY = -jsTranslateRef.current.y / finalScale;

      const halfCropSize = frameSize / finalScale / 2;

      let originX = imageW / 2 - halfCropSize + offsetX;
      let originY = imageH / 2 - halfCropSize + offsetY;
      let side = halfCropSize * 2;

      // Clamp crop to image bounds
      if (originX < 0) {
        side += originX;
        originX = 0;
      }
      if (originY < 0) {
        side += originY;
        originY = 0;
      }
      if (originX + side > imageW) {
        side = imageW - originX;
      }
      if (originY + side > imageH) {
        side = imageH - originY;
      }

      const result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.max(0, originX),
              originY: Math.max(0, originY),
              width: side,
              height: side,
            },
          },
          {
            resize: {
              width: 512,
              height: 512,
            },
          },
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      onConfirm(result.uri);
    } catch (error) {
      console.error("Error processing image:", error);
      Alert.alert("Error", "Failed to process image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!imageUri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View className="flex-1 bg-black/80 items-center justify-center px-4">
        <View className="w-full max-w-md rounded-3xl bg-[#111111] border border-white/10 shadow-2xl overflow-hidden">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
            <TouchableOpacity
              onPress={onCancel}
              disabled={isProcessing}
              className="px-4 py-3 rounded-full bg-white/5"
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>

            <Text className="text-white font-semibold text-lg">
              Adjust profile photo
            </Text>

            <TouchableOpacity
              onPress={handleConfirm}
              disabled={isProcessing || !imageSize}
              className={`px-4 py-3 rounded-full flex-row items-center justify-center ${
                isProcessing || !imageSize ? "bg-white/10" : "bg-primary"
              }`}
              activeOpacity={0.7}
            >
              {isProcessing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Ionicons name="checkmark" size={24} color="white" />
              )}
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View className="items-center justify-center px-4 py-6">
            {/* Image preview with pinch + pan gestures */}
            <View className="w-72 h-72 rounded-full overflow-hidden bg-black/80 border border-white/15 items-center justify-center">
              {imageSize ? (
                <GestureDetector gesture={composedGesture}>
                  <Animated.View className="items-center justify-center">
                    <Animated.Image
                      source={{ uri: imageUri }}
                      style={[
                        {
                          width: frameSize,
                          height: frameSize,
                        },
                        animatedImageStyle,
                      ]}
                      resizeMode="cover"
                    />
                    {/* Circular frame overlay */}
                    <View className="absolute inset-0 border-2 border-white/70 rounded-full pointer-events-none" />
                    <View
                      className="absolute inset-0 bg-black/25"
                      pointerEvents="none"
                    />
                  </Animated.View>
                </GestureDetector>
              ) : (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator color="#ffffff" />
                  <Text className="text-white/70 text-sm mt-3">
                    Loading image...
                  </Text>
                </View>
              )}
            </View>

            <Text className="text-white/70 text-xs mt-5 text-center px-4">
              Use two fingers to zoom and one finger to move your photo inside
              the circle.
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};
