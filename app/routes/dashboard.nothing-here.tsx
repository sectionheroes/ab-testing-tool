import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/Shell";

// Phase 1 landing page for CLIENT users without a linked shop (plan §1: client view is Phase 2).
export default function NothingHere() {
  return (
    <>
      <PageHeader title="Nothing here yet" />
      <EmptyState title="Your results will appear here.">Sectionheroes will let you know once your first test is live.</EmptyState>
    </>
  );
}
