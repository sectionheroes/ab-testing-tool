import type { ActionFunctionArgs } from "react-router";
import { handleWebhookStub } from "../services/webhook-handler.server";
import { markUninstalled } from "../services/shops.server";

export const action = ({ request }: ActionFunctionArgs) => handleWebhookStub(request, ({ shop }) => markUninstalled(shop));
