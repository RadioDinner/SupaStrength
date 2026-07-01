/**
 * Form-video capture + playback sheet (BUILD_PLAN M7 — scaffold only).
 * - No clip yet → native-camera capture (`<input capture>`), 30 s cap enforced
 *   client-side before upload.
 * - Clip exists → scrub (native controls) + slow-mo playback (0.25/0.5/1×) +
 *   delete. Clean seam for future pose/form analysis — none today.
 */
import { Video as VideoIcon, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Banner, Button, Spinner } from '../../components/ui'
import { useDialog } from '../../hooks/useDialog'
import { MAX_VIDEO_SECONDS } from '../../data/repos/videosRepo'
import type { Video } from '../../data/types'
import { useDeleteVideo, useRecordVideo, useSetVideo, useVideoUrl } from './useVideos'

/** Read a media file's duration (seconds) via a throwaway <video> element. */
function readDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(v.duration)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read this video.'))
    }
    v.src = url
  })
}

export function VideoSheet({
  setLogId,
  userId,
  setLabel,
  onClose,
}: {
  setLogId: string
  userId: string
  setLabel: string
  onClose: () => void
}) {
  const { data: video, isLoading } = useSetVideo(setLogId)
  const panelRef = useDialog<HTMLDivElement>(onClose)
  const titleId = useId()

  return (
    <div className="sheet">
      <div className="sheet__backdrop" onClick={onClose} />
      <div
        className="sheet__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="sheet__head">
          <h3 className="sheet__title" id={titleId}>
            <VideoIcon size={18} aria-hidden="true" />
            Form video · {setLabel}
          </h3>
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <Spinner label="Loading…" />
        ) : video ? (
          <Playback video={video} onClose={onClose} />
        ) : (
          <Capture setLogId={setLogId} userId={userId} />
        )}
      </div>
    </div>
  )
}

function Capture({ setLogId, userId }: { setLogId: string; userId: string }) {
  const record = useRecordVideo(userId)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const duration = await readDuration(file)
      if (duration > MAX_VIDEO_SECONDS + 0.5) {
        setError(`That clip is ${Math.round(duration)} s — keep it under ${MAX_VIDEO_SECONDS} s.`)
        return
      }
      await record.mutateAsync({ setLogId, file, durationSeconds: duration })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="vidcapture">
      <p className="muted">
        Capture a short clip of this set to check your form. Max {MAX_VIDEO_SECONDS} s; kept for 30
        days.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={onPick}
        hidden
        id="vidpick"
      />
      <Button onClick={() => inputRef.current?.click()} disabled={record.isPending}>
        {record.isPending ? (
          'Uploading…'
        ) : (
          <>
            <VideoIcon size={18} aria-hidden="true" />
            Record / choose clip
          </>
        )}
      </Button>
      {error ? <Banner kind="err">{error}</Banner> : null}
    </div>
  )
}

function Playback({ video, onClose }: { video: Video; onClose: () => void }) {
  const { data: url, isLoading, error } = useVideoUrl(video.storage_path)
  const del = useDeleteVideo()
  const ref = useRef<HTMLVideoElement>(null)
  const [rate, setRate] = useState(1)

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate
  }, [rate, url])

  return (
    <div className="vidplay">
      {isLoading ? (
        <Spinner label="Loading clip…" />
      ) : error || !url ? (
        <Banner kind="err">Couldn’t load this clip.</Banner>
      ) : (
        <>
          <video ref={ref} className="vidplay__video" src={url} controls playsInline preload="metadata" />
          <div className="vidplay__rates" role="group" aria-label="Playback speed">
            {[0.25, 0.5, 1].map((r) => (
              <button
                key={r}
                type="button"
                className={`seg__btn ${rate === r ? 'seg__btn--on' : ''}`}
                aria-pressed={rate === r}
                onClick={() => setRate(r)}
              >
                {r}×
              </button>
            ))}
          </div>
        </>
      )}
      <div className="vidplay__meta muted">
        {Math.round(video.duration_seconds)} s · expires{' '}
        {new Date(video.expires_at).toLocaleDateString()}
      </div>
      <Button
        variant="ghost"
        disabled={del.isPending}
        onClick={async () => {
          await del.mutateAsync(video)
          onClose()
        }}
      >
        {del.isPending ? 'Deleting…' : 'Delete clip'}
      </Button>
    </div>
  )
}
