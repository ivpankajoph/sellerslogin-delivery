"use client"

import { useEffect, useRef } from "react"

const project = (latitude: number, longitude: number, zoom: number) => {
  const scale = 256 * 2 ** zoom
  const x = ((longitude + 180) / 360) * scale
  const sine = Math.sin((latitude * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale
  return { x, y }
}

const unproject = (x: number, y: number, zoom: number) => {
  const scale = 256 * 2 ** zoom
  const longitude = (x / scale) * 360 - 180
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))) * 180) / Math.PI
  return { latitude, longitude }
}

export function LocationPinMap({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number
  longitude: number
  onChange: (latitude: number, longitude: number) => void
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef({ latitude, longitude })
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  centerRef.current = { latitude, longitude }

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const zoom = 16
    let dragging = false
    let moved = false
    let lastX = 0
    let lastY = 0

    const draw = () => {
      const { latitude: lat, longitude: lng } = centerRef.current
      const center = project(lat, lng, zoom)
      const width = map.clientWidth
      const height = map.clientHeight
      const originX = center.x - width / 2
      const originY = center.y - height / 2
      const tileCount = 2 ** zoom
      map.querySelectorAll("[data-tile]").forEach((tile) => tile.remove())
      const startX = Math.floor(originX / 256)
      const endX = Math.floor((originX + width) / 256)
      const startY = Math.floor(originY / 256)
      const endY = Math.floor((originY + height) / 256)
      for (let tileX = startX; tileX <= endX; tileX += 1) {
        for (let tileY = startY; tileY <= endY; tileY += 1) {
          if (tileY < 0 || tileY >= tileCount) continue
          const image = document.createElement("img")
          image.dataset.tile = "1"
          image.alt = ""
          image.draggable = false
          image.className = "pointer-events-none absolute h-64 w-64 max-w-none select-none"
          const wrappedX = ((tileX % tileCount) + tileCount) % tileCount
          image.src = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`
          image.style.left = `${tileX * 256 - originX}px`
          image.style.top = `${tileY * 256 - originY}px`
          map.appendChild(image)
        }
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      dragging = true
      moved = false
      lastX = event.clientX
      lastY = event.clientY
      map.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      lastX = event.clientX
      lastY = event.clientY
      const center = project(centerRef.current.latitude, centerRef.current.longitude, zoom)
      const next = unproject(center.x - dx, center.y - dy, zoom)
      centerRef.current = next
      draw()
    }
    const onPointerUp = () => {
      if (!dragging) return
      dragging = false
      if (moved) onChangeRef.current(centerRef.current.latitude, centerRef.current.longitude)
    }
    const onClick = (event: MouseEvent) => {
      if (moved) return
      const rect = map.getBoundingClientRect()
      const center = project(centerRef.current.latitude, centerRef.current.longitude, zoom)
      const next = unproject(
        center.x - map.clientWidth / 2 + (event.clientX - rect.left),
        center.y - map.clientHeight / 2 + (event.clientY - rect.top),
        zoom
      )
      centerRef.current = next
      draw()
      onChangeRef.current(next.latitude, next.longitude)
    }

    draw()
    map.addEventListener("pointerdown", onPointerDown)
    map.addEventListener("pointermove", onPointerMove)
    map.addEventListener("pointerup", onPointerUp)
    map.addEventListener("click", onClick)
    window.addEventListener("resize", draw)
    return () => {
      map.removeEventListener("pointerdown", onPointerDown)
      map.removeEventListener("pointermove", onPointerMove)
      map.removeEventListener("pointerup", onPointerUp)
      map.removeEventListener("click", onClick)
      window.removeEventListener("resize", draw)
    }
  }, [latitude, longitude])

  return (
    <div className="relative h-72 overflow-hidden rounded-md border bg-muted">
      <div ref={mapRef} className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -ml-[9px] -mt-[18px] h-[18px] w-[18px] rotate-[-45deg] rounded-[50%_50%_50%_0] border-2 border-white bg-violet-600 shadow" />
    </div>
  )
}
