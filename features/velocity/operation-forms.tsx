"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight,
  Boxes,
  Building2,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileBarChart,
  Loader2,
  MapPin,
  PackagePlus,
  PencilLine,
  RefreshCcw,
  RotateCcw,
  Search,
  Store,
  Truck,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { runVelocityOperation, type VelocityOperation } from "./lib/api"

type FormValue = string
type FormValues = Record<string, FormValue>

type FormField = {
  key: string
  label: string
  group?: string
  kind?: "text" | "number" | "email" | "date" | "datetime-local" | "textarea" | "select" | "csv"
  placeholder?: string
  defaultValue?: string
  required?: boolean
  help?: string
  options?: Array<{ label: string; value: string }>
  wide?: boolean
}

type FormRequest = {
  payload?: Record<string, unknown>
  id?: string
  query?: Record<string, unknown>
}

type FormDefinition = {
  id: VelocityOperation
  title: string
  description: string
  category: "Shipping" | "Tracking & NDR" | "Network" | "Catalogue" | "Finance"
  method: "GET" | "POST" | "PUT"
  path: string
  action: string
  icon: typeof Truck
  fields: FormField[]
  build: (values: FormValues) => FormRequest
}

const nowLocal = () => {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  return date.toISOString().slice(0, 16)
}

const thirtyDaysAgo = () => {
  const date = new Date(Date.now() - 30 * 86400000)
  return date.toISOString().slice(0, 10)
}

const text = (value: FormValue) => value.trim()
const number = (value: FormValue) => value.trim() === "" ? undefined : Number(value)
const boolean = (value: FormValue) => value === "true"
const list = (value: FormValue) => value.split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean)
const optionalList = (value: FormValue) => {
  const entries = list(value)
  return entries.length ? entries : undefined
}
const omitEmpty = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== "" && entry !== undefined && entry !== null))

const parseItems = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, sku, units, price] = line.split("|").map((entry) => entry.trim())
      return { name, sku, units: Number(units || 1), selling_price: Number(price || 0) }
    })

const baseForwardFields: FormField[] = [
  { key: "order_id", label: "Your order ID", group: "Order", required: true, placeholder: "ORDER-1001" },
  { key: "order_date", label: "Order date & time", group: "Order", kind: "datetime-local", required: true, defaultValue: nowLocal() },
  { key: "store_name", label: "Store identifier", group: "Order", placeholder: "my-website", help: "Optional. Create the store first under Catalogue." },
  { key: "carrier_id", label: "Carrier ID", group: "Order", placeholder: "Leave blank for automatic assignment" },
  { key: "customer_name", label: "Customer name", group: "Customer & address", required: true, placeholder: "Jane Doe" },
  { key: "phone", label: "Phone", group: "Customer & address", required: true, placeholder: "9999999999" },
  { key: "email", label: "Email", group: "Customer & address", kind: "email", placeholder: "jane@example.com" },
  { key: "address", label: "Street address", group: "Customer & address", required: true, wide: true, placeholder: "House, street and landmark" },
  { key: "city", label: "City", group: "Customer & address", required: true },
  { key: "state", label: "State", group: "Customer & address", required: true },
  { key: "pincode", label: "Pincode", group: "Customer & address", required: true, placeholder: "560102" },
  { key: "country", label: "Country", group: "Customer & address", required: true, defaultValue: "India" },
  { key: "items", label: "Order items", group: "Items", kind: "textarea", required: true, wide: true, defaultValue: "Product name | SKU-001 | 1 | 499", help: "One item per line: Product name | SKU | quantity | selling price" },
  { key: "payment_method", label: "Payment method", group: "Payment & package", kind: "select", required: true, defaultValue: "PREPAID", options: [{ label: "Prepaid", value: "PREPAID" }, { label: "Cash on delivery", value: "COD" }] },
  { key: "sub_total", label: "Order subtotal", group: "Payment & package", kind: "number", required: true, placeholder: "499" },
  { key: "cod_collectible", label: "COD to collect", group: "Payment & package", kind: "number", defaultValue: "0" },
  { key: "shipping_charges", label: "Shipping charged to customer", group: "Payment & package", kind: "number", defaultValue: "0" },
  { key: "warehouse_id", label: "Warehouse ID", group: "Payment & package", required: true, placeholder: "WHYYB5" },
  { key: "weight", label: "Weight (kg)", group: "Dimensions", kind: "number", required: true, defaultValue: "0.5" },
  { key: "length", label: "Length (cm)", group: "Dimensions", kind: "number", required: true, defaultValue: "20" },
  { key: "breadth", label: "Breadth (cm)", group: "Dimensions", kind: "number", required: true, defaultValue: "15" },
  { key: "height", label: "Height (cm)", group: "Dimensions", kind: "number", required: true, defaultValue: "10" },
  { key: "print_label", label: "Generate shipping label", group: "Options", kind: "select", defaultValue: "true", options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }] },
]

const buildForward = (values: FormValues) => omitEmpty({
  order_id: text(values.order_id),
  order_date: text(values.order_date).replace("T", " "),
  store_name: text(values.store_name),
  carrier_id: text(values.carrier_id),
  billing_customer_name: text(values.customer_name),
  billing_address: text(values.address),
  billing_city: text(values.city),
  billing_pincode: text(values.pincode),
  billing_state: text(values.state),
  billing_country: text(values.country),
  billing_phone: text(values.phone),
  billing_email: text(values.email),
  shipping_is_billing: true,
  print_label: boolean(values.print_label),
  order_items: parseItems(values.items),
  payment_method: values.payment_method,
  sub_total: number(values.sub_total),
  cod_collectible: number(values.cod_collectible),
  shipping_charges: number(values.shipping_charges),
  length: number(values.length),
  breadth: number(values.breadth),
  height: number(values.height),
  weight: number(values.weight),
  warehouse_id: text(values.warehouse_id),
})

const definitions: FormDefinition[] = [
  {
    id: "serviceability", title: "Check serviceability", description: "Find eligible courier partners between two pincodes.", category: "Shipping", method: "POST", path: "/serviceability", action: "Check serviceability", icon: MapPin,
    fields: [
      { key: "from", label: "Pickup pincode", required: true, placeholder: "560068" },
      { key: "to", label: "Delivery pincode", required: true, placeholder: "110001" },
      { key: "payment_mode", label: "Payment mode", kind: "select", required: true, defaultValue: "prepaid", options: [{ label: "Prepaid", value: "prepaid" }, { label: "COD", value: "cod" }] },
      { key: "shipment_type", label: "Shipment type", kind: "select", required: true, defaultValue: "forward", options: [{ label: "Forward", value: "forward" }, { label: "Return", value: "return" }] },
    ],
    build: (v) => ({ payload: { from: text(v.from), to: text(v.to), payment_mode: v.payment_mode, shipment_type: v.shipment_type } }),
  },
  {
    id: "rates", title: "Get shipping rates", description: "Compare live courier charges and expected delivery dates.", category: "Shipping", method: "POST", path: "/rates", action: "Get live rates", icon: Calculator,
    fields: [
      { key: "journey_type", label: "Journey", kind: "select", required: true, defaultValue: "forward", options: [{ label: "Forward", value: "forward" }, { label: "Return", value: "return" }] },
      { key: "origin_pincode", label: "Origin pincode", required: true, placeholder: "560068" },
      { key: "destination_pincode", label: "Destination pincode", required: true, placeholder: "110001" },
      { key: "dead_weight", label: "Dead weight (grams)", kind: "number", required: true, defaultValue: "500" },
      { key: "length", label: "Length (cm)", kind: "number", required: true, defaultValue: "20" },
      { key: "width", label: "Width (cm)", kind: "number", required: true, defaultValue: "15" },
      { key: "height", label: "Height (cm)", kind: "number", required: true, defaultValue: "10" },
      { key: "payment_method", label: "Payment method", kind: "select", defaultValue: "prepaid", options: [{ label: "Prepaid", value: "prepaid" }, { label: "COD", value: "cod" }] },
      { key: "shipment_value", label: "Shipment value", kind: "number", defaultValue: "500" },
      { key: "qc_applicable", label: "Return quality check", kind: "select", defaultValue: "false", options: [{ label: "No", value: "false" }, { label: "Yes", value: "true" }] },
    ],
    build: (v) => ({ payload: omitEmpty({ journey_type: v.journey_type, origin_pincode: text(v.origin_pincode), destination_pincode: text(v.destination_pincode), dead_weight: number(v.dead_weight), length: number(v.length), width: number(v.width), height: number(v.height), payment_method: v.journey_type === "forward" ? v.payment_method : undefined, shipment_value: v.journey_type === "forward" ? number(v.shipment_value) : undefined, qc_applicable: v.journey_type === "return" ? boolean(v.qc_applicable) : undefined }) }),
  },
  { id: "forward-create", title: "Create forward order", description: "Create the order first and assign a courier later.", category: "Shipping", method: "POST", path: "/forward-order", action: "Create forward order", icon: PackagePlus, fields: baseForwardFields, build: (v) => ({ payload: buildForward(v) }) },
  {
    id: "forward-assign", title: "Assign courier", description: "Assign a courier to an existing Velocity shipment.", category: "Shipping", method: "POST", path: "/forward-order-shipment", action: "Assign courier", icon: Truck,
    fields: [{ key: "shipment_id", label: "Velocity shipment ID", required: true, placeholder: "SHIXRE1ER7BQI" }, { key: "carrier_id", label: "Carrier ID", placeholder: "Leave blank to use shipping rules" }],
    build: (v) => ({ payload: { shipment_id: text(v.shipment_id), carrier_id: text(v.carrier_id) } }),
  },
  { id: "forward-orchestrate", title: "Create & manifest shipment", description: "Create an order and assign the courier in one step.", category: "Shipping", method: "POST", path: "/forward-order-orchestration", action: "Create & manifest", icon: PackagePlus, fields: baseForwardFields, build: (v) => ({ payload: buildForward(v) }) },
  {
    id: "reverse-create", title: "Create reverse pickup", description: "Book a customer return with optional product QC.", category: "Shipping", method: "POST", path: "/reverse-order-orchestration", action: "Book reverse pickup", icon: RotateCcw,
    fields: [
      { key: "order_id", label: "Return order ID", group: "Order", required: true, placeholder: "RET-1001" },
      { key: "order_date", label: "Order date", group: "Order", kind: "date", required: true, defaultValue: new Date().toISOString().slice(0, 10) },
      { key: "carrier_id", label: "Carrier ID", group: "Order", placeholder: "Optional" },
      { key: "pickup_customer_name", label: "Customer name", group: "Customer pickup", required: true },
      { key: "pickup_phone", label: "Customer phone", group: "Customer pickup", required: true },
      { key: "pickup_email", label: "Customer email", group: "Customer pickup", kind: "email" },
      { key: "pickup_address", label: "Pickup address", group: "Customer pickup", required: true, wide: true },
      { key: "pickup_city", label: "Pickup city", group: "Customer pickup", required: true },
      { key: "pickup_state", label: "Pickup state", group: "Customer pickup", required: true },
      { key: "pickup_pincode", label: "Pickup pincode", group: "Customer pickup", required: true },
      { key: "shipping_customer_name", label: "Warehouse contact", group: "Return destination", required: true },
      { key: "shipping_phone", label: "Warehouse phone", group: "Return destination", required: true },
      { key: "shipping_address", label: "Warehouse address", group: "Return destination", required: true, wide: true },
      { key: "shipping_city", label: "Warehouse city", group: "Return destination", required: true },
      { key: "shipping_state", label: "Warehouse state", group: "Return destination", required: true },
      { key: "shipping_pincode", label: "Warehouse pincode", group: "Return destination", required: true },
      { key: "warehouse_id", label: "Warehouse ID", group: "Return destination", required: true },
      { key: "item_name", label: "Product name", group: "Item & QC", required: true },
      { key: "sku", label: "SKU", group: "Item & QC", required: true },
      { key: "units", label: "Quantity", group: "Item & QC", kind: "number", defaultValue: "1", required: true },
      { key: "selling_price", label: "Selling price", group: "Item & QC", kind: "number", required: true },
      { key: "qc_enable", label: "Enable QC", group: "Item & QC", kind: "select", defaultValue: "false", options: [{ label: "No", value: "false" }, { label: "Yes", value: "true" }] },
      { key: "qc_brand", label: "QC brand", group: "Item & QC" },
      { key: "qc_product_image", label: "Public product image URL", group: "Item & QC", wide: true },
      { key: "sub_total", label: "Item value", group: "Package", kind: "number", required: true },
      { key: "weight", label: "Weight (kg)", group: "Package", kind: "number", defaultValue: "0.5", required: true },
      { key: "length", label: "Length (cm)", group: "Package", kind: "number", defaultValue: "20", required: true },
      { key: "breadth", label: "Breadth (cm)", group: "Package", kind: "number", defaultValue: "15", required: true },
      { key: "height", label: "Height (cm)", group: "Package", kind: "number", defaultValue: "10", required: true },
      { key: "request_pickup", label: "Schedule pickup now", group: "Package", kind: "select", defaultValue: "true", options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }] },
    ],
    build: (v) => ({ payload: omitEmpty({
      order_id: text(v.order_id), order_date: v.order_date, carrier_id: text(v.carrier_id),
      pickup_customer_name: text(v.pickup_customer_name), pickup_address: text(v.pickup_address), pickup_city: text(v.pickup_city), pickup_state: text(v.pickup_state), pickup_country: "India", pickup_pincode: text(v.pickup_pincode), pickup_email: text(v.pickup_email), pickup_phone: text(v.pickup_phone), pickup_isd_code: "91",
      shipping_customer_name: text(v.shipping_customer_name), shipping_address: text(v.shipping_address), shipping_city: text(v.shipping_city), shipping_state: text(v.shipping_state), shipping_country: "India", shipping_pincode: text(v.shipping_pincode), shipping_phone: text(v.shipping_phone), shipping_isd_code: "91",
      warehouse_id: text(v.warehouse_id), order_items: [{ name: text(v.item_name), sku: text(v.sku), units: number(v.units), selling_price: number(v.selling_price), qc_enable: boolean(v.qc_enable), qc_product_name: text(v.item_name), qc_brand: text(v.qc_brand), qc_product_image: text(v.qc_product_image) }],
      payment_method: "PREPAID", sub_total: number(v.sub_total), length: number(v.length), breadth: number(v.breadth), height: number(v.height), weight: number(v.weight), request_pickup: boolean(v.request_pickup),
    }) }),
  },
  {
    id: "order-update", title: "Update unassigned order", description: "Change payment, warehouse, address or package data before courier assignment.", category: "Shipping", method: "PUT", path: "/order", action: "Update order", icon: PencilLine,
    fields: [
      { key: "order_id", label: "Velocity order ID", group: "Order", required: true, placeholder: "ORDKDKHOFL07I" },
      { key: "payment_status", label: "Payment status", group: "Order", kind: "select", options: [{ label: "No change", value: "" }, { label: "Paid", value: "paid" }, { label: "Unpaid", value: "unpaid" }] },
      { key: "warehouse_id", label: "New warehouse ID", group: "Order" }, { key: "package_id", label: "Package ID", group: "Order" },
      { key: "weight", label: "Weight override (kg)", group: "Order", kind: "number" }, { key: "cod_amount", label: "COD amount", group: "Order", kind: "number" },
      { key: "name", label: "Recipient name", group: "Shipping address" }, { key: "phone", label: "Phone", group: "Shipping address" },
      { key: "email", label: "Email", group: "Shipping address", kind: "email" }, { key: "address", label: "Address", group: "Shipping address", wide: true },
      { key: "city", label: "City", group: "Shipping address" }, { key: "state", label: "State", group: "Shipping address" },
      { key: "zip", label: "Pincode", group: "Shipping address" },
    ],
    build: (v) => ({ payload: { order_id: text(v.order_id), order: omitEmpty({ payment_status: v.payment_status, warehouse_id: text(v.warehouse_id), package_id: text(v.package_id), weight: number(v.weight), cod_amount: number(v.cod_amount), shipping_address: [v.name, v.phone, v.email, v.address, v.city, v.state, v.zip].some((entry) => text(entry)) ? omitEmpty({ name: text(v.name), phone: text(v.phone), email: text(v.email), address: text(v.address), city: text(v.city), state: text(v.state), country: "India", zip: text(v.zip) }) : undefined }) } }),
  },
  {
    id: "order-cancel", title: "Cancel shipments", description: "Cancel one or more shipments before pickup.", category: "Shipping", method: "POST", path: "/cancel-order", action: "Submit cancellation", icon: ClipboardList,
    fields: [{ key: "awbs", label: "AWB numbers", kind: "csv", required: true, wide: true, help: "Enter up to 50 AWBs, separated by commas or new lines." }], build: (v) => ({ payload: { awbs: list(v.awbs) } }),
  },
  {
    id: "tracking", title: "Track shipments", description: "Fetch live tracking timelines for one or more AWBs.", category: "Tracking & NDR", method: "POST", path: "/order-tracking", action: "Track shipments", icon: MapPin,
    fields: [{ key: "awbs", label: "AWB numbers", kind: "csv", required: true, wide: true }], build: (v) => ({ payload: { awbs: list(v.awbs) } }),
  },
  {
    id: "reattempt", title: "Request NDR re-attempt", description: "Ask the courier to attempt delivery again, optionally with corrected details.", category: "Tracking & NDR", method: "POST", path: "/reattempt", action: "Request re-attempt", icon: RefreshCcw,
    fields: [{ key: "awb", label: "AWB", required: true }, { key: "updated_phone_number", label: "Updated phone" }, { key: "address_line", label: "Corrected street address", wide: true }, { key: "landmark", label: "Landmark" }, { key: "comments", label: "Courier instructions", kind: "textarea", wide: true }],
    build: (v) => ({ payload: omitEmpty({ awb: text(v.awb), updated_phone_number: text(v.updated_phone_number), updated_address: text(v.address_line) || text(v.landmark) ? omitEmpty({ address_line: text(v.address_line), landmark: text(v.landmark) }) : undefined, comments: text(v.comments) }) }),
  },
  {
    id: "initiate-rto", title: "Initiate RTO", description: "Return an NDR shipment to its origin warehouse.", category: "Tracking & NDR", method: "POST", path: "/initiate-rto", action: "Initiate RTO", icon: RotateCcw,
    fields: [{ key: "awb", label: "AWB", required: true }], build: (v) => ({ payload: { awb: text(v.awb) } }),
  },
  {
    id: "shipments", title: "Search forward shipments", description: "Load forward orders with search, status and pagination filters.", category: "Tracking & NDR", method: "POST", path: "/shipments", action: "Load shipments", icon: Search,
    fields: [{ key: "search", label: "Search" }, { key: "status", label: "Status", placeholder: "in_transit" }, { key: "page", label: "Page", kind: "number", defaultValue: "1" }, { key: "per_page", label: "Rows per page", kind: "number", defaultValue: "20" }, { key: "is_cod", label: "Payment filter", kind: "select", options: [{ label: "All", value: "" }, { label: "COD only", value: "true" }, { label: "Prepaid only", value: "false" }] }, { key: "warehouse_ids", label: "Warehouse IDs", kind: "csv", wide: true }],
    build: (v) => ({ payload: omitEmpty({ search: text(v.search), status: text(v.status), page: number(v.page), per_page: number(v.per_page), is_cod: v.is_cod === "" ? undefined : boolean(v.is_cod), warehouse_ids: optionalList(v.warehouse_ids), sort_order: "desc" }) }),
  },
  {
    id: "returns", title: "Search return orders", description: "Load reverse orders with status and catalogue filters.", category: "Tracking & NDR", method: "POST", path: "/returns", action: "Load returns", icon: RotateCcw,
    fields: [{ key: "search", label: "Search customer, mobile or AWB" }, { key: "status", label: "Status", placeholder: "return_requested" }, { key: "page", label: "Page", kind: "number", defaultValue: "1" }, { key: "per_page", label: "Rows per page", kind: "number", defaultValue: "20" }, { key: "warehouse_id", label: "Warehouse IDs", kind: "csv" }, { key: "sku", label: "SKUs", kind: "csv" }],
    build: (v) => ({ payload: omitEmpty({ search: text(v.search), status: text(v.status), page: number(v.page), per_page: number(v.per_page), warehouse_id: list(v.warehouse_id), sku: list(v.sku), sort_order: "desc" }) }),
  },
  {
    id: "exchanges", title: "Search exchange orders", description: "Load exchanges using order, return and date filters.", category: "Tracking & NDR", method: "POST", path: "/exchange-orders", action: "Load exchanges", icon: RefreshCcw,
    fields: [{ key: "search", label: "Search" }, { key: "status", label: "Status" }, { key: "display_id", label: "Exchange display ID" }, { key: "return_display_id", label: "Return display ID" }, { key: "created_at__gte", label: "Created from", kind: "date" }, { key: "created_at__lte", label: "Created until", kind: "date" }, { key: "page", label: "Page", kind: "number", defaultValue: "1" }, { key: "per_page", label: "Rows per page", kind: "number", defaultValue: "20" }],
    build: (v) => ({ payload: omitEmpty({ search: text(v.search), status: text(v.status), display_id: text(v.display_id), return_display_id: text(v.return_display_id), created_at__gte: text(v.created_at__gte), created_at__lte: text(v.created_at__lte), page: number(v.page), per_page: number(v.per_page), sort_order: "desc" }) }),
  },
  {
    id: "warehouse", title: "Create warehouse", description: "Register a pickup warehouse in Velocity.", category: "Network", method: "POST", path: "/warehouse", action: "Create warehouse", icon: Building2,
    fields: [{ key: "name", label: "Warehouse name", required: true }, { key: "contact_person", label: "Contact person", required: true }, { key: "phone_number", label: "Phone", required: true }, { key: "email", label: "Email", kind: "email", required: true }, { key: "gst_no", label: "GST number" }, { key: "street_address", label: "Street address", required: true, wide: true }, { key: "zip", label: "Pincode", required: true }, { key: "city", label: "City", required: true }, { key: "state", label: "State", required: true }, { key: "country", label: "Country", required: true, defaultValue: "India" }],
    build: (v) => ({ payload: omitEmpty({ name: text(v.name), phone_number: text(v.phone_number), gst_no: text(v.gst_no), email: text(v.email), contact_person: text(v.contact_person), address_attributes: { street_address: text(v.street_address), zip: text(v.zip), city: text(v.city), state: text(v.state), country: text(v.country) } }) }),
  },
  { id: "stores-list", title: "List stores", description: "View all active sales-channel stores.", category: "Catalogue", method: "GET", path: "/client-stores", action: "Load stores", icon: Store, fields: [], build: () => ({}) },
  { id: "store-get", title: "Get store", description: "Load one store by its Velocity UUID.", category: "Catalogue", method: "GET", path: "/client-stores/:id", action: "Load store", icon: Store, fields: [{ key: "id", label: "Store UUID", required: true }], build: (v) => ({ id: text(v.id) }) },
  { id: "store-create", title: "Create store", description: "Create a branded manual-order sales channel.", category: "Catalogue", method: "POST", path: "/client-stores", action: "Create store", icon: Store, fields: [{ key: "store_name", label: "Unique store identifier", required: true, placeholder: "my-website", help: "Letters, numbers and hyphens only." }, { key: "brand_name", label: "Customer-facing brand name" }], build: (v) => ({ payload: omitEmpty({ store_name: text(v.store_name), brand_name: text(v.brand_name) }) }) },
  { id: "store-update", title: "Update store", description: "Change a store identifier or customer-facing brand name.", category: "Catalogue", method: "PUT", path: "/client-stores/:id", action: "Update store", icon: PencilLine, fields: [{ key: "id", label: "Store UUID", required: true }, { key: "store_name", label: "New store identifier" }, { key: "brand_name", label: "New brand name" }], build: (v) => ({ id: text(v.id), payload: omitEmpty({ store_name: text(v.store_name), brand_name: text(v.brand_name) }) }) },
  { id: "variants-list", title: "List product variants", description: "Search reusable Velocity catalogue SKUs.", category: "Catalogue", method: "GET", path: "/variants", action: "Load variants", icon: Boxes, fields: [{ key: "search", label: "Search SKU or title" }, { key: "page", label: "Page", kind: "number", defaultValue: "1" }, { key: "per_page", label: "Rows per page", kind: "number", defaultValue: "20" }], build: (v) => ({ query: omitEmpty({ search: text(v.search), page: number(v.page), per_page: number(v.per_page) }) }) },
  {
    id: "variant-create", title: "Create product variant", description: "Save product and package metadata for future shipments.", category: "Catalogue", method: "POST", path: "/variants", action: "Create variant", icon: Boxes,
    fields: [{ key: "title", label: "Product title", required: true }, { key: "sku", label: "Unique SKU", required: true }, { key: "price", label: "Price", kind: "number" }, { key: "weight", label: "Weight (kg)", kind: "number" }, { key: "length", label: "Length (cm)", kind: "number" }, { key: "breadth", label: "Breadth (cm)", kind: "number" }, { key: "height", label: "Height (cm)", kind: "number" }, { key: "category", label: "Category" }, { key: "hsn_code", label: "HSN code" }, { key: "brand_name", label: "Brand" }, { key: "color", label: "Colour" }, { key: "size", label: "Size" }, { key: "product_description", label: "Description", kind: "textarea", wide: true }, { key: "qc_enabled", label: "Enable return QC", kind: "select", defaultValue: "false", options: [{ label: "No", value: "false" }, { label: "Yes", value: "true" }] }, { key: "image_urls", label: "Public image URLs", kind: "csv", wide: true, help: "At least one image is required when QC is enabled." }],
    build: (v) => ({ payload: omitEmpty({ title: text(v.title), sku: text(v.sku), price: number(v.price), weight: number(v.weight), length: number(v.length), breadth: number(v.breadth), height: number(v.height), category: text(v.category), hsn_code: text(v.hsn_code), brand_name: text(v.brand_name), color: text(v.color), size: text(v.size), product_description: text(v.product_description), qc_enabled: boolean(v.qc_enabled), image_urls: optionalList(v.image_urls) }) }),
  },
  {
    id: "variant-update", title: "Update product variant", description: "Edit an existing Velocity catalogue SKU.", category: "Catalogue", method: "PUT", path: "/variants/:id", action: "Update variant", icon: PencilLine,
    fields: [{ key: "id", label: "Variant ID", required: true }, { key: "title", label: "Product title" }, { key: "sku", label: "SKU" }, { key: "price", label: "Price", kind: "number" }, { key: "weight", label: "Weight (kg)", kind: "number" }, { key: "category", label: "Category" }, { key: "hsn_code", label: "HSN code" }, { key: "brand_name", label: "Brand" }, { key: "qc_enabled", label: "QC setting", kind: "select", options: [{ label: "No change", value: "" }, { label: "Enabled", value: "true" }, { label: "Disabled", value: "false" }] }, { key: "image_urls", label: "Additional public image URLs", kind: "csv", wide: true }],
    build: (v) => ({ id: text(v.id), payload: omitEmpty({ title: text(v.title), sku: text(v.sku), price: number(v.price), weight: number(v.weight), category: text(v.category), hsn_code: text(v.hsn_code), brand_name: text(v.brand_name), qc_enabled: v.qc_enabled === "" ? undefined : boolean(v.qc_enabled), image_urls: optionalList(v.image_urls) }) }),
  },
  { id: "shipping-charges", title: "Shipment charges", description: "Fetch freight, platform and automation charges by AWB.", category: "Finance", method: "POST", path: "/shipping-charges", action: "Load charges", icon: CircleDollarSign, fields: [{ key: "awbs", label: "AWB numbers", kind: "csv", required: true, wide: true, help: "Up to 100 AWBs." }], build: (v) => ({ payload: { awbs: list(v.awbs) } }) },
  { id: "cod-remittance", title: "COD remittance", description: "View COD collection, settlement date and UTR by AWB.", category: "Finance", method: "POST", path: "/cod-remittance", action: "Load remittance", icon: CircleDollarSign, fields: [{ key: "awbs", label: "COD AWB numbers", kind: "csv", required: true, wide: true, help: "Up to 100 AWBs." }], build: (v) => ({ payload: { awbs: list(v.awbs) } }) },
  {
    id: "reports", title: "Summary report", description: "Generate status counts and order values for a date range.", category: "Finance", method: "POST", path: "/reports", action: "Generate report", icon: FileBarChart,
    fields: [{ key: "start_date_time", label: "Start date", kind: "date", required: true, defaultValue: thirtyDaysAgo() }, { key: "end_date_time", label: "End date", kind: "date", required: true, defaultValue: new Date().toISOString().slice(0, 10) }, { key: "shipment_type", label: "Shipment type", kind: "select", required: true, defaultValue: "forward", options: [{ label: "Forward", value: "forward" }, { label: "Return", value: "return" }] }],
    build: (v) => ({ payload: { start_date_time: new Date(`${v.start_date_time}T00:00:00`).toISOString(), end_date_time: new Date(`${v.end_date_time}T23:59:59`).toISOString(), shipment_type: v.shipment_type } }),
  },
]

const initialValues = (definition: FormDefinition) =>
  Object.fromEntries(definition.fields.map((field) => [field.key, field.defaultValue || ""]))

const displayValue = (value: unknown) => {
  if (value === null || value === undefined) return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function ResponsePanel({ response }: { response: unknown }) {
  if (!response || typeof response !== "object") return null
  const object = response as Record<string, unknown>
  const summary = (object.result || object.payload || object.data || object) as Record<string, unknown>
  const entries = summary && typeof summary === "object" && !Array.isArray(summary)
    ? Object.entries(summary).slice(0, 8)
    : []
  return (
    <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/10">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600" /><CardTitle className="text-base">Velocity response</CardTitle></div>
        <CardDescription>The request completed successfully.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {entries.length ? <div className="grid gap-2 sm:grid-cols-2">{entries.map(([key, value]) => <div key={key} className="min-w-0 rounded-lg border bg-background p-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{key.replaceAll("_", " ")}</p><p className="mt-1 truncate text-sm font-medium" title={displayValue(value)}>{displayValue(value)}</p></div>)}</div> : null}
        <details className="rounded-lg border bg-background p-3"><summary className="cursor-pointer text-sm font-medium">View complete API response</summary><pre className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(response, null, 2)}</pre></details>
      </CardContent>
    </Card>
  )
}

export function VelocityOperationForms({ configured, operation }: { configured: boolean; operation?: VelocityOperation }) {
  const [selectedId, setSelectedId] = useState<VelocityOperation>(operation || "serviceability")
  const selected = useMemo(() => definitions.find((entry) => entry.id === selectedId)!, [selectedId])
  const [valuesByForm, setValuesByForm] = useState<Partial<Record<VelocityOperation, FormValues>>>({ serviceability: initialValues(definitions[0]) })
  const [busy, setBusy] = useState(false)
  const [response, setResponse] = useState<unknown>(null)
  const values = valuesByForm[selectedId] || initialValues(selected)
  const groups = Array.from(new Set(selected.fields.map((field) => field.group || "Details")))

  useEffect(() => {
    if (!operation || operation === selectedId) return
    setSelectedId(operation)
    setResponse(null)
    const definition = definitions.find((entry) => entry.id === operation)!
    setValuesByForm((current) => current[operation] ? current : { ...current, [operation]: initialValues(definition) })
  }, [operation, selectedId])

  const choose = (definition: FormDefinition) => {
    setSelectedId(definition.id)
    setResponse(null)
    setValuesByForm((current) => current[definition.id] ? current : { ...current, [definition.id]: initialValues(definition) })
  }

  const update = (key: string, value: string) => {
    setValuesByForm((current) => ({ ...current, [selectedId]: { ...(current[selectedId] || initialValues(selected)), [key]: value } }))
  }

  const submit = async () => {
    const missing = selected.fields.filter((field) => field.required && !text(values[field.key] || ""))
    if (missing.length) {
      toast.error(`Complete: ${missing.map((field) => field.label).join(", ")}`)
      return
    }
    setBusy(true)
    setResponse(null)
    try {
      const request = selected.build(values)
      const result = await runVelocityOperation(selected.id, request.payload || {}, { id: request.id, query: request.query })
      setResponse(result)
      toast.success(`${selected.title} completed`)
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (error as Error)?.message || "Velocity request failed"
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={operation ? "mx-auto w-full max-w-5xl space-y-4" : "grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]"}>
      {!operation ? <Card className="h-fit xl:sticky xl:top-4">
        <CardHeader>
          <CardTitle>Velocity features</CardTitle>
          <CardDescription>Choose a task, fill its form, then send it to Velocity.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-18rem)] space-y-5 overflow-y-auto">
          {(["Shipping", "Tracking & NDR", "Network", "Catalogue", "Finance"] as const).map((category) => (
            <div key={category} className="space-y-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category}</p>
              {definitions.filter((entry) => entry.category === category).map((definition) => {
                const Icon = definition.icon
                return (
                  <button key={definition.id} type="button" onClick={() => choose(definition)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${selectedId === definition.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "hover:bg-muted"}`}>
                    <span className="rounded-md bg-background p-2 shadow-sm"><Icon className="size-4 text-blue-600" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{definition.title}</span><span className="block truncate text-xs text-muted-foreground">{definition.method} {definition.path}</span></span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card> : null}

      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><Badge variant="outline">{selected.method}</Badge><CardTitle>{selected.title}</CardTitle></div><CardDescription className="mt-2">{selected.description}</CardDescription></div>
              <code className="max-w-full truncate rounded-md bg-muted px-3 py-2 text-xs">/custom/api/v1{selected.path}</code>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {!configured && !operation ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">The complete form is available now. Add <code>VELOCITY_API_TOKEN</code> to the backend to enable its submit button.</div> : null}
            {!selected.fields.length ? <div className="rounded-xl border border-dashed p-8 text-center"><selected.icon className="mx-auto size-8 text-blue-600" /><p className="mt-3 font-medium">No input is required</p><p className="mt-1 text-sm text-muted-foreground">Click the button below to load this data from Velocity.</p></div> : groups.map((group) => (
              <fieldset key={group} className="space-y-3 rounded-xl border p-4">
                <legend className="px-2 text-sm font-semibold">{group}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {selected.fields.filter((field) => (field.group || "Details") === group).map((field) => (
                    <div key={field.key} className={`space-y-1.5 ${field.wide || field.kind === "textarea" || field.kind === "csv" ? "sm:col-span-2" : ""}`}>
                      <Label htmlFor={`${selected.id}-${field.key}`}>{field.label}{field.required ? <span className="text-rose-600"> *</span> : null}</Label>
                      {field.kind === "select" ? (
                        <select id={`${selected.id}-${field.key}`} value={values[field.key] || ""} onChange={(event) => update(field.key, event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                          {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      ) : field.kind === "textarea" || field.kind === "csv" ? (
                        <Textarea id={`${selected.id}-${field.key}`} value={values[field.key] || ""} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder || (field.kind === "csv" ? "Enter values separated by commas or new lines" : "")} className="min-h-24" />
                      ) : (
                        <Input id={`${selected.id}-${field.key}`} type={field.kind || "text"} value={values[field.key] || ""} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder} />
                      )}
                      {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <p className="text-sm text-muted-foreground">Required fields are marked with <span className="text-rose-600">*</span>.</p>
              <Button size="lg" disabled={!configured || busy} onClick={() => void submit()}>{busy ? <Loader2 className="size-4 animate-spin" /> : <selected.icon className="size-4" />}{selected.action}</Button>
            </div>
          </CardContent>
        </Card>
        <ResponsePanel response={response} />
      </div>
    </div>
  )
}

