import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

/**
 * Extracts the file path from a Supabase storage URL
 */
function extractFilePath(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    
    // Look for "avatars" in the path
    const bucketIndex = pathParts.findIndex((part) => part === "avatars");
    
    if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
      // Extract the file path (everything after "avatars/")
      return pathParts.slice(bucketIndex + 1).join("/");
    }
    
    return null;
  } catch (error) {
    console.error("Error extracting file path:", error);
    return null;
  }
}

/**
 * Hook to get a valid avatar URL that works with both public and private Supabase storage buckets.
 * For private buckets, it generates a signed URL. For public buckets, it uses the public URL.
 */
export function useAvatarUrl(avatarUrl: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const getAvatarUrl = async () => {
      if (!avatarUrl) {
        setUrl(null);
        return;
      }

      setLoading(true);
      
      try {
        // Check if URL already has query parameters (might be a signed URL already)
        const hasQueryParams = avatarUrl.includes("?");
        
        // If it's already a signed URL (has token in query), use it directly
        if (hasQueryParams && avatarUrl.includes("token=")) {
          setUrl(avatarUrl);
          setLoading(false);
          return;
        }
        
        let filePath: string;
        
        // If it's a full URL, extract the file path
        if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
          const extractedPath = extractFilePath(avatarUrl);
          if (!extractedPath) {
            // If we can't extract path, try using original URL
            console.warn("Could not extract file path from avatar URL:", avatarUrl);
            setUrl(avatarUrl);
            setLoading(false);
            return;
          }
          filePath = extractedPath;
        } else {
          // It's already a path
          filePath = avatarUrl;
        }
        
        // Try to get a signed URL first (works for both public and private buckets)
        const { data, error } = await supabase.storage
          .from("avatars")
          .createSignedUrl(filePath, 3600); // Valid for 1 hour
        
        if (!error && data?.signedUrl) {
          setUrl(data.signedUrl);
        } else {
          console.warn("Failed to get signed URL, trying public URL:", error);
          // If signed URL fails, try public URL as fallback
          const {
            data: { publicUrl },
          } = supabase.storage.from("avatars").getPublicUrl(filePath);
          setUrl(publicUrl);
        }
      } catch (error) {
        console.error("Error getting avatar URL:", error);
        // Fallback to original URL if everything fails
        setUrl(avatarUrl);
      } finally {
        setLoading(false);
      }
    };

    getAvatarUrl();
  }, [avatarUrl]);

  return { url, loading };
}

