/**
 * Progress-photos repository (BUILD_PLAN M8). Private `progress-photos` bucket
 * (`{user_id}/{photo_id}.{ext}`, owner-by-folder RLS). Categorized front/side/
 * back/custom, ~1-year retention (`expires_at`, purged server-side). Inserting a
 * row trips the DB trigger that bumps the photos reminder.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import type { PhotoCategory, ProgressPhoto } from '../types'

const BUCKET = 'progress-photos'

function extFromType(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('heic') || mime.includes('heif')) return 'heic'
  return 'jpg'
}

export const photosRepo = {
  recent(limit = 60): Promise<ProgressPhoto[]> {
    return onlineDataClient.list<ProgressPhoto>('progress_photos', {
      order: [{ column: 'taken_on', ascending: false }],
      limit,
    })
  },

  async upload(input: {
    userId: string
    category: PhotoCategory
    customLabel?: string | null
    file: Blob
    takenOn?: string
  }): Promise<ProgressPhoto> {
    const photoId = crypto.randomUUID()
    const mime = input.file.type || 'image/jpeg'
    const path = `${input.userId}/${photoId}.${extFromType(mime)}`

    await onlineDataClient.uploadFile(BUCKET, path, input.file, { contentType: mime })
    try {
      const [row] = await onlineDataClient.insert<ProgressPhoto>('progress_photos', {
        id: photoId,
        storage_path: path,
        category: input.category,
        custom_label: input.category === 'custom' ? input.customLabel ?? 'Custom' : null,
        taken_on: input.takenOn,
        mime_type: mime,
        size_bytes: input.file.size,
      })
      if (!row) throw new Error('Photo row was not created.')
      return row
    } catch (err) {
      await onlineDataClient.removeFiles(BUCKET, [path]).catch(() => {})
      throw err
    }
  },

  /** One request for many photos (path → signed url) — avoids an N+1 fan-out. */
  signedUrls(storagePaths: string[]): Promise<Record<string, string>> {
    return onlineDataClient.signedUrls(BUCKET, storagePaths, 60 * 60)
  },

  async delete(photo: Pick<ProgressPhoto, 'id' | 'storage_path'>): Promise<void> {
    await onlineDataClient.remove('progress_photos', [
      { column: 'id', op: 'eq', value: photo.id },
    ])
    await onlineDataClient.removeFiles(BUCKET, [photo.storage_path]).catch(() => {})
  },
}
