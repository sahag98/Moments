import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { profileId, userId, postId } = await req.json();

    if (!profileId || !userId || !postId) {
      return new Response(
        JSON.stringify({ error: 'profileId, userId, and postId are required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Don't allow users to hype their own posts
    if (profileId === userId) {
      return new Response(
        JSON.stringify({ error: 'Cannot hype your own post' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Create a client with service role key to bypass RLS
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if daily hype limit is enabled (default to true if not set)
    const enableDailyHypeLimit = Deno.env.get('ENABLE_DAILY_HYPE_LIMIT') !== 'false';

    // Check if user has already hyped today (only if limit is enabled)
    if (enableDailyHypeLimit) {
      // Try to get last_hype_date from profile (field may not exist in database yet)
      const { data: userProfile, error: userProfileError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // If profile exists and has last_hype_date, check if they hyped today
      if (userProfile && (userProfile as any).last_hype_date) {
        const lastHypeDate = new Date((userProfile as any).last_hype_date);
        lastHypeDate.setHours(0, 0, 0, 0);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        if (lastHypeDate.getTime() === todayDate.getTime()) {
          return new Response(
            JSON.stringify({ 
              error: 'DAILY_LIMIT_REACHED',
              message: 'You have already used your daily hype today' 
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            }
          );
        }
      }
    }

    // Get post owner profile for notification
    const { data: postOwnerProfile } = await supabaseClient
      .from('profiles')
      .select('hype, expo_token, username, full_name')
      .eq('id', profileId)
      .single();

    if (!postOwnerProfile) {
      return new Response(
        JSON.stringify({ error: 'Post owner profile not found' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const currentHype = postOwnerProfile.hype || 0;

    // Increment hype count for post owner
    const { data: updatedProfile, error: updateError } = await supabaseClient
      .from('profiles')
      .update({
        hype: currentHype + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId)
      .select('hype')
      .single();

    if (updateError) {
      console.error('Error updating hype:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update hype', details: updateError.message }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Update the user's last_hype_date to today (if column exists and limit is enabled)
    // This will silently fail if the column doesn't exist, which is fine
    // The client-side check is the primary enforcement mechanism
    if (enableDailyHypeLimit) {
      try {
        await supabaseClient
          .from('profiles')
          .update({
            last_hype_date: new Date().toISOString(),
          } as any)
          .eq('id', userId);
      } catch (updateDateError) {
        // Silently fail if column doesn't exist - client-side check will handle it
        console.log('Could not update last_hype_date (column may not exist):', updateDateError);
      }
    }

    // Send notification to post owner if they have an expo token
    // if (postOwnerProfile.expo_token) {
    //   const displayName = postOwnerProfile.username || postOwnerProfile.full_name || 'Someone';
    //   const notificationMessage = {
    //     to: postOwnerProfile.expo_token,
    //     sound: 'default',
    //     title: 'Moments',
    //     body: `${displayName} boosted your moment! 📸`,
    //     data: {
    //       route: '/(tabs)',
    //       type: 'hype',
    //       postId: postId.toString(),
    //     },
    //   };

    //   try {
    //     const notificationResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    //       method: 'POST',
    //       headers: {
    //         Accept: 'application/json',
    //         'Accept-encoding': 'gzip, deflate',
    //         'Content-Type': 'application/json',
    //       },
    //       body: JSON.stringify(notificationMessage),
    //     });

    //     if (!notificationResponse.ok) {
    //       console.error('Failed to send notification:', notificationResponse.statusText);
    //     }
    //   } catch (notificationError) {
    //     console.error('Error sending notification:', notificationError);
    //     // Don't fail the hype if notification fails
    //   }
    // }

    return new Response(
      JSON.stringify({
        success: true,
        hype: updatedProfile?.hype || currentHype + 1,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});

