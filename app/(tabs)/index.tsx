import { Container } from "@/components/Container";
import { DailyHypeLimitModal } from "@/components/DailyHypeLimitModal";
import { HelloWave } from "@/components/hello-wave";
import { useAuth } from "@/contexts/AuthContext";
import { Tables } from "@/database.types";
import { BIBLE_VERSES } from "@/lib/bible-verses";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useHypeStore } from "@/store/hypeStore";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import LottieView from "lottie-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Post = Tables<"posts"> & {
  profiles: Tables<"profiles"> | null;
};

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

// Post limit configuration - change this for testing vs production
// Set to 3 for easy testing, 20 for production
const POST_LIMIT = __DEV__ ? 3 : 20; // Automatically uses 3 in dev, 20 in production

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
        <Text className="text-white text-lg font-semibold mb-6 text-center">
          Take a moment and read this bible verse
        </Text>
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
          That's all for today
        </Text>
        <View className="flex-1 justify-center items-center px-6">
          <Text className="text-white text-xl text-balance text-center leading-8 mb-4">
            You've seen all the moments from today.
          </Text>
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
}: {
  item: Post;
  scrollY: { value: number };
  index: number;
  itemOffset: number;
  optimisticHypeUpdates: Map<number, { profileId: string; increment: number }>;
  onOptimisticHypeUpdate: (
    postId: number,
    profileId: string,
    increment: number
  ) => void;
  onDailyLimitReached: () => void;
}) => {
  const { user, refreshProfile } = useAuth();
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
            <Image
              source={{
                uri: profile?.avatar_url,
              }}
              style={{
                width: 40,
                height: 40,
                borderWidth: 1,
                borderColor: "#989898",
                borderRadius: 20,
              }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View className="w-14 h-14 rounded-full bg-white/15 items-center justify-center mr-3">
              <Text className="text-white text-xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View className="">
            <Text className="text-white font-semibold ">{displayName}</Text>
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

              // Mark as hyped locally
              addHypedPost(item.id);

              // Optimistically update the hype count immediately
              onOptimisticHypeUpdate(item.id, postOwnerId, 1);

              // Show firework animation
              setShowFirework(true);

              // Increment daily hype count
              incrementDailyHype();

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
                  }
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

                // Remove optimistic update since server confirmed it
                // The realtime subscription will update it with the actual value
                onOptimisticHypeUpdate(item.id, postOwnerId, 0);

                // Refresh profile if it's the current user's own post (unlikely but possible)
                if (user.id === postOwnerId) {
                  await refreshProfile();
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
              } finally {
                if (item.profiles?.expo_token) {
                  const message = {
                    to: item.profiles?.expo_token,
                    sound: "default",
                    title: "Moments",
                    body: `${profile?.username} appreciated your moment!`,
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
                      }
                    );

                    if (!response.ok) {
                      console.error(
                        `Failed to send notification`,
                        response.statusText
                      );
                    }
                  } catch (error) {
                    console.error(`Error sending notification`, error);
                  }
                }
              }
            }}
            disabled={isHyped || postOwnerId === user?.id}
            className={
              isHyped
                ? cn(
                    "bg-blue-500/15 border-2 disabled:opacity-50 border-blue-500 px-3 py-2 rounded-xl items-center justify-center gap-1"
                  )
                : cn(
                    "bg-white/15 px-3 py-2 border-2 disabled:opacity-50 border-[#474747] rounded-xl items-center justify-center gap-1"
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
            <Text className="text-white text-3xl font-semibold">📸</Text>
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
        <View style={{ position: "relative" }}>
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
              console.log("Image URL:", item.image);
            }}
          />
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
        </View>
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
    id: `verse-${Date.now()}-${randomIndex}`,
    type: "verse",
    text: verse.text,
    reference: verse.reference,
  };
};

export default function HomeScreen() {
  const { profile, user } = useAuth();
  const {
    clearHypedPosts,
    hasUsedDailyHype,
    incrementDailyHype,
    resetDailyHypeIfNeeded,
  } = useHypeStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [lastPostId, setLastPostId] = useState<number | null>(null);
  const [showDailyLimitModal, setShowDailyLimitModal] = useState(false);
  const lastPostIdRef = useRef<number | null>(null);
  const postsRef = useRef<Post[]>([]);
  // Track optimistic hype updates: postId -> profileId -> increment amount
  const [optimisticHypeUpdates, setOptimisticHypeUpdates] = useState<
    Map<number, { profileId: string; increment: number }>
  >(new Map());
  const { bottom } = useSafeAreaInsets();
  // Animation for scroll-based scaling
  const scrollY = useSharedValue(0);

  // Handle optimistic hype updates
  const handleOptimisticHypeUpdate = (
    postId: number,
    profileId: string,
    increment: number
  ) => {
    setOptimisticHypeUpdates((prev) => {
      const newMap = new Map(prev);
      if (increment === 0) {
        // Remove optimistic update (server confirmed)
        newMap.delete(postId);
      } else {
        const existing = newMap.get(postId);
        if (existing) {
          // Update existing optimistic update
          const newIncrement = existing.increment + increment;
          if (newIncrement === 0) {
            newMap.delete(postId);
          } else {
            newMap.set(postId, { profileId, increment: newIncrement });
          }
        } else if (increment > 0) {
          // Add new optimistic update
          newMap.set(postId, { profileId, increment });
        }
      }
      return newMap;
    });

    // Also update the posts and feedItems state optimistically
    if (increment !== 0) {
      setPosts((currentPosts) => {
        return currentPosts.map((post) => {
          if (post.id === postId && post.profiles?.id === profileId) {
            return {
              ...post,
              profiles: {
                ...post.profiles,
                hype: (post.profiles.hype || 0) + increment,
              },
            };
          }
          return post;
        });
      });

      setFeedItems((currentItems) => {
        return currentItems.map((item) => {
          if (
            "type" in item === false &&
            (item as Post).id === postId &&
            (item as Post).profiles?.id === profileId
          ) {
            return {
              ...(item as Post),
              profiles: {
                ...(item as Post).profiles!,
                hype: ((item as Post).profiles?.hype || 0) + increment,
              },
            } as Post;
          }
          return item;
        });
      });
    }
  };

  // Scroll handler to track scroll position
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const fetchPosts = async (showRefresh = false) => {
    try {
      if (showRefresh) {
        console.log("[Refresh] Setting refreshing state to true");
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data, error } = await supabase
        .from("posts")
        .select(
          `
          *,
          profiles (
            id,
            username,
            full_name,
            expo_token,
            avatar_url,
            hype
          )
        `
        )
        .order("created_at", { ascending: false })
        .limit(POST_LIMIT);

      if (error) {
        console.error("Error fetching posts:", error);
        return;
      }

      if (data) {
        const postsData = data as Post[];
        console.log(
          `[Feed] Fetched ${postsData.length} post(s) (limit: ${POST_LIMIT})`
        );
        setPosts(postsData);
        postsRef.current = postsData; // Update ref

        // Interleave Bible verses between posts (after every 4th post)
        const interleavedItems: FeedItem[] = [];
        postsData.forEach((post, index) => {
          interleavedItems.push(post);
          // Add a verse after every 4th post (index 3, 7, 11, etc.)
          // Make sure we don't add after the last post if it's not a multiple of 4
          if ((index + 1) % 4 === 0 && index < postsData.length - 1) {
            interleavedItems.push(getRandomVerse());
          }
        });

        // Add end of feed message at the end
        interleavedItems.push({
          id: "end-of-feed",
          type: "endOfFeed",
        });

        console.log(
          `[Feed] Total feed items: ${interleavedItems.length} (${
            postsData.length
          } posts + ${
            interleavedItems.length - postsData.length - 1
          } verses + 1 end message)`
        );
        console.log(`[Feed] ✓ End-of-feed message added to feed`);

        setFeedItems(interleavedItems);

        if (data.length > 0) {
          setLastPostId(data[0].id);
          lastPostIdRef.current = data[0].id; // Update ref
        }
        setHasNewPosts(false);
      } else {
        setPosts([]);
        postsRef.current = []; // Update ref
        setFeedItems([]);
        setHasNewPosts(false);
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
      console.log("[Refresh] Setting refreshing state to false");
      setRefreshing(false);
    }
  };

  // Reset daily hype count if it's a new day
  useEffect(() => {
    resetDailyHypeIfNeeded();
  }, []);

  useEffect(() => {
    fetchPosts();

    // Only set up subscription if user is authenticated
    if (!profile?.id) {
      console.log("User not authenticated, skipping subscription setup");
      return;
    }

    // Set up real-time subscription for new posts
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      // Use a unique channel name with user ID to avoid conflicts
      const channelName = `posts_changes_${profile.id}_${Date.now()}`;

      channel = supabase
        .channel(channelName)
        .on(
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

            // Check if post already exists in current feed
            const postAlreadyExists = currentPosts.some(
              (post) => post.id === newPost.id
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

            if (newPost.user_id === currentUserId) {
              // If it's the current user's post, refresh immediately
              console.log("Current user's post, refreshing immediately");
              fetchPosts();
            } else if (isActuallyNew) {
              // Only show refresh button if it's a new post from another user
              console.log("New post from another user, showing refresh button");
              setHasNewPosts(true);
            } else {
              console.log("Post is not new or already loaded, ignoring");
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
          },
          (payload) => {
            const updatedProfile = payload.new as Tables<"profiles">;
            const oldProfile = payload.old as Tables<"profiles">;

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

              // Update posts in the feed if this profile is associated with any posts
              setPosts((currentPosts) => {
                return currentPosts.map((post) => {
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
                });
              });

              // Update feedItems as well
              setFeedItems((currentItems) => {
                return currentItems.map((item) => {
                  if (
                    "type" in item === false &&
                    (item as Post).profiles?.id === updatedProfile.id
                  ) {
                    return {
                      ...(item as Post),
                      profiles: {
                        ...(item as Post).profiles!,
                        hype: updatedProfile.hype,
                      },
                    } as Post;
                  }
                  return item;
                });
              });
            }
          }
        )
        .on(
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

            // Refetch all posts when a delete event occurs
            // This ensures the UI updates immediately after delete all posts function is invoked
            fetchPosts();
          }
        )
        .subscribe((status, err) => {
          console.log("Subscription status:", status, "Channel:", channelName);
          if (status === "SUBSCRIBED") {
            console.log(
              "Successfully subscribed to posts_changes (INSERT/DELETE) and profile_updates"
            );
          } else if (status === "CHANNEL_ERROR") {
            console.error("Channel subscription error:", err);
            console.error("Error details:", JSON.stringify(err, null, 2));
            console.error("Possible causes:");
            console.error(
              "1. RLS policies blocking access - check Database > Tables > posts > Policies"
            );
            console.error(
              "2. Realtime not enabled for posts table - check Database > Replication"
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
  }, [profile?.id]);

  const onRefresh = () => {
    console.log("[Refresh] Pull to refresh triggered");
    fetchPosts(true);
  };

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

  if (loading && posts.length === 0) {
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
      <View className="flex-1">
        <View className="flex-row items-center justify-between pb-4 mb-0">
          <View className="flex-row items-center gap-2">
            <Text className="text-white text-2xl font-bold">
              Hey {profile?.username}
            </Text>
            <HelloWave />
          </View>
        </View>

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
            <Text className="text-white text-2xl mb-2">No posts yet</Text>
            <Text className="text-gray-400 text-center px-6">
              Be the first to share a moment!
            </Text>
          </View>
        ) : (
          <Animated.FlatList
            data={feedItems}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            ItemSeparatorComponent={null}
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
                // Log when end-of-feed is rendered (only once to avoid spam)
                if (index === feedItems.length - 1) {
                  console.log(
                    `[Feed] Rendering end-of-feed message at index ${index}`
                  );
                }
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
    </Container>
  );
}
