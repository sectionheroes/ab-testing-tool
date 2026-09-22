import type { ActionFunctionArgs } from "react-router";
import { handleWebhook } from "../services/webhook-handler.server";

// app/uninstalled → markUninstalled() via the dispatcher (unchanged behaviour from WP1).
export const action = ({ request }: ActionFunctionArgs) => handleWebhook(request);
