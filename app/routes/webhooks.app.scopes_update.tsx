import type { ActionFunctionArgs } from "react-router";
import { handleWebhook } from "../services/webhook-handler.server";

// app/scopes_update → updateScope() via the dispatcher.
export const action = ({ request }: ActionFunctionArgs) => handleWebhook(request);
