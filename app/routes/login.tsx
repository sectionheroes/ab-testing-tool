import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { getUser, startGoogleLogin } from "../services/auth.server";

const ERRORS: Record<string, string> = {
  denied: "This Google account has no access. Ask a Sectionheroes admin for an invitation.",
  state: "The sign-in attempt expired. Please try again.",
  provider: "Google did not complete the sign-in. Please try again.",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (await getUser(request)) return redirect("/dashboard");
  const url = new URL(request.url);
  return { error: ERRORS[url.searchParams.get("error") ?? ""] ?? null, returnTo: url.searchParams.get("returnTo") ?? "/dashboard" };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  return startGoogleLogin(request, String(form.get("returnTo") ?? "/dashboard"));
};

// DESIGN.md §7 Login
export default function Login() {
  const { error, returnTo } = useLoaderData<typeof loader>();
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-100 font-sans text-base-content">
      <div className="card w-[340px] border border-base-300 bg-base-200 p-7">
        <h1 className="text-lg font-semibold">sh-ab</h1>
        <p className="mt-1 mb-5 text-sm text-base-content/60">A/B testing dashboard for Sectionheroes clients.</p>
        {error && (
          <div role="alert" className="alert alert-error alert-soft mb-4 text-sm">
            {error}
          </div>
        )}
        <Form method="post">
          <input type="hidden" name="returnTo" value={returnTo} />
          <button type="submit" className="btn btn-primary btn-block">
            Sign in with Google
          </button>
        </Form>
      </div>
    </div>
  );
}
