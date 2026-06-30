/**
 * Form-video repository (BUILD_PLAN M7 — scaffold only, no analysis). Captures a
 * short clip, stores it in the private `form-videos` bucket under
 * `{user_id}/{video_id}.{ext}` (storage RLS keys ownership off the first path
 * segment), records a `videos` row, and links it both ways to a `set_logs` row.
 *
 * Retention: `videos.expires_at` defaults to now()+30d (SPEC §10); a scheduled
 * purge job enforces it server-side. Nothing here deletes on a schedule.
 */
import { onlineDataClient } from '../online/supabaseDataClient'
import type { SetLog, Video } from '../types'

const BUCKET = 'form-videos'
export const MAX_VIDEO_SECONDS = 30

function extFromType(mime: string): string {
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('quicktime') || mime.includes('mov')) return 'mov'
  if (mime.includes('webm')) return 'webm'
  return 'mp4'
}

export const videosRepo = {
  /** Upload a clip and attach it to a logged set. Rejects clips > 30 s. */
  async recordForSet(input: {
    userId: string
    setLogId: string
    file: Blob
    durationSeconds: number
  }): Promise<Video> {
    if (input.durationSeconds > MAX_VIDEO_SECONDS + 0.5) {
      throw new Error(
        `Clip is ${Math.round(input.durationSeconds)} s — the limit is ${MAX_VIDEO_SECONDS} s.`,
      )
    }
    const videoId = crypto.randomUUID()
    const mime = input.file.type || 'video/mp4'
    // First path segment MUST equal auth.uid() — storage RLS owns by folder.
    const path = `${input.userId}/${videoId}.${extFromType(mime)}`

    await onlineDataClient.uploadFile(BUCKET, path, input.file, { contentType: mime })

    let row: Video
    try {
      const [created] = await onlineDataClient.insert<Video>('videos', {
        id: videoId,
        set_log_id: input.setLogId,
        storage_path: path,
        duration_seconds: Number(input.durationSeconds.toFixed(2)),
        mime_type: mime,
        size_bytes: input.file.size,
      })
      if (!created) throw new Error('Video row was not created.')
      row = created
    } catch (err) {
      // Roll back the orphaned object so a failed insert can't leak storage.
      await onlineDataClient.removeFiles(BUCKET, [path]).catch(() => {})
      throw err
    }

    // Reciprocal link: point the set log at this video.
    await onlineDataClient.update<SetLog>('set_logs', { video_id: videoId }, [
      { column: 'id', op: 'eq', value: input.setLogId },
    ])
    return row
  },

  /** The video attached to a set, if any. */
  async getForSet(setLogId: string): Promise<Video | null> {
    return onlineDataClient.getOne<Video>('videos', [
      { column: 'set_log_id', op: 'eq', value: setLogId },
    ])
  },

  /** A short-lived signed URL to play a private clip. */
  signedUrl(storagePath: string): Promise<string> {
    return onlineDataClient.signedUrl(BUCKET, storagePath, 60 * 60)
  },

  /**
   * Delete a clip (object + row). The `videos.set_log_id` FK is `on delete set
   * null`, so the set log's pointer clears automatically. Only usable while the
   * owning session is still in progress (completed-session children are frozen).
   */
  async delete(video: Pick<Video, 'id' | 'storage_path' | 'set_log_id'>): Promise<void> {
    if (video.set_log_id) {
      await onlineDataClient
        .update<SetLog>('set_logs', { video_id: null }, [
          { column: 'id', op: 'eq', value: video.set_log_id },
        ])
        .catch(() => {})
    }
    await onlineDataClient.remove('videos', [{ column: 'id', op: 'eq', value: video.id }])
    await onlineDataClient.removeFiles(BUCKET, [video.storage_path]).catch(() => {})
  },
}
