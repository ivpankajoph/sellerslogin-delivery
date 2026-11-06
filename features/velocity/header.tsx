import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"

export function VelocityHeader({
  title,
  description,
  configured,
  loading = false,
  actions,
}: {
  title: string
  description: string
  configured: boolean
  loading?: boolean
  actions?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-28 shrink-0 items-center justify-center rounded-xl border bg-white px-3 shadow-sm">
            <img src="/velocity-shipping.svg" alt="Velocity Shipping" className="h-10 w-full object-contain" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <Badge className={configured ? "bg-emerald-600" : "bg-amber-500"}>
                {loading ? "Checking…" : configured ? "Connected" : "Setup required"}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground sm:text-base">{description}</p>
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {!loading && !configured ? (
        <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 sm:px-6">
          Add <code className="rounded bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900">VELOCITY_API_TOKEN</code> to <code>sellerslogin-backend/.env</code>, then restart the backend.
        </div>
      ) : null}
    </div>
  )
}
