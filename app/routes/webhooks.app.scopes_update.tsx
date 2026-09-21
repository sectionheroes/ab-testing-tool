import type { ActionFunctionArgs } from "react-router";
import { handleWebhookStub } from "../services/webhook-handler.server";
import { updateScope } from "../services/shops.server";

export const action = ({ request }: ActionFunctionArgs) =>
  handleWebhookStub(request, async ({ shop, payload }) => {
    const current = payload.current;
    if (Array.isArray(current)) await updateScope(shop, current.join(","));
  });
