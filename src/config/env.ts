function requiredEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  backendUrl: requiredEnv(
    process.env.EXPO_PUBLIC_BACKEND_URL,
    "EXPO_PUBLIC_BACKEND_URL",
  ),

  supabaseUrl: requiredEnv(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    "EXPO_PUBLIC_SUPABASE_URL",
  ),

  supabasePublishableKey: requiredEnv(
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ),

  googleClientID: requiredEnv(
    process.env.EXPO_PUBLIC_GOOGLE_AUTH_WEB_CLIENT_ID,
    "EXPO_PUBLIC_GOOGLE_AUTH_WEB_CLIENT_ID",
  ),
} as const;
