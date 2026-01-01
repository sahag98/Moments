import { Tables } from "@/database.types";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthError, Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useContext, useEffect, useState } from "react";
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
  refreshProfile: () => Promise<void>;
  refreshWelcomeStatus: () => Promise<void>;
  fetchAllProfiles: () => Promise<Profile[]>;
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

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle(); // Use maybeSingle() instead of single() - returns null instead of error when no rows found

      if (profileError) {
        // Only log actual errors (not "not found" cases)
        console.error("Error fetching profile:", profileError);
        setProfile(null);
      } else {
        // maybeSingle() returns null if no rows found, which is expected for new users
        setProfile(data);
        if (data) {
          console.log("replacing: ", data);
          router.push("/");
        }
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      setProfile(null);
    }
  };

  useEffect(() => {
    let isMounted = true;
    console.log("check");
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

    // Initialize auth session
    const initializeAuth = async () => {
      try {
        // Check welcome status first
        await checkWelcome();

        // Then get session
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        console.log("session", session);

        if (!isMounted) return;

        if (error) {
          console.error("Error getting session:", error);
          setError(error);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        // Fetch profile if user exists
        if (session?.user) {
          console.log("fetching profile");
          await fetchProfile(session.user.id);
          router.replace("/(tabs)");
        }

        setLoading(false);
      } catch (err) {
        if (!isMounted) return;
        console.error("Error in initializeAuth:", err);
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      console.log("changed");
      try {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          console.log("Fetching profile for user:", session.user);
          await fetchProfile(session.user.id);
          console.log("Profile fetch completed");
        } else {
          setProfile(null);
        }

        // Always set loading to false after auth state change completes
        // This ensures the UI updates after sign-in
        setLoading(false);
      } catch (err) {
        console.error("Error in onAuthStateChange handler:", err);
        if (isMounted) {
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      // subscription.remove();
      authSubscription.unsubscribe();
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
          redirectTo: redirectUrl,
        },
      });

      if (signInError) {
        setError(signInError);
        setLoading(false);
        throw signInError;
      }

      // Open the OAuth URL in browser
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectUrl
        );
        console.log("OAuth result:", result);

        // Handle successful OAuth callback
        if (result.type === "success" && "url" in result && result.url) {
          console.log("OAuth callback URL:", result.url);

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
          // The onAuthStateChange listener will handle updating state after this
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
              console.log(
                "Code exchanged successfully, session obtained. onAuthStateChange should fire."
              );
              // Explicitly update state immediately while waiting for onAuthStateChange
              setSession(sessionData.session);
              setUser(sessionData.session.user);
              if (sessionData.session.user) {
                await fetchProfile(sessionData.session.user.id);
                router.replace("/(tabs)");
              }
              // onAuthStateChange will also fire, but we've already updated state
              setLoading(false);
              return;
            } else {
              console.warn("Code exchanged but no session returned");
              setLoading(false);
            }
            return;
          }

          // If we have direct tokens, set the session
          // The onAuthStateChange listener will handle updating state after this
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

            console.log("sessionData", sessionData);

            if (sessionData.session) {
              console.log(
                "Session set successfully with tokens. onAuthStateChange should fire."
              );
              // Explicitly update state immediately while waiting for onAuthStateChange
              setSession(sessionData.session);
              setUser(sessionData.session.user);
              if (sessionData.session.user) {
                await fetchProfile(sessionData.session.user.id);
              }
              // onAuthStateChange will also fire, but we've already updated state
              setLoading(false);
              return;
            } else {
              console.warn("Tokens set but no session returned");
              setLoading(false);
            }
            return;
          }

          // Fallback: try to get session (Supabase might have auto-handled it)
          console.log("No tokens/code found in URL, trying getSession...");
          const { data: sessionData, error: sessionError } =
            await supabase.auth.getSession();
          if (sessionError) {
            console.error("Error getting session:", sessionError);
            setError(sessionError);
            setLoading(false);
          } else if (sessionData.session) {
            console.log("Session found via getSession");
            // Explicitly update state
            setSession(sessionData.session);
            setUser(sessionData.session.user);
            if (sessionData.session.user) {
              await fetchProfile(sessionData.session.user.id);
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

          router.replace("/");
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

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
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

  const fetchAllProfiles = async (): Promise<Profile[]> => {
    try {
      const { data, error } = await supabase.from("profiles").select("*");

      if (error) {
        console.error("Error fetching all profiles:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Error fetching all profiles:", error);
      return [];
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError);
        throw signOutError;
      }
      setProfile(null);
      router.replace("/auth");
    } catch (err) {
      if (err instanceof Error) {
        console.error("Sign out error:", err.message);
      }
      throw err;
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
        fetchAllProfiles,
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
