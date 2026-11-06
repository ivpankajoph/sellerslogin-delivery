"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type PartnerId = "delhivery" | "shadowfax" | "porter" | string

export interface PartnerLogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  partner?: PartnerId | null
  name?: string | null
  size?: "xs" | "sm" | "md" | "lg"
  showName?: boolean
  badge?: boolean
  imgClassName?: string
  textClassName?: string
}

export const PARTNER_META: Record<string, { id: string; name: string; logo: string }> = {
  delhivery: {
    id: "delhivery",
    name: "Delhivery",
    logo: "/delhivery.png",
  },
  shadowfax: {
    id: "shadowfax",
    name: "Shadowfax",
    logo: "/shadowfax.png",
  },
  porter: {
    id: "porter",
    name: "Porter",
    logo: "/porter.png",
  },
  velocity: {
    id: "velocity",
    name: "Velocity Shipping",
    logo: "/velocity-shipping.svg",
  },
}

export function resolvePartnerInfo(raw?: string | null) {
  if (!raw) return null
  const lower = String(raw).trim().toLowerCase()
  if (lower.includes("delhivery")) return PARTNER_META.delhivery
  if (lower.includes("shadowfax")) return PARTNER_META.shadowfax
  if (lower.includes("porter")) return PARTNER_META.porter
  if (lower.includes("velocity")) return PARTNER_META.velocity
  return null
}

const SIZE_STYLES = {
  xs: {
    img: "size-4 rounded-sm",
    text: "text-xs font-medium",
  },
  sm: {
    img: "size-5 rounded-sm",
    text: "text-sm font-medium",
  },
  md: {
    img: "size-6 rounded",
    text: "text-base font-semibold",
  },
  lg: {
    img: "size-8 rounded-md",
    text: "text-lg font-semibold",
  },
}

export function PartnerLogo({
  partner,
  name,
  size = "sm",
  showName = true,
  badge = false,
  className,
  imgClassName,
  textClassName,
  ...props
}: PartnerLogoProps) {
  const meta = resolvePartnerInfo(partner || name)
  const displayName = name ?? meta?.name ?? partner ?? ""
  const sizeStyle = SIZE_STYLES[size] || SIZE_STYLES.sm

  if (!meta) {
    if (!displayName) return null
    return (
      <span
        className={cn(
          "inline-flex items-center",
          badge && "rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium",
          className
        )}
        {...props}
      >
        <span className={cn(sizeStyle.text, textClassName)}>{displayName}</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 align-middle",
        badge && "rounded-md border border-border/80 bg-background/80 px-2 py-1 shadow-xs",
        className
      )}
      {...props}
    >
      <img
        src={meta.logo}
        alt={meta.name}
        className={cn(
          "shrink-0 object-contain",
          imgClassName ? null : "border border-border/40 bg-white shadow-xs",
          imgClassName || sizeStyle.img
        )}
      />
      {showName && (
        <span className={cn("leading-none", sizeStyle.text, textClassName)}>
          {displayName}
        </span>
      )}
    </span>
  )
}

