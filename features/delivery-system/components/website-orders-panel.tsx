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

export function WebsiteOrdersPanel({
  orders,
  loading,
  onDeliver,
}: {
  orders: CourierOrderSummary[]
  loading: boolean
  onDeliver: (order: CourierOrderSummary) => void
}) {
  const websiteOrders = orders.filter((order) => order.source === "template-orders")
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [statuses, setStatuses] = useState<string[]>([])
  const [websites, setWebsites] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const toggle = (setter: (value: string[]) => void, selected: string[], value: string) =>
    setter(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  const filtered = useMemo(
    () => websiteOrders.filter((order) =>
      matchesSelected(statuses, order.status || "pending") &&
      matchesSelected(websites, order.websiteLabel || "Template website") &&
      matchesSelected(cities, order.city || "City not set") &&
      matchesDateRange(order.createdAt, dateFrom, dateTo) &&
      matchesSearch(search, [order.orderNumber, order.customerName, order.customerPhone, order.pincode, order.total])
    ),
    [cities, dateFrom, dateTo, search, statuses, websiteOrders, websites]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Website orders</CardTitle>
        <CardDescription>
          Orders placed on this vendor&apos;s template websites, including sites with a connected domain.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TableFilters
          search={search}
          onSearchChange={setSearch}
          placeholder="Search order, customer, pincode"
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          active={Boolean(search || dateFrom || dateTo || statuses.length || websites.length || cities.length)}
          onReset={() => { setSearch(""); setDateFrom(""); setDateTo(""); setStatuses([]); setWebsites([]); setCities([]) }}
        >
          <FacetFilter title="Status" options={uniqueFilterOptions(websiteOrders.map((order) => order.status || "pending"))} selected={statuses} onToggle={(value) => toggle(setStatuses, statuses, value)} onClear={() => setStatuses([])} />
          <FacetFilter title="Website" options={uniqueFilterOptions(websiteOrders.map((order) => order.websiteLabel || "Template website"))} selected={websites} onToggle={(value) => toggle(setWebsites, websites, value)} onClear={() => setWebsites([])} />
          <FacetFilter title="City" options={uniqueFilterOptions(websiteOrders.map((order) => order.city || "City not set"))} selected={cities} onToggle={(value) => toggle(setCities, cities, value)} onClear={() => setCities([])} />
        </TableFilters>
        <p className="mb-3 text-sm text-muted-foreground">
          {loading ? "Loading orders..." : `${filtered.length} of ${websiteOrders.length} website orders`}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{[order.orderNumber, order.city, order.pincode].filter(Boolean).join(" · ")}</TableCell>
                <TableCell className="whitespace-nowrap">{order.websiteLabel || "Template website"}</TableCell>
                <TableCell className="whitespace-nowrap">{[order.customerName, order.customerPhone].filter(Boolean).join(" · ")}</TableCell>
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
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No website orders yet.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
