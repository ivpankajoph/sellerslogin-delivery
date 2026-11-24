"use client"

import { useState, useEffect, useMemo } from 'react'
import {
  Ban,
  CalendarClock,
  ChevronDown,
  Eye,
  FileCheck2,
  FileText,
  Headphones,
  Loader2,
  MapPin,
  PackageOpen,
  PencilLine,
  Printer,
  RefreshCcw,
  RotateCcw,
} from 'lucide-react'
import { useLocation } from '@/lib/router'
import { toast } from 'sonner'
import { formatINR } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  createShadowfaxEscalation,
  createDelhiveryPickupRequest,
  cancelHyperlocalOrder,
  cancelQuickCommerceOrder,
  editDelhiveryShipment,
  editHyperlocalOrder,
  fetchShadowfaxPodDetails,
  fetchHyperlocalOrder,
  fetchShadowfaxOrderDetails,
  generateDelhiveryLabel,
  generateShadowfaxLabel,
  markHyperlocalDispatchReady,
  markQuickCommerceReady,
  trackDelhiveryShipment,
  updateShadowfaxOrderData,
} from '@/features/delivery-system/lib/api'
import { runVelocityOperation } from '@/features/velocity/lib/api'
import type { CourierOrderSummary } from '@/features/delivery-system/lib/data'
import { PartnerLogo } from '@/components/shared/partner-logo'
import { FacetFilter, matchesDateRange, matchesSearch, matchesSelected, TableFilters, uniqueFilterOptions } from '@/components/table-filters'

type CourierTool =
  | 'details'
  | 'delhivery-edit'
  | 'delhivery-pickup'
  | 'shadowfax-edit'
  | 'shadowfax-support'
  | 'velocity-update'
  | 'velocity-reattempt'
  | 'confirm-cancel'
  | 'confirm-rto'

const providerLabel = (provider: string) =>
  provider === 'delhivery'
    ? 'Delhivery'
    : provider === 'shadowfax'
      ? 'Shadowfax'
      : provider === 'velocity'
        ? 'Velocity Shipping'
        : 'Courier'

const errorMessage = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.message || fallback

export function ServiceOrdersPanel() {
  const [orders, setOrders] = useState<any[]>([])
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [pickupTime, setPickupTime] = useState('16:00')
  const [pickupCount, setPickupCount] = useState('1')
  const [creatingPickup, setCreatingPickup] = useState(false)
  const [shadowfaxPhone, setShadowfaxPhone] = useState('')
  const [shadowfaxAddress, setShadowfaxAddress] = useState('')
  const [activeTool, setActiveTool] = useState<CourierTool>('details')
  const [toolBusy, setToolBusy] = useState('')
  const [toolResult, setToolResult] = useState<unknown>(null)
  const [delhiveryEdit, setDelhiveryEdit] = useState({
    name: '', phone: '', address: '', paymentMode: '', description: '', weight: '',
  })
  const [supportCategory, setSupportCategory] = useState('Delivery issue')
  const [velocityUpdate, setVelocityUpdate] = useState({
    orderId: '', name: '', phone: '', address: '', city: '', state: '', pincode: '', weight: '',
  })
  const [velocityReattempt, setVelocityReattempt] = useState({ phone: '', address: '', landmark: '', comments: '' })
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
  const activeService = DELIVERY_SERVICE_CATALOG.find((service) => service.key === typeFilter)
  const serviceQuery = activeService?.id || typeFilter || ''

  const loadOrders = async () => {
    try {
      const res = await api.get('/delivery-bookings' + (serviceQuery ? `?serviceId=${serviceQuery}` : ''))
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
        carrierId: o.carrier_id,
        carrierName: o.carrier_name,
        orderModel: o.order_model,
        sourceOrderId: o.source_order_id,
        sourceOrderType: o.source_order_type,
        waybill: o.waybill || o.external_id,
      })) || []
      const visibleOrders = activeService?.product
        ? mappedOrders.filter((order: { orderModel?: string }) => order.orderModel === activeService.product)
        : mappedOrders
      setOrders(visibleOrders)
    } catch (e) {
      console.error('Failed to load orders', e)
    }
  }

  const courierOrder = (order: { sourceOrderId?: string; sourceOrderType?: string }) =>
    ({
      id: order.sourceOrderId || '',
      source: order.sourceOrderType === 'template-orders' ? 'template-orders' : 'orders',
    }) as CourierOrderSummary

  const openTool = (order: any, tool: CourierTool = 'details') => {
    setSelectedOrder(order)
    setActiveTool(tool)
    setToolResult(null)
    setShadowfaxPhone(order.customerPhone === '-' ? '' : order.customerPhone || '')
    setShadowfaxAddress(order.destination || '')
    setDelhiveryEdit({
      name: order.customerName === '-' ? '' : order.customerName || '',
      phone: order.customerPhone === '-' ? '' : order.customerPhone || '',
      address: order.destination || '',
      paymentMode: '',
      description: order.item?.description || '',
      weight: order.item?.weight_kg ? String(Number(order.item.weight_kg) * 1000) : '',
    })
    setVelocityUpdate({
      orderId: order.externalId || order.waybill || '',
      name: order.customerName === '-' ? '' : order.customerName || '',
      phone: order.customerPhone === '-' ? '' : order.customerPhone || '',
      address: order.drop?.address_line_1 || '',
      city: order.drop?.city || '',
      state: order.drop?.state || '',
      pincode: order.drop?.pincode || '',
      weight: order.item?.weight_kg ? String(order.item.weight_kg) : '',
    })
    setVelocityReattempt({
      phone: order.customerPhone === '-' ? '' : order.customerPhone || '',
      address: order.drop?.address_line_1 || '',
      landmark: order.drop?.landmark || '',
      comments: '',
    })
  }

  const withToolBusy = async (key: string, action: () => Promise<void>) => {
    setToolBusy(key)
    try {
      await action()
    } finally {
      setToolBusy('')
    }
  }

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

  const trackShipment = async (order: { sourceOrderId?: string; waybill?: string }) => {
    if (!order.sourceOrderId) return toast.error('This request was not sent to Delhivery')
    try {
      const result = await trackDelhiveryShipment(courierOrder(order))
      const status = result?.tracking?.status || result?.tracking?.status_description || 'Tracking loaded'
      toast.success(String(status))
      setToolResult(result?.tracking || result)
      setSelectedOrder((current: any) => current ? { ...current, tracking: result?.tracking || result } : current)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Delhivery tracking failed')
    }
  }

  const updateDelhivery = async (order: { sourceOrderId?: string; waybill?: string }) => {
    if (!order.sourceOrderId || !order.waybill) return toast.error('A Delhivery waybill is required to edit this shipment')
    const payload = {
      waybill: order.waybill,
      name: delhiveryEdit.name,
      phone: delhiveryEdit.phone,
      add: delhiveryEdit.address,
      pt: delhiveryEdit.paymentMode,
      products_desc: delhiveryEdit.description,
      ...(delhiveryEdit.weight ? { gm: Number(delhiveryEdit.weight) } : {}),
    }
    await withToolBusy('delhivery-edit', async () => {
      try {
        const result = await editDelhiveryShipment(courierOrder(order), payload)
        setToolResult(result?.shipment || result?.response || result)
        toast.success('Delhivery shipment updated')
        setActiveTool('details')
      } catch (error: any) {
        toast.error(errorMessage(error, 'Delhivery update failed'))
      }
    })
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
  const isHyperlocal = (order: { orderModel?: string; serviceId?: string }) =>
    order.orderModel === 'hyperlocal' || order.serviceId === 'hyperlocal'
  const isQuickCommerce = (order: { orderModel?: string; serviceId?: string }) =>
    order.orderModel === 'quick_commerce' || order.serviceId === 'quick-commerce'

  const trackShadowfax = async (order: { waybill?: string; externalId?: string }) => {
    const awb = shadowfaxAwb(order)
    if (!awb) return toast.error('Shadowfax waybill is missing')
    try {
      const result = isHyperlocal(order as any)
        ? await fetchHyperlocalOrder(awb)
        : await fetchShadowfaxOrderDetails(awb)
      const status = result?.tracking?.status || result?.tracking?.current_status?.status || 'Tracking loaded'
      toast.success(String(status))
      setToolResult(result?.tracking || result)
      setSelectedOrder((current: any) => current ? { ...current, tracking: result?.tracking || result } : current)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Shadowfax tracking failed')
    }
  }

  const raiseShadowfaxIssue = async (order: { waybill?: string; externalId?: string }) => {
    const awb = shadowfaxAwb(order)
    if (!awb) return toast.error('Shadowfax waybill is missing')
    if (!supportCategory.trim()) return toast.error('Enter an issue category')
    await withToolBusy('shadowfax-support', async () => {
      try {
        const result = await createShadowfaxEscalation({ awb_number: awb, issue_category: supportCategory.trim() })
        setToolResult(result)
        toast.success('Support issue raised with Shadowfax')
        setActiveTool('details')
      } catch (error: any) {
        toast.error(errorMessage(error, 'Shadowfax escalation failed'))
      }
    })
  }

  const loadShadowfaxPod = async (order: { waybill?: string; externalId?: string }) => {
    const awb = shadowfaxAwb(order)
    if (!awb) return toast.error('Shadowfax waybill is missing')
    await withToolBusy('shadowfax-pod', async () => {
      try {
        const result = await fetchShadowfaxPodDetails({ awb_numbers: [awb] })
        setToolResult(result)
        const url = findLink(result)
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
        toast.success(url ? 'POD opened' : 'POD details loaded')
      } catch (error: any) {
        toast.error(errorMessage(error, 'Shadowfax POD request failed'))
      }
    })
  }

  const markShadowfaxReady = async (order: { waybill?: string; externalId?: string; sourceOrderId?: string }) => {
    const reference = shadowfaxAwb(order)
    if (!reference) return toast.error('Shadowfax reference is missing')
    await withToolBusy('shadowfax-ready', async () => {
      try {
        const result = isHyperlocal(order as any)
          ? await markHyperlocalDispatchReady(order.sourceOrderId || reference)
          : await markQuickCommerceReady({ awb_number: reference, is_ready_for_pickup: true })
        setToolResult(result)
        toast.success(isHyperlocal(order as any) ? 'Marked dispatch ready' : 'Marked ready for pickup')
      } catch (error: any) {
        toast.error(errorMessage(error, 'Shadowfax ready update failed'))
      }
    })
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
      if (isHyperlocal(order as any)) {
        await cancelHyperlocalOrder(awb, { reason: 'Cancelled from SellersLogin dashboard', user: 'Seller' })
      } else if (isQuickCommerce(order as any)) {
        await cancelQuickCommerceOrder({ awb_number: awb, cancel_remarks: 'Cancelled from SellersLogin dashboard' })
      } else {
        await cancelShadowfaxOrder({ request_id: awb, cancel_remarks: 'Cancelled from SellersLogin dashboard' })
      }
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
      if (isHyperlocal(order as any)) {
        const current = order as any
        await editHyperlocalOrder(awb, {
          order_details: {
            client_order_id: current.sourceOrderId || current.id,
            order_value: Number(current.price || 0),
            paid: true,
          },
          pickup_details: {
            name: current.pickup?.name,
            contact_number: current.pickup?.phone,
            address: current.pickup?.address_line_1,
            city: current.pickup?.city,
            latitude: current.pickup?.latitude,
            longitude: current.pickup?.longitude,
          },
          drop_details: {
            name: current.drop?.name,
            contact_number: shadowfaxPhone || current.drop?.phone,
            address: shadowfaxAddress || current.drop?.address_line_1,
            city: current.drop?.city,
            latitude: current.drop?.latitude,
            longitude: current.drop?.longitude,
          },
          order_items: [{
            id: 'item-1',
            name: current.item?.description || 'Shipment item',
            price: Number(current.price || 0),
            quantity: Number(current.item?.quantity || 1),
          }],
        })
      } else {
        await updateShadowfaxOrderData({
          awb_number: awb,
          delivery_details: {
            ...(shadowfaxPhone ? { contact: shadowfaxPhone } : {}),
            ...(shadowfaxAddress ? { address_line_1: shadowfaxAddress } : {}),
          },
        })
      }
      toast.success('Shadowfax delivery details updated')
      setActiveTool('details')
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

  const velocityAwb = (order: { waybill?: string; externalId?: string }) => order.waybill || order.externalId || ''

  const trackVelocity = async (order: { waybill?: string; externalId?: string }) => {
    const awb = velocityAwb(order)
    if (!awb) return toast.error('Velocity AWB is missing')
    await withToolBusy('velocity-track', async () => {
      try {
        const result = await runVelocityOperation('tracking', { awbs: [awb] })
        setToolResult(result)
        toast.success('Velocity tracking loaded')
      } catch (error: any) {
        toast.error(errorMessage(error, 'Velocity tracking failed'))
      }
    })
  }

  const updateVelocity = async () => {
    if (!selectedOrder) return
    if (!velocityUpdate.orderId.trim()) return toast.error('Velocity order ID is required')
    await withToolBusy('velocity-update', async () => {
      try {
        const shippingAddress = {
          name: velocityUpdate.name.trim(),
          phone: velocityUpdate.phone.trim(),
          address: velocityUpdate.address.trim(),
          city: velocityUpdate.city.trim(),
          state: velocityUpdate.state.trim(),
          country: 'India',
          zip: velocityUpdate.pincode.trim(),
        }
        const result = await runVelocityOperation('order-update', {
          order_id: velocityUpdate.orderId.trim(),
          order: {
            ...(velocityUpdate.weight ? { weight: Number(velocityUpdate.weight) } : {}),
            ...(Object.values(shippingAddress).some(Boolean) ? { shipping_address: shippingAddress } : {}),
          },
        })
        setToolResult(result)
        toast.success('Velocity order updated')
        setActiveTool('details')
      } catch (error: any) {
        toast.error(errorMessage(error, 'Velocity update failed'))
      }
    })
  }

  const reattemptVelocity = async () => {
    if (!selectedOrder) return
    const awb = velocityAwb(selectedOrder)
    if (!awb) return toast.error('Velocity AWB is missing')
    await withToolBusy('velocity-reattempt', async () => {
      try {
        const result = await runVelocityOperation('reattempt', {
          awb,
          updated_phone_number: velocityReattempt.phone.trim(),
          updated_address: {
            address_line: velocityReattempt.address.trim(),
            landmark: velocityReattempt.landmark.trim(),
          },
          comments: velocityReattempt.comments.trim(),
        })
        setToolResult(result)
        toast.success('Velocity NDR re-attempt requested')
        setActiveTool('details')
      } catch (error: any) {
        toast.error(errorMessage(error, 'Velocity re-attempt failed'))
      }
    })
  }

  const cancelVelocity = async (order: { waybill?: string; externalId?: string }) => {
    const awb = velocityAwb(order)
    if (!awb) return toast.error('Velocity AWB is missing')
    await withToolBusy('velocity-cancel', async () => {
      try {
        const result = await runVelocityOperation('order-cancel', { awbs: [awb] })
        setToolResult(result)
        setSelectedOrder((current: any) => current ? { ...current, status: 'Cancelled' } : current)
        toast.success('Cancellation sent to Velocity')
        void loadOrders()
      } catch (error: any) {
        toast.error(errorMessage(error, 'Velocity cancellation failed'))
      }
    })
  }

  const rtoVelocity = async (order: { waybill?: string; externalId?: string }) => {
    const awb = velocityAwb(order)
    if (!awb) return toast.error('Velocity AWB is missing')
    await withToolBusy('velocity-rto', async () => {
      try {
        const result = await runVelocityOperation('initiate-rto', { awb })
        setToolResult(result)
        toast.success('RTO initiated through Velocity')
        setActiveTool('details')
      } catch (error: any) {
        toast.error(errorMessage(error, 'Velocity RTO failed'))
      }
    })
  }

  const confirmCourierAction = async () => {
    if (!selectedOrder) return
    if (activeTool === 'confirm-rto') {
      await rtoVelocity(selectedOrder)
      return
    }
    if (selectedOrder.partner === 'delhivery') await cancelShipment(selectedOrder)
    if (selectedOrder.partner === 'shadowfax') await cancelShadowfax(selectedOrder)
    if (selectedOrder.partner === 'velocity') await cancelVelocity(selectedOrder)
    setActiveTool('details')
  }

  useEffect(() => {
    loadOrders()
  }, [serviceQuery, activeService?.product])

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
                <TableCell className="whitespace-nowrap capitalize">
                  {order.partner ? (
                    <PartnerLogo partner={order.partner} size="xs" />
                  ) : '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap">{order.vendorName || '-'}</TableCell>
                <TableCell className="whitespace-nowrap">{[order.customerName, order.customerPhone].filter(Boolean).join(' · ') || '-'}</TableCell>
                <TableCell className="max-w-[240px] truncate whitespace-nowrap">{order.destination}</TableCell>
                <TableCell className="font-medium">{formatINR(order.price)}</TableCell>
                <TableCell className="capitalize">{order.status}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="min-w-24 justify-between">
                        Action <ChevronDown className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60 rounded-lg p-1.5">
                      <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                        {order.partner ? <PartnerLogo partner={order.partner} size="xs" showName={false} /> : null}
                        {providerLabel(order.partner)} tools
                      </DropdownMenuLabel>
                      <DropdownMenuItem onSelect={() => openTool(order)}><Eye />View request details</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {order.partner === 'delhivery' ? (
                        <>
                          <DropdownMenuItem disabled={!order.waybill || !order.sourceOrderId} onSelect={() => { openTool(order); void trackShipment(order) }}><MapPin />Track shipment</DropdownMenuItem>
                          <DropdownMenuItem disabled={!order.waybill || !order.sourceOrderId} onSelect={() => { openTool(order); void printLabel(order) }}><Printer />Shipping label</DropdownMenuItem>
                          <DropdownMenuItem disabled={!order.waybill || !order.sourceOrderId} onSelect={() => openTool(order, 'delhivery-edit')}><PencilLine />Edit shipment</DropdownMenuItem>
                          <DropdownMenuItem disabled={!order.waybill || !order.sourceOrderId} onSelect={() => openTool(order, 'delhivery-pickup')}><CalendarClock />Schedule pickup</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" disabled={!order.waybill || !order.sourceOrderId} onSelect={() => openTool(order, 'confirm-cancel')}><Ban />Cancel shipment</DropdownMenuItem>
                        </>
                      ) : null}
                      {order.partner === 'shadowfax' ? (
                        <>
                          <DropdownMenuItem disabled={!shadowfaxAwb(order)} onSelect={() => { openTool(order); void trackShadowfax(order) }}><MapPin />Track / order details</DropdownMenuItem>
                          {!isHyperlocal(order) ? <DropdownMenuItem disabled={!shadowfaxAwb(order)} onSelect={() => { openTool(order); void printShadowfaxLabel(order) }}><Printer />Shipping label</DropdownMenuItem> : null}
                          {!isQuickCommerce(order) ? <DropdownMenuItem disabled={!shadowfaxAwb(order)} onSelect={() => openTool(order, 'shadowfax-edit')}><PencilLine />Edit delivery details</DropdownMenuItem> : null}
                          {isHyperlocal(order) || isQuickCommerce(order) ? <DropdownMenuItem disabled={!shadowfaxAwb(order)} onSelect={() => { openTool(order); void markShadowfaxReady(order) }}><FileCheck2 />{isHyperlocal(order) ? 'Mark dispatch ready' : 'Mark ready for pickup'}</DropdownMenuItem> : null}
                          <DropdownMenuItem disabled={!shadowfaxAwb(order)} onSelect={() => openTool(order, 'shadowfax-support')}><Headphones />Raise support issue</DropdownMenuItem>
                          {!isHyperlocal(order) ? <DropdownMenuItem disabled={!shadowfaxAwb(order)} onSelect={() => { openTool(order); void loadShadowfaxPod(order) }}><FileCheck2 />Proof of delivery</DropdownMenuItem> : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" disabled={!shadowfaxAwb(order)} onSelect={() => openTool(order, 'confirm-cancel')}><Ban />Cancel shipment</DropdownMenuItem>
                        </>
                      ) : null}
                      {order.partner === 'velocity' ? (
                        <>
                          <DropdownMenuItem disabled={!velocityAwb(order)} onSelect={() => { openTool(order); void trackVelocity(order) }}><MapPin />Track shipment</DropdownMenuItem>
                          <DropdownMenuItem disabled={!velocityAwb(order)} onSelect={() => openTool(order, 'velocity-update')}><PencilLine />Update order</DropdownMenuItem>
                          <DropdownMenuItem disabled={!velocityAwb(order)} onSelect={() => openTool(order, 'velocity-reattempt')}><RefreshCcw />NDR re-attempt</DropdownMenuItem>
                          <DropdownMenuItem disabled={!velocityAwb(order)} onSelect={() => openTool(order, 'confirm-rto')}><RotateCcw />Initiate RTO</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" disabled={!velocityAwb(order)} onSelect={() => openTool(order, 'confirm-cancel')}><Ban />Cancel shipment</DropdownMenuItem>
                        </>
                      ) : null}
                      {!['delhivery', 'shadowfax', 'velocity'].includes(order.partner) ? (
                        <DropdownMenuItem disabled>No courier API actions available</DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!selectedOrder} onOpenChange={(open) => { if (!open) { setSelectedOrder(null); setActiveTool('details'); setToolResult(null) } }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
              {selectedOrder?.partner ? <PartnerLogo partner={selectedOrder.partner} size="sm" showName={false} /> : null}
              {selectedOrder ? `${providerLabel(selectedOrder.partner)} request actions` : 'Request actions'}
            </DialogTitle>
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
                <div className="rounded-xl border p-4 sm:col-span-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <PartnerLogo partner="delhivery" size="xs" showName={false} />
                    <p className="text-sm font-semibold">Delhivery API tools</p>
                  </div>
                  <p className="mt-1 text-sm font-medium">{selectedOrder.waybill || 'Not sent to Delhivery yet'}</p>
                  {selectedOrder.waybill ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void trackShipment(selectedOrder)}><MapPin />Track</Button>
                      <Button size="sm" variant="outline" onClick={() => void printLabel(selectedOrder)}><Printer />Label</Button>
                      <Button size="sm" variant={activeTool === 'delhivery-edit' ? 'default' : 'outline'} onClick={() => setActiveTool('delhivery-edit')}><PencilLine />Edit</Button>
                      <Button size="sm" variant={activeTool === 'delhivery-pickup' ? 'default' : 'outline'} onClick={() => setActiveTool('delhivery-pickup')}><CalendarClock />Pickup</Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setActiveTool('confirm-cancel')}><Ban />Cancel</Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-sm">This row is only saved in SellersLogin. Delhivery did not accept the shipment, so it will not appear in the Delhivery dashboard.</p>
                  )}
                  {selectedOrder.waybill && activeTool === 'delhivery-edit' ? (
                    <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                      <p className="mb-3 text-sm font-semibold">Edit manifested shipment</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1"><Label>Recipient name</Label><Input value={delhiveryEdit.name} onChange={(event) => setDelhiveryEdit((current) => ({ ...current, name: event.target.value }))} /></div>
                        <div className="space-y-1"><Label>Phone</Label><Input value={delhiveryEdit.phone} onChange={(event) => setDelhiveryEdit((current) => ({ ...current, phone: event.target.value }))} /></div>
                        <div className="space-y-1 sm:col-span-2"><Label>Address</Label><Textarea value={delhiveryEdit.address} onChange={(event) => setDelhiveryEdit((current) => ({ ...current, address: event.target.value }))} /></div>
                        <div className="space-y-1"><Label>Payment mode</Label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={delhiveryEdit.paymentMode} onChange={(event) => setDelhiveryEdit((current) => ({ ...current, paymentMode: event.target.value }))}><option value="">No change</option><option value="Pre-paid">Pre-paid</option><option value="COD">COD</option><option value="Pickup">Pickup</option><option value="REPL">REPL</option></select></div>
                        <div className="space-y-1"><Label>Weight (grams)</Label><Input type="number" value={delhiveryEdit.weight} onChange={(event) => setDelhiveryEdit((current) => ({ ...current, weight: event.target.value }))} /></div>
                        <div className="space-y-1 sm:col-span-2"><Label>Product description</Label><Input value={delhiveryEdit.description} onChange={(event) => setDelhiveryEdit((current) => ({ ...current, description: event.target.value }))} /></div>
                      </div>
                      <Button className="mt-3" size="sm" onClick={() => void updateDelhivery(selectedOrder)} disabled={toolBusy === 'delhivery-edit'}>{toolBusy === 'delhivery-edit' ? <Loader2 className="animate-spin" /> : <PencilLine />}Update shipment</Button>
                    </div>
                  ) : null}
                  {selectedOrder.waybill && activeTool === 'delhivery-pickup' ? (
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
              {selectedOrder.partner === 'shadowfax' ? (
                <div className="rounded-xl border p-4 sm:col-span-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <PartnerLogo partner="shadowfax" size="xs" showName={false} />
                    <p className="text-sm font-semibold">Shadowfax API tools</p>
                  </div>
                  <p className="mt-1 text-sm font-medium">{shadowfaxAwb(selectedOrder) || 'Not sent to Shadowfax yet'}</p>
                  {shadowfaxAwb(selectedOrder) ? (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => void trackShadowfax(selectedOrder)}><MapPin />Track</Button>
                        {!isHyperlocal(selectedOrder) ? <Button size="sm" variant="outline" onClick={() => void printShadowfaxLabel(selectedOrder)}><Printer />Label</Button> : null}
                        {!isQuickCommerce(selectedOrder) ? <Button size="sm" variant={activeTool === 'shadowfax-edit' ? 'default' : 'outline'} onClick={() => setActiveTool('shadowfax-edit')}><PencilLine />Edit</Button> : null}
                        {isHyperlocal(selectedOrder) || isQuickCommerce(selectedOrder) ? <Button size="sm" variant="outline" onClick={() => void markShadowfaxReady(selectedOrder)} disabled={toolBusy === 'shadowfax-ready'}>{toolBusy === 'shadowfax-ready' ? <Loader2 className="animate-spin" /> : <FileCheck2 />}{isHyperlocal(selectedOrder) ? 'Dispatch ready' : 'Pickup ready'}</Button> : null}
                        <Button size="sm" variant={activeTool === 'shadowfax-support' ? 'default' : 'outline'} onClick={() => setActiveTool('shadowfax-support')}><Headphones />Support</Button>
                        {!isHyperlocal(selectedOrder) ? <Button size="sm" variant="outline" onClick={() => void loadShadowfaxPod(selectedOrder)} disabled={toolBusy === 'shadowfax-pod'}>{toolBusy === 'shadowfax-pod' ? <Loader2 className="animate-spin" /> : <FileCheck2 />}POD</Button> : null}
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => setActiveTool('confirm-cancel')}><Ban />Cancel</Button>
                      </div>
                      {activeTool === 'shadowfax-edit' ? <div className="mt-4 grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label>Update phone</Label>
                          <Input value={shadowfaxPhone} onChange={(event) => setShadowfaxPhone(event.target.value)} placeholder="Customer phone" />
                        </div>
                        <div className="space-y-1">
                          <Label>Update address</Label>
                          <Input value={shadowfaxAddress} onChange={(event) => setShadowfaxAddress(event.target.value)} placeholder="Delivery address" />
                        </div>
                        <div className="sm:col-span-2">
                          <Button size="sm" onClick={() => void updateShadowfax(selectedOrder)}><PencilLine />Update delivery details</Button>
                        </div>
                      </div> : null}
                      {activeTool === 'shadowfax-support' ? <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                        <Label>Issue category</Label>
                        <Input className="mt-1" value={supportCategory} onChange={(event) => setSupportCategory(event.target.value)} placeholder="Delivery issue, damaged package, COD issue..." />
                        <Button className="mt-3" size="sm" onClick={() => void raiseShadowfaxIssue(selectedOrder)} disabled={toolBusy === 'shadowfax-support'}>{toolBusy === 'shadowfax-support' ? <Loader2 className="animate-spin" /> : <Headphones />}Raise issue</Button>
                      </div> : null}
                    </>
                  ) : (
                    <p className="text-muted-foreground mt-2 text-sm">This row is only saved in SellersLogin. Shadowfax did not return a waybill.</p>
                  )}
                  {selectedOrder.tracking?.status && selectedOrder.partner === 'shadowfax' ? (
                    <p className="mt-2 text-sm">{selectedOrder.tracking.status}</p>
                  ) : null}
                </div>
              ) : null}
              {selectedOrder.partner === 'velocity' ? (
                <div className="rounded-xl border p-4 sm:col-span-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <PartnerLogo partner="velocity" size="xs" showName={false} />
                    <p className="text-sm font-semibold">Velocity API tools · {selectedOrder.carrierName || 'Courier'}</p>
                  </div>
                  <p className="mt-1 text-sm font-medium">{selectedOrder.waybill || selectedOrder.externalId || 'Provider reference pending'}</p>
                  {velocityAwb(selectedOrder) ? <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void trackVelocity(selectedOrder)} disabled={toolBusy === 'velocity-track'}>{toolBusy === 'velocity-track' ? <Loader2 className="animate-spin" /> : <MapPin />}Track</Button>
                      <Button size="sm" variant={activeTool === 'velocity-update' ? 'default' : 'outline'} onClick={() => setActiveTool('velocity-update')}><PencilLine />Update</Button>
                      <Button size="sm" variant={activeTool === 'velocity-reattempt' ? 'default' : 'outline'} onClick={() => setActiveTool('velocity-reattempt')}><RefreshCcw />NDR re-attempt</Button>
                      <Button size="sm" variant="outline" onClick={() => setActiveTool('confirm-rto')}><RotateCcw />RTO</Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setActiveTool('confirm-cancel')}><Ban />Cancel</Button>
                    </div>
                    {activeTool === 'velocity-update' ? <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                      <p className="mb-3 text-sm font-semibold">Update unassigned Velocity order</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1 sm:col-span-2"><Label>Velocity order ID</Label><Input value={velocityUpdate.orderId} onChange={(event) => setVelocityUpdate((current) => ({ ...current, orderId: event.target.value }))} /></div>
                        <div className="space-y-1"><Label>Recipient name</Label><Input value={velocityUpdate.name} onChange={(event) => setVelocityUpdate((current) => ({ ...current, name: event.target.value }))} /></div>
                        <div className="space-y-1"><Label>Phone</Label><Input value={velocityUpdate.phone} onChange={(event) => setVelocityUpdate((current) => ({ ...current, phone: event.target.value }))} /></div>
                        <div className="space-y-1 sm:col-span-2"><Label>Address</Label><Textarea value={velocityUpdate.address} onChange={(event) => setVelocityUpdate((current) => ({ ...current, address: event.target.value }))} /></div>
                        <div className="space-y-1"><Label>City</Label><Input value={velocityUpdate.city} onChange={(event) => setVelocityUpdate((current) => ({ ...current, city: event.target.value }))} /></div>
                        <div className="space-y-1"><Label>State</Label><Input value={velocityUpdate.state} onChange={(event) => setVelocityUpdate((current) => ({ ...current, state: event.target.value }))} /></div>
                        <div className="space-y-1"><Label>Pincode</Label><Input value={velocityUpdate.pincode} onChange={(event) => setVelocityUpdate((current) => ({ ...current, pincode: event.target.value }))} /></div>
                        <div className="space-y-1"><Label>Weight (kg)</Label><Input type="number" value={velocityUpdate.weight} onChange={(event) => setVelocityUpdate((current) => ({ ...current, weight: event.target.value }))} /></div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Velocity permits edits only before courier assignment.</p>
                      <Button className="mt-3" size="sm" onClick={() => void updateVelocity()} disabled={toolBusy === 'velocity-update'}>{toolBusy === 'velocity-update' ? <Loader2 className="animate-spin" /> : <PencilLine />}Update order</Button>
                    </div> : null}
                    {activeTool === 'velocity-reattempt' ? <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                      <p className="mb-3 text-sm font-semibold">NDR delivery re-attempt</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1"><Label>Updated phone</Label><Input value={velocityReattempt.phone} onChange={(event) => setVelocityReattempt((current) => ({ ...current, phone: event.target.value }))} /></div>
                        <div className="space-y-1"><Label>Landmark</Label><Input value={velocityReattempt.landmark} onChange={(event) => setVelocityReattempt((current) => ({ ...current, landmark: event.target.value }))} /></div>
                        <div className="space-y-1 sm:col-span-2"><Label>Corrected address</Label><Textarea value={velocityReattempt.address} onChange={(event) => setVelocityReattempt((current) => ({ ...current, address: event.target.value }))} /></div>
                        <div className="space-y-1 sm:col-span-2"><Label>Courier instructions</Label><Textarea value={velocityReattempt.comments} onChange={(event) => setVelocityReattempt((current) => ({ ...current, comments: event.target.value }))} /></div>
                      </div>
                      <Button className="mt-3" size="sm" onClick={() => void reattemptVelocity()} disabled={toolBusy === 'velocity-reattempt'}>{toolBusy === 'velocity-reattempt' ? <Loader2 className="animate-spin" /> : <RefreshCcw />}Request re-attempt</Button>
                    </div> : null}
                  </> : <p className="mt-2 text-sm text-muted-foreground">Velocity did not return an AWB or shipment reference, so shipment actions are unavailable.</p>}
                </div>
              ) : null}
              {activeTool === 'confirm-cancel' || activeTool === 'confirm-rto' ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:col-span-2">
                  <p className="font-semibold text-destructive">{activeTool === 'confirm-rto' ? 'Initiate return to origin?' : `Cancel this ${providerLabel(selectedOrder.partner)} shipment?`}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{activeTool === 'confirm-rto' ? 'Velocity will ask the carrier to return this NDR shipment to its origin warehouse.' : 'This sends a real cancellation request to the courier. The SellersLogin request record remains available for audit.'}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="destructive" onClick={() => void confirmCourierAction()} disabled={Boolean(toolBusy)}>{toolBusy ? <Loader2 className="animate-spin" /> : activeTool === 'confirm-rto' ? <RotateCcw /> : <Ban />}{activeTool === 'confirm-rto' ? 'Confirm RTO' : 'Confirm cancellation'}</Button>
                    <Button size="sm" variant="outline" onClick={() => setActiveTool('details')}>Keep shipment</Button>
                  </div>
                </div>
              ) : null}
              {toolResult ? (
                <div className="rounded-xl border bg-muted/30 p-4 sm:col-span-2">
                  <p className="text-sm font-semibold">Latest courier response</p>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-xs">{JSON.stringify(toolResult, null, 2)}</pre>
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
