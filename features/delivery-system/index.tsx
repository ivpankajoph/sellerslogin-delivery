"use client"

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from '@/lib/router'
import type { RootState } from '@/store'
import {
  ArrowRight,
  ClipboardList,
  Headphones,
  Plus,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  RefreshCcw,
  FileText,
  ReceiptText,
  IndianRupee,
  ChevronDown,
  Truck,
  Warehouse,
  Wallet as WalletIcon,
  Package,
  Zap,
} from 'lucide-react'
import { useSelector } from 'react-redux'
import api from '@/lib/axios'
import { formatINR } from '@/lib/currency'
import { ShellFrame } from '@/components/shell-frame'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar'
import {
  fetchExternalDelhiveryShipments,
  loadCourierOrders,
  type ExternalDelhiveryShipment,
} from '@/features/delivery-system/lib/api'
import {
  getRealShadowfaxReference,
  hasAnyActiveCourierAssignment,
  type CourierOrderSummary,
} from '@/features/delivery-system/lib/data'
import { CreateOrderPanel } from './components/create-order-panel'
import { ManageAppsPanel } from './manage-apps-panel'
import { applyDeliveryApps, useDeliveryAppConfig } from './lib/delivery-apps'
import { DeliveryPromoBanner } from './components/promo-banner'
import { ServiceOrdersPanel } from './components/service-orders-panel'
import { ManualOrdersPanel } from './components/manual-orders-panel'
import { WebsiteOrdersPanel } from './components/website-orders-panel'
import { CourierListPage } from '@/features/courier/list'
import { DeliveryMarkupPanel } from './delivery-markup-panel'
import { SetPricingPanel } from './set-pricing-panel'
import { DeliverySupportPanel } from './delivery-support-panel'
import { PartnerLogo } from '@/components/shared/partner-logo'

type DeliveryView =
  | 'dashboard'
  | 'support'
  | 'delivery-markup'
  | 'set-pricing'
  | 'manage-apps'
  | 'service-orders'
  | 'website-requests'
  | 'website-orders'
  | 'manual-orders'
  | 'create-order'
type DeliveryWorkspaceSection =
  | 'dashboard'
  | 'orders'
  | 'courier-list'
  | 'apps'
  | 'manual'
  | 'manual-list'
  | 'reports'
  | 'delhivery'
  | 'shadowfax'
  | 'warehouses'
  | 'tracking'
  | 'delivery-markup'
  | 'set-pricing'
  | 'manage-apps'
  | 'support'
  | 'book-vehicle'
  | 'service-orders'
  | 'website-orders'
  | 'manual-orders'
  | 'create-order'
  | 'services'

const readText = (value: unknown) => String(value ?? '').trim()

const getDelhiveryCode = (order: CourierOrderSummary) =>
  readText(order.delhivery?.waybill) ||
  readText(order.delhivery?.waybills?.[0]) ||
  readText(order.externalDeliveryId)

const getShadowfaxCode = (order: CourierOrderSummary) =>
  getRealShadowfaxReference(order.shadowfax)

const getTrackingCode = (order: CourierOrderSummary) =>
  getShadowfaxCode(order) || getDelhiveryCode(order)

const getCourierStatusText = (order: CourierOrderSummary) =>
  `${readText(order.status)} ${readText(order.delhivery?.status)} ${readText(
    order.delhivery?.status_description
  )} ${readText(order.shadowfax?.status)} ${readText(order.shadowfax?.status_description)}`.toLowerCase()

const isPendingPickup = (order: CourierOrderSummary) => {
  const status = readText(order.status).toLowerCase()
  const courierStatus = getCourierStatusText(order)
  if (getTrackingCode(order)) return false
  return (
    !status ||
    ['pending', 'placed', 'confirmed', 'processing', 'new'].some((entry) =>
      status.includes(entry)
    ) ||
    courierStatus.includes('manifest')
  )
}

const isInTransit = (order: CourierOrderSummary) => {
  const status = getCourierStatusText(order)
  return ['ship', 'transit', 'dispatch', 'out for delivery', 'picked'].some(
    (entry) => status.includes(entry)
  )
}

const isAtDestinationHub = (order: CourierOrderSummary) => {
  const status = getCourierStatusText(order)
  return ['destination', 'hub', 'reached facility'].some((entry) =>
    status.includes(entry)
  )
}

const isDelivered = (order: CourierOrderSummary) => {
  const status = getCourierStatusText(order)
  return status.includes('delivered') || status.includes('completed')
}

export type DeliveryService = {
  key: string
  id: string
  product?: 'hyperlocal' | 'quick_commerce'
  title: string
  badge: string
  summary: string
  bestFor: string
  icon: typeof Truck
  accent: string
  partners?: string[]
  modes: Array<{ title: string; description: string }>
  vehicleOptions: string[]
  availability: string
  examples: string[]
  actionLabel: string
  actionPath: string
}

const D2C_DELIVERY_SERVICE: DeliveryService = {
  key: 'd2c',
  id: 'd2c',
  title: 'All-India Courier',
  badge: 'Parcel < 20kg',
  summary:
    'Ship ecommerce parcels, documents, and small packages anywhere in India.',
  bestFor: 'Ecommerce, clothing, cosmetics, gifts',
  icon: Package,
  accent: 'bg-blue-600 text-white',
  partners: ['delhivery', 'shadowfax'],
  modes: [
    { title: 'Express Delivery', description: 'Fastest delivery by Air.' },
    {
      title: 'Surface Delivery',
      description: 'Economical delivery by Road.',
    },
  ],
  vehicleOptions: ['Parcel Express', 'Parcel Surface'],
  availability: 'All India delivery via top courier partners.',
  examples: ['Documents', 'Small parcels', 'Gifts', 'Apparel'],
  actionLabel: 'Book courier',
  actionPath: '/courier/book-vehicle',
}

export const findDeliveryService = (search: string) => {
  const params = new URLSearchParams(search)
  const serviceId = params.get('service') || ''
  const product = params.get('product') || ''
  if (product) {
    const named = DELIVERY_SERVICE_CATALOG.find((service) => service.product === product)
    if (named) return named
  }
  if (serviceId === 'd2c') return D2C_DELIVERY_SERVICE
  return (
    DELIVERY_SERVICE_CATALOG.find((service) => service.id === serviceId && !service.product) ||
    DELIVERY_SERVICE_CATALOG.find((service) => service.id === serviceId) ||
    DELIVERY_SERVICE_CATALOG[0]
  )
}

const createDeliveryPath = (
  service: DeliveryService,
  options?: { orderId?: string; list?: boolean }
) => {
  const params = new URLSearchParams()
  if (options?.list) {
    params.set('view', 'service-orders')
    params.set('type', service.key)
    return `/delivery-system?${params.toString()}`
  }
  params.set('view', 'create-order')
  params.set('service', service.id)
  if (service.product) params.set('product', service.product)
  if (options?.orderId) params.set('orderId', options.orderId)
  return `/delivery-system?${params.toString()}`
}

export const DELIVERY_SERVICE_CATALOG: DeliveryService[] = [
  {
    key: 'quick_commerce',
    id: 'local',
    product: 'quick_commerce',
    title: 'Quick Commerce',
    badge: 'Under 20kg',
    summary:
      'Warehouse quick-commerce delivery for grocery, food, and urgent city orders.',
    bestFor: 'Grocery, food, urgent store orders',
    icon: Zap,
    accent: 'bg-amber-500 text-white',
    partners: ['shadowfax'],
    modes: [
      {
        title: 'Quick Commerce',
        description: 'Pickup uses the warehouse code and the full order payload.',
      },
    ],
    vehicleOptions: ['Bike', '3 Wheeler L- 4.5 ft, H-6 Ft'],
    availability: 'Quick commerce via Shadowfax.',
    examples: ['Groceries', 'Food', 'Urgent store orders'],
    actionLabel: 'Book quick commerce',
    actionPath: '/courier/book-vehicle',
  },
  {
    key: 'hyperlocal',
    id: 'local',
    product: 'hyperlocal',
    title: 'Hyperlocal',
    badge: 'Within city',
    summary:
      'Same-city hyperlocal delivery with a pickup pin and a drop pin on every order.',
    bestFor: 'Food, documents, small urgent parcels',
    icon: Package,
    accent: 'bg-primary text-white',
    partners: ['shadowfax'],
    modes: [
      {
        title: 'Hyperlocal',
        description: 'Fastest delivery within city limits.',
      },
    ],
    vehicleOptions: ['Bike', '3 Wheeler L- 4.5 ft, H-6 Ft'],
    availability: 'Hyperlocal delivery via Shadowfax.',
    examples: ['Food', 'Documents', 'Urgent items'],
    actionLabel: 'Book hyperlocal',
    actionPath: '/courier/book-vehicle',
  },
  {
    key: 'b2b',
    id: 'b2b',
    title: 'B2C',
    badge: 'Light < 750kg',
    summary:
      'Light goods movement for retail and consumer deliveries.',
    bestFor: 'Wholesale stock, FMCG, inventory transfers',
    icon: Warehouse,
    accent: 'bg-primary text-white',
    partners: ['porter', 'shadowfax'],
    modes: [
      {
        title: 'Intra-City Delivery',
        description: 'Business delivery within the same city.',
      },
      {
        title: 'Inter-City Delivery',
        description: 'Business delivery from one city to another city.',
      },
    ],
    vehicleOptions: [
      'L-6ft, H-10 Ft',
      'L-5.5ft, H-8 Ft',
      'L-5 ft, H-7 Ft',
      '3 Wheeler L- 4.5 ft, H-6 Ft',
    ],
    availability: 'Available in all major cities.',
    examples: [
      'Wholesale inventory',
      'Retail shop stock transfers',
      'FMCG products',
      'Restaurant supplies',
      'Electronics inventory',
      'Packaging materials',
    ],
    actionLabel: 'Plan B2C delivery',
    actionPath: '/courier/book-vehicle',
  },
  {
    key: 'heavy-duty',
    id: 'heavy-duty',
    title: 'B2B',
    badge: 'Heavy > 750kg',
    summary:
      'Move large, industrial, construction, furniture, and bulk goods with planned vehicle capacity.',
    bestFor: 'Machines, steel, construction material, equipment',
    icon: Truck,
    accent: 'bg-slate-950 text-white',
    partners: ['porter'],
    modes: [
      {
        title: 'Intra-City Delivery',
        description: 'Heavy goods movement within the same city.',
      },
      {
        title: 'Inter-City Delivery',
        description: 'Heavy goods movement from one city to another city.',
      },
    ],
    vehicleOptions: [
      'L-7ft, H-19 Ft Truck',
      'L-7ft, H-17 Ft Open Truck',
      'L-7ft, H-17 Ft Closed Truck',
      'L-6ft, H-14 Ft Open Truck',
      'L-6ft, H-14 Ft Closed Truck',
      'L-6ft, H-10 Ft',
      'L-5.5ft, H-8 Ft',
      'L-5 ft, H-7 Ft',
    ],
    availability:
      'Truck and tempo options available like Porter-style booking.',
    examples: [
      'Industrial machines',
      'Iron rods and steel materials',
      'Construction materials',
      'Heavy equipment',
      'Furniture and bulk goods',
    ],
    actionLabel: 'Book heavy delivery',
    actionPath: '/courier/book-vehicle',
  },
]

function StatTile({
  label,
  value,
  className = '',
}: {
  label: string
  value: number | string
  className?: string
  valueClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-2xl font-semibold tabular-nums'>{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function QuickAction({
  icon: Icon,
  title,
  subtitle,
  onClick,
  partner,
}: {
  icon: typeof Truck
  title: string
  subtitle: string
  onClick: () => void
  partner?: string
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex w-full items-center gap-3 rounded-md border bg-background p-3 text-left transition hover:bg-muted'
    >
      <span className='flex size-9 items-center justify-center rounded-md border bg-muted'>
        {partner ? (
          <PartnerLogo partner={partner} size="xs" showName={false} />
        ) : (
          <Icon className='size-4' />
        )}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block text-sm font-medium'>{title}</span>
        <span className='block truncate text-sm text-muted-foreground'>{subtitle}</span>
      </span>
      <ArrowRight className='size-4 text-muted-foreground' />
    </button>
  )
}

export function DeliveryWorkspaceShell({
  children,
  activeSection,
}: {
  children: ReactNode
  activeSection?: DeliveryWorkspaceSection
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = new URLSearchParams(location.searchStr)
  const activeType = searchParams.get('type')
  const authUser = useSelector((state: RootState) => state.auth?.user)
  const role = String(authUser?.role || '').toLowerCase()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const { config: appConfig } = useDeliveryAppConfig()
  const deliveryServices = useMemo(
    () => DELIVERY_SERVICE_CATALOG.map((service) => applyDeliveryApps(service, appConfig)),
    [appConfig]
  )

  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [warehousePromptOpen, setWarehousePromptOpen] = useState(false)
  const [createRequestOpen, setCreateRequestOpen] = useState(false)
  const [requestsOpen, setRequestsOpen] = useState(
    activeSection === 'service-orders' || activeSection === 'courier-list'
  )
  const [ordersOpen, setOrdersOpen] = useState(
    activeSection === 'website-orders' ||
      activeSection === 'manual-orders' ||
      activeSection === 'create-order'
  )

  const fetchWallet = async () => {
    try {
      const res = await api.get('/credits/balance')
      setWalletBalance(Number(res.data?.wallet?.availableCredits ?? 1000))
    } catch {
      setWalletBalance(null)
    }
  }

  useEffect(() => {
    if (isAdmin) return
    void fetchWallet()
    window.addEventListener('CREDITS_BALANCE_CHANGED', fetchWallet)
    return () =>
      window.removeEventListener('CREDITS_BALANCE_CHANGED', fetchWallet)
  }, [isAdmin])

  const openPath = (path: string) => {
    void navigate({ to: path })
  }

  const refreshActivePage = () => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('delivery-workspace-refresh'))
  }

  const requestsGroupActive =
    activeSection === 'service-orders' || activeSection === 'courier-list'
  const ordersGroupActive =
    activeSection === 'website-orders' ||
    activeSection === 'manual-orders' ||
    activeSection === 'create-order'

  useEffect(() => {
    if (requestsGroupActive) setRequestsOpen(true)
  }, [requestsGroupActive])

  useEffect(() => {
    if (ordersGroupActive) setOrdersOpen(true)
  }, [ordersGroupActive])

  const openCreateOrder = (serviceId = 'd2c') => {
    openPath(`/delivery-system?view=create-order&service=${serviceId}`)
  }

  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:5173'

  return (
    <ShellFrame
      toolbar={
        isAdmin ? (
          <div className='rounded-full bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground'>
            Admin delivery workspace
          </div>
        ) : (
          <button
            type='button'
            onClick={() => {
              window.location.href = adminUrl + '/credits'
            }}
            className='hidden items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-left sm:flex'
          >
            <WalletIcon className='size-4 text-primary' />
            <span className='text-xs font-semibold'>
              {walletBalance !== null ? walletBalance.toLocaleString('en-IN') + ' credits' : '...'}
            </span>
          </button>
        )
      }
      sidebar={
        <>
          <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === 'dashboard'}
                    onClick={() => openPath('/delivery-system')}
                    tooltip='Delivery Dashboard'
                    className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                  >
                    <LayoutDashboard />
                    <span>Delivery Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setCreateRequestOpen(true)}
                    tooltip='Create Delivery Request'
                    className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground'
                  >
                    <Plus />
                    <span className='truncate'>Create Delivery Request</span>
                    <span className='ml-auto shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground'>
                      New
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <Collapsible
                  open={requestsOpen}
                  onOpenChange={setRequestsOpen}
                  className='group/collapsible'
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip='Delivery Requests'
                        className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                      >
                        <FileText />
                        <span>Delivery Requests</span>
                        <ChevronDown className='ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180' />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className='mt-1 ml-3 border-l border-border pl-2'>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            isActive={
                              activeSection === 'service-orders' && !activeType
                            }
                            onClick={() =>
                              openPath('/delivery-system?view=service-orders')
                            }
                            className='h-9 w-full cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                          >
                            <span>All Requests</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            isActive={activeSection === 'courier-list'}
                            onClick={() =>
                              openPath('/delivery-system?view=website-requests')
                            }
                            className='h-9 w-full cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                          >
                            <span>Website requests</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        {DELIVERY_SERVICE_CATALOG.map((service) => (
                          <SidebarMenuSubItem key={service.key}>
                            <SidebarMenuSubButton
                              isActive={
                                activeSection === 'service-orders' &&
                                activeType === service.key
                              }
                              onClick={() =>
                                openPath(createDeliveryPath(service, { list: true }))
                              }
                              className='h-9 w-full cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                            >
                              <span>{service.title}</span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>

                <Collapsible
                  open={ordersOpen}
                  onOpenChange={setOrdersOpen}
                  className='group/collapsible'
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip='All Orders'
                        className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                      >
                        <ClipboardList />
                        <span>All Orders</span>
                        <ChevronDown className='ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180' />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className='mt-1 ml-3 border-l border-border pl-2'>
                           <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            isActive={activeSection === 'create-order'}
                            onClick={() => void openCreateOrder()}
                            className='h-9 w-full cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                          >
                            <span>Create your order</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            isActive={activeSection === 'website-orders'}
                            onClick={() =>
                              openPath('/delivery-system?view=website-orders')
                            }
                            className='h-9 w-full cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                          >
                            <span>Website order</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            isActive={activeSection === 'manual-orders'}
                            onClick={() =>
                              openPath('/delivery-system?view=manual-orders')
                            }
                            className='h-9 w-full cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                          >
                            <span>Manual order</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                     
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>

                {!isAdmin ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeSection === 'apps'}
                      onClick={() => openPath('/courier')}
                      tooltip='Check Price'
                      className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                    >
                      <Truck />
                      <span>Check Price</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {!isAdmin ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeSection === 'warehouses'}
                      onClick={() => openPath('/courier/warehouses')}
                      tooltip='Warehouses'
                      className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                    >
                      <Warehouse />
                      <span>Warehouses</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === 'reports'}
                    onClick={() => openPath('/courier/reports')}
                    tooltip='Reports'
                    className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                  >
                    <FileText />
                    <span>Reports</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {isAdmin ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeSection === 'set-pricing'}
                      onClick={() => openPath('/delivery-system?view=set-pricing')}
                      tooltip='Set Pricing'
                      className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                    >
                      <IndianRupee />
                      <span>Set Pricing</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {isAdmin ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeSection === 'manage-apps'}
                      onClick={() => openPath('/delivery-system?view=manage-apps')}
                      tooltip='Manage Apps'
                      className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                    >
                      <LayoutGrid />
                      <span>Manage Apps</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {role === 'superadmin' && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeSection === 'delivery-markup'}
                      onClick={() =>
                        openPath('/delivery-system?view=delivery-markup')
                      }
                      tooltip='Delivery Markup'
                      className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                    >
                      <ReceiptText />
                      <span>Delivery Markup</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === 'support'}
                    onClick={() => openPath('/delivery-system?view=support')}
                    tooltip='Support'
                    className='h-10 cursor-pointer text-sm hover:bg-muted/60 hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground'
                  >
                    <Headphones />
                    <span>Support</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
        </>
      }
    >
      <Dialog open={createRequestOpen} onOpenChange={setCreateRequestOpen}>
        <DialogContent className='sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>Create Delivery Request</DialogTitle>
            <DialogDescription>
              Choose a delivery type. The matching request page opens next.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 sm:grid-cols-2'>
            {deliveryServices.map((service) => {
              const Icon = service.icon
              return (
                <button
                  key={service.key}
                  type='button'
                  onClick={() => {
                    setCreateRequestOpen(false)
                    openPath(createDeliveryPath(service))
                  }}
                  className='flex h-full flex-col rounded-xl border bg-card p-5 text-left shadow-sm transition hover:bg-muted/40'
                >
                  <Icon className='size-5 text-primary' />
                  <span className='mt-4 text-sm font-semibold text-primary'>{service.badge}</span>
                  <span className='mt-1 text-base font-semibold'>{service.title}</span>
                  {service.partners?.length ? (
                    <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                      {service.partners.map((partner) => (
                        <PartnerLogo key={partner} partner={partner} size='xs' badge />
                      ))}
                    </div>
                  ) : null}
                  <span className='mt-4 inline-flex w-fit items-center gap-2 rounded-md border border-primary bg-background px-3 py-2 text-sm font-medium text-primary'>
                    Create order
                    <ArrowRight className='size-4' />
                  </span>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={warehousePromptOpen} onOpenChange={setWarehousePromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a warehouse first</DialogTitle>
            <DialogDescription>
              Create your order stays locked until a pickup warehouse exists. Add one warehouse, then you can create an order and request delivery.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setWarehousePromptOpen(false)
                openPath('/courier/warehouses')
              }}
            >
              Create warehouse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {children}
    </ShellFrame>
  )
}

export function DeliverySystemDashboard() {
  const navigate = useNavigate()
  const searchStr = useLocation({ select: (location) => location.searchStr })
  const role = String(
    useSelector((state: RootState) => state.auth?.user?.role || '')
  ).toLowerCase()
  const user = useSelector((state: RootState) => state.auth?.user)
  const token = useSelector((state: RootState) => state.auth?.token)
  const isVendor = role === 'vendor'
  const isAdmin = role === 'admin' || role === 'superadmin'
  const isSuperAdmin = role === 'superadmin'
  const [activeView, setActiveView] = useState<DeliveryView>('dashboard')
  const [orders, setOrders] = useState<CourierOrderSummary[]>([])
  const [externalShipments, setExternalShipments] = useState<
    ExternalDelhiveryShipment[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [deliveryTarget, setDeliveryTarget] = useState<CourierOrderSummary | null>(null)
  const { config: appConfig } = useDeliveryAppConfig()
  const deliveryServices = useMemo(
    () => DELIVERY_SERVICE_CATALOG.map((service) => applyDeliveryApps(service, appConfig)),
    [appConfig]
  )

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!token || !user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')
        const [ordersResult, externalResult] = await Promise.allSettled([
          loadCourierOrders(isVendor),
          isVendor
            ? fetchExternalDelhiveryShipments()
            : Promise.resolve({ shipments: [] as ExternalDelhiveryShipment[] }),
        ])

        if (cancelled) return

        if (ordersResult.status === 'fulfilled') {
          setOrders(ordersResult.value)
        } else {
          setOrders([])
          setError(
            ordersResult.reason?.response?.data?.message ||
              ordersResult.reason?.message ||
              'Failed to load orders'
          )
        }

        if (externalResult.status === 'fulfilled') {
          setExternalShipments(
            Array.isArray(externalResult.value?.shipments)
              ? externalResult.value.shipments
              : []
          )
        } else {
          setExternalShipments([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isVendor, refreshKey, token, user])

  useEffect(() => {
    const refresh = () => setRefreshKey((current) => current + 1)
    window.addEventListener('delivery-workspace-refresh', refresh)
    return () =>
      window.removeEventListener('delivery-workspace-refresh', refresh)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(searchStr)
    const view = params.get('view')
    setActiveView(
      view === 'support'
        ? 'support'
        : view === 'delivery-markup'
          ? 'delivery-markup'
          : view === 'set-pricing'
            ? 'set-pricing'
          : view === 'manage-apps'
            ? 'manage-apps'
          : view === 'service-orders'
            ? 'service-orders'
            : view === 'website-requests'
              ? 'website-requests'
              : view === 'website-orders'
                ? 'website-orders'
                : view === 'manual-orders'
                  ? 'manual-orders'
                : view === 'create-order'
                  ? 'create-order'
                  : 'dashboard'
    )
  }, [searchStr])

  const stats = useMemo(
    () => ({
      totalOrders: orders.length,
      pendingPickup: orders.filter(isPendingPickup).length,
      inTransit: orders.filter(isInTransit).length,
      destinationHub: orders.filter(isAtDestinationHub).length,
      delivered: orders.filter(isDelivered).length,
      activeShipments:
        orders.filter(hasAnyActiveCourierAssignment).length +
        externalShipments.length,
      revenue: orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    }),
    [externalShipments.length, orders]
  )

  const openPath = (path: string) => {
    void navigate({ to: path })
  }

  return (
    <DeliveryWorkspaceShell
      activeSection={
        activeView === 'support'
            ? 'support'
            : activeView === 'delivery-markup'
              ? 'delivery-markup'
              : activeView === 'set-pricing'
                ? 'set-pricing'
              : activeView === 'manage-apps'
                ? 'manage-apps'
              : activeView === 'service-orders' || activeView === 'website-requests'
                ? activeView === 'website-requests'
                  ? 'courier-list'
                  : 'service-orders'
                : activeView === 'website-orders'
                  ? 'website-orders'
                  : activeView === 'manual-orders'
                    ? 'manual-orders'
                  : activeView === 'create-order'
                    ? 'create-order'
                    : 'dashboard'
      }
    >
      {error ? (
        <div className='mb-4 rounded-[6px] border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700'>
          {error}
        </div>
      ) : null}

      {activeView === 'dashboard' ? (
        <div className='space-y-6'>
          <DeliveryPromoBanner />
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
            {deliveryServices.map((service) => {
              const Icon = service.icon
              return (
                <button
                  key={service.key}
                  type='button'
                  onClick={() => openPath(createDeliveryPath(service))}
                  className='flex h-full flex-col rounded-xl border bg-card p-5 text-left shadow-sm transition hover:bg-muted/40'
                >
                  <Icon className='size-5 text-primary' />
                  <span className='mt-4 text-sm font-semibold text-primary'>{service.badge}</span>
                  <span className='mt-1 text-base font-semibold'>{service.title}</span>
                  {service.partners?.length ? (
                    <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                      {service.partners.map((p) => (
                        <PartnerLogo key={p} partner={p} size="xs" badge />
                      ))}
                    </div>
                  ) : null}
                  <span className='mt-auto pt-3 inline-flex w-fit items-center gap-2 rounded-md border border-primary bg-background px-3 py-2 text-sm font-medium text-primary'>
                    Create order
                    <ArrowRight className='size-4' />
                  </span>
                </button>
              )
            })}
          </div>

          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <StatTile label='Total orders' value={loading ? '...' : stats.totalOrders} />
            <StatTile label='Pending pickup' value={stats.pendingPickup} />
            <StatTile label='In transit' value={stats.inTransit} />
            <StatTile label='At destination hub' value={stats.destinationHub} />
            <StatTile label='Delivered' value={stats.delivered} />
            <StatTile label='Active shipments' value={stats.activeShipments} />
            <StatTile label='Order value' value={formatINR(stats.revenue)} />
          </div>

          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base font-semibold'>Delivery & Courier Apps</CardTitle>
              <CardDescription>
                Direct automated integration with leading logistics networks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid gap-3 sm:grid-cols-3'>
                <div className='rounded-xl border border-border bg-muted/20 p-3'>
                  <PartnerLogo partner="delhivery" size="sm" />
                  <p className='mt-1 truncate text-xs text-muted-foreground'>All-India courier & surface shipping</p>
                </div>
                <div className='rounded-xl border border-border bg-muted/20 p-3'>
                  <PartnerLogo partner="shadowfax" size="sm" />
                  <p className='mt-1 truncate text-xs text-muted-foreground'>Hyperlocal & quick commerce delivery</p>
                </div>
                <div className='rounded-xl border border-border bg-muted/20 p-3'>
                  <PartnerLogo partner="porter" size="sm" />
                  <p className='mt-1 truncate text-xs text-muted-foreground'>Trucks, tempos & heavy goods logistics</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid gap-2 md:grid-cols-2'>
                {!isVendor ? null : (
                  <QuickAction
                    icon={Warehouse}
                    title='Warehouse'
                    subtitle='Create and manage Delhivery pickup locations'
                    partner='delhivery'
                    onClick={() => openPath('/courier/warehouses')}
                  />
                )}
                <QuickAction
                  icon={Headphones}
                  title={isVendor ? 'Support' : 'Support admin'}
                  subtitle={
                    isVendor
                      ? 'Raise a delivery ticket or start live chat'
                      : 'Review delivery tickets and live chats'
                  }
                  onClick={() => openPath('/delivery-system?view=support')}
                />
                {isSuperAdmin ? (
                  <QuickAction
                    icon={ReceiptText}
                    title='Delivery Markup'
                    subtitle='Configure vendor-facing courier price markup'
                    onClick={() =>
                      openPath('/delivery-system?view=delivery-markup')
                    }
                  />
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : activeView === 'support' ? (
        <DeliverySupportPanel
          isAdmin={!isVendor}
          isVendor={isVendor}
          orders={orders}
          ordersLoading={loading}
        />
      ) : activeView === 'delivery-markup' ? (
        <DeliveryMarkupPanel />
      ) : activeView === 'manage-apps' ? (
        isAdmin ? <ManageAppsPanel /> : (
          <Card>
            <CardHeader>
              <CardTitle>Manage Apps</CardTitle>
              <CardDescription>This page is available to admin accounts only.</CardDescription>
            </CardHeader>
          </Card>
        )
      ) : activeView === 'set-pricing' ? (
        isAdmin ? <SetPricingPanel /> : (
          <Card>
            <CardHeader>
              <CardTitle>Set Pricing</CardTitle>
              <CardDescription>This page is available to admin accounts only.</CardDescription>
            </CardHeader>
          </Card>
        )
      ) : activeView === 'service-orders' ? (
        <ServiceOrdersPanel />
      ) : activeView === 'website-requests' ? (
        <CourierListPage />
      ) : activeView === 'website-orders' ? (
        <WebsiteOrdersPanel
          orders={orders}
          loading={loading}
          onDeliver={setDeliveryTarget}
        />
      ) : activeView === 'manual-orders' ? (
        <ManualOrdersPanel
          orders={orders}
          loading={loading}
          onCreate={() => openPath('/delivery-system?view=create-order&service=local')}
          onDeliver={setDeliveryTarget}
        />
      ) : activeView === 'create-order' ? (
        <CreateOrderPanel
          key={searchStr}
          service={applyDeliveryApps(findDeliveryService(searchStr), appConfig)}
          existingOrder={orders.find((order) => order.id === new URLSearchParams(searchStr).get('orderId')) || null}
          onCreateWarehouse={() => openPath('/courier/warehouses')}
          onPlaced={() => openPath('/delivery-system?view=service-orders')}
        />
      ) : null}
      <Dialog open={Boolean(deliveryTarget)} onOpenChange={(open) => { if (!open) setDeliveryTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request delivery</DialogTitle>
            <DialogDescription>
              {deliveryTarget
                ? `Choose a delivery type for ${deliveryTarget.orderNumber}.`
                : 'Choose a delivery type.'}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-2'>
            {deliveryServices.map((service) => {
              const Icon = service.icon
              return (
                <button
                  key={service.key}
                  type='button'
                  onClick={() => {
                    if (!deliveryTarget) return
                    openPath(createDeliveryPath(service, { orderId: deliveryTarget.id }))
                    setDeliveryTarget(null)
                  }}
                  className='flex items-center gap-3 rounded-lg border p-3 text-left transition hover:bg-muted/50'
                >
                  <Icon className='size-5 shrink-0 text-primary' />
                  <span className='min-w-0 flex-1'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='block text-sm font-semibold text-primary'>{service.badge}</span>
                      {service.partners?.length ? (
                        <div className='flex items-center gap-1'>
                          {service.partners.map((p) => (
                            <PartnerLogo key={p} partner={p} size="xs" badge />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <span className='block text-sm font-medium'>{service.title}</span>
                    <span className='block text-sm text-muted-foreground'>{service.bestFor}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </DeliveryWorkspaceShell>
  )
}
