import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const POST_HISTORY_KEY = "@post_history";

// Get today's date as YYYY-MM-DD string
const getTodayDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Get yesterday's date as YYYY-MM-DD string
const getYesterdayDateString = (): string => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, "0");
  const day = String(yesterday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Calculate streak from post history
const calculateStreak = (postDates: string[]): number => {
  if (postDates.length === 0) return 0;

  // Remove duplicates and sort dates in descending order (most recent first)
  const uniqueDates = Array.from(new Set(postDates));
  const sortedDates = uniqueDates.sort().reverse();
  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  // Check if user posted today or yesterday
  const postedToday = sortedDates.includes(today);
  const postedYesterday = sortedDates.includes(yesterday);

  // If no recent posts, streak is 0
  if (!postedToday && !postedYesterday) {
    return 0;
  }

  // Start counting from today or yesterday
  let streak = 0;
  let currentDate = postedToday ? today : yesterday;
  let checkDate = new Date(currentDate + "T00:00:00"); // Add time to avoid timezone issues

  // Count consecutive days
  while (sortedDates.includes(currentDate)) {
    streak++;
    // Move to previous day
    checkDate.setDate(checkDate.getDate() - 1);
    const year = checkDate.getFullYear();
    const month = String(checkDate.getMonth() + 1).padStart(2, "0");
    const day = String(checkDate.getDate()).padStart(2, "0");
    currentDate = `${year}-${month}-${day}`;
  }

  return streak;
};

interface StreakStore {
  postHistory: string[];
  currentStreak: number;
  addPost: () => Promise<number>; // Returns new streak count
  getCurrentStreak: () => number;
  syncWithSupabase: (supabaseStreak: number) => void;
}

export const useStreakStore = create<StreakStore>()(
  persist(
    (set, get) => ({
      postHistory: [],
      currentStreak: 0,

      addPost: async () => {
        const today = getTodayDateString();
        const { postHistory } = get();

        // Add today's date if not already present
        if (!postHistory.includes(today)) {
          const updatedHistory = [...postHistory, today];
          const newStreak = calculateStreak(updatedHistory);

          set({
            postHistory: updatedHistory,
            currentStreak: newStreak,
          });

          // Save to AsyncStorage
          try {
            await AsyncStorage.setItem(
              POST_HISTORY_KEY,
              JSON.stringify(updatedHistory)
            );
          } catch (error) {
            console.error("Error saving post history:", error);
          }

          return newStreak;
        }

        // If already posted today, return current streak
        return get().currentStreak;
      },

      getCurrentStreak: () => {
        const { postHistory } = get();
        const streak = calculateStreak(postHistory);
        set({ currentStreak: streak });
        return streak;
      },

      syncWithSupabase: (supabaseStreak: number) => {
        // Sync local streak with Supabase streak
        // If Supabase has a higher streak, use that (in case of multi-device usage)
        set((state) => ({
          currentStreak: Math.max(state.currentStreak, supabaseStreak),
        }));
      },
    }),
    {
      name: "streak-storage",
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        // Recalculate streak when rehydrating
        if (state) {
          const streak = calculateStreak(state.postHistory);
          state.currentStreak = streak;
        }
      },
    }
  )
);
