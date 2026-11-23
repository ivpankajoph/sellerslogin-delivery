type CourierBrand = "amazon" | "bluedart" | "delhivery" | "dtdc" | "ekart" | "shadowfax" | "xpressbees"

const BRANDS: Array<{ id: CourierBrand; test: RegExp; label: string }> = [
  { id: "bluedart", test: /blue\s*dart/, label: "Blue Dart" },
  { id: "xpressbees", test: /xpress/, label: "XpressBees" },
  { id: "delhivery", test: /delhivery/, label: "Delhivery" },
  { id: "shadowfax", test: /shadowfax/, label: "Shadowfax" },
  { id: "dtdc", test: /dtdc/, label: "DTDC" },
  { id: "ekart", test: /ekart|flipkart/, label: "Ekart" },
  { id: "amazon", test: /amazon|\bats\b/, label: "Amazon" },
]

export const courierBrand = (name?: string, code?: string) => {
  const value = `${name || ""} ${code || ""}`.toLowerCase()
  return BRANDS.find((brand) => brand.test.test(value)) || null
}

export function CourierLogo({ name, code }: { name?: string; code?: string }) {
  const brand = courierBrand(name, code)
  const label = brand?.label || name || "Courier"
  const wide = brand?.id === "delhivery" || brand?.id === "shadowfax"

  return (
    <span className={`inline-flex h-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white shadow-xs ${wide ? "w-[4.75rem]" : "w-11"}`} title={label}>
      {brand?.id === "bluedart" ? <BlueDartMark /> : null}
      {brand?.id === "dtdc" ? <DtdcMark /> : null}
      {brand?.id === "xpressbees" ? <XpressBeesMark /> : null}
      {brand?.id === "ekart" ? <EkartMark /> : null}
      {brand?.id === "amazon" ? <AmazonMark /> : null}
      {brand?.id === "delhivery" ? <img src="/delhivery.png" alt="Delhivery" className="h-full w-full object-cover" /> : null}
      {brand?.id === "shadowfax" ? <ShadowfaxMark /> : null}
      {!brand ? <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label.slice(0, 2)}</span> : null}
    </span>
  )
}

function BlueDartMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <rect width="48" height="48" fill="#0033A0" />
      <path d="M10 30 L24 8 L28 8 L16 30 Z" fill="#fff" />
      <path d="M22 30 L34 12 L38 12 L26 30 Z" fill="#7EB6FF" />
      <path d="M8 34 H40" stroke="#F5C518" strokeWidth="3" />
    </svg>
  )
}

function DtdcMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <rect width="48" height="48" fill="#E10600" />
      <text x="24" y="29" textAnchor="middle" fill="#fff" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="700">DTDC</text>
    </svg>
  )
}

function XpressBeesMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <rect width="48" height="48" fill="#111" />
      <rect y="16" width="48" height="16" fill="#FFD100" />
      <circle cx="18" cy="24" r="5" fill="#111" />
      <circle cx="30" cy="24" r="5" fill="#111" />
      <circle cx="18" cy="24" r="2" fill="#FFD100" />
      <circle cx="30" cy="24" r="2" fill="#FFD100" />
    </svg>
  )
}

function EkartMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <rect width="48" height="48" fill="#2874F0" />
      <path d="M12 18 H30 a6 6 0 0 1 0 12 H18" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M16 34 H34 L30 28 H20 Z" fill="#FFE11B" />
    </svg>
  )
}

function ShadowfaxMark() {
  return (
    <svg viewBox="0 0 76 44" className="size-full" aria-hidden="true">
      <rect width="76" height="44" fill="#fff" />
      <path d="M8 30 L16 10 L24 30 L20 30 L16 20 L12 30 Z" fill="#C5D92D" />
      <text x="28" y="22" fill="#0B6B3A" fontFamily="Arial, sans-serif" fontSize="7" fontWeight="700">SHADOW</text>
      <text x="28" y="31" fill="#0B6B3A" fontFamily="Arial, sans-serif" fontSize="7" fontWeight="700">FAX</text>
    </svg>
  )
}

function AmazonMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-full" aria-hidden="true">
      <rect width="48" height="48" fill="#232F3E" />
      <text x="24" y="22" textAnchor="middle" fill="#fff" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700">amazon</text>
      <path d="M12 28 C18 34 30 34 38 27" fill="none" stroke="#FF9900" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M33 26 L39 27 L36 32" fill="#FF9900" />
    </svg>
  )
}
