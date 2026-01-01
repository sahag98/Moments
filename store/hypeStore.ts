import { ENABLE_DAILY_HYPE_LIMIT } from "@/constants/featureFlags";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const HYPED_POSTS_KEY = "@hyped_posts";
const LAST_HYPE_DATE_KEY = "@last_hype_date";
const DAILY_HYPE_COUNT_KEY = "@daily_hype_count";

interface HypeStore {
  hypedPosts: number[]; // Array of post IDs that the user has hyped
  lastHypeDate: string | null; // Date string of last hype (YYYY-MM-DD)
  dailyHypeCount: number; // Number of hypes used today
  addHypedPost: (postId: number) => void;
  hasHypedPost: (postId: number) => boolean;
  clearHypedPosts: () => void;
  syncWithSupabase: (supabaseHype: number) => void;
  hasUsedDailyHype: () => boolean;
  incrementDailyHype: () => void;
  resetDailyHypeIfNeeded: () => void;
}

const getTodayDateString = (): string => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

export const useHypeStore = create<HypeStore>()(
  persist(
    (set, get) => ({
      hypedPosts: [],
      lastHypeDate: null,
      dailyHypeCount: 0,

      addHypedPost: (postId: number) => {
        const { hypedPosts } = get();
        if (!hypedPosts.includes(postId)) {
          const updatedHypedPosts = [...hypedPosts, postId];
          set({ hypedPosts: updatedHypedPosts });

          // Save to AsyncStorage
          try {
            AsyncStorage.setItem(
              HYPED_POSTS_KEY,
              JSON.stringify(updatedHypedPosts)
            );
          } catch (error) {
            console.error("Error saving hyped posts:", error);
          }
        }
      },

      hasHypedPost: (postId: number) => {
        const { hypedPosts } = get();
        return hypedPosts.includes(postId);
      },

      clearHypedPosts: () => {
        set({ hypedPosts: [] });
        // Clear from AsyncStorage
        try {
          AsyncStorage.removeItem(HYPED_POSTS_KEY);
        } catch (error) {
          console.error("Error clearing hyped posts:", error);
        }
      },

      syncWithSupabase: (supabaseHype: number) => {
        // Sync local hype count with Supabase
        // This is mainly for display purposes - the actual hype count comes from Supabase
        // We just track which posts the user has hyped locally
      },

      hasUsedDailyHype: () => {
        // If daily hype limit is disabled, always return false
        if (!ENABLE_DAILY_HYPE_LIMIT) {
          return false;
        }

        const { lastHypeDate, dailyHypeCount } = get();
        const today = getTodayDateString();
        
        // If last hype was today and count is >= 1, they've used it
        if (lastHypeDate === today && dailyHypeCount >= 1) {
          return true;
        }
        
        return false;
      },

      incrementDailyHype: () => {
        // If daily hype limit is disabled, don't track
        if (!ENABLE_DAILY_HYPE_LIMIT) {
          return;
        }

        const { lastHypeDate, dailyHypeCount } = get();
        const today = getTodayDateString();
        
        if (lastHypeDate === today) {
          // Same day, increment count
          set({ dailyHypeCount: dailyHypeCount + 1 });
        } else {
          // New day, reset count
          set({ lastHypeDate: today, dailyHypeCount: 1 });
        }
      },

      resetDailyHypeIfNeeded: () => {
        const { lastHypeDate } = get();
        const today = getTodayDateString();
        
        if (lastHypeDate !== today) {
          // New day, reset
          set({ lastHypeDate: today, dailyHypeCount: 0 });
        }
      },
    }),
    {
      name: "hype-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
