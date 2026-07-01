/**
 * Profile editor (BUILD_PLAN M1). Edits display_name, sex, birthdate, height,
 * bodyweight (stamps bodyweight_updated_at), unit system (display-only).
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Banner, Button, Card, Field, Select, SkeletonList, TextInput } from '../../components/ui'
import { useProfile, useUpdateProfile } from './useProfile'
import type { Sex, UnitSystem } from '../../data/types'

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const userId = user!.id
  const { data: profile, isLoading } = useProfile(userId)
  const update = useUpdateProfile(userId)

  const [form, setForm] = useState({
    display_name: '',
    sex: 'male' as Sex,
    birthdate: '',
    height_in: '',
    bodyweight_lb: '',
    unit_system: 'imperial' as UnitSystem,
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!profile) return
    setForm({
      display_name: profile.display_name ?? '',
      sex: profile.sex,
      birthdate: profile.birthdate ?? '',
      height_in: profile.height_in?.toString() ?? '',
      bodyweight_lb: profile.bodyweight_lb?.toString() ?? '',
      unit_system: profile.unit_system,
    })
  }, [profile])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    await update.mutateAsync({
      display_name: form.display_name.trim() || null,
      sex: form.sex,
      birthdate: form.birthdate || null,
      height_in: form.height_in ? Number(form.height_in) : null,
      bodyweight_lb: form.bodyweight_lb ? Number(form.bodyweight_lb) : null,
      unit_system: form.unit_system,
    })
    setSaved(true)
  }

  if (isLoading) return <SkeletonList rows={2} />

  return (
    <div className="page">
      <Card title="Profile" subtitle="Used for strength standards and the dashboard.">
        <form onSubmit={onSubmit} className="form">
          <Field label="Display name" htmlFor="display_name">
            <TextInput
              id="display_name"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </Field>

          <div className="grid2">
            <Field label="Sex" htmlFor="sex" hint="For strength standards">
              <Select
                id="sex"
                value={form.sex}
                onChange={(e) => setForm({ ...form, sex: e.target.value as Sex })}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
            </Field>
            <Field label="Birthdate" htmlFor="birthdate">
              <TextInput
                id="birthdate"
                type="date"
                value={form.birthdate}
                onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid2">
            <Field label="Height (in)" htmlFor="height_in">
              <TextInput
                id="height_in"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="24"
                max="108"
                value={form.height_in}
                onChange={(e) => setForm({ ...form, height_in: e.target.value })}
              />
            </Field>
            <Field label="Bodyweight (lb)" htmlFor="bodyweight_lb" hint="Stamps the weigh-in date">
              <TextInput
                id="bodyweight_lb"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="30"
                max="1500"
                value={form.bodyweight_lb}
                onChange={(e) => setForm({ ...form, bodyweight_lb: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Units" htmlFor="unit_system" hint="Display only — data is stored in lb/in">
            <Select
              id="unit_system"
              value={form.unit_system}
              onChange={(e) => setForm({ ...form, unit_system: e.target.value as UnitSystem })}
            >
              <option value="imperial">Imperial (lb / in)</option>
              <option value="metric">Metric (display)</option>
            </Select>
          </Field>

          {update.isError ? (
            <Banner kind="err">{(update.error as Error).message}</Banner>
          ) : null}
          {saved && !update.isPending ? <Banner kind="ok">Saved.</Banner> : null}

          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </Card>

      <Card title="More">
        <ul className="list">
          <li className="list__row">
            <Link to="/equipment" className="navrow">
              <span>
                <span className="workout-link__name">Gym, plates &amp; preferences</span>
                <span className="muted">Bars, plate inventory, dumbbells, rounding</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" className="navrow__icon" />
            </Link>
          </li>
          <li className="list__row">
            <Link to="/exercises" className="navrow">
              <span>
                <span className="workout-link__name">Exercise library</span>
                <span className="muted">Browse all movements and your custom exercises</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" className="navrow__icon" />
            </Link>
          </li>
          <li className="list__row">
            <Link to="/progress" className="navrow">
              <span>
                <span className="workout-link__name">Measurements, photos &amp; reminders</span>
                <span className="muted">Track bodyweight + girths, progress photos, check-ins</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" className="navrow__icon" />
            </Link>
          </li>
        </ul>
      </Card>

      <Button variant="ghost" className="btn--block" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  )
}
