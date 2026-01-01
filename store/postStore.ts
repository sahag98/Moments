import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Feature flag: Set to false to disable daily post limit (allow unlimited posts)
const ENABLE_DAILY_POST_LIMIT = false;

const LAST_POST_DATE_KEY = "@last_post_date";

// Get today's date as YYYY-MM-DD string
const getTodayDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface PostStore {
  lastPostDate: string | null;
  canPostToday: () => boolean;
  recordPost: () => Promise<void>;
  checkIfCanPost: () => Promise<boolean>;
}

export const usePostStore = create<PostStore>()(
  persist(
    (set, get) => ({
      lastPostDate: null,

      canPostToday: () => {
        const { lastPostDate } = get();
        const today = getTodayDateString();
        return lastPostDate !== today;
      },

      recordPost: async () => {
        const today = getTodayDateString();
        set({ lastPostDate: today });
        // Also save to AsyncStorage for persistence
        try {
          await AsyncStorage.setItem(LAST_POST_DATE_KEY, today);
        } catch (error) {
          console.error("Error saving last post date:", error);
        }
      },

      checkIfCanPost: async () => {
        // If daily post limit is disabled, always allow posting
        if (!ENABLE_DAILY_POST_LIMIT) {
          return true;
        }

        // Load from AsyncStorage first to ensure we have the latest value
        try {
          const storedDate = await AsyncStorage.getItem(LAST_POST_DATE_KEY);
          const today = getTodayDateString();
          
          if (storedDate === today) {
            set({ lastPostDate: today });
            return false;
          }
          
          // Update store with stored date or null
          set({ lastPostDate: storedDate });
          return storedDate !== today;
        } catch (error) {
          console.error("Error checking post date:", error);
          // On error, allow posting (fail open)
          return true;
        }
      },
    }),
    {
      name: "post-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
