// Loaded first via NODE_OPTIONS="--import ./instrument.server.mjs" (see package.json start).
// Webhook bodies and user info never reach Sentry: httpBodies=[] and userInfo=false, sendDefaultPii off.
import * as Sentry from "@sentry/react-router";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    sendDefaultPii: false,
    dataCollection: {
      httpBodies: [],
      userInfo: false,
      cookies: false,
      httpHeaders: false,
    },
    tracesSampleRate: 0,
  });
}
