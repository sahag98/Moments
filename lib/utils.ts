import { ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { supabase } from './supabase';

export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};

/**
 * Extracts the file path from a Supabase storage URL
 */
function extractFilePath(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    
    // Look for bucket name in the path (e.g., "avatars", "posts", "post_images")
    const bucketIndex = pathParts.findIndex((part) => 
      part === "avatars" || part === "posts" || part === "post_images" || part === "storage"
    );
    
    if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
      // Extract the file path (everything after the bucket name)
      return pathParts.slice(bucketIndex + 1).join("/");
    }
    
    return null;
  } catch (error) {
    console.error("Error extracting file path:", error);
    return null;
  }
}

/**
 * Gets a public URL for a Supabase storage file.
 * This is a synchronous function that works best with public buckets.
 * 
 * For private buckets, you'll need to use signed URLs (async) or make the bucket public.
 * 
 * @param filePathOrUrl - Either a file path (e.g., "user-id/file.jpg") or a full URL
 * @param bucket - The storage bucket name (default: "avatars")
 * @returns The public URL or null if invalid
 */
export function getStorageUrl(
  filePathOrUrl: string | null | undefined,
  bucket: string = "avatars"
): string | null {
  if (!filePathOrUrl) {
    return null;
  }

  // If it's already a full URL with query params (signed URL), return it as-is
  if (filePathOrUrl.startsWith("http://") || filePathOrUrl.startsWith("https://")) {
    // If it's already a signed URL, use it directly
    if (filePathOrUrl.includes("token=")) {
      return filePathOrUrl;
    }
    
    // Try to extract the file path from the URL
    const extractedPath = extractFilePath(filePathOrUrl);
    if (extractedPath) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(extractedPath);
      return data.publicUrl;
    }
    
    // If we can't extract, return the original URL
    return filePathOrUrl;
  }

  // It's already a path, get the public URL
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePathOrUrl);
  return data.publicUrl;
}