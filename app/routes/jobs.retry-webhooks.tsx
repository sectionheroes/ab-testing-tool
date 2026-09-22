import type { ActionFunctionArgs } from "react-router";
import { requireJobsSecret, retryWebhooks } from "../services/jobs.server";

// POST /jobs/retry-webhooks – hourly Render Cron Job from WP6 on; manual: curl -X POST -H "X-Jobs-Secret: …"
export const action = async ({ request }: ActionFunctionArgs) => {
  const denied = requireJobsSecret(request);
  if (denied) return denied;
  return Response.json(await retryWebhooks());
};

export const loader = () => new Response("POST only", { status: 405 });
