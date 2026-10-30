"use client";

import { useEffect, useState } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { readSession } from "@/lib/session";
import { markSessionHydrated, store, type RootState } from "@/store";
import { setAuthSession } from "@/store/slices/authSlice";

function SessionGate({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch();
  const [ready, setReady] = useState(false);
  const token = useSelector((state: RootState) => state.auth.token);

  useEffect(() => {
    const session = readSession();
    markSessionHydrated();
    if (session?.token) {
      dispatch(setAuthSession({ token: session.token, user: session.user }));
    }
    setReady(true);
  }, [dispatch]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Verifying secure session...</p>
        </div>
      </div>
    );
  }

  return <SessionToken key={token || "signed-out"}>{children}</SessionToken>;
}

function SessionToken({ children }: { children: React.ReactNode }) {
  return children;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <SessionGate>{children}</SessionGate>
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </Provider>
  );
}
