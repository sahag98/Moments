import { Container } from "@/components/Container";
import { DailyHypeLimitModal } from "@/components/DailyHypeLimitModal";
import { HelloWave } from "@/components/hello-wave";
import { NewUpdateAvailableCard } from "@/components/NewUpdateAvailableCard";
import { SneakPeekUpdateCard } from "@/components/SneakPeekUpdateCard";
import { UpdateModal } from "@/components/update-modal";
import { useAuth } from "@/contexts/AuthContext";
import { Tables } from "@/database.types";
import { BIBLE_VERSES } from "@/lib/bible-verses";
import {
  FEED_PAGE_SIZE,
  FeedPost,
  FeedQueryData,
  feedPostsQueryKey,
  fetchExpoTokenForProfile,
  fetchFeedData,
  fetchFeedPostById,
} from "@/lib/queries/feed";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useHypeStore } from "@/store/hypeStore";
import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import LottieView from "lottie-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Modal,
  Platform,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

/** Home feed row shape (narrow select + joined profile). */
type Post = FeedPost;

type BibleVerse = {
  id: string;
  type: "verse";
  text: string;
  reference: string;
};

type EndOfFeed = {
  id: string;
  type: "endOfFeed";
};

type FeedItem = Post | BibleVerse | EndOfFeed;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

let verseIdSeq = 0;

const HAS_VIEWED_FULL_SCREEN_KEY = "@has_viewed_full_screen_post";
const FEEDBACK_BANNER_DISMISSED_KEY = "@feedback_banner_dismissed_v1";

function applyOptimisticHype(
  posts: FeedPost[],
  optimistic: Map<number, { profileId: string; increment: number }>,
): FeedPost[] {
  if (optimistic.size === 0) return posts;
  return posts.map((post) => {
    const o = optimistic.get(post.id);
    if (!o || !post.profiles || o.profileId !== post.profiles.id) {
      return post;
    }
    return {
      ...post,
      profiles: {
        ...post.profiles,
        hype: (post.profiles.hype || 0) + o.increment,
      },
    };
  });
}

// Animated Verse Component
const AnimatedVerseItem = ({
  item,
  scrollY,
  index,
  itemOffset,
}: {
  item: BibleVerse;
  scrollY: { value: number };
  index: number;
  itemOffset: number;
}) => {
  const estimatedItemHeight = SCREEN_HEIGHT * 0.6;

  const animatedStyle = useAnimatedStyle(() => {
    "worklet";
    const itemCenterY = itemOffset + estimatedItemHeight / 2;
    const viewportCenterY = scrollY.value + SCREEN_HEIGHT / 2;
    const distanceFromCenter = Math.abs(itemCenterY - viewportCenterY);

    // Maximum distance for scaling (60% of viewport)
    const maxDistance = SCREEN_HEIGHT * 0.6;

    // Calculate scale: 1.0 at center, 0.85 at max distance
    const normalizedDistance = Math.min(distanceFromCenter / maxDistance, 1);
    const scale = 1.0 - normalizedDistance * 0.15; // Scale from 1.0 to 0.85

    return {
      transform: [{ scale: Math.max(scale, 0.85) }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          borderRadius: 30,
          backgroundColor: "#1a1a1a",
          marginBottom: -1, // Compensate for visual gap from rounded corners
        },
        animatedStyle,
      ]}
      className="overflow-hidden"
    >
      <View
        className="w-full justify-center items-center p-8"
        style={{ aspectRatio: 1080 / 1350, minHeight: 400 }}
      >
        <View className="flex-1 justify-center items-center px-4">
          <Text className="text-white text-xl text-center leading-8 mb-6">
            "{item.text}"
          </Text>
          <Text className="text-gray-400 text-base font-medium">
            {item.reference}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};

// Animated End of Feed Component
const AnimatedEndOfFeedItem = ({
  scrollY,
  index,
  itemOffset,
}: {
  scrollY: { value: number };
  index: number;
  itemOffset: number;
}) => {
  const estimatedItemHeight = SCREEN_HEIGHT * 0.6;

  const animatedStyle = useAnimatedStyle(() => {
    "worklet";
    const itemCenterY = itemOffset + estimatedItemHeight / 2;
    const viewportCenterY = scrollY.value + SCREEN_HEIGHT / 2;
    const distanceFromCenter = Math.abs(itemCenterY - viewportCenterY);

    // Maximum distance for scaling (60% of viewport)
    const maxDistance = SCREEN_HEIGHT * 0.6;

    // Calculate scale: 1.0 at center, 0.85 at max distance
    const normalizedDistance = Math.min(distanceFromCenter / maxDistance, 1);
    const scale = 1.0 - normalizedDistance * 0.15; // Scale from 1.0 to 0.85

    return {
      transform: [{ scale: Math.max(scale, 0.85) }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          borderRadius: 30,
          backgroundColor: "#1a1a1a",
          marginBottom: -1, // Compensate for visual gap from rounded corners
        },
        animatedStyle,
      ]}
      className="overflow-hidden"
    >
      <View
        className="w-full justify-center items-center p-8"
        style={{ aspectRatio: 1080 / 1350, minHeight: 400 }}
      >
        <Text className="text-white text-2xl font-bold mb-6 text-center">
          That's all for now
        </Text>
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-gray-300 text-lg text-center leading-7 mb-6">
            Take this time to be intentional. Step away from your phone and
            spend meaningful moments with those around you.
          </Text>
          <Text className="text-gray-400 text-base text-center leading-6">
            Come back later for more!
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};

// Animated Post Component
const AnimatedPostItem = ({
  item,
  scrollY,
  index,
  itemOffset,
  optimisticHypeUpdates,
  onOptimisticHypeUpdate,
  onDailyLimitReached,
  showFullScreenHint,
  onViewFullScreen,
  onRequestFlagPost,
}: {
  item: Post;
  scrollY: { value: number };
  index: number;
  itemOffset: number;
  optimisticHypeUpdates: Map<number, { profileId: string; increment: number }>;
  onOptimisticHypeUpdate: (
    postId: number,
    profileId: string,
    increment: number,
  ) => void;
  onDailyLimitReached: () => void;
  showFullScreenHint?: boolean;
  onViewFullScreen?: () => void;
  onRequestFlagPost: (post: Post) => void;
}) => {
  const { user, refreshProfile, profile: currentUser } = useAuth();
  const hypedPosts = useHypeStore((state) => state.hypedPosts);
  const { addHypedPost, hasUsedDailyHype, incrementDailyHype } = useHypeStore();
  const profile = item.profiles;
  const displayName = profile?.full_name || profile?.username || "Unknown";
  const postOwnerId = item.user_id;
  const isHyped = hypedPosts.includes(item.id);
  const [showFirework, setShowFirework] = useState(false);

  // Dirsplay hype - the state is already updated optimistically, so just use the value
  const displayHype = item.profiles?.hype || 0;
  // Posts have aspect ratio 1080/1350, so approximate height
  const estimatedItemHeight = SCREEN_WIDTH * (1350 / 1080) + 0; // Add margin

  const animatedStyle = useAnimatedStyle(() => {
    "worklet";
    const itemCenterY = itemOffset + estimatedItemHeight / 2;
    const viewportCenterY = scrollY.value + SCREEN_HEIGHT / 2;
    const distanceFromCenter = Math.abs(itemCenterY - viewportCenterY);

    // Maximum distance for scaling (60% of viewport)
    const maxDistance = SCREEN_HEIGHT * 0.9;

    // Calculate scale: 1.0 at center, 0.85 at max distance
    const normalizedDistance = Math.min(distanceFromCenter / maxDistance, 1);
    const scale = 1.0 - normalizedDistance * 0.15; // Scale from 1.0 to 0.85

    return {
      transform: [{ scale: Math.max(scale, 0.89) }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          borderRadius: 30,
          marginBottom: -1, // Compensate for visual gap from rounded corners
        },
        animatedStyle,
      ]}
      className="overflow-hidden"
    >
      {/* User Header */}
      <View className="absolute bottom-0 gap-3 left-0 z-10 flex-row items-end justify-between w-full p-3">
        <View className="flex-row items-center gap-3">
          {profile?.avatar_url ? (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/post-image",
                  params: { image: profile.avatar_url },
                })
              }
              activeOpacity={0.9}
            >
              <Image
                source={{
                  uri: profile?.avatar_url,
                }}
                style={{
                  width: 60,
                  height: 60,
                  borderWidth: 1,
                  borderColor: "#989898",
                  borderRadius: 20,
                }}
                contentFit="cover"
                transition={200}
              />
            </TouchableOpacity>
          ) : (
            <View className="w-16 h-16 rounded-full bg-white/15 items-center justify-center mr-3">
              <Text className="text-white text-xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View className="">
            <Text className="text-white text-lg font-semibold ">
              {displayName}
            </Text>
          </View>
        </View>

        <View className="items-center justify-center relative">
          {/* Hype Button */}

          <TouchableOpacity
            onPress={async () => {
              if (isHyped) return; // Already hyped, do nothing
              // Check if user has used their daily hype
              if (hasUsedDailyHype()) {
                onDailyLimitReached();
                return;
              }

              if (!user?.id) return;

              // Optimistically update the hype count immediately (UI only)
              onOptimisticHypeUpdate(item.id, postOwnerId, 1);

              // Show firework animation
              setShowFirework(true);

              // Increment hype count for the post owner using Edge Function
              try {
                const { data, error } = await supabase.functions.invoke(
                  "increment-hype",
                  {
                    body: JSON.stringify({
                      profileId: postOwnerId,
                      userId: user.id,
                      postId: item.id,
                    }),
                  },
                );

                if (error) {
                  console.error("Error updating hype:", error);

                  // Check if it's a daily limit error
                  const errorData =
                    typeof error === "string" ? JSON.parse(error) : error;
                  if (
                    errorData?.error === "DAILY_LIMIT_REACHED" ||
                    error?.message?.includes("DAILY_LIMIT_REACHED")
                  ) {
                    onDailyLimitReached();
                  }

                  // Rollback optimistic update on error
                  onOptimisticHypeUpdate(item.id, postOwnerId, -1);
                  return;
                }

                // Check response data for daily limit error
                if (data?.error === "DAILY_LIMIT_REACHED") {
                  onDailyLimitReached();
                  onOptimisticHypeUpdate(item.id, postOwnerId, -1);
                  return;
                }

                // Server accepted: persist boost locally so we can't boost this post again
                addHypedPost(item.id);
                incrementDailyHype();

                // Remove optimistic update since server confirmed it
                // The realtime subscription will update it with the actual value
                onOptimisticHypeUpdate(item.id, postOwnerId, 0);

                // Refresh profile if it's the current user's own post (unlikely but possible)
                if (user.id === postOwnerId) {
                  await refreshProfile();
                }

                // Send push notification to post owner only on success (token fetched on demand)
                const ownerExpoToken = await fetchExpoTokenForProfile(
                  postOwnerId,
                );
                if (ownerExpoToken) {
                  const message = {
                    to: ownerExpoToken,
                    sound: "default",
                    title: "Moments",
                    body: `${currentUser?.username} boosted your moment! 📸`,
                    data: {
                      route: "/",
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
                        `Failed to send notification`,
                        response.statusText,
                      );
                    }
                  } catch (notifError) {
                    console.error(`Error sending notification`, notifError);
                  }
                }
              } catch (error: any) {
                console.error("Error hyping post:", error);

                // Check if it's a daily limit error from response
                if (
                  error?.error === "DAILY_LIMIT_REACHED" ||
                  error?.message?.includes("DAILY_LIMIT_REACHED")
                ) {
                  onDailyLimitReached();
                }

                // Rollback optimistic update on error
                onOptimisticHypeUpdate(item.id, postOwnerId, -1);
              }
            }}
            disabled={isHyped || postOwnerId === user?.id}
            className={
              isHyped
                ? cn(
                    "bg-blue-500/15 border-2 disabled:opacity-50 border-blue-500 px-3 py-1 rounded-3xl items-center justify-center gap-1",
                  )
                : cn(
                    "bg-white/15 px-3 py-1 border-2 disabled:opacity-50 border-[#474747] rounded-3xl items-center justify-center gap-1",
                  )
            }
            activeOpacity={0.7}
          >
            {/* <Ionicons
              name={isHyped ? "flash" : "flash-outline"}
              size={18}
              color={isHyped ? "#FFD700" : "#fff"}
            /> */}
            <Text className="text-white text-xl font-bold">{displayHype}</Text>
            <Text className="text-white text-4xl font-semibold">📸</Text>
          </TouchableOpacity>

          {/* Firework Animation */}
          {showFirework && (
            <View
              className="absolute"
              style={{
                top: -SCREEN_HEIGHT * 0.1,
                right: -50,
                width: 200,
                height: 200,
                zIndex: 20,
                pointerEvents: "none",
              }}
            >
              <LottieView
                source={require("@/assets/Confetti.json")}
                loop={false}
                autoPlay={true}
                onAnimationFinish={() => {
                  setShowFirework(false);
                }}
                style={{ width: 200, height: 200 }}
              />
            </View>
          )}
        </View>
      </View>

      {/* Post Image */}
      {item.image ? (
        <TouchableOpacity
          style={{ position: "relative" }}
          activeOpacity={1}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onViewFullScreen?.();
            router.push({
              pathname: "/post-image",
              params: { image: item.image },
            });
          }}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (!user?.id || user.id === postOwnerId) return;
            onRequestFlagPost(item);
          }}
          delayLongPress={600}
        >
          <Image
            source={{
              uri: item.image,
            }}
            className="w-full bg-black"
            style={{ aspectRatio: 1080 / 1350, borderRadius: 30 }}
            contentFit="cover"
            transition={200}
            placeholder={{ blurhash: "L47BAmj[%Mj[j[fQfQfQ~qj[ayj[" }}
            onError={(error) => {
              console.error("Error loading post image:", error);
            }}
          />
          {/* Full screen hint badge - only on first post until first view */}
          {showFullScreenHint && (
            <View
              style={{
                position: "absolute",
                top: 12,
                left: 16,
                right: 16,
                alignItems: "center",
                zIndex: 10,
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.65)",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  Tap to view in full screen
                </Text>
              </View>
            </View>
          )}
          {/* Gradient Overlay */}
          <LinearGradient
            colors={[
              "transparent",
              "rgba(0,0,0,0.3)",
              "rgba(0,0,0,0.4)",
              "rgba(0,0,0,0.5)",
            ]}
            locations={[0, 0.5, 0.8, 1]}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "40%",
              zIndex: 5,
              borderBottomLeftRadius: 30,
              borderBottomRightRadius: 30,
            }}
          />
        </TouchableOpacity>
      ) : (
        <View
          className="w-full bg-black justify-center items-center"
          style={{ aspectRatio: 1080 / 1350 }}
        >
          <ActivityIndicator size="large" color="white" />
        </View>
      )}
    </Animated.View>
  );
};

const getRandomVerse = (): BibleVerse => {
  const randomIndex = Math.floor(Math.random() * BIBLE_VERSES.length);
  const verse = BIBLE_VERSES[randomIndex];
  return {
    id: `verse-${Date.now()}-${randomIndex}-${++verseIdSeq}`,
    type: "verse",
    text: verse.text,
    reference: verse.reference,
  };
};

export default function HomeScreen() {
  const navigation = useNavigation();
  const { profile, user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const {
    clearHypedPosts,
    hasUsedDailyHype,
    incrementDailyHype,
    resetDailyHypeIfNeeded,
  } = useHypeStore();

  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [showDailyLimitModal, setShowDailyLimitModal] = useState(false);
  const [hasViewedFullScreen, setHasViewedFullScreen] = useState(true); // start true to avoid flash; set false after load
  const [showEulaModal, setShowEulaModal] = useState(false);
  const [eulaAccepting, setEulaAccepting] = useState(false);
  const [flagTargetPost, setFlagTargetPost] = useState<Post | null>(null);
  const [showFlagActionModal, setShowFlagActionModal] = useState(false);
  const [showFlagConfirmModal, setShowFlagConfirmModal] = useState(false);
  const [isSubmittingFlag, setIsSubmittingFlag] = useState(false);
  const [isBlockingUser, setIsBlockingUser] = useState(false);
  const [showFeedbackBanner, setShowFeedbackBanner] = useState(false);
  const lastPostIdRef = useRef<number | null>(null);
  const postsRef = useRef<Post[]>([]);
  const blockedUserIdsRef = useRef<string[]>([]);
  const listRef = useRef<Animated.FlatList<FeedItem> | null>(null);

  // Track optimistic hype updates: postId -> profileId -> increment amount
  const [optimisticHypeUpdates, setOptimisticHypeUpdates] = useState<
    Map<number, { profileId: string; increment: number }>
  >(new Map());

  const feedKey = feedPostsQueryKey(user?.id);
  const {
    data: feedQueryData,
    isPending,
    isFetching,
    refetch,
    error: feedError,
  } = useQuery({
    queryKey: feedKey,
    queryFn: () => fetchFeedData(user?.id),
  });

  useEffect(() => {
    if (feedError) console.error("Error fetching posts:", feedError);
  }, [feedError]);

  const basePosts = useMemo(
    () => feedQueryData?.posts ?? [],
    [feedQueryData],
  );

  /** Only subscribe to profile rows for authors in the current feed (+ self). */
  const profileRealtimeFilterIds = useMemo(() => {
    const ids = new Set<string>();
    if (profile?.id) ids.add(profile.id);
    for (const p of basePosts) {
      if (p.user_id) ids.add(p.user_id);
    }
    return Array.from(ids).sort();
  }, [basePosts, profile?.id]);

  const profileRealtimeFilterKey = profileRealtimeFilterIds.join(",");

  const posts = useMemo(
    () => applyOptimisticHype(basePosts, optimisticHypeUpdates),
    [basePosts, optimisticHypeUpdates],
  );

  const feedItems = useMemo((): FeedItem[] => {
    if (posts.length === 0) return [];
    const interleavedItems: FeedItem[] = [];
    posts.forEach((post, index) => {
      interleavedItems.push(post);
      if ((index + 1) % 4 === 0 && index < posts.length - 1) {
        interleavedItems.push(getRandomVerse());
      }
    });
    interleavedItems.push({ id: "end-of-feed", type: "endOfFeed" });
    return interleavedItems;
  }, [posts]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    blockedUserIdsRef.current = feedQueryData?.blockedUserIds ?? [];
  }, [feedQueryData?.blockedUserIds]);

  useEffect(() => {
    if (basePosts.length > 0) {
      lastPostIdRef.current = basePosts[0].id;
    } else {
      lastPostIdRef.current = null;
    }
  }, [basePosts]);

  const refreshing = isFetching && !isPending;

  // Animation for scroll-based scaling
  const scrollY = useSharedValue(0);

  // Handle optimistic hype updates (display merges via applyOptimisticHype)
  const handleOptimisticHypeUpdate = useCallback(
    (postId: number, profileId: string, increment: number) => {
      setOptimisticHypeUpdates((prev) => {
        const newMap = new Map(prev);
        if (increment === 0) {
          newMap.delete(postId);
        } else {
          const existing = newMap.get(postId);
          if (existing) {
            const newIncrement = existing.increment + increment;
            if (newIncrement === 0) {
              newMap.delete(postId);
            } else {
              newMap.set(postId, { profileId, increment: newIncrement });
            }
          } else if (increment > 0) {
            newMap.set(postId, { profileId, increment });
          }
        }
        return newMap;
      });
    },
    [],
  );

  // Scroll handler to track scroll position
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Reset daily hype count if it's a new day
  useEffect(() => {
    resetDailyHypeIfNeeded();
  }, []);

  // Show EULA modal for existing users who haven't accepted terms yet
  useEffect(() => {
    if (profile && !(profile as Tables<"profiles">).eula_accepted_at) {
      setShowEulaModal(true);
    }
  }, [profile]);

  const handleRequestFlagPost = (post: Post) => {
    setFlagTargetPost(post);
    setShowFlagActionModal(true);
  };

  const handleOpenFlagConfirm = () => {
    setShowFlagActionModal(false);
    setShowFlagConfirmModal(true);
  };

  const handleConfirmFlagPost = async () => {
    if (!flagTargetPost) return;
    setIsSubmittingFlag(true);
    try {
      const { error } = await supabase
        .from("posts")
        .update({ flagged: true })
        .eq("id", flagTargetPost.id);

      if (error) {
        console.error("Error flagging post:", error);
        Alert.alert(
          "Something went wrong",
          "We couldn't flag this post right now. Please try again.",
        );
        return;
      }

      queryClient.setQueryData<FeedQueryData>(feedKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          posts: prev.posts.map((p) =>
            p.id === flagTargetPost.id ? { ...p, flagged: true } : p,
          ),
        };
      });

      Alert.alert(
        "Thanks for flagging",
        "Thanks for flagging this post. We'll review it shortly.",
      );
    } catch (e) {
      console.error("Unexpected error flagging post:", e);
      Alert.alert(
        "Something went wrong",
        "We couldn't flag this post right now. Please try again.",
      );
    } finally {
      setIsSubmittingFlag(false);
      setShowFlagConfirmModal(false);
      setFlagTargetPost(null);
    }
  };

  const handleBlockUserPress = () => {
    if (!flagTargetPost || !user?.id) return;

    const blockedUserId = flagTargetPost.user_id;

    if (blockedUserId === user.id) {
      Alert.alert(
        "You can't block yourself",
        "You can only block other users' moments.",
      );
      return;
    }

    Alert.alert(
      "Block this user?",
      "You won't see any of their moments again. This action cannot be undone in the app. If you ever want to unblock them, you'll need to reach out to our team.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Block user",
          style: "destructive",
          onPress: async () => {
            if (isBlockingUser) return;
            setIsBlockingUser(true);
            try {
              const { error } = await supabase.from("blocked_users").upsert(
                {
                  blocker_id: user.id,
                  blocked_user_id: blockedUserId,
                },
                { onConflict: "blocker_id,blocked_user_id" },
              );

              if (error) {
                console.error("Error blocking user:", error);
                Alert.alert(
                  "Something went wrong",
                  "We couldn't block this user right now. Please try again.",
                );
                return;
              }

              queryClient.setQueryData<FeedQueryData>(feedKey, (prev) => {
                if (!prev) return prev;
                const blockedUserIds = [
                  ...new Set([...prev.blockedUserIds, blockedUserId]),
                ];
                return {
                  blockedUserIds,
                  posts: prev.posts.filter((p) => p.user_id !== blockedUserId),
                };
              });

              setShowFlagActionModal(false);
              setShowFlagConfirmModal(false);
              setFlagTargetPost(null);

              Alert.alert(
                "User blocked",
                "You won't see any of this user's moments again. To unblock them in the future, please contact our team.",
              );
            } catch (e) {
              console.error("Unexpected error blocking user:", e);
              Alert.alert(
                "Something went wrong",
                "We couldn't block this user right now. Please try again.",
              );
            } finally {
              setIsBlockingUser(false);
            }
          },
        },
      ],
    );
  };

  const handleAcceptEula = async () => {
    if (!user?.id) return;
    setEulaAccepting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          eula_accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;
      await refreshProfile();
      setShowEulaModal(false);
    } catch (e) {
      console.error("Failed to accept EULA:", e);
    } finally {
      setEulaAccepting(false);
    }
  };

  // Load "has viewed full screen" once so we only show the hint on first post until first view
  useEffect(() => {
    AsyncStorage.getItem(HAS_VIEWED_FULL_SCREEN_KEY).then((value) => {
      setHasViewedFullScreen(value === "true");
    });
  }, []);

  const hideFeedbackBanner = async () => {
    try {
      await AsyncStorage.setItem(FEEDBACK_BANNER_DISMISSED_KEY, "true");
    } catch (error) {
      console.error("Failed to persist feedback banner dismissal:", error);
    } finally {
      setShowFeedbackBanner(false);
    }
  };

  const handlePressFeedback = async () => {
    try {
      await Linking.openURL("https://moments.canny.io/feature-requests");
    } catch (error) {
      console.error("Failed to open feedback URL:", error);
    } finally {
      hideFeedbackBanner();
    }
  };

  useEffect(() => {
    // Only set up subscription if user is authenticated
    if (!profile?.id) {
      console.log("User not authenticated, skipping subscription setup");
      return;
    }

    const key = feedPostsQueryKey(user?.id);

    // Set up real-time subscription for new posts
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      // Use a unique channel name with user ID to avoid conflicts
      const channelName = `posts_changes_${profile.id}_${Date.now()}`;

      const profileFilterIds = profileRealtimeFilterIds;
      const profileFilter =
        profileFilterIds.length === 0
          ? null
          : profileFilterIds.length === 1
            ? `id=eq.${profileFilterIds[0]}`
            : `id=in.(${profileFilterIds.join(",")})`;

      channel = supabase.channel(channelName);

      channel.on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "posts",
          },
          (payload) => {
            const newPost = payload.new as Tables<"posts">;

            // Use refs to get current values (avoid stale closures)
            const currentLastPostId = lastPostIdRef.current;
            const currentPosts = postsRef.current;
            const currentUserId = profile?.id;
            const blockedUserIds = blockedUserIdsRef.current;

            // Check if post already exists in current feed
            const postAlreadyExists = currentPosts.some(
              (post) => post.id === newPost.id,
            );

            // Check if this is actually a new post (not already in the feed and newer than last post)
            const isActuallyNew =
              !postAlreadyExists &&
              (!currentLastPostId || newPost.id > currentLastPostId);

            console.log("New post received:", {
              postId: newPost.id,
              userId: newPost.user_id,
              currentUserId: currentUserId,
              lastPostId: currentLastPostId,
              postAlreadyExists,
              isActuallyNew,
              currentPostsCount: currentPosts.length,
            });

            // Ignore posts from users that the current user has blocked
            if (blockedUserIds.includes(newPost.user_id)) {
              console.log(
                "New post from blocked user received, ignoring for feed UI",
              );
              return;
            }

            if (newPost.user_id === currentUserId) {
              console.log(
                "Current user's post, merging into feed without full refetch",
              );
              void (async () => {
                const row = await fetchFeedPostById(newPost.id);
                if (!row) {
                  await queryClient.invalidateQueries({ queryKey: key });
                  setHasNewPosts(false);
                  return;
                }
                queryClient.setQueryData<FeedQueryData>(key, (prev) => {
                  const blocked =
                    prev?.blockedUserIds ?? blockedUserIdsRef.current;
                  if (blocked.includes(row.user_id)) {
                    return prev ?? { posts: [], blockedUserIds: blocked };
                  }
                  if (prev?.posts.some((p) => p.id === row.id)) {
                    return prev;
                  }
                  const nextPosts = [row, ...(prev?.posts ?? [])].slice(
                    0,
                    FEED_PAGE_SIZE,
                  );
                  return {
                    blockedUserIds: prev?.blockedUserIds ?? blocked,
                    posts: nextPosts,
                  };
                });
                setHasNewPosts(false);
              })();
            } else if (isActuallyNew) {
              // Only show refresh button if it's a new post from another user
              console.log("New post from another user, showing refresh button");
              setHasNewPosts(true);
            } else {
              console.log("Post is not new or already loaded, ignoring");
            }
          },
        );

      if (profileFilter) {
        channel.on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: profileFilter,
          },
          (payload) => {
            const updatedProfile = payload.new as Tables<"profiles">;
            const oldProfile = payload.old as Tables<"profiles">;

            // Check if full_name changed (current user's profile)
            if (
              updatedProfile.id === profile?.id &&
              updatedProfile.full_name !== oldProfile.full_name
            ) {
              console.log("Profile full_name updated via realtime:", {
                profileId: updatedProfile.id,
                oldName: oldProfile.full_name,
                newName: updatedProfile.full_name,
              });
              // Refresh profile to update context
              refreshProfile();
            }

            // Check if hype count changed
            if (updatedProfile.hype !== oldProfile.hype) {
              console.log("Profile hype updated via realtime:", {
                profileId: updatedProfile.id,
                oldHype: oldProfile.hype,
                newHype: updatedProfile.hype,
              });

              // Clear optimistic update for this profile since we got the real value
              setOptimisticHypeUpdates((prev) => {
                const newMap = new Map(prev);
                // Find and remove optimistic updates for posts with this profile
                for (const [postId, update] of prev.entries()) {
                  if (update.profileId === updatedProfile.id) {
                    newMap.delete(postId);
                  }
                }
                return newMap;
              });

              queryClient.setQueryData<FeedQueryData>(key, (prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  posts: prev.posts.map((post) => {
                    if (post.profiles?.id === updatedProfile.id) {
                      return {
                        ...post,
                        profiles: {
                          ...post.profiles,
                          hype: updatedProfile.hype,
                        },
                      };
                    }
                    return post;
                  }),
                };
              });
            }
          },
        );
      }

      channel.on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "posts",
          },
          (payload) => {
            const deletedPost = payload.old as Tables<"posts">;
            console.log("Post deleted via realtime:", {
              postId: deletedPost.id,
              userId: deletedPost.user_id,
            });

            queryClient.setQueryData<FeedQueryData>(key, (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                posts: prev.posts.filter((p) => p.id !== deletedPost.id),
              };
            });
          },
        );

      channel.subscribe((status, err) => {
          console.log("Subscription status:", status, "Channel:", channelName);
          if (status === "SUBSCRIBED") {
            console.log(
              "Successfully subscribed to posts_changes (INSERT/DELETE) and filtered profile_updates",
            );
          } else if (status === "CHANNEL_ERROR") {
            console.error("Channel subscription error:", err);
            console.error("Error details:", JSON.stringify(err, null, 2));
            console.error("Possible causes:");
            console.error(
              "1. RLS policies blocking access - check Database > Tables > posts > Policies",
            );
            console.error(
              "2. Realtime not enabled for posts table - check Database > Replication",
            );
            console.error("3. Network/authentication issues");
          } else if (status === "TIMED_OUT") {
            console.warn("Subscription timed out - retrying...");
            // Could implement retry logic here
          } else if (status === "CLOSED") {
            console.warn("Subscription closed");
          }
        });
    } catch (error) {
      console.error("Error setting up subscription:", error);
    }

    return () => {
      console.log("Cleaning up posts subscription");
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [
    profile?.id,
    user?.id,
    queryClient,
    refreshProfile,
    profileRealtimeFilterKey,
  ]);

  const isFocused = useIsFocused();

  const onRefresh = useCallback(() => {
    console.log("[Refresh] Pull to refresh triggered");
    void refetch().then(() => setHasNewPosts(false));
  }, [refetch]);

  // When the Home tab icon is pressed:
  // 1) scroll to top (smooth)
  // 2) show refresh indicator
  // 3) refresh posts
  useEffect(() => {
    const nav: any = navigation;
    const unsubscribe = nav.addListener("tabPress", () => {
      // Only trigger scroll-to-top + refresh when this screen is already focused
      if (!isFocused) {
        return;
      }
      if (listRef.current) {
        // Always scroll to absolute offset 0 so the refresh indicator is fully visible.
        // scrollToIndex(0) can stop at item layout offset when getItemLayout is provided.
        listRef.current.scrollToOffset({ offset: 0, animated: true });
      }
      // Kick off refresh right after the scroll request
      requestAnimationFrame(() => onRefresh());
    });

    return unsubscribe;
  }, [navigation, isFocused, onRefresh]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return "Just now";
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
  };

  const firstPostIndex = feedItems.findIndex((i) => !("type" in i));

  if (isPending && basePosts.length === 0) {
    return (
      <Container>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="white" />
          <Text className="text-white mt-4">Loading posts...</Text>
        </View>
      </Container>
    );
  }

  return (
    <Container>
      <UpdateModal />
      <View className="flex-1">
        <View className="flex-row items-center justify-between pb-4 mb-0">
          <View className="flex-row items-center gap-2">
            <Text className="text-white text-2xl font-bold">
              Hey {profile?.full_name || profile?.username || "there"}
            </Text>
            <HelloWave />
          </View>
          <TouchableOpacity
            onPress={handlePressFeedback}
            className="bg-primary p-3 rounded-2xl flex-row items-center justify-center gap-2"
          >
            <Text className="text-white font-semibold">Feedback</Text>
            <Ionicons
              name="chatbox-ellipses-outline"
              size={20}
              color="#ffffff"
            />
          </TouchableOpacity>
        </View>

        <NewUpdateAvailableCard />
        <SneakPeekUpdateCard />

        {/* Refresh Button - shown when new posts are available */}
        {hasNewPosts && (
          <TouchableOpacity
            onPress={onRefresh}
            className="bg-primary m-3 p-3 rounded-xl items-center"
          >
            <Text className="text-white text-[15px] font-semibold">
              New moments available
            </Text>
            <Text className="text-white text-xs mt-0.5 opacity-80">
              Tap to refresh
            </Text>
          </TouchableOpacity>
        )}

        {posts.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-white text-2xl mb-2">No moments yet</Text>
            <Text className="text-gray-400 text-center px-6">
              Be the first to share a moment!
            </Text>
          </View>
        ) : (
          <Animated.FlatList
            ref={listRef}
            data={feedItems}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            ItemSeparatorComponent={null}
            onScrollToIndexFailed={(info) => {
              // If the list hasn't measured items yet, fall back to offset 0 and retry quickly.
              // This keeps the interaction smooth without getting "stuck" short of the top.
              if (listRef.current) {
                listRef.current.scrollToOffset({ offset: 0, animated: true });
                requestAnimationFrame(() => {
                  try {
                    listRef.current?.scrollToIndex({
                      index: 0,
                      animated: true,
                      viewPosition: 0,
                    });
                  } catch {}
                });
              }
            }}
            renderItem={({ item, index }) => {
              // Calculate accumulated offset for more accurate positioning
              let accumulatedOffset = 100; // Header height
              for (let i = 0; i < index; i++) {
                const prevItem = feedItems[i];
                if ("type" in prevItem) {
                  if (
                    prevItem.type === "verse" ||
                    prevItem.type === "endOfFeed"
                  ) {
                    accumulatedOffset += SCREEN_HEIGHT * 0.6; // Verse/EndOfFeed height
                  } else {
                    accumulatedOffset += SCREEN_WIDTH * (1350 / 1080); // Post height
                  }
                } else {
                  accumulatedOffset += SCREEN_WIDTH * (1350 / 1080); // Post height
                }
              }

              if ("type" in item && item.type === "verse") {
                return (
                  <AnimatedVerseItem
                    item={item as BibleVerse}
                    scrollY={scrollY}
                    index={index}
                    itemOffset={accumulatedOffset}
                  />
                );
              }

              if ("type" in item && item.type === "endOfFeed") {
                return (
                  <AnimatedEndOfFeedItem
                    scrollY={scrollY}
                    index={index}
                    itemOffset={accumulatedOffset}
                  />
                );
              }

              return (
                <AnimatedPostItem
                  item={item as Post}
                  scrollY={scrollY}
                  index={index}
                  itemOffset={accumulatedOffset}
                  optimisticHypeUpdates={optimisticHypeUpdates}
                  onOptimisticHypeUpdate={handleOptimisticHypeUpdate}
                  onDailyLimitReached={() => setShowDailyLimitModal(true)}
                  showFullScreenHint={
                    !hasViewedFullScreen && index === firstPostIndex
                  }
                  onViewFullScreen={() => {
                    setHasViewedFullScreen(true);
                    AsyncStorage.setItem(HAS_VIEWED_FULL_SCREEN_KEY, "true");
                  }}
                  onRequestFlagPost={handleRequestFlagPost}
                />
              );
            }}
            showsVerticalScrollIndicator={false}
            keyExtractor={(item, index) => {
              if ("type" in item) {
                if (item.type === "verse") {
                  return (item as BibleVerse).id;
                }
                if (item.type === "endOfFeed") {
                  return (item as EndOfFeed).id;
                }
              }
              return (item as Post).id.toString();
            }}
            contentContainerStyle={{
              paddingTop: 0,
              paddingBottom: 100,
              gap: 0,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="white"
                colors={["white"]}
                progressViewOffset={Platform.OS === "android" ? 20 : 0}
                title="Pull to refresh"
                titleColor="#d2d2d2"
              />
            }
            bounces={true}
            scrollEnabled={true}
            overScrollMode="auto"
            alwaysBounceVertical={Platform.OS === "ios"}
          />
        )}
      </View>

      <DailyHypeLimitModal
        visible={showDailyLimitModal}
        onClose={() => setShowDailyLimitModal(false)}
      />

      {/* Flag action modal: shown after long-press, prominent flag button with icon */}
      <Modal
        animationType="fade"
        transparent
        visible={showFlagActionModal}
        statusBarTranslucent
        onRequestClose={() => {
          setShowFlagActionModal(false);
          setFlagTargetPost(null);
        }}
      >
        <View
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}
        >
          <View className="bg-secondary p-6 rounded-2xl w-full max-w-md items-center">
            <TouchableOpacity
              onPress={handleOpenFlagConfirm}
              className="flex-row items-center justify-center gap-3 w-full py-4 px-6 rounded-xl bg-red-900 border-2 border-red-700"
              activeOpacity={0.85}
            >
              <Ionicons name="flag" size={24} color="#fff" />
              <Text className="text-white font-bold text-lg">Flag post</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleBlockUserPress}
              className="flex-row items-center justify-center gap-3 w-full py-3 px-6 rounded-xl bg-white/10 border border-white/20 mt-3"
              activeOpacity={0.85}
              disabled={isBlockingUser}
            >
              {isBlockingUser ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-remove" size={22} color="#fff" />
                  <Text className="text-white font-semibold text-base">
                    Block user
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowFlagActionModal(false);
                setFlagTargetPost(null);
              }}
              className="mt-4 py-3 px-6"
            >
              <Text className="text-gray-400 font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showFlagConfirmModal}
        statusBarTranslucent
        onRequestClose={() => {
          if (isSubmittingFlag) return;
          setShowFlagConfirmModal(false);
          setFlagTargetPost(null);
        }}
      >
        <View
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
        >
          <View className="bg-secondary p-6 rounded-2xl w-full max-w-md">
            <Text className="text-white text-xl font-bold mb-3 text-center">
              Flag this post?
            </Text>
            <Text className="text-gray-300 text-center mb-6">
              We&apos;ll review flagged posts to make sure they follow our
              community guidelines.
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  if (isSubmittingFlag) return;
                  setShowFlagConfirmModal(false);
                  setFlagTargetPost(null);
                }}
                className="flex-1 py-3 rounded-lg items-center bg-white/10"
                disabled={isSubmittingFlag}
              >
                <Text className="text-white font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmFlagPost}
                disabled={isSubmittingFlag}
                className="flex-1 py-3 rounded-lg items-center justify-center flex-row gap-2 bg-red-600"
              >
                {isSubmittingFlag ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="flag" size={20} color="#fff" />
                    <Text className="text-white font-semibold">Flag post</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={showEulaModal}
        statusBarTranslucent
      >
        <View
          className="flex-1 items-center justify-center px-6"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
        >
          <View className="bg-secondary p-6 rounded-2xl w-full max-w-md">
            <Text className="text-white text-xl font-bold mb-3 text-center">
              Terms of Use & Community Guidelines
            </Text>
            <Text className="text-gray-300 text-center mb-6">
              We have zero tolerance for objectionable content or abusive
              behavior. By continuing, you agree to our Terms of Use and
              Community Guidelines.
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                handleAcceptEula();
              }}
              disabled={eulaAccepting}
              className="bg-primary py-4 rounded-lg items-center"
            >
              {eulaAccepting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-lg">
                  I agree
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Container>
  );
}
