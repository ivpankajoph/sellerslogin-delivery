"use client";

import NextLink from "next/link";
import { useParams as useNextParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

type LocationValue = {
  pathname: string;
  searchStr: string;
  href: string;
};

type NavigateOptions = {
  to: string;
  search?: Record<string, string | number | undefined | null>;
};

export function useNavigate() {
  const router = useRouter();
  return (options: NavigateOptions) => {
    const [path, existing] = options.to.split("?");
    const params = new URLSearchParams(existing || "");
    if (options.search) {
      for (const [key, value] of Object.entries(options.search)) {
        if (value === undefined || value === null || value === "") continue;
        params.set(key, String(value));
      }
    }
    const query = params.toString();
    router.push(query ? `${path}?${query}` : path);
  };
}

export function useLocation(): LocationValue;
export function useLocation<T>(options: { select: (location: LocationValue) => T }): T;
export function useLocation<T>(options?: { select?: (location: LocationValue) => T }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const location = {
    pathname,
    searchStr: search ? `?${search}` : "",
    href: `${pathname}${search ? `?${search}` : ""}`,
  };
  return options?.select ? options.select(location) : location;
}

export function useParams(_options?: { strict?: boolean }) {
  return useNextParams() as Record<string, string>;
}

export function Link({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <NextLink href={to} className={className}>
      {children}
    </NextLink>
  );
}
