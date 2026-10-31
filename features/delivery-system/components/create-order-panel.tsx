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
  previewDeliveryMarkup,
  type CourierWarehouse,
} from "@/features/delivery-system/lib/api"
import { type CourierOrderSummary } from "@/features/delivery-system/lib/data"
import { IndianStateSelect } from "@/features/delivery-system/components/indian-state-select"
import { LocalShadowfaxPanel } from "@/features/delivery-system/components/local-shadowfax-panel"
import api from "@/lib/axios"
import { formatINR } from "@/lib/currency"

type QuoteCard = {
  id: string
  title: string
  price: number
  eta: string
  summary: string
  vehicle: string
  partner?: "delhivery" | "shadowfax"
}

const readText = (value: unknown) => String(value ?? "").trim()

const warehousePin = (warehouse: CourierWarehouse | null) =>
  readText(warehouse?.pin || (warehouse as { pincode?: string } | null)?.pincode)

const warehouseAddress = (warehouse: CourierWarehouse | null) =>
  readText(
    warehouse?.address ||
      (warehouse as { address_line_1?: string } | null)?.address_line_1,
  )

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
  service: { id: string; title: string; badge: string; vehicleOptions: string[] }
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
  const originPin = warehousePin(warehouse)
  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId) || null

  const setField = (key: keyof typeof emptyForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const checkPrice = async () => {
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

      const next: QuoteCard[] = []
      const delhiveryCharge = Number(
        delhiveryEstimate.status === "fulfilled"
          ? delhiveryEstimate.value?.estimate?.estimated_charge || 0
          : 0,
      )
      const delhiveryMarkup = delhiveryCharge
        ? await previewDeliveryMarkup({
            partner_id: "delhivery",
            actual_price: delhiveryCharge,
            order_id: existingOrder?.id,
            order_number: existingOrder?.orderNumber,
          }).catch(() => null)
        : null
      const delhiveryPrice = Number(delhiveryCharge || 0)
      const delhiveryWallet = Number(delhiveryMarkup?.hiked_price || 0)
      const delhiveryServiceable =
        delhivery.status === "fulfilled" && Boolean(delhivery.value?.serviceability?.serviceable)
      next.push({
        id: "delhivery",
        title: "Delhivery",
        price: delhiveryPrice,
        eta: form.mode === "E" ? "Express" : "Surface",
        vehicle: service.id === "d2c" ? "Parcel Surface" : service.vehicleOptions[0],
        partner: "delhivery",
        summary: delhiveryCharge
          ? `Delhivery invoice API${delhiveryWallet && delhiveryWallet !== delhiveryPrice ? `. Wallet charge ${formatINR(delhiveryWallet)}` : ""}.`
          : delhiveryServiceable
            ? "Pincode is serviceable, but Delhivery did not return a charge."
            : "Delhivery did not confirm this pincode.",
      })

      const shadowfaxServiceable =
        shadowfax.status === "fulfilled" && Boolean(shadowfax.value?.serviceability?.serviceable)
      next.push({
        id: "shadowfax",
        title: "Shadowfax",
        price: 0,
        eta: "Not quoted",
        vehicle: service.vehicleOptions[0],
        partner: "shadowfax",
        summary: shadowfaxServiceable
          ? "Pincode is serviceable. Shadowfax does not return a shipping price before the order is booked."
          : "Shadowfax did not confirm this pincode.",
      })

      const vehicles = Array.isArray(estimateData?.vehicles) ? estimateData.vehicles : []
      vehicles.slice(0, 3).forEach((vehicle: { vehicle?: string; estimated_price?: number; eta?: string }) => {
        const name = readText(vehicle.vehicle)
        if (!name) return
        next.push({
          id: `vehicle:${name}`,
          title: name,
          price: Number(vehicle.estimated_price || 0),
          eta: readText(vehicle.eta) || durationText || "Scheduled",
          vehicle: name,
          summary: `${service.title} vehicle option`,
        })
      })

      setQuotes(next)
      setSelectedQuoteId(next[0]?.id || "")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Price check failed")
    } finally {
      setChecking(false)
    }
  }

  const placeRequest = async () => {
    if (!warehouse || !selectedQuote) return
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
      <Dialog open={warehousesReady && warehouses.length === 0}>
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
              {existingOrder ? `Request delivery for ${existingOrder.orderNumber}.` : "Create your order."} Pickup comes from your warehouse. Delhivery price is their invoice charge for the weight and box size below.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
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
            </div>
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
              <Button onClick={() => void checkPrice()} disabled={checking || !warehouse}>
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
                  <button
                    key={quote.id}
                    type="button"
                    onClick={() => setSelectedQuoteId(quote.id)}
                    className={`rounded-xl border p-4 text-left ${selectedQuoteId === quote.id ? "border-primary bg-primary/5" : "bg-card"}`}
                  >
                    <p className="font-semibold">{quote.title}</p>
                    <p className="mt-1 text-2xl font-semibold">{quote.price ? formatINR(quote.price) : "Price unavailable"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">ETA {quote.eta}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{quote.summary}</p>
                  </button>
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
    return <LocalShadowfaxPanel {...props} />
  }
  return <ParcelCreateOrderPanel {...props} />
}
