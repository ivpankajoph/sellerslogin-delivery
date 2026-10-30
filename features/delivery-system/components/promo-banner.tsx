"use client"

const steps = [
  {
    step: "01",
    title: "Create warehouse",
    text: "Add the pickup location.",
    x: 48,
  },
  {
    step: "02",
    title: "Add or create an order",
    text: "Use a website order, or create one.",
    x: 432,
  },
  {
    step: "03",
    title: "Place the order",
    text: "Compare price, then request delivery.",
    x: 816,
  },
]

export function DeliveryPromoBanner() {
  return (
    <section className="w-full overflow-hidden rounded-2xl border bg-[#e8f6ee] shadow-sm">
      <svg viewBox="0 0 1200 420" className="block h-auto w-full" role="img" aria-label="Three delivery steps">
        <rect width="1200" height="420" fill="#e8f6ee" />
        <text
          x="48"
          y="48"
          fill="#3caf74"
          fontSize="16"
          fontWeight="700"
          letterSpacing="1.5"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          DELIVERY IN 3 STEPS
        </text>
        <text
          x="48"
          y="84"
          fill="#163024"
          fontSize="28"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          This dashboard works in just three steps.
        </text>
        <ellipse cx="600" cy="392" rx="460" ry="16" fill="#cfe8d8" />

        <g>
          <rect x="48" y="118" width="336" height="118" rx="18" fill="#ffffff" />
          <circle cx="118" cy="168" r="26" fill="#f3d2b5" />
          <path d="M88 196c8-24 52-24 60 0v14H88z" fill="#163024" />
          <path d="M84 222c0-16 16-26 34-26s34 10 34 26v8H84z" fill="#3caf74" />
          <rect x="196" y="146" width="140" height="64" rx="10" fill="#d7efe2" />
          <path d="M216 170h100M216 188h68" stroke="#3caf74" strokeWidth="6" strokeLinecap="round" />
        </g>

        <g>
          <rect x="432" y="118" width="336" height="118" rx="18" fill="#ffffff" />
          <circle cx="502" cy="168" r="26" fill="#e7b896" />
          <path d="M472 196c8-24 52-24 60 0v14h-60z" fill="#1f2937" />
          <path d="M468 222c0-16 16-26 34-26s34 10 34 26v8h-68z" fill="#163024" />
          <rect x="580" y="150" width="120" height="58" rx="10" fill="#3caf74" />
          <path d="M600 172h80M600 190h48" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
        </g>

        <g>
          <rect x="816" y="118" width="336" height="118" rx="18" fill="#ffffff" />
          <rect x="848" y="156" width="150" height="58" rx="12" fill="#3caf74" />
          <circle cx="882" cy="220" r="12" fill="#163024" />
          <circle cx="964" cy="220" r="12" fill="#163024" />
          <circle cx="1064" cy="162" r="22" fill="#f6d7c3" />
          <path d="M1040 186c6-18 42-18 50 0v10h-50z" fill="#3caf74" />
          <path d="M1034 206c0-12 14-20 30-20s30 8 30 20v12h-60z" fill="#ffffff" stroke="#163024" strokeWidth="3" />
        </g>

        {steps.map((item) => (
          <g key={item.step}>
            <rect x={item.x} y="254" width="336" height="112" rx="16" fill="#ffffff" />
            <foreignObject x={item.x + 18} y="268" width="300" height="86">
              <div style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#163024" }}>
                <div style={{ color: "#3caf74", fontWeight: 700, fontSize: 16 }}>{item.step}</div>
                <div style={{ marginTop: 4, fontWeight: 700, fontSize: 18, lineHeight: 1.25 }}>{item.title}</div>
                <div style={{ marginTop: 4, color: "#5f6f66", fontSize: 15, lineHeight: 1.3 }}>{item.text}</div>
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
    </section>
  )
}
