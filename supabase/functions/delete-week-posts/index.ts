import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Extracts the file path from a Supabase storage URL
 * Example: https://...supabase.co/storage/v1/object/public/post_images/user-id/file.png
 * Returns: user-id/file.png
 */
function extractFilePathFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    
    // Look for 'post_images' in the path
    const bucketIndex = pathParts.findIndex((part) => part === 'post_images');
    
    if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
      // Extract the file path (everything after 'post_images')
      return pathParts.slice(bucketIndex + 1).join('/');
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting file path from URL:', error);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Calculate the date 7 days ago
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0); // Set to start of day for consistent comparison
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    console.log('='.repeat(60));
    console.log('DELETE WEEK POSTS FUNCTION - STARTING');
    console.log('='.repeat(60));
    console.log(`Current date/time: ${now.toISOString()}`);
    console.log(`Cutoff date (7 days ago): ${sevenDaysAgoISO}`);
    console.log(`Deleting posts created before: ${sevenDaysAgo.toLocaleDateString()} ${sevenDaysAgo.toLocaleTimeString()}`);

    // First, let's check total posts count for logging
    const { count: totalPostsCount } = await supabaseClient
      .from('posts')
      .select('*', { count: 'exact', head: true });
    
    console.log(`Total posts in database: ${totalPostsCount || 0}`);

    // Fetch all posts older than 7 days
    const { data: oldPosts, error: fetchError } = await supabaseClient
      .from('posts')
      .select('id, image, user_id, created_at')
      .lt('created_at', sevenDaysAgoISO)
      .order('created_at', { ascending: true }); // Order by oldest first

    if (fetchError) {
      console.error('Error fetching old posts:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch old posts', details: fetchError.message }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!oldPosts || oldPosts.length === 0) {
      console.log('✓ No posts older than 7 days found');
      console.log('='.repeat(60));
      console.log('FUNCTION COMPLETED - No deletions needed');
      console.log('='.repeat(60));
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No posts to delete',
          deletedPosts: 0,
          deletedImages: 0,
          cutoffDate: sevenDaysAgoISO
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`\nFound ${oldPosts.length} post(s) that are 7 days old or older:`);
    console.log('-'.repeat(60));

    // Log details about each post that will be deleted
    type Post = { id: number; image: string; user_id: string; created_at: string };
    const typedPosts = oldPosts as Post[];
    
    typedPosts.forEach((post, index) => {
      const postDate = new Date(post.created_at);
      const daysOld = Math.floor((now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24));
      console.log(`${index + 1}. Post ID: ${post.id}`);
      console.log(`   Created: ${postDate.toISOString()} (${postDate.toLocaleString()})`);
      console.log(`   Age: ${daysOld} day(s) old`);
      console.log(`   User ID: ${post.user_id}`);
      console.log(`   Has image: ${post.image ? 'Yes' : 'No'}`);
    });

    console.log('-'.repeat(60));
    console.log(`\nStarting deletion process for ${typedPosts.length} post(s)...`);

    // Extract file paths from image URLs
    const imagePaths: string[] = [];
    for (const post of typedPosts) {
      if (post.image) {
        const filePath = extractFilePathFromUrl(post.image);
        if (filePath) {
          imagePaths.push(filePath);
        } else {
          console.warn(`⚠ Could not extract file path from URL for post ${post.id}: ${post.image}`);
        }
      }
    }

    console.log(`Found ${imagePaths.length} image(s) to delete from storage`);

    // Delete images from storage
    let deletedImagesCount = 0;
    if (imagePaths.length > 0) {
      // Delete in batches to avoid hitting limits
      const batchSize = 100;
      const totalBatches = Math.ceil(imagePaths.length / batchSize);
      console.log(`Deleting images in ${totalBatches} batch(es) of up to ${batchSize} images each...`);
      
      for (let i = 0; i < imagePaths.length; i += batchSize) {
        const batch = imagePaths.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        console.log(`  Processing image batch ${batchNumber}/${totalBatches} (${batch.length} images)...`);
        
        const { data: deleteData, error: deleteError } = await supabaseClient.storage
          .from('post_images')
          .remove(batch);

        if (deleteError) {
          console.error(`  ✗ Error deleting image batch ${batchNumber}:`, deleteError);
        } else {
          deletedImagesCount += batch.length;
          console.log(`  ✓ Successfully deleted ${batch.length} image(s) in batch ${batchNumber}`);
        }
      }
    } else {
      console.log('No images to delete (posts may not have images)');
    }

    // Delete posts from database
    const postIds = typedPosts.map((post) => post.id);
    console.log(`\nDeleting ${postIds.length} post(s) from database...`);
    
    const { error: deletePostsError } = await supabaseClient
      .from('posts')
      .delete()
      .in('id', postIds);

    if (deletePostsError) {
      console.error('✗ Error deleting posts from database:', deletePostsError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete posts', 
          details: deletePostsError.message,
          deletedImages: deletedImagesCount,
          failedPosts: postIds.length
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`✓ Successfully deleted ${postIds.length} post(s) from database`);

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('DELETION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Posts deleted: ${postIds.length}`);
    console.log(`Images deleted: ${deletedImagesCount}`);
    console.log(`Cutoff date: ${sevenDaysAgoISO}`);
    console.log(`Function completed at: ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    return new Response(
      JSON.stringify({ 
        success: true,
        deletedPosts: postIds.length,
        deletedImages: deletedImagesCount,
        message: `Deleted ${postIds.length} posts and ${deletedImagesCount} images older than 7 days`,
        cutoffDate: sevenDaysAgoISO
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Failed to delete posts', details: errorMessage }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/delete-week-posts' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{}'

  Note: The function doesn't require any body parameters - it automatically calculates posts older than 7 days.

*/
