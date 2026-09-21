// Single place that reads process.env. Names are fixed (set in Render); see .env.example.

const required = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "SCOPES",
  "DATABASE_URL",
  "SESSION_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "ACTIVATION_CODE",
  "JOBS_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

const optional = ["SENTRY_DSN", "SLACK_WEBHOOK_URL", "NODE_ENV", "WEBHOOK_STORE_PAYLOAD"] as const;

type RequiredKey = (typeof required)[number];
type OptionalKey = (typeof optional)[number];

export function env(key: RequiredKey): string;
export function env(key: OptionalKey): string | undefined;
export function env(key: RequiredKey | OptionalKey): string | undefined {
  const value = process.env[key];
  if ((required as readonly string[]).includes(key) && !value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
}

export const isProduction = process.env.NODE_ENV === "production";

/** WP1 only: persist every webhook payload so real payloads can be inspected on the dev store. WP2 flips this to error-only (ADR-0024). */
export const storeWebhookPayloads = process.env.WEBHOOK_STORE_PAYLOAD === "true";

/** Fail fast at boot instead of on the first request that needs a variable. */
export function assertEnv() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
