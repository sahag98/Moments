import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
console.log('Hello from Functions!');

Deno.serve(async (req) => {
  const { userId } = await req.json();

  console.log('userId', userId);

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Delete all post images from post_images bucket
    console.log('Deleting post images for user:', userId);
    const { data: files, error: listError } = await supabaseClient.storage
      .from('post_images')
      .list(userId, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (listError) {
      console.error('Error listing post images:', listError);
    } else if (files && files.length > 0) {
      // Delete all files in the user's folder
      const filePaths = files.map((file) => `${userId}/${file.name}`);
      const { error: deleteError } = await supabaseClient.storage
        .from('post_images')
        .remove(filePaths);

      if (deleteError) {
        console.error('Error deleting post images:', deleteError);
      } else {
        console.log(`Successfully deleted ${filePaths.length} post images`);
      }
    } else {
      console.log('No post images found for user');
    }

    // Delete the user from auth
    const { data, error } = await supabaseClient.auth.admin.deleteUser(userId);

    if (error) {
      console.error('Error deleting user:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to delete account' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
});