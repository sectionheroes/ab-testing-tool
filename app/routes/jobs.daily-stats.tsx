import type { ActionFunctionArgs } from "react-router";
import { materialiseDailyStats } from "../services/daily-stats.server";
import { requireJobsSecret } from "../services/jobs.server";

// POST /jobs/daily-stats – materialises DailyStat (history and charts only, never the results page).
// Render Cron Job (daily 03:00) follows in WP6; until then this is a manual curl with X-Jobs-Secret.
export const action = async ({ request }: ActionFunctionArgs) => {
  const denied = requireJobsSecret(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? "2");
  return Response.json(await materialiseDailyStats({ days: Number.isFinite(days) && days > 0 ? days : 2 }));
};

export const loader = () => new Response("POST only", { status: 405 });
