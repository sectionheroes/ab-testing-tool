import type { LoaderFunctionArgs } from "react-router";
import { requireInternal } from "../services/auth.server";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/Shell";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireInternal(request);
  return null;
};

export default function ExperimentsPage() {
  return (
    <>
      <PageHeader title="Experiments" />
      <EmptyState title="Nothing here yet">This page is built in a later work package.</EmptyState>
    </>
  );
}
