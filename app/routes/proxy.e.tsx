import type { ActionFunctionArgs } from "react-router";
import { proxyAction } from "../services/proxy.server";
import { recordExposure } from "../services/exposures.server";

// POST /apps/sh-ab/e → /proxy/e. Signature check + shop lookup in proxyAction; always 204 once authenticated.
export const action = ({ request }: ActionFunctionArgs) => proxyAction(request, recordExposure);
export const loader = () => new Response(null, { status: 405 });
