import api from '@/lib/axios'
import { getImageUploadMaxBytes, validateImageUpload } from '@/lib/image-upload-limit'
import { toast } from 'sonner'

export type MediaResourceType = 'image' | 'video' | 'raw'

type UploadMediaOptions = {
  suppressErrorToast?: boolean
  maxBytes?: number
}

export async function uploadMedia(
  file: File,
  folder: string,
  resourceType: MediaResourceType = 'image',
  options?: UploadMediaOptions
): Promise<string | null> {
  const maxBytes = options?.maxBytes ?? getImageUploadMaxBytes(folder)
  if (resourceType === 'image' && !validateImageUpload(file, true, maxBytes)) return null

  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('folder', folder)
    formData.append('resourceType', resourceType)

    const response = await api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })

    return response.data?.data?.url || response.data?.url || null
  } catch {
    if (!options?.suppressErrorToast) {
      toast.error('File upload failed. Try again.')
    }
    return null
  }
}

export async function uploadImage(
  file: File,
  folder: string,
  options?: UploadMediaOptions
): Promise<string | null> {
  return uploadMedia(file, folder, 'image', options)
}

export async function deleteMedia(objectKey: string): Promise<boolean> {
  try {
    await api.delete('/media/delete', { data: { objectKey } })
    return true
  } catch {
    return false
  }
}
