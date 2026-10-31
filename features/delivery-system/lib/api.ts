import api from '@/lib/axios'
import {
  getCourierAssignmentForOrder,
  getRemoteCourierAssignment,
  normalizeCourierOrder,
  type CourierAssignment,
  type CourierOrderSummary,
} from './data'

export type CourierCategoryOption = {
  id: string
  name: string
}

const COURIER_CACHE_TTL_MS = 30_000

type CacheEntry<T> = {
  promise?: Promise<T>
  timestamp: number
  value?: T
}

const courierCache = new Map<string, CacheEntry<unknown>>()

const readCached = <T>(key: string) => {
  const entry = courierCache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  const isFresh = Date.now() - entry.timestamp < COURIER_CACHE_TTL_MS
  if (isFresh && entry.value !== undefined) return Promise.resolve(entry.value)
  if (isFresh && entry.promise) return entry.promise
  courierCache.delete(key)
  return null
}

const writeCached = <T>(key: string, loader: () => Promise<T>) => {
  const cached = readCached<T>(key)
  if (cached) return cached

  const entry: CacheEntry<T> = {
    timestamp: Date.now(),
  }
  entry.promise = loader()
    .then((value) => {
      entry.value = value
      entry.timestamp = Date.now()
      entry.promise = undefined
      return value
    })
    .catch((error) => {
      courierCache.delete(key)
      throw error
    })
  courierCache.set(key, entry as CacheEntry<unknown>)
  return entry.promise
}

export const clearCourierApiCache = () => courierCache.clear()

const getOrderBasePath = (order: CourierOrderSummary) =>
  order.source === 'template-orders'
    ? `/template-orders/${order.id}`
    : `/orders/${order.id}`

export const loadCourierOrders = async (
  isVendor: boolean,
  page: number = 1,
  limit: number = 50,
  search?: string
) => {
  const cacheKey = `orders:${isVendor ? 'vendor' : 'admin'}:${page}:${limit}:${search || ''}`
  return writeCached(cacheKey, async () => {
    const params: Record<string, unknown> = {
      courier_light: 1,
      page,
      limit,
    }
    if (search) {
      params.search = search
    }

    const orderSources = isVendor
      ? [
          { endpoint: '/orders', source: 'orders' as const },
          { endpoint: '/template-orders', source: 'template-orders' as const },
          { endpoint: '/orders/manual', source: 'orders' as const },
        ]
      : [
          { endpoint: '/orders', source: 'orders' as const },
          { endpoint: '/template-orders', source: 'template-orders' as const },
        ]

    const responses = await Promise.allSettled(
      orderSources.map(({ endpoint }) => api.get(endpoint, { params }))
    )

    const nextOrders = responses.flatMap((result, index) => {
      if (result.status !== 'fulfilled') return []

      const source = orderSources[index]?.source || 'orders'
      const rows = Array.isArray(result.value?.data?.orders)
        ? result.value.data.orders
        : []

      return rows
        .map((order: unknown) => normalizeCourierOrder(order, source))
        .filter(Boolean) as CourierOrderSummary[]
    })

    const dedupedOrders = Array.from(
      new Map(nextOrders.map((order) => [order.id, order])).values()
    ).sort((left, right) => {
      const leftTime = new Date(left.createdAt || 0).getTime()
      const rightTime = new Date(right.createdAt || 0).getTime()
      return rightTime - leftTime
    })

    if (
      !dedupedOrders.length &&
      responses.every((result) => result.status === 'rejected')
    ) {
      const firstError = responses.find(
        (result) => result.status === 'rejected'
      )
      throw (firstError as PromiseRejectedResult | undefined)?.reason
    }

    return dedupedOrders
  })
}

export const loadManualCourierOrders = async () => {
  const res = await api.get('/orders/manual')
  const rows = Array.isArray(res?.data?.orders) ? res.data.orders : []
  return rows
    .map((order: unknown) => normalizeCourierOrder(order, 'orders'))
    .filter(Boolean) as CourierOrderSummary[]
}

export const createManualCourierOrder = async (
  payload: Record<string, unknown>
) => {
  const res = await api.post('/orders/manual', payload)
  clearCourierApiCache()
  const order = normalizeCourierOrder(res?.data?.order, 'orders')
  return {
    ...res?.data,
    order,
  }
}

export const fetchCourierCategoryOptions = async () => {
  const baseUrl = String(process.env.NEXT_PUBLIC_API_URL || '').replace(
    /\/$/,
    ''
  )
  const res = await fetch(`${baseUrl}/v1/categories/getall?page=1&limit=500`)
  if (!res.ok) throw new Error('Failed to load categories')
  const data = await res.json()
  const rows = Array.isArray(data?.data) ? data.data : []
  return rows
    .map((entry: any) => ({
      id: String(
        entry?._id || entry?.id || entry?.slug || entry?.name || ''
      ).trim(),
      name: String(
        entry?.name || entry?.title || entry?.category_name || ''
      ).trim(),
    }))
    .filter((entry: CourierCategoryOption) => entry.id && entry.name)
}

export const getAssignedCourierForOrder = (
  order: CourierOrderSummary | null,
  activeOnly = true
) => {
  if (!order) return null
  return (getRemoteCourierAssignment(order, activeOnly) ||
    getCourierAssignmentForOrder(order.id) ||
    null) as CourierAssignment | null
}

export const createDelhiveryShipment = async (
  order: CourierOrderSummary,
  payload: Record<string, unknown> = {}
) => {
  const res = await api.post(
    `${getOrderBasePath(order)}/delhivery/create`,
    payload,
    {
      timeout: 60000,
    }
  )
  return res?.data
}

export const createShadowfaxShipment = async (
  order: CourierOrderSummary,
  payload: Record<string, unknown> = {}
) => {
  const res = await api.post(
    `${getOrderBasePath(order)}/shadowfax/create`,
    payload,
    {
      timeout: 60000,
    }
  )
  return res?.data
}

export const createShadowfaxWarehouseShipment = async (
  order: CourierOrderSummary,
  payload: Record<string, unknown> = {}
) => {
  const res = await api.post(
    `${getOrderBasePath(order)}/shadowfax/create`,
    {
      ...payload,
      order_model: 'warehouse',
    },
    {
      timeout: 60000,
    }
  )
  return res?.data
}

export const editDelhiveryShipment = async (
  order: CourierOrderSummary,
  payload: Record<string, unknown> = {}
) => {
  const res = await api.post(
    `${getOrderBasePath(order)}/delhivery/edit`,
    payload
  )
  return res?.data
}

export const cancelDelhiveryShipment = async (
  order: CourierOrderSummary,
  payload: Record<string, unknown> = {}
) => {
  const res = await api.post(
    `${getOrderBasePath(order)}/delhivery/cancel`,
    payload
  )
  return res?.data
}

export const trackDelhiveryShipment = async (
  order: CourierOrderSummary,
  params: Record<string, unknown> = {}
) => {
  const res = await api.get(`${getOrderBasePath(order)}/delhivery/track`, {
    params,
  })
  return res?.data
}

export const generateDelhiveryLabel = async (
  order: CourierOrderSummary,
  payload: {
    pdf?: boolean
    pdf_size?: 'A4' | '4R'
    waybill?: string
  } = {}
) => {
  const res = await api.post(
    `${getOrderBasePath(order)}/delhivery/label`,
    payload
  )
  return res?.data
}

export const createDelhiveryPickupRequest = async (
  order: CourierOrderSummary,
  payload: {
    pickup_date: string
    pickup_time: string
    pickup_location?: string
    expected_package_count?: number
  }
) => {
  const res = await api.post(
    `${getOrderBasePath(order)}/delhivery/pickup-request`,
    payload
  )
  return res?.data
}

export type DeliveryMarkupPreview = {
  actual_price: number
  hiked_price: number
  markup?: {
    partner_id?: string
    markup_type?: 'percentage' | 'fixed'
    markup_value?: number
    active?: boolean
  } | null
}

export const previewDeliveryMarkup = async (payload: {
  partner_id: string
  actual_price: number
  order_id?: string
  order_number?: string
  record_history?: boolean
}) => {
  const res = await api.post('/delivery-markup/preview', payload)
  return res?.data as DeliveryMarkupPreview
}

export const fetchDelhiveryB2cServiceability = async (filterCodes: string) => {
  const res = await api.get('/delhivery/serviceability', {
    params: { filter_codes: filterCodes },
  })
  return res?.data
}

export const fetchShadowfaxServiceability = async (params: {
  pincodes: string
  service?: string
  page?: string | number
  count?: string | number
}) => {
  const res = await api.get('/shadowfax/serviceability', { params })
  return res?.data
}

export const generateShadowfaxAwbs = async (payload: {
  count?: string | number
  request_type?: string
}) => {
  const res = await api.post('/shadowfax/awb', payload)
  return res?.data
}

export const generateShadowfaxLabel = async (awbNumber: string) => {
  const res = await api.post("/shadowfax/label", { awb_number: awbNumber, file_type: "pdf" })
  return res?.data as { label_url?: string; response?: { data?: { label_url?: string } } }
}

export const fetchShadowfaxOrderDetails = async (awbNumber: string) => {
  const res = await api.get(`/shadowfax/order/${encodeURIComponent(awbNumber)}`)
  return res?.data
}

export const updateShadowfaxOrderData = async (payload: {
  awb_number: string
  delivery_details?: Record<string, unknown> | null
  pickup_details?: Record<string, unknown> | null
  order_details?: Record<string, unknown> | null
  status_update?: Record<string, unknown> | null
}) => {
  const res = await api.post('/shadowfax/order-update', payload)
  return res?.data
}

export const cancelShadowfaxOrder = async (payload: {
  request_id: string
  cancel_remarks: string
}) => {
  const res = await api.post('/shadowfax/orders/cancel', payload)
  return res?.data
}

export const createShadowfaxEscalation = async (payload: {
  awb_number: string
  issue_category: string | number
}) => {
  const res = await api.post('/shadowfax/support/issue', payload)
  return res?.data
}

export const fetchShadowfaxPodDetails = async (payload: {
  awb_numbers: string[]
}) => {
  const res = await api.post('/shadowfax/pod-details', payload)
  return res?.data
}

export const fetchDelhiveryHeavyServiceability = async (
  pincode: string,
  productType = 'Heavy'
) => {
  const res = await api.get('/delhivery/serviceability/heavy', {
    params: { pincode, product_type: productType },
  })
  return res?.data
}

export const fetchDelhiveryShippingEstimate = async (params: {
  md: 'E' | 'S'
  cgm: string
  o_pin: string
  d_pin: string
  ss: 'Delivered' | 'RTO' | 'DTO'
  pt: 'Pre-paid' | 'COD'
  l?: string
  b?: string
  h?: string
  ipkg_type?: 'box' | 'flyer'
}) => {
  const res = await api.get('/delhivery/shipping-estimate', { params })
  return res?.data
}

export const fetchDelhiveryBulkWaybills = async (payload: {
  count: number
  store?: boolean
}) => {
  const res = await api.post('/delhivery/waybill/bulk', payload)
  return res?.data
}

export const fetchDelhiverySingleWaybill = async (payload?: {
  store?: boolean
}) => {
  const res = await api.post('/delhivery/waybill/single', payload || {})
  return res?.data
}

export const createDelhiveryWarehouse = async (
  payload: Record<string, unknown>
) => {
  const res = await api.post('/delhivery/warehouse', payload)
  clearCourierApiCache()
  return res?.data
}

export const updateDelhiveryWarehouse = async (
  payload: Record<string, unknown>
) => {
  const res = await api.post('/delhivery/warehouse/edit', payload)
  clearCourierApiCache()
  return res?.data
}

export type DelhiveryWarehouse = {
  id: string
  provider?: 'delhivery'
  name: string
  registered_name?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  pin?: string
  country?: string
  return_address?: string
  return_city?: string
  return_pin?: string
  return_state?: string
  return_country?: string
  working_days?: string[]
  synced_at?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type ShadowfaxWarehouse = {
  id: string
  provider: 'shadowfax'
  name: string
  contact?: string
  phone?: string
  email?: string
  address_line_1?: string
  address_line_2?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  pin?: string
  latitude?: string
  longitude?: string
  unique_code?: string
  working_days?: string[]
  synced_at?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type CourierWarehouse =
  | (DelhiveryWarehouse & { provider: 'delhivery' })
  | ShadowfaxWarehouse

export const fetchDelhiveryWarehouses = async (
  params: Record<string, unknown> = {}
) => {
  const res = await api.get('/delhivery/warehouses', { params })
  return res?.data as { success?: boolean; warehouses?: DelhiveryWarehouse[] }
}

export const fetchShadowfaxWarehouses = async (
  params: Record<string, unknown> = {}
) => {
  const res = await api.get('/shadowfax/warehouses', { params })
  return res?.data as { success?: boolean; warehouses?: ShadowfaxWarehouse[] }
}

export const fetchCourierWarehouses = async () => {
  return writeCached('warehouses', async () => {
    const [delhiveryResult, shadowfaxResult] = await Promise.allSettled([
      fetchDelhiveryWarehouses(),
      fetchShadowfaxWarehouses(),
    ])

    const delhivery =
      delhiveryResult.status === 'fulfilled'
        ? (delhiveryResult.value?.warehouses || []).map((warehouse) => ({
            ...warehouse,
            provider: 'delhivery' as const,
          }))
        : []
    const shadowfax =
      shadowfaxResult.status === 'fulfilled'
        ? shadowfaxResult.value?.warehouses || []
        : []

    if (!delhivery.length && !shadowfax.length) {
      const rejected = [delhiveryResult, shadowfaxResult].find(
        (result) => result.status === 'rejected'
      ) as PromiseRejectedResult | undefined
      if (rejected) throw rejected.reason
    }

    return [...delhivery, ...shadowfax] as CourierWarehouse[]
  })
}

export const createShadowfaxWarehouse = async (
  payload: Record<string, unknown>
) => {
  const res = await api.post('/shadowfax/warehouse', payload)
  clearCourierApiCache()
  return res?.data
}

export const updateShadowfaxWarehouse = async (
  warehouseId: string,
  payload: Record<string, unknown>
) => {
  const res = await api.post(
    `/shadowfax/warehouses/${warehouseId}/edit`,
    payload
  )
  clearCourierApiCache()
  return res?.data
}

export type ExternalDelhiveryShipment = {
  id: string
  waybill: string
  order_id: string
  status: string
  status_type: string
  status_description: string
  destination: string
  origin: string
  source: string
  label_url: string
  requested_waybills: string[]
  requested_ref_ids: string[]
  scans: Array<{
    status?: string
    status_type?: string
    description?: string
    location?: string
    time?: string
  }>
  tracking_payload?: unknown
  last_response?: unknown
  last_synced_at?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export const fetchExternalDelhiveryShipments = async () => {
  const res = await api.get('/delhivery/external-shipments')
  return res?.data as {
    success?: boolean
    shipments?: ExternalDelhiveryShipment[]
  }
}

export const refreshExternalDelhiveryShipment = async (shipmentId: string) => {
  const res = await api.post(
    `/delhivery/external-shipments/${shipmentId}/track`
  )
  return res?.data as {
    success?: boolean
    shipment?: ExternalDelhiveryShipment
  }
}

const ondemandTimeout = { timeout: 60000 }

export const geocodeDeliveryAddress = async (payload: Record<string, unknown>) => {
  const res = await api.post("/shadowfax/geocode", payload, ondemandTimeout)
  return res?.data as { success?: boolean; latitude?: number; longitude?: number }
}

export const checkHyperlocalServiceability = async (payload: Record<string, unknown>) => {
  const res = await api.put("/shadowfax/hyperlocal/serviceability", payload, ondemandTimeout)
  return res?.data
}

export const placeHyperlocalOrder = async (payload: Record<string, unknown>) => {
  const res = await api.post("/shadowfax/hyperlocal/orders", payload, ondemandTimeout)
  return res?.data
}

export const fetchHyperlocalOrder = async (sfxOrderId: string) => {
  const res = await api.get(`/shadowfax/hyperlocal/orders/${encodeURIComponent(sfxOrderId)}`, ondemandTimeout)
  return res?.data
}

export const cancelHyperlocalOrder = async (sfxOrderId: string, payload: Record<string, unknown>) => {
  const res = await api.put(
    `/shadowfax/hyperlocal/orders/${encodeURIComponent(sfxOrderId)}/cancel`,
    payload,
    ondemandTimeout
  )
  return res?.data
}

export const validateQuickCommerceOrder = async (payload: Record<string, unknown>) => {
  const res = await api.post("/shadowfax/quick-commerce/validate", payload, ondemandTimeout)
  return res?.data
}

export const placeQuickCommerceOrder = async (payload: Record<string, unknown>) => {
  const res = await api.post("/shadowfax/quick-commerce/orders", payload, ondemandTimeout)
  return res?.data
}

export const markQuickCommerceReady = async (payload: Record<string, unknown>) => {
  const res = await api.post("/shadowfax/quick-commerce/orders/ready", payload, ondemandTimeout)
  return res?.data
}

export const cancelExternalDelhiveryShipment = async (
  shipmentId: string,
  payload: { waybill?: string; cancellation?: string } = {}
) => {
  const res = await api.post(
    `/delhivery/external-shipments/${shipmentId}/cancel`,
    payload
  )
  return res?.data as {
    success?: boolean
    shipment?: ExternalDelhiveryShipment
  }
}

