process.env.EXPO_PUBLIC_BACKEND_URL = "http://backend.test";
process.env.EXPO_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
process.env.EXPO_PUBLIC_GOOGLE_AUTH_WEB_CLIENT_ID = "test-google-client-id";

Object.defineProperty(AbortSignal, "timeout", {
  configurable: true,
  value: () => new AbortController().signal,
});
