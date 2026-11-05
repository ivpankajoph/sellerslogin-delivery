import { useCallback, useEffect, useState } from "react"
import api from "@/lib/axios"

export const DELIVERY_APP_IDS = ["delhivery", "shadowfax", "porter"] as const

export type DeliveryAppId = (typeof DELIVERY_APP_IDS)[number]

export type DeliveryAppConfig = Record<string, string[]>

export type DeliveryVehicleConfig = Record<string, Record<string, string[]>>

export type SheetVehicle = { name: string; capacityKg: number }

export const DELIVERY_APP_SERVICES = [
  { key: "quick_commerce", title: "Quick Commerce", badge: "Under 20kg" },
  { key: "hyperlocal", title: "Hyperlocal", badge: "Within city" },
  { key: "b2b", title: "B2C", badge: "Light < 750kg" },
  { key: "heavy-duty", title: "B2B", badge: "Heavy > 750kg" },
] as const

export const DEFAULT_DELIVERY_APPS: DeliveryAppConfig = {
  quick_commerce: ["shadowfax"],
  hyperlocal: ["shadowfax"],
  b2b: ["porter", "shadowfax"],
  "heavy-duty": ["porter"],
}

export const applyDeliveryApps = <T extends { key: string; partners?: string[] }>(
  service: T,
  config: DeliveryAppConfig | null
): T => {
  const selected = config?.[service.key]
  if (!Array.isArray(selected)) return service
  return { ...service, partners: selected }
}

export function useDeliveryAppConfig() {
  const [config, setConfig] = useState<DeliveryAppConfig | null>(null)
  const [vehicles, setVehicles] = useState<DeliveryVehicleConfig | null>(null)
  const [catalog, setCatalog] = useState<DeliveryVehicleConfig>({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const response = await api.get("/delivery-apps")
    const data = response?.data?.data || {}
    const services = data.services && typeof data.services === "object" ? data.services : {}
    const nextVehicles = data.vehicles && typeof data.vehicles === "object" ? data.vehicles : {}
    const nextCatalog = data.catalog && typeof data.catalog === "object" ? data.catalog : {}
    setConfig(services)
    setVehicles(nextVehicles)
    setCatalog(nextCatalog)
    return data
  }, [])

  useEffect(() => {
    let cancelled = false
    void reload()
      .catch(() => {
        if (!cancelled) setConfig({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  return { config, vehicles, catalog, loading, reload, setConfig, setVehicles }
}
