'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  service_id: 'heavy-duty' | 'b2b' | 'd2c' | 'local'
  adjust_type: 'fixed' | 'percentage'
  adjust_value: string
  active: boolean
}

const partners: Adjustment['partner_id'][] = ['delhivery', 'shadowfax', 'porter', 'platform']
const services: Adjustment['service_id'][] = ['heavy-duty', 'b2b', 'd2c', 'local']

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
      const [sheetRes, adjustmentRes] = await Promise.all([
        api.get('/delivery-pricing/sheet', { params: { partner: sheetPartner } }),
        api.get('/delivery-pricing/adjustments'),
      ])
      const nextCities = Array.isArray(sheetRes?.data?.data?.cities) ? sheetRes.data.data.cities : []
      setCities(nextCities)
      setCityName((current) => current || nextCities[0]?.city || '')
      const rows = Array.isArray(adjustmentRes?.data?.data) ? adjustmentRes.data.data : []
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
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold tracking-tight'>Set Pricing</h1>

      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adjust live prices</CardTitle>
          <CardDescription>
            These amounts are added on top of the company or sheet price. A rupee amount is added even when that price is zero.
            Turn a row on by entering a number. Clear the number to leave the price unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-40'>Delivery app</TableHead>
                <TableHead>Request type</TableHead>
                <TableHead className='w-24'>On</TableHead>
                <TableHead className='w-36'>Change</TableHead>
                <TableHead className='w-40'>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((partnerId) =>
                services.map((serviceId, index) => {
                  const entry = adjustments.find(
                    (row) => row.partner_id === partnerId && row.service_id === serviceId,
                  )
                  if (!entry) return null
                  return (
                    <TableRow key={`${partnerId}-${serviceId}`}>
                      {index === 0 ? (
                        <TableCell rowSpan={services.length} className='align-top font-semibold'>
                          <PartnerLogo partner={partnerId} name={partnerLabels[partnerId]} size="sm" />
                        </TableCell>
                      ) : null}
                      <TableCell>{serviceLabels[serviceId]}</TableCell>
                      <TableCell>
                        <label className='flex items-center gap-2 text-sm'>
                          <input
                            type='checkbox'
                            checked={entry.active}
                            onChange={(event) =>
                              updateAdjustment(partnerId, serviceId, { active: event.target.checked })
                            }
                          />
                          {entry.active ? 'On' : 'Off'}
                        </label>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={entry.adjust_type}
                          onValueChange={(value) =>
                            updateAdjustment(partnerId, serviceId, {
                              adjust_type: value === 'fixed' ? 'fixed' : 'percentage',
                            })
                          }
                        >
                          <SelectTrigger className='h-9'>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value='percentage'>Add %</SelectItem>
                            <SelectItem value='fixed'>Add ₹</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className='h-9'
                          inputMode='decimal'
                          value={entry.adjust_value}
                          placeholder='0'
                        onChange={(event) =>
                          updateAdjustment(partnerId, serviceId, {
                            adjust_value: event.target.value,
                            active: event.target.value !== '' && Number(event.target.value) !== 0,
                          })
                        }
                        />
                      </TableCell>
                    </TableRow>
                  )
                }),
              )}
            </TableBody>
          </Table>
          <Button onClick={() => void saveAdjustments()} disabled={savingAdjustments || loading}>
            {savingAdjustments ? 'Saving...' : 'Save adjustments'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <CardTitle>Fare sheet</CardTitle>
              <CardDescription>
                Check price uses the Max fare of the slab that covers the distance. A 16 km trip uses the 25 km row. Use Save fare sheet to store these cells.
              </CardDescription>
            </div>
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
          <div className='flex flex-wrap items-center gap-3'>
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
            <Button onClick={() => void saveSheet()} disabled={savingSheet || loading || !cities.length} className='gap-2'>
              <PartnerLogo partner={sheetPartner} size="xs" showName={false} />
              {savingSheet ? 'Saving...' : `Save ${sheetPartner === 'shadowfax' ? 'Shadowfax' : 'Porter'} sheet`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
