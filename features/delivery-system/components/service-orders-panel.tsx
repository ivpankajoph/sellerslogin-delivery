"use client"

import { useState, useEffect, useMemo } from 'react'
import { FileText, PackageOpen } from 'lucide-react'
import { useLocation } from '@/lib/router'
import { toast } from 'sonner'
import { formatINR } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  cancelDelhiveryShipment,
  cancelShadowfaxOrder,
  createDelhiveryPickupRequest,
  fetchShadowfaxOrderDetails,
  generateDelhiveryLabel,
  generateShadowfaxLabel,
  trackDelhiveryShipment,
  updateShadowfaxOrderData,
} from '@/features/delivery-system/lib/api'
import type { CourierOrderSummary } from '@/features/delivery-system/lib/data'
import { FacetFilter, matchesDateRange, matchesSearch, matchesSelected, TableFilters, uniqueFilterOptions } from '@/components/table-filters'

export function ServiceOrdersPanel() {
  const [orders, setOrders] = useState<any[]>([])
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [pickupTime, setPickupTime] = useState('16:00')
  const [pickupCount, setPickupCount] = useState('1')
  const [creatingPickup, setCreatingPickup] = useState(false)
  const [shadowfaxPhone, setShadowfaxPhone] = useState('')
  const [shadowfaxAddress, setShadowfaxAddress] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statuses, setStatuses] = useState<string[]>([])
  const [services, setServices] = useState<string[]>([])
  const [vendors, setVendors] = useState<string[]>([])
  const toggle = (setter: (value: string[]) => void, selected: string[], value: string) =>
    setter(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  const filteredOrders = useMemo(
    () => orders.filter((order) =>
      matchesSelected(statuses, order.status || 'Requested') &&
      matchesSelected(services, order.serviceTitle || order.serviceId || '') &&
      matchesSelected(vendors, order.vendorName || '-') &&
      matchesDateRange(order.createdAt, dateFrom, dateTo) &&
      matchesSearch(search, [order.id, order.customerName, order.customerPhone, order.destination, order.vehicle, order.waybill, order.price])
    ),
    [dateFrom, dateTo, orders, search, services, statuses, vendors]
  )
  
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
        externalId: o.external_id,
        trackingUrl: o.tracking_url,
        partner: o.partner,
        orderModel: o.order_model,
        sourceOrderId: o.source_order_id,
        waybill: o.waybill || o.external_id,
      })) || []
      setOrders(mappedOrders)
    } catch (e) {
      console.error('Failed to load orders', e)
    }
  }

  const courierOrder = (order: { sourceOrderId?: string }) =>
    ({ id: order.sourceOrderId || '', source: 'orders' }) as CourierOrderSummary

  const findLink = (value: unknown): string => {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = findLink(entry)
        if (found) return found
      }
      return ''
    }
    if (value && typeof value === 'object') {
      for (const entry of Object.values(value as Record<string, unknown>)) {
        const found = findLink(entry)
        if (found) return found
      }
    }
    return ''
  }

  const handleDelete = (_orderId: string) => {
    toast.error('Delete functionality is not implemented yet.')
  }

  const trackShipment = async (order: { sourceOrderId?: string; waybill?: string }) => {
    if (!order.sourceOrderId) return toast.error('This request was not sent to Delhivery')
    try {
      const result = await trackDelhiveryShipment(courierOrder(order))
      const status = result?.tracking?.status || result?.tracking?.status_description || 'Tracking loaded'
      toast.success(String(status))
      setSelectedOrder((current: any) => current ? { ...current, tracking: result?.tracking || result } : current)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Delhivery tracking failed')
    }
  }

  const printLabel = async (order: { sourceOrderId?: string; waybill?: string }) => {
    if (!order.sourceOrderId || !order.waybill) return toast.error('A Delhivery waybill is required for the label')
    try {
      const result = await generateDelhiveryLabel(courierOrder(order), { pdf: true, pdf_size: '4R', waybill: order.waybill })
      const url = findLink(result?.label) || findLink(result?.response)
      if (!url) return toast.error('Delhivery did not return a label link')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Label generation failed')
    }
  }

  const schedulePickup = async (order: { sourceOrderId?: string; waybill?: string; item?: { quantity?: number } }) => {
    if (!order.sourceOrderId || !order.waybill) return toast.error('A Delhivery waybill is required before pickup')
    setCreatingPickup(true)
    try {
      const result = await createDelhiveryPickupRequest(courierOrder(order), {
        pickup_date: pickupDate,
        pickup_time: pickupTime.length === 5 ? `${pickupTime}:00` : pickupTime,
        expected_package_count: Number(pickupCount || order.item?.quantity || 1),
      })
      const pickupId = result?.pickup_request?.pickup_id || result?.pickup_request?.pickup_request_id || result?.response?.pickup_id
      toast.success(pickupId ? `Pickup requested. Id ${pickupId}` : 'Pickup request sent to Delhivery')
      setSelectedOrder((current: any) => current ? { ...current, pickupRequestId: pickupId || 'Requested' } : current)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Delhivery pickup request failed')
    } finally {
      setCreatingPickup(false)
    }
  }

  const shadowfaxAwb = (order: { waybill?: string; externalId?: string }) => order.waybill || order.externalId || ''

  const trackShadowfax = async (order: { waybill?: string; externalId?: string }) => {
    const awb = shadowfaxAwb(order)
    if (!awb) return toast.error('Shadowfax waybill is missing')
    try {
      const result = await fetchShadowfaxOrderDetails(awb)
      const status = result?.tracking?.status || result?.tracking?.current_status?.status || 'Tracking loaded'
      toast.success(String(status))
      setSelectedOrder((current: any) => current ? { ...current, tracking: result?.tracking || result } : current)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Shadowfax tracking failed')
    }
  }

  const printShadowfaxLabel = async (order: { waybill?: string; externalId?: string }) => {
    const awb = shadowfaxAwb(order)
    if (!awb) return toast.error('Shadowfax waybill is missing')
    try {
      const result = await generateShadowfaxLabel(awb)
      const url = result?.label_url || result?.response?.data?.label_url || ''
      if (!url) return toast.error('Shadowfax did not return a label link')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Shadowfax label failed')
    }
  }

  const cancelShadowfax = async (order: { waybill?: string; externalId?: string }) => {
    const awb = shadowfaxAwb(order)
    if (!awb) return toast.error('Shadowfax waybill is missing')
    try {
      await cancelShadowfaxOrder({ request_id: awb, cancel_remarks: 'Cancelled from SellersLogin dashboard' })
      toast.success('Cancellation sent to Shadowfax')
      setSelectedOrder((current: any) => current ? { ...current, status: 'Cancelled' } : current)
      void loadOrders()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Shadowfax cancellation failed')
    }
  }

  const updateShadowfax = async (order: { waybill?: string; externalId?: string }) => {
    const awb = shadowfaxAwb(order)
    if (!awb) return toast.error('Shadowfax waybill is missing')
    if (!shadowfaxPhone && !shadowfaxAddress) return toast.error('Enter a phone or address to update')
    try {
      await updateShadowfaxOrderData({
        awb_number: awb,
        delivery_details: {
          ...(shadowfaxPhone ? { contact: shadowfaxPhone } : {}),
          ...(shadowfaxAddress ? { address_line_1: shadowfaxAddress } : {}),
        },
      })
      toast.success('Shadowfax delivery details updated')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Shadowfax update failed')
    }
  }

  const cancelShipment = async (order: { sourceOrderId?: string; waybill?: string }) => {
    if (!order.sourceOrderId || !order.waybill) return toast.error('A Delhivery waybill is required to cancel')
    try {
      await cancelDelhiveryShipment(courierOrder(order), { waybill: order.waybill })
      toast.success('Cancellation sent to Delhivery')
      setSelectedOrder((current: any) => current ? { ...current, status: 'Cancelled' } : current)
      void loadOrders()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Delhivery cancellation failed')
    }
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
      <TableFilters
        search={search}
        onSearchChange={setSearch}
        placeholder="Search order, customer, waybill"
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        active={Boolean(search || dateFrom || dateTo || statuses.length || services.length || vendors.length)}
        onReset={() => { setSearch(''); setDateFrom(''); setDateTo(''); setStatuses([]); setServices([]); setVendors([]) }}
      >
        <FacetFilter title="Status" options={uniqueFilterOptions(orders.map((order) => order.status || 'Requested'))} selected={statuses} onToggle={(value) => toggle(setStatuses, statuses, value)} onClear={() => setStatuses([])} />
        <FacetFilter title="Service" options={uniqueFilterOptions(orders.map((order) => order.serviceTitle || order.serviceId))} selected={services} onToggle={(value) => toggle(setServices, services, value)} onClear={() => setServices([])} />
        <FacetFilter title="Vendor" options={uniqueFilterOptions(orders.map((order) => order.vendorName || '-'))} selected={vendors} onToggle={(value) => toggle(setVendors, vendors, value)} onClear={() => setVendors([])} />
      </TableFilters>
      <p className="text-sm text-muted-foreground">{filteredOrders.length} of {orders.length} custom orders showing</p>

      {filteredOrders.length === 0 ? (
        <div className="text-muted-foreground flex h-40 flex-col items-center justify-center rounded-md border border-dashed text-center">
          <PackageOpen className="size-8" />
          <p className="mt-3 text-sm font-medium">No custom service orders found</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Order ID</TableHead>
              <TableHead>Service & vehicle</TableHead>
              <TableHead>Courier</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</TableCell>
                <TableCell className="whitespace-nowrap font-medium">{order.id}</TableCell>
                <TableCell className="whitespace-nowrap">{[order.serviceTitle || order.serviceId, order.vehicle].filter(Boolean).join(' · ')}</TableCell>
                <TableCell className="whitespace-nowrap capitalize">{order.partner === 'shadowfax' ? 'Shadowfax' : order.partner === 'delhivery' ? 'Delhivery' : '-'}</TableCell>
                <TableCell className="whitespace-nowrap">{order.vendorName || '-'}</TableCell>
                <TableCell className="whitespace-nowrap">{[order.customerName, order.customerPhone].filter(Boolean).join(' · ') || '-'}</TableCell>
                <TableCell className="max-w-[240px] truncate whitespace-nowrap">{order.destination}</TableCell>
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
                    {selectedOrder.externalId ? (
                      <p className="text-muted-foreground text-xs">{selectedOrder.externalId}</p>
                    ) : null}
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
              {selectedOrder.partner === 'delhivery' ? (
                <div className="rounded-lg border p-3 sm:col-span-2">
                  <p className="text-muted-foreground text-xs">Delhivery</p>
                  <p className="mt-1 text-sm font-medium">{selectedOrder.waybill || 'Not sent to Delhivery yet'}</p>
                  {selectedOrder.waybill ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void trackShipment(selectedOrder)}>Track</Button>
                      <Button size="sm" variant="outline" onClick={() => void printLabel(selectedOrder)}>Shipping label</Button>
                      <Button size="sm" variant="outline" onClick={() => void cancelShipment(selectedOrder)}>Cancel</Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-sm">This row is only saved in SellersLogin. Delhivery did not accept the shipment, so it will not appear in the Delhivery dashboard.</p>
                  )}
                  {selectedOrder.waybill ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Pickup date</Label>
                        <Input type="date" value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Pickup time</Label>
                        <Input type="time" value={pickupTime} onChange={(event) => setPickupTime(event.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Packages</Label>
                        <Input value={pickupCount} onChange={(event) => setPickupCount(event.target.value)} inputMode="numeric" />
                      </div>
                      <div className="sm:col-span-3">
                        <Button size="sm" onClick={() => void schedulePickup(selectedOrder)} disabled={creatingPickup}>
                          {creatingPickup ? 'Requesting pickup...' : 'Create pickup'}
                        </Button>
                        {selectedOrder.pickupRequestId ? (
                          <p className="text-muted-foreground mt-2 text-sm">Pickup: {selectedOrder.pickupRequestId}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {selectedOrder.tracking?.status ? (
                    <p className="mt-2 text-sm">{selectedOrder.tracking.status}</p>
                  ) : null}
                </div>
              ) : null}
              {selectedOrder.partner === 'shadowfax' || (selectedOrder.externalId && selectedOrder.partner !== 'delhivery') ? (
                <div className="rounded-lg border p-3 sm:col-span-2">
                  <p className="text-muted-foreground text-xs">Shadowfax</p>
                  <p className="mt-1 text-sm font-medium">{shadowfaxAwb(selectedOrder) || 'Not sent to Shadowfax yet'}</p>
                  {shadowfaxAwb(selectedOrder) ? (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => void trackShadowfax(selectedOrder)}>Track</Button>
                        <Button size="sm" variant="outline" onClick={() => void printShadowfaxLabel(selectedOrder)}>Print label</Button>
                        <Button size="sm" variant="outline" onClick={() => void cancelShadowfax(selectedOrder)}>Cancel</Button>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Update phone</Label>
                          <Input value={shadowfaxPhone} onChange={(event) => setShadowfaxPhone(event.target.value)} placeholder="Customer phone" />
                        </div>
                        <div className="space-y-1">
                          <Label>Update address</Label>
                          <Input value={shadowfaxAddress} onChange={(event) => setShadowfaxAddress(event.target.value)} placeholder="Delivery address" />
                        </div>
                        <div className="sm:col-span-2">
                          <Button size="sm" onClick={() => void updateShadowfax(selectedOrder)}>Update delivery details</Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-sm">This row is only saved in SellersLogin. Shadowfax did not return a waybill.</p>
                  )}
                  {selectedOrder.tracking?.status && selectedOrder.partner === 'shadowfax' ? (
                    <p className="mt-2 text-sm">{selectedOrder.tracking.status}</p>
                  ) : null}
                </div>
              ) : null}
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
