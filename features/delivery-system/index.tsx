"use client"

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from '@/lib/router'
import type { RootState } from '@/store'
import {
  ArrowRight,
  ClipboardList,
  Headphones,
  LayoutDashboard,
  Loader2,
  RefreshCcw,
  FileText,
  ReceiptText,
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
  fetchCourierWarehouses,
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
import { DeliveryPromoBanner } from './components/promo-banner'
import { ServiceOrdersPanel } from './components/service-orders-panel'
import { ManualOrdersPanel } from './components/manual-orders-panel'
import { WebsiteOrdersPanel } from './components/website-orders-panel'
import { CourierListPage } from '@/features/courier/list'
import { DeliveryMarkupPanel } from './delivery-markup-panel'
import { DeliverySupportPanel } from './delivery-support-panel'

type DeliveryView =
  | 'dashboard'
  | 'support'
  | 'delivery-markup'
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
  id: string
  title: string
  badge: string
  summary: string
  bestFor: string
  icon: typeof Truck
  accent: string
  modes: Array<{ title: string; description: string }>
  vehicleOptions: string[]
  availability: string
  examples: string[]
  actionLabel: string
  actionPath: string
}

export const DELIVERY_SERVICE_CATALOG: DeliveryService[] = [
  {
    id: 'heavy-duty',
    title: 'Heavy-Duty Delivery',
    badge: 'Heavy > 750kg',
    summary:
      'Move large, industrial, construction, furniture, and bulk goods with planned vehicle capacity.',
    bestFor: 'Machines, steel, construction material, equipment',
    icon: Truck,
    accent: 'bg-slate-950 text-white',
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
    actionLabel: 'Book heavy vehicle',
    actionPath: '/courier/book-vehicle',
  },
  {
    id: 'b2b',
    title: 'Light & Medium Delivery',
    badge: 'Light < 750kg',
    summary:
      'Reliable light goods movement for wholesale, retail, and local B2B deliveries.',
    bestFor: 'Wholesale stock, FMCG, inventory transfers',
    icon: Warehouse,
    accent: 'bg-primary text-white',
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
    actionLabel: 'Plan light delivery',
    actionPath: '/courier/book-vehicle',
  },
  {
    id: 'd2c',
    title: 'All-India Courier',
    badge: 'Parcel < 20kg',
    summary:
      'Ship ecommerce parcels, documents, and small packages anywhere in India.',
    bestFor: 'Ecommerce, clothing, cosmetics, gifts',
    icon: Package,
    accent: 'bg-blue-600 text-white',
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
  },
  {
    id: 'local',
    title: 'Local Quick Delivery',
    badge: 'Hyperlocal < 20kg',
    summary:
      'Same-day hyperlocal delivery for food, grocery, and urgent documents.',
    bestFor: 'Food, documents, small urgent parcels',
    icon: Zap,
    accent: 'bg-amber-500 text-white',
    modes: [
      {
        title: 'Hyperlocal Delivery',
        description: 'Fastest delivery within city limits.',
      },
    ],
    vehicleOptions: ['Bike', '3 Wheeler L- 4.5 ft, H-6 Ft'],
    availability: 'Hyperlocal delivery via top delivery partners.',
    examples: ['Food', 'Groceries', 'Documents', 'Urgent items'],
    actionLabel: 'Book quick delivery',
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
}: {
  icon: typeof Truck
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex w-full items-center gap-3 rounded-md border bg-background p-3 text-left transition hover:bg-muted'
    >
      <span className='flex size-9 items-center justify-center rounded-md border bg-muted'>
        <Icon className='size-4' />
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

  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [warehousePromptOpen, setWarehousePromptOpen] = useState(false)
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

  const openCreateOrder = async (serviceId = 'd2c') => {
    try {
      const rows = await fetchCourierWarehouses()
      if (!rows.length) {
        setWarehousePromptOpen(true)
        return
      }
    } catch {
      setWarehousePromptOpen(true)
      return
    }
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

                <Collapsible
                  open={requestsOpen}
                  onOpenChange={setRequestsOpen}
                  className='group/collapsible'
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        isActive={activeSection === 'service-orders'}
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
                          <SidebarMenuSubItem key={service.id}>
                            <SidebarMenuSubButton
                              isActive={
                                activeSection === 'service-orders' &&
                                activeType === service.id
                              }
                              onClick={() =>
                                openPath(
                                  `/delivery-system?view=service-orders&type=${service.id}`
                                )
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
                        isActive={ordersGroupActive}
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
            {DELIVERY_SERVICE_CATALOG.map((service) => {
              const Icon = service.icon
              return (
                <button
                  key={service.id}
                  type='button'
                  onClick={() =>
                    openPath(`/delivery-system?view=create-order&service=${service.id}`)
                  }
                  className='flex h-full flex-col rounded-xl border bg-card p-5 text-left shadow-sm transition hover:bg-muted/40'
                >
                  <span className='flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground'>
                    <Icon className='size-5' />
                  </span>
                  <span className='mt-4 text-sm font-semibold text-primary'>{service.badge}</span>
                  <span className='mt-1 text-base font-semibold'>{service.title}</span>
                  <span className='mt-2 text-sm text-muted-foreground'>{service.bestFor}</span>
                  <span className='mt-auto inline-flex items-center gap-2 pt-4 text-sm font-medium'>
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
          service={
            DELIVERY_SERVICE_CATALOG.find((service) => service.id === new URLSearchParams(searchStr).get('service')) ||
            DELIVERY_SERVICE_CATALOG[2]
          }
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
            {DELIVERY_SERVICE_CATALOG.map((service) => {
              const Icon = service.icon
              return (
                <button
                  key={service.id}
                  type='button'
                  onClick={() => {
                    if (!deliveryTarget) return
                    openPath(`/delivery-system?view=create-order&orderId=${deliveryTarget.id}&service=${service.id}`)
                    setDeliveryTarget(null)
                  }}
                  className='flex items-center gap-3 rounded-lg border p-3 text-left transition hover:bg-muted/50'
                >
                  <span className='flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground'>
                    <Icon className='size-5' />
                  </span>
                  <span className='min-w-0'>
                    <span className='block text-sm font-semibold text-primary'>{service.badge}</span>
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
