import type { ActionFunctionArgs } from "react-router";
import { proxyAction } from "../services/proxy.server";
import { recordSnippetError } from "../services/exposures.server";

// POST /apps/sh-ab/err → /proxy/err. Signature check + shop lookup in proxyAction; always 204 once authenticated.
export const action = ({ request }: ActionFunctionArgs) => proxyAction(request, recordSnippetError);
export const loader = () => new Response(null, { status: 405 });
