"use client"

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { format } from 'date-fns'
import { useLocation } from '@/lib/router'
import {
  CheckCircle2,
  Headphones,
  Loader2,
  MessageCircle,
  Paperclip,
  Send,
  TicketIcon,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { uploadImage as uploadImageToR2 } from '@/lib/media-upload'
import { formatINR } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { FacetFilter, matchesDateRange, matchesSelected, TableFilters, uniqueFilterOptions } from '@/components/table-filters'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { CourierOrderSummary } from '@/features/delivery-system/lib/data'
import { LiveChatPage } from '@/features/live-chat'

type TicketStatus = 'open' | 'in_progress' | 'solved' | 'closed'
type TicketPriority = 'low' | 'medium' | 'high'

type VendorSummary = {
  business_name?: string | null
  email?: string | null
  name?: string | null
}

type DeliveryTicketMessage = {
  createdAt?: string
  images?: string[]
  message: string
  sender_role: 'vendor' | 'admin'
}

type DeliveryTicket = {
  _id: string
  createdAt?: string
  description: string
  messages?: DeliveryTicketMessage[]
  priority: TicketPriority
  images?: string[]
  related_order?: {
    customer_name?: string
    customer_phone?: string
    created_at?: string
    order_id?: string
    order_number?: string
    pincode?: string
    source?: string
    status?: string
    tracking_code?: string
  }
  status: TicketStatus
  subject: string
  unread_by_admin?: boolean
  unread_by_vendor?: boolean
  updatedAt?: string
  vendor_id?: string | VendorSummary | null
}

const STATUS_OPTIONS: Array<{ label: string; value: 'all' | TicketStatus }> = [
  { label: 'All status', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'In progress', value: 'in_progress' },
  { label: 'Solved', value: 'solved' },
  { label: 'Closed', value: 'closed' },
]

const PRIORITY_OPTIONS: Array<{ label: string; value: TicketPriority }> = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
]

const formatStatusLabel = (status: TicketStatus) =>
  status === 'in_progress'
    ? 'In progress'
    : status[0].toUpperCase() + status.slice(1)

const formatDateTime = (value?: string) => {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return format(parsed, 'dd MMM yyyy, h:mm a')
}

const getVendorLabel = (value: DeliveryTicket['vendor_id']) => {
  if (value && typeof value === 'object') {
    return String(value.business_name || value.name || value.email || 'Vendor')
  }
  return String(value || 'Vendor')
}

const getStatusClassName = (status: TicketStatus) =>
  ({
    closed: 'border-slate-200 bg-slate-100 text-slate-600',
    in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
    open: 'border-border bg-muted text-foreground',
    solved: 'border-blue-200 bg-blue-50 text-blue-700',
  })[status]

const getPriorityClassName = (priority: TicketPriority) =>
  ({
    high: 'border-rose-200 bg-rose-50 text-rose-700',
    low: 'border-slate-200 bg-slate-100 text-slate-600',
    medium: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  })[priority]

const getTrackingCode = (order: CourierOrderSummary) =>
  order.shadowfax?.tracking_number ||
  order.shadowfax?.order_id ||
  order.delhivery?.waybill ||
  order.delhivery?.waybills?.[0] ||
  order.externalDeliveryId ||
  ''

const uploadImagesToCloudinary = async (files: File[], folder: string) => {
  if (!files.length) return []
  const urls = await Promise.all(files.map((file) => uploadImageToR2(file, folder)))
  return urls.filter(Boolean) as string[]
}

function SelectedMediaPreview({
  files,
  onRemove,
}: {
  files: File[]
  onRemove: (index: number) => void
}) {
  const previews = useMemo(
    () =>
      files.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    [files]
  )

  useEffect(
    () => () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url))
    },
    [previews]
  )

  if (!files.length) return null

  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      {previews.map((preview, index) => (
        <div
          key={`${preview.name}-${index}`}
          className='flex items-center gap-3 rounded-[8px] border border-slate-200 bg-white p-2'
        >
          <img
            src={preview.url}
            alt={preview.name}
            className='h-14 w-14 rounded-[6px] object-cover'
          />
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-semibold text-slate-800'>
              {preview.name}
            </p>
            <p className='text-xs text-slate-500'>
              {(files[index].size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            type='button'
            aria-label='Remove media'
            onClick={() => onRemove(index)}
            className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600'
          >
            <X className='h-4 w-4' />
          </button>
        </div>
      ))}
    </div>
  )
}

export function DeliverySupportPanel({
  isAdmin,
  isVendor,
  orders,
  ordersLoading,
}: {
  isAdmin: boolean
  isVendor: boolean
  orders: CourierOrderSummary[]
  ordersLoading: boolean
}) {
  const searchStr = useLocation({ select: (location) => location.searchStr })
  const [activeMode, setActiveMode] = useState<'tickets' | 'chat'>('tickets')
  const [tickets, setTickets] = useState<DeliveryTicket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [ticketSearch, setTicketSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [ticketStatuses, setTicketStatuses] = useState<string[]>([])
  const [priorities, setPriorities] = useState<string[]>([])
  const toggleTicket = (setter: (value: string[]) => void, selected: string[], value: string) =>
    setter(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [createFiles, setCreateFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<DeliveryTicket | null>(
    null
  )
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [replyFiles, setReplyFiles] = useState<File[]>([])
  const [replying, setReplying] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  )

  const visibleTickets = useMemo(() => {
    const query = ticketSearch.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (!matchesDateRange(ticket.updatedAt || ticket.createdAt, dateFrom, dateTo)) return false
      if (!matchesSelected(ticketStatuses, ticket.status)) return false
      if (!matchesSelected(priorities, ticket.priority)) return false
      if (!query) return true
      return [
        ticket._id,
        ticket.subject,
        ticket.description,
        ticket.related_order?.order_number,
        ticket.related_order?.customer_name,
        getVendorLabel(ticket.vendor_id),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [dateFrom, dateTo, priorities, ticketSearch, ticketStatuses, tickets])

  const stats = useMemo(
    () => ({
      closed: tickets.filter((ticket) => ticket.status === 'closed').length,
      inProgress: tickets.filter((ticket) => ticket.status === 'in_progress')
        .length,
      open: tickets.filter((ticket) => ticket.status === 'open').length,
      solved: tickets.filter((ticket) => ticket.status === 'solved').length,
      total: tickets.length,
      unread: tickets.filter((ticket) =>
        isAdmin ? ticket.unread_by_admin : ticket.unread_by_vendor
      ).length,
    }),
    [isAdmin, tickets]
  )

  const loadTickets = async () => {
    setLoadingTickets(true)
    try {
      const rows: DeliveryTicket[] = []
      let page = 1
      let totalPages = 1
      do {
        const response = await api.get<{
          tickets?: DeliveryTicket[]
          pagination?: { totalPages?: number }
        }>('/tickets', {
          params: { support_context: 'delivery', page, limit: 100 },
        })
        rows.push(
          ...(Array.isArray(response.data?.tickets) ? response.data.tickets : [])
        )
        totalPages = Number(response.data?.pagination?.totalPages || 1)
        page += 1
      } while (page <= totalPages)
      setTickets(rows)
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Failed to load delivery tickets'
      )
    } finally {
      setLoadingTickets(false)
    }
  }

  const loadTicketDetails = async (ticketId: string) => {
    setDetailsLoading(true)
    try {
      const response = await api.get<{ ticket?: DeliveryTicket }>(
        `/tickets/${ticketId}`
      )
      setSelectedTicket(response.data?.ticket || null)
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Failed to load ticket details'
      )
    } finally {
      setDetailsLoading(false)
    }
  }

  useEffect(() => {
    void loadTickets()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(searchStr)
    const ticketId = params.get('ticketId')
    const raiseTicketOrderId = params.get('raiseTicketOrderId')
    if (raiseTicketOrderId && isVendor) {
      setSelectedOrderId(raiseTicketOrderId)
      setCreateOpen(true)
    }
    if (!ticketId) return
    void loadTicketDetails(ticketId)
  }, [isVendor, searchStr])

  const resetCreateForm = () => {
    setSelectedOrderId('')
    setSubject('')
    setDescription('')
    setPriority('medium')
    setCreateFiles([])
  }

  const handleCreateFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCreateFiles((current) => [
      ...current,
      ...Array.from(event.target.files || []),
    ])
    event.target.value = ''
  }

  const handleReplyFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    setReplyFiles((current) => [
      ...current,
      ...Array.from(event.target.files || []),
    ])
    event.target.value = ''
  }

  const handleCreateTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isVendor) return
    if (!selectedOrder) {
      toast.error('Select an order before raising a delivery ticket')
      return
    }
    if (!subject.trim() || !description.trim()) {
      toast.error('Subject and description are required')
      return
    }

    setCreating(true)
    try {
      const images = await uploadImagesToCloudinary(
        createFiles,
        'support_tickets'
      )
      const response = await api.post<{ ticket?: DeliveryTicket }>('/tickets', {
        description: description.trim(),
        images,
        priority,
        related_order: {
          customer_name: selectedOrder.customerName,
          customer_phone: selectedOrder.customerPhone,
          created_at: selectedOrder.createdAt,
          order_id: selectedOrder.id,
          order_number: selectedOrder.orderNumber,
          pincode: selectedOrder.pincode,
          source: selectedOrder.source,
          status: selectedOrder.status,
          tracking_code: getTrackingCode(selectedOrder),
        },
        subject: subject.trim(),
        support_context: 'delivery',
      })

      toast.success('Delivery support ticket created')
      resetCreateForm()
      setCreateOpen(false)
      await loadTickets()
      if (response.data?.ticket) {
        setSelectedTicket(response.data.ticket)
        await loadTicketDetails(response.data.ticket._id)
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to create ticket')
    } finally {
      setCreating(false)
    }
  }

  const handleReply = async () => {
    if (!selectedTicket || (!reply.trim() && !replyFiles.length)) {
      toast.error('Reply message or media is required')
      return
    }

    setReplying(true)
    try {
      const images = await uploadImagesToCloudinary(
        replyFiles,
        'support_tickets'
      )
      await api.post(`/tickets/${selectedTicket._id}/reply`, {
        images,
        message: reply.trim(),
      })
      setReply('')
      setReplyFiles([])
      await Promise.all([loadTicketDetails(selectedTicket._id), loadTickets()])
      toast.success('Reply sent')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to send reply')
    } finally {
      setReplying(false)
    }
  }

  const handleStatusChange = async (nextStatus: TicketStatus) => {
    if (!selectedTicket || !isAdmin) return
    setUpdatingStatus(true)
    try {
      await api.patch(`/tickets/${selectedTicket._id}/status`, {
        status: nextStatus,
      })
      await Promise.all([loadTicketDetails(selectedTicket._id), loadTickets()])
      toast.success('Ticket status updated')
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Failed to update ticket status'
      )
    } finally {
      setUpdatingStatus(false)
    }
  }

  return (
    <section className='space-y-5'>
      <div className='rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between'>
          <div>
            <h1 className='text-lg font-semibold text-slate-950'>
              {isAdmin ? 'Delivery Support Admin' : 'Delivery Support'}
            </h1>
            {/* <p className='mt-2 max-w-3xl text-sm text-slate-500'>
              {isAdmin
                ? 'Review delivery tickets, reply to vendors, update status, and handle live delivery chats from this workspace.'
                : 'Raise order-specific delivery tickets and continue the conversation with support without leaving the delivery system.'}
            </p> */}
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant={activeMode === 'tickets' ? 'default' : 'outline'}
              className='h-11 rounded-[6px]'
              onClick={() => setActiveMode('tickets')}
            >
              <TicketIcon className='h-4 w-4' />
              Tickets
            </Button>
            <Button
              variant={activeMode === 'chat' ? 'default' : 'outline'}
              className='h-11 rounded-[6px]'
              onClick={() => setActiveMode('chat')}
            >
              <MessageCircle className='h-4 w-4' />
              Live Chat
            </Button>
            {isVendor ? (
              <Button
                className='h-11 rounded-[6px] bg-primary text-white hover:bg-primary/90'
                onClick={() => setCreateOpen(true)}
              >
                <TicketIcon className='h-4 w-4' />
                Raise Ticket
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {activeMode === 'chat' ? (
        <div className='overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm'>
          <LiveChatPage />
        </div>
      ) : (
        <>
          <div className='grid gap-4 md:grid-cols-3 xl:grid-cols-6'>
            {[
              ['Total', stats.total],
              ['Open', stats.open],
              ['In progress', stats.inProgress],
              ['Solved', stats.solved],
              ['Closed', stats.closed],
              ['Unread', stats.unread],
            ].map(([label, value]) => (
              <div
                key={label}
                className='rounded-[10px] border border-slate-200 bg-white p-4 shadow-sm'
              >
                <p className='text-xs font-bold tracking-[0.12em] text-slate-500 uppercase'>
                  {label}
                </p>
                <p className='mt-3 text-lg font-semibold text-slate-950'>
                  {value}
                </p>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
              <CardTitle>
                {isAdmin ? 'All Delivery Tickets' : 'My Delivery Tickets'}
              </CardTitle>
              <TableFilters
                search={ticketSearch}
                onSearchChange={setTicketSearch}
                placeholder="Search ticket, order, vendor"
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                active={Boolean(ticketSearch || dateFrom || dateTo || ticketStatuses.length || priorities.length)}
                onReset={() => { setTicketSearch(''); setDateFrom(''); setDateTo(''); setTicketStatuses([]); setPriorities([]) }}
              >
                <FacetFilter title="Status" options={uniqueFilterOptions(tickets.map((ticket) => ticket.status))} selected={ticketStatuses} onToggle={(value) => toggleTicket(setTicketStatuses, ticketStatuses, value)} onClear={() => setTicketStatuses([])} />
                <FacetFilter title="Priority" options={uniqueFilterOptions(tickets.map((ticket) => ticket.priority))} selected={priorities} onToggle={(value) => toggleTicket(setPriorities, priorities, value)} onClear={() => setPriorities([])} />
              </TableFilters>
            </CardHeader>
            <CardContent className='space-y-4'>
            <p className='text-sm text-muted-foreground'>{visibleTickets.length} tickets showing</p>

            {loadingTickets ? (
              <div className='flex h-64 items-center justify-center text-slate-500'>
                <Loader2 className='mr-2 h-5 w-5 animate-spin' />
                Loading delivery tickets...
              </div>
            ) : visibleTickets.length === 0 ? (
              <div className='flex h-64 flex-col items-center justify-center text-center text-slate-500'>
                <Headphones className='h-10 w-10 text-slate-400' />
                <p className='mt-3 text-sm font-semibold'>
                  No delivery tickets found
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className='text-right'>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleTickets.map((ticket) => (
                    <TableRow
                      key={ticket._id}
                      className='cursor-pointer'
                      onClick={() => void loadTicketDetails(ticket._id)}
                    >
                      <TableCell>
                        <p className='font-medium'>{ticket.subject}</p>
                        <p className='text-muted-foreground line-clamp-1 text-xs'>
                          {ticket.description}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p>{ticket.related_order?.order_number || 'No order linked'}</p>
                        <p className='text-muted-foreground text-xs'>
                          {ticket.related_order?.customer_name || 'Customer not available'}
                        </p>
                      </TableCell>
                      <TableCell className='capitalize'>{formatStatusLabel(ticket.status)}</TableCell>
                      <TableCell>{formatDateTime(ticket.updatedAt || ticket.createdAt)}</TableCell>
                      <TableCell className='text-right'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={(event) => {
                            event.stopPropagation()
                            void loadTicketDetails(ticket._id)
                          }}
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className='max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Raise delivery support ticket</DialogTitle>
            <DialogDescription>
              Select the delivery order first, then describe the issue.
            </DialogDescription>
          </DialogHeader>
          <form className='space-y-4' onSubmit={handleCreateTicket}>
            <label className='block space-y-1.5'>
              <span className='text-sm font-semibold text-slate-700'>
                Order
              </span>
              <Select
                value={selectedOrderId}
                onValueChange={setSelectedOrderId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      ordersLoading
                        ? 'Loading orders...'
                        : 'Choose delivery order'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((order) => (
                    <SelectItem
                      key={`${order.source}-${order.id}`}
                      value={order.id}
                    >
                      {order.orderNumber} | {order.customerName || 'Customer'} |{' '}
                      {formatINR(order.total)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {selectedOrder ? (
              <div className='rounded-[10px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600'>
                <div className='grid gap-x-4 gap-y-3 sm:grid-cols-2'>
                  {[
                    ['Customer', selectedOrder.customerName || 'Not available'],
                    ['Pincode', selectedOrder.pincode || 'Not available'],
                    ['Status', selectedOrder.status || 'Not available'],
                    ['Created', formatDateTime(selectedOrder.createdAt)],
                    ['Tracking', getTrackingCode(selectedOrder) || 'Not created'],
                  ].map(([label, value]) => (
                    <div key={label} className='min-w-0'>
                      <span className='block text-[10px] font-bold text-slate-500 uppercase tracking-wider'>
                        {label}
                      </span>
                      <span className='block break-all font-semibold text-slate-900'>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className='grid gap-4 md:grid-cols-[minmax(0,1fr)_170px]'>
              <label className='block space-y-1.5'>
                <span className='text-sm font-semibold text-slate-700'>
                  Subject
                </span>
                <Input
                  placeholder='Example: Pickup delayed for this order'
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </label>
              <label className='block space-y-1.5'>
                <span className='text-sm font-semibold text-slate-700'>
                  Priority
                </span>
                <Select
                  value={priority}
                  onValueChange={(value) =>
                    setPriority(value as TicketPriority)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <label className='block space-y-1.5'>
              <span className='text-sm font-semibold text-slate-700'>
                Issue details
              </span>
              <Textarea
                rows={5}
                placeholder='Share the exact delivery issue, expected action, and any courier response.'
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <div className='space-y-3 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 p-4'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <p className='text-sm font-semibold text-slate-800'>
                    Upload media
                  </p>
                  <p className='text-xs text-slate-500'>
                    Add screenshots or delivery proof images.
                  </p>
                </div>
                <Button asChild type='button' variant='outline' size='sm'>
                  <label className='cursor-pointer'>
                    <Paperclip className='h-4 w-4' />
                    Add media
                    <input
                      type='file'
                      accept='image/*'
                      multiple
                      className='hidden'
                      onChange={handleCreateFilesChange}
                    />
                  </label>
                </Button>
              </div>
              <SelectedMediaPreview
                files={createFiles}
                onRemove={(index) =>
                  setCreateFiles((current) =>
                    current.filter((_, currentIndex) => currentIndex !== index)
                  )
                }
              />
            </div>

            <div className='flex justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                className='bg-primary text-white hover:bg-primary/90'
                disabled={creating}
              >
                {creating ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <TicketIcon className='h-4 w-4' />
                )}
                Create ticket
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedTicket)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTicket(null)
            setReply('')
          }
        }}
      >
        <DialogContent className='max-h-[88vh] w-full overflow-y-auto sm:max-w-2xl lg:max-w-5xl'>
          {selectedTicket ? (
            <div className='space-y-5'>
              <DialogHeader>
                <DialogTitle className='text-2xl'>
                  {selectedTicket.subject}
                </DialogTitle>
                <DialogDescription>
                  Ticket ID: {selectedTicket._id} | Updated{' '}
                  {formatDateTime(
                    selectedTicket.updatedAt || selectedTicket.createdAt
                  )}
                </DialogDescription>
              </DialogHeader>

              {detailsLoading ? (
                <div className='flex h-32 items-center justify-center text-slate-500'>
                  <Loader2 className='mr-2 h-5 w-5 animate-spin' />
                  Refreshing ticket...
                </div>
              ) : null}

              <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                <div className='rounded-[10px] border border-slate-200 p-4'>
                  <p className='text-xs font-bold tracking-[0.12em] text-slate-500 uppercase'>
                    Status
                  </p>
                  <div className='mt-2'>
                    {isAdmin ? (
                      <Select
                        value={selectedTicket.status}
                        onValueChange={(value) =>
                          void handleStatusChange(value as TicketStatus)
                        }
                        disabled={updatingStatus}
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.filter(
                            (option) => option.value !== 'all'
                          ).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant='outline'
                        className={getStatusClassName(selectedTicket.status)}
                      >
                        {formatStatusLabel(selectedTicket.status)}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className='rounded-[10px] border border-slate-200 p-4'>
                  <p className='text-xs font-bold tracking-[0.12em] text-slate-500 uppercase'>
                    Priority
                  </p>
                  <div className='mt-2'>
                    <Badge
                      variant='outline'
                      className={getPriorityClassName(selectedTicket.priority)}
                    >
                      {selectedTicket.priority}
                    </Badge>
                  </div>
                </div>
                <div className='rounded-[10px] border border-slate-200 p-4'>
                  <p className='text-xs font-bold tracking-[0.12em] text-slate-500 uppercase'>
                    Vendor
                  </p>
                  <p className='mt-2 break-all text-sm font-semibold text-slate-900'>
                    {getVendorLabel(selectedTicket.vendor_id)}
                  </p>
                </div>
              </div>

              <div className='rounded-[10px] border border-slate-200 bg-slate-50 p-4'>
                <div className='flex items-center gap-2 text-sm font-bold text-slate-950'>
                  <CheckCircle2 className='h-4 w-4 text-foreground' />
                  Linked delivery order
                </div>
                <div className='mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3'>
                  {[
                    ['Order', selectedTicket.related_order?.order_number || 'Not linked'],
                    ['Customer', selectedTicket.related_order?.customer_name || 'Not available'],
                    ['Phone', selectedTicket.related_order?.customer_phone || 'Not available'],
                    ['Created', formatDateTime(selectedTicket.related_order?.created_at)],
                    ['Pincode', selectedTicket.related_order?.pincode || 'Not available'],
                    ['Status', selectedTicket.related_order?.status || 'Not available'],
                    ['Tracking', selectedTicket.related_order?.tracking_code || 'Not created'],
                  ].map(([label, value]) => (
                    <div key={label} className='min-w-0'>
                      <span className='block text-[10px] font-bold text-slate-500 uppercase tracking-wider'>
                        {label}
                      </span>
                      <span className='block break-all font-semibold text-slate-900'>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='rounded-[10px] border border-slate-200 p-4'>
                <p className='text-sm font-bold text-slate-950'>Conversation</p>
                <div className='mt-4 space-y-3'>
                  {(selectedTicket.messages?.length
                    ? selectedTicket.messages
                    : [
                        {
                          createdAt: selectedTicket.createdAt,
                          images: selectedTicket.images,
                          message: selectedTicket.description,
                          sender_role: 'vendor' as const,
                        },
                      ]
                  ).map((message, index) => (
                    <div
                      key={`${message.createdAt || ''}-${index}`}
                      className={`rounded-[10px] border p-4 ${
                        message.sender_role === 'admin'
                          ? 'border-border bg-muted/50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <p className='text-sm font-bold text-slate-950'>
                          {message.sender_role === 'admin'
                            ? 'Admin Support'
                            : 'Vendor'}
                        </p>
                        <p className='text-xs text-slate-500'>
                          {formatDateTime(message.createdAt)}
                        </p>
                      </div>
                      <p className='mt-2 text-sm leading-6 whitespace-pre-wrap text-slate-600'>
                        {message.message}
                      </p>
                      {message.images?.length ? (
                        <div className='mt-3 flex flex-wrap gap-2'>
                          {message.images.map((image, imageIndex) => (
                            <a
                              key={`${image}-${imageIndex}`}
                              href={image}
                              target='_blank'
                              rel='noreferrer'
                              className='block overflow-hidden rounded-[8px] border border-slate-200'
                            >
                              <img
                                src={image}
                                alt='Ticket media'
                                className='h-20 w-20 object-cover'
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className='rounded-[10px] border border-slate-200 p-4'>
                <p className='text-sm font-bold text-slate-950'>
                  Continue conversation
                </p>
                <Textarea
                  className='mt-3'
                  rows={4}
                  placeholder='Type your reply...'
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                />
                <div className='mt-3 space-y-3 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 p-3'>
                  <div className='flex flex-wrap items-center justify-between gap-3'>
                    <p className='text-sm font-semibold text-slate-800'>
                      Reply media
                    </p>
                    <Button asChild type='button' variant='outline' size='sm'>
                      <label className='cursor-pointer'>
                        <Paperclip className='h-4 w-4' />
                        Add media
                        <input
                          type='file'
                          accept='image/*'
                          multiple
                          className='hidden'
                          onChange={handleReplyFilesChange}
                        />
                      </label>
                    </Button>
                  </div>
                  <SelectedMediaPreview
                    files={replyFiles}
                    onRemove={(index) =>
                      setReplyFiles((current) =>
                        current.filter(
                          (_, currentIndex) => currentIndex !== index
                        )
                      )
                    }
                  />
                </div>
                <div className='mt-3 flex justify-end'>
                  <Button
                    className='rounded-[6px] bg-primary text-white hover:bg-primary/90'
                    onClick={() => void handleReply()}
                    disabled={replying || (!reply.trim() && !replyFiles.length)}
                  >
                    {replying ? (
                      <Loader2 className='h-4 w-4 animate-spin' />
                    ) : (
                      <Send className='h-4 w-4' />
                    )}
                    Send reply
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
