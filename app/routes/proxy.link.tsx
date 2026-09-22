import type { ActionFunctionArgs } from "react-router";
import { proxyAction } from "../services/proxy.server";
import { linkVisitor } from "../services/exposures.server";

// POST /apps/sh-ab/link → /proxy/link. Signature check + shop lookup in proxyAction; always 204 once authenticated.
export const action = ({ request }: ActionFunctionArgs) => proxyAction(request, linkVisitor);
export const loader = () => new Response(null, { status: 405 });
