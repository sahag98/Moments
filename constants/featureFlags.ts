/**
 * Feature flags to enable/disable functionality
 */

// Set to true to enable daily hype limit, false to disable
// Note: For the Supabase edge function (increment-hype), also set the environment variable
// ENABLE_DAILY_HYPE_LIMIT to 'true' or 'false' in your Supabase project settings
export const ENABLE_DAILY_HYPE_LIMIT = true;

