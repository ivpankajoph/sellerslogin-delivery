export const MAX_IMAGE_UPLOAD_BYTES = 100 * 1024
export const BLOG_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i
const BLOG_UPLOAD_FOLDERS = new Set(['blog'])

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSION.test(file.name)
}

export function getImageUploadMaxBytes(folder?: string): number {
  return folder && BLOG_UPLOAD_FOLDERS.has(folder)
    ? BLOG_IMAGE_UPLOAD_MAX_BYTES
    : MAX_IMAGE_UPLOAD_BYTES
}

export function imageUploadLimitMessage(maxBytes = MAX_IMAGE_UPLOAD_BYTES): string {
  if (maxBytes >= 1024 * 1024) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10
    return `Image is larger than ${mb} MB. Please upload an image of ${mb} MB or less.`
  }
  const kb = Math.round(maxBytes / 1024)
  return `Image is larger than ${kb} KB. Please upload an image of ${kb} KB or less.`
}

export function isImageWithinUploadLimit(
  file: File,
  maxBytes = MAX_IMAGE_UPLOAD_BYTES
): boolean {
  return !isImageFile(file) || file.size <= maxBytes
}

export function validateImageUpload(
  file: File,
  showPopup = true,
  maxBytes = MAX_IMAGE_UPLOAD_BYTES
): boolean {
  const valid = isImageWithinUploadLimit(file, maxBytes)
  if (!valid && showPopup) window.alert(imageUploadLimitMessage(maxBytes))
  return valid
}

export function validateImageUploads(
  files: Iterable<File>,
  showPopup = true,
  maxBytes = MAX_IMAGE_UPLOAD_BYTES
): boolean {
  const valid = Array.from(files).every((file) => isImageWithinUploadLimit(file, maxBytes))
  if (!valid && showPopup) window.alert(imageUploadLimitMessage(maxBytes))
  return valid
}

function limitHostFromEvent(event: Event): HTMLElement | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue
    if (
      node.dataset.skipImageUploadLimit === 'true' ||
      node.dataset.imageUploadMaxBytes
    ) {
      return node
    }
  }

  const target = event.target
  const start =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
  return (
    start?.closest<HTMLElement>(
      '[data-skip-image-upload-limit="true"], [data-image-upload-max-bytes]'
    ) || null
  )
}

function resolveUploadLimit(event: Event): { skip: boolean; maxBytes: number } {
  const host = limitHostFromEvent(event)
  if (!host) return { skip: false, maxBytes: MAX_IMAGE_UPLOAD_BYTES }
  if (host.dataset.skipImageUploadLimit === 'true') {
    return { skip: true, maxBytes: MAX_IMAGE_UPLOAD_BYTES }
  }
  const parsed = Number(host.dataset.imageUploadMaxBytes)
  if (Number.isFinite(parsed) && parsed > 0) {
    return { skip: false, maxBytes: parsed }
  }
  return { skip: false, maxBytes: MAX_IMAGE_UPLOAD_BYTES }
}

export function installImageUploadLimit(): void {
  const key = '__sellersLoginImageUploadLimitInstalled'
  const guardedWindow = window as unknown as Record<string, unknown>
  if (guardedWindow[key]) return
  guardedWindow[key] = true

  document.addEventListener(
    'change',
    (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement) || input.type !== 'file') return
      const { skip, maxBytes } = resolveUploadLimit(event)
      if (skip) return
      if (!input.files?.length || validateImageUploads(input.files, false, maxBytes))
        return

      event.preventDefault()
      event.stopImmediatePropagation()
      input.value = ''
      window.alert(imageUploadLimitMessage(maxBytes))
    },
    true
  )

  document.addEventListener(
    'drop',
    (event) => {
      const files = event.dataTransfer?.files
      const { skip, maxBytes } = resolveUploadLimit(event)
      if (skip) return
      if (!files?.length || validateImageUploads(files, false, maxBytes)) return

      event.preventDefault()
      event.stopImmediatePropagation()
      window.alert(imageUploadLimitMessage(maxBytes))
    },
    true
  )
}
