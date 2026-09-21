import type { ActionFunctionArgs } from "react-router";
import { handleWebhookStub } from "../services/webhook-handler.server";

// WP1 stub: HMAC + WebhookEvent. Processing comes in WP2.
export const action = ({ request }: ActionFunctionArgs) => handleWebhookStub(request);
