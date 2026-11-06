"use client"

import { useEffect, useMemo, useState, type ComponentProps } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createDelhiveryShipment,
  createManualCourierOrder,
  createShadowfaxShipment,
  fetchCourierWarehouses,
  fetchDelhiveryB2cServiceability,
  fetchDelhiveryShippingEstimate,
  fetchShadowfaxServiceability,
  type CourierWarehouse,
} from "@/features/delivery-system/lib/api"
import { type CourierOrderSummary } from "@/features/delivery-system/lib/data"
import { IndianStateSelect } from "@/features/delivery-system/components/indian-state-select"
import { LocalShadowfaxPanel } from "@/features/delivery-system/components/local-shadowfax-panel"
import api from "@/lib/axios"
import { formatINR } from "@/lib/currency"
import { useDeliveryAppConfig } from "@/features/delivery-system/lib/delivery-apps"
import { VehicleLogo } from "@/components/shared/vehicle-logo"
import { PartnerLogo } from "@/components/shared/partner-logo"

type PorterOption = {
  vehicle: string
  price: number
  slabKm: number
  rangeLabel: string
  capped: boolean
  summary: string
}

type QuoteCard = {
  id: string
  title: string
  price: number
  eta: string
  summary: string
  vehicle: string
  partner?: "delhivery" | "shadowfax" | "porter" | "platform"
  selectable?: boolean
  porterOptions?: PorterOption[]
}

const readText = (value: unknown) => String(value ?? "").trim()

const warehousePin = (warehouse: { pin?: string; pincode?: string } | null) =>
  readText(warehouse?.pin || warehouse?.pincode)

const warehouseAddress = (warehouse: { address?: string; address_line_1?: string } | null) =>
  readText(warehouse?.address || warehouse?.address_line_1)

const emptyForm = {
  name: "",
  phone: "",
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
}

function ParcelCreateOrderPanel({
  service,
  existingOrder,
  onPlaced,
  onCreateWarehouse,
}: {
  service: {
    id: string
    title: string
    badge: string
    vehicleOptions: string[]
    key?: string
    product?: "hyperlocal" | "quick_commerce"
    partners?: string[]
  }
  existingOrder?: CourierOrderSummary | null
  onPlaced: () => void
  onCreateWarehouse: () => void
}) {
  const [warehouses, setWarehouses] = useState<CourierWarehouse[]>([])
  const [warehousesReady, setWarehousesReady] = useState(false)
  const [warehouseId, setWarehouseId] = useState("")
  const [form, setForm] = useState(emptyForm)
  const [checking, setChecking] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [distanceText, setDistanceText] = useState("")
  const [durationText, setDurationText] = useState("")
  const [quotes, setQuotes] = useState<QuoteCard[]>([])
  const [selectedQuoteId, setSelectedQuoteId] = useState("")
  const { vehicles: allowedVehicleMap } = useDeliveryAppConfig()
  const allowedVehiclesFor = (partner: string) => {
    const serviceKey = service.key || service.id
    const list = allowedVehicleMap?.[serviceKey]?.[partner]
    return Array.isArray(list) ? list : undefined
  }

  useEffect(() => {
    let cancelled = false
    void fetchCourierWarehouses()
      .then((rows) => {
        if (cancelled) return
        setWarehouses(rows)
        setWarehouseId(rows[0]?.id || "")
      })
      .catch(() => {
        if (!cancelled) setWarehouses([])
      })
      .finally(() => {
        if (!cancelled) setWarehousesReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!existingOrder) return
    setForm({
      name: existingOrder.customerName || "",
      phone: existingOrder.customerPhone || "",
      address: existingOrder.address || "",
      city: existingOrder.city || "",
      state: existingOrder.state || "",
      pincode: existingOrder.pincode || "",
      itemName: existingOrder.items?.[0]?.productName || "Website order",
      quantity: String(existingOrder.itemsCount || 1),
      amount: String(existingOrder.total || ""),
      weight: "500",
      length: "10",
      breadth: "10",
      height: "10",
      payment: "Pre-paid",
      mode: "S",
      packageType: "box",
    })
  }, [existingOrder])

  const warehouse = useMemo(
    () => warehouses.find((entry) => entry.id === warehouseId) || warehouses[0] || null,
    [warehouseId, warehouses],
  )
  const isLocalDelivery = service.id === "local"
  const pickupSource = warehouse || (isLocalDelivery ? {
    id: "local-pickup",
    name: form.name || "Pickup",
    phone: form.phone,
    address: form.address,
    city: form.city,
    state: form.state,
    pin: form.pincode,
    provider: "manual" as const,
  } : null)
  const originPin = warehousePin(pickupSource) || (isLocalDelivery ? form.pincode : "")
  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId) || null

  const setField = (key: keyof typeof emptyForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const checkPrice = async () => {
    const warehouse = pickupSource
    if (!warehouse) return
    if (!form.pincode || !form.city || !form.state || !form.address || !form.name || !form.phone || !form.itemName) {
      toast.error("Fill the customer, address, and item before checking the price.")
      return
    }
    if (!originPin) {
      toast.error("The selected warehouse needs a pincode.")
      return
    }

    setChecking(true)
    setQuotes([])
    try {
      const [delhivery, delhiveryEstimate, shadowfax, bookingEstimate] = await Promise.allSettled([
        fetchDelhiveryB2cServiceability(form.pincode),
        fetchDelhiveryShippingEstimate({
          md: form.mode === "E" ? "E" : "S",
          cgm: form.weight || "500",
          o_pin: originPin,
          d_pin: form.pincode,
          ss: "Delivered",
          pt: form.payment === "COD" ? "COD" : "Pre-paid",
          l: form.length || "10",
          b: form.breadth || "10",
          h: form.height || "10",
          ipkg_type: form.packageType === "flyer" ? "flyer" : "box",
        }),
        fetchShadowfaxServiceability({
          pincodes: form.pincode,
          service: "customer_delivery",
          page: 1,
          count: 10,
        }),
        api.post("/delivery-bookings/estimate", {
          service_id: service.id,
          pickup: {
            name: warehouse.name,
            address_line_1: warehouseAddress(warehouse),
            city: warehouse.city,
            state: (warehouse as { state?: string }).state || form.state,
            pincode: originPin,
            formatted_address: [warehouseAddress(warehouse), warehouse.city, originPin].filter(Boolean).join(", "),
          },
          drop: {
            name: form.name,
            phone: form.phone,
            address_line_1: form.address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
          },
        }),
      ])

      const estimateData =
        bookingEstimate.status === "fulfilled" ? bookingEstimate.value?.data?.data : null
      setDistanceText(estimateData?.distance_text || "")
      setDurationText(estimateData?.duration_text || "")

      const applyAdjustment = async (partner: string, actual: number) => {
        try {
          const response = await api.post("/delivery-pricing/apply", {
            partner_id: partner,
            service_id: service.id,
            request_type: service.product === 'quick_commerce' ? 'quick-commerce' : service.product === 'hyperlocal' ? 'hyperlocal' : undefined,
            actual_price: actual,
          })
          const price = Number(response?.data?.data?.price)
          return Number.isFinite(price) ? price : actual
        } catch {
          return actual
        }
      }

      const next: QuoteCard[] = []
      const delhiveryCharge = Number(
        delhiveryEstimate.status === "fulfilled"
          ? delhiveryEstimate.value?.estimate?.estimated_charge || 0
          : 0,
      )
      const delhiveryPrice = await applyAdjustment("delhivery", delhiveryCharge)
      const delhiveryServiceable =
        delhivery.status === "fulfilled" && Boolean(delhivery.value?.serviceability?.serviceable)
      const delhiveryVehicles = (allowedVehiclesFor("delhivery") || []).map((name) => ({
        vehicle: name,
        price: delhiveryPrice,
        slabKm: 0,
        rangeLabel: formatINR(delhiveryPrice),
        capped: false,
        summary: "Delhivery courier charge for this weight and box size.",
      }))
      next.push({
        id: "delhivery",
        title: "Delhivery",
        price: delhiveryPrice,
        eta: form.mode === "E" ? "Express" : "Surface",
        vehicle: delhiveryVehicles[0]?.vehicle || (service.id === "d2c" ? "Parcel Surface" : service.vehicleOptions[0]),
        partner: "delhivery",
        porterOptions: delhiveryVehicles,
        summary: delhiveryCharge
          ? delhiveryPrice !== delhiveryCharge
            ? `Delhivery invoice ${formatINR(delhiveryCharge)}. Quoted ${formatINR(delhiveryPrice)} after pricing adjustment.`
            : "Delhivery invoice charge for this weight and box size."
          : delhiveryServiceable
            ? "Pincode is serviceable, but Delhivery did not return a charge."
            : "Delhivery did not confirm this pincode.",
      })

      const shadowfaxServiceable =
        shadowfax.status === "fulfilled" && Boolean(shadowfax.value?.serviceability?.serviceable)
      let shadowfaxFailure = ""
      const shadowfaxResponse = await api
        .post("/delivery-pricing/shadowfax-quote", {
          partner: "shadowfax",
          city: form.city,
          service_id: service.id,
          request_type: service.product === 'quick_commerce' ? 'quick-commerce' : service.product === 'hyperlocal' ? 'hyperlocal' : undefined,
          allowed_vehicles: allowedVehiclesFor("shadowfax"),
          distance_km: Number(estimateData?.distance_km || 0),
          pickup: {
            address_line_1: warehouseAddress(warehouse),
            city: warehouse.city,
            state: (warehouse as { state?: string }).state || form.state,
            pincode: originPin,
            formatted_address: [warehouseAddress(warehouse), warehouse.city, originPin, "India"].filter(Boolean).join(", "),
          },
          drop: {
            address_line_1: form.address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            formatted_address: [form.address, form.city, form.state, form.pincode, "India"].filter(Boolean).join(", "),
          },
        }, { timeout: 30000 })
        .catch((error) => {
          shadowfaxFailure = readText(error?.response?.data?.message || error?.message)
          return error?.response || null
        })
      const shadowfaxQuote = shadowfaxResponse?.data?.data
      const shadowfaxVehicles = Array.isArray(shadowfaxQuote?.vehicles) ? shadowfaxQuote.vehicles : []
      const shadowfaxOptions: PorterOption[] = shadowfaxVehicles
        .filter((vehicle: { available?: boolean; name?: string; added_on_zero?: boolean }) => vehicle.available && readText(vehicle.name) && !vehicle.added_on_zero)
        .map((vehicle: {
          name?: string
          price?: number
          sheet_price?: number
          slab_km?: number
          range_label?: string
          capped?: boolean
        }) => {
          const price = Number(vehicle.price || 0)
          const sheetPrice = Number(vehicle.sheet_price || price)
          const slabKm = Number(vehicle.slab_km || 0)
          const rangeLabel = readText(vehicle.range_label) || formatINR(price)
          const capped = Boolean(vehicle.capped)
          const summary = [
            shadowfaxQuote?.used_default ? `No sheet fare for ${form.city}. Using Delhi NCR rates.` : "",
            capped ? `Sheet maximum (${slabKm} km).` : `${readText(shadowfaxQuote?.matched_city) || form.city} Shadowfax rate.`,
            `Fare range ${rangeLabel}.`,
            price !== sheetPrice ? `Charged ${formatINR(price)} after adding the Set Pricing amount.` : `Charged ${formatINR(price)}.`,
            "The delivery request still goes to Shadowfax.",
          ].filter(Boolean).join(" ")
          return { vehicle: readText(vehicle.name), price, slabKm, rangeLabel, capped, summary }
        })
        .filter((option: PorterOption) => {
          const allowed = allowedVehiclesFor("shadowfax")
          return !allowed || allowed.some((name) => name.toLowerCase() === option.vehicle.toLowerCase())
        })
        .sort((left: PorterOption, right: PorterOption) => left.price - right.price)
      const addedOnZero = shadowfaxVehicles.find((vehicle: { added_on_zero?: boolean; price?: number }) => vehicle.added_on_zero)
      const shadowfaxDefault = shadowfaxOptions[0]
      const shadowfaxAddon = Number(addedOnZero?.price || 0)
      next.push({
        id: "shadowfax",
        title: "Shadowfax",
        price: shadowfaxDefault?.price || shadowfaxAddon,
        eta: shadowfaxDefault
          ? shadowfaxDefault.capped
            ? `Sheet maximum (${shadowfaxDefault.slabKm} km)`
            : `${shadowfaxDefault.slabKm} km slab`
          : shadowfaxAddon
            ? "Added on zero"
            : "Not quoted",
        vehicle: shadowfaxDefault?.vehicle || "",
        partner: "shadowfax",
        selectable: Boolean(shadowfaxDefault || shadowfaxAddon),
        porterOptions: shadowfaxOptions,
        summary: shadowfaxDefault?.summary
          || (shadowfaxAddon
            ? `Shadowfax did not return a price. ₹0 plus the Set Pricing amount is ${formatINR(shadowfaxAddon)}. The delivery request still goes to Shadowfax.`
            : "")
          || readText(shadowfaxQuote?.reason)
          || shadowfaxFailure
          || (shadowfaxServiceable
            ? "Pincode is serviceable. Add a Shadowfax fare in Set Pricing, or add rupees on top of zero."
            : "Shadowfax did not confirm this pincode."),
      })

      let porterFailure = ""
      const porterResponse = await api
        .post("/delivery-pricing/porter-quote", {
          city: form.city,
          service_id: service.id,
          request_type: service.product === 'quick_commerce' ? 'quick-commerce' : service.product === 'hyperlocal' ? 'hyperlocal' : undefined,
          allowed_vehicles: allowedVehiclesFor("porter"),
          distance_km: Number(estimateData?.distance_km || 0),
          pickup: {
            address_line_1: warehouseAddress(warehouse),
            city: warehouse.city,
            state: (warehouse as { state?: string }).state || form.state,
            pincode: originPin,
            formatted_address: [warehouseAddress(warehouse), warehouse.city, originPin, "India"].filter(Boolean).join(", "),
          },
          drop: {
            address_line_1: form.address,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
            formatted_address: [form.address, form.city, form.state, form.pincode, "India"].filter(Boolean).join(", "),
          },
        }, { timeout: 30000 })
        .catch((error) => {
          porterFailure = readText(error?.response?.data?.message || error?.message)
          return error?.response || null
        })
      const porterQuote = porterResponse?.data?.data
      const porterVehicles = Array.isArray(porterQuote?.vehicles) ? porterQuote.vehicles : []
      const porterOptions: PorterOption[] = porterVehicles
        .filter((vehicle: { available?: boolean; name?: string }) => vehicle.available && readText(vehicle.name))
        .map((vehicle: {
          name?: string
          price?: number
          sheet_price?: number
          slab_km?: number
          range_label?: string
          capped?: boolean
        }) => {
          const price = Number(vehicle.price || 0)
          const sheetPrice = Number(vehicle.sheet_price || price)
          const slabKm = Number(vehicle.slab_km || 0)
          const rangeLabel = readText(vehicle.range_label) || formatINR(price)
          const capped = Boolean(vehicle.capped)
          const summary = [
            porterQuote?.used_default ? `No sheet fare for ${form.city}. Using Delhi NCR rates.` : "",
            capped ? `Sheet maximum (${slabKm} km).` : `${readText(porterQuote?.matched_city) || form.city} Porter rate.`,
            `Fare range ${rangeLabel}.`,
            price !== sheetPrice ? `Charged ${formatINR(price)} after pricing adjustment.` : `Charged ${formatINR(price)}.`,
          ].filter(Boolean).join(" ")
          return {
            vehicle: readText(vehicle.name),
            price,
            slabKm,
            rangeLabel,
            capped,
            summary,
          }
        })
        .filter((option: PorterOption) => {
          const allowed = allowedVehiclesFor("porter")
          return !allowed || allowed.some((name) => name.toLowerCase() === option.vehicle.toLowerCase())
        })
        .sort((left: PorterOption, right: PorterOption) => left.price - right.price)
      const porterDefault = porterOptions[0]
      next.push({
        id: "porter",
        title: "Porter",
        price: porterDefault?.price || 0,
        eta: porterDefault
          ? porterDefault.capped
            ? `Sheet maximum (${porterDefault.slabKm} km)`
            : `${porterDefault.slabKm} km slab`
          : "Not quoted",
        vehicle: porterDefault?.vehicle || "",
        partner: "porter",
        selectable: Boolean(porterDefault),
        porterOptions,
        summary: porterDefault?.summary || readText(porterQuote?.reason) || porterFailure || "Porter pricing is unavailable for this request.",
      })

      const allowed = new Set(service.partners || [])
      const visible = service.partners
        ? next.filter((quote) => quote.partner && allowed.has(quote.partner))
        : next
      if (service.partners && !visible.length) {
        toast.error("No delivery app is enabled for this delivery type.")
      }
      setQuotes(visible)
      setSelectedQuoteId(visible.find((quote) => quote.selectable !== false)?.id || visible[0]?.id || "")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Price check failed")
    } finally {
      setChecking(false)
    }
  }

  const selectPorterVehicle = (quoteId: string, vehicleName: string) => {
    setQuotes((current) =>
      current.map((quote) => {
        if (quote.id !== quoteId) return quote
        const option = quote.porterOptions?.find((entry) => entry.vehicle === vehicleName)
        if (!option) return quote
        return {
          ...quote,
          vehicle: option.vehicle,
          price: option.price,
          eta: option.capped ? `Sheet maximum (${option.slabKm} km)` : `${option.slabKm} km slab`,
          summary: option.summary,
        }
      }),
    )
    setSelectedQuoteId(quoteId)
  }

  const placeRequest = async () => {
    const warehouse = pickupSource
    if (!warehouse || !selectedQuote) return
    if (selectedQuote.selectable === false || (selectedQuote.partner === "porter" && !selectedQuote.price)) {
      toast.error(selectedQuote.summary || "This delivery option cannot be requested.")
      return
    }
    setPlacing(true)
    try {
      let order = existingOrder || null
      if (!order) {
        const created = await createManualCourierOrder({
          customer: {
            name: form.name,
            phone: form.phone,
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
            payment_mode: "prepaid",
            total_amount: Number(form.amount || 0),
          },
        })
        order = created.order
      }
      if (!order) throw new Error("Order could not be created")

      let waybill = ""
      if (selectedQuote.partner === "delhivery") {
        const shipment = await createDelhiveryShipment(order, {
          price_quote: selectedQuote.price,
          actual_price_quote: selectedQuote.price,
          pickup_location: warehouse.name,
          payment_mode: form.payment === "COD" ? "COD" : "Prepaid",
          return_name: warehouse.name,
          return_phone: warehouse.phone || (warehouse as { contact?: string }).contact || "",
          return_add: warehouseAddress(warehouse),
          return_city: warehouse.city || "",
          return_state: readText((warehouse as { state?: string; return_state?: string }).state || (warehouse as { return_state?: string }).return_state),
          return_pin: originPin,
          return_country: "India",
        })
        waybill = readText(
          shipment?.shipment?.waybill ||
            shipment?.order?.delhivery?.waybill ||
            shipment?.order?.delhivery?.waybills?.[0]
        )
        if (!waybill) throw new Error("Delhivery did not return a waybill")
      }

      if (selectedQuote.partner === "shadowfax") {
        const shadowfaxWarehouse = warehouse.provider === "shadowfax"
        const shipment = await createShadowfaxShipment(order, {
          order_model: shadowfaxWarehouse ? "warehouse" : "marketplace",
          actual_weight: Number(form.weight || 500),
          volumetric_weight: Number(form.weight || 500),
          payment_mode: form.payment === "COD" ? "cod" : "prepaid",
          pickup_name: warehouse.name,
          pickup_contact: warehouse.phone || (warehouse as { contact?: string }).contact || "",
          pickup_address_line_1: warehouseAddress(warehouse),
          pickup_city: warehouse.city || "",
          pickup_state: readText((warehouse as { state?: string }).state || form.state),
          pickup_pincode: originPin,
          pickup_unique_code: readText((warehouse as { unique_code?: string }).unique_code),
          rts_name: warehouse.name,
          rts_contact: warehouse.phone || (warehouse as { contact?: string }).contact || "",
          rts_address_line_1: warehouseAddress(warehouse),
          rts_city: warehouse.city || "",
          rts_state: readText((warehouse as { state?: string }).state || form.state),
          rts_pincode: originPin,
          rts_unique_code: readText((warehouse as { unique_code?: string }).unique_code),
        })
        waybill = readText(
          shipment?.shipment?.tracking_number ||
            shipment?.shipment?.awb_number ||
            shipment?.order?.shadowfax?.tracking_number
        )
        if (!waybill) throw new Error(shipment?.message || "Shadowfax did not return a waybill")
      }

      const booking = await api.post("/delivery-bookings", {
        service_id: service.id,
        order_model: service.product || "",
        vehicle: selectedQuote.vehicle,
        partner: selectedQuote.partner,
        estimated_price: selectedQuote.price,
        external_id: waybill,
        waybill,
        source_order_id: order.id,
        vendor_name: warehouse.name,
        pickup: {
          name: warehouse.name,
          phone: warehouse.phone || (warehouse as { contact?: string }).contact || form.phone,
          address_line_1: warehouseAddress(warehouse),
          city: warehouse.city,
          state: (warehouse as { state?: string }).state || form.state,
          pincode: originPin,
          formatted_address: [warehouseAddress(warehouse), warehouse.city, originPin].filter(Boolean).join(", "),
        },
        drop: {
          name: form.name,
          phone: form.phone,
          address_line_1: form.address,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
        },
        item: {
          description: form.itemName,
          quantity: Number(form.quantity || 1),
          weight_kg: 1,
        },
      })

      if (!booking?.data?.success) {
        throw new Error(booking?.data?.message || "Delivery request was not saved")
      }
      toast.success("Delivery request placed. It is now in All Requests.")
      onPlaced()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Could not place the delivery request")
    } finally {
      setPlacing(false)
    }
  }

  return (
    <>
      <Dialog open={!isLocalDelivery && warehousesReady && warehouses.length === 0}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a warehouse first</DialogTitle>
            <DialogDescription>
              Create your order stays locked until at least one pickup warehouse exists. Add a warehouse, then come back to create the order and request delivery.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={onCreateWarehouse}>Create warehouse</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold text-primary">{service.badge}</p>
            <CardTitle>{service.title}</CardTitle>
            <CardDescription>
              {isLocalDelivery
                ? "Enter the customer details and check the price. A warehouse is not required for this delivery type."
                : existingOrder
                  ? `Request delivery for ${existingOrder.orderNumber}. Pickup comes from your warehouse.`
                  : "Create your order. Pickup comes from your warehouse."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {isLocalDelivery ? null : <div className="space-y-2 md:col-span-2">
              <Label>Warehouse</Label>
              <Select value={warehouse?.id || ""} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((entry) => (
                    <SelectItem key={`${entry.provider}-${entry.id}`} value={entry.id}>
                      {entry.name} · {warehousePin(entry) || "No pin"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>}
            {([
              ["name", "Customer name"],
              ["phone", "Phone"],
              ["address", "Address"],
              ["city", "City"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input value={form[key]} onChange={(event) => setField(key, event.target.value)} />
              </div>
            ))}
            <div className="space-y-2">
              <Label>State</Label>
              <IndianStateSelect value={form.state} onChange={(value) => setField("state", value)} />
            </div>
            {([
              ["pincode", "Pincode"],
              ["itemName", "Item"],
              ["quantity", "Quantity"],
              ["amount", "Order value"],
              ["weight", "Weight (grams)"],
              ["length", "Length (cm)"],
              ["breadth", "Breadth (cm)"],
              ["height", "Height (cm)"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Input value={form[key]} onChange={(event) => setField(key, event.target.value)} inputMode="decimal" />
              </div>
            ))}
            <div className="space-y-2">
              <Label>Payment</Label>
              <Select value={form.payment} onValueChange={(value) => setField("payment", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pre-paid">Prepaid</SelectItem>
                  <SelectItem value="COD">COD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Delhivery mode</Label>
              <Select value={form.mode} onValueChange={(value) => setField("mode", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="S">Surface</SelectItem>
                  <SelectItem value="E">Express</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Package type</Label>
              <Select value={form.packageType} onValueChange={(value) => setField("packageType", value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="flyer">Flyer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Button onClick={() => void checkPrice()} disabled={checking || !pickupSource}>
                {checking ? "Checking price..." : "Check price and route"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {quotes.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Price, distance, and timing</CardTitle>
              <CardDescription>
                {distanceText ? `${distanceText} · ${durationText || "Timing from the selected option"}` : "Route from the warehouse pincode to the customer pincode."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <iframe
                title="Delivery route"
                className="h-72 w-full rounded-md border"
                src={`https://maps.google.com/maps?saddr=${encodeURIComponent(originPin)}&daddr=${encodeURIComponent(form.pincode)}&output=embed`}
              />
              <div className="grid gap-3 md:grid-cols-2">
                {quotes.map((quote) => (
                  <div
                    key={quote.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (quote.selectable !== false) setSelectedQuoteId(quote.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && quote.selectable !== false) setSelectedQuoteId(quote.id)
                    }}
                    className={`rounded-xl border p-4 text-left ${quote.selectable === false ? "cursor-not-allowed opacity-80" : "cursor-pointer"} ${selectedQuoteId === quote.id ? "border-primary bg-primary/5" : "bg-card"}`}
                  >
                    <div className="flex items-center gap-2">
                      <PartnerLogo partner={quote.partner || quote.id} size="sm" showName={false} />
                      <p className="font-semibold">{quote.title}</p>
                    </div>
                    <p className="mt-1 text-2xl font-semibold">{quote.price ? formatINR(quote.price) : "Price unavailable"}</p>
                    {quote.eta === "Surface" || quote.eta === "Express" ? (
                      <p className="mt-1 text-sm text-muted-foreground">ETA {quote.eta}</p>
                    ) : null}
                    {quote.porterOptions?.length ? (
                      <div className="mt-3 space-y-2">
                        {quote.porterOptions.map((option) => (
                          <label
                            key={option.vehicle}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${quote.vehicle === option.vehicle ? "border-primary bg-background" : "bg-background"}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`${quote.id}-vehicle`}
                                checked={quote.vehicle === option.vehicle}
                                onChange={() => selectPorterVehicle(quote.id, option.vehicle)}
                              />
                              <VehicleLogo name={option.vehicle} />
                              <span className="font-medium">{option.vehicle}</span>
                            </span>
                            <span className="font-semibold">{formatINR(option.price)}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <Button onClick={() => void placeRequest()} disabled={placing || !selectedQuote}>
                {placing ? "Placing request..." : "Place delivery request"}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  )
}

export function CreateOrderPanel(
  props: ComponentProps<typeof ParcelCreateOrderPanel>
) {
  if (props.service.id === "local") {
    return <LocalShadowfaxPanel {...props} initialProduct={props.service.product} />
  }
  return <ParcelCreateOrderPanel {...props} />
}
