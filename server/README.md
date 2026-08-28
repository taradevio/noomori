# Noomori API

Copy `.env.example` to `.env` and set the Supabase values. Generate the
server-only household join-code key with:

```sh
openssl rand -hex 32
```

Store that value as `HOUSEHOLD_JOIN_CODE_HMAC_KEY`. Never expose it through an
`EXPO_PUBLIC_*` variable. Rotating it requires invalidating every outstanding
`household_join_codes` row as documented in `PLAN.md`.
