import { HANDOFF_BOOT } from "@/lib/handoff-boot";

export default function HandoffPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <script dangerouslySetInnerHTML={{ __html: HANDOFF_BOOT }} />
      <p className="text-sm text-muted-foreground">Opening delivery dashboard...</p>
    </div>
  );
}
