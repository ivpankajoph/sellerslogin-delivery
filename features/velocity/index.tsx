"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Calculator,
  CircleDollarSign,
  PackagePlus,
  RefreshCcw,
  RotateCcw,
  Search,
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { VelocityHeader } from "./header"
import { getVelocityStatus } from "./lib/api"

const primaryTasks = [
  { href: "/velocity/forward-orchestrate", title: "Create a shipment", description: "Create the order, assign a courier and generate its label.", icon: PackagePlus, tone: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  { href: "/velocity/serviceability", title: "Check serviceability", description: "Confirm that a pickup and delivery lane is available.", icon: Search, tone: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  { href: "/velocity/rates", title: "Compare shipping rates", description: "Find eligible couriers and compare their charges.", icon: Calculator, tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300" },
  { href: "/velocity/tracking", title: "Track a shipment", description: "Get the latest shipment status using an AWB number.", icon: Truck, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  { href: "/velocity/reverse-create", title: "Create a return", description: "Schedule a reverse pickup from the customer.", icon: RotateCcw, tone: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
  { href: "/velocity/cod-remittance", title: "Review COD payments", description: "Check COD remittance and settlement information.", icon: CircleDollarSign, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
]

export function VelocityWorkspace() {
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const status = await getVelocityStatus()
      setConfigured(Boolean(status.configured))
    } catch {
      setConfigured(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  return (
    <div className="space-y-6">
      <VelocityHeader
        title="Velocity Shipping"
        description="Choose what you want to do. Every Velocity workflow now has a focused page and a guided form."
        configured={configured}
        loading={loading}
        actions={<Button variant="outline" onClick={() => void loadStatus()} disabled={loading}><RefreshCcw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh connection</Button>}
      />

      <div>
        <h2 className="text-xl font-semibold">What would you like to do?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Start with a common task below, or open any feature from the Velocity menu on the left.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {primaryTasks.map(({ href, title, description, icon: Icon, tone }) => (
          <Link key={href} href={href} className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-md">
              <CardHeader className="pb-3">
                <div className={`mb-3 flex size-11 items-center justify-center rounded-xl ${tone}`}><Icon className="size-5" /></div>
                <CardTitle className="flex items-center justify-between gap-3 text-lg">{title}<ArrowRight className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></CardTitle>
                <CardDescription className="leading-6">{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium">Looking for stores, products, reports or NDR tools?</p><p className="mt-1 text-sm text-muted-foreground">Expand Velocity Shipping in the sidebar. Features are grouped by Shipping, Tracking & NDR, Network, Catalogue and Finance.</p></div>
          <Search className="hidden size-7 shrink-0 text-muted-foreground sm:block" />
        </CardContent>
      </Card>
    </div>
  )
}
