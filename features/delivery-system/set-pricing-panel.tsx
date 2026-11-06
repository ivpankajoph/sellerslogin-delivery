'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/lib/axios'
import { PartnerLogo } from '@/components/shared/partner-logo'
import type { RootState } from '@/store'

type Slab = {
  km: number
  min: number | null
  max: number | null
  available: boolean
}

type Vehicle = {
  name: string
  capacity_kg: number
  slabs: Slab[]
}

type CityFare = {
  city: string
  aliases: string[]
  vehicles: Vehicle[]
}

type Adjustment = {
  partner_id: 'delhivery' | 'shadowfax' | 'porter' | 'platform'
  service_id: 'heavy-duty' | 'b2b' | 'd2c' | 'local' | 'quick-commerce' | 'hyperlocal'
  adjust_type: 'fixed' | 'percentage'
  adjust_value: string
  active: boolean
}

type PricingRule = {
  name: string
  delivery_type: 'quick-commerce' | 'hyperlocal' | 'b2b' | 'b2c'
  partner_id: 'all' | Adjustment['partner_id']
  adjust_type: 'fixed' | 'percentage'
  adjust_value: string | number
  days: number[]
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  active: boolean
}

const deliveryTypes: { id: PricingRule['delivery_type']; label: string; detail: string; serviceId: Adjustment['service_id'] }[] = [
  { id: 'quick-commerce', label: 'Quick Commerce', detail: 'Rapid local fulfillment', serviceId: 'quick-commerce' },
  { id: 'hyperlocal', label: 'Hyperlocal', detail: 'Same city delivery', serviceId: 'hyperlocal' },
  { id: 'b2b', label: 'B2B', detail: 'Business shipments', serviceId: 'heavy-duty' },
  { id: 'b2c', label: 'B2C', detail: 'Customer parcels', serviceId: 'b2b' },
]
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const emptyRule = (): PricingRule => ({ name: '', delivery_type: 'quick-commerce', partner_id: 'all', adjust_type: 'percentage', adjust_value: 20, days: [0, 1, 2, 3, 4, 5, 6], start_date: '', end_date: '', start_time: '15:00', end_time: '18:00', active: true })

const partners: Adjustment['partner_id'][] = ['delhivery', 'shadowfax', 'porter']
const services: Adjustment['service_id'][] = ['heavy-duty', 'b2b', 'd2c', 'local', 'quick-commerce', 'hyperlocal']

const partnerLabels: Record<Adjustment['partner_id'], string> = {
  delhivery: 'Delhivery',
  shadowfax: 'Shadowfax',
  porter: 'Porter',
  platform: 'Platform vehicles',
}

const serviceLabels: Record<Adjustment['service_id'], string> = {
  'heavy-duty': 'B2B',
  b2b: 'B2C',
  d2c: 'All-India Courier',
  local: 'Quick Commerce / Hyperlocal',
  'quick-commerce': 'Quick Commerce',
  hyperlocal: 'Hyperlocal',
}

const emptyAdjustments = (): Adjustment[] =>
  partners.flatMap((partnerId) =>
    services.map((serviceId) => ({
      partner_id: partnerId,
      service_id: serviceId,
      adjust_type: 'percentage' as const,
      adjust_value: '',
      active: false,
    })),
  )

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback

export function SetPricingPanel() {
  const role = String(useSelector((state: RootState) => state.auth.user?.role) || '').toLowerCase()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const [sheetPartner, setSheetPartner] = useState<'porter' | 'shadowfax'>('porter')
  const [cities, setCities] = useState<CityFare[]>([])
  const [cityName, setCityName] = useState('')
  const [adjustments, setAdjustments] = useState<Adjustment[]>(emptyAdjustments)
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([])
  const [selectedType, setSelectedType] = useState<PricingRule['delivery_type']>('quick-commerce')
  const [selectedPartner, setSelectedPartner] = useState<PricingRule['partner_id']>('all')
  const [pricingView, setPricingView] = useState<'base' | 'rules'>('base')
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [draftRule, setDraftRule] = useState<PricingRule>(emptyRule)
  const [savingRules, setSavingRules] = useState(false)
  const [loading, setLoading] = useState(false)
  const [savingSheet, setSavingSheet] = useState(false)
  const [savingAdjustments, setSavingAdjustments] = useState(false)
  const [applyingBulk, setApplyingBulk] = useState(false)
  const [bulkScope, setBulkScope] = useState<'city' | 'vehicle' | 'all'>('city')
  const [bulkVehicle, setBulkVehicle] = useState('')
  const [bulkMode, setBulkMode] = useState<'fixed' | 'percentage'>('percentage')
  const [bulkValue, setBulkValue] = useState('')

  const city = useMemo(
    () => cities.find((entry) => entry.city === cityName) || cities[0] || null,
    [cities, cityName],
  )

  const load = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const [sheetRes, adjustmentRes, rulesRes] = await Promise.all([
        api.get('/delivery-pricing/sheet', { params: { partner: sheetPartner } }),
        api.get('/delivery-pricing/adjustments'),
        api.get('/delivery-pricing/rules'),
      ])
      const nextCities = Array.isArray(sheetRes?.data?.data?.cities) ? sheetRes.data.data.cities : []
      setCities(nextCities)
      setCityName((current) => current || nextCities[0]?.city || '')
      const rows = Array.isArray(adjustmentRes?.data?.data) ? adjustmentRes.data.data : []
      setPricingRules(Array.isArray(rulesRes?.data?.data) ? rulesRes.data.data.map((rule: PricingRule) => ({ ...rule, start_date: rule.start_date || '', end_date: rule.end_date || '' })) : [])
      setAdjustments(
        emptyAdjustments().map((entry) => {
          const saved = rows.find(
            (row: Adjustment) => row.partner_id === entry.partner_id && row.service_id === entry.service_id,
          )
          if (!saved) return entry
          return {
            ...entry,
            adjust_type: saved.adjust_type === 'fixed' ? 'fixed' : 'percentage',
            adjust_value: saved.adjust_value ? String(saved.adjust_value) : '',
            active: Boolean(saved.active) || Number(saved.adjust_value) !== 0,
          }
        }),
      )
    } catch (error) {
      toast.error(errorMessage(error, 'Could not load pricing.'))
    } finally {
      setLoading(false)
    }
  }, [isAdmin, sheetPartner])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!city) return
    if (!city.vehicles.some((vehicle) => vehicle.name === bulkVehicle)) {
      setBulkVehicle(city.vehicles[0]?.name || '')
    }
  }, [bulkVehicle, city])

  const updateSlab = (vehicleName: string, km: number, patch: Partial<Slab>) => {
    setCities((current) =>
      current.map((entry) => {
        if (entry.city !== city?.city) return entry
        return {
          ...entry,
          vehicles: entry.vehicles.map((vehicle) => {
            if (vehicle.name !== vehicleName) return vehicle
            return {
              ...vehicle,
              slabs: vehicle.slabs.map((slab) => (slab.km === km ? { ...slab, ...patch } : slab)),
            }
          }),
        }
      }),
    )
  }

  const updateAdjustment = (partnerId: string, serviceId: string, patch: Partial<Adjustment>) => {
    setAdjustments((current) =>
      current.map((entry) =>
        entry.partner_id === partnerId && entry.service_id === serviceId ? { ...entry, ...patch } : entry,
      ),
    )
  }

  const saveSheet = async () => {
    setSavingSheet(true)
    try {
      const response = await api.put('/delivery-pricing/sheet', { partner: sheetPartner, cities })
      const nextCities = Array.isArray(response?.data?.data?.cities) ? response.data.data.cities : cities
      setCities(nextCities)
      toast.success(`${sheetPartner === 'shadowfax' ? 'Shadowfax' : 'Porter'} fare sheet saved.`)
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the fare sheet.'))
    } finally {
      setSavingSheet(false)
    }
  }

  const applyBulk = async () => {
    if (!city && bulkScope !== 'all') return
    setApplyingBulk(true)
    try {
      const response = await api.post('/delivery-pricing/sheet/adjust', {
        partner: sheetPartner,
        scope: bulkScope,
        city: city?.city,
        vehicle: bulkVehicle,
        mode: bulkMode,
        value: Number(bulkValue),
      })
      const nextCities = Array.isArray(response?.data?.data?.cities) ? response.data.data.cities : null
      if (nextCities) setCities(nextCities)
      toast.success(response?.data?.message || 'Fare cells updated.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not apply that change.'))
    } finally {
      setApplyingBulk(false)
    }
  }

  const saveAdjustments = async () => {
    setSavingAdjustments(true)
    try {
      const response = await api.put('/delivery-pricing/adjustments', {
        adjustments: adjustments.map((entry) => ({
          ...entry,
          adjust_value: Number(entry.adjust_value || 0),
        })),
      })
      toast.success(response?.data?.message || 'Pricing adjustments saved.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save pricing adjustments.'))
    } finally {
      setSavingAdjustments(false)
    }
  }

  const saveRules = async () => {
    setSavingRules(true)
    try {
      const response = await api.put('/delivery-pricing/rules', { rules: pricingRules.map((rule) => ({ ...rule, adjust_value: Number(rule.adjust_value || 0) })) })
      setPricingRules(Array.isArray(response?.data?.data) ? response.data.data : pricingRules)
      toast.success(response?.data?.message || 'Scheduled pricing rules saved.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save scheduled pricing rules.'))
    } finally {
      setSavingRules(false)
    }
  }

  const updateRule = (index: number, patch: Partial<PricingRule>) => setPricingRules((current) => current.map((rule, i) => i === index ? { ...rule, ...patch } : rule))
  const updateDraftRule = (patch: Partial<PricingRule>) => setDraftRule((current) => ({ ...current, ...patch }))

  const openRuleDialog = () => {
    setDraftRule({ ...emptyRule(), delivery_type: selectedType, partner_id: selectedPartner })
    setRuleDialogOpen(true)
  }

  const addDraftRule = () => {
    if (!draftRule.name.trim()) return toast.error('Enter a name for this rule.')
    if (!draftRule.days.length) return toast.error('Choose at least one day.')
    if (!Number.isFinite(Number(draftRule.adjust_value)) || Number(draftRule.adjust_value) <= 0) return toast.error('Enter an adjustment greater than zero.')
    if (!draftRule.start_date) return toast.error('Choose a start date.')
    if (draftRule.end_date && draftRule.end_date < draftRule.start_date) return toast.error('End date must be on or after the start date.')
    if (draftRule.start_time === draftRule.end_time) return toast.error('Start and end times must be different.')
    setPricingRules((current) => [...current, { ...draftRule, name: draftRule.name.trim() }])
    setRuleDialogOpen(false)
    toast.success('Rule added. Save rules to apply it.')
  }

  const adjustmentFor = (partnerId: Adjustment['partner_id'], serviceId: Adjustment['service_id']) =>
    adjustments.find((entry) => entry.partner_id === partnerId && entry.service_id === serviceId)
  const visiblePartners = selectedPartner === 'all' ? partners : [selectedPartner]
  const visibleRules = pricingRules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.delivery_type === selectedType && (selectedPartner === 'all' || rule.partner_id === 'all' || rule.partner_id === selectedPartner))

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set Pricing</CardTitle>
          <CardDescription>This page is available to admin accounts only.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className='space-y-5 pb-8'>
      <div className='flex flex-wrap items-end justify-between gap-x-6 gap-y-4'>
        <h1 className='pb-1 text-2xl font-semibold tracking-tight'>Pricing</h1>
        <div className='flex flex-wrap items-end justify-end gap-x-3 gap-y-2'>
          <div className='flex flex-wrap items-end gap-2'>
            <div className='space-y-1'><Label className='text-xs text-muted-foreground'>Delivery type</Label><Select value={selectedType} onValueChange={(value) => setSelectedType(value as PricingRule['delivery_type'])}><SelectTrigger className='h-9 w-44'><SelectValue /></SelectTrigger><SelectContent>{deliveryTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>)}</SelectContent></Select></div>
            <div className='space-y-1'><Label className='text-xs text-muted-foreground'>Partner</Label><Select value={selectedPartner} onValueChange={(value) => setSelectedPartner(value as PricingRule['partner_id'])}><SelectTrigger className='h-9 w-40'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>All partners</SelectItem>{partners.map((partner) => <SelectItem key={partner} value={partner}>{partnerLabels[partner]}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {pricingView === 'rules' ? (
            <>
              <Button variant='outline' onClick={openRuleDialog}>Add scheduled rule</Button>
              <Button onClick={() => void saveRules()} disabled={savingRules || loading}>{savingRules ? 'Saving…' : 'Save rules'}</Button>
            </>
          ) : (
            <Button onClick={() => void saveAdjustments()} disabled={savingAdjustments || loading}>{savingAdjustments ? 'Saving…' : 'Save base prices'}</Button>
          )}
        </div>
      </div>

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:max-w-2xl sm:p-6'>
          <DialogHeader className='space-y-1 text-left'>
            <DialogTitle>Add scheduled pricing rule</DialogTitle>
            <DialogDescription>Choose the delivery scope, valid dates, days, and time window (IST).</DialogDescription>
          </DialogHeader>
          <div className='space-y-4 py-1'>
            <div className='grid gap-x-5 gap-y-3 sm:grid-cols-2'>
              <div className='space-y-1.5 sm:col-span-2'><Label>Rule name</Label><Input value={draftRule.name} placeholder='Example: Monday evening peak' onChange={(event) => updateDraftRule({ name: event.target.value })} /></div>
              <div className='space-y-1.5'><Label>Delivery type</Label><Select value={draftRule.delivery_type} onValueChange={(value) => updateDraftRule({ delivery_type: value as PricingRule['delivery_type'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{deliveryTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>)}</SelectContent></Select></div>
              <div className='space-y-1.5'><Label>Partner</Label><Select value={draftRule.partner_id} onValueChange={(value) => updateDraftRule({ partner_id: value as PricingRule['partner_id'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='all'>All partners</SelectItem>{partners.map((partner) => <SelectItem key={partner} value={partner}>{partnerLabels[partner]}</SelectItem>)}</SelectContent></Select></div>
              <div className='space-y-1.5 sm:col-span-2'><Label>Price adjustment</Label><div className='flex gap-2'><Select value={draftRule.adjust_type} onValueChange={(value) => updateDraftRule({ adjust_type: value === 'fixed' ? 'fixed' : 'percentage' })}><SelectTrigger className='w-40'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='percentage'>Add percent</SelectItem><SelectItem value='fixed'>Add rupees</SelectItem></SelectContent></Select><Input className='w-32' inputMode='decimal' aria-label='Adjustment amount' value={draftRule.adjust_value} onChange={(event) => updateDraftRule({ adjust_value: event.target.value })} /></div></div>
            </div>
            <div className='space-y-1.5'><Label>Repeat on</Label><div className='flex flex-wrap gap-1.5'>{weekdays.map((day, dayIndex) => <Button key={day} type='button' size='sm' variant={draftRule.days.includes(dayIndex) ? 'default' : 'outline'} className='min-w-11' aria-pressed={draftRule.days.includes(dayIndex)} onClick={() => updateDraftRule({ days: draftRule.days.includes(dayIndex) ? draftRule.days.filter((item) => item !== dayIndex) : [...draftRule.days, dayIndex].sort() })}>{day}</Button>)}</div><p className='text-xs text-muted-foreground'>Select the weekdays when this rule should repeat.</p></div>
            <div className='grid gap-x-5 gap-y-3 sm:grid-cols-2'><div className='space-y-1.5'><Label>Valid from</Label><Input type='date' value={draftRule.start_date} onChange={(event) => updateDraftRule({ start_date: event.target.value })} /></div><div className='space-y-1.5'><Label>Valid through <span className='font-normal text-muted-foreground'>(optional)</span></Label><Input type='date' min={draftRule.start_date || undefined} value={draftRule.end_date} onChange={(event) => updateDraftRule({ end_date: event.target.value })} /></div><div className='space-y-1.5'><Label>Starts at</Label><Input type='time' value={draftRule.start_time} onChange={(event) => updateDraftRule({ start_time: event.target.value })} /></div><div className='space-y-1.5'><Label>Ends at</Label><Input type='time' value={draftRule.end_time} onChange={(event) => updateDraftRule({ end_time: event.target.value })} /></div></div>
            <label className='flex items-center justify-between rounded-md border px-3 py-2.5 text-sm'><span><span className='font-medium'>Enable this rule</span><span className='mt-0.5 block text-xs text-muted-foreground'>You can pause it from the table later.</span></span><input type='checkbox' checked={draftRule.active} onChange={(event) => updateDraftRule({ active: event.target.checked })} /></label>
          </div>
          <DialogFooter><Button type='button' variant='outline' onClick={() => setRuleDialogOpen(false)}>Cancel</Button><Button type='button' onClick={addDraftRule}>Add rule</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {pricingView === 'base' ? (
        <Card className='overflow-hidden'>
          <div className='flex items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3'>
            <div role='group' aria-label='Pricing table view' className='relative inline-grid grid-cols-2 rounded-md bg-muted p-1'>
              <span aria-hidden='true' className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded bg-background shadow-sm ring-1 ring-border/60 transition-transform duration-200 ease-out ${pricingView === 'rules' ? 'translate-x-full' : 'translate-x-0'}`} />
              <Button type='button' variant='ghost' aria-pressed={pricingView === 'base'} onClick={() => setPricingView('base')} className='relative z-10 h-8 px-4'>Base pricing</Button>
              <Button type='button' variant='ghost' aria-pressed={pricingView === 'rules'} onClick={() => setPricingView('rules')} className='relative z-10 h-8 px-4'>Scheduled rules <span className='ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums'>{visibleRules.length}</span></Button>
            </div>
            <span className='text-xs text-muted-foreground'>{visiblePartners.length} {visiblePartners.length === 1 ? 'partner' : 'partners'}</span>
          </div>
          <div className='overflow-x-auto'>
            <Table className='min-w-[720px] table-fixed'>
              <TableHeader><TableRow className='bg-muted/50'><TableHead className='w-56'>Partner</TableHead><TableHead className='w-48'>Pricing row</TableHead><TableHead>Adjustment</TableHead><TableHead className='w-28 text-center'>Enabled</TableHead></TableRow></TableHeader>
              <TableBody>
                {visiblePartners.map((partnerId) => {
                  const type = deliveryTypes.find((item) => item.id === selectedType)!
                  const entry = adjustmentFor(partnerId, type.serviceId)
                  if (!entry) return null
                  return <TableRow key={`base-${type.id}-${partnerId}`}>
                    <TableCell><PartnerLogo partner={partnerId} name={partnerLabels[partnerId]} size='sm' /></TableCell>
                    <TableCell><span className='text-sm font-medium'>Base price</span><span className='ml-2 text-xs text-muted-foreground'>All day</span></TableCell>
                    <TableCell><div className='flex items-center gap-2'><Select value={entry.adjust_type} onValueChange={(value) => updateAdjustment(partnerId, type.serviceId, { adjust_type: value === 'fixed' ? 'fixed' : 'percentage' })}><SelectTrigger className='h-8 w-28'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='percentage'>Add %</SelectItem><SelectItem value='fixed'>Add ₹</SelectItem></SelectContent></Select><Input className='h-8 w-24' inputMode='decimal' value={entry.adjust_value} placeholder='0' onChange={(event) => updateAdjustment(partnerId, type.serviceId, { adjust_value: event.target.value, active: event.target.value !== '' && Number(event.target.value) !== 0 })} /></div></TableCell>
                    <TableCell className='text-center'><input type='checkbox' checked={entry.active} aria-label={`Enable ${type.label} base price for ${partnerLabels[partnerId]}`} onChange={(event) => updateAdjustment(partnerId, type.serviceId, { active: event.target.checked })} /></TableCell>
                  </TableRow>
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : (
        <Card className='overflow-hidden'>
          <div className='flex items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3'>
            <div role='group' aria-label='Pricing table view' className='relative inline-grid grid-cols-2 rounded-md bg-muted p-1'>
              <span aria-hidden='true' className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded bg-background shadow-sm ring-1 ring-border/60 transition-transform duration-200 ease-out ${pricingView === 'rules' ? 'translate-x-full' : 'translate-x-0'}`} />
              <Button type='button' variant='ghost' aria-pressed={pricingView === 'base'} onClick={() => setPricingView('base')} className='relative z-10 h-8 px-4'>Base pricing</Button>
              <Button type='button' variant='ghost' aria-pressed={pricingView === 'rules'} onClick={() => setPricingView('rules')} className='relative z-10 h-8 px-4'>Scheduled rules <span className='ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums'>{visibleRules.length}</span></Button>
            </div>
            <span className='text-xs text-muted-foreground'>{visibleRules.length} {visibleRules.length === 1 ? 'rule' : 'rules'}</span>
          </div>
          <div className='overflow-x-auto'>
            <Table className='min-w-[1280px]'>
              <TableHeader><TableRow className='bg-muted/50'><TableHead className='w-48'>Partner</TableHead><TableHead className='w-56'>Rule name</TableHead><TableHead className='w-56'>Adjustment</TableHead><TableHead className='w-56'>Valid dates</TableHead><TableHead className='w-52'>Days</TableHead><TableHead className='w-44'>Time · IST</TableHead><TableHead className='w-28 text-center'>Enabled</TableHead></TableRow></TableHeader>
              <TableBody>
                {visibleRules.map(({ rule, index }) => <TableRow key={`rule-${index}`}>
                  <TableCell className='text-sm font-medium'>{rule.partner_id === 'all' ? 'All partners' : partnerLabels[rule.partner_id]}</TableCell>
                  <TableCell><Input className='h-8' value={rule.name} placeholder='Rule name' onChange={(event) => updateRule(index, { name: event.target.value })} /></TableCell>
                  <TableCell><div className='flex items-center gap-2'><Select value={rule.adjust_type} onValueChange={(value) => updateRule(index, { adjust_type: value === 'fixed' ? 'fixed' : 'percentage' })}><SelectTrigger className='h-8 w-28'><SelectValue /></SelectTrigger><SelectContent><SelectItem value='percentage'>Add %</SelectItem><SelectItem value='fixed'>Add ₹</SelectItem></SelectContent></Select><Input className='h-8 w-20' inputMode='decimal' value={rule.adjust_value} onChange={(event) => updateRule(index, { adjust_value: event.target.value })} /></div></TableCell>
                  <TableCell className='whitespace-nowrap text-xs text-muted-foreground'>{rule.start_date || 'Any date'} <span className='px-1'>→</span> {rule.end_date || 'No end date'}</TableCell>
                  <TableCell><div className='flex gap-1'>{weekdays.map((day, dayIndex) => <button key={day} type='button' aria-pressed={rule.days.includes(dayIndex)} aria-label={`${day} ${rule.days.includes(dayIndex) ? 'selected' : 'not selected'}`} onClick={() => updateRule(index, { days: rule.days.includes(dayIndex) ? rule.days.filter((item) => item !== dayIndex) : [...rule.days, dayIndex].sort() })} className={`h-7 w-7 rounded-md border text-[10px] font-medium ${rule.days.includes(dayIndex) ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}>{day[0]}</button>)}</div></TableCell>
                  <TableCell><div className='flex items-center gap-1'><Input className='h-8 w-[72px] px-1.5' type='time' value={rule.start_time} onChange={(event) => updateRule(index, { start_time: event.target.value })} /><span className='text-muted-foreground'>–</span><Input className='h-8 w-[72px] px-1.5' type='time' value={rule.end_time} onChange={(event) => updateRule(index, { end_time: event.target.value })} /></div></TableCell>
                  <TableCell><div className='flex items-center justify-center gap-2'><input type='checkbox' checked={rule.active} aria-label={`Enable ${rule.name || 'scheduled rule'}`} onChange={(event) => updateRule(index, { active: event.target.checked })} /><Button type='button' variant='ghost' size='sm' className='h-7 px-2 text-muted-foreground' aria-label={`Remove ${rule.name || 'scheduled rule'}`} onClick={() => setPricingRules((current) => current.filter((_, i) => i !== index))}>×</Button></div></TableCell>
                </TableRow>)}
                {!visibleRules.length ? <TableRow><TableCell colSpan={7} className='py-10 text-center text-sm text-muted-foreground'>No scheduled rules for this selection. Add a rule to create a time based pricing adjustment.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <CardTitle>Fare sheet</CardTitle>
            <div className='flex rounded-md border p-1'>
              <Button
                type='button'
                variant={sheetPartner === 'porter' ? 'default' : 'ghost'}
                onClick={() => setSheetPartner('porter')}
                className='gap-2'
              >
                <PartnerLogo partner="porter" size="xs" showName={false} />
                Porter
              </Button>
              <Button
                type='button'
                variant={sheetPartner === 'shadowfax' ? 'default' : 'ghost'}
                onClick={() => setSheetPartner('shadowfax')}
                className='gap-2'
              >
                <PartnerLogo partner="shadowfax" size="xs" showName={false} />
                Shadowfax
              </Button>
            </div>
            <Button onClick={() => void saveSheet()} disabled={savingSheet || loading || !cities.length}>
              {savingSheet ? 'Saving...' : 'Save fare sheet'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-3 md:grid-cols-4'>
            <div className='space-y-2'>
              <Label>City</Label>
              <Select value={city?.city || ''} onValueChange={setCityName}>
                <SelectTrigger>
                  <SelectValue placeholder='Select a city' />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((entry) => (
                    <SelectItem key={entry.city} value={entry.city}>
                      {entry.city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label>Bulk edit</Label>
              <Select value={bulkScope} onValueChange={(value) => setBulkScope(value as 'city' | 'vehicle' | 'all')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='city'>This city</SelectItem>
                  <SelectItem value='vehicle'>One vehicle</SelectItem>
                  <SelectItem value='all'>All cities</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label>How</Label>
              <Select value={bulkMode} onValueChange={(value) => setBulkMode(value === 'fixed' ? 'fixed' : 'percentage')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='percentage'>Add %</SelectItem>
                  <SelectItem value='fixed'>Add ₹</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label>Amount</Label>
              <Input inputMode='decimal' value={bulkValue} placeholder='10' onChange={(event) => setBulkValue(event.target.value)} />
            </div>
          </div>
          {bulkScope === 'vehicle' ? (
            <div className='max-w-xs space-y-2'>
              <Label>Vehicle</Label>
              <Select value={bulkVehicle} onValueChange={setBulkVehicle}>
                <SelectTrigger>
                  <SelectValue placeholder='Vehicle' />
                </SelectTrigger>
                <SelectContent>
                  {(city?.vehicles || []).map((vehicle) => (
                    <SelectItem key={vehicle.name} value={vehicle.name}>
                      {vehicle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Button variant='outline' onClick={() => void applyBulk()} disabled={applyingBulk || loading || !bulkValue}>
            {applyingBulk ? 'Applying...' : 'Apply to fare cells'}
          </Button>

          {loading ? <p className='text-sm text-muted-foreground'>Loading fare sheet...</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-44'>Vehicle</TableHead>
                <TableHead className='w-24'>Km</TableHead>
                <TableHead>Min fare</TableHead>
                <TableHead>Max fare</TableHead>
                <TableHead className='w-32'>Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(city?.vehicles || []).map((vehicle) =>
                vehicle.slabs.map((slab, index) => (
                  <TableRow key={`${vehicle.name}-${slab.km}`}>
                    {index === 0 ? (
                      <TableCell rowSpan={vehicle.slabs.length} className='align-top'>
                        <p className='font-semibold'>{vehicle.name}</p>
                        <p className='text-xs text-muted-foreground'>{vehicle.capacity_kg} kg</p>
                      </TableCell>
                    ) : null}
                    <TableCell>{slab.km}</TableCell>
                    <TableCell>
                      <Input
                        className='h-9'
                        inputMode='numeric'
                        disabled={!slab.available}
                        value={slab.min ?? ''}
                        onChange={(event) =>
                          updateSlab(vehicle.name, slab.km, {
                            min: event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className='h-9'
                        inputMode='numeric'
                        disabled={!slab.available}
                        value={slab.max ?? ''}
                        onChange={(event) =>
                          updateSlab(vehicle.name, slab.km, {
                            max: event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <label className='flex items-center gap-2 text-sm'>
                        <input
                          type='checkbox'
                          checked={slab.available}
                          onChange={(event) =>
                            updateSlab(vehicle.name, slab.km, { available: event.target.checked })
                          }
                        />
                        {slab.available ? 'Yes' : 'No'}
                      </label>
                    </TableCell>
                  </TableRow>
                )),
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
