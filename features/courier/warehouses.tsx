"use client"

import { useNavigate } from '@/lib/router'
import { LoaderCircle, MapPin, Plus, Warehouse } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { FacetFilter, matchesDateRange, matchesSearch, matchesSelected, TableFilters, uniqueFilterOptions } from '@/components/table-filters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  createDelhiveryWarehouse,
  createShadowfaxWarehouse,
  fetchCourierWarehouses,
  updateDelhiveryWarehouse,
  updateShadowfaxWarehouse,
  type CourierWarehouse,
} from '@/features/delivery-system/lib/api'
import { IndianStateSelect } from '@/features/delivery-system/components/indian-state-select'
import type { RootState } from '@/store'

type WarehouseForm = {
  name: string
  registered_name: string
  phone: string
  email: string
  address: string
  city: string
  pin: string
  country: string
  return_address: string
  return_city: string
  return_pin: string
  return_state: string
  return_country: string
  working_days: string[]
}

type ShadowfaxWarehouseForm = {
  name: string
  contact: string
  email: string
  address_line_1: string
  address_line_2: string
  city: string
  state: string
  pincode: string
  latitude: string
  longitude: string
  unique_code: string
  working_days: string[]
}

const readText = (value: unknown) => String(value ?? '').trim()

const defaultForm: WarehouseForm = {
  name: '',
  registered_name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  pin: '',
  country: 'India',
  return_address: '',
  return_city: '',
  return_pin: '',
  return_state: '',
  return_country: 'India',
  working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}

const defaultShadowfaxForm: ShadowfaxWarehouseForm = {
  name: '',
  contact: '',
  email: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state: '',
  pincode: '',
  latitude: '',
  longitude: '',
  unique_code: '',
  working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}

const WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const toggleDay = (days: string[], day: string) =>
  days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day]

const greenButtonClass = 'bg-primary text-white hover:bg-primary/90'
const greenOutlineButtonClass =
  'border-primary text-foreground hover:bg-muted hover:text-emerald-800'
const activeDayClass = 'border-primary bg-primary text-white hover:bg-primary/90'
const inactiveDayClass = 'border-border bg-background text-foreground hover:bg-muted'

const buildShadowfaxPayload = (form: ShadowfaxWarehouseForm) => ({
  ...form,
  latitude: readText(form.latitude) || undefined,
  longitude: readText(form.longitude) || undefined,
})

export function CourierWarehouseManagePage() {
  const navigate = useNavigate()
  const user = useSelector((state: RootState) => state.auth?.user)
  const role = String(user?.role || '').toLowerCase()
  const isVendor = role === 'vendor'

  useEffect(() => {
    if (user && !isVendor) {
      void navigate({ to: '/' })
    }
  }, [isVendor, navigate, user])

  const [warehouses, setWarehouses] = useState<CourierWarehouse[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState<'create' | 'edit' | ''>('')
  const [createProvider, setCreateProvider] = useState<'delhivery' | 'shadowfax' | ''>('')
  const [createForm, setCreateForm] = useState<WarehouseForm>(defaultForm)
  const [shadowfaxForm, setShadowfaxForm] = useState<ShadowfaxWarehouseForm>(defaultShadowfaxForm)
  const [editForm, setEditForm] = useState<WarehouseForm>(defaultForm)
  const [editShadowfaxForm, setEditShadowfaxForm] = useState<ShadowfaxWarehouseForm>(defaultShadowfaxForm)
  const [selected, setSelected] = useState<CourierWarehouse | null>(null)
  const [returnSameAsAbove, setReturnSameAsAbove] = useState(false)

  const loadWarehouses = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetchCourierWarehouses()
      setWarehouses(response)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load warehouses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWarehouses()
  }, [loadWarehouses])

  useEffect(() => {
    const refresh = () => void loadWarehouses()
    window.addEventListener('delivery-workspace-refresh', refresh)
    return () => window.removeEventListener('delivery-workspace-refresh', refresh)
  }, [loadWarehouses])

  const orderedWarehouses = useMemo(
    () =>
      [...warehouses].sort((a, b) => {
        const aTime = new Date(a.updatedAt || 0).getTime()
        const bTime = new Date(b.updatedAt || 0).getTime()
        return bTime - aTime
      }),
    [warehouses]
  )
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [providers, setProviders] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [pins, setPins] = useState<string[]>([])
  const toggleWarehouse = (setter: (value: string[]) => void, selected: string[], value: string) =>
    setter(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  const visibleWarehouses = useMemo(
    () => orderedWarehouses.filter((warehouse) =>
      matchesSelected(providers, warehouse.provider === 'shadowfax' ? 'Shadowfax' : 'Delhivery') &&
      matchesSelected(cities, warehouse.city || 'No city') &&
      matchesSelected(pins, warehouse.pin || 'No pin') &&
      matchesDateRange(warehouse.updatedAt, dateFrom, dateTo) &&
      matchesSearch(warehouseSearch, [warehouse.name, warehouse.phone, warehouse.address, warehouse.pin])
    ),
    [cities, dateFrom, dateTo, orderedWarehouses, pins, providers, warehouseSearch]
  )

  const onCreate = async () => {
    if (createProvider === 'shadowfax') {
      if (!readText(shadowfaxForm.name)) return toast.error('Warehouse name is required')
      if (!readText(shadowfaxForm.contact)) return toast.error('Contact is required')
      if (!readText(shadowfaxForm.address_line_1)) return toast.error('Address line 1 is required')
      if (!readText(shadowfaxForm.city)) return toast.error('City is required')
      if (!readText(shadowfaxForm.state)) return toast.error('State is required')
      if (!readText(shadowfaxForm.pincode)) return toast.error('Pincode is required')
      if (!readText(shadowfaxForm.unique_code)) return toast.error('Shadowfax unique code is required')

      try {
        setBusy('create')
        await createShadowfaxWarehouse(buildShadowfaxPayload(shadowfaxForm))
        toast.success('Shadowfax warehouse created')
        setCreateOpen(false)
        setCreateProvider('')
        setShadowfaxForm(defaultShadowfaxForm)
        await loadWarehouses()
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Failed to create Shadowfax warehouse')
      } finally {
        setBusy('')
      }
      return
    }

    if (!readText(createForm.name)) return toast.error('Warehouse name is required')
    if (!readText(createForm.phone)) return toast.error('Phone is required')
    if (!readText(createForm.pin)) return toast.error('Pin is required')

    const payload = {
      ...createForm,
      return_address: returnSameAsAbove ? readText(createForm.address) : readText(createForm.return_address),
      return_city: returnSameAsAbove ? readText(createForm.city) : readText(createForm.return_city),
      return_pin: returnSameAsAbove ? readText(createForm.pin) : readText(createForm.return_pin),
      return_state: returnSameAsAbove ? readText(createForm.return_state) : readText(createForm.return_state),
      return_country: returnSameAsAbove ? readText(createForm.country || 'India') : readText(createForm.return_country || 'India'),
      working_days: createForm.working_days,
    }

    if (!readText(payload.return_address)) return toast.error('Return address is required')
    if (!Array.isArray(payload.working_days) || payload.working_days.length === 0) {
      return toast.error('Select at least one working day')
    }

    try {
      setBusy('create')
      await createDelhiveryWarehouse(payload)
      toast.success('Delhivery warehouse created')
      setCreateOpen(false)
      setCreateProvider('')
      setCreateForm(defaultForm)
      setReturnSameAsAbove(false)
      await loadWarehouses()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create warehouse')
    } finally {
      setBusy('')
    }
  }

  const onEdit = async () => {
    if (!selected) return

    if (selected.provider === 'shadowfax') {
      try {
        setBusy('edit')
        await updateShadowfaxWarehouse(selected.id, buildShadowfaxPayload(editShadowfaxForm))
        toast.success('Shadowfax warehouse updated')
        setEditOpen(false)
        await loadWarehouses()
      } catch (err: any) {
        toast.error(err?.response?.data?.message || 'Failed to update Shadowfax warehouse')
      } finally {
        setBusy('')
      }
      return
    }

    if (!readText(editForm.address) && !readText(editForm.pin) && !readText(editForm.phone)) {
      return toast.error('Provide address, pin, or phone to update')
    }

    try {
      setBusy('edit')
      await updateDelhiveryWarehouse({
        name: selected.name,
        address: readText(editForm.address) || undefined,
        pin: readText(editForm.pin) || undefined,
        phone: readText(editForm.phone) || undefined,
        working_days: editForm.working_days,
      })
      toast.success('Delhivery warehouse updated')
      setEditOpen(false)
      await loadWarehouses()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update warehouse')
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <div className='space-y-5'>
        <Card>
          <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <CardTitle>Warehouses</CardTitle>
              <CardDescription>
                Create and edit vendor warehouses for Delhivery and Shadowfax.
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setCreateProvider('')
                setCreateOpen(true)
              }}
            >
              <Plus className='h-4 w-4' />
              Create Warehouse
            </Button>
          </CardHeader>
        </Card>

        <Card>
          <CardContent>
          <TableFilters
            search={warehouseSearch}
            onSearchChange={setWarehouseSearch}
            placeholder="Search name, phone, address"
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            active={Boolean(warehouseSearch || dateFrom || dateTo || providers.length || cities.length || pins.length)}
            onReset={() => { setWarehouseSearch(''); setDateFrom(''); setDateTo(''); setProviders([]); setCities([]); setPins([]) }}
          >
            <FacetFilter title="Provider" options={uniqueFilterOptions(orderedWarehouses.map((warehouse) => warehouse.provider === 'shadowfax' ? 'Shadowfax' : 'Delhivery'))} selected={providers} onToggle={(value) => toggleWarehouse(setProviders, providers, value)} onClear={() => setProviders([])} />
            <FacetFilter title="City" options={uniqueFilterOptions(orderedWarehouses.map((warehouse) => warehouse.city || 'No city'))} selected={cities} onToggle={(value) => toggleWarehouse(setCities, cities, value)} onClear={() => setCities([])} />
            <FacetFilter title="Pin" options={uniqueFilterOptions(orderedWarehouses.map((warehouse) => warehouse.pin || 'No pin'))} selected={pins} onToggle={(value) => toggleWarehouse(setPins, pins, value)} onClear={() => setPins([])} />
          </TableFilters>
          {loading ? (
            <div className='text-sm text-muted-foreground'>Loading warehouses...</div>
          ) : visibleWarehouses.length === 0 ? (
            <div className='rounded-md border border-dashed p-6 text-sm text-muted-foreground'>
              No warehouses found. Create your first warehouse.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Pin</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Working Days</TableHead>
                  <TableHead className='text-right'>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleWarehouses.map((warehouse) => (
                  <TableRow key={warehouse.id}>
                    <TableCell className='whitespace-nowrap'>{warehouse.updatedAt ? new Date(warehouse.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}</TableCell>
                    <TableCell className='whitespace-nowrap font-medium'>{warehouse.name}</TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {warehouse.provider === 'shadowfax' ? 'Shadowfax' : 'Delhivery'}
                      </Badge>
                    </TableCell>
                    <TableCell>{warehouse.phone || 'N/A'}</TableCell>
                    <TableCell>{warehouse.pin || 'N/A'}</TableCell>
                    <TableCell className='max-w-[320px] truncate whitespace-nowrap'>
                      {warehouse.address || 'N/A'}
                    </TableCell>
                    <TableCell className='max-w-[260px] truncate whitespace-nowrap'>
                      {Array.isArray(warehouse.working_days) && warehouse.working_days.length
                        ? warehouse.working_days.join(', ')
                        : 'N/A'}
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => {
                          setSelected(warehouse)
                          if (warehouse.provider === 'shadowfax') {
                            setEditShadowfaxForm({
                              ...defaultShadowfaxForm,
                              name: warehouse.name || '',
                              contact: warehouse.contact || warehouse.phone || '',
                              email: warehouse.email || '',
                              address_line_1: warehouse.address_line_1 || warehouse.address || '',
                              address_line_2: warehouse.address_line_2 || '',
                              city: warehouse.city || '',
                              state: warehouse.state || '',
                              pincode: warehouse.pincode || warehouse.pin || '',
                              latitude: warehouse.latitude || '',
                              longitude: warehouse.longitude || '',
                              unique_code: warehouse.unique_code || '',
                              working_days:
                                Array.isArray(warehouse.working_days) && warehouse.working_days.length
                                  ? warehouse.working_days
                                  : defaultShadowfaxForm.working_days,
                            })
                          } else {
                            setEditForm({
                              ...defaultForm,
                              name: warehouse.name || '',
                              address: warehouse.address || '',
                              pin: warehouse.pin || '',
                              phone: warehouse.phone || '',
                              working_days:
                                Array.isArray(warehouse.working_days) && warehouse.working_days.length
                                  ? warehouse.working_days
                                  : defaultForm.working_days,
                            })
                          }
                          setEditOpen(true)
                        }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setReturnSameAsAbove(false)
            setCreateProvider('')
          }
        }}
      >
        <DialogContent className='w-[min(96vw,860px)] max-h-[90vh] overflow-y-auto rounded-md'>
          <DialogHeader className='text-left'>
            <DialogTitle>
              {createProvider === 'shadowfax'
                ? 'Create Shadowfax Warehouse'
                : createProvider === 'delhivery'
                  ? 'Create Delhivery Warehouse'
                  : 'Choose Warehouse Provider'}
            </DialogTitle>
            <DialogDescription>
              {createProvider === 'shadowfax'
                ? 'Stores Shadowfax pickup details after checking the pincode with Shadowfax serviceability API.'
                : createProvider === 'delhivery'
                  ? 'Calls Delhivery create warehouse API and syncs the response.'
                  : 'Select the delivery app first. The form changes based on the provider API.'}
            </DialogDescription>
          </DialogHeader>
          {!createProvider ? (
            <div className='grid gap-3 sm:grid-cols-2'>
              <button
                type='button'
                className='rounded-md border border-sky-200 bg-sky-50 p-5 text-left hover:bg-sky-100'
                onClick={() => setCreateProvider('delhivery')}
              >
                <p className='text-lg font-semibold text-sky-900'>Delhivery</p>
               
              </button>
              <button
                type='button'
                className='rounded-md border border-orange-200 bg-orange-50 p-5 text-left hover:bg-orange-100'
                onClick={() => setCreateProvider('shadowfax')}
              >
                <p className='text-lg font-semibold text-orange-900'>Shadowfax</p>
                
              </button>
            </div>
          ) : createProvider === 'delhivery' ? (
            <div className='grid gap-3 sm:grid-cols-2'>
              <div><Label>Warehouse name*</Label><Input placeholder='Warehouse name*' value={createForm.name} onChange={(e) => setCreateForm((c) => ({ ...c, name: e.target.value }))} /></div>
              <div><Label>Registered name</Label><Input placeholder='Registered name' value={createForm.registered_name} onChange={(e) => setCreateForm((c) => ({ ...c, registered_name: e.target.value }))} /></div>
              <div><Label>Phone*</Label><Input placeholder='Phone*' value={createForm.phone} onChange={(e) => setCreateForm((c) => ({ ...c, phone: e.target.value }))} /></div>
              <div><Label>Email</Label><Input placeholder='Email' value={createForm.email} onChange={(e) => setCreateForm((c) => ({ ...c, email: e.target.value }))} /></div>
              <div className='sm:col-span-2'><Label>Address</Label><Textarea className='min-h-[78px] rounded-md' placeholder='Address' value={createForm.address} onChange={(e) => setCreateForm((c) => ({ ...c, address: e.target.value }))} /></div>
              <div><Label>City</Label><Input placeholder='City' value={createForm.city} onChange={(e) => setCreateForm((c) => ({ ...c, city: e.target.value }))} /></div>
              <div><Label>Pin*</Label><Input placeholder='Pin*' value={createForm.pin} onChange={(e) => setCreateForm((c) => ({ ...c, pin: e.target.value }))} /></div>
              <div><Label>Country</Label><Input placeholder='Country' value={createForm.country} onChange={(e) => setCreateForm((c) => ({ ...c, country: e.target.value }))} /></div>
              <div className='sm:col-span-2 space-y-2'>
                <Label className='mb-0'>Working Days</Label>
                <div className='flex flex-wrap gap-2'>
                  {WORKING_DAYS.map((day) => {
                    const active = createForm.working_days.includes(day)
                    return (
                      <button
                        key={day}
                        type='button'
                        onClick={() =>
                          setCreateForm((c) => ({ ...c, working_days: toggleDay(c.working_days, day) }))
                        }
                        className={`rounded-md border px-3 py-1.5 text-sm ${
                          active ? activeDayClass : inactiveDayClass
                        }`}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
              <label className='sm:col-span-2 flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  checked={returnSameAsAbove}
                  onChange={(e) => setReturnSameAsAbove(e.target.checked)}
                />
                Return as same above address
              </label>
              {!returnSameAsAbove ? (
                <>
                  <div className='sm:col-span-2'><Label>Return address*</Label><Textarea className='min-h-[78px] rounded-md' placeholder='Return address*' value={createForm.return_address} onChange={(e) => setCreateForm((c) => ({ ...c, return_address: e.target.value }))} /></div>
                  <div><Label>Return city</Label><Input placeholder='Return city' value={createForm.return_city} onChange={(e) => setCreateForm((c) => ({ ...c, return_city: e.target.value }))} /></div>
                  <div><Label>Return pin</Label><Input placeholder='Return pin' value={createForm.return_pin} onChange={(e) => setCreateForm((c) => ({ ...c, return_pin: e.target.value }))} /></div>
                  <div>
                    <Label>Return state</Label>
                    <IndianStateSelect
                      value={createForm.return_state}
                      onChange={(value) => setCreateForm((c) => ({ ...c, return_state: value }))}
                    />
                  </div>
                  <div><Label>Return country</Label><Input placeholder='Return country' value={createForm.return_country} onChange={(e) => setCreateForm((c) => ({ ...c, return_country: e.target.value }))} /></div>
                </>
              ) : null}
            </div>
          ) : (
            <ShadowfaxWarehouseFields form={shadowfaxForm} setForm={setShadowfaxForm} />
          )}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setCreateOpen(false)
                setReturnSameAsAbove(false)
                setCreateProvider('')
              }}
            >
              Cancel
            </Button>
            {createProvider ? (
              <Button
                className={greenButtonClass}
                onClick={() => void onCreate()}
                disabled={busy === 'create'}
              >
                {busy === 'create' ? <LoaderCircle className='h-4 w-4 animate-spin' /> : <Warehouse className='h-4 w-4' />}
                {busy === 'create' ? 'Creating' : 'Create'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className='w-[min(96vw,760px)] max-h-[90vh] overflow-y-auto rounded-md'>
          <DialogHeader className='text-left'>
            <DialogTitle>Edit Warehouse</DialogTitle>
            <DialogDescription>
              {selected?.name || 'Warehouse'} | {selected?.provider === 'shadowfax' ? 'Shadowfax' : 'Delhivery'}
            </DialogDescription>
          </DialogHeader>
          {selected?.provider === 'shadowfax' ? (
            <ShadowfaxWarehouseFields form={editShadowfaxForm} setForm={setEditShadowfaxForm} />
          ) : (
            <div className='grid gap-3'>
              <div><Label>Address</Label><Textarea className='min-h-[78px] rounded-md' placeholder='Address' value={editForm.address} onChange={(e) => setEditForm((c) => ({ ...c, address: e.target.value }))} /></div>
              <div><Label>Pin</Label><Input placeholder='Pin' value={editForm.pin} onChange={(e) => setEditForm((c) => ({ ...c, pin: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input placeholder='Phone' value={editForm.phone} onChange={(e) => setEditForm((c) => ({ ...c, phone: e.target.value }))} /></div>
              <div className='space-y-2'>
                <Label className='mb-0'>Working Days</Label>
                <div className='flex flex-wrap gap-2'>
                  {WORKING_DAYS.map((day) => {
                    const active = editForm.working_days.includes(day)
                    return (
                      <button
                        key={day}
                        type='button'
                        onClick={() =>
                          setEditForm((c) => ({ ...c, working_days: toggleDay(c.working_days, day) }))
                        }
                        className={`rounded-md border px-3 py-1.5 text-sm ${
                          active ? activeDayClass : inactiveDayClass
                        }`}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button className={greenButtonClass} onClick={() => void onEdit()} disabled={busy === 'edit'}>
              {busy === 'edit' ? <LoaderCircle className='h-4 w-4 animate-spin' /> : null}
              {busy === 'edit' ? 'Updating' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ShadowfaxWarehouseFields({
  form,
  setForm,
}: {
  form: ShadowfaxWarehouseForm
  setForm: Dispatch<SetStateAction<ShadowfaxWarehouseForm>>
}) {
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    setForm((c) => {
      if (!c.unique_code) {
        return { ...c, unique_code: 'WH-' + Math.random().toString(36).substring(2, 8).toUpperCase() }
      }
      return c
    })
  }, [setForm])

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location tracking is not supported in this browser')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((c) => ({
          ...c,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }))
        toast.success('Current location added')
        setLocating(false)
      },
      (error) => {
        toast.error(error.message || 'Unable to get current location')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  return (
    <div className='grid gap-3 sm:grid-cols-2'>
      <div><Label>Warehouse name*</Label><Input placeholder='Warehouse name*' value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} /></div>
      <div><Label>Unique code*</Label><Input placeholder='Unique code*' value={form.unique_code} onChange={(e) => setForm((c) => ({ ...c, unique_code: e.target.value }))} /></div>
      <div><Label>Contact*</Label><Input placeholder='Contact*' value={form.contact} onChange={(e) => setForm((c) => ({ ...c, contact: e.target.value }))} /></div>
      <div><Label>Email</Label><Input placeholder='Email' value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} /></div>
      <div className='sm:col-span-2'><Label>Address line 1*</Label><Textarea className='min-h-[78px] rounded-md' placeholder='Address line 1*' value={form.address_line_1} onChange={(e) => setForm((c) => ({ ...c, address_line_1: e.target.value }))} /></div>
      <div className='sm:col-span-2'><Label>Address line 2</Label><Textarea className='min-h-[64px] rounded-md' placeholder='Address line 2' value={form.address_line_2} onChange={(e) => setForm((c) => ({ ...c, address_line_2: e.target.value }))} /></div>
      <div><Label>City*</Label><Input placeholder='City*' value={form.city} onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))} /></div>
      <div>
        <Label>State*</Label>
        <IndianStateSelect
          value={form.state}
          onChange={(value) => setForm((c) => ({ ...c, state: value }))}
        />
      </div>
      <div><Label>Pincode*</Label><Input placeholder='Pincode*' value={form.pincode} onChange={(e) => setForm((c) => ({ ...c, pincode: e.target.value }))} /></div>
      <div><Label>Latitude (optional)</Label><Input placeholder='Latitude' value={form.latitude} onChange={(e) => setForm((c) => ({ ...c, latitude: e.target.value }))} /></div>
      <div><Label>Longitude (optional)</Label><Input placeholder='Longitude' value={form.longitude} onChange={(e) => setForm((c) => ({ ...c, longitude: e.target.value }))} /></div>
      <div className='sm:col-span-2'>
        <Button
          type='button'
          variant='outline'
          className={greenOutlineButtonClass}
          onClick={useCurrentLocation}
          disabled={locating}
        >
          {locating ? <LoaderCircle className='h-4 w-4 animate-spin' /> : <MapPin className='h-4 w-4' />}
          {locating ? 'Getting location' : 'Use current location'}
        </Button>
      </div>
      <div className='sm:col-span-2 space-y-2'>
        <Label className='mb-0'>Working Days</Label>
        <div className='flex flex-wrap gap-2'>
          {WORKING_DAYS.map((day) => {
            const active = form.working_days.includes(day)
            return (
              <button
                key={day}
                type='button'
                onClick={() =>
                  setForm((c) => ({ ...c, working_days: toggleDay(c.working_days, day) }))
                }
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  active ? activeDayClass : inactiveDayClass
                }`}
              >
                {day}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
