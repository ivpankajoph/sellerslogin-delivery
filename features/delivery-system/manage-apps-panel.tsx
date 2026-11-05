"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import api from "@/lib/axios"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PartnerLogo } from "@/components/shared/partner-logo"
import { VehicleLogo } from "@/components/shared/vehicle-logo"
import {
  DEFAULT_DELIVERY_APPS,
  DELIVERY_APP_IDS,
  DELIVERY_APP_SERVICES,
  useDeliveryAppConfig,
  type DeliveryAppConfig,
  type DeliveryVehicleConfig,
  type SheetVehicle,
} from "@/features/delivery-system/lib/delivery-apps"

const uniqueVehicles = (cities: Array<{ vehicles?: Array<{ name?: string; capacity_kg?: number }> }>) => {
  const seen = new Map<string, SheetVehicle>()
  cities.forEach((city) => {
    ;(city.vehicles || []).forEach((vehicle) => {
      const name = String(vehicle.name || "").trim()
      if (!name || seen.has(name.toLowerCase())) return
      seen.set(name.toLowerCase(), { name, capacityKg: Number(vehicle.capacity_kg || 0) })
    })
  })
  return [...seen.values()]
}

export function ManageAppsPanel() {
  const { config, vehicles, loading, setConfig, setVehicles } = useDeliveryAppConfig()
  const [draft, setDraft] = useState<DeliveryAppConfig | null>(null)
  const [vehicleDraft, setVehicleDraft] = useState<DeliveryVehicleConfig | null>(null)
  const [sheet, setSheet] = useState<Record<string, SheetVehicle[]>>({ porter: [], shadowfax: [] })
  const [sheetError, setSheetError] = useState("")
  const [saving, setSaving] = useState(false)
  const [serviceKey, setServiceKey] = useState<(typeof DELIVERY_APP_SERVICES)[number]["key"]>("quick_commerce")
  const [partner, setPartner] = useState<(typeof DELIVERY_APP_IDS)[number]>("delhivery")
  const services = draft || config
  const selectedVehicles = vehicleDraft || vehicles

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      api.get("/delivery-pricing/sheet", { params: { partner: "porter" } }),
      api.get("/delivery-pricing/sheet", { params: { partner: "shadowfax" } }),
    ])
      .then(([porter, shadowfax]) => {
        if (cancelled) return
        setSheet({
          porter: uniqueVehicles(porter?.data?.data?.cities || []),
          shadowfax: uniqueVehicles(shadowfax?.data?.data?.cities || []),
        })
        setSheetError("")
      })
      .catch(() => {
        if (!cancelled) setSheetError("The fare sheet could not be loaded. Open Set Pricing once, then come back here.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const appsFor = (serviceKey: string) =>
    new Set(services ? services[serviceKey] || [] : DEFAULT_DELIVERY_APPS[serviceKey] || [])

  const vehicleNames = (partner: string) => {
    if (partner === "delhivery") {
      return [...new Map([...sheet.porter, ...sheet.shadowfax].map((vehicle) => [vehicle.name.toLowerCase(), vehicle.name])).values()]
    }
    return (sheet[partner] || []).map((vehicle) => vehicle.name)
  }

  const vehiclesFor = (serviceKey: string, partner: string) => {
    const saved = selectedVehicles?.[serviceKey]?.[partner]
    if (Array.isArray(saved)) return new Set(saved)
    return new Set(vehicleNames(partner))
  }

  const cellOn = (serviceKey: string, partner: string, name?: string) => {
    if (!appsFor(serviceKey).has(partner)) return false
    if (!name) return true
    return vehiclesFor(serviceKey, partner).has(name)
  }

  const toggleApp = (serviceKey: string, appId: string) => {
    setDraft((current) => {
      const base = current || config || { ...DEFAULT_DELIVERY_APPS }
      const selected = new Set(base[serviceKey] || DEFAULT_DELIVERY_APPS[serviceKey] || [])
      if (selected.has(appId)) selected.delete(appId)
      else selected.add(appId)
      return { ...base, [serviceKey]: DELIVERY_APP_IDS.filter((id) => selected.has(id)) }
    })
  }

  const setVehicle = (serviceKey: string, partner: string, name: string, enabled: boolean, only = false) => {
    setVehicleDraft((current) => {
      const base = current || vehicles || {}
      const known = vehicleNames(partner)
      const currentNames = base[serviceKey]?.[partner]
      const selected = new Set(only ? [] : Array.isArray(currentNames) ? currentNames : known)
      if (enabled) selected.add(name)
      else selected.delete(name)
      return {
        ...base,
        [serviceKey]: {
          ...(base[serviceKey] || {}),
          [partner]: known.filter((entry) => selected.has(entry)),
        },
      }
    })
  }

  const save = async () => {
    if (!services) return
    setSaving(true)
    try {
      const response = await api.put("/delivery-apps", {
        services,
        vehicles: selectedVehicles || {},
      })
      const saved = response?.data?.data || {}
      setConfig(saved.services || services)
      setVehicles(saved.vehicles || selectedVehicles || {})
      setDraft(null)
      setVehicleDraft(null)
      toast.success("Saved. The next delivery request will use these apps and vehicles.")
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { message?: string } } })?.response
      const message = response?.data?.message || (response?.status ? `Could not save delivery apps (${response.status}).` : "Could not save delivery apps.")
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manage Apps</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Pick a delivery type, turn its apps on, then tick the vehicles that customers can choose.
          </p>
        </div>
        <Button onClick={() => void save()} disabled={saving || loading || !services}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      {sheetError ? <p className="text-sm text-rose-600">{sheetError}</p> : null}

      <div className="flex flex-wrap gap-2">
        {DELIVERY_APP_SERVICES.map((service) => (
          <button
            key={service.key}
            type="button"
            onClick={() => setServiceKey(service.key)}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              serviceKey === service.key ? "border-primary bg-primary text-primary-foreground" : "bg-card"
            }`}
          >
            {service.title}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {DELIVERY_APP_IDS.map((appId) => {
          const on = appsFor(serviceKey).has(appId)
          return (
            <button
              key={appId}
              type="button"
              onClick={() => {
                setPartner(appId)
                if (!on) toggleApp(serviceKey, appId)
              }}
              className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left ${
                partner === appId ? "border-primary" : ""
              } ${on ? "bg-card" : "bg-muted/40"}`}
            >
              <PartnerLogo partner={appId} size="sm" />
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleApp(serviceKey, appId)
                }}
              >
                {on ? "On" : "Off"}
              </span>
            </button>
          )
        })}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-medium">
            {DELIVERY_APP_SERVICES.find((service) => service.key === serviceKey)?.title} · vehicles
          </p>
          <PartnerLogo partner={partner} size="sm" />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vehicle</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead className="text-center">Show</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicleNames(partner).length ? vehicleNames(partner).map((name) => {
              const vehicle = [...sheet.porter, ...sheet.shadowfax].find((entry) => entry.name.toLowerCase() === name.toLowerCase())
              const on = cellOn(serviceKey, partner, name)
              return (
                <TableRow key={name}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <VehicleLogo name={name} />
                      <span className="font-medium">{name}</span>
                    </span>
                  </TableCell>
                  <TableCell>{vehicle?.capacityKg ? `${vehicle.capacityKg} kg` : "—"}</TableCell>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={on}
                      onChange={() => {
                        const appOn = appsFor(serviceKey).has(partner)
                        if (on) {
                          const remaining = [...vehiclesFor(serviceKey, partner)].filter((entry) => entry !== name)
                          setVehicle(serviceKey, partner, name, false)
                          if (!remaining.length) toggleApp(serviceKey, partner)
                        } else {
                          if (!appOn) toggleApp(serviceKey, partner)
                          setVehicle(serviceKey, partner, name, true, !appOn)
                        }
                      }}
                      aria-label={`Show ${name}`}
                    />
                  </TableCell>
                </TableRow>
              )
            }) : (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No vehicles found on this fare sheet yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
