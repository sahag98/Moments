import { Tables } from "@/database.types";
import { supabase } from "@/lib/supabase";
import { syncExpoTokenIfNeeded } from "@/lib/registerNotifications";
import { useUserStore } from "@/store/userStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthError, Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
// Complete OAuth session in browser
WebBrowser.maybeCompleteAuthSession();

const WELCOME_COMPLETED_KEY = "@welcome_completed";

type Profile = Tables<"profiles">;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  needsWelcome: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  error: AuthError | null;
  refreshProfile: (options?: { replaceToTabs?: boolean }) => Promise<void>;
  refreshWelcomeStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const [welcomeChecked, setWelcomeChecked] = useState(false);
  const [needsWelcome, setNeedsWelcome] = useState(false);
  const isManuallyFetchingRef = useRef(false);
  const { setProfile: setProfileInStore, clearProfile: clearProfileInStore } =
    useUserStore();

  const fetchProfile = async (
    userId: string,
    options?: { replaceToTabs?: boolean }
  ) => {
    // Only redirect to tabs when explicitly requested (e.g. after login).
    // Default to false so profile updates from profile tab don't redirect.
    const shouldReplaceToTabs = options?.replaceToTabs === true;
    console.log("fetching profile for user: ", userId);
    try {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, username, full_name, bio, avatar_url, eula_accepted_at, expo_token, streak, hype, updated_at",
        )
        .eq("id", userId)
        .maybeSingle(); // Use maybeSingle() instead of single() - returns null instead of error when no rows found

      if (profileError) {
        // Only log actual errors (not "not found" cases)
        console.error("Error fetching profile:", profileError);
        setProfile(null);
        clearProfileInStore();
        return null;
      } else {
        // maybeSingle() returns null if no rows found, which is expected for new users
        console.log(
          "Profile fetched:",
          data ? "found" : "not found (new user)",
        );
        setProfile(data);
        // Store in Zustand store
        setProfileInStore(data);
        // Sync Expo push token with Supabase if it changed
        syncExpoTokenIfNeeded(userId, data?.expo_token ?? null).catch(() => {});
        if (shouldReplaceToTabs) {
          router.replace("/(tabs)");
        }
        // Don't navigate here - let components handle navigation via Redirect
        return data;
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      setProfile(null);
      clearProfileInStore();
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;
    let authSubscription:
      | ReturnType<
          typeof supabase.auth.onAuthStateChange
        >["data"]["subscription"]
      | null = null;

    // Check welcome status (just for state, no navigation)
    const checkWelcome = async () => {
      try {
        const welcomeStatus = await AsyncStorage.getItem(WELCOME_COMPLETED_KEY);
        console.log("welcomeStatus", welcomeStatus);
        const hasSeenWelcome = welcomeStatus === "true";

        if (!isMounted) return;
        setWelcomeChecked(true);
        setNeedsWelcome(!hasSeenWelcome);
      } catch (error) {
        console.error("Error checking welcome status:", error);
        if (isMounted) {
          setWelcomeChecked(true);
          setNeedsWelcome(false); // On error, assume seen
        }
      }
    };

    // Initialize auth session (aligned with bless-tag: getSession → profile, always set ready)
    const initializeAuth = async (isForegroundRefresh = false) => {
      try {
        if (!isForegroundRefresh) {
          // Check welcome status first (only on initial load) - kept for onboarding
          await checkWelcome();
        }

        // Get session first (same order as bless-tag)
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (error) {
          console.error("Error getting session:", error);
          setError(error);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        // Fetch profile if user exists (like getUser in bless-tag)
        if (session?.user) {
          console.log("fetching profile");
          await fetchProfile(session.user.id, {
            replaceToTabs: !isForegroundRefresh,
          });
        } else {
          setProfile(null);
          clearProfileInStore();
        }
      } catch (err) {
        if (!isMounted) return;
        console.error("Error in initializeAuth:", err);
      } finally {
        // Always set loading to false so we never get stuck (initial + foreground refresh)
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (user) {
        fetchProfile(user.id, { replaceToTabs: true });
      } else {
        setLoading(false);
      }
    });

    // Handle app state changes (when app comes to foreground)
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && isMounted) {
        console.log("App came to foreground, refreshing session");
        // Refresh session when app comes to foreground
        // Use isForegroundRefresh to avoid affecting loading state
        initializeAuth(true);
      }
    };

    const appStateSubscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      isMounted = false;

      appStateSubscription.remove();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);

      const redirectUrl = Linking.createURL("");
      console.log("redirectUrl", redirectUrl);
      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: "moments://",
        },
      });

      if (signInError) {
        setError(signInError);
        setLoading(false);
        throw signInError;
      }

      // Open the OAuth URL in browser
      if (data?.url) {
        console.log("opening auth session with url: ", data.url);
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          "moments://",
          {
            showInRecents: true,
          },
        );

        // Handle successful OAuth callback
        if (result.type === "success" && "url" in result && result.url) {
          // Parse the callback URL to extract tokens or code
          // The URL contains hash fragments like: myapp://#access_token=xxx&refresh_token=yyy
          // or query params like: myapp://?code=xxx or myapp://?access_token=xxx&refresh_token=yyy

          let accessToken: string | null = null;
          let refreshToken: string | null = null;
          let code: string | null = null;

          // Try to parse hash fragments first (common for OAuth implicit flow)
          const hashIndex = result.url.indexOf("#");
          if (hashIndex !== -1) {
            const hash = result.url.substring(hashIndex + 1);
            const hashParams = new URLSearchParams(hash);
            accessToken = hashParams.get("access_token");
            refreshToken = hashParams.get("refresh_token");
            code = hashParams.get("code");
          }

          // If not in hash, try query params (common for OAuth PKCE flow)
          if ((!accessToken || !refreshToken) && !code) {
            const queryIndex = result.url.indexOf("?");
            if (queryIndex !== -1) {
              const query = result.url.substring(queryIndex + 1);
              // Remove hash if present in query string
              const queryWithoutHash = query.split("#")[0];
              const queryParams = new URLSearchParams(queryWithoutHash);
              accessToken = accessToken || queryParams.get("access_token");
              refreshToken = refreshToken || queryParams.get("refresh_token");
              code = code || queryParams.get("code");
            }
          }

          // If we have a code, exchange it for a session (PKCE flow)
          if (code) {
            console.log("Exchanging code for session...");
            const { data: sessionData, error: sessionError } =
              await supabase.auth.exchangeCodeForSession(code);

            if (sessionError) {
              console.error("Error exchanging code for session:", sessionError);
              setError(sessionError);
              setLoading(false);
              throw sessionError;
            }

            if (sessionData.session) {
              console.log("Code exchanged successfully");
              // Manually update state and fetch profile to ensure it's available immediately
              const newSession = sessionData.session;
              isManuallyFetchingRef.current = true;
              setSession(newSession);
              setUser(newSession.user);
              if (newSession.user) {
                console.log("Manually fetching profile after code exchange...");
                const fetchedProfile = await fetchProfile(newSession.user.id);
                console.log(
                  "Profile fetched manually:",
                  fetchedProfile ? "found" : "null",
                );
              }
              isManuallyFetchingRef.current = false;
              // Set loading to false after profile is fetched
              // onAuthStateChange will also fire, but we've already fetched the profile
              setLoading(false);
              return;
            } else {
              console.warn("Code exchanged but no session returned");
              setLoading(false);
            }
            return;
          }

          // If we have direct tokens, set the session
          // setSession will trigger onAuthStateChange, but we also manually fetch profile to ensure it's available
          if (accessToken && refreshToken) {
            console.log("Setting session with tokens...");
            const { data: sessionData, error: sessionError } =
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

            if (sessionError) {
              console.error("Error setting session:", sessionError);
              setError(sessionError);
              setLoading(false);
              throw sessionError;
            }

            if (sessionData.session) {
              console.log("Session set successfully");
              // Manually update state and fetch profile to ensure it's available immediately
              const newSession = sessionData.session;
              isManuallyFetchingRef.current = true;
              setSession(newSession);
              setUser(newSession.user);
              if (newSession.user) {
                console.log("Manually fetching profile after setSession...");
                const fetchedProfile = await fetchProfile(newSession.user.id);
                console.log(
                  "Profile fetched manually:",
                  fetchedProfile ? "found" : "null",
                );
              }
              isManuallyFetchingRef.current = false;
              // Set loading to false after profile is fetched
              // onAuthStateChange will also fire, but we've already fetched the profile
              setLoading(false);
              return;
            } else {
              console.warn("Tokens set but no session returned");
              setLoading(false);
            }
            return;
          }

          // Fallback: try to get session (Supabase might have auto-handled it)
          // Note: getSession() doesn't trigger onAuthStateChange, so we need to manually handle it
          console.log("No tokens/code found in URL, trying getSession...");
          const { data: sessionData, error: sessionError } =
            await supabase.auth.getSession();
          if (sessionError) {
            console.error("Error getting session:", sessionError);
            setError(sessionError);
            setLoading(false);
          } else if (sessionData.session) {
            console.log(
              "Session found via getSession. Manually updating state and fetching profile since getSession doesn't trigger onAuthStateChange.",
            );
            const newSession = sessionData.session;
            setSession(newSession);
            setUser(newSession.user);
            if (newSession.user) {
              // Manually fetch profile since getSession doesn't trigger onAuthStateChange
              await fetchProfile(newSession.user.id);
            }
            setLoading(false);
          } else {
            console.error("No session found after OAuth callback");
            setLoading(false);
          }
        } else if (result.type === "cancel") {
          console.log("OAuth cancelled by user");
          setLoading(false);
        } else if (result.type === "dismiss") {
          console.log("OAuth dismissed");
          setLoading(false);
        } else if (result.type === "locked") {
          console.log("OAuth locked");
          setLoading(false);
        } else {
          console.warn("Unexpected OAuth result type:", result.type);
          setLoading(false);
        }
      }
    } catch (err) {
      setLoading(false);
      if (err instanceof Error) {
        console.error("Google sign-in error:", err.message);
      }
      throw err;
    }
  };

  const signInWithApple = async () => {
    try {
      setError(null);
      setLoading(true);
      console.log("signing in with apple");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      console.log("credential", JSON.stringify(credential, null, 2));
      if (credential.identityToken) {
        const {
          error,
          data: { user },
        } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });

        console.log(JSON.stringify({ error, user }, null, 2));
        if (!error) {
          console.log("Signed in!");
          // Don't navigate here - let components handle navigation via Redirect
          // onAuthStateChange will fire and update the state
        }
      } else {
        throw new Error("No identityToken.");
      }

      // Open the OAuth URL in browser
    } catch (err) {
      setLoading(false);
      if (err instanceof Error) {
        console.error("Apple sign-in error:", err.message);
      }
      throw err;
    }
  };

  const refreshProfile = async (options?: { replaceToTabs?: boolean }) => {
    if (user?.id) {
      await fetchProfile(user.id, options);
    }
  };

  const refreshWelcomeStatus = async () => {
    try {
      const welcomeStatus = await AsyncStorage.getItem(WELCOME_COMPLETED_KEY);
      const hasSeenWelcome = welcomeStatus === "true";
      setNeedsWelcome(!hasSeenWelcome);
    } catch (error) {
      console.error("Error refreshing welcome status:", error);
      setNeedsWelcome(false);
    }
  };

  const signOut = async () => {
    try {
      setError(null);

      // Try to sign out from Supabase
      // If there's no session, this will error, but we still want to clear local state
      const { error: signOutError } = await supabase.auth.signOut();

      // If error is "Auth session missing!", it means there's already no session
      // This is fine - we just need to clear local state
      if (
        signOutError &&
        !signOutError.message?.includes("Auth session missing")
      ) {
        console.warn("Sign out error (non-critical):", signOutError.message);
        // Don't throw - we still want to clear local state and redirect
      }

      // Always clear local state and redirect, regardless of signOut result
      // The onAuthStateChange handler will also clear state when it detects session is null
      setSession(null);
      setUser(null);
      setProfile(null);
      clearProfileInStore();

      // Navigate to auth screen
      router.replace("/auth");
    } catch (err) {
      // Even if something unexpected happens, still clear local state
      console.error("Unexpected sign out error:", err);
      setSession(null);
      setUser(null);
      setProfile(null);
      clearProfileInStore();
      router.replace("/auth");
      // Don't re-throw - we've handled the cleanup
    }
  };

  const deleteAccount = async () => {
    try {
      setError(null);
      if (!user?.id) {
        throw new Error("User not found");
      }

      // Delete user's posts
      await supabase.from("posts").delete().eq("user_id", user.id);

      // Delete user's profile
      await supabase.from("profiles").delete().eq("id", user.id);

      // Delete user's avatar from storage if exists
      if (profile?.avatar_url) {
        try {
          const urlParts = profile.avatar_url.split("/");
          const filePath = urlParts
            .slice(urlParts.indexOf("avatars") + 1)
            .join("/");
          await supabase.storage.from("avatars").remove([filePath]);
        } catch (storageError) {
          console.error("Error deleting avatar:", storageError);
          // Continue even if storage deletion fails
        }
      }
      //Delete user's post images from post_images bucket

      // Sign out (Supabase will handle user deletion through database triggers or you can use admin API)
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error("Error signing out:", signOutError);
      }

      setProfile(null);
      clearProfileInStore();
      router.replace("/auth");
    } catch (err) {
      if (err instanceof Error) {
        console.error("Delete account error:", err.message);
        setError(err as AuthError);
      }
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        needsWelcome,
        signInWithGoogle,
        signInWithApple,
        signOut,
        deleteAccount,
        error,
        refreshProfile,
        refreshWelcomeStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
