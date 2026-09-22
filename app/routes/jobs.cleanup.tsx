import type { ActionFunctionArgs } from "react-router";
import { cleanup, requireJobsSecret } from "../services/jobs.server";

// POST /jobs/cleanup – daily Render Cron Job from WP6 on (ADR-0024 retention).
export const action = async ({ request }: ActionFunctionArgs) => {
  const denied = requireJobsSecret(request);
  if (denied) return denied;
  return Response.json(await cleanup());
};

export const loader = () => new Response("POST only", { status: 405 });
