type INROptions = {
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

const formatterCache = new Map<string, Intl.NumberFormat>()

const getINRFormatter = (minimumFractionDigits: number, maximumFractionDigits: number) => {
  const key = `${minimumFractionDigits}-${maximumFractionDigits}`
  const cached = formatterCache.get(key)
  if (cached) return cached

  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits,
    maximumFractionDigits,
  })
  formatterCache.set(key, formatter)
  return formatter
}

export const formatINR = (
  value?: number | string | null,
  { minimumFractionDigits = 0, maximumFractionDigits = 2 }: INROptions = {},
) => {
  const numericValue = Number(value ?? 0)
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0
  return getINRFormatter(minimumFractionDigits, maximumFractionDigits).format(safeValue)
}
