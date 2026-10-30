"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { DeliveryWorkspaceShell } from "@/features/delivery-system";
import type { RootState } from "@/store";

function deliverySection(pathname: string) {
  if (pathname.startsWith("/courier/list")) return "courier-list";
  if (pathname.startsWith("/courier/manual-list")) return "manual-list";
  if (pathname.startsWith("/courier/manual")) return "manual";
  if (pathname.startsWith("/courier/warehouses")) return "warehouses";
  if (pathname.startsWith("/courier/reports")) return "reports";
  if (pathname.startsWith("/courier/tracking")) return "tracking";
  if (pathname.startsWith("/courier/delhivery")) return "delhivery";
  if (pathname.startsWith("/courier/shadowfax")) return "shadowfax";
  if (pathname.startsWith("/courier/book-vehicle")) return "book-vehicle";
  return "apps";
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useSelector((state: RootState) => state.auth.token);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (pathname.startsWith("/delivery-system")) return children;

  return (
    <DeliveryWorkspaceShell activeSection={deliverySection(pathname) as never}>
      {children}
    </DeliveryWorkspaceShell>
  );
}
