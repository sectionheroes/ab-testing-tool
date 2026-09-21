import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { logout } from "../services/auth.server";

export const action = ({ request }: ActionFunctionArgs) => logout(request);
export const loader = () => redirect("/login");
