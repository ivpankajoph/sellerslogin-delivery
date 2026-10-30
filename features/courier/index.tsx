"use client"

import { useNavigate } from '@/lib/router'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
  Search,
  Send,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createDelhiveryWarehouse,
  createDelhiveryShipment,
  createShadowfaxWarehouse,
  createShadowfaxShipment,
  fetchDelhiveryB2cServiceability,
  fetchCourierWarehouses,
  fetchDelhiveryShippingEstimate,
  fetchShadowfaxServiceability,
  loadCourierOrders,
  previewDeliveryMarkup,
  type CourierWarehouse,
  type ShadowfaxWarehouse,
} from '@/features/delivery-system/lib/api'
import {
  COURIER_PARTNER_MAP,
  estimateCourierQuote,
  normalizeCourierOrder,
  type CourierOrderSummary,
  type CourierPartnerId,
} from '@/features/delivery-system/lib/data'
import { formatINR } from '@/lib/currency'
import type { RootState } from '@/store'

type CheckResult = {
  id: CourierPartnerId
  title: string
  state: 'ok' | 'bad' | 'warn' | 'error'
  summary: string
  priceLabel: string
  quotedAmount: number | null
  actualAmount?: number | null
  rows: string[]
}

type CreateRequestError = {
  message: string
  field?: string
}

const readText = (value: unknown) => String(value ?? '').trim()
const isOpenOrderStatus = (value: unknown) => {
  const status = readText(value).toLowerCase()
  return !['delivered', 'cancelled', 'canceled'].includes(status)
}
const getShadowfaxApiFailure = (response: any) => {
  const rawStatus = readText(
    response?.response?.status ||
      response?.status ||
      response?.details?.message ||
      response?.message
  ).toLowerCase()
  if (!['failed', 'failure', 'error'].includes(rawStatus)) return ''
  return (
    readText(response?.details?.errors) ||
    readText(response?.response?.message) ||
    readText(response?.response?.errors) ||
    readText(response?.response?.error) ||
    readText(response?.response?.detail) ||
    readText(response?.errors) ||
    readText(response?.message) ||
    readText(response?.error) ||
    'Shadowfax API returned a failed response.'
  )
}
const getShadowfaxCreateFailure = (data: any): CreateRequestError | null => {
  const failure = getShadowfaxApiFailure(data)
  const missingCarrierId =
    !readText(data?.shipment?.order_id) &&
    !readText(data?.shipment?.tracking_number) &&
    !readText(data?.shipment?.awb_number) &&
    !readText(data?.response?.order_id) &&
    !readText(data?.response?.tracking_number) &&
    !readText(data?.response?.awb_number)

  if (!failure && !missingCarrierId && data?.success !== false) return null

  const details = data?.details || {}
  return {
    message:
      failure ||
      readText(details?.errors) ||
      readText(data?.message) ||
      'Shadowfax did not return an order id or AWB, so the request was not saved as created',
    field: readText(details?.field) || undefined,
  }
}
const getShadowfaxCreateError = (err: any): CreateRequestError => {
  const data = err?.response?.data || {}
  const details = data?.details || {}
  const carrierResponse = details?.response || {}
  return {
    message:
      readText(carrierResponse?.errors) ||
      readText(details?.errors) ||
      readText(data?.message) ||
      readText(details?.message) ||
      readText(carrierResponse?.message) ||
      readText(carrierResponse?.error) ||
      readText(carrierResponse?.detail) ||
      readText(err?.message) ||
      'Shadowfax request creation failed',
    field: readText(details?.field) || undefined,
  }
}
const isTimeoutError = (err: any) =>
  readText(err?.code).toUpperCase() === 'ECONNABORTED' ||
  readText(err?.message).toLowerCase().includes('timeout')
const isShadowfaxWarehouse = (warehouse: CourierWarehouse): warehouse is ShadowfaxWarehouse =>
  warehouse.provider === 'shadowfax'
const getWarehousePin = (warehouse: CourierWarehouse | null) =>
  readText(warehouse?.pin || (warehouse as ShadowfaxWarehouse | null)?.pincode)
const getWarehouseAddress = (warehouse: CourierWarehouse | null) =>
  readText(warehouse?.address || (warehouse as ShadowfaxWarehouse | null)?.address_line_1)
const normalizeMatchText = (value: unknown) => readText(value).toLowerCase().replace(/\s+/g, ' ')
const normalizePhone = (value: unknown) => {
  const digits = readText(value).replace(/\D/g, '')
  if (!digits) return ''
  return digits.length > 10 ? digits.slice(-10) : digits
}
const isSameWarehouseLocation = (left: CourierWarehouse | null, right: CourierWarehouse | null) => {
  if (!left || !right) return false
  const leftPin = getWarehousePin(left)
  const rightPin = getWarehousePin(right)
  if (!leftPin || leftPin !== rightPin) return false
  const leftName = normalizeMatchText(left.name)
  const rightName = normalizeMatchText(right.name)
  if (leftName && rightName && leftName === rightName) return true
  const leftAddress = normalizeMatchText(getWarehouseAddress(left))
  const rightAddress = normalizeMatchText(getWarehouseAddress(right))
  return Boolean(leftAddress && rightAddress && leftAddress === rightAddress)
}
const buildWarehouseUniqueCode = (warehouse: CourierWarehouse) =>
  `SL-${getWarehousePin(warehouse) || 'WH'}-${readText(warehouse.name)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'WAREHOUSE'}`
const getWarehouseTime = (warehouse: CourierWarehouse) =>
  new Date(warehouse.updatedAt || warehouse.createdAt || 0).getTime()
const hasShadowfaxPickupDetails = (warehouse: ShadowfaxWarehouse | null) =>
  Boolean(
    readText(warehouse?.name) &&
      readText(warehouse?.contact || warehouse?.phone) &&
      readText(warehouse?.address_line_1 || warehouse?.address) &&
      readText(warehouse?.city) &&
      readText(warehouse?.state) &&
      readText(warehouse?.pincode || warehouse?.pin) &&
      readText(warehouse?.unique_code)
  )
const buildShadowfaxPickupPayload = (warehouse: ShadowfaxWarehouse) => ({
  pickup_name: readText(warehouse.name),
  pickup_contact: readText(warehouse.contact || warehouse.phone),
  pickup_email: readText(warehouse.email),
  pickup_address_line_1: readText(warehouse.address_line_1 || warehouse.address),
  pickup_address_line_2: readText(warehouse.address_line_2),
  pickup_city: readText(warehouse.city),
  pickup_state: readText(warehouse.state),
  pickup_pincode: readText(warehouse.pincode || warehouse.pin),
  pickup_latitude: readText(warehouse.latitude),
  pickup_longitude: readText(warehouse.longitude),
  pickup_unique_code: readText(warehouse.unique_code),
  rts_name: readText(warehouse.name),
  rts_contact: readText(warehouse.contact || warehouse.phone),
  rts_email: readText(warehouse.email),
  rts_address_line_1: readText(warehouse.address_line_1 || warehouse.address),
  rts_address_line_2: readText(warehouse.address_line_2),
  rts_city: readText(warehouse.city),
  rts_state: readText(warehouse.state),
  rts_pincode: readText(warehouse.pincode || warehouse.pin),
  rts_latitude: readText(warehouse.latitude),
  rts_longitude: readText(warehouse.longitude),
  rts_unique_code: readText(warehouse.unique_code),
})

const badgeTone = (state: CheckResult['state']) =>
  state === 'ok'
    ? { label: 'Available', className: 'border-emerald-500/20 bg-muted0/10 text-foreground dark:text-emerald-200', Icon: CheckCircle2 }
    : state === 'bad'
      ? { label: 'Unavailable', className: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-200', Icon: XCircle }
      : state === 'warn'
        ? { label: 'Needs input', className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200', Icon: AlertTriangle }
        : { label: 'API error', className: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-200', Icon: AlertTriangle }

export function CourierDeskPage() {
  const navigate = useNavigate()
  const user = useSelector((state: RootState) => state.auth?.user)
  const role = String(user?.role || '').toLowerCase()
  const isVendor = role === 'vendor'
  const initialQuery = useMemo(() => {
    if (typeof window === 'undefined') {
      return { orderId: '', origin: '', destination: '' }
    }
    const params = new URLSearchParams(window.location.search)
    return {
      orderId: readText(params.get('orderId')),
      origin: readText(params.get('origin')),
      destination: readText(params.get('destination')),
    }
  }, [])

  useEffect(() => {
    if (user && !isVendor) {
      void navigate({ to: '/' })
    }
  }, [isVendor, navigate, user])

  const [orders, setOrders] = useState<CourierOrderSummary[]>([])
  const [warehouses, setWarehouses] = useState<CourierWarehouse[]>([])
  const [warehousesLoading, setWarehousesLoading] = useState(true)
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState(initialQuery.orderId)
  const [destination, setDestination] = useState(initialQuery.destination)
  const [results, setResults] = useState<CheckResult[]>([])
  const [confirmRequest, setConfirmRequest] = useState<CheckResult | null>(null)
  const [creatingPartnerId, setCreatingPartnerId] = useState<CourierPartnerId | null>(null)
  const [addingWarehouseFor, setAddingWarehouseFor] = useState<CourierPartnerId | null>(null)
  const [createRequestError, setCreateRequestError] = useState<CreateRequestError | null>(null)
  const [autoCheckDone, setAutoCheckDone] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const orderedWarehouses = useMemo(
    () =>
      [...warehouses].sort((a, b) => {
        return getWarehouseTime(b) - getWarehouseTime(a)
      }),
    [warehouses]
  )
  const originWarehouses = useMemo(() => orderedWarehouses, [orderedWarehouses])
  const shadowfaxWarehouses = useMemo(
    () => orderedWarehouses.filter(isShadowfaxWarehouse),
    [orderedWarehouses]
  )
  const delhiveryWarehouses = useMemo(
    () => orderedWarehouses.filter((warehouse) => warehouse.provider === 'delhivery'),
    [orderedWarehouses]
  )

  const selectedWarehouse = useMemo(
    () =>
      originWarehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ||
      originWarehouses.find((warehouse) => readText(warehouse.pin || (warehouse as ShadowfaxWarehouse).pincode)) ||
      null,
    [originWarehouses, selectedWarehouseId]
  )
  const selectedShadowfaxPickup = useMemo(
    () =>
      shadowfaxWarehouses.find((warehouse) => isSameWarehouseLocation(selectedWarehouse, warehouse)) ||
      shadowfaxWarehouses.find(hasShadowfaxPickupDetails) ||
      shadowfaxWarehouses[0] ||
      null,
    [selectedWarehouse, shadowfaxWarehouses]
  )
  const selectedDelhiveryWarehouse = useMemo(
    () =>
      selectedWarehouse?.provider === 'delhivery'
        ? selectedWarehouse
        : delhiveryWarehouses.find((warehouse) => isSameWarehouseLocation(selectedWarehouse, warehouse)) || null,
    [delhiveryWarehouses, selectedWarehouse]
  )
  const selectedWarehouseInApp = (partnerId: CourierPartnerId) =>
    partnerId === 'delhivery'
      ? Boolean(selectedDelhiveryWarehouse)
      : partnerId === 'shadowfax'
        ? Boolean(
            selectedShadowfaxPickup &&
              isSameWarehouseLocation(selectedWarehouse, selectedShadowfaxPickup) &&
              hasShadowfaxPickupDetails(selectedShadowfaxPickup)
          )
        : true

  const warehousePincode = useMemo(
    () => readText(selectedWarehouse?.pin || (selectedWarehouse as ShadowfaxWarehouse)?.pincode),
    [selectedWarehouse]
  )
  const shadowfaxPickupPincode = useMemo(
    () => readText(selectedShadowfaxPickup?.pincode || selectedShadowfaxPickup?.pin),
    [selectedShadowfaxPickup?.pin, selectedShadowfaxPickup?.pincode]
  )
  const availableFallbackRequests = useMemo(
    () =>
      results.filter(
        (item) =>
          item.id !== confirmRequest?.id &&
          item.state === 'ok' &&
          selectedWarehouseInApp(item.id)
      ),
    [confirmRequest?.id, results, selectedDelhiveryWarehouse, selectedShadowfaxPickup, selectedWarehouse]
  )

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const nextOrders = await loadCourierOrders(isVendor)
        if (cancelled) return
        setOrders(nextOrders)
      } catch (err: any) {
        if (cancelled) return
        setError(err?.response?.data?.message || 'Failed to load courier desk')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isVendor, refreshKey])

  useEffect(() => {
    let cancelled = false

    const loadWarehouses = async () => {
      try {
        setWarehousesLoading(true)
        const rows = await fetchCourierWarehouses()
        if (cancelled) return
        setWarehouses(rows)
      } catch (err: any) {
        if (cancelled) return
        toast.error(err?.response?.data?.message || 'Failed to load courier warehouses')
        setWarehouses([])
      } finally {
        if (!cancelled) setWarehousesLoading(false)
      }
    }

    void loadWarehouses()

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    const refresh = () => setRefreshKey((current) => current + 1)
    window.addEventListener('delivery-workspace-refresh', refresh)
    return () => window.removeEventListener('delivery-workspace-refresh', refresh)
  }, [])

  const reloadWarehouses = async () => {
    const rows = await fetchCourierWarehouses()
    setWarehouses(rows)
    return rows
  }

  const addSelectedWarehouseToApp = async (partnerId: CourierPartnerId) => {
    if (!selectedWarehouse) {
      toast.error('Select a warehouse first')
      return
    }
    if (partnerId !== 'delhivery' && partnerId !== 'shadowfax') {
      toast.error('Warehouse sync is not available for this app')
      return
    }

    setAddingWarehouseFor(partnerId)
    try {
      if (partnerId === 'delhivery') {
        const shadowfaxWarehouse = selectedWarehouse as ShadowfaxWarehouse
        const address = getWarehouseAddress(selectedWarehouse)
        const pin = getWarehousePin(selectedWarehouse)
        const phone = normalizePhone(shadowfaxWarehouse.contact || shadowfaxWarehouse.phone)
        if (!phone) {
          toast.error('Warehouse phone number is required before adding it to Delhivery')
          return
        }
        await createDelhiveryWarehouse({
          name: readText(selectedWarehouse.name),
          registered_name: readText(selectedWarehouse.name),
          phone,
          email: readText(shadowfaxWarehouse.email),
          address,
          city: readText(shadowfaxWarehouse.city),
          pin,
          country: 'India',
          return_address: address,
          return_city: readText(shadowfaxWarehouse.city),
          return_pin: pin,
          return_state: readText(shadowfaxWarehouse.state),
          return_country: 'India',
          working_days: selectedWarehouse.working_days || [],
        })
      } else {
        const state = readText((selectedWarehouse as any).state || (selectedWarehouse as any).return_state)
        await createShadowfaxWarehouse({
          name: readText(selectedWarehouse.name),
          contact: readText((selectedWarehouse as any).contact || (selectedWarehouse as any).phone),
          email: readText((selectedWarehouse as any).email),
          address_line_1: getWarehouseAddress(selectedWarehouse),
          address_line_2: readText((selectedWarehouse as any).address_line_2),
          city: readText((selectedWarehouse as any).city || (selectedWarehouse as any).return_city),
          state,
          pincode: getWarehousePin(selectedWarehouse),
          latitude: readText((selectedWarehouse as any).latitude),
          longitude: readText((selectedWarehouse as any).longitude),
          unique_code: readText((selectedWarehouse as any).unique_code) || buildWarehouseUniqueCode(selectedWarehouse),
          working_days: selectedWarehouse.working_days || [],
        })
      }

      await reloadWarehouses()
      setResults([])
      toast.success(`Warehouse added to ${COURIER_PARTNER_MAP[partnerId].title}. Check price again.`)
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.details?.message ||
        err?.message ||
        `Failed to add warehouse to ${COURIER_PARTNER_MAP[partnerId].title}`
      toast.error(message)
    } finally {
      setAddingWarehouseFor(null)
    }
  }

  useEffect(() => {
    setSelectedWarehouseId((current) => {
      if (current && originWarehouses.some((warehouse) => warehouse.id === current)) {
        return current
      }
      return originWarehouses.find((warehouse) => readText(warehouse.pin || (warehouse as ShadowfaxWarehouse).pincode))?.id || ''
    })
  }, [originWarehouses])

  const selectableOrders = useMemo(
    () => orders.filter((order) => isOpenOrderStatus(order.status)),
    [orders]
  )
  const selectedOrder = useMemo(
    () => selectableOrders.find((order) => order.id === selectedOrderId) || null,
    [selectableOrders, selectedOrderId]
  )
  useEffect(() => {
    setSelectedOrderId((current) =>
      current && selectableOrders.some((order) => order.id === current)
        ? current
        : selectableOrders[0]?.id || ''
    )
  }, [selectableOrders])

  useEffect(() => {
    if (!selectedOrder) return
    setDestination(selectedOrder.pincode || '')
    setResults([])
  }, [selectedOrder])

  const runCheck = async () => {
    const resolvedOrigin = warehousePincode
    const resolvedDestination = readText(selectedOrder?.pincode || destination)

    if (!selectedOrder) return toast.error('Select an order first')
    if (!resolvedDestination) return toast.error('Customer pincode is required')
    if (!selectedWarehouse) return toast.error('Create a warehouse first')
    if (!resolvedOrigin) return toast.error('Warehouse pin is required')

    setChecking(true)
    try {
      const [delhivery, delhiveryEstimate, shadowfax] = await Promise.allSettled([
        fetchDelhiveryB2cServiceability(resolvedDestination),
        fetchDelhiveryShippingEstimate({
          md: 'S',
          cgm: '500',
          o_pin: resolvedOrigin,
          d_pin: resolvedDestination,
          ss: 'Delivered',
          pt: 'Pre-paid',
          l: '10',
          b: '10',
          h: '10',
          ipkg_type: 'box',
        }),
        fetchShadowfaxServiceability({
          pincodes: resolvedDestination,
          service: 'customer_delivery',
          page: 1,
          count: 10,
        }),
      ])

      const next: CheckResult[] = []

      if (delhivery.status === 'fulfilled') {
        const serviceability = delhivery.value?.serviceability || {}
        const estimate = delhiveryEstimate.status === 'fulfilled'
          ? delhiveryEstimate.value?.estimate || {}
          : {}
        const estimateError =
          delhiveryEstimate.status === 'rejected'
            ? delhiveryEstimate.reason?.response?.data?.message ||
              delhiveryEstimate.reason?.message ||
              'Delhivery price check failed.'
            : ''
        const delhiveryActualPrice = Number(estimate?.estimated_charge || 0)
        const delhiveryMarkup = delhiveryActualPrice
          ? await previewDeliveryMarkup({
              partner_id: 'delhivery',
              actual_price: delhiveryActualPrice,
              order_id: selectedOrder.id,
              order_number: selectedOrder.orderNumber,
            }).catch(() => null)
          : null
        const delhiveryPrice = Number(delhiveryMarkup?.hiked_price || delhiveryActualPrice || 0)
        const delhiveryWarehouseReady = Boolean(selectedDelhiveryWarehouse)
        next.push({
          id: 'delhivery',
          title: 'Delhivery',
          state: !delhiveryWarehouseReady
            ? 'warn'
            : serviceability?.serviceable
            ? estimateError
              ? 'error'
              : 'ok'
            : 'bad',
          priceLabel: delhiveryPrice
            ? formatINR(delhiveryPrice)
            : estimateError
              ? 'Price unavailable'
              : 'Price not returned',
          quotedAmount: delhiveryPrice || null,
          actualAmount: delhiveryActualPrice || null,
          summary: estimateError
            ? estimateError
            : !delhiveryWarehouseReady
              ? 'This warehouse is not added in Delhivery.'
            : serviceability?.serviceable
              ? 'Customer pincode is serviceable on Delhivery.'
              : 'Delhivery did not return a serviceable record for this pincode.',
          rows: [
            `Warehouse: ${selectedWarehouse?.name || 'Selected warehouse'}`,
            `Origin pincode: ${resolvedOrigin}`,
            `Customer pincode: ${serviceability?.requested_pincode || resolvedDestination}`,
            `Matched records: ${serviceability?.code_count ?? 0}`,
            `Serviceable records: ${serviceability?.serviceable_count ?? 0}`,
            `Chargeable weight: ${estimate?.chargeable_weight ?? '500'} gm`,
            delhiveryWarehouseReady
              ? `Delhivery warehouse: ${selectedDelhiveryWarehouse?.name || 'Selected warehouse'}`
              : 'Add this warehouse to Delhivery before creating a Delhivery request.',
          ].filter(Boolean),
        })
      } else {
        next.push({
          id: 'delhivery',
          title: 'Delhivery',
          state: 'error',
          priceLabel: 'Price unavailable',
          quotedAmount: null,
          summary:
            delhivery.reason?.response?.data?.message ||
            delhivery.reason?.message ||
            'Delhivery serviceability check failed.',
          rows: ['Check Delhivery connection and try again.'],
        })
      }

      if (shadowfax.status === 'fulfilled') {
        const apiFailure = getShadowfaxApiFailure(shadowfax.value)
        const serviceability = shadowfax.value?.serviceability || {}
        const shadowfaxQuote = selectedOrder
          ? estimateCourierQuote(selectedOrder, 'shadowfax')
          : null
        const shadowfaxActualPrice = Number(shadowfaxQuote?.amount || 0)
        const shadowfaxMarkup = shadowfaxActualPrice
          ? await previewDeliveryMarkup({
              partner_id: 'shadowfax',
              actual_price: shadowfaxActualPrice,
              order_id: selectedOrder.id,
              order_number: selectedOrder.orderNumber,
            }).catch(() => null)
          : null
        const shadowfaxPrice = Number(shadowfaxMarkup?.hiked_price || shadowfaxActualPrice || 0)
        const shadowfaxReady =
          Boolean(selectedShadowfaxPickup && isSameWarehouseLocation(selectedWarehouse, selectedShadowfaxPickup)) &&
          hasShadowfaxPickupDetails(selectedShadowfaxPickup)
        next.push({
          id: 'shadowfax',
          title: 'Shadowfax',
          state: apiFailure
            ? 'error'
            : !shadowfaxReady
              ? 'warn'
              : serviceability?.serviceable
                ? 'ok'
                : 'bad',
          priceLabel: shadowfaxQuote
            ? `${formatINR(shadowfaxPrice)} est.`
            : 'Estimate after order selection',
          quotedAmount: shadowfaxPrice || null,
          actualAmount: shadowfaxActualPrice || null,
          summary: apiFailure
            ? apiFailure
            : !shadowfaxReady
              ? 'Create a Shadowfax pickup address before creating a Shadowfax request.'
              : serviceability?.serviceable
              ? 'Customer pincode is serviceable on Shadowfax.'
              : 'Shadowfax did not return a serviceable record for this pincode.',
          rows: [
            `Pickup address: ${selectedShadowfaxPickup?.name || 'No Shadowfax pickup address'}`,
            `Pickup pincode: ${shadowfaxPickupPincode || 'Not available'}`,
            `Customer pincode: ${serviceability?.requested_pincode || resolvedDestination}`,
            `Matched records: ${serviceability?.code_count ?? 0}`,
            `Serviceable records: ${serviceability?.serviceable_count ?? 0}`,
            shadowfaxReady
              ? `Pickup code: ${selectedShadowfaxPickup?.unique_code || 'Not available'}`
              : 'This warehouse is not added in Shadowfax.',
            shadowfaxQuote ? `ETA: ${shadowfaxQuote.etaLabel}` : 'Select an order for local price estimate.',
          ].filter(Boolean),
        })
      } else {
        next.push({
          id: 'shadowfax',
          title: 'Shadowfax',
          state: 'error',
          priceLabel: 'Price unavailable',
          quotedAmount: null,
          summary:
            shadowfax.reason?.response?.data?.message ||
            shadowfax.reason?.message ||
            'Shadowfax serviceability check failed.',
          rows: ['Check Shadowfax connection and try again.'],
        })
      }

      setResults(next)
    } finally {
      setChecking(false)
    }
  }

  const refreshOrderAfterCreate = async (createdOrder: unknown) => {
    const normalized = normalizeCourierOrder(createdOrder, selectedOrder?.source || 'orders')
    if (normalized) {
      setOrders((current) =>
        current.map((order) => (order.id === normalized.id ? normalized : order))
      )
      return
    }

    const nextOrders = await loadCourierOrders(isVendor)
    setOrders(nextOrders)
  }

  const recoverCreatedRequestAfterTimeout = async (partnerId: CourierPartnerId) => {
    if (!selectedOrder) return false
    const nextOrders = await loadCourierOrders(isVendor)
    setOrders(nextOrders)
    const updated = nextOrders.find(
      (order) => order.id === selectedOrder.id && order.source === selectedOrder.source
    )
    const hasDelhivery =
      partnerId === 'delhivery' &&
      Boolean(
        readText(updated?.delhivery?.waybill) ||
          updated?.delhivery?.waybills?.some((entry) => readText(entry))
      )
    const hasShadowfax =
      partnerId === 'shadowfax' &&
      Boolean(
        readText(updated?.shadowfax?.tracking_number) ||
          readText(updated?.shadowfax?.order_id)
      )
    return hasDelhivery || hasShadowfax
  }

  const createCourierRequest = async () => {
    if (!selectedOrder || !confirmRequest) return
    if (confirmRequest.state !== 'ok') {
      toast.error(`${confirmRequest.title} is not serviceable for this pincode`)
      return
    }
    if (!selectedWarehouseInApp(confirmRequest.id)) {
      setCreateRequestError({
        message: `This warehouse is not added in ${confirmRequest.title}. Add it before creating the request.`,
      })
      toast.error(`This warehouse is not added in ${confirmRequest.title}`)
      return
    }
    if (confirmRequest.id === 'shadowfax' && !hasShadowfaxPickupDetails(selectedShadowfaxPickup)) {
      setCreateRequestError({
        message: 'Create a Shadowfax pickup address before creating a Shadowfax request',
        field: 'pickup_details.address_line_1',
      })
      toast.error('Create a Shadowfax pickup address before creating a Shadowfax request')
      return
    }

    setCreatingPartnerId(confirmRequest.id)
    setCreateRequestError(null)
    try {
      const quotedFromPincode =
        confirmRequest.id === 'shadowfax' ? shadowfaxPickupPincode : warehousePincode
      const payload = {
        price_quote: confirmRequest.quotedAmount,
        actual_price_quote: confirmRequest.actualAmount,
        price_label: confirmRequest.priceLabel,
        quoted_from_pincode: quotedFromPincode,
        quoted_to_pincode: readText(selectedOrder.pincode || destination),
        ...(confirmRequest.id === 'delhivery' && selectedDelhiveryWarehouse
          ? { pickup_location: selectedDelhiveryWarehouse.name }
          : {}),
        ...(confirmRequest.id === 'shadowfax' && selectedShadowfaxPickup
          ? buildShadowfaxPickupPayload(selectedShadowfaxPickup)
          : {}),
      }
      const data =
        confirmRequest.id === 'delhivery'
          ? await createDelhiveryShipment(selectedOrder, payload)
          : await createShadowfaxShipment(selectedOrder, payload)

      if (confirmRequest.id === 'shadowfax') {
        const shadowfaxFailure = getShadowfaxCreateFailure(data)
        if (shadowfaxFailure) {
          setCreateRequestError(shadowfaxFailure)
          toast.error(
            shadowfaxFailure.field
              ? `${shadowfaxFailure.message} (${shadowfaxFailure.field})`
              : shadowfaxFailure.message
          )
          return
        }
      }

      await refreshOrderAfterCreate(data?.order)
      toast.success(`${confirmRequest.title} request created and saved to courier dashboard`)
      setConfirmRequest(null)
      void navigate({ to: '/courier/list' })
    } catch (err: any) {
      if (isTimeoutError(err) && confirmRequest) {
        const recovered = await recoverCreatedRequestAfterTimeout(confirmRequest.id)
        if (recovered) {
          toast.success(`${confirmRequest.title} request created. Redirecting to courier dashboard.`)
          setConfirmRequest(null)
          void navigate({ to: '/courier/list' })
          return
        }
        const message =
          'Request is still processing. Please refresh courier list before trying again.'
        setCreateRequestError({ message })
        toast.error(message)
        return
      }

      if (confirmRequest.id === 'shadowfax') {
        const shadowfaxError = getShadowfaxCreateError(err)
        setCreateRequestError(shadowfaxError)
        toast.error(
          shadowfaxError.field
            ? `${shadowfaxError.message} (${shadowfaxError.field})`
            : shadowfaxError.message
        )
      } else {
        const message =
          err?.response?.data?.message ||
          err?.response?.data?.details?.message ||
          err?.message ||
          `${confirmRequest.title} request creation failed`
        setCreateRequestError({ message })
        toast.error(
          message
        )
      }
    } finally {
      setCreatingPartnerId(null)
    }
  }

  useEffect(() => {
    if (!initialQuery.orderId && !initialQuery.destination) return
    if (!selectedOrder) return
    if (loading || checking || autoCheckDone) return
    if (!warehousePincode || !readText(selectedOrder.pincode || destination)) return
    setAutoCheckDone(true)
    void runCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrder, loading, checking, autoCheckDone, warehousePincode, destination])

  return (
    <>
      <div className='space-y-5'>
        <div className='overflow-hidden rounded-md border border-border bg-card p-4 md:p-5'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='space-y-2'>
              <h1 className='text-lg font-semibold tracking-tight text-foreground'>Check Price</h1>
              <p className='max-w-3xl text-sm leading-6 text-muted-foreground'>
                Select an order to check courier app availability by customer pincode.
                Shipment creation happens on the selected courier app page.
              </p>
            </div>
          </div>
        </div>

        <Card className='border-border bg-card shadow-sm'>
          <CardContent className='space-y-6'>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Order</label>
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className='vendor-field flex h-11 w-full rounded-md border bg-transparent px-4 py-2 text-sm shadow-sm outline-none'
              >
                <option value=''>
                  {selectableOrders.length ? 'Select order' : 'No open orders available'}
                </option>
                {selectableOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.manualCourier ? 'Manual | ' : ''}{order.orderNumber} | {order.customerName} | {order.pincode || 'No pincode'} | {order.status}
                  </option>
                ))}
              </select>
              {selectedOrder ? (
                <p className='text-sm text-muted-foreground'>
                  {selectedOrder.orderNumber} | {selectedOrder.customerName} | {selectedOrder.pincode || 'No pincode'}
                </p>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  Select an open order to continue on the courier app page.
                </p>
              )}
            </div>
            <div className='space-y-2'>
              <label className='text-sm font-medium text-foreground'>Origin warehouse</label>
              <select
                value={selectedWarehouse?.id || ''}
                onChange={(e) => {
                  setSelectedWarehouseId(e.target.value)
                  setResults([])
                }}
                className='vendor-field flex h-11 w-full rounded-md border bg-transparent px-4 py-2 text-sm shadow-sm outline-none'
                disabled={warehousesLoading || !originWarehouses.length}
              >
                <option value=''>
                  {warehousesLoading
                    ? 'Loading warehouses'
                    : originWarehouses.length
                      ? 'Select warehouse'
                      : 'No warehouse created'}
                </option>
                {originWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name || 'Warehouse'} | {warehouse.pin || (warehouse as ShadowfaxWarehouse).pincode || 'No pin'}
                  </option>
                ))}
              </select>
              {selectedWarehouse ? (
                <p className='text-sm text-muted-foreground'>
                  Calculating from {selectedWarehouse.name || 'selected warehouse'}
                  {(selectedWarehouse.pin || (selectedWarehouse as ShadowfaxWarehouse).pincode) ? `, ${selectedWarehouse.pin || (selectedWarehouse as ShadowfaxWarehouse).pincode}` : ''}
                  {selectedWarehouse.address || (selectedWarehouse as ShadowfaxWarehouse).address_line_1 ? ` | ${selectedWarehouse.address || (selectedWarehouse as ShadowfaxWarehouse).address_line_1}` : ''}
                </p>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  Create a warehouse before checking price.
                </p>
              )}
            </div>
            {selectedOrder ? (
              <div className='grid gap-4 md:grid-cols-4'>
                <div className='rounded-md border border-border bg-muted/30 p-4'>
                  <p className='text-xs font-semibold uppercase text-muted-foreground'>Origin warehouse</p>
                  <p className='mt-2 text-lg font-semibold text-foreground'>
                    {selectedWarehouse?.name || 'Not selected'}
                  </p>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {selectedWarehouse?.pin || (selectedWarehouse as ShadowfaxWarehouse)?.pincode || 'No pin'}
                  </p>
                </div>
                <div className='rounded-md border border-border bg-muted/30 p-4'>
                  <p className='text-xs font-semibold uppercase text-muted-foreground'>Customer pincode</p>
                  <p className='mt-2 text-lg font-semibold text-foreground'>
                    {selectedOrder.pincode || 'Not available'}
                  </p>
                </div>
                <div className='rounded-md border border-border bg-muted/30 p-4'>
                  <p className='text-xs font-semibold uppercase text-muted-foreground'>Customer</p>
                  <p className='mt-2 text-lg font-semibold text-foreground'>
                    {selectedOrder.customerName}
                  </p>
                </div>
                <div className='rounded-md border border-border bg-muted/30 p-4'>
                  <p className='text-xs font-semibold uppercase text-muted-foreground'>Order value</p>
                  <p className='mt-2 text-lg font-semibold text-foreground'>
                    {formatINR(selectedOrder.total)}
                  </p>
                </div>
              </div>
            ) : null}

            <div className='flex flex-wrap items-center gap-3'>
              <Button
                className='rounded-md bg-primary text-primary-foreground hover:bg-primary/90'
                disabled={checking || warehousesLoading || !selectedOrder || !selectedWarehouse}
                onClick={() => void runCheck()}
              >
                {checking ? <LoaderCircle className='h-4 w-4 animate-spin' /> : <Search className='h-4 w-4' />}
                {checking ? 'Checking price' : 'Check price'}
              </Button>
              <p className='text-sm text-muted-foreground'>
                Pricing uses the selected warehouse pin as origin.
              </p>
              {!selectedWarehouse && !warehousesLoading ? (
                <Button
                  variant='outline'
                  className='rounded-md'
                  onClick={() => void navigate({ to: '/courier/warehouses' })}
                >
                  Create Warehouse
                  <ArrowUpRight className='h-4 w-4' />
                </Button>
              ) : null}
            </div>

            {error ? (
              <div className='rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-200'>
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className='rounded-2xl border border-border bg-muted/40 p-6 text-sm text-muted-foreground'>
                Loading courier desk...
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className='border-border bg-card shadow-sm'>
          <CardContent>
            {!results.length ? (
              <div className='rounded-2xl border border-dashed border-border bg-muted/40 p-8 text-sm text-muted-foreground'>
                Select an order to check courier app availability and price.
              </div>
            ) : (
              <div className='grid gap-4 xl:grid-cols-2'>
                {results.map((item) => {
                  const tone = badgeTone(item.state)
                  const Icon = tone.Icon
                  const partner = COURIER_PARTNER_MAP[item.id]
                  const warehouseMissingInApp = !selectedWarehouseInApp(item.id)
                  const canCreateRequest =
                    Boolean(selectedOrder) &&
                    item.state === 'ok' &&
                    !warehouseMissingInApp &&
                    !creatingPartnerId

                  return (
                    <div key={item.id} className='rounded-3xl border border-border bg-card p-5 shadow-sm'>
                      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                        <div className='flex items-start gap-4'>
                          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border bg-background shadow-sm ${partner.themeClass}`}>
                            {partner.imageSrc ? (
                              <img src={partner.imageSrc} alt={partner.title} className='max-h-10 max-w-11 object-contain' />
                            ) : (
                              <span className='text-sm font-semibold text-foreground'>
                                {partner.shortLabel.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className='text-xl font-semibold text-foreground'>{item.title}</p>
                            <p className='mt-1 text-2xl font-bold text-foreground'>{item.priceLabel}</p>
                          </div>
                        </div>
                        <Badge className={tone.className}>
                          <Icon className='mr-1 h-3.5 w-3.5' />
                          {tone.label}
                        </Badge>
                      </div>

                      <div className='mt-4 space-y-3'>
                        <div className='rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-6 text-foreground'>
                          {item.summary}
                        </div>
                        <div className='rounded-2xl border border-border bg-background p-4 text-sm text-foreground'>
                          <div className='space-y-2'>
                            {item.rows.map((row) => (
                              <p key={row}>{row}</p>
                            ))}
                          </div>
                        </div>
                        {warehouseMissingInApp ? (
                          <div className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-100'>
                            This warehouse is not added in {partner.title}. Add it to {partner.title}, then check price again.
                          </div>
                        ) : null}
                        <div className='rounded-2xl border border-border bg-muted/30 p-4'>
                          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                            <div>
                      
                            </div>
                            <div className='flex flex-wrap gap-2'>
                              <Button
                                className='rounded-md bg-primary text-primary-foreground hover:bg-primary/90'
                                disabled={!canCreateRequest}
                                onClick={() => {
                                  setCreateRequestError(null)
                                  setConfirmRequest(item)
                                }}
                              >
                                <Send className='h-4 w-4' />
                                Create request
                              </Button>
                              {warehouseMissingInApp && (item.id === 'delhivery' || item.id === 'shadowfax') ? (
                                <Button
                                  variant='outline'
                                  className='rounded-md'
                                  disabled={Boolean(addingWarehouseFor)}
                                  onClick={() => void addSelectedWarehouseToApp(item.id)}
                                >
                                  {addingWarehouseFor === item.id ? (
                                    <LoaderCircle className='h-4 w-4 animate-spin' />
                                  ) : (
                                    <ArrowUpRight className='h-4 w-4' />
                                  )}
                                  Add warehouse to {partner.title}
                                </Button>
                              ) : null}
                              {/* <Button
                                variant='outline'
                                className='rounded-md'
                                disabled={!selectedOrder}
                                onClick={() => openPartnerPage(item.id)}
                              >
                                Open {partner.title}
                              </Button> */}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(confirmRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmRequest(null)
            setCreateRequestError(null)
          }
        }}
      >
        <DialogContent className='w-[min(96vw,680px)] max-h-[90vh] overflow-y-auto rounded-md'>
          <DialogHeader className='text-left'>
            <DialogTitle>Confirm courier request</DialogTitle>
            <DialogDescription>
              Review the selected delivery app, order, warehouse, customer, and price before creating the shipment.
            </DialogDescription>
          </DialogHeader>

          {confirmRequest && selectedOrder ? (
            <div className='space-y-4'>
              <div className='rounded-md border border-border bg-muted/30 p-4'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='text-sm text-muted-foreground'>Delivery app</p>
                    <p className='text-xl font-semibold text-foreground'>{confirmRequest.title}</p>
                  </div>
                  <div className='text-right'>
                    <p className='text-sm text-muted-foreground'>Price</p>
                    <p className='text-2xl font-bold text-foreground'>{confirmRequest.priceLabel}</p>
                  </div>
                </div>
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <DetailLine label='Order' value={selectedOrder.orderNumber} />
                <DetailLine label='Order value' value={formatINR(selectedOrder.total)} />
                <DetailLine label='Customer' value={selectedOrder.customerName} />
                <DetailLine label='Phone' value={selectedOrder.customerPhone || 'Not available'} />
                <DetailLine label='Customer pincode' value={selectedOrder.pincode || destination || 'Not available'} />
                <DetailLine label='Items' value={`${selectedOrder.itemsCount || 1}`} />
                <DetailLine
                  label={confirmRequest.id === 'shadowfax' ? 'Pickup address' : 'Warehouse'}
                  value={
                    confirmRequest.id === 'shadowfax'
                      ? selectedShadowfaxPickup?.name || 'Shadowfax pickup address'
                      : selectedWarehouse?.name || 'Selected warehouse'
                  }
                />
                <DetailLine
                  label={confirmRequest.id === 'shadowfax' ? 'Pickup pincode' : 'Origin pincode'}
                  value={
                    confirmRequest.id === 'shadowfax'
                      ? shadowfaxPickupPincode || 'Not available'
                      : warehousePincode || 'Not available'
                  }
                />
              </div>

              <div className='rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground'>
                This will call the connected {confirmRequest.title} create-order API. If the carrier accepts it, the tracking details are stored on this order and it appears under Courier Dashboard and Tracking.
              </div>

              {createRequestError ? (
                <div className='rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-200'>
                  <div className='flex items-start gap-2'>
                    <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                    <div className='space-y-3'>
                      <p className='font-semibold'>{createRequestError.message}</p>
                      {createRequestError.field ? (
                        <p className='text-rose-700/80 dark:text-rose-200/80'>
                          Field: {createRequestError.field}
                        </p>
                      ) : null}
                      {availableFallbackRequests.length ? (
                        <div className='space-y-2'>
                          <p className='text-rose-700/80 dark:text-rose-200/80'>
                            Switch to another available delivery app using this order data.
                          </p>
                          <div className='flex flex-wrap gap-2'>
                            {availableFallbackRequests.map((item) => (
                              <Button
                                key={item.id}
                                type='button'
                                variant='outline'
                                className='rounded-md border-rose-500/40 bg-background text-foreground hover:bg-rose-50'
                                disabled={Boolean(creatingPartnerId)}
                                onClick={() => {
                                  setCreateRequestError(null)
                                  setConfirmRequest(item)
                                }}
                              >
                                Switch to {item.title}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className='gap-2 sm:justify-end'>
            <Button
              variant='outline'
              className='rounded-md'
              disabled={Boolean(creatingPartnerId)}
              onClick={() => setConfirmRequest(null)}
            >
              Cancel
            </Button>
            <Button
              className='rounded-md bg-primary text-primary-foreground hover:bg-primary/90'
              disabled={!confirmRequest || Boolean(creatingPartnerId)}
              onClick={() => void createCourierRequest()}
            >
              {creatingPartnerId ? <LoaderCircle className='h-4 w-4 animate-spin' /> : <Send className='h-4 w-4' />}
              {creatingPartnerId ? 'Creating request' : 'Confirm and create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md border border-border bg-muted/30 p-3'>
      <p className='text-xs font-semibold uppercase text-muted-foreground'>{label}</p>
      <p className='mt-1 break-words text-sm font-medium text-foreground'>{value}</p>
    </div>
  )
}
