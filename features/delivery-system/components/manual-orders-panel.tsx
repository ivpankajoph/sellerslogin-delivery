"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { FacetFilter, matchesDateRange, matchesSearch, matchesSelected, TableFilters, uniqueFilterOptions } from "@/components/table-filters"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CourierOrderSummary } from "@/features/delivery-system/lib/data"
import { formatINR } from "@/lib/currency"

export function ManualOrdersPanel({
  orders,
  loading,
  onCreate,
  onDeliver,
}: {
  orders: CourierOrderSummary[]
  loading: boolean
  onCreate: () => void
  onDeliver: (order: CourierOrderSummary) => void
}) {
  const manualOrders = orders.filter((order) => Boolean(order.manualCourier))
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [statuses, setStatuses] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const toggle = (setter: (value: string[]) => void, selected: string[], value: string) =>
    setter(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  const filtered = useMemo(
    () => manualOrders.filter((order) =>
      matchesSelected(statuses, order.status || "pending") &&
      matchesSelected(cities, order.city || "City not set") &&
      matchesDateRange(order.createdAt, dateFrom, dateTo) &&
      matchesSearch(search, [order.orderNumber, order.customerName, order.customerPhone, order.items?.[0]?.productName, order.pincode, order.total])
    ),
    [cities, dateFrom, dateTo, manualOrders, search, statuses]
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Manual orders</CardTitle>
          <CardDescription>
            Orders created from the delivery dashboard, separate from website checkout orders.
          </CardDescription>
        </div>
        <Button onClick={onCreate}>Create manual order</Button>
      </CardHeader>
      <CardContent>
        <TableFilters
          search={search}
          onSearchChange={setSearch}
          placeholder="Search order, item, customer"
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          active={Boolean(search || dateFrom || dateTo || statuses.length || cities.length)}
          onReset={() => { setSearch(""); setDateFrom(""); setDateTo(""); setStatuses([]); setCities([]) }}
        >
          <FacetFilter title="Status" options={uniqueFilterOptions(manualOrders.map((order) => order.status || "pending"))} selected={statuses} onToggle={(value) => toggle(setStatuses, statuses, value)} onClear={() => setStatuses([])} />
          <FacetFilter title="City" options={uniqueFilterOptions(manualOrders.map((order) => order.city || "City not set"))} selected={cities} onToggle={(value) => toggle(setCities, cities, value)} onClear={() => setCities([])} />
        </TableFilters>
        <p className="mb-3 text-sm text-muted-foreground">
          {loading ? "Loading orders..." : `${filtered.length} of ${manualOrders.length} manual orders`}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.city || "City not set"} {order.pincode ? `· ${order.pincode}` : ""}
                  </p>
                </TableCell>
                <TableCell>{order.items?.[0]?.productName || "Manual item"}</TableCell>
                <TableCell>
                  <p className="font-medium">{order.customerName}</p>
                  <p className="text-sm text-muted-foreground">{order.customerPhone || "No phone"}</p>
                </TableCell>
                <TableCell className="capitalize">{order.status || "pending"}</TableCell>
                <TableCell className="text-right">{formatINR(order.total)}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => onDeliver(order)}>
                    Request delivery
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && !filtered.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No manual orders yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
