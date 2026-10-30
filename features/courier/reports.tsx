"use client"

import { FileText, LoaderCircle, RefreshCcw, Truck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  fetchExternalDelhiveryShipments,
  loadCourierOrders,
  loadManualCourierOrders,
  type ExternalDelhiveryShipment,
} from '@/features/delivery-system/lib/api'
import {
  hasAnyActiveCourierAssignment,
  type CourierOrderSummary,
} from '@/features/delivery-system/lib/data'
import { formatINR } from '@/lib/currency'

const readText = (value: unknown) => String(value ?? '').trim()

const isDelivered = (order: CourierOrderSummary) =>
  [
    order.status,
    order.delhivery?.status,
    order.delhivery?.status_description,
    order.shadowfax?.status,
    order.shadowfax?.status_description,
  ]
    .map((value) => readText(value).toLowerCase())
    .join(' ')
    .includes('delivered')

const getPartner = (order: CourierOrderSummary) => {
  const provider = readText(order.deliveryProvider).toLowerCase()
  if (order.delhivery || provider.includes('delhivery')) return 'Delhivery'
  if (order.shadowfax || provider.includes('shadowfax')) return 'Shadowfax'
  if (order.borzo?.order_id || provider.includes('borzo')) return 'Borzo'
  return 'Unassigned'
}

function ReportCard({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className='rounded-md border border-border bg-card p-5'>
      <p className='text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground'>{label}</p>
      <p className='mt-4 text-lg font-bold text-foreground'>{value}</p>
      <p className='mt-2 text-sm text-muted-foreground'>{helper}</p>
    </div>
  )
}

export function CourierReportsPage() {
  const [orders, setOrders] = useState<CourierOrderSummary[]>([])
  const [manualOrders, setManualOrders] = useState<CourierOrderSummary[]>([])
  const [externalShipments, setExternalShipments] = useState<ExternalDelhiveryShipment[]>([])
  const [loading, setLoading] = useState(true)

  const loadReports = useCallback(async () => {
    try {
      setLoading(true)
      const [ordersResult, manualResult, externalResult] = await Promise.allSettled([
        loadCourierOrders(true),
        loadManualCourierOrders(),
        fetchExternalDelhiveryShipments(),
      ])

      setOrders(ordersResult.status === 'fulfilled' ? ordersResult.value : [])
      setManualOrders(manualResult.status === 'fulfilled' ? manualResult.value : [])
      setExternalShipments(
        externalResult.status === 'fulfilled' && Array.isArray(externalResult.value?.shipments)
          ? externalResult.value.shipments
          : []
      )

      if ([ordersResult, manualResult, externalResult].every((result) => result.status === 'rejected')) {
        toast.error('Failed to load courier reports')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  useEffect(() => {
    const refresh = () => void loadReports()
    window.addEventListener('delivery-workspace-refresh', refresh)
    return () => window.removeEventListener('delivery-workspace-refresh', refresh)
  }, [loadReports])

  const report = useMemo(() => {
    const allOrders = orders
    const partnerCounts = allOrders.reduce<Record<string, number>>((acc, order) => {
      const partner = getPartner(order)
      acc[partner] = (acc[partner] || 0) + 1
      return acc
    }, {})
    return {
      totalOrders: allOrders.length,
      websiteOrders: allOrders.filter((order) => order.source === 'template-orders').length,
      manualOrders: manualOrders.length,
      activeRequests: allOrders.filter(hasAnyActiveCourierAssignment).length + externalShipments.length,
      delivered: allOrders.filter(isDelivered).length,
      orderValue: allOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      deliveryCost: allOrders.reduce((sum, order) => sum + Number(order.deliveryCost || 0), 0),
      partnerCounts,
    }
  }, [externalShipments.length, manualOrders.length, orders])

  return (
    <div className='space-y-5'>
        <div className='flex flex-wrap items-start justify-between gap-4 border border-border bg-card p-5'>
          <div>
            <h1 className='text-lg font-semibold tracking-tight text-foreground'>Delivery Reports</h1>
            <p className='mt-2 max-w-3xl text-sm leading-6 text-muted-foreground'>
              Courier order, request, partner, value, and delivery-cost report summary.
            </p>
          </div>
          <Button variant='outline' disabled={loading} onClick={() => void loadReports()}>
            {loading ? <LoaderCircle className='h-4 w-4 animate-spin' /> : <RefreshCcw className='h-4 w-4' />}
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className='rounded-md border border-border bg-card p-6 text-sm text-muted-foreground'>
            Loading reports...
          </div>
        ) : (
          <>
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
              <ReportCard label='Total orders' value={report.totalOrders} helper='Dashboard and website orders.' />
              <ReportCard label='Website orders' value={report.websiteOrders} helper='Template website orders.' />
              <ReportCard label='Manual orders' value={report.manualOrders} helper='Created from manual order form.' />
              <ReportCard label='Active requests' value={report.activeRequests} helper='Courier requests and imported shipments.' />
              <ReportCard label='Delivered' value={report.delivered} helper='Orders marked delivered by courier/order status.' />
              <ReportCard label='Order value' value={formatINR(report.orderValue)} helper='Total order value loaded in delivery workspace.' />
              <ReportCard label='Delivery cost' value={formatINR(report.deliveryCost)} helper='Wallet delivery cost recorded on orders.' />
              <ReportCard label='Imported shipments' value={externalShipments.length} helper='Delhivery panel imported records.' />
            </div>

            <div className='grid gap-5 lg:grid-cols-2'>
              <section className='rounded-md border border-border bg-card p-5'>
                <h2 className='text-lg font-semibold text-foreground'>Partner report</h2>
                <div className='mt-4 space-y-3'>
                  {Object.entries(report.partnerCounts).map(([partner, count]) => (
                    <div key={partner} className='flex items-center justify-between rounded-md border border-border bg-muted/20 px-4 py-3 text-sm'>
                      <span className='font-medium text-foreground'>{partner}</span>
                      <span className='font-semibold text-muted-foreground'>{count} orders</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className='rounded-md border border-border bg-card p-5'>
                <h2 className='text-lg font-semibold text-foreground'>Report shortcuts</h2>
                <div className='mt-4 grid gap-3'>
                  {[
                    ['Requests', '/delivery-system?view=website-requests'],
                    ['Check Price', '/courier'],
                    ['Warehouses', '/courier/warehouses'],
                  ].map(([label, href]) => (
                    <button
                      key={href}
                      type='button'
                      className='flex items-center justify-between rounded-md border border-border bg-muted/20 px-4 py-3 text-left text-sm hover:bg-muted/40'
                      onClick={() => window.location.assign(href)}
                    >
                      <span className='inline-flex items-center gap-2 font-medium text-foreground'>
                        {label === 'Requests' ? <Truck className='h-4 w-4' /> : <FileText className='h-4 w-4' />}
                        {label}
                      </span>
                      <span className='text-muted-foreground'>Open</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
    </div>
  )
}
