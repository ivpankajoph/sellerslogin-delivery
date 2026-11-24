"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock3,
  Loader2,
  MapPin,
  Navigation,
  PackageCheck,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { PartnerLogo } from "@/components/shared/partner-logo"
import { VehicleLogo } from "@/components/shared/vehicle-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { IndianStateSelect } from "@/features/delivery-system/components/indian-state-select"
import {
  createDelhiveryShipment,
  createManualCourierOrder,
  createShadowfaxShipment,
  fetchCourierWarehouses,
  type CourierWarehouse,
} from "@/features/delivery-system/lib/api"
import type { CourierOrderSummary } from "@/features/delivery-system/lib/data"
import { useDeliveryAppConfig } from "@/features/delivery-system/lib/delivery-apps"
import api from "@/lib/axios"
import { formatINR } from "@/lib/currency"

type Service = {
  id: string
  title: string
  badge: string
  vehicleOptions: string[]
  key?: string
  product?: "hyperlocal" | "quick_commerce"
  partners?: string[]
}

type Serviceability = {
  provider: string
  label: string
  serviceable: boolean
  status: string
  message: string
  couriers?: Array<{ carrier_id?: string; carrier_name?: string }>
}

type Quote = {
  id: string
  provider: "delhivery" | "shadowfax" | "porter" | "velocity"
  aggregator?: string
  carrier_id?: string
  carrier_name?: string
  title: string
  actual_price: number
  price: number
  eta: string
  vehicle: string
  selectable: boolean
  summary: string
  quote_token: string
}

const blank = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  itemName: "",
  quantity: "1",
  amount: "",
  weight: "500",
  length: "10",
  breadth: "10",
  height: "10",
  payment: "Pre-paid",
  mode: "S",
  packageType: "box",
  velocityWarehouseId: "",
}

const readText = (value: unknown) => String(value ?? "").trim()
type WarehouseDetails = CourierWarehouse & {
  contact?: string
  state?: string
  pincode?: string
  address_line_1?: string
  unique_code?: string
  warehouse_id?: string
}

const warehousePin = (warehouse: CourierWarehouse | null) => {
  const entry = warehouse as WarehouseDetails | null
  return readText(entry?.pin || entry?.pincode)
}
const warehouseAddress = (warehouse: CourierWarehouse | null) => {
  const entry = warehouse as WarehouseDetails | null
  return readText(entry?.address || entry?.address_line_1)
}

const findExternalId = (value: unknown): string => {
  if (!value || typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  for (const key of ["awb", "awb_number", "tracking_number", "shipment_id", "order_id", "id"]) {
    const found = readText(record[key])
    if (found) return found
  }
  for (const nested of Object.values(record)) {
    const found = findExternalId(nested)
    if (found) return found
  }
  return ""
}

function Step({ number, label, active, done }: { number: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-sm ${active ? "border-primary bg-primary/5 text-primary" : done ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300" : "text-muted-foreground"}`}>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-600 text-white" : "bg-muted"}`}>
        {done ? <Check className="size-3.5" /> : number}
      </span>
      <span className="truncate font-medium">{label}</span>
    </div>
  )
}

export function UnifiedCreateOrderPanel({
  service,
  existingOrder,
  onPlaced,
  onCreateWarehouse,
}: {
  service: Service
  existingOrder?: CourierOrderSummary | null
  onPlaced: () => void
  onCreateWarehouse: () => void
}) {
  const [warehouses, setWarehouses] = useState<CourierWarehouse[]>([])
  const [warehouseId, setWarehouseId] = useState("")
  const [warehousesReady, setWarehousesReady] = useState(false)
  const [form, setForm] = useState(blank)
  const [serviceability, setServiceability] = useState<Serviceability[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [checkingPins, setCheckingPins] = useState(false)
  const [checkingRates, setCheckingRates] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [route, setRoute] = useState({ distance: "", duration: "" })
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({})
  const { vehicles } = useDeliveryAppConfig()

  useEffect(() => {
    let cancelled = false
    void fetchCourierWarehouses()
      .then((rows) => {
        if (cancelled) return
        setWarehouses(rows)
        setWarehouseId(rows[0]?.id || "")
      })
      .catch(() => !cancelled && setWarehouses([]))
      .finally(() => !cancelled && setWarehousesReady(true))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!existingOrder) return
    setForm((current) => ({
      ...current,
      name: existingOrder.customerName || "",
      phone: existingOrder.customerPhone || "",
      email: existingOrder.customerEmail || "",
      address: existingOrder.address || "",
      city: existingOrder.city || "",
      state: existingOrder.state || "",
      pincode: existingOrder.pincode || "",
      itemName: existingOrder.items?.[0]?.productName || "Website order",
      quantity: String(existingOrder.itemsCount || 1),
      amount: String(existingOrder.total || ""),
    }))
    setServiceability([])
    setQuotes([])
  }, [existingOrder])

  const warehouse = useMemo(
    () => warehouses.find((entry) => entry.id === warehouseId) || warehouses[0] || null,
    [warehouseId, warehouses],
  )
  const originPin = warehousePin(warehouse)
  const warehouseInfo = warehouse as WarehouseDetails | null
  const matchingVelocityWarehouse = warehouses.find((entry) =>
    entry.provider === "velocity" && warehousePin(entry) === originPin
  ) as WarehouseDetails | undefined
  const velocityWarehouseId = readText(form.velocityWarehouseId || matchingVelocityWarehouse?.warehouse_id)
  const selected = quotes.find((quote) => quote.id === selectedId) || null
  const step = quotes.length ? 3 : serviceability.length ? 2 : 1
  const serviceKey = service.key || service.id
  const enabledProviders = service.partners || []
  const routeReady = /^\d{6}$/.test(originPin) && /^\d{6}$/.test(form.pincode)
  const mapSrc = routeReady
    ? `https://maps.google.com/maps?saddr=${encodeURIComponent(originPin)}&daddr=${encodeURIComponent(form.pincode)}&output=embed`
    : ""
  const availableApps = serviceability.filter((entry) => entry.serviceable || entry.status === "rate_check").length
  const groupedQuotes = useMemo(() => {
    const groups = new Map<string, Quote[]>()
    for (const quote of quotes) {
      const current = groups.get(quote.provider) || []
      current.push(quote)
      groups.set(quote.provider, current)
    }
    return Array.from(groups.entries()).map(([provider, options]) => ({ provider, options }))
  }, [quotes])

  const update = (key: keyof typeof blank, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (key === "pincode" || key === "payment") {
      setServiceability([])
      setQuotes([])
      setSelectedId("")
    } else if (["weight", "length", "breadth", "height", "amount", "city", "state", "address", "mode", "packageType"].includes(key)) {
      setQuotes([])
      setSelectedId("")
    }
  }

  const checkPins = async () => {
    if (!warehouse) return toast.error("Create or select a pickup warehouse first.")
    if (!/^\d{6}$/.test(originPin) || !/^\d{6}$/.test(form.pincode)) {
      return toast.error("Enter valid 6-digit pickup and delivery pincodes.")
    }
    setCheckingPins(true)
    setServiceability([])
    setQuotes([])
    try {
      const response = await api.post("/delivery-bookings/serviceability", {
        origin_pincode: originPin,
        destination_pincode: form.pincode,
        payment_mode: form.payment === "COD" ? "cod" : "prepaid",
        providers: enabledProviders,
      }, { timeout: 60000 })
      const rows = Array.isArray(response?.data?.data?.providers) ? response.data.data.providers : []
      setServiceability(rows)
      if (!rows.some((row: Serviceability) => row.serviceable || row.status === "rate_check")) {
        toast.error("None of the enabled delivery apps can serve this route.")
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Serviceability check failed")
    } finally {
      setCheckingPins(false)
    }
  }

  const checkRates = async () => {
    if (!serviceability.length) return toast.error("Check serviceability first.")
    if (!form.name || !form.phone || !form.address || !form.city || !form.state || !form.itemName) {
      return toast.error("Complete the customer, delivery address, and item details.")
    }
    if (!warehouse) return
    setCheckingRates(true)
    setQuotes([])
    try {
      const response = await api.post("/delivery-bookings/quotes", {
        service_id: service.id,
        order_model: service.product,
        providers: enabledProviders,
        allowed_vehicles: vehicles?.[serviceKey] || {},
        pickup: {
          name: warehouse.name,
          phone: warehouse.phone || warehouseInfo?.contact,
          address_line_1: warehouseAddress(warehouse),
          city: warehouse.city,
          state: warehouseInfo?.state || form.state,
          pincode: originPin,
          formatted_address: [warehouseAddress(warehouse), warehouse.city, warehouseInfo?.state, originPin].filter(Boolean).join(", "),
        },
        drop: {
          name: form.name,
          phone: form.phone,
          email: form.email,
          address_line_1: form.address,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
          formatted_address: [form.address, form.city, form.state, form.pincode].filter(Boolean).join(", "),
        },
        weight_grams: Number(form.weight || 500),
        length_cm: Number(form.length || 10),
        width_cm: Number(form.breadth || 10),
        height_cm: Number(form.height || 10),
        amount: Number(form.amount || 0),
        payment: form.payment,
        mode: form.mode,
        package_type: form.packageType,
      }, { timeout: 90000 })
      const data = response?.data?.data || {}
      const rows = Array.isArray(data.options) ? data.options : []
      setQuotes(rows)
      setServiceability(Array.isArray(data.serviceability) ? data.serviceability : serviceability)
      setRoute({ distance: readText(data.distance_text), duration: readText(data.duration_text) })
      setSelectedId(rows[0]?.id || "")
      if (!rows.length) toast.error("No price was returned for this route and package.")
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Price comparison failed")
    } finally {
      setCheckingRates(false)
    }
  }

  const createVelocityShipment = async (order: CourierOrderSummary, quote: Quote) => {
    if (!velocityWarehouseId) {
      throw new Error("Enter the Velocity warehouse ID before placing this Velocity request.")
    }
    const response = await api.post("/velocity/forward-orchestrate", {
      payload: {
        order_id: order.orderNumber || order.id,
        order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
        carrier_id: quote.carrier_id,
        billing_customer_name: form.name,
        billing_address: form.address,
        billing_city: form.city,
        billing_pincode: form.pincode,
        billing_state: form.state,
        billing_country: "India",
        billing_phone: form.phone,
        billing_email: form.email,
        shipping_is_billing: true,
        print_label: true,
        order_items: [{
          name: form.itemName,
          sku: `SL-${order.orderNumber || order.id}`,
          units: Number(form.quantity || 1),
          selling_price: Number(form.amount || 0),
        }],
        payment_method: form.payment === "COD" ? "COD" : "PREPAID",
        sub_total: Number(form.amount || 0),
        cod_collectible: form.payment === "COD" ? Number(form.amount || 0) : 0,
        shipping_charges: 0,
        length: Number(form.length || 10),
        breadth: Number(form.breadth || 10),
        height: Number(form.height || 10),
        weight: Number(form.weight || 500) / 1000,
        warehouse_id: velocityWarehouseId,
      },
    }, { timeout: 90000 })
    return response?.data?.data || response?.data
  }

  const placeRequest = async () => {
    if (!selected || !warehouse) return
    setPlacing(true)
    try {
      let order = existingOrder || null
      if (!order) {
        const created = await createManualCourierOrder({
          customer: {
            name: form.name,
            phone: form.phone,
            email: form.email,
            address_line_1: form.address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            country: "India",
          },
          item: {
            name: form.itemName,
            quantity: Number(form.quantity || 1),
            unit_price: Number(form.amount || 0),
          },
          shipment: {
            payment_mode: form.payment === "COD" ? "cod" : "prepaid",
            total_amount: Number(form.amount || 0),
          },
        })
        order = created.order
      }
      if (!order) throw new Error("The order could not be created.")

      let externalId = ""
      let trackingUrl = ""
      if (selected.provider === "delhivery") {
        const result = await createDelhiveryShipment(order, {
          price_quote: selected.price,
          actual_price_quote: selected.actual_price,
          pickup_location: warehouse.name,
          payment_mode: form.payment === "COD" ? "COD" : "Prepaid",
          return_name: warehouse.name,
          return_phone: warehouse.phone || warehouseInfo?.contact || "",
          return_add: warehouseAddress(warehouse),
          return_city: warehouse.city || "",
          return_state: warehouseInfo?.state || form.state,
          return_pin: originPin,
          return_country: "India",
        })
        externalId = readText(result?.shipment?.waybill || result?.order?.delhivery?.waybill || result?.order?.delhivery?.waybills?.[0])
        trackingUrl = readText(result?.shipment?.tracking_url)
        if (!externalId) throw new Error("Delhivery did not return a waybill.")
      } else if (selected.provider === "shadowfax") {
        const result = await createShadowfaxShipment(order, {
          order_model: warehouse.provider === "shadowfax" ? "warehouse" : "marketplace",
          price_quote: selected.price,
          actual_price_quote: selected.actual_price,
          actual_weight: Number(form.weight || 500),
          volumetric_weight: Number(form.weight || 500),
          payment_mode: form.payment === "COD" ? "cod" : "prepaid",
          pickup_name: warehouse.name,
          pickup_contact: warehouse.phone || warehouseInfo?.contact || "",
          pickup_address_line_1: warehouseAddress(warehouse),
          pickup_city: warehouse.city || "",
          pickup_state: warehouseInfo?.state || form.state,
          pickup_pincode: originPin,
          pickup_unique_code: warehouseInfo?.unique_code || "",
          rts_name: warehouse.name,
          rts_contact: warehouse.phone || warehouseInfo?.contact || "",
          rts_address_line_1: warehouseAddress(warehouse),
          rts_city: warehouse.city || "",
          rts_state: warehouseInfo?.state || form.state,
          rts_pincode: originPin,
          rts_unique_code: warehouseInfo?.unique_code || "",
        })
        externalId = readText(result?.shipment?.tracking_number || result?.shipment?.awb_number || result?.order?.shadowfax?.tracking_number)
        trackingUrl = readText(result?.shipment?.track_url)
        if (!externalId) throw new Error("Shadowfax did not return an AWB.")
      } else if (selected.provider === "velocity") {
        const result = await createVelocityShipment(order, selected)
        externalId = findExternalId(result)
        if (!externalId) throw new Error("Velocity accepted the request but did not return a shipment or AWB ID.")
      }

      const booking = await api.post("/delivery-bookings", {
        service_id: service.id,
        order_model: service.product || "",
        vehicle: selected.vehicle,
        partner: selected.provider,
        carrier_id: selected.carrier_id,
        carrier_name: selected.carrier_name,
        quote_token: selected.quote_token,
        estimated_price: selected.price,
        actual_price: selected.actual_price,
        external_id: externalId,
        waybill: externalId,
        tracking_url: trackingUrl,
        source_order_id: order.id,
        source_order_type: order.source,
        vendor_name: warehouse.name,
        pickup: {
          name: warehouse.name,
          phone: warehouse.phone || warehouseInfo?.contact || form.phone,
          address_line_1: warehouseAddress(warehouse),
          city: warehouse.city,
          state: warehouseInfo?.state || form.state,
          pincode: originPin,
        },
        drop: {
          name: form.name,
          phone: form.phone,
          email: form.email,
          address_line_1: form.address,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
        },
        item: {
          description: form.itemName,
          quantity: Number(form.quantity || 1),
          weight_kg: Number(form.weight || 0) / 1000,
          length_cm: Number(form.length || 0),
          width_cm: Number(form.breadth || 0),
          height_cm: Number(form.height || 0),
        },
      }, { timeout: 60000 })
      if (!booking?.data?.success) throw new Error(booking?.data?.message || "The delivery request was not saved.")
      toast.success(`${selected.title} request placed successfully.`)
      onPlaced()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Could not place the delivery request")
    } finally {
      setPlacing(false)
    }
  }

  if (warehousesReady && !warehouses.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
          <PackageCheck className="size-10 text-primary" />
          <h2 className="mt-4 text-xl font-semibold">Create a pickup warehouse first</h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">Every provider needs a pickup pincode and address before serviceability and rates can be compared.</p>
          <Button className="mt-5" onClick={onCreateWarehouse}>Create warehouse</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-violet-50 via-background to-blue-50 p-5 dark:from-violet-950/30 dark:to-blue-950/20 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{service.badge}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                {existingOrder ? `Ship ${existingOrder.orderNumber}` : "Plan your delivery"}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">One route, every available courier, one clear decision.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1.5"><ShieldCheck className="size-3.5 text-emerald-600" />Secure quote</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1.5"><Clock3 className="size-3.5 text-primary" />Valid 15 min</span>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Step number={1} label="Route & availability" active={step === 1} done={step > 1} />
          <Step number={2} label="Shipment details" active={step === 2} done={step > 2} />
          <Step number={3} label="Select & book" active={step === 3} done={false} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(350px,0.65fr)]">
            <div className="relative min-h-[390px] overflow-hidden bg-slate-100 dark:bg-slate-950">
              {mapSrc ? (
                <iframe
                  title="Pickup to delivery route"
                  className="absolute inset-0 h-full w-full border-0"
                  src={mapSrc}
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.18),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(59,130,246,0.15),transparent_38%)]">
                  <div className="max-w-xs text-center">
                    <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-background shadow-sm"><Route className="size-6 text-primary" /></div>
                    <p className="mt-4 font-semibold">Your route will appear here</p>
                    <p className="mt-1 text-sm text-muted-foreground">Select a warehouse and enter a 6-digit delivery pincode.</p>
                  </div>
                </div>
              )}
              <div className="absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
                <div className="flex items-start gap-3 text-sm">
                  <div className="mt-1 flex flex-col items-center">
                    <span className="size-2.5 rounded-full bg-primary" />
                    <span className="h-7 w-px bg-border" />
                    <span className="size-2.5 rounded-full bg-emerald-500" />
                  </div>
                  <div className="min-w-0 space-y-2.5">
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pickup</p><p className="truncate font-medium">{warehouse?.name || "Select warehouse"} · {originPin || "—"}</p></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Deliver to</p><p className="truncate font-medium">{form.city || "Destination"} · {form.pincode || "—"}</p></div>
                  </div>
                </div>
              </div>
              {route.distance || route.duration ? (
                <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur">
                  <Navigation className="size-4 text-primary" />
                  {[route.distance, route.duration].filter(Boolean).join(" · ")}
                </div>
              ) : null}
            </div>

            <div className="border-t p-5 xl:border-l xl:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">Route setup</p>
                  <h2 className="mt-1 text-lg font-semibold">Where is it going?</h2>
                </div>
                {serviceability.length ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">{availableApps} apps ready</span> : null}
              </div>
              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label>Pickup warehouse</Label>
                  <Select value={warehouse?.id || ""} onValueChange={(value) => { setWarehouseId(value); setServiceability([]); setQuotes([]) }}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent>{warehouses.map((entry) => <SelectItem key={`${entry.provider}-${entry.id}`} value={entry.id}>{entry.name} · {warehousePin(entry)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Delivery pincode</Label>
                  <div className="relative"><MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={form.pincode} onChange={(event) => update("pincode", event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit pincode" /></div>
                </div>
                <Button className="w-full" size="lg" onClick={() => void checkPins()} disabled={checkingPins || !warehouse || !routeReady}>
                  {checkingPins ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  {checkingPins ? "Checking every app..." : "Check availability"}
                </Button>
              </div>

              <div className="mt-5 border-t pt-4">
                {serviceability.length ? (
                  <div className="space-y-2">
                    {serviceability.map((entry) => {
                      const available = entry.serviceable || entry.status === "rate_check"
                      return (
                        <div key={entry.provider} className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
                          <PartnerLogo partner={entry.provider} size="xs" showName={false} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{entry.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{entry.couriers?.length ? `${entry.couriers.length} courier partners available` : available ? "Available for this route" : "Not available"}</p>
                          </div>
                          {available ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <XCircle className="size-4 shrink-0 text-rose-500" />}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex gap-3 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground"><Truck className="mt-0.5 size-4 shrink-0" /><p>We’ll check Delhivery, Shadowfax, Velocity and Porter together.</p></div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Shipment details</p>
              <CardTitle className="mt-1 text-xl">Customer and package</CardTitle>
              <CardDescription className="mt-1">Review the order once; these details go only to the courier you select.</CardDescription>
            </div>
            {existingOrder ? <span className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs font-medium">Prefilled from {existingOrder.orderNumber}</span> : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            {([["name", "Customer name", "text"], ["phone", "Phone", "tel"], ["email", "Email (optional)", "email"]] as const).map(([key, label, inputType]) => (
              <div key={key} className="space-y-2"><Label>{label}</Label><Input type={inputType} value={form[key]} onChange={(event) => update(key, event.target.value)} /></div>
            ))}
            <div className="space-y-2 md:col-span-3"><Label>Delivery address</Label><Input value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="House, street and landmark" /></div>
            <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={(event) => update("city", event.target.value)} /></div>
            <div className="space-y-2"><Label>State</Label><IndianStateSelect value={form.state} onChange={(value) => update("state", value)} /></div>
            <div className="space-y-2"><Label>Item</Label><Input value={form.itemName} onChange={(event) => update("itemName", event.target.value)} /></div>
          </div>

          <div className="grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2"><Label>Order value</Label><Input type="number" value={form.amount} onChange={(event) => update("amount", event.target.value)} /></div>
            <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} /></div>
            <div className="space-y-2"><Label>Payment</Label><Select value={form.payment} onValueChange={(value) => update("payment", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Pre-paid">Prepaid</SelectItem><SelectItem value="COD">COD</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Weight (grams)</Label><Input type="number" value={form.weight} onChange={(event) => update("weight", event.target.value)} /></div>
          </div>

          <details className="group rounded-xl border bg-muted/20">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
              <span>Package dimensions & delivery preferences</span>
              <ChevronDown className="size-4 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-4 border-t p-4 sm:grid-cols-2 lg:grid-cols-5">
              {([["length", "Length (cm)"], ["breadth", "Width (cm)"], ["height", "Height (cm)"]] as const).map(([key, label]) => <div key={key} className="space-y-2"><Label>{label}</Label><Input type="number" value={form[key]} onChange={(event) => update(key, event.target.value)} /></div>)}
              <div className="space-y-2"><Label>Delivery mode</Label><Select value={form.mode} onValueChange={(value) => update("mode", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="S">Surface</SelectItem><SelectItem value="E">Express</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Package type</Label><Select value={form.packageType} onValueChange={(value) => update("packageType", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="box">Box</SelectItem><SelectItem value="flyer">Flyer</SelectItem></SelectContent></Select></div>
            </div>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <p className="text-sm text-muted-foreground">{serviceability.length ? `${availableApps} apps are ready to return prices.` : "Check route availability before comparing prices."}</p>
            <Button size="lg" onClick={() => void checkRates()} disabled={checkingRates || !serviceability.length}>
              {checkingRates ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {checkingRates ? "Comparing all prices..." : quotes.length ? "Refresh prices" : "Compare prices"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {quotes.length ? (
        <Card>
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">Live comparison</p>
                <CardTitle className="mt-1 text-xl">Choose the right courier</CardTitle>
                <CardDescription className="mt-1">{quotes.length} options · {[route.distance, route.duration].filter(Boolean).join(" · ") || "sorted by price"}</CardDescription>
              </div>
              <div className="rounded-xl border bg-background px-3 py-2 text-right"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Best price</p><p className="text-lg font-bold text-emerald-600">{formatINR(quotes[0]?.price || 0)}</p></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            {groupedQuotes.map(({ provider, options }) => {
              const expanded = expandedProviders[provider]
              const visible = expanded ? options : options.slice(0, 3)
              return (
                <section key={provider} className="overflow-hidden rounded-2xl border">
                  <div className="flex items-center justify-between gap-3 bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-3"><PartnerLogo partner={provider} size="sm" /><span className="rounded-full bg-background px-2 py-1 text-xs text-muted-foreground">{options.length} option{options.length === 1 ? "" : "s"}</span></div>
                    <p className="text-sm text-muted-foreground">from <span className="font-bold text-foreground">{formatINR(options[0]?.price || 0)}</span></p>
                  </div>
                  <div className="grid gap-3 p-3 md:grid-cols-2 2xl:grid-cols-3">
                    {visible.map((quote) => {
                      const active = selectedId === quote.id
                      return (
                        <button key={quote.id} type="button" onClick={() => setSelectedId(quote.id)} className={`relative min-h-44 rounded-2xl border p-4 text-left transition-all ${active ? "border-primary bg-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary" : "bg-background hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${active ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>{active ? <Check className="size-3.5 text-primary-foreground" /> : null}</span>
                              <p className="line-clamp-2 text-sm font-semibold leading-snug">{quote.title}</p>
                            </div>
                            {quote.id === quotes[0]?.id ? <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">BEST PRICE</span> : null}
                          </div>
                          <p className="mt-4 text-3xl font-bold tracking-tight">{formatINR(quote.price)}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {quote.vehicle ? <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><VehicleLogo name={quote.vehicle} />{quote.vehicle}</span> : null}
                            {quote.eta ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><Clock3 className="size-3" />{quote.eta}</span> : null}
                          </div>
                          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{quote.summary}</p>
                        </button>
                      )
                    })}
                  </div>
                  {options.length > 3 ? (
                    <button type="button" className="flex w-full items-center justify-center gap-1.5 border-t px-4 py-2.5 text-xs font-semibold text-primary hover:bg-muted/20" onClick={() => setExpandedProviders((current) => ({ ...current, [provider]: !current[provider] }))}>
                      {expanded ? <><ChevronUp className="size-3.5" />Show fewer</> : <><ChevronDown className="size-3.5" />Show all {options.length} {provider === "velocity" ? "couriers" : "options"}</>}
                    </button>
                  ) : null}
                </section>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      {quotes.length && selected ? (
        <div className="sticky bottom-4 z-20 rounded-2xl border bg-background/95 p-3 shadow-2xl backdrop-blur sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10"><PartnerLogo partner={selected.provider} size="xs" showName={false} /></div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{selected.title}</p><p className="text-xs text-muted-foreground">Selected · {selected.eta || "Ready to book"}</p></div>
              <p className="ml-auto text-xl font-bold">{formatINR(selected.price)}</p>
            </div>
            {selected.provider === "velocity" ? <Input className="w-full sm:w-56" value={velocityWarehouseId} onChange={(event) => update("velocityWarehouseId", event.target.value)} placeholder="Velocity warehouse ID" /> : null}
            <Button size="lg" onClick={() => void placeRequest()} disabled={placing || !selected || (selected.provider === "velocity" && !velocityWarehouseId)}>
              {placing ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
              {placing ? "Placing request..." : "Book delivery"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
