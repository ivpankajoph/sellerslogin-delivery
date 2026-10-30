"use client"

import { AlertTriangle, CalendarPlus, LoaderCircle, MapPin, Package2, RefreshCcw, Truck, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  cancelExternalDelhiveryShipment,
  cancelDelhiveryShipment,
  createDelhiveryPickupRequest,
  fetchExternalDelhiveryShipments,
  loadCourierOrders,
  refreshExternalDelhiveryShipment,
  trackDelhiveryShipment,
  generateDelhiveryLabel,
  type ExternalDelhiveryShipment,
} from '@/features/delivery-system/lib/api'
import type { CourierOrderSummary } from '@/features/delivery-system/lib/data'
import { formatINR } from '@/lib/currency'
import type { RootState } from '@/store'

const readText = (value: unknown) => String(value ?? '').trim()

const getNextNDays = (n: number) => {
  const days = []
  const today = new Date()
  for (let i = 1; i <= n; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    days.push({
      value: `${year}-${month}-${day}`,
      labelDay: d.toLocaleDateString('en-US', { weekday: 'short' }),
      labelDate: String(d.getDate()),
      labelMonth: d.toLocaleDateString('en-US', { month: 'short' }),
    })
  }
  return days
}

const findFirstMessage = (value: unknown): string => {
  if (!value) return ''
  if (typeof value === 'string') return readText(value)
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findFirstMessage(entry)
      if (found) return found
    }
    return ''
  }
  if (typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const found = findFirstMessage(entry)
      if (found) return found
    }
  }
  return ''
}

const getApiErrorMessage = (err: any, fallback: string) =>
  readText(err?.response?.data?.message) ||
  findFirstMessage(err?.response?.data?.details) ||
  readText(err?.message) ||
  fallback

const hasCancelledSignal = (value: unknown) => {
  const text = readText(value).toLowerCase()
  return text.includes('cancelled') || text.includes('canceled') || text.includes('seller cancelled')
}

const stringifyDetails = (value: unknown) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

type TimelinePoint = {
  status: string
  description: string
  location: string
  time: string
}

type TrackingViewData = {
  awb: string
  status: string
  orderLabel: string
  pickupAddress: string
  deliveryAddress: string
  paymentMode: string
  packageDetails: string
  weightLabel: string
  totalLabel: string
  deliveryCostLabel: string
  customerLabel: string
  vendorLabel: string
  timeline: TimelinePoint[]
}

type PickupResponse = {
  success: boolean
  title: string
  message: string
  details: string
}

const normalizeTimeline = (rows: any[] = []): TimelinePoint[] =>
  rows
    .map((row) => ({
      status: readText(row?.status || row?.status_type || row?.scan || 'Update'),
      description: readText(row?.description || row?.remark || row?.instructions || ''),
      location: readText(row?.location || row?.city || row?.hub || ''),
      time: readText(row?.time || row?.updated_at || row?.date || ''),
    }))
    .filter((row) => row.status)

export function CourierTrackingPage() {
  const role = String(useSelector((state: RootState) => state.auth?.user?.role || '')).toLowerCase()
  const isVendor = role === 'vendor'

  const query = useMemo(() => {
    if (typeof window === 'undefined') return { kind: 'order', orderId: '', source: '', shipmentId: '', tracking: '' }
    const params = new URLSearchParams(window.location.search)
    return {
      kind: readText(params.get('kind')) || 'order',
      orderId: readText(params.get('orderId')),
      source: readText(params.get('source')),
      shipmentId: readText(params.get('shipmentId')),
      tracking: readText(params.get('tracking')),
    }
  }, [])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [creatingPickup, setCreatingPickup] = useState(false)
  const [downloadingLabel, setDownloadingLabel] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false)
  const [pickupResponse, setPickupResponse] = useState<PickupResponse | null>(null)
  const [pendingCancelType, setPendingCancelType] = useState<'shipment' | 'delivery'>('shipment')
  const [error, setError] = useState('')
  const [data, setData] = useState<TrackingViewData | null>(null)
  const [orderForActions, setOrderForActions] = useState<CourierOrderSummary | null>(null)

  const pickupDays = useMemo(() => getNextNDays(4), [])
  const pickupSlots = useMemo(() => [
    { value: '11:00:00', label: 'Mid Day', time: '10:00:00 - 14:00:00' },
    { value: '16:00:00', label: 'Evening', time: '14:00:00 - 18:00:00' },
  ], [])

  const [selectedPickupDate, setSelectedPickupDate] = useState(pickupDays[0].value)
  const [selectedPickupTime, setSelectedPickupTime] = useState(pickupSlots[0].value)

  const requestCancelled = useMemo(() => {
    if (!data && !orderForActions?.delhivery) return false
    return (
      hasCancelledSignal(data?.status) ||
      data?.timeline?.some((point) =>
        hasCancelledSignal(point.status) || hasCancelledSignal(point.description)
      ) ||
      hasCancelledSignal(orderForActions?.delhivery?.status) ||
      hasCancelledSignal(orderForActions?.delhivery?.status_description)
    )
  }, [data, orderForActions])

  const pickupScheduled = useMemo(() => {
    if (!data) return false
    return data.timeline?.some((point) => {
      const txt = (point.status + ' ' + point.description).toLowerCase()
      return (
        txt.includes('pickup scheduled') ||
        txt.includes('out for pickup') ||
        txt.includes('picked up') ||
        txt.includes('in transit') ||
        txt.includes('dispatched') ||
        txt.includes('reached')
      )
    })
  }, [data])

  const loadTracking = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      if (query.kind === 'external') {
        setOrderForActions(null)
        const list = await fetchExternalDelhiveryShipments()
        const shipment = (list?.shipments || []).find((entry) => entry.id === query.shipmentId)
        if (!shipment) throw new Error('Shipment not found')

        let latest: ExternalDelhiveryShipment = shipment
        try {
          const tracked = await refreshExternalDelhiveryShipment(shipment.id)
          if (tracked?.shipment) latest = tracked.shipment
        } catch {
          latest = shipment
        }

        const scans = normalizeTimeline(Array.isArray(latest.scans) ? latest.scans : [])
        setData({
          awb: readText(latest.waybill || latest.order_id || query.tracking || 'N/A'),
          status: readText(latest.status || latest.status_description || 'Active'),
          orderLabel: readText(latest.order_id || latest.waybill || 'Imported Delhivery shipment'),
          pickupAddress: readText(latest.origin || 'Not available'),
          deliveryAddress: readText(latest.destination || 'Not available'),
          paymentMode: 'Pre-paid',
          packageDetails: 'NA',
          weightLabel: 'NA',
          totalLabel: 'Imported from Delhivery',
          deliveryCostLabel: 'Not available',
          customerLabel: 'Delhivery panel shipment',
          vendorLabel: 'Seller panel import',
          timeline: scans,
        })
        return
      }

      const orders = await loadCourierOrders(isVendor)
      const order = orders.find(
        (entry) =>
          entry.id === query.orderId &&
          (!query.source || entry.source === query.source)
      )
      if (!order) throw new Error('Order not found')
      setOrderForActions(order)

      const waybill =
        query.tracking ||
        readText(order.delhivery?.waybill) ||
        readText(order.delhivery?.waybills?.[0]) ||
        undefined

      const trackRes = await trackDelhiveryShipment(order, waybill ? { waybill } : {})
      const trackingPayload = (trackRes?.tracking || trackRes?.shipment || trackRes?.data || {}) as any
      const scans = normalizeTimeline(
        Array.isArray(trackingPayload?.scans)
          ? trackingPayload.scans
          : Array.isArray(order.delhivery?.scans)
            ? order.delhivery?.scans
            : []
      )

      setData({
        awb: readText(
          trackingPayload?.waybill || trackingPayload?.awb || waybill || order.delhivery?.waybill || 'N/A'
        ),
        status: readText(
          trackingPayload?.status ||
          trackingPayload?.status_description ||
          order.delhivery?.status ||
          'Active'
        ),
        orderLabel: readText(order.orderNumber),
        pickupAddress: readText(order.delhivery?.pickup_location || 'Pickup location not available'),
        deliveryAddress: readText(order.address || `${order.city}, ${order.state}, ${order.pincode}`),
        paymentMode: readText(order.delhivery?.payment_mode || 'Pre-paid'),
        packageDetails: `${readText(order.itemsCount)} item(s)`,
        weightLabel: readText(trackingPayload?.chargeable_weight || 'NA'),
        totalLabel: formatINR(order.total),
        deliveryCostLabel: formatINR(order.deliveryCost || 0),
        customerLabel: `${readText(order.customerName)} (${readText(order.customerPhone) || 'No phone'})`,
        vendorLabel: readText(order.websiteLabel || 'Vendor website'),
        timeline: scans,
      })
    } catch (err: any) {
      setOrderForActions(null)
      setData(null)
      setError(getApiErrorMessage(err, 'Failed to fetch Delhivery tracking'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadTracking(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.kind, query.orderId, query.shipmentId, query.source, query.tracking, isVendor])

  const runCancel = async (type: 'shipment' | 'delivery') => {
    const isDeliveryCancel = type === 'delivery'
    try {
      setCanceling(true)
      if (query.kind === 'external') {
        const awb = readText(data?.awb || query.tracking)
        if (!query.shipmentId) {
          toast.error('Shipment id not found for cancellation')
          return
        }
        if (!awb || awb === 'N/A') {
          toast.error('Waybill not available for cancellation')
          return
        }
        await cancelExternalDelhiveryShipment(query.shipmentId, {
          waybill: awb,
          cancellation: 'true',
        })
      } else {
        if (!orderForActions) {
          toast.error('Order not found for cancellation')
          return
        }
        const awb = readText(data?.awb || orderForActions?.delhivery?.waybill || orderForActions?.delhivery?.waybills?.[0])
        if (!awb || awb === 'N/A') {
          toast.error('Waybill not available for cancellation')
          return
        }
        await cancelDelhiveryShipment(orderForActions, {
          waybill: awb,
          cancellation: 'true',
          cancel_type: isDeliveryCancel ? 'delivery' : 'shipment',
        })
      }
      toast.success(isDeliveryCancel ? 'Delivery cancel request sent to Delhivery' : 'Shipment cancel request sent to Delhivery')
      await loadTracking(true)
    } catch (err: any) {
      toast.error(getApiErrorMessage(err, 'Failed to cancel on Delhivery'))
    } finally {
      setCanceling(false)
    }
  }

  const openCancelDialog = (type: 'shipment' | 'delivery') => {
    setPendingCancelType(type)
    setCancelDialogOpen(true)
  }

  const createPickupRequest = async () => {
    if (requestCancelled) {
      setPickupDialogOpen(false)
      setPickupResponse({
        success: false,
        title: 'Request Cancelled',
        message: 'This request is cancelled. Pickup request cannot be created.',
        details: '',
      })
      return
    }

    if (!orderForActions) {
      toast.error('Order not found for pickup request')
      return
    }

    try {
      setCreatingPickup(true)
      const response = await createDelhiveryPickupRequest(orderForActions, {
        pickup_date: selectedPickupDate,
        pickup_time: selectedPickupTime,
        expected_package_count: Math.max(orderForActions.itemsCount || 1, 1),
      })
      setPickupDialogOpen(false)
      setPickupResponse({
        success: true,
        title: 'Pickup Request Created',
        message:
          readText(response?.pickup_request?.message || response?.pickup_request?.status) ||
          'Delhivery pickup request created successfully.',
        details: stringifyDetails(response?.pickup_request || response?.response),
      })
      await loadTracking(true)
    } catch (err: any) {
      setPickupDialogOpen(false)
      setPickupResponse({
        success: false,
        title: 'Pickup Request Failed',
        message: getApiErrorMessage(err, 'Failed to create Delhivery pickup request'),
        details: stringifyDetails(err?.response?.data?.details || err?.response?.data),
      })
    } finally {
      setCreatingPickup(false)
    }
  }

  const downloadLabel = async () => {
    if (!orderForActions) {
      toast.error('Order not found for label generation')
      return
    }

    try {
      setDownloadingLabel(true)
      const response = await generateDelhiveryLabel(orderForActions, {
        pdf: true,
        pdf_size: 'A4',
      })
      const labelUrl = readText(response?.label?.label_url || response?.order?.delhivery?.label_url)
      
      toast.success('Shipping label generated')
      await loadTracking(true)
      if (labelUrl) {
        window.open(labelUrl, '_blank', 'noopener,noreferrer')
      } else {
        toast.info('Delhivery did not return a direct download URL.')
      }
    } catch (err: any) {
      toast.error(getApiErrorMessage(err, 'Failed to generate Delhivery label'))
    } finally {
      setDownloadingLabel(false)
    }
  }

  return (
    <>
      <div className='space-y-5'>
        <div className='flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-4'>
          <div>
            <h1 className='text-xl font-semibold'>Delhivery Tracking</h1>
            <p className='text-sm text-muted-foreground'>Live shipment status and scan timeline.</p>
          </div>
          <div className='flex gap-2'>
            {requestCancelled ? (
              <Button variant='outline' className='rounded-md border-rose-200 bg-rose-50 text-rose-700' disabled>
                This request is cancelled
              </Button>
            ) : (
              <>
                <Button
                  variant='outline'
                  className='border-rose-600 text-rose-600 hover:bg-rose-600 hover:text-white'
                  disabled={
                    canceling ||
                    refreshing ||
                    (query.kind === 'order' ? !orderForActions : !query.shipmentId)
                  }
                  onClick={() => openCancelDialog('shipment')}
                >
                  {canceling ? <LoaderCircle className='h-4 w-4 animate-spin' /> : null}
                  Cancel Shipment
                </Button>
                <Button
                  variant='outline'
                  className='border-rose-600 text-rose-600 hover:bg-rose-600 hover:text-white'
                  disabled={
                    canceling ||
                    refreshing ||
                    (query.kind === 'order' ? !orderForActions : !query.shipmentId)
                  }
                  onClick={() => openCancelDialog('delivery')}
                >
                  {canceling ? <LoaderCircle className='h-4 w-4 animate-spin' /> : null}
                  Cancel Delivery
                </Button>
              </>
            )}
            <Button variant='outline' onClick={() => window.location.assign('/courier/list')}>
              Go to Courier List
            </Button>
            <Button variant='outline' disabled={refreshing} onClick={() => void loadTracking(true)}>
              {refreshing ? <LoaderCircle className='h-4 w-4 animate-spin' /> : <RefreshCcw className='h-4 w-4' />}
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className='rounded-md border bg-card p-6 text-sm text-muted-foreground'>Loading tracking data...</div>
        ) : error ? (
          <div className='rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700'>{error}</div>
        ) : data ? (
          <div className='grid gap-5 xl:grid-cols-[1.6fr_1fr]'>
            <div className='space-y-4'>
              {requestCancelled ? (
                <div className='rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-900'>
                  <div className='flex items-start gap-3'>
                    <AlertTriangle className='mt-0.5 h-5 w-5 text-rose-700' />
                    <div>
                      <p className='font-semibold'>This request is cancelled.</p>
                      <p className='mt-1 text-sm text-rose-800'>
                        Pickup request and cancellation actions are disabled for this shipment.
                      </p>
                    </div>
                  </div>
                </div>
              ) : query.kind === 'order' && orderForActions ? (
                pickupScheduled ? (
                  <div className='rounded-md border border-border bg-muted p-4 text-foreground'>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                      <div className='flex items-start gap-3'>
                        <Truck className='mt-0.5 h-5 w-5 text-foreground' />
                        <div>
                          <p className='font-semibold'>Pickup is scheduled.</p>
                          <p className='mt-1 text-sm text-emerald-800'>
                            Delhivery has already scheduled a pickup for this shipment. Please print the shipping label and securely attach it to the parcel before the pickup executive arrives.
                          </p>
                        </div>
                      </div>
                      <Button
                        variant='outline'
                        className='rounded-md border-border bg-muted hover:bg-muted text-foreground'
                        disabled={downloadingLabel || refreshing}
                        onClick={downloadLabel}
                      >
                        {downloadingLabel ? (
                          <LoaderCircle className='h-4 w-4 mr-2 animate-spin' />
                        ) : (
                          <Printer className='h-4 w-4 mr-2' />
                        )}
                        Download Label
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className='rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900'>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                      <div className='flex items-start gap-3'>
                        <AlertTriangle className='mt-0.5 h-5 w-5 text-amber-700' />
                        <div>
                          <p className='font-semibold'>Your request is received. Shipment is now Ready to Ship.</p>
                          <p className='mt-1 text-sm text-amber-800'>
                            Label print karke parcel ready rakho, phir pickup request create karo.
                          </p>
                        </div>
                      </div>
                      <div className='flex gap-2 flex-wrap'>
                        <Button
                          variant='outline'
                          className='rounded-md border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-900'
                          disabled={downloadingLabel || refreshing}
                          onClick={downloadLabel}
                        >
                          {downloadingLabel ? (
                            <LoaderCircle className='h-4 w-4 mr-2 animate-spin' />
                          ) : (
                            <Printer className='h-4 w-4 mr-2' />
                          )}
                          Download Label
                        </Button>
                        <Button
                          className='rounded-md bg-primary text-white hover:bg-primary/90'
                          disabled={creatingPickup || refreshing}
                          onClick={() => setPickupDialogOpen(true)}
                        >
                          {creatingPickup ? (
                            <LoaderCircle className='mr-2 h-4 w-4 animate-spin' />
                          ) : (
                            <CalendarPlus className='mr-2 h-4 w-4' />
                          )}
                          Create Pickup Request
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              ) : null}

              <div className='rounded-md border bg-card p-4'>
                <p className='text-lg font-semibold'>Order Details</p>
                <div className='mt-3 grid gap-3 md:grid-cols-2'>
                  <div className='rounded-md border bg-muted/30 p-3'>
                    <p className='text-xs text-muted-foreground'>Order</p>
                    <p className='font-medium'>{data.orderLabel}</p>
                  </div>
                  <div className='rounded-md border bg-muted/30 p-3'>
                    <p className='text-xs text-muted-foreground'>Customer</p>
                    <p className='font-medium'>{data.customerLabel}</p>
                  </div>
                  <div className='rounded-md border bg-muted/30 p-3'>
                    <p className='text-xs text-muted-foreground'>Vendor</p>
                    <p className='font-medium'>{data.vendorLabel}</p>
                  </div>
                  <div className='rounded-md border bg-muted/30 p-3'>
                    <p className='text-xs text-muted-foreground'>Order total</p>
                    <p className='font-medium'>{data.totalLabel}</p>
                  </div>
                  <div className='rounded-md border bg-muted/30 p-3'>
                    <p className='text-xs text-muted-foreground'>Delivery Cost (Wallet)</p>
                    <p className='font-medium'>{data.deliveryCostLabel}</p>
                  </div>
                </div>
              </div>

              <div className='rounded-md border bg-card p-4'>
                <p className='text-lg font-semibold'>Address & Payment</p>
                <div className='mt-3 space-y-3 text-sm'>
                  <div className='flex items-start gap-2'>
                    <MapPin className='mt-0.5 h-4 w-4 text-muted-foreground' />
                    <div>
                      <p className='font-medium'>Pickup</p>
                      <p className='text-muted-foreground'>{data.pickupAddress}</p>
                    </div>
                  </div>
                  <div className='flex items-start gap-2'>
                    <MapPin className='mt-0.5 h-4 w-4 text-muted-foreground' />
                    <div>
                      <p className='font-medium'>Delivery</p>
                      <p className='text-muted-foreground'>{data.deliveryAddress}</p>
                    </div>
                  </div>
                  <div className='flex items-start gap-2'>
                    <Package2 className='mt-0.5 h-4 w-4 text-muted-foreground' />
                    <div>
                      <p className='font-medium'>Package & Payment</p>
                      <p className='text-muted-foreground'>
                        {data.packageDetails} | Payment: {data.paymentMode} | Weight: {data.weightLabel}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className='rounded-md border bg-card p-4'>
              <div className='space-y-1 border-b pb-3'>
                <p className='text-xs text-muted-foreground'>AWB / Tracking</p>
                <p className='text-lg font-semibold'>{data.awb}</p>
                <Badge className='w-fit border-indigo-500/20 bg-indigo-500/10 text-indigo-700'>{data.status}</Badge>
              </div>
              <div className='mt-4 space-y-4'>
                <p className='text-sm font-semibold'>Tracking Timeline</p>
                {data.timeline.length ? (
                  data.timeline.map((point, index) => (
                    <div key={`${point.status}-${point.time}-${index}`} className='flex gap-3'>
                      <div className='flex w-6 flex-col items-center'>
                        <span className='mt-0.5 h-2.5 w-2.5 rounded-full bg-primary' />
                        {index !== data.timeline.length - 1 ? (
                          <span className='mt-1 h-full w-px bg-border' />
                        ) : null}
                      </div>
                      <div className='pb-3'>
                        <p className='font-medium'>{point.status}</p>
                        {point.description ? (
                          <p className='text-sm text-muted-foreground'>{point.description}</p>
                        ) : null}
                        <p className='text-xs text-muted-foreground'>
                          <Truck className='mr-1 inline h-3.5 w-3.5' />
                          {point.location || 'Location not available'}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {point.time ? new Date(point.time).toLocaleString('en-IN') : 'Time not available'}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className='rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
                    No tracking scans available yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className='max-w-md rounded-md'>
          <DialogHeader>
            <DialogTitle className='text-rose-700'>Warning: Confirm Cancellation</DialogTitle>
            <DialogDescription>
              {pendingCancelType === 'delivery'
                ? 'This will send a delivery cancellation request to Delhivery. Please confirm to proceed.'
                : 'This will send a shipment cancellation request to Delhivery. Please confirm to proceed.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='gap-2 sm:justify-end'>
            <Button variant='outline' onClick={() => setCancelDialogOpen(false)} disabled={canceling}>
              Keep Shipment
            </Button>
            <Button
              className='bg-rose-600 text-white hover:bg-rose-700'
              disabled={canceling}
              onClick={async () => {
                setCancelDialogOpen(false)
                await runCancel(pendingCancelType)
              }}
            >
              {canceling ? <LoaderCircle className='h-4 w-4 animate-spin' /> : null}
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pickupDialogOpen} onOpenChange={setPickupDialogOpen}>
        <DialogContent className='max-w-3xl rounded-md p-0'>
          <DialogHeader className='border-b px-7 py-6'>
            <DialogTitle className='text-lg'>Add to Pickup</DialogTitle>
            <DialogDescription>
              Confirm pickup location and slot before sending this request to Delhivery.
            </DialogDescription>
          </DialogHeader>

          <div className='max-h-[60vh] space-y-5 overflow-y-auto px-7 py-5'>
            <div className='rounded-md border bg-muted/30 p-4'>
              <p className='text-sm font-semibold'>Selected pickup location</p>
              <p className='mt-2 inline-flex max-w-full rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground'>
                {data?.pickupAddress || orderForActions?.delhivery?.pickup_location || 'Pickup location not available'}
              </p>
            </div>

            <div className='rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900'>
              <ul className='list-inside list-disc space-y-1 marker:text-amber-600'>
                <li>The pickup request is raised against the warehouse location, not the waybill number.</li>
                <li>
                  Therefore, you do not need to create multiple pickup requests for multiple waybills if they are all
                  being picked up from a single location.
                </li>
                <li>
                  If shipments are at two different locations, you need to raise separate pickup requests for each location.
                </li>
              </ul>
            </div>

            <div>
              <p className='mb-3 text-sm font-semibold'>Pickup Date</p>
              <p className='mb-3 text-xs text-muted-foreground'>Pickup will be attempted during the selected Pickup Slot</p>
              <div className='flex gap-3 overflow-x-auto pb-2'>
                {pickupDays.map((d) => {
                  const isSelected = selectedPickupDate === d.value
                  return (
                    <button
                      key={d.value}
                      className={`flex min-w-[70px] flex-col items-center justify-center rounded-3xl border p-3 transition-colors ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-border hover:bg-muted'
                      }`}
                      onClick={() => setSelectedPickupDate(d.value)}
                    >
                      <span className='text-xs font-medium'>{d.labelDay}</span>
                      <span className='my-1 text-lg font-bold'>{d.labelDate}</span>
                      <span className='text-xs'>{d.labelMonth}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='rounded-md border bg-muted/20 p-4'>
                <p className='mb-2 text-xs font-semibold'>Default Pickup Slot</p>
                <Select value={selectedPickupTime} onValueChange={setSelectedPickupTime}>
                  <SelectTrigger className='w-full bg-white'>
                    <SelectValue placeholder='Select a time slot' />
                  </SelectTrigger>
                  <SelectContent>
                    {pickupSlots.map((slot) => (
                      <SelectItem key={slot.value} value={slot.value}>
                        <div className='flex flex-col text-left'>
                          <span className='font-medium'>{slot.label}</span>
                          <span className='text-xs text-muted-foreground'>{slot.time}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='rounded-md border bg-muted/20 p-4'>
                <p className='mb-2 text-xs font-semibold'>Expected packages</p>
                <div className='flex h-10 items-center rounded-md border bg-white px-3'>
                  <p className='font-medium'>{Math.max(orderForActions?.itemsCount || 1, 1)}</p>
                </div>
              </div>
            </div>

            <div className='rounded-md border border-border bg-muted p-4 text-sm text-foreground'>
              Keep the shipment ready with the label pasted before pickup.
            </div>
          </div>

          <DialogFooter className='border-t bg-muted/20 px-7 py-4'>
            <Button variant='outline' className='rounded-md' disabled={creatingPickup} onClick={() => setPickupDialogOpen(false)}>
              Add Later
            </Button>
            <Button
              className='rounded-md bg-primary text-white hover:bg-primary/90'
              disabled={creatingPickup}
              onClick={() => void createPickupRequest()}
            >
              {creatingPickup ? <LoaderCircle className='h-4 w-4 animate-spin' /> : <CalendarPlus className='h-4 w-4' />}
              Add to Pickup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pickupResponse)} onOpenChange={(open) => !open && setPickupResponse(null)}>
        <DialogContent className='max-w-lg rounded-md'>
          <DialogHeader>
            <DialogTitle className={pickupResponse?.success ? 'text-foreground' : 'text-rose-700'}>
              {pickupResponse?.title || 'Delhivery Response'}
            </DialogTitle>
            <DialogDescription>{pickupResponse?.message || 'No response message available.'}</DialogDescription>
          </DialogHeader>
          {pickupResponse?.details ? (
            <div className='rounded-md border bg-muted/30 p-4 text-sm'>
              <p className='mb-2 font-semibold'>Response details</p>
              <pre className='max-h-56 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground'>
                {pickupResponse.details}
              </pre>
            </div>
          ) : null}
          <DialogFooter>
            <Button className='rounded-md bg-primary text-white hover:bg-primary/90' onClick={() => setPickupResponse(null)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
