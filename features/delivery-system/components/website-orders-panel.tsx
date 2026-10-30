"use client"

import { Button } from "@/components/ui/button"
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Website orders</CardTitle>
        <CardDescription>
          Orders placed on this vendor&apos;s template websites, including sites with a connected domain.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          {loading ? "Loading orders..." : `${websiteOrders.length} website orders`}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {websiteOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <p className="font-medium">{order.orderNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.city || "City not set"} {order.pincode ? `· ${order.pincode}` : ""}
                  </p>
                </TableCell>
                <TableCell>{order.websiteLabel || "Template website"}</TableCell>
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
            {!loading && !websiteOrders.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
