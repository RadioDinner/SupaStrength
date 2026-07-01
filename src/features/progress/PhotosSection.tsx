/**
 * Progress photos (BUILD_PLAN M8): categorized capture/upload to the private
 * bucket, a recent grid, and a side-by-side two-date compare. Scaffold-grade —
 * storage path can't be exercised without a device + live Storage.
 */
import { useMemo, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Banner, Button, Card, ConfirmDialog, EmptyState, Select, SkeletonList, TextInput } from '../../components/ui'
import { useDeletePhoto, usePhotoUrl, useRecentPhotos, useUploadPhoto } from './useProgress'
import type { PhotoCategory, ProgressPhoto } from '../../data/types'

const CATEGORIES: { value: PhotoCategory; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side', label: 'Side' },
  { value: 'back', label: 'Back' },
  { value: 'custom', label: 'Custom' },
]

export function PhotosSection({ userId }: { userId: string }) {
  const { data: photos, isLoading } = useRecentPhotos()
  const upload = useUploadPhoto(userId)
  const del = useDeletePhoto()
  const [category, setCategory] = useState<PhotoCategory>('front')
  const [customLabel, setCustomLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [compare, setCompare] = useState<[string | null, string | null]>([null, null])
  const [pendingDelete, setPendingDelete] = useState<ProgressPhoto | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload.mutateAsync({ category, customLabel: customLabel || null, file })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const byId = useMemo(() => new Map((photos ?? []).map((p) => [p.id, p])), [photos])
  const [aId, bId] = compare
  const a = aId ? byId.get(aId) ?? null : null
  const b = bId ? byId.get(bId) ?? null : null

  function toggleCompare(id: string) {
    setCompare(([x, y]) => {
      if (x === id) return [y, null]
      if (y === id) return [x, null]
      if (!x) return [id, y]
      if (!y) return [x, id]
      return [y, id] // shift: drop oldest
    })
  }

  return (
    <>
      <Card title="Add a photo" subtitle="Stored privately; kept ~1 year">
        <div className="form">
          <div className="rowbtns">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as PhotoCategory)}
              aria-label="Photo category"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            {category === 'custom' ? (
              <TextInput
                placeholder="Label (e.g. legs)"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                aria-label="Custom label"
              />
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={onPick}
            id="photopick"
          />
          <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? (
              'Uploading…'
            ) : (
              <>
                <Camera size={18} aria-hidden="true" /> Take / choose photo
              </>
            )}
          </Button>
          {error ? <Banner kind="err">{error}</Banner> : null}
        </div>
      </Card>

      {a || b ? (
        <Card title="Compare" subtitle="Pick two photos below to line them up">
          <div className="comparepair">
            <ComparePane photo={a} />
            <ComparePane photo={b} />
          </div>
          <Button variant="ghost" onClick={() => setCompare([null, null])}>
            Clear compare
          </Button>
        </Card>
      ) : null}

      {isLoading ? (
        <SkeletonList rows={2} />
      ) : (photos ?? []).length === 0 ? (
        <EmptyState
          icon={<Camera size={40} aria-hidden="true" />}
          title="No photos yet"
          hint="Snap a front/side/back photo to track visual progress over time."
        />
      ) : (
        <Card title="Your photos" subtitle="Tap to add to compare">
          <div className="photogrid">
            {photos!.map((p) => (
              <PhotoThumb
                key={p.id}
                photo={p}
                selected={aId === p.id || bId === p.id}
                onSelect={() => toggleCompare(p.id)}
                onDelete={() => setPendingDelete(p)}
              />
            ))}
          </div>
        </Card>
      )}

      {pendingDelete ? (
        <ConfirmDialog
          title="Delete this photo?"
          body="This permanently removes the photo — it can't be undone."
          confirmLabel="Delete"
          danger
          pending={del.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            const { id, storage_path } = pendingDelete
            setError(null)
            try {
              await del.mutateAsync({ id, storage_path })
              // Drop the deleted photo from the compare panes if it was picked.
              setCompare(([x, y]) => [x === id ? null : x, y === id ? null : y])
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            } finally {
              setPendingDelete(null)
            }
          }}
        />
      ) : null}
    </>
  )
}

function PhotoThumb({
  photo,
  selected,
  onSelect,
  onDelete,
}: {
  photo: ProgressPhoto
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { data: url } = usePhotoUrl(photo.storage_path)
  return (
    <figure className={`photothumb ${selected ? 'is-selected' : ''}`}>
      <button type="button" className="photothumb__btn" onClick={onSelect}>
        {url ? (
          <img src={url} alt={`${photo.category} ${photo.taken_on}`} loading="lazy" />
        ) : (
          <span className="photothumb__ph" aria-hidden="true" />
        )}
      </button>
      <figcaption className="photothumb__cap">
        <span>{photo.custom_label ?? photo.category}</span>
        <span className="mono">{photo.taken_on.slice(5)}</span>
      </figcaption>
      <button type="button" className="photothumb__del" aria-label="Delete photo" onClick={onDelete}>
        <X size={18} aria-hidden="true" />
      </button>
    </figure>
  )
}

function ComparePane({ photo }: { photo: ProgressPhoto | null }) {
  const { data: url } = usePhotoUrl(photo?.storage_path ?? null)
  return (
    <div className="comparepane">
      {photo && url ? (
        <>
          <img src={url} alt={`${photo.category} ${photo.taken_on}`} />
          <span className="comparepane__cap mono">
            {photo.custom_label ?? photo.category} · {photo.taken_on}
          </span>
        </>
      ) : (
        <span className="comparepane__empty muted">Pick a photo</span>
      )}
    </div>
  )
}
