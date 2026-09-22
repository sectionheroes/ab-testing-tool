import type { ActionFunctionArgs } from "react-router";
import { handleWebhook } from "../services/webhook-handler.server";

// HMAC + idempotent WebhookEvent + inline processing (services/webhook-processing.server.ts).
export const action = ({ request }: ActionFunctionArgs) => handleWebhook(request);
