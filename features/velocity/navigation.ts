import type { VelocityOperation } from "./lib/api"

export type VelocityNavigationItem = {
  id: VelocityOperation
  label: string
  description: string
  category: "Shipping" | "Tracking & NDR" | "Network" | "Catalogue" | "Finance"
}

export const velocityNavigation: VelocityNavigationItem[] = [
  { id: "serviceability", label: "Check serviceability", description: "Check whether a delivery lane is supported.", category: "Shipping" },
  { id: "rates", label: "Shipping rates", description: "Compare eligible courier prices.", category: "Shipping" },
  { id: "forward-create", label: "Create forward order", description: "Create a forward delivery order.", category: "Shipping" },
  { id: "forward-assign", label: "Assign courier", description: "Assign a courier to an order.", category: "Shipping" },
  { id: "forward-orchestrate", label: "Create & manifest", description: "Create an order and manifest it in one step.", category: "Shipping" },
  { id: "reverse-create", label: "Reverse pickup", description: "Create a customer return pickup.", category: "Shipping" },
  { id: "order-update", label: "Update order", description: "Update an unassigned order.", category: "Shipping" },
  { id: "order-cancel", label: "Cancel shipment", description: "Cancel one or more shipments.", category: "Shipping" },
  { id: "tracking", label: "Track shipment", description: "View the latest tracking status.", category: "Tracking & NDR" },
  { id: "reattempt", label: "NDR re-attempt", description: "Request another delivery attempt.", category: "Tracking & NDR" },
  { id: "initiate-rto", label: "Initiate RTO", description: "Return an undelivered shipment to origin.", category: "Tracking & NDR" },
  { id: "shipments", label: "Forward shipments", description: "Search forward shipment records.", category: "Tracking & NDR" },
  { id: "returns", label: "Return orders", description: "Search return orders.", category: "Tracking & NDR" },
  { id: "exchanges", label: "Exchange orders", description: "Search exchange orders.", category: "Tracking & NDR" },
  { id: "warehouse", label: "Create warehouse", description: "Register a new pickup warehouse.", category: "Network" },
  { id: "stores-list", label: "All stores", description: "Load connected sales channels.", category: "Catalogue" },
  { id: "store-get", label: "Store details", description: "Load one store by its ID.", category: "Catalogue" },
  { id: "store-create", label: "Create store", description: "Add a new sales channel.", category: "Catalogue" },
  { id: "store-update", label: "Update store", description: "Edit an existing sales channel.", category: "Catalogue" },
  { id: "variants-list", label: "All products", description: "Search product variants and SKUs.", category: "Catalogue" },
  { id: "variant-create", label: "Create product", description: "Create a reusable product variant.", category: "Catalogue" },
  { id: "variant-update", label: "Update product", description: "Edit a product variant.", category: "Catalogue" },
  { id: "shipping-charges", label: "Shipping charges", description: "Review billed shipping charges.", category: "Finance" },
  { id: "cod-remittance", label: "COD remittance", description: "Review COD settlement details.", category: "Finance" },
  { id: "reports", label: "Summary report", description: "Generate a shipment summary report.", category: "Finance" },
]

export const velocityNavigationGroups = (["Shipping", "Tracking & NDR", "Network", "Catalogue", "Finance"] as const)
  .map((category) => ({ category, items: velocityNavigation.filter((item) => item.category === category) }))

export const isVelocityOperation = (value: string): value is VelocityOperation =>
  velocityNavigation.some((item) => item.id === value)

export const getVelocityNavigationItem = (operation: VelocityOperation) =>
  velocityNavigation.find((item) => item.id === operation)!
