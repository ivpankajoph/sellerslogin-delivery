"use client"

import { useState, useEffect } from 'react'
import { FileText, PackageOpen } from 'lucide-react'
import { useLocation } from '@/lib/router'
import { toast } from 'sonner'
import { formatINR } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DELIVERY_SERVICE_CATALOG } from '../index'
import api from '@/lib/axios'

export function ServiceOrdersPanel() {
  const [orders, setOrders] = useState<any[]>([])
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  
  // Removed unused vendorName & isAdmin since backend does the filtering

  const searchParams = new URLSearchParams(useLocation({ select: (l) => l.searchStr }))
  const typeFilter = searchParams.get('type')
  const activeService = DELIVERY_SERVICE_CATALOG.find(s => s.id === typeFilter)

  const loadOrders = async () => {
    try {
      const res = await api.get('/delivery-bookings' + (typeFilter ? `?serviceId=${typeFilter}` : ''))
      const mappedOrders = res.data?.data?.map((o: any) => ({
        id: o._id,
        serviceId: o.service_id,
        serviceTitle: o.service_title,
        vehicle: o.vehicle,
        vendorName: o.vendor_name,
        createdAt: o.createdAt,
        status: o.status,
        price: o.estimated_price,
        customerName: o.drop?.name || '-',
        customerPhone: o.drop?.phone || '-',
        destination: [o.drop?.address_line_1, o.drop?.city, o.drop?.state, o.drop?.pincode].filter(Boolean).join(', '),
        pickup: o.pickup,
        drop: o.drop,
        item: o.item,
        distance: o.duration_text,
      })) || []
      setOrders(mappedOrders)
    } catch (e) {
      console.error('Failed to load orders', e)
    }
  }

  const handleDelete = async (_orderId: string) => {
    toast.error('Delete functionality is not implemented yet.')
  }

  useEffect(() => {
    loadOrders()
  }, [typeFilter])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="size-4" />
          {activeService ? `${activeService.title} Requests` : 'Delivery Requests'}
        </CardTitle>
        <CardDescription>
          {activeService
            ? `View all requests submitted by vendors for ${activeService.title}.`
            : 'View all requests placed through dedicated delivery service pages.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{orders.length} custom orders showing</p>

      {orders.length === 0 ? (
        <div className="text-muted-foreground flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-center">
          <PackageOpen className="size-8" />
          <p className="mt-3 text-sm font-medium">No custom service orders found</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Service & vehicle</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <p className="font-medium">{order.id}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(order.createdAt).toLocaleString('en-IN')}
                  </p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{order.serviceTitle || order.serviceId}</p>
                  {order.vehicle ? (
                    <p className="text-muted-foreground text-xs">{order.vehicle}</p>
                  ) : null}
                </TableCell>
                <TableCell>{order.vendorName || '-'}</TableCell>
                <TableCell>
                  <p>{order.customerName}</p>
                  <p className="text-muted-foreground text-xs">{order.customerPhone}</p>
                </TableCell>
                <TableCell className="max-w-[220px] whitespace-normal">
                  <p className="truncate">{order.destination}</p>
                </TableCell>
                <TableCell className="font-medium">{formatINR(order.price)}</TableCell>
                <TableCell className="capitalize">{order.status}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={() => setSelectedOrder(order)}>
                      View
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDelete(order.id)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Order Details</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/40 p-3 sm:col-span-2">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground text-xs">Order ID</p>
                    <p className="truncate text-sm font-medium" title={selectedOrder.id}>{selectedOrder.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Status</p>
                    <Badge variant="outline" className="mt-1 capitalize">{selectedOrder.status}</Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Service</p>
                    <p className="text-sm font-medium">{selectedOrder.serviceTitle || selectedOrder.serviceId}</p>
                    <p className="text-muted-foreground text-xs">{selectedOrder.vehicle || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Price</p>
                    <p className="text-sm font-medium">{formatINR(selectedOrder.price)}</p>
                    <p className="text-muted-foreground text-xs">{new Date(selectedOrder.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Pickup</p>
                <p className="mt-1 text-sm font-medium">{selectedOrder.pickup?.name || '-'} ({selectedOrder.pickup?.phone || '-'})</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {[selectedOrder.pickup?.flat_building, selectedOrder.pickup?.address_line_1, selectedOrder.pickup?.address_line_2, selectedOrder.pickup?.city, selectedOrder.pickup?.state, selectedOrder.pickup?.pincode].filter(Boolean).join(', ') || '-'}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Drop</p>
                <p className="mt-1 text-sm font-medium">{selectedOrder.drop?.name || '-'} ({selectedOrder.drop?.phone || '-'})</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {[selectedOrder.drop?.flat_building, selectedOrder.drop?.address_line_1, selectedOrder.drop?.address_line_2, selectedOrder.drop?.city, selectedOrder.drop?.state, selectedOrder.drop?.pincode].filter(Boolean).join(', ') || '-'}
                </p>
              </div>
              <div className="rounded-lg border p-3 sm:col-span-2">
                <p className="text-muted-foreground text-xs">Item</p>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground text-xs">Description</p>
                    <p className="text-sm font-medium">{selectedOrder.item?.description || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Quantity</p>
                    <p className="text-sm font-medium">{selectedOrder.item?.quantity || 1}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Weight</p>
                    <p className="text-sm font-medium">{selectedOrder.item?.weight_kg ? `${selectedOrder.item.weight_kg} kg` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Dimensions</p>
                    <p className="text-sm font-medium">{selectedOrder.item?.length_cm ? `${selectedOrder.item.length_cm}x${selectedOrder.item.width_cm}x${selectedOrder.item.height_cm} cm` : '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </CardContent>
    </Card>
  )
}
