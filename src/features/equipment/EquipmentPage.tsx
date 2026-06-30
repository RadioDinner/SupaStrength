/**
 * Equipment + locations editor (BUILD_PLAN M1). Shows the active location's bar /
 * plate inventory / dumbbells and the per-user rounding preferences. Plate
 * inventory stores individual quantities; the UI derives pairs (floor(qty/2)),
 * exactly as the plate engine consumes them.
 */
import { useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { Banner, Button, Card, Field, Select, Spinner, TextInput } from '../../components/ui'
import { maxLoadableLb, type PlateStock } from '../../engine/plates'
import {
  useBarbells,
  useCreateLocation,
  useDumbbells,
  useLocations,
  usePlates,
  usePreferences,
  useSetDefaultLocation,
  useUpsertDumbbell,
  useUpsertPlate,
  useUpsertPreferences,
} from './useEquipment'
import type { RoundingDirection, CeilingBehavior } from '../../data/types'

export function EquipmentPage() {
  const { user } = useAuth()
  const userId = user!.id
  const { data: locations, isLoading: locLoading } = useLocations()
  const createLocation = useCreateLocation()
  const setDefault = useSetDefaultLocation()
  const [newLocation, setNewLocation] = useState('')

  const activeLocation = useMemo(
    () => locations?.find((l) => l.is_default) ?? locations?.[0] ?? null,
    [locations],
  )
  const activeId = activeLocation?.id ?? null

  if (locLoading) return <Spinner label="Loading equipment…" />

  return (
    <div className="page">
      <Card title="Locations" subtitle="Each location has its own bar, plates, and dumbbells.">
        <ul className="list">
          {(locations ?? []).map((l) => (
            <li key={l.id} className="list__row">
              <span>
                {l.name}
                {l.is_default ? <span className="badge">default</span> : null}
              </span>
              {!l.is_default ? (
                <Button variant="ghost" onClick={() => setDefault.mutate(l.id)}>
                  Set default
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!newLocation.trim()) return
            createLocation.mutate(newLocation.trim())
            setNewLocation('')
          }}
        >
          <TextInput
            placeholder="New location name"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
          />
          <Button type="submit" disabled={createLocation.isPending}>
            Add
          </Button>
        </form>
      </Card>

      {activeId ? (
        <>
          <BarbellsCard locationId={activeId} />
          <PlatesCard locationId={activeId} userId={userId} />
          <DumbbellsCard locationId={activeId} />
          <PreferencesCard userId={userId} />
        </>
      ) : (
        <Banner kind="warn">No location yet. Add one above.</Banner>
      )}
    </div>
  )
}

function BarbellsCard({ locationId }: { locationId: string }) {
  const { data: barbells } = useBarbells(locationId)
  return (
    <Card title="Barbells">
      <ul className="list">
        {(barbells ?? []).map((b) => (
          <li key={b.id} className="list__row">
            <span>
              {b.name}
              {b.is_default ? <span className="badge">default</span> : null}
            </span>
            <span className="mono">{b.weight_lb} lb</span>
          </li>
        ))}
        {barbells && barbells.length === 0 ? <li className="muted">No barbells.</li> : null}
      </ul>
    </Card>
  )
}

function PlatesCard({ locationId, userId }: { locationId: string; userId: string }) {
  const { data: plates } = usePlates(locationId)
  const { data: barbells } = useBarbells(locationId)
  const { data: prefs } = usePreferences(userId)
  const upsert = useUpsertPlate(locationId)

  const defaultBar = barbells?.find((b) => b.is_default) ?? barbells?.[0]
  const loadable = useMemo(() => {
    if (!plates || !defaultBar) return null
    const inv: PlateStock[] = plates.map((p) => ({
      denominationLb: p.denomination_lb,
      quantity: p.quantity,
    }))
    return maxLoadableLb(defaultBar.weight_lb, inv, prefs?.micro_plates_enabled ?? false)
  }, [plates, defaultBar, prefs])

  return (
    <Card
      title="Plates"
      subtitle={
        loadable != null
          ? `Max loadable on the ${defaultBar?.name}: ${loadable} lb`
          : 'Individual plate counts — pairs are derived.'
      }
    >
      <ul className="list">
        {(plates ?? []).map((p) => (
          <li key={p.id} className="list__row">
            <span className="mono">{p.denomination_lb} lb</span>
            <QuantityStepper
              value={p.quantity}
              suffix={`= ${Math.floor(p.quantity / 2)} pair${Math.floor(p.quantity / 2) === 1 ? '' : 's'}`}
              onChange={(quantity) => upsert.mutate({ denominationLb: p.denomination_lb, quantity })}
            />
          </li>
        ))}
        {plates && plates.length === 0 ? <li className="muted">No plates.</li> : null}
      </ul>
    </Card>
  )
}

function DumbbellsCard({ locationId }: { locationId: string }) {
  const { data: dumbbells } = useDumbbells(locationId)
  const upsert = useUpsertDumbbell(locationId)
  return (
    <Card title="Dumbbells">
      <ul className="list">
        {(dumbbells ?? []).map((d) => (
          <li key={d.id} className="list__row">
            <span className="mono">{d.weight_lb} lb</span>
            <QuantityStepper
              value={d.quantity}
              suffix={`= ${Math.floor(d.quantity / 2)} pair${Math.floor(d.quantity / 2) === 1 ? '' : 's'}`}
              onChange={(quantity) => upsert.mutate({ weightLb: d.weight_lb, quantity })}
            />
          </li>
        ))}
        {dumbbells && dumbbells.length === 0 ? <li className="muted">No dumbbells.</li> : null}
      </ul>
    </Card>
  )
}

function PreferencesCard({ userId }: { userId: string }) {
  const { data: prefs } = usePreferences(userId)
  const upsert = useUpsertPreferences(userId)
  if (!prefs) return null
  return (
    <Card title="Plate-calc preferences">
      <div className="form">
        <Field label="Rounding when a target isn't loadable" htmlFor="rounding">
          <Select
            id="rounding"
            value={prefs.rounding_direction}
            onChange={(e) =>
              upsert.mutate({ rounding_direction: e.target.value as RoundingDirection })
            }
          >
            <option value="down">Round down (lighter)</option>
            <option value="up">Round up (heavier)</option>
          </Select>
        </Field>

        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.micro_plates_enabled}
            onChange={(e) => upsert.mutate({ micro_plates_enabled: e.target.checked })}
          />
          <span>Enable 1.25 lb micro-plates</span>
        </label>

        <Field label="When a lift exceeds what's loadable" htmlFor="ceiling">
          <Select
            id="ceiling"
            value={prefs.ceiling_behavior}
            onChange={(e) => upsert.mutate({ ceiling_behavior: e.target.value as CeilingBehavior })}
          >
            <option value="hold_warn">Hold the weight and warn</option>
            <option value="auto_switch_reps">Auto-switch to rep progression</option>
          </Select>
        </Field>
      </div>
    </Card>
  )
}

function QuantityStepper({
  value,
  suffix,
  onChange,
}: {
  value: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <span className="stepper">
      <Button variant="ghost" aria-label="decrease" onClick={() => onChange(Math.max(0, value - 1))}>
        −
      </Button>
      <span className="stepper__value mono">{value}</span>
      <Button variant="ghost" aria-label="increase" onClick={() => onChange(value + 1)}>
        +
      </Button>
      {suffix ? <span className="stepper__suffix muted">{suffix}</span> : null}
    </span>
  )
}
