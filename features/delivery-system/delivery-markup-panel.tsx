"use client"

import { Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import api from '@/lib/axios'
import { formatINR } from '@/lib/currency'
import type { RootState } from '@/store'

type Markup = {
  partner_id: 'delhivery' | 'shadowfax'
  markup_type: 'percentage' | 'fixed'
  markup_value: string
  active: boolean
}

type HistoryRow = {
  _id?: string
  partner_id?: string
  order_number?: string
  actual_price?: number
  hiked_price?: number
  markup_type?: string
  markup_value?: number
  createdAt?: string
}

type SavedMarkup = Partial<Markup> & {
  partner_id?: string
  markup_value?: number | string | null
}

type ApiError = {
  response?: {
    data?: {
      message?: string
    }
  }
}

const defaultMarkups: Markup[] = [
  {
    partner_id: 'delhivery',
    markup_type: 'percentage',
    markup_value: '',
    active: true,
  },
  {
    partner_id: 'shadowfax',
    markup_type: 'percentage',
    markup_value: '',
    active: true,
  },
]

const partnerLabels: Record<Markup['partner_id'], string> = {
  delhivery: 'Delhivery',
  shadowfax: 'Shadowfax',
}

const getErrorMessage = (error: unknown, fallback: string) =>
  (error as ApiError)?.response?.data?.message || fallback

export function DeliveryMarkupPanel() {
  const role = String(
    useSelector((state: RootState) => state.auth.user?.role) || ''
  ).toLowerCase()
  const isSuperAdmin = role === 'superadmin'
  const [markups, setMarkups] = useState<Markup[]>(defaultMarkups)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)

  const byPartner = useMemo(
    () => new Map(markups.map((entry) => [entry.partner_id, entry])),
    [markups]
  )

  const load = useCallback(async () => {
    if (!isSuperAdmin) return
    setLoading(true)
    try {
      const [markupRes, historyRes] = await Promise.all([
        api.get('/delivery-markup'),
        api.get('/delivery-markup/history'),
      ])
      const rows = Array.isArray(markupRes?.data?.markups)
        ? markupRes.data.markups
        : []
      setMarkups(
        defaultMarkups.map((entry) => {
          const saved = (rows as SavedMarkup[]).find(
            (row) => row.partner_id === entry.partner_id
          )
          return {
            ...entry,
            ...(saved || {}),
            markup_value:
              saved?.markup_value === undefined || saved?.markup_value === null
                ? ''
                : String(saved.markup_value),
          }
        })
      )
      setHistory(
        Array.isArray(historyRes?.data?.history) ? historyRes.data.history : []
      )
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to load delivery markup'))
    } finally {
      setLoading(false)
    }
  }, [isSuperAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const updateMarkup = (
    partnerId: Markup['partner_id'],
    patch: Partial<Markup>
  ) => {
    setMarkups((current) =>
      current.map((entry) =>
        entry.partner_id === partnerId ? { ...entry, ...patch } : entry
      )
    )
  }

  const save = async () => {
    setLoading(true)
    try {
      await api.post('/delivery-markup', {
        markups: markups.map((entry) => ({
          ...entry,
          markup_value:
            entry.markup_value === '' ? 0 : Number(entry.markup_value),
        })),
      })
      toast.success('Delivery markup updated')
      await load()
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to save delivery markup'))
    } finally {
      setLoading(false)
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className='rounded-[6px] border border-slate-200 bg-white p-6 text-sm font-medium text-slate-500 shadow-sm'>
        Only super admin accounts can manage delivery white-label pricing.
      </div>
    )
  }

  return (
    <div className='space-y-5 pb-10'>
      <div className='rounded-[6px] border border-slate-200 bg-white p-5 shadow-sm'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-lg font-semibold text-slate-950'>
              Delivery White Label Pricing
            </h1>
            <p className='mt-2 text-sm text-slate-500'>
              Configure the extra amount vendors see for Delhivery and
              Shadowfax courier assignment.
            </p>
          </div>
          <Button
            className='h-12 rounded-[6px] px-6'
            disabled={loading}
            onClick={save}
          >
            <Save className='h-4 w-4' />
            Save
          </Button>
        </div>
      </div>

      <div className='grid gap-5 xl:grid-cols-2'>
        {defaultMarkups.map((item) => {
          const markup = byPartner.get(item.partner_id) || item
          return (
            <div
              key={item.partner_id}
              className='rounded-[6px] border border-slate-200 bg-white p-6 shadow-sm'
            >
              <div className='flex items-start justify-between gap-4'>
                <div>
                  <h2 className='text-xl font-semibold text-slate-950'>
                    {partnerLabels[item.partner_id]}
                  </h2>
                  <p className='mt-2 max-w-sm text-sm text-slate-500'>
                    This markup is added only to the vendor-facing courier price.
                  </p>
                </div>
                <label className='flex items-center gap-2 text-sm font-semibold text-slate-600'>
                  <input
                    type='checkbox'
                    checked={markup.active}
                    onChange={(event) =>
                      updateMarkup(item.partner_id, {
                        active: event.target.checked,
                      })
                    }
                  />
                  Active
                </label>
              </div>
              <div className='mt-8 grid gap-4 md:grid-cols-[minmax(180px,0.8fr)_1fr]'>
                <label className='space-y-2'>
                  <span className='text-xs font-bold tracking-[0.14em] text-slate-500 uppercase'>
                    Type
                  </span>
                  <select
                    className='h-12 w-full rounded-[6px] border border-slate-200 bg-white px-3 text-sm outline-none focus-visible:border-ring'
                    value={markup.markup_type}
                    onChange={(event) =>
                      updateMarkup(item.partner_id, {
                        markup_type: event.target.value as Markup['markup_type'],
                      })
                    }
                  >
                    <option value='percentage'>Percentage</option>
                    <option value='fixed'>Fixed amount</option>
                  </select>
                </label>
                <label className='space-y-2'>
                  <span className='text-xs font-bold tracking-[0.14em] text-slate-500 uppercase'>
                    {markup.markup_type === 'fixed' ? 'Amount' : 'Percent'}
                  </span>
                  <div className='flex h-12 items-center rounded-[6px] border border-slate-200 bg-white focus-within:border-teal-500'>
                    <span className='border-r border-slate-200 px-4 text-sm font-semibold text-slate-500'>
                      {markup.markup_type === 'fixed' ? '₹' : '%'}
                    </span>
                    <input
                      className='h-full min-w-0 flex-1 bg-transparent px-4 text-sm outline-none'
                      inputMode='decimal'
                      placeholder='0'
                      value={markup.markup_value}
                      onChange={(event) => {
                        const value = event.target.value.replace(/[^\d.]/g, '')
                        updateMarkup(item.partner_id, { markup_value: value })
                      }}
                    />
                  </div>
                </label>
              </div>
            </div>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
          <CardDescription>
            Super-admin view of actual courier price and vendor-facing marked-up
            price.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Vendor price</TableHead>
                <TableHead>Markup</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((row) => (
                <TableRow key={row._id || `${row.order_number}-${row.createdAt}`}>
                  <TableCell className='capitalize'>{row.partner_id || 'all'}</TableCell>
                  <TableCell>{row.order_number || 'Not available'}</TableCell>
                  <TableCell className='font-medium'>{formatINR(Number(row.actual_price || 0))}</TableCell>
                  <TableCell>{formatINR(Number(row.hiked_price || 0))}</TableCell>
                  <TableCell>
                    {row.markup_type === 'fixed'
                      ? formatINR(Number(row.markup_value || 0))
                      : `${row.markup_value || 0}%`}
                  </TableCell>
                  <TableCell>
                    {row.createdAt
                      ? new Date(row.createdAt).toLocaleString('en-IN')
                      : 'Not available'}
                  </TableCell>
                </TableRow>
              ))}
              {!history.length ? (
                <TableRow>
                  <TableCell className='text-muted-foreground' colSpan={6}>
                    No price history yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
