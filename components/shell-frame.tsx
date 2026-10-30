"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { LogOut, Menu, MoveLeft, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { RootState } from "@/store";
import { logout, setUser } from "@/store/slices/authSlice";
import { useAppDispatch } from "@/store";
import api from "@/lib/axios";

const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:5173";
const genericNames = new Set(["member", "vendor", "admin", "user"]);

function vendorDisplayName(record: Record<string, unknown> | null | undefined) {
  if (!record) return "";
  const candidates = [
    record.customer_facing_business_name,
    record.business_name,
    record.businessName,
    record.legal_business_name,
    record.vendor_name,
    record.vendorName,
    record.company_name,
    record.name,
    record.username,
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text && !genericNames.has(text.toLowerCase())) return text;
  }
  return "";
}

export function ShellFrame({
  sidebar,
  toolbar,
  children,
}: {
  sidebar: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useSelector((state: RootState) => state.auth.user);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [vendorLabel, setVendorLabel] = React.useState("");
  const [sidebarWidth, setSidebarWidth] = React.useState(256);
  const [resizingSidebar, setResizingSidebar] = React.useState(false);
  const sidebarStorageReady = React.useRef(false);

  React.useEffect(() => {
    if (!sidebarStorageReady.current) {
      sidebarStorageReady.current = true;
      const savedWidth = Number(window.localStorage.getItem("sld-sidebar-width"));
      if (savedWidth >= 220 && savedWidth <= 400) setSidebarWidth(savedWidth);
      return;
    }
    window.localStorage.setItem("sld-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  React.useEffect(() => {
    if (!resizingSidebar) return;
    const resize = (event: MouseEvent) => setSidebarWidth(Math.min(400, Math.max(220, event.clientX)));
    const stop = () => setResizingSidebar(false);
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stop);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingSidebar]);

  React.useEffect(() => {
    const role = String(user?.role || "").toLowerCase();
    const known = vendorDisplayName(user);
    if (known) {
      setVendorLabel(known);
      return;
    }
    if (role !== "vendor" && role !== "superadmin") return;
    let cancelled = false;
    api
      .get("/vendors/profile")
      .then((response) => {
        const root = response.data || {};
        const payload = root.vendor || root.data?.vendor || root.data || root;
        const label = vendorDisplayName(payload);
        if (cancelled || !label) return;
        setVendorLabel(label);
        dispatch(setUser({ ...user, name: label, vendor_name: label, business_name: label }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dispatch, user]);

  const signOut = () => {
    dispatch(logout());
    router.replace("/login");
  };

  const name = vendorLabel || vendorDisplayName(user) || "Vendor";
  const role = user?.role || "Vendor";

  return (
    <SidebarProvider>
      <div className="sld-shell min-h-screen bg-background" style={{ "--sld-sidebar": `${sidebarWidth}px` } as React.CSSProperties}>
        {sidebarOpen && <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}
        <aside className={`sld-shell-aside fixed top-0 bottom-0 left-0 z-50 border-r border-border bg-card flex flex-col transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="h-16 flex items-center justify-between px-5 border-b border-border">
            <a href="/delivery-system" className="flex items-center gap-2.5">
              <Image src="/logo-mark-v5.svg" alt="SellersLogin Delivery" width={36} height={36} priority className="size-9 shrink-0" />
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-tight leading-none">SellersLogin</span>
                <span className="text-[11px] font-medium text-primary">Delivery</span>
              </div>
            </a>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="hidden size-8 p-0 lg:inline-flex" onClick={() => setSidebarWidth((width) => (width <= 220 ? 320 : 220))}>
                {sidebarWidth <= 220 ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </Button>
              <Button variant="ghost" size="sm" className="lg:hidden size-8 p-0" onClick={() => setSidebarOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
            <Button variant="outline" className="w-full justify-start" onClick={() => { window.location.href = adminUrl; }}>
              <MoveLeft className="size-4" />
              Go to Main Dashboard
            </Button>
            <div>
              <div className="px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Delivery</div>
              <div onClick={() => setSidebarOpen(false)}>{sidebar}</div>
            </div>
          </div>
          <div className="p-3 border-t border-border bg-muted/30">
            <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-background border border-border/70">
              <div className="flex flex-col">
                <span className="font-medium text-[11px]">Delivery Platform</span>
                <span className="text-[10px] text-muted-foreground">Admin system online</span>
              </div>
              <span className="size-2 rounded-full bg-foreground" />
            </div>
          </div>
          <button type="button" aria-label="Resize sidebar" onMouseDown={() => setResizingSidebar(true)} className={`absolute right-[-4px] top-0 hidden h-full w-2 cursor-col-resize lg:block ${resizingSidebar ? "bg-primary/20" : "hover:bg-primary/15"}`}>
            <span className="absolute right-[3px] top-1/2 h-12 w-0.5 -translate-y-1/2 rounded-full bg-border" />
          </button>
        </aside>
        <div className="sld-shell-main flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/95 backdrop-blur flex items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="lg:hidden size-9 p-0" onClick={() => setSidebarOpen(true)}>
                <Menu className="size-5" />
              </Button>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold">Delivery Console</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2.5">
              {toolbar}
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 pl-1.5 pr-2.5 h-9 rounded-full">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">{String(name).slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="hidden sm:flex flex-col text-left">
                      <span className="text-xs font-semibold leading-none">{name}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5 capitalize">{role}</span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 p-1.5">
                  <DropdownMenuLabel className="flex flex-col">
                    <span>{name}</span>
                    <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={signOut}>
                    <LogOut className="mr-2 size-4" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-x-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
