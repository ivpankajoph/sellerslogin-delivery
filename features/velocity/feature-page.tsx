"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VelocityHeader } from "./header"
import { getVelocityStatus, type VelocityOperation } from "./lib/api"
import { getVelocityNavigationItem } from "./navigation"
import { VelocityOperationForms } from "./operation-forms"

export function VelocityFeaturePage({ operation }: { operation: VelocityOperation }) {
  const item = getVelocityNavigationItem(operation)
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
    <div className="space-y-5">
      <Link href="/velocity" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" />Velocity overview</Link>
      <VelocityHeader
        title={item.label}
        description={item.description}
        configured={configured}
        loading={loading}
        actions={<Button variant="outline" size="sm" onClick={() => void loadStatus()} disabled={loading}><RefreshCcw className={`size-4 ${loading ? "animate-spin" : ""}`} />Check connection</Button>}
      />
      <VelocityOperationForms configured={configured} operation={operation} />
    </div>
  )
}
