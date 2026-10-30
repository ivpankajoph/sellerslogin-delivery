export type CourierPartnerId = 'borzo' | 'delhivery' | 'shadowfax' | 'porter'

export type CourierPartner = {
  id: CourierPartnerId
  title: string
  shortLabel: string
  description: string
  imageSrc: string
  themeClass: string
  etaLabel: string
  live: boolean
  reportPath?: string
}

export type CourierOrderSummary = {
  id: string
  orderNumber: string
  source: 'orders' | 'template-orders'
  customerName: string
  customerPhone: string
  customerEmail: string
  total: number
  deliveryCost: number
  actualDeliveryCost: number
  itemsCount: number
  createdAt: string
  address: string
  city: string
  state: string
  pincode: string
  status: string
  deliveryProvider: string
  trackingUrl: string
  externalDeliveryId: string
  websiteLabel: string
  manualCourier?: {
    shipment_overrides?: Record<string, unknown>
    [key: string]: unknown
  }
  items: Array<{
    productId: string
    variantId: string
    productName: string
    imageUrl: string
    quantity: number
    unitPrice: number
    totalPrice: number
    variantSummary: string
  }>
  borzo?: {
    order_id?: number
    status?: string
    tracking_url?: string
    updated_at?: string
  }
  delhivery?: {
    order_id?: string
    waybill?: string
    waybills?: string[]
    label_url?: string
    pickup_location?: string
    pickup_request_id?: string
    pickup_request_status?: string
    pickup_request_message?: string
    pickup_request_date?: string
    pickup_request_time?: string
    pickup_request_packages?: number
    pickup_requested_at?: string
    payment_mode?: string
    status?: string
    status_description?: string
    package_count?: number
    scans?: Array<{
      status?: string
      status_type?: string
      description?: string
      location?: string
      time?: string
    }>
    updated_at?: string
  }
  shadowfax?: {
    order_model?: string
    order_id?: string
    tracking_number?: string
    client_order_id?: string
    payment_mode?: string
    status?: string
    status_description?: string
    updated_at?: string
  }

}

export type CourierQuote = {
  partnerId: CourierPartnerId
  amount: number
  etaLabel: string
  calculationLabel: string
}

export type CourierAssignment = {
  orderId: string
  orderNumber: string
  source: 'orders' | 'template-orders'
  partnerId: CourierPartnerId
  partnerName: string
  amount: number
  etaLabel: string
  assignedAt: string
  trackingStatus: string
  trackingCode: string
  trackingUrl: string
  customerName: string
  customerPhone: string
  total: number
  websiteLabel: string
}

const STORAGE_KEY = 'sellerslogin-courier-assignments-v1'

export const COURIER_PARTNERS: CourierPartner[] = [
  {
    id: 'borzo',
    title: 'Borzo',
    shortLabel: 'Borzo',
    description: 'Already integrated for instant local delivery and courier workflows.',
    imageSrc: '',
    themeClass: 'border-emerald-500/20 bg-emerald-500/10',
    etaLabel: '35-55 mins',
    live: true,
  },
  {
    id: 'delhivery',
    title: 'Delhivery',
    shortLabel: 'Delhivery',
    description: 'National shipping partner for standard parcel movement and RTO flows.',
    imageSrc: '',
    themeClass: 'border-sky-500/20 bg-sky-500/10',
    etaLabel: '1-3 days',
    live: true,
    reportPath: '/courier/delhivery',
  },

  {
    id: 'shadowfax',
    title: 'Shadowfax',
    shortLabel: 'Shadowfax',
    description: 'Marketplace and warehouse shipping partner for routed courier orders.',
    imageSrc: '',
    themeClass: 'border-orange-500/20 bg-orange-500/10',
    etaLabel: '1-3 days',
    live: true,
    reportPath: '/courier/shadowfax',
  },
  {
    id: 'porter',
    title: 'Porter',
    shortLabel: 'Porter',
    description: 'Static app card for on-demand city logistics and same-day dispatch.',
    imageSrc: '',
    themeClass: 'border-orange-500/20 bg-orange-500/10',
    etaLabel: '45-90 mins',
    live: false,
    reportPath: '/courier/porter',
  },
]

export const COURIER_PARTNER_MAP = Object.fromEntries(
  COURIER_PARTNERS.map((partner) => [partner.id, partner])
) as Record<CourierPartnerId, CourierPartner>

const toText = (value: unknown) => String(value ?? '').trim()

const looksLikeImagePath = (value: string) => {
  const next = toText(value).toLowerCase()
  if (!next) return false
  if (/\.(jpg|jpeg|png|webp|gif|avif|svg)(\?.*)?$/.test(next)) return true
  return next.includes('/upload') || next.includes('/uploads/') || next.includes('imagekit.io') || next.includes('cloudinary.com') || next.includes('.r2.dev')
}

const pickImageUrlFromUnknown = (value: unknown): string => {
  if (!value) return ''
  if (typeof value === 'string') {
    const raw = toText(value)
    return looksLikeImagePath(raw) ? raw : ''
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const next = pickImageUrlFromUnknown(entry)
      if (next) return next
    }
    return ''
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const direct =
      toText(obj?.url) ||
      toText(obj?.image_url) ||
      toText(obj?.imageUrl) ||
      toText(obj?.image) ||
      toText(obj?.variant_image) ||
      toText(obj?.variantImage)
    if (direct) return direct

    const variantImages = pickImageUrlFromUnknown(
      obj?.variantsImageUrls || obj?.variant_images || obj?.images || obj?.defaultImages
    )
    if (variantImages) return variantImages

    for (const nested of Object.values(obj)) {
      const next = pickImageUrlFromUnknown(nested)
      if (next) return next
    }
  }
  return ''
}

const extractOrderItemImage = (item: any): string => {
  const direct =
    toText(item?.image_url) ||
    toText(item?.imageUrl) ||
    toText(item?.variant_image) ||
    toText(item?.variantImage)
  if (direct) return direct

  const fromVariantAttributes = pickImageUrlFromUnknown(item?.variant_attributes)
  if (fromVariantAttributes) return fromVariantAttributes

  const fromVariant = pickImageUrlFromUnknown(item?.variant)
  if (fromVariant) return fromVariant

  const fromProduct = pickImageUrlFromUnknown(item?.product)
  return fromProduct
}

const formatVariantSummary = (value: unknown): string => {
  if (!value) return ''
  if (typeof value === 'string') return toText(value)
  if (Array.isArray(value)) {
    return value
      .map((entry) => formatVariantSummary(entry))
      .filter(Boolean)
      .join(' / ')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const nextValue = toText(entry)
        if (!nextValue) return ''
        return `${key}: ${nextValue}`
      })
      .filter(Boolean)
      .join(' / ')
  }
  return toText(value)
}

const safeWindow = () =>
  typeof window !== 'undefined' && window?.localStorage ? window : null

const trackingStatusByPartner: Record<CourierPartnerId, string> = {
  borzo: 'Request queued',
  delhivery: 'Pickup requested',
  shadowfax: 'Order created',

  porter: 'Dispatcher review',
}

const trackingPrefixByPartner: Record<CourierPartnerId, string> = {
  borzo: 'BRZ',
  delhivery: 'DLV',
  shadowfax: 'SFX',

  porter: 'PTR',
}

const isUploadReference = (value: unknown) => /^UPL/i.test(toText(value))

const hasRealDelhiveryWaybill = (
  delhivery?: CourierOrderSummary['delhivery']
) => {
  if (!delhivery) return false
  const candidates = [
    delhivery.waybill,
    ...(Array.isArray(delhivery.waybills) ? delhivery.waybills : []),
  ]
    .map((entry) => toText(entry))
    .filter(Boolean)
  return candidates.some((entry) => !isUploadReference(entry))
}

export const getRealShadowfaxReference = (
  shadowfax?: CourierOrderSummary['shadowfax']
) => {
  const trackingNumber = toText(shadowfax?.tracking_number)
  if (trackingNumber) return trackingNumber

  const orderId = toText(shadowfax?.order_id)
  const clientOrderId = toText(shadowfax?.client_order_id)
  if (orderId && orderId !== clientOrderId) return orderId

  return ''
}

export const isCancelledCourierState = (value: unknown) => {
  const state = toText(value).toLowerCase()
  return (
    ['cancelled', 'canceled', 'shipment cancelled'].includes(state) ||
    state.includes('seller cancelled') ||
    state.includes('cancelled') ||
    state.includes('canceled')
  )
}

const isCancelledDelhivery = (delhivery?: CourierOrderSummary['delhivery']) =>
  Boolean(
    delhivery &&
      (isCancelledCourierState(delhivery.status) ||
        isCancelledCourierState(delhivery.status_description) ||
        isCancelledCourierState(delhivery.pickup_request_status) ||
        isCancelledCourierState(delhivery.pickup_request_message) ||
        delhivery.scans?.some(
          (scan) => isCancelledCourierState(scan.status) || isCancelledCourierState(scan.description)
        ))
  )

export const isClosedCourierState = (value: unknown) => {
  const state = toText(value).toLowerCase()
  return (
    !state ||
    isCancelledCourierState(state) ||
    ['fail', 'failed', 'error', 'errored', 'delivered', 'completed', 'finished'].includes(
      state
    )
  )
}

export const formatCourierAddress = (shippingAddress?: {
  line1?: string
  line2?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
}) =>
  [
    shippingAddress?.line1,
    shippingAddress?.line2,
    shippingAddress?.city,
    shippingAddress?.state,
    shippingAddress?.pincode,
    shippingAddress?.country,
  ]
    .map((value) => toText(value))
    .filter(Boolean)
    .join(', ')

export const normalizeCourierOrder = (
  order: any,
  source: 'orders' | 'template-orders'
): CourierOrderSummary | null => {
  const orderId = toText(order?._id)
  if (!orderId) return null

  const websiteLabel =
    toText(order?.website_name) ||
    toText(order?.website_slug) ||
    toText(order?.template_name) ||
    toText(order?.template_key) ||
    'Main website'
  const items = Array.isArray(order?.items) ? order.items : []
  const itemsCount = items.reduce(
    (sum: number, item: any) => sum + Number(item?.quantity || 0),
    0
  )
  const manualCustomer = order?.manual_courier?.customer || {}
  const shippingAddress = order?.shipping_address || {}
  const address =
    formatCourierAddress(shippingAddress) ||
    formatCourierAddress({
      line1: toText(manualCustomer?.address_line_1 || manualCustomer?.address),
      line2: toText(manualCustomer?.address_line_2),
      city: toText(manualCustomer?.city),
      state: toText(manualCustomer?.state),
      pincode: toText(manualCustomer?.pincode),
      country: toText(manualCustomer?.country || 'India'),
    })

  return {
    id: orderId,
    orderNumber: toText(order?.order_number) || `#${orderId.slice(-6).toUpperCase()}`,
    source,
    customerName:
      toText(shippingAddress?.full_name) ||
      toText(manualCustomer?.name) ||
      toText(order?.user_id?.name) ||
      'Customer',
    customerPhone:
      toText(shippingAddress?.phone) ||
      toText(manualCustomer?.phone) ||
      toText(order?.user_id?.phone),
    customerEmail:
      toText(shippingAddress?.email) ||
      toText(manualCustomer?.email) ||
      toText(order?.user_id?.email),
    total: Number(order?.total || order?.subtotal || 0),
    deliveryCost: Number(order?.delivery_cost || order?.delivery_wallet_debited || 0),
    actualDeliveryCost: Number(order?.actual_delivery_cost || order?.delivery_markup?.actual_price || 0),
    itemsCount: itemsCount || items.length || 1,
    createdAt: toText(order?.createdAt),
    address,
    city: toText(shippingAddress?.city) || toText(manualCustomer?.city),
    state: toText(shippingAddress?.state) || toText(manualCustomer?.state),
    pincode: toText(shippingAddress?.pincode) || toText(manualCustomer?.pincode),
    status: toText(order?.status) || 'pending',
    deliveryProvider: toText(order?.delivery_provider),
    trackingUrl: toText(order?.borzo?.tracking_url),
    externalDeliveryId: toText(
      order?.borzo?.order_id ||
        order?.delhivery?.waybill ||
        order?.shadowfax?.tracking_number ||
        order?.shadowfax?.order_id
    ),
    websiteLabel,
    manualCourier: order?.manual_courier,
    items: items.map((item: any) => ({
      productId: toText(item?.product_id?._id || item?.product_id),
      variantId: toText(item?.variant_id?._id || item?.variant_id),
      productName: toText(item?.product_name) || 'Product',
      imageUrl: extractOrderItemImage(item),
      quantity: Number(item?.quantity || 0) || 1,
      unitPrice: Number(item?.unit_price || 0),
      totalPrice: Number(item?.total_price || 0),
      variantSummary: formatVariantSummary(item?.variant_attributes),
    })),
    borzo: order?.borzo
      ? {
          order_id: Number(order?.borzo?.order_id || 0) || undefined,
          status: toText(order?.borzo?.status),
          tracking_url: toText(order?.borzo?.tracking_url),
          updated_at: toText(order?.borzo?.updated_at),
        }
      : undefined,
    delhivery: order?.delhivery
      ? {
          order_id: toText(order?.delhivery?.order_id),
          waybill: toText(order?.delhivery?.waybill),
          waybills: Array.isArray(order?.delhivery?.waybills)
            ? order.delhivery.waybills.map((entry: unknown) => toText(entry)).filter(Boolean)
            : [],
          label_url: toText(order?.delhivery?.label_url),
          pickup_location: toText(order?.delhivery?.pickup_location),
          pickup_request_id: toText(order?.delhivery?.pickup_request_id),
          pickup_request_status: toText(order?.delhivery?.pickup_request_status),
          pickup_request_message: toText(order?.delhivery?.pickup_request_message),
          pickup_request_date: toText(order?.delhivery?.pickup_request_date),
          pickup_request_time: toText(order?.delhivery?.pickup_request_time),
          pickup_request_packages:
            Number(order?.delhivery?.pickup_request_packages || 0) || undefined,
          pickup_requested_at: toText(order?.delhivery?.pickup_requested_at),
          payment_mode: toText(order?.delhivery?.payment_mode),
          status: toText(order?.delhivery?.status),
          status_description: toText(order?.delhivery?.status_description),
          package_count: Number(order?.delhivery?.package_count || 0) || undefined,
          scans: Array.isArray(order?.delhivery?.scans)
            ? order.delhivery.scans
                .map((entry: any) => ({
                  status: toText(entry?.status),
                  status_type: toText(entry?.status_type),
                  description: toText(entry?.description),
                  location: toText(entry?.location),
                  time: toText(entry?.time),
                }))
                .filter(
                  (entry: any) =>
                    entry.status || entry.description || entry.location || entry.time
                )
            : [],
          updated_at: toText(order?.delhivery?.updated_at),
        }
      : undefined,
    shadowfax: order?.shadowfax
      ? {
          order_model: toText(order?.shadowfax?.order_model),
          order_id: toText(order?.shadowfax?.order_id),
          tracking_number: toText(order?.shadowfax?.tracking_number),
          client_order_id: toText(order?.shadowfax?.client_order_id),
          payment_mode: toText(order?.shadowfax?.payment_mode),
          status: toText(order?.shadowfax?.status),
          status_description: toText(order?.shadowfax?.status_description),
          updated_at: toText(order?.shadowfax?.updated_at),
        }
      : undefined,

  }
}

export const estimateCourierQuote = (
  order: CourierOrderSummary,
  partnerId: CourierPartnerId
): CourierQuote => {
  const baseRateMap: Record<CourierPartnerId, number> = {
    borzo: 54,
    delhivery: 68,
    shadowfax: 72,

    porter: 76,
  }
  const variableRateMap: Record<CourierPartnerId, number> = {
    borzo: 0.013,
    delhivery: 0.01,
    shadowfax: 0.011,

    porter: 0.012,
  }
  const itemRateMap: Record<CourierPartnerId, number> = {
    borzo: 9,
    delhivery: 11,
    shadowfax: 12,

    porter: 13,
  }

  const zoneFactor = order.state ? 12 : 0
  const cityFactor = order.city ? 6 : 0
  const amount =
    baseRateMap[partnerId] +
    order.total * variableRateMap[partnerId] +
    order.itemsCount * itemRateMap[partnerId] +
    zoneFactor +
    cityFactor

  return {
    partnerId,
    amount: Math.round(amount),
    etaLabel: COURIER_PARTNER_MAP[partnerId].etaLabel,
    calculationLabel: `Base + order value + item count + zone factor`,
  }
}

export const readCourierAssignments = (): CourierAssignment[] => {
  const browser = safeWindow()
  if (!browser) return []

  try {
    const raw = browser.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeCourierAssignments = (assignments: CourierAssignment[]) => {
  const browser = safeWindow()
  if (!browser) return
  browser.localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments))
}

export const saveCourierAssignment = (
  order: CourierOrderSummary,
  partnerId: CourierPartnerId
) => {
  const quote = estimateCourierQuote(order, partnerId)
  const partner = COURIER_PARTNER_MAP[partnerId]
  const existing = readCourierAssignments().filter(
    (assignment) => assignment.orderId !== order.id
  )

  const timestamp = new Date().toISOString()
  const assignment: CourierAssignment = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    source: order.source,
    partnerId,
    partnerName: partner.title,
    amount: quote.amount,
    etaLabel: quote.etaLabel,

    assignedAt: timestamp,
    trackingStatus: trackingStatusByPartner[partnerId],
    trackingCode:
      order.externalDeliveryId ||
      `${trackingPrefixByPartner[partnerId]}-${order.id.slice(-6).toUpperCase()}`,
    trackingUrl: order.trackingUrl,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    total: order.total,
    websiteLabel: order.websiteLabel,
  }

  writeCourierAssignments([assignment, ...existing])
  return assignment
}

export const getCourierAssignmentForOrder = (orderId: string) =>
  readCourierAssignments().find((assignment) => assignment.orderId === orderId) || null

export const getActiveCourierPartnerIds = (
  order: CourierOrderSummary | null | undefined
): CourierPartnerId[] => {
  if (!order) return []

  const next = new Set<CourierPartnerId>()

  if (order.borzo?.order_id && !isClosedCourierState(order.borzo.status)) {
    next.add('borzo')
  }

  if (
    hasRealDelhiveryWaybill(order.delhivery) &&
    !isClosedCourierState(order.delhivery?.status) &&
    !isCancelledDelhivery(order.delhivery)
  ) {
    next.add('delhivery')
  }

  if (
    getRealShadowfaxReference(order.shadowfax) &&
    !isClosedCourierState(order.shadowfax?.status)
  ) {
    next.add('shadowfax')
  }

  const localAssignment = getCourierAssignmentForOrder(order.id)
  if (
    localAssignment?.partnerId === 'porter' &&
    !isClosedCourierState(localAssignment.trackingStatus)
  ) {
    next.add(localAssignment.partnerId)
  }

  return Array.from(next)
}

export const getAllCourierPartnerIds = (
  order: CourierOrderSummary | null | undefined
): CourierPartnerId[] => {
  if (!order) return []

  const next = new Set<CourierPartnerId>()

  if (order.borzo?.order_id) {
    next.add('borzo')
  }

  if (hasRealDelhiveryWaybill(order.delhivery)) {
    next.add('delhivery')
  }

  if (getRealShadowfaxReference(order.shadowfax)) {
    next.add('shadowfax')
  }

  const localAssignment = getCourierAssignmentForOrder(order.id)
  if (localAssignment?.partnerId === 'porter') {
    next.add(localAssignment.partnerId)
  }

  return Array.from(next)
}

export const hasAnyActiveCourierAssignment = (
  order: CourierOrderSummary | null | undefined
) => getActiveCourierPartnerIds(order).length > 0

export const hasAnyCourierAssignment = (
  order: CourierOrderSummary | null | undefined
) => getAllCourierPartnerIds(order).length > 0

export const getRemoteCourierAssignment = (
  order: CourierOrderSummary | null | undefined,
  activeOnly = true
): CourierAssignment | null => {
  if (!order) return null

  if (
    hasRealDelhiveryWaybill(order.delhivery) &&
    (!activeOnly || (!isClosedCourierState(order.delhivery?.status) && !isCancelledDelhivery(order.delhivery)))
  ) {
    const realWaybill =
      [
        order.delhivery?.waybill,
        ...(Array.isArray(order.delhivery?.waybills) ? order.delhivery.waybills : []),
      ]
        .map((entry) => toText(entry))
        .find((entry) => entry && !isUploadReference(entry)) || ''
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      source: order.source,
      partnerId: 'delhivery',
      partnerName: COURIER_PARTNER_MAP.delhivery.title,
      amount: 0,
      etaLabel: COURIER_PARTNER_MAP.delhivery.etaLabel,
      assignedAt: order.delhivery?.updated_at || order.createdAt,
      trackingStatus: order.delhivery?.status || trackingStatusByPartner.delhivery,
      trackingCode: realWaybill,
      trackingUrl: order.delhivery?.label_url || '',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      total: order.total,
      websiteLabel: order.websiteLabel,
    }
  }

  if (
    getRealShadowfaxReference(order.shadowfax) &&
    (!activeOnly || !isClosedCourierState(order.shadowfax?.status))
  ) {
    const trackingCode = getRealShadowfaxReference(order.shadowfax)
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      source: order.source,
      partnerId: 'shadowfax',
      partnerName: COURIER_PARTNER_MAP.shadowfax.title,
      amount: 0,
      etaLabel: COURIER_PARTNER_MAP.shadowfax.etaLabel,
      assignedAt: order.shadowfax?.updated_at || order.createdAt,
      trackingStatus: order.shadowfax?.status || trackingStatusByPartner.shadowfax,
      trackingCode,
      trackingUrl: '',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      total: order.total,
      websiteLabel: order.websiteLabel,
    }
  }

  if (order.borzo?.order_id) {
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      source: order.source,
      partnerId: 'borzo',
      partnerName: COURIER_PARTNER_MAP.borzo.title,
      amount: 0,
      etaLabel: COURIER_PARTNER_MAP.borzo.etaLabel,
      assignedAt: order.borzo?.updated_at || order.createdAt,
      trackingStatus: order.borzo?.status || trackingStatusByPartner.borzo,
      trackingCode:
        String(order.borzo?.order_id || '') ||
        `${trackingPrefixByPartner.borzo}-${order.id.slice(-6).toUpperCase()}`,
      trackingUrl: order.borzo?.tracking_url || '',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      total: order.total,
      websiteLabel: order.websiteLabel,
    }
  }

  return null
}
