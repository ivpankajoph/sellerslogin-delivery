"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Flag, MapPin } from "lucide-react"
import { useNavigate } from "@/lib/router"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  checkHyperlocalServiceability,
  fetchDelhiveryShippingEstimate,
  geocodeDeliveryAddress,
  createManualCourierOrder,
  fetchShadowfaxWarehouses,
  placeHyperlocalOrder,
  placeQuickCommerceOrder,
  validateQuickCommerceOrder,
  type ShadowfaxWarehouse,
} from "@/features/delivery-system/lib/api"
import { IndianStateSelect } from "@/features/delivery-system/components/indian-state-select"
import { PartnerLogo } from "@/components/shared/partner-logo"
import { VehicleLogo } from "@/components/shared/vehicle-logo"
import { useDeliveryAppConfig } from "@/features/delivery-system/lib/delivery-apps"
import api from "@/lib/axios"
import { formatINR } from "@/lib/currency"
import { cn } from "@/lib/utils"
import type { CourierOrderSummary } from "@/features/delivery-system/lib/data"

type Product = "hyperlocal" | "quick_commerce"
type DeliveryPartner = "shadowfax" | "porter" | "delhivery"

type ItemDraft = {
  id: string
  name: string
  price: string
  quantity: string
  weight: string
  length: string
  breadth: string
  height: string
  hsn_code: string
  invoice_no: string
  sku_id: string
  category: string
  seller_name: string
  seller_address: string
  seller_state: string
  seller_gstin: string
  cgst: string
  sgst: string
  igst: string
  total_tax: string
  requires_extra_care: boolean
  type_extra_care: string
}

type CheckResult = {
  product: Product
  serviceable: boolean
  reason: string
  deliveryCost?: number
  pickupEta?: number
  dropEta?: number
  uniqueCode: string
  checkedAt: number
}

const readText = (value: unknown) => String(value ?? "").trim()

const createItemId = () =>
  `ITM${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`

const createOtp = () => String(Math.floor(1000 + Math.random() * 9000))

const numericDraft = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "")
  const [whole, ...fraction] = cleaned.split(".")
  return fraction.length ? `${whole}.${fraction.join("")}` : whole
}

const blankItem = (): ItemDraft => {
  const id = createItemId()
  return {
    id,
    name: "",
    price: "",
    quantity: "1",
    weight: "",
    length: "",
    breadth: "",
    height: "",
    hsn_code: "",
    invoice_no: `INV-${id.slice(-8)}`,
    sku_id: id,
    category: "General",
    seller_name: "",
    seller_address: "",
    seller_state: "",
    seller_gstin: "",
    cgst: "0",
    sgst: "0",
    igst: "0",
    total_tax: "0",
    requires_extra_care: false,
    type_extra_care: "",
  }
}

const emptyOptions = {
  client_code: "",
  client_order_id: "",
  customer_order_id: "",
  scheduled_time: "",
  promised_delivery_date: "",
  pickup_otp: "",
  return_otp: "",
  delivery_otp: "",
  rain_flag: false,
  allow_undelivered: false,
  rts: false,
  drop_instruction_text: "",
  take_drop_off_picture: false,
  drop_off_picture_mandatory: false,
  geofence_radius: "",
  has_tip: false,
  tip_amount: "",
  stage_of_check: "pre_order",
  client_surge: "",
  actual_weight: "",
  volumetric_weight: "",
  eway_bill: "",
  gstin_number: "",
  order_service: "regular",
  pickup_ready_time: "",
  assignment_time: "",
  transit_time: "",
  customer_promised_delivery_time: "",
  serviceability_id: "",
  alternate_contact: "",
  address_line_2: "",
  cod_amount: "",
  total_amount: "",
}

const emptyReturn = {
  name: "",
  contact: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  state: "",
  pincode: "",
  email: "",
  latitude: "",
  longitude: "",
  unique_code: "",
}

const createOptions = () => {
  const clientOrderId = `CO${Date.now().toString(36).toUpperCase()}`
  return {
    ...emptyOptions,
    client_order_id: clientOrderId,
    customer_order_id: clientOrderId,
    pickup_otp: createOtp(),
    return_otp: createOtp(),
    delivery_otp: createOtp(),
    actual_weight: "1",
    volumetric_weight: "1",
    cod_amount: "0",
    order_service: "regular",
    stage_of_check: "pre_order",
  }
}

const messageOf = (error: unknown) => {
  const body = (error as { response?: { data?: { message?: string } } })?.response?.data
  return body?.message || (error instanceof Error ? error.message : "Request failed")
}

const toIstStamp = (value: string) => {
  const next = readText(value)
  if (!next) return ""
  const [date, time = ""] = next.split("T")
  const clock = time.length === 5 ? `${time}:00` : time
  return `${date} ${clock}`.trim()
}

const toEpochSeconds = (value: string) => {
  const next = readText(value)
  if (!next) return undefined
  const ms = new Date(next).getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined
}

const toIso = (value: string) => {
  const next = readText(value)
  if (!next) return ""
  const date = new Date(next)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  readOnly?: boolean
}) {
  const numeric = type === "number"
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={numeric ? "text" : type}
        inputMode={numeric ? "decimal" : undefined}
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange(numeric ? numericDraft(event.target.value) : event.target.value)}
      />
    </div>
  )
}

function AddressSuggest({
  label,
  value,
  onText,
  onPlace,
}: {
  label: string
  value: string
  onText: (value: string) => void
  onPlace: (place: { description: string; city: string; state: string; pincode: string; latitude: string; longitude: string }) => void
}) {
  const [items, setItems] = useState<Array<{ placeId: string; description: string }>>([])
  const [open, setOpen] = useState(false)
  const picked = useRef("")

  useEffect(() => {
    const query = value.trim()
    if (query.length < 3 || query === picked.current) {
      setItems([])
      setOpen(false)
      return
    }
    const handle = window.setTimeout(() => {
      void api.post("/shadowfax/places/autocomplete", { input: query }).then((response) => {
        const predictions = Array.isArray(response?.data?.predictions) ? response.data.predictions : []
        setItems(predictions)
        setOpen(predictions.length > 0)
      }).catch(() => {
        setItems([])
        setOpen(false)
      })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [value])

  return (
    <div className="relative space-y-2 md:col-span-2">
      <Label>{label}</Label>
      <Input
        value={value}
        autoComplete="off"
        placeholder="Start typing a place or area"
        onChange={(event) => {
          picked.current = ""
          onText(event.target.value)
        }}
        onFocus={() => { if (items.length) setOpen(true) }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background shadow-md">
          {items.map((item) => (
            <button
              key={item.placeId}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                void api.post("/shadowfax/places/details", { placeId: item.placeId, description: item.description }).then((response) => {
                  const place = response?.data || {}
                  const description = String(place.description || item.description)
                  picked.current = description
                  onPlace({
                    description,
                    city: String(place.city || ""),
                    state: String(place.state || ""),
                    pincode: String(place.pincode || ""),
                    latitude: place.latitude == null ? "" : String(place.latitude),
                    longitude: place.longitude == null ? "" : String(place.longitude),
                  })
                  setOpen(false)
                }).catch(() => setOpen(false))
              }}
            >
              {item.description}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

function OptionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-md border p-3 md:col-span-2">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">{children}</div>
    </details>
  )
}

export function LocalShadowfaxPanel({
  service,
  existingOrder,
  onPlaced,
  onCreateWarehouse,
  initialProduct,
}: {
  service: { id: string; key?: string; title: string; vehicleOptions: string[]; partners?: string[] }
  existingOrder?: CourierOrderSummary | null
  onPlaced: () => void
  onCreateWarehouse: () => void
  initialProduct?: Product
}) {
  const [warehouses, setWarehouses] = useState<ShadowfaxWarehouse[]>([])
  const [warehousesReady, setWarehousesReady] = useState(false)
  const [warehouseId, setWarehouseId] = useState("")
  const [product, setProduct] = useState<Product>(initialProduct || "hyperlocal")
  const [pickupForm, setPickupForm] = useState({
    name: "",
    phone: "",
    address: "",
    address_line_2: "",
    city: "",
    state: "",
    pincode: "",
    unique_code: "",
  })
  const [vehicleChoices, setVehicleChoices] = useState<Array<{ partner: string; name: string; price: number; slabKm?: number }>>([])
  const [selectedChoice, setSelectedChoice] = useState<{ partner: string; name: string; price: number; slabKm?: number } | null>(null)
  const { vehicles: allowedVehicleMap } = useDeliveryAppConfig()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [state, setState] = useState("")
  const [pincode, setPincode] = useState("")
  const [latitude, setLatitude] = useState("")
  const [longitude, setLongitude] = useState("")
  const [pickupLatitude, setPickupLatitude] = useState("")
  const [pickupLongitude, setPickupLongitude] = useState("")
  const [locatingDrop, setLocatingDrop] = useState(false)
  const dropLookup = useRef(0)
  const dropEdited = useRef(false)
  const [paid, setPaid] = useState("true")
  const [amount, setAmount] = useState("")
  const [amountEdited, setAmountEdited] = useState(false)
  const [totalEdited, setTotalEdited] = useState(false)
  const [items, setItems] = useState<ItemDraft[]>([blankItem()])
  const [options, setOptions] = useState(createOptions)
  const [returnDetails, setReturnDetails] = useState(emptyReturn)
  const [checking, setChecking] = useState(false)
  const [routeInfo, setRouteInfo] = useState({ distanceText: "", durationText: "", distanceKm: 0 })
  const [priceOpen, setPriceOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [savedOrder, setSavedOrder] = useState<CourierOrderSummary | null>(existingOrder || null)
  const navigate = useNavigate()
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [placedSummary, setPlacedSummary] = useState("")

  useEffect(() => {
    let cancelled = false
    void fetchShadowfaxWarehouses()
      .then((res) => {
        if (cancelled) return
        const rows = res?.warehouses || []
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
    setName(existingOrder.customerName || "")
    setPhone(existingOrder.customerPhone || "")
    setAddress(existingOrder.address || "")
    setCity(existingOrder.city || "")
    setState(existingOrder.state || "")
    setPincode(existingOrder.pincode || "")
    if (existingOrder.total) {
      setAmount(String(existingOrder.total))
      setAmountEdited(true)
    }
    const first = existingOrder.items?.[0]
    if (first) {
      const generated = blankItem()
      setItems([
        {
          ...generated,
          name: first.productName || "",
          price: first.unitPrice ? String(first.unitPrice) : "",
          quantity: String(first.quantity || 1),
          id: first.productId || generated.id,
          sku_id: first.productId || generated.sku_id,
        },
      ])
    }
  }, [existingOrder])

  const warehouse = useMemo(
    () => warehouses.find((entry) => entry.id === warehouseId) || null,
    [warehouses, warehouseId]
  )

  const itemsValue = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      ),
    [items]
  )

  useEffect(() => {
    if (amountEdited || itemsValue <= 0) return
    setAmount(String(itemsValue))
  }, [amountEdited, itemsValue])

  useEffect(() => {
    if (!amount || totalEdited) return
    setOptions((current) => {
      const nextCod = paid === "false" ? amount : "0"
      if (current.total_amount === amount && current.cod_amount === nextCod) return current
      return { ...current, total_amount: amount, cod_amount: nextCod }
    })
  }, [amount, paid, totalEdited])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const apiOrigin = (() => {
        try {
          return new URL(process.env.NEXT_PUBLIC_API_URL || "").origin
        } catch {
          return ""
        }
      })()
      if (apiOrigin && event.origin !== apiOrigin) return
      const data = event.data as { type?: string; target?: string; latitude?: number; longitude?: number }
      if (data?.type !== "delivery-map-pick") return
      const lat = Number(data.latitude)
      const lng = Number(data.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      if (data.target === "pickup") {
        setPickupLatitude(String(lat))
        setPickupLongitude(String(lng))
      } else {
        dropEdited.current = true
        setLatitude(String(lat))
        setLongitude(String(lng))
      }
      setCheckResult(null)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const pickupLine = [pickupForm.address, pickupForm.city, pickupForm.state, pickupForm.pincode, "India"].map(readText).filter(Boolean).join(", ")
  const dropLine = [address, city, state, pincode, "India"].map(readText).filter(Boolean).join(", ")
  const routeMap = pickupLine.length > 12 && dropLine.length > 12
    ? `${String(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081/api").replace(/\/$/, "")}/v1/public/maps-directions?origin=${encodeURIComponent(pickupLine)}&destination=${encodeURIComponent(dropLine)}`
    : ""

  useEffect(() => {
    if (!routeMap) {
      setRouteInfo({ distanceText: "", durationText: "", distanceKm: 0 })
      return
    }
    const handle = window.setTimeout(() => {
      void api.post("/shadowfax/distance", {
        pickup: {
          address_line_1: pickupForm.address,
          city: pickupForm.city,
          state: pickupForm.state,
          pincode: pickupForm.pincode,
          latitude: pickupLatitude || undefined,
          longitude: pickupLongitude || undefined,
        },
        drop: {
          address_line_1: address,
          city,
          state,
          pincode,
          latitude: latitude || undefined,
          longitude: longitude || undefined,
        },
      }).then((response) => {
        setRouteInfo({
          distanceText: String(response?.data?.distanceText || ""),
          durationText: String(response?.data?.durationText || ""),
          distanceKm: Number(response?.data?.distanceKm || 0),
        })
      }).catch(() => setRouteInfo({ distanceText: "", durationText: "", distanceKm: 0 }))
    }, 700)
    return () => window.clearTimeout(handle)
  }, [routeMap, pickupForm.address, pickupForm.city, pickupForm.state, pickupForm.pincode, pickupLatitude, pickupLongitude, address, city, state, pincode, latitude, longitude])

  useEffect(() => {
    const query = [address, city, state, pincode].map(readText).filter(Boolean).join(", ")
    if (query.length < 5) return
    dropEdited.current = false
    const requestId = ++dropLookup.current
    setLocatingDrop(true)
    const handle = window.setTimeout(() => {
      void geocodeDeliveryAddress({
        address,
        address_line_1: address,
        city,
        state,
        pincode,
      })
        .then((result) => {
          if (requestId !== dropLookup.current || dropEdited.current) return
          if (!result?.latitude || !result?.longitude) return
          setLatitude(String(result.latitude))
          setLongitude(String(result.longitude))
        })
        .catch(() => undefined)
        .finally(() => {
          if (requestId === dropLookup.current) setLocatingDrop(false)
        })
    }, 700)
    return () => window.clearTimeout(handle)
  }, [address, city, state, pincode])

  useEffect(() => {
    if (!warehouse) return
    if (readText(warehouse.latitude) && readText(warehouse.longitude)) {
      setPickupLatitude("")
      setPickupLongitude("")
      return
    }
    const query = [warehouse.address_line_1, warehouse.city, warehouse.state, warehouse.pincode || warehouse.pin]
      .map(readText)
      .filter(Boolean)
      .join(", ")
    if (query.length < 5) return
    void geocodeDeliveryAddress({
      address: warehouse.address_line_1,
      address_line_1: warehouse.address_line_1,
      city: warehouse.city,
      state: warehouse.state,
      pincode: warehouse.pincode || warehouse.pin,
    })
      .then((result) => {
        if (!result?.latitude || !result?.longitude) return
        setPickupLatitude(String(result.latitude))
        setPickupLongitude(String(result.longitude))
      })
      .catch(() => undefined)
  }, [warehouse])

  useEffect(() => {
    if (!warehouse) return
    setReturnDetails((current) => {
      if (readText(current.address_line_1)) return current
      return {
        ...current,
        name: warehouse.name || "",
        contact: warehouse.contact || warehouse.phone || "",
        address_line_1: warehouse.address_line_1 || "",
        address_line_2: warehouse.address_line_2 || "",
        city: warehouse.city || "",
        state: warehouse.state || "",
        pincode: warehouse.pincode || warehouse.pin || "",
        latitude: warehouse.latitude || "",
        longitude: warehouse.longitude || "",
        unique_code: warehouse.unique_code || "",
      }
    })
    setItems((current) =>
      current.map((item) => ({
        ...item,
        seller_name: item.seller_name || warehouse.name || "",
        seller_address:
          item.seller_address ||
          [warehouse.address_line_1, warehouse.city, warehouse.pincode || warehouse.pin]
            .filter(Boolean)
            .join(", "),
        seller_state: item.seller_state || warehouse.state || "",
      }))
    )
  }, [warehouse])

  const setOption = (key: keyof typeof emptyOptions, value: string | boolean) => {
    setOptions((current) => ({ ...current, [key]: value }))
    setCheckResult(null)
  }

  const setItem = (index: number, patch: Partial<ItemDraft>) => {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
    setCheckResult(null)
  }

  const pickupAddress = [warehouse?.address_line_1, warehouse?.address_line_2].filter(Boolean).join(", ")

  const buildBodies = () => {
    const orderItems = items.map((item, index) => ({
      id: readText(item.id || item.sku_id) || `item-${index + 1}`,
      name: readText(item.name),
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 1),
      weight_grams: Number(item.weight || 0) || undefined,
      length_cm: Number(item.length || 0) || undefined,
      breadth_cm: Number(item.breadth || 0) || undefined,
      height_cm: Number(item.height || 0) || undefined,
      sku_name: readText(item.name),
      sku_id: readText(item.sku_id || item.id),
      hsn_code: readText(item.hsn_code),
      invoice_no: readText(item.invoice_no),
      category: readText(item.category),
      seller_details: {
        seller_name: readText(item.seller_name),
        seller_address: readText(item.seller_address),
        seller_state: readText(item.seller_state),
        gstin_number: readText(item.seller_gstin),
      },
      taxes: {
        cgst: item.cgst === "" ? undefined : Number(item.cgst),
        sgst: item.sgst === "" ? undefined : Number(item.sgst),
        igst: item.igst === "" ? undefined : Number(item.igst),
        total_tax: item.total_tax === "" ? undefined : Number(item.total_tax),
      },
      additional_details: {
        requires_extra_care: item.requires_extra_care,
        type_extra_care: readText(item.type_extra_care),
        quantity: Number(item.quantity || 1),
      },
    }))

    const pickup = {
      name: pickupForm.name || warehouse?.name || "",
      contact_number: pickupForm.phone || warehouse?.contact || warehouse?.phone || "",
      contact: pickupForm.phone || warehouse?.contact || warehouse?.phone || "",
      address: pickupForm.address || pickupAddress,
      address_line_1: pickupForm.address || warehouse?.address_line_1 || "",
      address_line_2: pickupForm.address_line_2 || warehouse?.address_line_2 || "",
      city: pickupForm.city || warehouse?.city || "",
      state: pickupForm.state || warehouse?.state || "",
      pincode: pickupForm.pincode || warehouse?.pincode || warehouse?.pin || "",
      latitude: pickupLatitude || warehouse?.latitude || "",
      longitude: pickupLongitude || warehouse?.longitude || "",
      unique_code: pickupForm.unique_code || warehouse?.unique_code || "",
    }

    const drop = {
      name,
      contact_number: phone,
      contact: phone,
      phone,
      address,
      address_line_1: address,
      address_line_2: addressLine2 || options.address_line_2,
      city,
      state,
      pincode,
      latitude: readText(latitude),
      longitude: readText(longitude),
      alternate_contact: options.alternate_contact,
      delivery_otp: options.delivery_otp,
      geofence_radius: options.geofence_radius,
    }

    const sharedOrder = {
      client_order_id: readText(options.client_order_id),
      order_value: Number(amount || 0),
      product_value: Number(amount || 0),
      total_amount: Number(options.total_amount || amount || 0),
      paid,
      payment_mode: paid === "false" ? "COD" : "Prepaid",
      cod_amount: options.cod_amount,
      scheduled_time: toIstStamp(options.scheduled_time),
      promised_delivery_date: toIso(options.promised_delivery_date),
      pickup_otp: options.pickup_otp,
      return_otp: options.return_otp,
      rain_flag: options.rain_flag,
      allow_undelivered: options.allow_undelivered,
      rts: options.rts,
      customer_order_id: options.customer_order_id,
      actual_weight: options.actual_weight === "" ? undefined : Number(options.actual_weight),
      volumetric_weight: options.volumetric_weight === "" ? undefined : Number(options.volumetric_weight),
      eway_bill: options.eway_bill,
      gstin_number: options.gstin_number,
      order_service: options.order_service || "regular",
      delivery_instruction: {
        drop_instruction_text: options.drop_instruction_text,
        take_drop_off_picture: options.take_drop_off_picture,
        drop_off_picture_mandatory: options.drop_off_picture_mandatory,
      },
      eta_details: {
        pickup_ready_time: toEpochSeconds(options.pickup_ready_time),
        assignment_time: toEpochSeconds(options.assignment_time),
        transit_time: options.transit_time === "" ? undefined : Number(options.transit_time),
        customer_promised_delivery_time: toEpochSeconds(options.customer_promised_delivery_time),
        serviceability_id: options.serviceability_id,
      },
    }

    return {
      client_code: options.client_code,
      has_tip: options.has_tip,
      tip_amount: options.tip_amount === "" ? undefined : Number(options.tip_amount),
      stage_of_check: options.stage_of_check,
      client_surge: options.client_surge === "" ? undefined : Number(options.client_surge),
      order_value: Number(amount || 0),
      paid,
      pickup_details: pickup,
      drop_details: drop,
      customer_details: drop,
      return_details: returnDetails,
      order_details: sharedOrder,
      order_items: orderItems,
      product_details: orderItems,
      items: orderItems,
    }
  }

  const showAppPrices = async () => {
    if (!readText(city) || !readText(pickupForm.city)) return toast.error("Pickup and drop city are required before checking the price")
    const serviceKey = service.key || (product === "hyperlocal" ? "hyperlocal" : "quick_commerce")
    const apps = (service.partners?.length ? service.partners : ["shadowfax", "porter"]) as DeliveryPartner[]
    const pickup = {
      address_line_1: pickupForm.address,
      city: pickupForm.city,
      state: pickupForm.state,
      pincode: pickupForm.pincode,
      latitude: pickupLatitude || undefined,
      longitude: pickupLongitude || undefined,
      formatted_address: [pickupForm.address, pickupForm.city, pickupForm.state, pickupForm.pincode].filter(Boolean).join(", "),
    }
    const drop = {
      address_line_1: address,
      city,
      state,
      pincode,
      latitude: latitude || undefined,
      longitude: longitude || undefined,
      formatted_address: [address, city, state, pincode].filter(Boolean).join(", "),
    }
    setChecking(true)
    try {
      const locate = async (point: typeof pickup) => {
        const found = await geocodeDeliveryAddress(point).catch(() => null)
        const latitude = Number(found?.latitude)
        const longitude = Number(found?.longitude)
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return point
        return { ...point, latitude, longitude }
      }
      const locatedPickup = await locate(pickup)
      const locatedDrop = await locate(drop)
      const distance = await api.post("/shadowfax/distance", { pickup: locatedPickup, drop: locatedDrop }).then((response) => response.data).catch(() => null)
      const straightKm = (() => {
        const fromLat = Number(locatedPickup.latitude)
        const fromLng = Number(locatedPickup.longitude)
        const toLat = Number(locatedDrop.latitude)
        const toLng = Number(locatedDrop.longitude)
        if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return 0
        const toRad = (value: number) => (value * Math.PI) / 180
        const dLat = toRad(toLat - fromLat)
        const dLng = toRad(toLng - fromLng)
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2
        return Math.max(0.5, 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a))) * 1.3)
      })()
      const distanceKm = Number(distance?.distanceKm || straightKm || 0)
      setRouteInfo({
        distanceText: String(distance?.distanceText || (distanceKm ? `${distanceKm.toFixed(1)} km` : "")),
        durationText: String(distance?.durationText || ""),
        distanceKm,
      })
      const groups = await Promise.all(apps.map(async (app) => {
        const saved = allowedVehicleMap?.[serviceKey]?.[app]
        const allowed = Array.isArray(saved) && saved.length ? saved : undefined
        if (app === "delhivery") {
          const estimate = await fetchDelhiveryShippingEstimate({
            md: "S",
            cgm: items[0]?.weight || options.actual_weight || "500",
            o_pin: pickupForm.pincode,
            d_pin: pincode,
            ss: "Delivered",
            pt: paid === "false" ? "COD" : "Pre-paid",
          }).catch(() => null)
          const price = Number(estimate?.estimate?.estimated_charge || 0)
          const names = allowed || ["Courier"]
          return names.map((name) => ({ partner: app, name, price }))
        }
        const response = await api.post(app === "porter" ? "/delivery-pricing/porter-quote" : "/delivery-pricing/shadowfax-quote", {
          partner: app,
          city: pickupForm.city || city,
          service_id: "local",
          request_type: product === "quick_commerce" ? "quick-commerce" : "hyperlocal",
          distance_km: distanceKm,
          allowed_vehicles: allowed,
          pickup: locatedPickup,
          drop: locatedDrop,
        }, { timeout: 30000 }).catch(() => null)
        const quoted = Array.isArray(response?.data?.data?.vehicles) ? response.data.data.vehicles : []
        return quoted
          .filter((vehicle: { available?: boolean; name?: string }) => vehicle.available && readText(vehicle.name))
          .filter((vehicle: { name?: string }) => !allowed || allowed.some((name) => name.toLowerCase() === readText(vehicle.name).toLowerCase()))
          .map((vehicle: { name?: string; price?: number; slab_km?: number }) => ({ partner: app, name: readText(vehicle.name), price: Number(vehicle.price || 0), slabKm: Number(vehicle.slab_km || 0) || undefined }))
      }))
      const choices = groups.flat()
      setVehicleChoices(choices)
      setSelectedChoice(null)
      if (choices.length) setPriceOpen(true)
      else toast.error(distanceKm > 0 ? "No fare slab matched this distance for the selected apps." : "Distance could not be calculated, so the vehicle fare was not found.")
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setChecking(false)
    }
  }

  const checkPrice = async () => {
    if (!readText(name) || !readText(phone) || !readText(address) || !readText(city)) {
      return toast.error("Customer name, phone, address, and city are required")
    }
    if (!warehouse) return toast.error("Select a Shadowfax warehouse")
    if (!amount || Number(amount) <= 0) return toast.error("Order value is required")
    if (!items.some((item) => readText(item.name) && Number(item.price) >= 0 && Number(item.quantity) > 0)) {
      return toast.error("Add at least one item with a name, price, and quantity")
    }
    if (product === "hyperlocal" && (!readText(warehouse.latitude) || !readText(warehouse.longitude))) {
      return toast.error("This warehouse needs latitude and longitude for hyperlocal delivery")
    }
    if (product === "quick_commerce" && !readText(warehouse.unique_code)) {
      return toast.error("This warehouse needs a Shadowfax unique code for quick commerce")
    }

    setChecking(true)
    try {
      const body = buildBodies()
      if (product === "hyperlocal") {
        const result = await checkHyperlocalServiceability(body)
        const serviceability = result?.serviceability || {}
        if (result?.drop?.latitude) setLatitude(String(result.drop.latitude))
        if (result?.drop?.longitude) setLongitude(String(result.drop.longitude))
        const baseDeliveryCost = Number(serviceability.delivery_cost || 0)
        let deliveryCost = baseDeliveryCost
        try {
          const applied = await api.post("/delivery-pricing/apply", {
            partner_id: "shadowfax",
            service_id: "local",
            request_type: "hyperlocal",
            actual_price: baseDeliveryCost,
          })
          const adjusted = Number(applied?.data?.data?.price)
          if (Number.isFinite(adjusted)) deliveryCost = adjusted
        } catch {
          deliveryCost = baseDeliveryCost
        }
        setCheckResult({
          product,
          serviceable: Boolean(serviceability.serviceable),
          reason: readText(serviceability.reason),
          deliveryCost: deliveryCost || undefined,
          pickupEta: serviceability.pickup_eta,
          dropEta: serviceability.drop_eta,
          uniqueCode: "",
          checkedAt: Date.now(),
        })
        if (!serviceability.serviceable) {
          toast.error(serviceability.reason || "Shadowfax cannot serve this route")
        }
      } else {
        const result = await validateQuickCommerceOrder(body)
        if (result?.drop?.latitude) setLatitude(String(result.drop.latitude))
        if (result?.drop?.longitude) setLongitude(String(result.drop.longitude))
        setCheckResult({
          product,
          serviceable: true,
          reason: "",
          uniqueCode: readText(result?.unique_code || warehouse.unique_code),
          checkedAt: Date.now(),
        })
      }
    } catch (error) {
      setCheckResult(null)
      toast.error(messageOf(error))
    } finally {
      setChecking(false)
    }
  }

  const saveOrder = async () => {
    if (!readText(name) || !readText(phone) || !readText(address) || !readText(city) || !readText(state) || !readText(pincode)) {
      return toast.error("Fill the customer name, phone, address, city, state, and pincode before saving")
    }
    if (!amount || Number(amount) <= 0) return toast.error("Order value is required")
    if (!items.some((item) => readText(item.name) && Number(item.price) >= 0 && Number(item.quantity) > 0)) {
      return toast.error("Add at least one item with a name, price, and quantity")
    }
    if (existingOrder?.id || savedOrder?.id) {
      toast.success("This order is already saved")
      void navigate({ to: "/delivery-system?view=manual-orders" })
      return
    }

    setSaving(true)
    try {
      const created = await createManualCourierOrder({
        customer: {
          name,
          phone,
          address_line_1: address,
          address_line_2: options.address_line_2,
          city,
          state,
          pincode,
          country: "India",
        },
        item: {
          name: items[0]?.name || "Item",
          quantity: Number(items[0]?.quantity || 1),
          unit_price: Number(items[0]?.price || amount || 0),
          sku: items[0]?.sku_id || items[0]?.id,
          hsn_code: items[0]?.hsn_code,
          category: items[0]?.category,
        },
        shipment: {
          payment_mode: paid === "false" ? "cod" : "prepaid",
          total_amount: Number(options.total_amount || amount || 0),
        },
      })
      if (!created.order?.id) throw new Error("Order could not be saved")
      setSavedOrder(created.order)
      window.dispatchEvent(new CustomEvent("delivery-workspace-refresh"))
      toast.success("Order saved. Request delivery from Manual order whenever you are ready.")
      void navigate({ to: "/delivery-system?view=manual-orders" })
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const placeRequest = async () => {
    if (!warehouse || !checkResult) return
    if (product === "hyperlocal") {
      if (!checkResult.serviceable) return toast.error("Check a serviceable route before placing the order")
      if (Date.now() - checkResult.checkedAt > 2 * 60 * 1000) {
        return toast.error("Serviceability expired. Check the route again, then place the order.")
      }
    }

    setPlacing(true)
    try {
      let order = existingOrder || savedOrder || null
      if (!order) {
        const created = await createManualCourierOrder({
          customer: {
            name,
            phone,
            address_line_1: address,
            address_line_2: options.address_line_2,
            city,
            state,
            pincode,
            country: "India",
          },
          item: {
            name: items[0]?.name || "Item",
            quantity: Number(items[0]?.quantity || 1),
            unit_price: Number(items[0]?.price || amount || 0),
            sku: items[0]?.sku_id || items[0]?.id,
            hsn_code: items[0]?.hsn_code,
            category: items[0]?.category,
          },
          shipment: {
            payment_mode: paid === "false" ? "cod" : "prepaid",
            total_amount: Number(options.total_amount || amount || 0),
          },
        })
        order = created.order
      }
      if (!order?.id) throw new Error("Order could not be created")

      const body = { ...buildBodies(), order_id: order.id }
      const placed =
        product === "hyperlocal" ? await placeHyperlocalOrder(body) : await placeQuickCommerceOrder(body)
      const summary = placed?.summary || {}
      const externalId = readText(summary.sfx_order_id || summary.awb_number || summary.external_id)
      const trackUrl = readText(summary.track_url)
      if (!externalId) throw new Error("Shadowfax did not return a delivery id")

      const booking = await api.post("/delivery-bookings", {
        service_id: service.id,
        vehicle: "Bike",
        vendor_name: warehouse.name,
        partner: "shadowfax",
        order_model: product,
        external_id: externalId,
        tracking_url: trackUrl,
        estimated_price: Number(checkResult.deliveryCost || summary.delivery_cost || 0),
        duration_text: checkResult.dropEta ? `${checkResult.dropEta} min` : "",
        pickup: {
          name: warehouse.name,
          phone: warehouse.contact || warehouse.phone || phone,
          address_line_1: warehouse.address_line_1,
          address_line_2: warehouse.address_line_2,
          city: warehouse.city,
          state: warehouse.state,
          pincode: warehouse.pincode || warehouse.pin,
          latitude: Number(warehouse.latitude || 0) || undefined,
          longitude: Number(warehouse.longitude || 0) || undefined,
        },
        drop: {
          name,
          phone,
          address_line_1: address,
          address_line_2: options.address_line_2,
          city,
          state,
          pincode,
          latitude: Number(latitude || 0) || undefined,
          longitude: Number(longitude || 0) || undefined,
        },
        item: {
          description: items.map((item) => item.name).filter(Boolean).join(", "),
          quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 1,
          weight_kg: Number(options.actual_weight || 1) || 1,
        },
      })
      if (!booking?.data?.success) {
        setPlacedSummary(`${externalId}${trackUrl ? ` · ${trackUrl}` : ""}`)
        throw new Error(booking?.data?.message || "Shadowfax accepted the order, but the dashboard request was not saved")
      }

      const label = product === "hyperlocal" ? "Hyperlocal order" : "Quick commerce order"
      toast.success(`${label} ${externalId} sent to Shadowfax${trackUrl ? `. Track: ${trackUrl}` : ""}`)
      onPlaced()
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setPlacing(false)
    }
  }

  const placeSelected = async () => {
    if (!selectedChoice) return toast.error("Select a vehicle before placing the order")
    if (!readText(name) || !readText(phone) || !readText(address) || !readText(city) || !readText(state) || !readText(pincode)) {
      return toast.error("Fill the drop name, phone, address, city, state, and pincode")
    }
    if (!readText(pickupForm.name) || !readText(pickupForm.phone) || !readText(pickupForm.address) || !readText(pickupForm.city)) {
      return toast.error("Fill the pickup name, phone, address, and city")
    }

    setPlacing(true)
    try {
      let order = existingOrder || savedOrder || null
      if (!order) {
        try {
          const created = await createManualCourierOrder({
            customer: {
              name,
              phone,
              address_line_1: address,
              address_line_2: addressLine2 || options.address_line_2,
              city,
              state,
              pincode,
              country: "India",
            },
            item: {
              name: items[0]?.name || "Item",
              quantity: Number(items[0]?.quantity || 1),
              unit_price: Number(items[0]?.price || amount || 0),
              sku: items[0]?.sku_id || items[0]?.id,
              hsn_code: items[0]?.hsn_code,
              category: items[0]?.category,
            },
            shipment: {
              payment_mode: paid === "false" ? "cod" : "prepaid",
              total_amount: Number(options.total_amount || amount || 0),
            },
          })
          order = created.order
          if (order) setSavedOrder(order)
        } catch {
          order = null
        }
      }

      let externalId = ""
      let trackUrl = ""
      if (selectedChoice.partner === "shadowfax" && warehouse) {
        try {
          const body = { ...buildBodies(), order_id: order?.id }
          const placed = product === "hyperlocal" ? await placeHyperlocalOrder(body) : await placeQuickCommerceOrder(body)
          const summary = placed?.summary || {}
          externalId = readText(summary.sfx_order_id || summary.awb_number || summary.external_id)
          trackUrl = readText(summary.track_url)
        } catch {
          externalId = ""
        }
      }

      const booking = await api.post("/delivery-bookings", {
        service_id: service.id || "local",
        vehicle: selectedChoice.name,
        vendor_name: pickupForm.name || warehouse?.name,
        partner: selectedChoice.partner,
        order_model: product,
        external_id: externalId,
        tracking_url: trackUrl,
        estimated_price: selectedChoice.price,
        duration_text: routeInfo.durationText,
        distance_km: routeInfo.distanceKm,
        source_order_id: order?.id || "",
        pickup: {
          name: pickupForm.name,
          phone: pickupForm.phone,
          address_line_1: pickupForm.address,
          address_line_2: pickupForm.address_line_2,
          city: pickupForm.city,
          state: pickupForm.state,
          pincode: pickupForm.pincode,
        },
        drop: {
          name,
          phone,
          address_line_1: address,
          address_line_2: addressLine2,
          city,
          state,
          pincode,
        },
        item: {
          description: items.map((item) => item.name).filter(Boolean).join(", ") || "Item",
          quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 1,
          weight_kg: Math.max(0.1, Number(items[0]?.weight || 0) / 1000),
        },
      })
      if (!booking?.data?.success) throw new Error(booking?.data?.message || "Delivery request was not saved")

      const partnerName = selectedChoice.partner === "porter" ? "Porter" : selectedChoice.partner === "delhivery" ? "Delhivery" : "Shadowfax"
      toast.success(`${partnerName} ${selectedChoice.name} request saved. It is in All Requests for you and the admin.`)
      setPriceOpen(false)
      onPlaced()
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setPlacing(false)
    }
  }

  const mapQuery = [latitude && longitude ? `${latitude},${longitude}` : pincode, warehouse?.latitude && warehouse?.longitude ? `${warehouse.latitude},${warehouse.longitude}` : warehouse?.pincode]
    .filter(Boolean)
    .join("|")

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <p className="text-sm font-semibold text-primary">{service.title}</p>
              <CardTitle>{existingOrder ? `Request ${service.title}` : `Create ${service.title}`}</CardTitle>
              <CardDescription>
                Pickup, customer, and item details are the same for Hyperlocal and Quick Commerce. Check price at the end.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => void saveOrder()} disabled={saving}>
              {saving ? "Saving..." : "Save order"}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {initialProduct ? null : (
            <div className="flex gap-2 md:col-span-2">
              <Button type="button" variant={product === "hyperlocal" ? "default" : "outline"} onClick={() => { setProduct("hyperlocal"); setCheckResult(null) }}>
                Hyperlocal
              </Button>
              <Button type="button" variant={product === "quick_commerce" ? "default" : "outline"} onClick={() => { setProduct("quick_commerce"); setCheckResult(null) }}>
                Quick Commerce
              </Button>
            </div>
            )}

            <div className="space-y-3 rounded-md border p-3 md:col-span-2">
              <p className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4 text-primary" /> Pickup</p>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Name" value={pickupForm.name} onChange={(value) => setPickupForm((current) => ({ ...current, name: value }))} />
                <TextField label="Phone" value={pickupForm.phone} onChange={(value) => setPickupForm((current) => ({ ...current, phone: value }))} />
                <AddressSuggest
                  label="Address line 1"
                  value={pickupForm.address}
                  onText={(value) => {
                    setPickupLatitude("")
                    setPickupLongitude("")
                    setPickupForm((current) => ({ ...current, address: value }))
                  }}
                  onPlace={(place) => {
                    setPickupLatitude(place.latitude)
                    setPickupLongitude(place.longitude)
                    setPickupForm((current) => ({
                      ...current,
                      address: place.description,
                      city: place.city || current.city,
                      state: place.state || current.state,
                      pincode: place.pincode || current.pincode,
                    }))
                  }}
                />
                <div className="md:col-span-2">
                  <TextField label="Address line 2 (flat, house no.)" value={pickupForm.address_line_2} onChange={(value) => setPickupForm((current) => ({ ...current, address_line_2: value }))} />
                </div>
                <TextField label="City" value={pickupForm.city} onChange={(value) => setPickupForm((current) => ({ ...current, city: value }))} />
                <div className="space-y-2">
                  <Label>State</Label>
                  <IndianStateSelect value={pickupForm.state} onChange={(value) => setPickupForm((current) => ({ ...current, state: value }))} />
                </div>
                <TextField label="Pincode" value={pickupForm.pincode} onChange={(value) => setPickupForm((current) => ({ ...current, pincode: value }))} />
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3 md:col-span-2">
              <p className="flex items-center gap-2 text-sm font-semibold"><Flag className="size-4" /> Drop</p>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Name" value={name} onChange={(value) => { setName(value); setCheckResult(null) }} />
                <TextField label="Phone" value={phone} onChange={(value) => { setPhone(value); setCheckResult(null) }} />
                <AddressSuggest
                  label="Address line 1"
                  value={address}
                  onText={(value) => {
                    setLatitude("")
                    setLongitude("")
                    setAddress(value)
                    setCheckResult(null)
                  }}
                  onPlace={(place) => {
                    setLatitude(place.latitude)
                    setLongitude(place.longitude)
                    setAddress(place.description)
                    if (place.city) setCity(place.city)
                    if (place.state) setState(place.state)
                    if (place.pincode) setPincode(place.pincode)
                    setCheckResult(null)
                  }}
                />
                <div className="md:col-span-2">
                  <TextField label="Address line 2 (flat, house no.)" value={addressLine2} onChange={setAddressLine2} />
                </div>
                <TextField label="City" value={city} onChange={(value) => { setCity(value); setCheckResult(null) }} />
                <div className="space-y-2">
                  <Label>State</Label>
                  <IndianStateSelect value={state} onChange={(value) => { setState(value); setCheckResult(null) }} />
                </div>
                <TextField label="Pincode" value={pincode} onChange={(value) => { setPincode(value); setCheckResult(null) }} />
              </div>
            </div>
            {routeMap ? (
              <div className="space-y-2 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Pickup to drop</p>
                  <p className="text-sm text-muted-foreground">
                    {routeInfo.distanceText
                      ? `${routeInfo.distanceText}${routeInfo.durationText ? ` · ${routeInfo.durationText}` : ""}`
                      : "Calculating distance..."}
                  </p>
                </div>
                <iframe
                  title="Pickup to drop"
                  className="h-72 w-full rounded-md border"
                  src={routeMap}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Payment</Label>
              <Select value={paid} onValueChange={(value) => { setPaid(value); setCheckResult(null) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Prepaid</SelectItem>
                  <SelectItem value="false">COD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TextField label="Order value" value={amount} onChange={(value) => { setAmountEdited(true); setAmount(value); setCheckResult(null) }} type="number" />
            <TextField label="Total amount" value={options.total_amount} onChange={(value) => { setTotalEdited(true); setOption("total_amount", value) }} type="number" />
            <TextField label="COD amount" value={options.cod_amount} onChange={(value) => { setTotalEdited(true); setOption("cod_amount", value) }} type="number" />

            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, blankItem()])}>
                  Add item
                </Button>
              </div>
              {items.map((item, index) => (
                <div key={item.id || index} className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
                  <p className="text-sm text-muted-foreground md:col-span-3">Item id {item.id}</p>
                  <TextField label="Name" value={item.name} onChange={(value) => setItem(index, { name: value })} />
                  <TextField label="Price" value={item.price} onChange={(value) => setItem(index, { price: value })} type="number" />
                  <TextField label="Quantity" value={item.quantity} onChange={(value) => setItem(index, { quantity: value })} type="number" />
                  <TextField label="Weight (grams)" value={item.weight} onChange={(value) => setItem(index, { weight: value })} type="number" />
                  <TextField label="Length (cm)" value={item.length} onChange={(value) => setItem(index, { length: value })} type="number" />
                  <TextField label="Breadth (cm)" value={item.breadth} onChange={(value) => setItem(index, { breadth: value })} type="number" />
                  <TextField label="Height (cm)" value={item.height} onChange={(value) => setItem(index, { height: value })} type="number" />
                  {items.length > 1 ? (
                    <div className="md:col-span-3">
                      <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        Remove item
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <OptionGroup title="Delivery options">
              <TextField label="Client order id" value={options.client_order_id} onChange={() => undefined} readOnly />
              <TextField label="Customer order id" value={options.customer_order_id} onChange={() => undefined} readOnly />
              <TextField label="Scheduled time (IST)" value={options.scheduled_time} onChange={(value) => setOption("scheduled_time", value)} type="datetime-local" />
              <TextField label="Promised delivery" value={options.promised_delivery_date} onChange={(value) => setOption("promised_delivery_date", value)} type="datetime-local" />
              <div className="space-y-2">
                <Label>Serviceability stage</Label>
                <Select value={options.stage_of_check} onValueChange={(value) => setOption("stage_of_check", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_order">Pre order</SelectItem>
                    <SelectItem value="post_order">Post order</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <TextField label="Client surge" value={options.client_surge} onChange={(value) => setOption("client_surge", value)} type="number" />
              <TextField label="Geofence radius (meters)" value={options.geofence_radius} onChange={(value) => setOption("geofence_radius", value)} type="number" />
              <CheckField label="Rain flag" checked={options.rain_flag} onChange={(value) => setOption("rain_flag", value)} />
              <CheckField label="Allow undelivered" checked={options.allow_undelivered} onChange={(value) => setOption("allow_undelivered", value)} />
              <CheckField label="Eligible for return to seller" checked={options.rts} onChange={(value) => setOption("rts", value)} />
              <CheckField label="Add rider tip" checked={options.has_tip} onChange={(value) => setOption("has_tip", value)} />
              <TextField label="Tip amount" value={options.tip_amount} onChange={(value) => setOption("tip_amount", value)} type="number" />
              <TextField label="Actual weight" value={options.actual_weight} onChange={(value) => setOption("actual_weight", value)} type="number" />
              <TextField label="Volumetric weight" value={options.volumetric_weight} onChange={(value) => setOption("volumetric_weight", value)} type="number" />
              <TextField label="Order service" value={options.order_service} onChange={(value) => setOption("order_service", value)} />
              <TextField label="E-way bill" value={options.eway_bill} onChange={(value) => setOption("eway_bill", value)} />
              <TextField label="GSTIN" value={options.gstin_number} onChange={(value) => setOption("gstin_number", value)} />
            </OptionGroup>

            <OptionGroup title="OTPs">
              <TextField label="Pickup OTP" value={options.pickup_otp} onChange={() => undefined} readOnly />
              <TextField label="Return OTP" value={options.return_otp} onChange={() => undefined} readOnly />
              <TextField label="Delivery OTP" value={options.delivery_otp} onChange={() => undefined} readOnly />
            </OptionGroup>

            <OptionGroup title="Instructions">
              <div className="space-y-2 md:col-span-2">
                <Label>Drop instruction</Label>
                <Textarea value={options.drop_instruction_text} onChange={(event) => setOption("drop_instruction_text", event.target.value)} />
              </div>
              <CheckField label="Take drop-off picture" checked={options.take_drop_off_picture} onChange={(value) => setOption("take_drop_off_picture", value)} />
              <CheckField label="Drop-off picture mandatory" checked={options.drop_off_picture_mandatory} onChange={(value) => setOption("drop_off_picture_mandatory", value)} />
            </OptionGroup>

            <OptionGroup title="Quick commerce timing">
              <TextField label="Pickup ready time" value={options.pickup_ready_time} onChange={(value) => setOption("pickup_ready_time", value)} type="datetime-local" />
              <TextField label="Assignment time" value={options.assignment_time} onChange={(value) => setOption("assignment_time", value)} type="datetime-local" />
              <TextField label="Transit time (milliseconds)" value={options.transit_time} onChange={(value) => setOption("transit_time", value)} type="number" />
              <TextField label="Customer promised delivery" value={options.customer_promised_delivery_time} onChange={(value) => setOption("customer_promised_delivery_time", value)} type="datetime-local" />
              <TextField label="Serviceability id" value={options.serviceability_id} onChange={(value) => setOption("serviceability_id", value)} />
            </OptionGroup>

            <OptionGroup title="Return details">
              <TextField label="Return name" value={returnDetails.name} onChange={(value) => setReturnDetails((current) => ({ ...current, name: value }))} />
              <TextField label="Return contact" value={returnDetails.contact} onChange={(value) => setReturnDetails((current) => ({ ...current, contact: value }))} />
              <TextField label="Return address line 1" value={returnDetails.address_line_1} onChange={(value) => setReturnDetails((current) => ({ ...current, address_line_1: value }))} />
              <TextField label="Return address line 2" value={returnDetails.address_line_2} onChange={(value) => setReturnDetails((current) => ({ ...current, address_line_2: value }))} />
              <TextField label="Return city" value={returnDetails.city} onChange={(value) => setReturnDetails((current) => ({ ...current, city: value }))} />
              <div className="space-y-2">
                <Label>Return state</Label>
                <IndianStateSelect value={returnDetails.state} onChange={(value) => setReturnDetails((current) => ({ ...current, state: value }))} />
              </div>
              <TextField label="Return pincode" value={returnDetails.pincode} onChange={(value) => setReturnDetails((current) => ({ ...current, pincode: value }))} />
              <TextField label="Return email" value={returnDetails.email} onChange={(value) => setReturnDetails((current) => ({ ...current, email: value }))} />
              <TextField label="Return unique code" value={returnDetails.unique_code} onChange={(value) => setReturnDetails((current) => ({ ...current, unique_code: value }))} readOnly />
            </OptionGroup>

            <div className="md:col-span-2">
              <Button type="button" onClick={() => void showAppPrices()} disabled={checking}>
                {checking ? "Checking price..." : "Check price"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
          <DialogContent className="flex max-h-[calc(100vh-1.5rem)] w-[min(1280px,calc(100%-1rem))] max-w-none flex-col gap-0 overflow-y-auto p-0 sm:max-w-none">
            <div className="grid shrink-0 grid-cols-1 border-b md:grid-cols-[minmax(0,1fr)_340px]">
              <div className="h-full min-h-[460px] bg-muted">
                {routeMap ? (
                  <iframe title="Pickup to drop" className="h-full min-h-[460px] w-full" src={routeMap} referrerPolicy="no-referrer-when-downgrade" />
                ) : null}
              </div>
              <div className="flex flex-col gap-2 border-l p-3">
                <Card className="gap-0 py-2 shadow-none">
                  <CardHeader className="gap-0.5 px-3">
                    <CardDescription>Distance</CardDescription>
                    <CardTitle className="text-xl">{routeInfo.distanceText || "—"}</CardTitle>
                    <CardDescription>{routeInfo.durationText || "Pickup to drop"}</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="gap-0 py-2 shadow-none">
                  <CardHeader className="gap-0.5 px-3">
                    <CardDescription className="flex items-center gap-1.5"><MapPin className="size-3.5 text-primary" /> Pickup</CardDescription>
                    <CardTitle className="text-sm leading-5">{[pickupForm.address, pickupForm.city, pickupForm.state, pickupForm.pincode].filter(Boolean).join(", ") || "—"}</CardTitle>
                    <CardDescription>{[pickupForm.name, pickupForm.phone].filter(Boolean).join(" · ")}</CardDescription>
                  </CardHeader>
                </Card>
                <Card className="gap-0 py-2 shadow-none">
                  <CardHeader className="gap-0.5 px-3">
                    <CardDescription className="flex items-center gap-1.5"><Flag className="size-3.5" /> Drop</CardDescription>
                    <CardTitle className="text-sm leading-5">{[address, city, state, pincode].filter(Boolean).join(", ") || "—"}</CardTitle>
                    <CardDescription>{[name, phone].filter(Boolean).join(" · ")}</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>
            <div className="grid shrink-0 gap-4 p-4 lg:grid-cols-2">
                {["delhivery", "shadowfax", "porter"].filter((app) => vehicleChoices.some((choice) => choice.partner === app)).map((app) => (
                  <Card key={app} className="gap-4 py-4">
                    <CardHeader className="px-4">
                      <PartnerLogo partner={app} size="lg" className="gap-3" imgClassName="h-14 w-48 bg-transparent object-cover object-center" textClassName="text-xl font-semibold" />
                    </CardHeader>
                    <CardContent className="px-4">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {vehicleChoices.filter((choice) => choice.partner === app).map((choice) => {
                          const selected = selectedChoice?.partner === choice.partner && selectedChoice.name === choice.name
                          return (
                            <Button
                              key={`${app}-${choice.name}`}
                              type="button"
                              variant={selected ? "default" : "outline"}
                              className="h-auto flex-col gap-1.5 px-2 py-3 whitespace-normal"
                              onClick={() => setSelectedChoice(choice)}
                            >
                              <VehicleLogo name={choice.name} className={cn("size-8 border-0", selected ? "bg-primary-foreground text-primary" : "bg-muted")} />
                              <span className="text-xs font-medium">{choice.name}</span>
                              {choice.slabKm ? <span className={cn("text-[10px] leading-none", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>Up to {choice.slabKm} km</span> : null}
                              <Badge variant={selected ? "secondary" : "outline"}>{choice.price ? formatINR(choice.price) : "—"}</Badge>
                            </Button>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            <Separator />
            <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Selected vehicle</p>
                <p className="truncate text-sm font-semibold">
                  {selectedChoice
                    ? `${selectedChoice.partner === "porter" ? "Porter" : selectedChoice.partner === "delhivery" ? "Delhivery" : "Shadowfax"} · ${selectedChoice.name} · ${formatINR(selectedChoice.price)}`
                    : "Choose a vehicle from the cards above"}
                </p>
              </div>
              <Button type="button" disabled={!selectedChoice || placing} onClick={() => void placeSelected()}>
                {placing ? "Placing order..." : "Place order"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {checkResult ? (
          <Card>
            <CardHeader>
              <CardTitle>{checkResult.product === "hyperlocal" ? "Hyperlocal serviceability" : "Quick commerce"}</CardTitle>
              <CardDescription>
                {checkResult.product === "hyperlocal"
                  ? checkResult.serviceable
                    ? "Shadowfax can serve this order. Place it within two minutes."
                    : checkResult.reason || "This route is not serviceable."
                  : `Warehouse unique code ${checkResult.uniqueCode || warehouse?.unique_code || ""}. Quick commerce does not publish a fare before the order is created.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {latitude && longitude && warehouse?.latitude && warehouse?.longitude ? (
                <iframe
                  title="Delivery route"
                  className="h-72 w-full rounded-md border"
                  src={`https://maps.google.com/maps?saddr=${encodeURIComponent(`${warehouse.latitude},${warehouse.longitude}`)}&daddr=${encodeURIComponent(`${latitude},${longitude}`)}&output=embed`}
                />
              ) : mapQuery ? null : null}
              {checkResult.product === "hyperlocal" ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border p-3">
                    <p className="text-sm text-muted-foreground">Delivery cost</p>
                    <p className="text-xl font-semibold">{checkResult.deliveryCost ? formatINR(checkResult.deliveryCost) : "Not quoted"}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-sm text-muted-foreground">Pickup ETA</p>
                    <p className="text-xl font-semibold">{checkResult.pickupEta ? `${checkResult.pickupEta} min` : "—"}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-sm text-muted-foreground">Drop ETA</p>
                    <p className="text-xl font-semibold">{checkResult.dropEta ? `${checkResult.dropEta} min` : "—"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Unique code: {checkResult.uniqueCode || "Missing"}</p>
              )}
              <Button
                onClick={() => void placeRequest()}
                disabled={placing || (checkResult.product === "hyperlocal" && !checkResult.serviceable)}
              >
                {placing ? "Placing request..." : "Place delivery request"}
              </Button>
              {placedSummary ? (
                <div className="flex items-center gap-1.5 text-sm">
                  <PartnerLogo partner="shadowfax" size="xs" showName={false} />
                  <span>Shadowfax id: {placedSummary}</span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  )
}
