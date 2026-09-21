import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { finishGoogleLogin } from "../services/auth.server";

// Exact path registered in Google Cloud: /login/callback
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const result = await finishGoogleLogin(request);
  if (result.ok) return result.response;
  return redirect(`/login?error=${result.reason}`);
};
