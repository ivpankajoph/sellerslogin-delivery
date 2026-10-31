"use client"

import { CalendarPlus, Download, ExternalLink, LoaderCircle, RefreshCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { FacetFilter, matchesSearch, matchesSelected, TableFilters, uniqueFilterOptions } from '@/components/table-filters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  createDelhiveryPickupRequest,
  fetchExternalDelhiveryShipments,
  generateDelhiveryLabel,
  getAssignedCourierForOrder,
  loadCourierOrders,
  trackDelhiveryShipment,
  type ExternalDelhiveryShipment,
} from '@/features/delivery-system/lib/api'
import {
  COURIER_PARTNER_MAP,
  hasAnyCourierAssignment,
  type CourierPartner,
  type CourierPartnerId,
  type CourierOrderSummary,
} from '@/features/delivery-system/lib/data'
import { formatINR } from '@/lib/currency'
import type { RootState } from '@/store'

type OrderShipmentRow = {
  id: string
  kind: 'order'
  title: string
  priceLabel: string
  customerPrimary: string
  customerSecondary: string
  partner: CourierPartner
  trackingCode: string
  trackingStatus: string
  updatedAt: string
  sourceLabel: string
  destinationLabel: string
  itemsLabel: string
  order: CourierOrderSummary
}

type ExternalShipmentRow = {
  id: string
  kind: 'external-delhivery'
  title: string
  priceLabel: string
  customerPrimary: string
  customerSecondary: string
  partner: CourierPartner
  trackingCode: string
  trackingStatus: string
  updatedAt: string
  sourceLabel: string
  destinationLabel: string
  itemsLabel: string
  externalShipment: ExternalDelhiveryShipment
}

type ShipmentRow = OrderShipmentRow | ExternalShipmentRow
type DateRangePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'

type LabelPreview = {
  title: string
  url: string
}

const readText = (value: unknown) => String(value ?? '').trim()
const getDateRange = (preset: DateRangePreset, customFrom = '', customTo = '') => {
  const now = new Date()
  const startOfDay = (date: Date) => {
    const next = new Date(date)
    next.setHours(0, 0, 0, 0)
    return next
  }
  const endOfDay = (date: Date) => {
    const next = new Date(date)
    next.setHours(23, 59, 59, 999)
    return next
  }
  if (preset === 'all') return null
  if (preset === 'today') return { from: startOfDay(now), to: endOfDay(now) }
  if (preset === 'yesterday') {
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    return { from: startOfDay(yesterday), to: endOfDay(yesterday) }
  }
  if (preset === 'week') {
    const from = startOfDay(now)
    from.setDate(now.getDate() - 6)
    return { from, to: endOfDay(now) }
  }
  if (preset === 'month') {
    const from = startOfDay(now)
    from.setDate(now.getDate() - 29)
    return { from, to: endOfDay(now) }
  }
  return {
    from: customFrom ? startOfDay(new Date(customFrom)) : null,
    to: customTo ? endOfDay(new Date(customTo)) : null,
  }
}

const matchesDateRange = (value: unknown, preset: DateRangePreset, customFrom = '', customTo = '') => {
  const range = getDateRange(preset, customFrom, customTo)
  if (!range) return true
  const time = new Date(readText(value)).getTime()
  if (!Number.isFinite(time)) return false
  if (range.from && time < range.from.getTime()) return false
  if (range.to && time > range.to.getTime()) return false
  return true
}
const FALLBACK_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect width="96" height="96" fill="#f1f5f9"/>
      <rect x="14" y="14" width="68" height="68" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2"/>
      <path d="M26 62l14-17 10 11 8-10 12 12" fill="none" stroke="#94a3b8" stroke-width="3"/>
      <circle cx="35" cy="35" r="5" fill="#94a3b8"/>
    </svg>`
  )

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value)
const API_ORIGIN = (() => {
  const raw = readText(process.env.NEXT_PUBLIC_API_URL)
  if (!raw) return ''
  try {
    return new URL(raw).origin
  } catch {
    return ''
  }
})()
const resolveItemImage = (value?: string) => {
  const text = readText(value)
  if (!text) return FALLBACK_IMAGE
  if (text.startsWith('data:') || text.startsWith('blob:')) return text
  if (text.startsWith('//')) return `https:${text}`
  if (isAbsoluteUrl(text)) return text
  if (text.startsWith('/')) return API_ORIGIN ? `${API_ORIGIN}${text}` : text
  if (text.startsWith('uploads/')) {
    return API_ORIGIN ? `${API_ORIGIN}/${text}` : `/${text}`
  }
  return API_ORIGIN ? `${API_ORIGIN}/${text}` : `/${text}`
}

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString('en-IN') : 'Not available'

const hasOrderCourierHistory = (order: CourierOrderSummary) => {
  const provider = readText(order.deliveryProvider).toLowerCase()
  return (
    hasAnyCourierAssignment(order) ||
    Boolean(order.delhivery) ||
    Boolean(order.shadowfax) ||
    Boolean(order.borzo?.order_id) ||
    ['delhivery', 'shadowfax', 'borzo', 'porter'].some((entry) => provider.includes(entry))
  )
}

const getPartnerIdForOrderRow = (order: CourierOrderSummary, assignmentPartner?: CourierPartnerId) => {
  const provider = readText(order.deliveryProvider).toLowerCase()
  if (assignmentPartner) return assignmentPartner
  if (order.delhivery || provider.includes('delhivery')) return 'delhivery'
  if (order.shadowfax || provider.includes('shadowfax')) return 'shadowfax'
  if (order.borzo?.order_id || provider.includes('borzo')) return 'borzo'
  return 'borzo'
}

const getOrderDeliveryCostLabel = (order: CourierOrderSummary) => {
  const charged = Number(order.deliveryCost || 0)
  if (!charged) return `Order ${formatINR(order.total)}`
  return `Order ${formatINR(order.total)} | Delivery ${formatINR(charged)}`
}

const getTomorrowDate = () => {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const DetailKV = ({ label, value }: { label: string; value: string }) => (
  <div className='space-y-1'>
    <p className='text-muted-foreground text-xs'>{label}</p>
    <p className='text-sm font-medium'>{value || 'Not available'}</p>
  </div>
)

const getErrorMessage = (error: unknown, fallback: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object' &&
    (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
  ) {
    return (
      readText(
        (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
      ) || fallback
    )
  }

  if (error instanceof Error) return error.message || fallback
  return fallback
}

const buildTrackingPath = (shipment: ShipmentRow) => {
  const params = new URLSearchParams()
  if (shipment.kind === 'order') {
    params.set('kind', 'order')
    params.set('orderId', shipment.order.id)
    params.set('source', shipment.order.source)
    if (shipment.trackingCode) params.set('tracking', shipment.trackingCode)
    return `/courier/tracking?${params.toString()}`
  }

  params.set('kind', 'external')
  params.set('shipmentId', shipment.externalShipment.id)
  if (shipment.trackingCode) params.set('tracking', shipment.trackingCode)
  return `/courier/tracking?${params.toString()}`
}

export function CourierListPage() {
  const role = String(useSelector((state: RootState) => state.auth?.user?.role || '')).toLowerCase()
  const token = String(useSelector((state: RootState) => state.auth?.token || ''))
  const isVendor = role === 'vendor'
  const [orders, setOrders] = useState<CourierOrderSummary[]>([])
  const [externalShipments, setExternalShipments] = useState<ExternalDelhiveryShipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedShipment, setSelectedShipment] = useState<ShipmentRow | null>(null)
  const [resolvedItemImages, setResolvedItemImages] = useState<Record<string, string>>({})
  const [actionBusy, setActionBusy] = useState('')
  const [labelPreview, setLabelPreview] = useState<LabelPreview | null>(null)
  const [datePreset] = useState<DateRangePreset>('custom')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [page, setPage] = useState(1)
  const [limit] = useState(30)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 500)
    return () => clearTimeout(handler)
  }, [searchQuery])

  const loadShipments = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const [ordersResult, externalResult] = await Promise.allSettled([
        loadCourierOrders(isVendor, page, limit, debouncedSearch),
        isVendor
          ? fetchExternalDelhiveryShipments()
          : Promise.resolve({ success: true, shipments: [] as ExternalDelhiveryShipment[] }),
      ])

      if (ordersResult.status === 'fulfilled') {
        setOrders(ordersResult.value)
      } else {
        setOrders([])
      }

      if (externalResult.status === 'fulfilled') {
        setExternalShipments(
          Array.isArray(externalResult.value?.shipments) ? externalResult.value.shipments : []
        )
      } else {
        setExternalShipments([])
      }

      if (ordersResult.status === 'rejected' && externalResult.status === 'rejected') {
        setError(
          getErrorMessage(
            ordersResult.reason,
            getErrorMessage(externalResult.reason, 'Failed to load courier shipments')
          )
        )
        return
      }

      if (ordersResult.status === 'rejected') {
        setError(getErrorMessage(ordersResult.reason, 'Failed to load order-linked courier shipments'))
        return
      }

      if (externalResult.status === 'rejected') {
        setError(
          getErrorMessage(
            externalResult.reason,
            'Order-linked shipments loaded, but Delhivery panel imports could not be loaded'
          )
        )
      }
    } finally {
      setLoading(false)
    }
  }, [isVendor, page, limit, debouncedSearch])

  useEffect(() => {
    void loadShipments()
  }, [loadShipments])

  useEffect(() => {
    const refresh = () => void loadShipments()
    window.addEventListener('delivery-workspace-refresh', refresh)
    return () => window.removeEventListener('delivery-workspace-refresh', refresh)
  }, [loadShipments])

  const shipmentRows = useMemo(() => {
    const orderRows = orders
      .filter((order) => hasOrderCourierHistory(order))
      .map<ShipmentRow>((order) => {
        const assignment = getAssignedCourierForOrder(order, false)
        const partnerId: CourierPartnerId = getPartnerIdForOrderRow(order, assignment?.partnerId)
        const partner = COURIER_PARTNER_MAP[partnerId]

        const trackingCode =
          assignment?.trackingCode ||
          order.delhivery?.waybill ||
          order.delhivery?.waybills?.[0] ||
          (order.borzo?.order_id ? String(order.borzo.order_id) : '')

        const trackingStatus =
          assignment?.trackingStatus ||
          order.delhivery?.status ||
          order.delhivery?.status_description ||
          order.shadowfax?.status ||
          order.shadowfax?.status_description ||
          order.borzo?.status ||
          'Active'

        const updatedAt =
          order.delhivery?.updated_at ||
          order.borzo?.updated_at ||
          order.createdAt ||
          ''

        const sourceLabel = order.source === 'template-orders' ? 'Website order' : 'Main order'
        const destinationLabel = order.address || `${order.city}, ${order.state}, ${order.pincode}`

        return {
          id: `${partner.id}-${order.id}`,
          kind: 'order',
          title: order.orderNumber,
          priceLabel: getOrderDeliveryCostLabel(order),
          customerPrimary: order.customerName || 'No customer',
          customerSecondary: order.pincode || 'No pincode',
          partner,
          trackingCode,
          trackingStatus,
          updatedAt,
          sourceLabel,
          destinationLabel,
          itemsLabel: `${order.items.length} item(s)`,
          order,
        }
      })

    const externalRows = externalShipments.map<ShipmentRow>((shipment) => ({
      id: `external-delhivery-${shipment.id}`,
      kind: 'external-delhivery',
      title: shipment.order_id || shipment.waybill || 'Imported Delhivery shipment',
      priceLabel: 'Imported from panel',
      customerPrimary: 'Delhivery panel shipment',
      customerSecondary: shipment.origin || 'Unknown origin',
      partner: COURIER_PARTNER_MAP.delhivery,
      trackingCode: shipment.waybill || shipment.order_id || '',
      trackingStatus: shipment.status || 'Pending',
      updatedAt: shipment.last_synced_at || shipment.updatedAt || shipment.createdAt || '',
      sourceLabel: 'Delhivery panel import',
      destinationLabel: shipment.destination || 'Destination not available',
      itemsLabel: `${Array.isArray(shipment.scans) ? shipment.scans.length : 0} scan(s)`,
      externalShipment: shipment,
    }))

    return [...orderRows, ...externalRows].sort((left, right) => {
      const leftTime = new Date(left.updatedAt || 0).getTime()
      const rightTime = new Date(right.updatedAt || 0).getTime()
      return rightTime - leftTime
    })
  }, [externalShipments, orders])

  const linkedOrderForSelectedExternal = useMemo(() => {
    if (!selectedShipment || selectedShipment.kind !== 'external-delhivery') return null
    const external = selectedShipment.externalShipment
    const refId = readText(external.order_id)
    const waybill = readText(external.waybill)

    return (
      orders.find((order) => {
        const orderNumber = readText(order.orderNumber)
        const delhiveryWaybill = readText(order.delhivery?.waybill)
        const waybills = Array.isArray(order.delhivery?.waybills)
          ? order.delhivery.waybills.map((entry) => readText(entry))
          : []
        return (
          (refId && orderNumber === refId) ||
          (waybill && (delhiveryWaybill === waybill || waybills.includes(waybill)))
        )
      }) || null
    )
  }, [orders, selectedShipment])

  const [sourceFilters, setSourceFilters] = useState<string[]>([])
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const toggleList = (setter: (value: string[]) => void, selected: string[], value: string) =>
    setter(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  const filteredShipmentRows = useMemo(
    () => shipmentRows.filter((shipment) =>
      matchesDateRange(shipment.updatedAt, datePreset, customFrom, customTo) &&
      matchesSelected(sourceFilters, shipment.sourceLabel) &&
      matchesSelected(statusFilters, shipment.trackingStatus) &&
      matchesSearch(searchQuery, [shipment.title, shipment.customerPrimary, shipment.customerSecondary, shipment.destinationLabel, shipment.trackingCode, shipment.itemsLabel])
    ),
    [customFrom, customTo, datePreset, searchQuery, shipmentRows, sourceFilters, statusFilters]
  )

  const orderForDetails = useMemo(
    () =>
      selectedShipment?.kind === 'order'
        ? selectedShipment.order
        : linkedOrderForSelectedExternal,
    [linkedOrderForSelectedExternal, selectedShipment]
  )

  useEffect(() => {
    let cancelled = false
    const productApiBase = readText(process.env.NEXT_PUBLIC_API_URL)
    if (!orderForDetails?.items?.length || !productApiBase) return

    const run = async () => {
      const next: Record<string, string> = {}
      const uniquePairs = Array.from(
        new Set(
          orderForDetails.items
            .map((item) => `${readText(item.productId)}::${readText(item.variantId)}`)
            .filter((entry) => !entry.startsWith('::'))
        )
      )

      for (const pair of uniquePairs) {
        const [productId, variantId] = pair.split('::')
        if (!productId) continue
        try {
          const res = await fetch(`${productApiBase}/v1/products/${productId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          const data = await res.json().catch(() => ({}))
          const product = data?.product || {}
          const variants = Array.isArray(product?.variants) ? product.variants : []
          const matchedVariant =
            variants.find((variant: any) => readText(variant?._id) === variantId) || variants[0]
          const variantImage = readText(matchedVariant?.variantsImageUrls?.[0]?.url)
          const defaultImage = readText(product?.defaultImages?.[0]?.url)
          const image = variantImage || defaultImage
          if (image) next[pair] = image
        } catch {
          // ignore per-item resolution failures
        }
      }

      if (!cancelled) {
        setResolvedItemImages(next)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [orderForDetails, token])

  const getItemImage = (item: { imageUrl?: string; productId?: string; variantId?: string }) => {
    const direct = readText(item?.imageUrl)
    if (direct) return resolveItemImage(direct)
    const fallback = resolvedItemImages[`${readText(item?.productId)}::${readText(item?.variantId)}`]
    return resolveItemImage(fallback)
  }

  const isDelhiveryOrderShipment = (shipment: ShipmentRow | null): shipment is OrderShipmentRow =>
    Boolean(shipment && shipment.kind === 'order' && shipment.partner.id === 'delhivery')

  const runDelhiveryAction = async (
    shipment: ShipmentRow,
    action: 'track' | 'label' | 'pickup'
  ) => {
    if (!isDelhiveryOrderShipment(shipment)) return
    const busyKey = `${action}-${shipment.order.id}`
    try {
      setActionBusy(busyKey)
      if (action === 'track') {
        await trackDelhiveryShipment(shipment.order)
        toast.success('Delhivery status synced')
        await loadShipments()
        return
      }

      if (action === 'label') {
        const response = await generateDelhiveryLabel(shipment.order, {
          pdf: true,
          pdf_size: 'A4',
        })
        const labelUrl = readText(response?.label?.label_url || response?.order?.delhivery?.label_url)
        setLabelPreview({
          title: `Delhivery label response - ${shipment.title}`,
          url: labelUrl,
        })
        toast.success('Shipping label generated')
        await loadShipments()
        if (labelUrl) {
          window.open(labelUrl, '_blank', 'noopener,noreferrer')
        } else {
          toast.info('Delhivery did not return a direct download URL.')
        }
        return
      }

      await createDelhiveryPickupRequest(shipment.order, {
        pickup_date: getTomorrowDate(),
        pickup_time: '14:00:00',
        expected_package_count: Math.max(shipment.order.itemsCount || 1, 1),
      })
      toast.success('Delhivery pickup request created')
      await loadShipments()
    } catch (err) {
      toast.error(
        getErrorMessage(
          err,
          action === 'track'
            ? 'Failed to sync Delhivery status'
            : action === 'label'
              ? 'Failed to generate shipping label'
              : 'Failed to add shipment to pickup'
        )
      )
    } finally {
      setActionBusy('')
    }
  }

  return (
    <>
      <div className='space-y-5'>


        {error ? (
          <div className='rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-200'>
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className='rounded-2xl border border-border bg-muted/40 p-8 text-sm text-muted-foreground'>
            Loading courier shipments...
          </div>
        ) : shipmentRows.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-sm text-muted-foreground'>
            No courier shipments found.
          </div>
        ) : (
          <>
          <Card>
            <CardHeader className='flex flex-col gap-4'>
              <div>
                <CardTitle>Website requests</CardTitle>
                <CardDescription>Courier shipments created from website orders.</CardDescription>
              </div>
              <TableFilters
                search={searchQuery}
                onSearchChange={setSearchQuery}
                placeholder="Search order, customer, tracking"
                dateFrom={customFrom}
                dateTo={customTo}
                onDateFromChange={setCustomFrom}
                onDateToChange={setCustomTo}
                active={Boolean(searchQuery || sourceFilters.length || statusFilters.length || customFrom || customTo)}
                onReset={() => { setSearchQuery(''); setSourceFilters([]); setStatusFilters([]); setCustomFrom(''); setCustomTo('') }}
              >
                <FacetFilter title="Type" options={uniqueFilterOptions(shipmentRows.map((shipment) => shipment.sourceLabel))} selected={sourceFilters} onToggle={(value) => toggleList(setSourceFilters, sourceFilters, value)} onClear={() => setSourceFilters([])} />
                <FacetFilter title="Status" options={uniqueFilterOptions(shipmentRows.map((shipment) => shipment.trackingStatus))} selected={statusFilters} onToggle={(value) => toggleList(setStatusFilters, statusFilters, value)} onClear={() => setStatusFilters([])} />
              </TableFilters>
            </CardHeader>
            <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>{filteredShipmentRows.length} requests showing</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tracking</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead className='text-right'>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShipmentRows.map((shipment) => (
                    <TableRow
                      key={shipment.id}
                      className='cursor-pointer'
                      onClick={() => setSelectedShipment(shipment)}
                    >
                      <TableCell className='whitespace-nowrap'>
                        {shipment.updatedAt
                          ? new Date(shipment.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                          : 'Not available'}
                      </TableCell>
                      <TableCell className='whitespace-nowrap font-medium'>{[shipment.title, shipment.priceLabel].filter(Boolean).join(' · ')}</TableCell>
                      <TableCell className='whitespace-nowrap'>{shipment.sourceLabel}</TableCell>
                      <TableCell className='whitespace-nowrap'>{[shipment.customerPrimary, shipment.customerSecondary].filter(Boolean).join(' · ')}</TableCell>
                      <TableCell className='max-w-[240px] truncate whitespace-nowrap'>{shipment.destinationLabel}</TableCell>
                      <TableCell>{shipment.trackingStatus}</TableCell>
                      <TableCell>{shipment.trackingCode || 'Not available'}</TableCell>
                      <TableCell className='whitespace-nowrap'>{shipment.itemsLabel}</TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end gap-2' onClick={(event) => event.stopPropagation()}>
                          <Button size='sm' onClick={() => setSelectedShipment(shipment)}>
                            Detail
                          </Button>
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => window.location.assign(buildTrackingPath(shipment))}
                          >
                            Track
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
            
            <div className='mt-4 flex items-center justify-between'>
              <div className='text-sm text-muted-foreground'>
                Page {page}
              </div>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setPage(p => p + 1)}
                  disabled={orders.length < limit}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}

        <Dialog
          open={Boolean(selectedShipment)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedShipment(null)
            }
          }}
        >
          <DialogContent className='max-h-[88vh] overflow-y-auto sm:max-w-3xl'>
            {selectedShipment?.kind === 'order' ? (
              <div className='space-y-4'>
                <DialogHeader>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div>
                      <DialogTitle>{selectedShipment.order.orderNumber}</DialogTitle>
                      <DialogDescription>
                        {selectedShipment.order.customerName} | {selectedShipment.order.pincode || 'No pincode'} |{' '}
                        {formatINR(selectedShipment.order.total)}
                      </DialogDescription>
                    </div>
                    <Badge variant='outline'>{selectedShipment.partner.title}</Badge>
                  </div>
                </DialogHeader>

                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='rounded-lg border p-4'>
                    <p className='text-sm font-medium text-foreground'>Shipment</p>
                    <div className='mt-3 space-y-2'>
                      <DetailKV label='Status' value={selectedShipment.trackingStatus} />
                      <DetailKV label='Tracking' value={selectedShipment.trackingCode || 'Not available'} />
                      <DetailKV label='Source' value={selectedShipment.sourceLabel} />
                      <DetailKV label='Wallet deduction' value={formatINR(selectedShipment.order.deliveryCost || 0)} />
                      <DetailKV label='Updated' value={formatDateTime(selectedShipment.updatedAt)} />
                      {selectedShipment.order.delhivery?.pickup_request_date ? (
                        <DetailKV
                          label='Pickup request'
                          value={`${selectedShipment.order.delhivery.pickup_request_date} ${selectedShipment.order.delhivery.pickup_request_time || ''}`.trim()}
                        />
                      ) : null}
                      {selectedShipment.order.delhivery?.status_description ? (
                        <DetailKV label='Status details' value={selectedShipment.order.delhivery.status_description} />
                      ) : null}
                      {selectedShipment.order.delhivery?.pickup_request_status ? (
                        <DetailKV label='Pickup status' value={selectedShipment.order.delhivery.pickup_request_status} />
                      ) : null}
                      {selectedShipment.order.delhivery?.pickup_request_message ? (
                        <DetailKV label='Pickup message' value={selectedShipment.order.delhivery.pickup_request_message} />
                      ) : null}
                      {selectedShipment.order.delhivery?.label_url ? (
                        <a
                          href={selectedShipment.order.delhivery.label_url}
                          target='_blank'
                          rel='noreferrer'
                          className='inline-flex items-center gap-1 text-sm font-medium underline'
                        >
                          Open saved shipping label
                          <ExternalLink className='h-3.5 w-3.5' />
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className='rounded-lg border p-4'>
                    <p className='text-sm font-medium'>Delivery</p>
                    <div className='mt-3 space-y-2'>
                      <DetailKV label='Address' value={selectedShipment.destinationLabel} />
                      <DetailKV label='City' value={selectedShipment.order.city || 'Not available'} />
                      <DetailKV label='State' value={selectedShipment.order.state || 'Not available'} />
                      <DetailKV label='Pincode' value={selectedShipment.order.pincode || 'Not available'} />
                      <DetailKV label='Phone' value={selectedShipment.order.customerPhone || 'Not available'} />
                    </div>
                  </div>
                </div>

                <div className='rounded-lg border p-4'>
                  <p className='text-sm font-medium'>Vendor & Customer</p>
                  <div className='mt-3 grid gap-2 md:grid-cols-2'>
                    <DetailKV label='Ordered at' value={formatDateTime(selectedShipment.order.createdAt)} />
                    <DetailKV label='Last courier update' value={formatDateTime(selectedShipment.order.delhivery?.updated_at || selectedShipment.updatedAt)} />
                    <DetailKV label='Vendor website' value={selectedShipment.order.websiteLabel || 'Not available'} />
                    <DetailKV label='Order source' value={selectedShipment.order.source} />
                    <DetailKV label='Customer name' value={selectedShipment.order.customerName || 'Not available'} />
                    <DetailKV label='Customer email' value={selectedShipment.order.customerEmail || 'Not available'} />
                    <DetailKV label='Customer phone' value={selectedShipment.order.customerPhone || 'Not available'} />
                    <DetailKV label='Internal order id' value={selectedShipment.order.id} />
                  </div>
                </div>

                <div className='rounded-lg border p-4'>
                  <p className='text-sm font-medium'>Products</p>
                  <div className='mt-3 space-y-3'>
                    {selectedShipment.order.items.map((item, index) => (
                      <div
                        key={`${selectedShipment.order.id}-${item.productName}-${index}`}
                        className='flex items-start gap-3 rounded-lg border p-3 text-sm text-muted-foreground'
                      >
                        <img
                          src={getItemImage(item)}
                          alt={item.productName || 'Product'}
                          className='size-16 rounded-md border object-cover'
                        />
                        <div>
                          <p className='font-semibold text-foreground'>{item.productName}</p>
                          <p>
                            Qty {item.quantity} |{' '}
                            {formatINR(item.totalPrice || item.unitPrice * item.quantity)}
                          </p>
                          <p>Unit price: {formatINR(item.unitPrice || 0)}</p>
                          {item.variantSummary ? <p>{item.variantSummary}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className='flex flex-wrap justify-end gap-2'>
                  {isDelhiveryOrderShipment(selectedShipment) ? (
                    <>
                      <Button
                        variant='outline'
                        className='border-border bg-background text-foreground hover:bg-accent hover:text-foreground'
                        disabled={Boolean(actionBusy)}
                        onClick={() => void runDelhiveryAction(selectedShipment, 'track')}
                      >
                        {actionBusy === `track-${selectedShipment.order.id}` ? (
                          <LoaderCircle className='h-4 w-4 animate-spin' />
                        ) : (
                          <RefreshCcw className='h-4 w-4' />
                        )}
                        Sync Delhivery Status
                      </Button>
                      <Button
                        variant='outline'
                        className='border-border bg-background text-foreground hover:bg-accent hover:text-foreground'
                        disabled={Boolean(actionBusy)}
                        onClick={() => void runDelhiveryAction(selectedShipment, 'label')}
                      >
                        {actionBusy === `label-${selectedShipment.order.id}` ? (
                          <LoaderCircle className='h-4 w-4 animate-spin' />
                        ) : (
                          <Download className='h-4 w-4' />
                        )}
                        Print Shipping Label
                      </Button>
                      <Button
                        className='bg-primary text-white hover:bg-primary/90'
                        disabled={Boolean(actionBusy)}
                        onClick={() => void runDelhiveryAction(selectedShipment, 'pickup')}
                      >
                        {actionBusy === `pickup-${selectedShipment.order.id}` ? (
                          <LoaderCircle className='h-4 w-4 animate-spin' />
                        ) : (
                          <CalendarPlus className='h-4 w-4' />
                        )}
                        Add to Pickup
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant='outline'
                    className='border-border bg-background text-foreground hover:bg-accent hover:text-foreground'
                    onClick={() => window.location.assign(buildTrackingPath(selectedShipment))}
                  >
                    Open Tracking
                  </Button>
                </div>
              </div>
            ) : selectedShipment?.kind === 'external-delhivery' ? (
              <div className='space-y-4'>
                <DialogHeader>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div>
                      <DialogTitle>
                        {selectedShipment.externalShipment.waybill ||
                          selectedShipment.externalShipment.order_id ||
                          'Imported Delhivery shipment'}
                      </DialogTitle>
                      <DialogDescription>
                        Imported from Delhivery panel | {selectedShipment.externalShipment.order_id || 'No ref_ids'}
                      </DialogDescription>
                    </div>
                    <Badge variant='outline'>{selectedShipment.partner.title}</Badge>
                  </div>
                </DialogHeader>

                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='rounded-lg border p-4'>
                    <p className='text-sm font-medium text-foreground'>Shipment</p>
                    <div className='mt-3 space-y-2 text-sm text-muted-foreground'>
                      <p>Status: {selectedShipment.trackingStatus}</p>
                      <p>Tracking: {selectedShipment.trackingCode || 'Not available'}</p>
                      <p>Source: {selectedShipment.sourceLabel}</p>
                      <p>AWB: {selectedShipment.externalShipment.waybill || 'Not available'}</p>
                      <p>Order ref id: {selectedShipment.externalShipment.order_id || 'Not available'}</p>
                      <p>Imported at: {formatDateTime(selectedShipment.externalShipment.createdAt || selectedShipment.externalShipment.last_synced_at || selectedShipment.updatedAt)}</p>
                      <p>
                        Last synced:{' '}
                        {formatDateTime(selectedShipment.updatedAt)}
                      </p>
                      {selectedShipment.externalShipment.status_description ? (
                        <p>Description: {selectedShipment.externalShipment.status_description}</p>
                      ) : null}
                      {selectedShipment.externalShipment.label_url ? (
                        <a
                          href={selectedShipment.externalShipment.label_url}
                          target='_blank'
                          rel='noreferrer'
                          className='inline-flex items-center gap-1 font-medium underline'
                        >
                          Open shipping label
                          <ExternalLink className='h-3.5 w-3.5' />
                        </a>
                      ) : null}
                    </div>
                  </div>

                  <div className='rounded-lg border p-4'>
                    <p className='text-sm font-medium'>Delivery</p>
                    <div className='mt-3 space-y-2 text-sm text-muted-foreground'>
                      <p>Origin: {selectedShipment.externalShipment.origin || 'Not available'}</p>
                      <p>Destination: {selectedShipment.destinationLabel}</p>
                      <p>
                        Requested waybills:{' '}
                        {selectedShipment.externalShipment.requested_waybills?.join(', ') || 'Not available'}
                      </p>
                      <p>
                        Requested ref_ids:{' '}
                        {selectedShipment.externalShipment.requested_ref_ids?.join(', ') || 'Not available'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className='rounded-lg border p-4'>
                  <p className='text-sm font-medium'>Buyer & Order Metadata</p>
                  {linkedOrderForSelectedExternal ? (
                    <div className='mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2'>
                      <p>Customer: {linkedOrderForSelectedExternal.customerName || 'Not available'}</p>
                      <p>Phone: {linkedOrderForSelectedExternal.customerPhone || 'Not available'}</p>
                      <p>Email: {linkedOrderForSelectedExternal.customerEmail || 'Not available'}</p>
                      <p>Buy time: {formatDateTime(linkedOrderForSelectedExternal.createdAt)}</p>
                      <p>Order source: {linkedOrderForSelectedExternal.source}</p>
                      <p>Website: {linkedOrderForSelectedExternal.websiteLabel || 'Not available'}</p>
                      <p>Address: {linkedOrderForSelectedExternal.address || 'Not available'}</p>
                      <p>
                        City/State/PIN: {linkedOrderForSelectedExternal.city || '-'}, {linkedOrderForSelectedExternal.state || '-'} {linkedOrderForSelectedExternal.pincode || '-'}
                      </p>
                      <p>Order total: {formatINR(linkedOrderForSelectedExternal.total || 0)}</p>
                      <p>Order status: {linkedOrderForSelectedExternal.status || 'Not available'}</p>
                    </div>
                  ) : (
                    <p className='mt-3 text-sm text-muted-foreground'>
                      Full buyer/order details are not available in this imported Delhivery record.
                    </p>
                  )}
                </div>

                {linkedOrderForSelectedExternal ? (
                  <div className='rounded-lg border p-4'>
                    <p className='text-sm font-medium'>Products</p>
                    <div className='mt-3 space-y-3'>
                      {linkedOrderForSelectedExternal.items.map((item, index) => (
                        <div
                          key={`${linkedOrderForSelectedExternal.id}-${item.productName}-${index}`}
                          className='flex items-start gap-3 rounded-lg border p-3 text-sm text-muted-foreground'
                        >
                          <img
                            src={getItemImage(item)}
                            alt={item.productName || 'Product'}
                            className='size-16 rounded-md border object-cover'
                          />
                          <div>
                            <p className='font-medium text-foreground'>{item.productName}</p>
                            <p>
                              Qty {item.quantity} | {formatINR(item.totalPrice || item.unitPrice * item.quantity)}
                            </p>
                            <p>Unit price: {formatINR(item.unitPrice || 0)}</p>
                            {item.variantSummary ? <p>{item.variantSummary}</p> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className='rounded-lg border p-4'>
                  <p className='text-sm font-medium'>Tracking History</p>
                  <div className='mt-3 space-y-3'>
                    {selectedShipment.externalShipment.scans?.length ? (
                      selectedShipment.externalShipment.scans.map((scan, index) => (
                        <div
                          key={`${selectedShipment.externalShipment.id}-scan-${index}-${readText(scan.time)}`}
                          className='rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground'
                        >
                          <p className='font-medium text-foreground'>
                            {readText(scan.status || scan.status_type || 'Update')}
                          </p>
                          {scan.description ? <p className='mt-1'>{scan.description}</p> : null}
                          <p className='mt-1'>Location: {scan.location || 'Not available'}</p>
                          <p className='mt-1'>
                            Time:{' '}
                            {scan.time ? new Date(scan.time).toLocaleString('en-IN') : 'Not available'}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className='rounded-md border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground'>
                        No scan history stored yet. Open Delhivery Sync and run `Track now` to fetch it.
                      </div>
                    )}
                  </div>
                </div>

                <div className='flex flex-wrap justify-end gap-2'>
                  <Button
                    variant='outline'
                    className='border-border bg-background text-foreground hover:bg-accent hover:text-foreground'
                    onClick={() => window.location.assign(buildTrackingPath(selectedShipment))}
                  >
                    Open Tracking
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(labelPreview)}
          onOpenChange={(open) => {
            if (!open) {
              setLabelPreview(null)
            }
          }}
        >
          <DialogContent className='max-w-xl rounded-md'>
            <DialogHeader>
              <DialogTitle>{labelPreview?.title || 'Delhivery label response'}</DialogTitle>
              <DialogDescription>
                Label is ready to download
              </DialogDescription>
            </DialogHeader>
            {labelPreview?.url ? (
              <div className='flex justify-end pt-2'>
                <Button
                  className='rounded-md bg-primary text-white hover:bg-primary/90'
                  onClick={() => window.open(labelPreview.url, '_blank', 'noopener,noreferrer')}
                >
                  <Download className='h-4 w-4' />
                  Open label
                </Button>
              </div>
            ) : (
              <div className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
                Delhivery did not return a direct label URL.
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
