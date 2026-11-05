import { cn } from "@/lib/utils"

const normalize = (name?: string) => String(name || "").trim().toLowerCase()

function BikeIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <circle cx="14" cy="32" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="34" cy="32" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M14 32h8l6-10h8M22 22l6 10M28 12h6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AutoIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <path d="M10 30h28l-3-10H16l-6 10z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M18 20V14h10v6" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="16" cy="34" r="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="32" cy="34" r="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  )
}

function VanIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <path d="M6 30V18h20l8 8v4H6z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M26 18v8h8" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="14" cy="34" r="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="34" cy="34" r="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <path d="M4 16h22v16H4zM26 22h10l6 6v4H26z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="12" cy="34" r="3.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="34" cy="34" r="3.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  )
}

export function VehicleLogo({
  name,
  className,
}: {
  name?: string
  className?: string
}) {
  const value = normalize(name)
  const Icon = value.includes("2 wheeler") || value.includes("bike")
    ? BikeIcon
    : value.includes("three") || value.includes("3 wheeler") || value.includes("champion")
      ? AutoIcon
      : value.includes("eeco")
        ? VanIcon
        : TruckIcon

  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1 text-primary",
        className
      )}
      title={name}
    >
      <Icon />
    </span>
  )
}
