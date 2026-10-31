"use client"

import type { ReactNode } from "react"
import { CirclePlus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

export type FilterOption = { label: string; value: string }

export function uniqueFilterOptions(values: Array<string | undefined | null>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ label: value, value }))
}

export function matchesSelected(selected: string[], value: string) {
  return selected.length === 0 || selected.includes(value)
}

export function matchesSearch(query: string, values: unknown[]) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  return values.some((value) => String(value ?? "").toLowerCase().includes(text))
}

export function matchesDateRange(value: unknown, from: string, to: string) {
  if (!from && !to) return true
  const time = new Date(String(value || "")).getTime()
  if (!Number.isFinite(time)) return false
  if (from) {
    const start = new Date(from)
    start.setHours(0, 0, 0, 0)
    if (time < start.getTime()) return false
  }
  if (to) {
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)
    if (time > end.getTime()) return false
  }
  return true
}

export function TableFilters({
  search,
  onSearchChange,
  placeholder,
  children,
  onReset,
  active,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  placeholder: string
  children?: ReactNode
  onReset: () => void
  active: boolean
  dateFrom?: string
  dateTo?: string
  onDateFromChange?: (value: string) => void
  onDateToChange?: (value: string) => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={placeholder}
        className="h-8 w-[220px]"
      />
      {onDateFromChange && onDateToChange ? (
        <div className="flex h-8 items-center rounded-md border bg-background">
          <label className="flex h-full items-center gap-2 border-r px-2 text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={dateFrom || ""}
              onChange={(event) => onDateFromChange(event.target.value)}
              className="h-8 w-40 bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          <label className="flex h-full items-center gap-2 px-2 text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={dateTo || ""}
              onChange={(event) => onDateToChange(event.target.value)}
              className="h-8 w-40 bg-transparent text-sm text-foreground outline-none"
            />
          </label>
        </div>
      ) : null}
      {children}
      {active ? (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onReset}>
          Reset
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}

export function FacetFilter({
  title,
  options,
  selected,
  onToggle,
  onClear,
}: {
  title: string
  options: FilterOption[]
  selected: string[]
  onToggle: (value: string) => void
  onClear: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 border-dashed">
          <CirclePlus className="size-4" />
          {title}
          {selected.length ? (
            <Badge variant="secondary" className="rounded-sm px-1 font-normal">
              {selected.length}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {options.length ? options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={() => onToggle(option.value)}
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        )) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No options</p>
        )}
        {selected.length ? (
          <>
            <DropdownMenuSeparator />
            <button type="button" className="w-full px-2 py-1.5 text-left text-sm" onClick={onClear}>
              Clear {title.toLowerCase()}
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
