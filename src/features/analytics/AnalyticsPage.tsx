/**
 * Analytics (BUILD_PLAN M6, SPEC §8/§9). A Recharts radar over the 12 muscle
 * groups (in `radar_order`) with:
 *   - volume↔strength mode,
 *   - volume metric (hard sets / tonnage / total reps),
 *   - time window (7d / 4wk / 12wk / all),
 *   - count-secondary toggle (secondary muscles weighted 0.5),
 *   - a weakest-area view: relative-to-you vs relative-to-standards,
 *   - "most often" frequency lists.
 * All UI state persists in `chart_preferences` (optimistic). Everything is
 * recomputed from the `v_*` views per window — no stored aggregates.
 */
import { useMemo } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { Banner, Card, EmptyState, SkeletonList } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useMuscleGroups } from '../exercises/useExercises'
import { useProfile } from '../settings/useProfile'
import {
  useChartPreferences,
  useFrequency,
  useMuscleStrength,
  useMuscleVolume,
  useSaveChartPreferences,
  useStrengthVsStandards,
} from './useAnalytics'
import { CHART_PREFERENCE_DEFAULTS } from '../../data/repos/analyticsRepo'
import type {
  LiftKey,
  RadarMode,
  StandardBand,
  TimeWindow,
  VolumeMetric,
  WeakestView,
} from '../../data/types'

const WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '4wk', label: '4wk' },
  { value: '12wk', label: '12wk' },
  { value: 'all', label: 'All' },
]
const METRICS: { value: VolumeMetric; label: string }[] = [
  { value: 'hard_sets', label: 'Hard sets' },
  { value: 'tonnage', label: 'Tonnage' },
  { value: 'total_reps', label: 'Reps' },
]
const MODES: { value: RadarMode; label: string }[] = [
  { value: 'volume', label: 'Volume' },
  { value: 'strength', label: 'Strength' },
]
const WEAKEST: { value: WeakestView; label: string }[] = [
  { value: 'relative', label: 'Relative to you' },
  { value: 'standards', label: 'Vs standards' },
]

const LIFT_LABEL: Record<LiftKey, string> = {
  squat: 'Squat',
  bench: 'Bench',
  deadlift: 'Deadlift',
  ohp: 'Overhead press',
  row: 'Row',
}
const LIFT_ORDER: LiftKey[] = ['squat', 'bench', 'deadlift', 'ohp', 'row']

const BANDS: StandardBand[] = ['beginner', 'novice', 'intermediate', 'advanced', 'elite']
const BAND_LABEL: Record<StandardBand, string> = {
  beginner: 'Beginner',
  novice: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite',
}

const fmtNum = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`seg__btn ${o.value === value ? 'seg__btn--on' : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function AnalyticsPage() {
  const { data: prefsRow, isLoading: prefsLoading } = useChartPreferences()
  const savePrefs = useSaveChartPreferences()
  const prefs = { ...CHART_PREFERENCE_DEFAULTS, ...(prefsRow ?? {}) }

  const { user } = useAuth()
  const { data: groups } = useMuscleGroups()
  const { data: profile } = useProfile(user!.id)
  const { data: volume, isLoading: volLoading } = useMuscleVolume(prefs.time_window)
  const { data: strength, isLoading: strLoading } = useMuscleStrength()
  const { data: standards } = useStrengthVsStandards()
  const { data: frequency } = useFrequency(prefs.time_window)

  const set = (patch: Partial<typeof CHART_PREFERENCE_DEFAULTS>) => savePrefs.mutate(patch)

  // --- radar data: 12 spokes in radar_order, max-normalized 0–100 ----------
  const radar = useMemo(() => {
    const orderedGroups = (groups ?? []).slice().sort((a, b) => a.radar_order - b.radar_order)
    const volById = new Map((volume ?? []).map((v) => [v.muscleGroupId, v]))
    const strById = new Map((strength ?? []).map((s) => [s.muscle_group_id, s]))

    const raw = orderedGroups.map((g) => {
      let value = 0
      if (prefs.radar_mode === 'strength') {
        value = Number(strById.get(g.id)?.strength_e1rm_lb ?? 0)
      } else {
        const v = volById.get(g.id)
        if (v) {
          value =
            prefs.volume_metric === 'tonnage'
              ? v.tonnageLb
              : prefs.volume_metric === 'total_reps'
                ? v.totalReps
                : prefs.count_secondary
                  ? v.hardSets
                  : v.hardSetsPrimary
        }
      }
      return { muscle: g.display_name, raw: value }
    })
    const max = Math.max(0, ...raw.map((r) => r.raw))
    return raw.map((r) => ({
      muscle: r.muscle,
      raw: r.raw,
      value: max > 0 ? Math.round((r.raw / max) * 100) : 0,
    }))
  }, [groups, volume, strength, prefs.radar_mode, prefs.volume_metric, prefs.count_secondary])

  const hasData = radar.some((r) => r.raw > 0)
  const loading = prefsLoading || (prefs.radar_mode === 'volume' ? volLoading : strLoading)

  if (loading) return <SkeletonList rows={3} />

  return (
    <div className="page">
      <Card
        title="Analytics"
        subtitle={prefs.radar_mode === 'volume' ? 'Where your training lands' : 'How strong, where'}
      >
        <div className="ancontrols">
          <Segmented
            label="Radar mode"
            value={prefs.radar_mode}
            options={MODES}
            onChange={(v) => set({ radar_mode: v })}
          />
          <Segmented
            label="Time window"
            value={prefs.time_window}
            options={WINDOWS}
            onChange={(v) => set({ time_window: v as TimeWindow })}
          />
          {prefs.radar_mode === 'volume' ? (
            <Segmented
              label="Volume metric"
              value={prefs.volume_metric}
              options={METRICS}
              onChange={(v) => set({ volume_metric: v })}
            />
          ) : null}
        </div>
        {prefs.radar_mode === 'volume' ? (
          <label className="antoggle">
            <input
              type="checkbox"
              checked={prefs.count_secondary}
              onChange={(e) => set({ count_secondary: e.target.checked })}
            />
            <span>Count secondary muscles (½ weight)</span>
          </label>
        ) : null}
      </Card>

      {!hasData ? (
        <EmptyState
          icon="📊"
          title={prefs.radar_mode === 'strength' ? 'No strength data yet' : 'No volume logged yet'}
          hint={
            prefs.radar_mode === 'strength'
              ? 'Log a few loaded working sets and your estimated 1RM per muscle will fill in the radar.'
              : 'Complete a session with working sets and this radar maps your volume across all 12 muscle groups.'
          }
        />
      ) : (
        <Card>
          <div className="radarwrap">
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={radar} outerRadius="78%">
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis
                  dataKey="muscle"
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  name={prefs.radar_mode}
                  dataKey="value"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.32}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <ul className="radarlegend">
            {radar
              .slice()
              .sort((a, b) => a.raw - b.raw)
              .slice(0, 3)
              .map((r) => (
                <li key={r.muscle} className="radarlegend__item">
                  <span className="radarlegend__dot" aria-hidden="true" />
                  <span className="radarlegend__name">{r.muscle}</span>
                  <span className="radarlegend__val mono">
                    {prefs.radar_mode === 'strength'
                      ? `${fmtNum(r.raw)} lb`
                      : prefs.volume_metric === 'tonnage'
                        ? `${fmtNum(r.raw)} lb`
                        : prefs.volume_metric === 'total_reps'
                          ? `${fmtNum(r.raw)} reps`
                          : `${r.raw.toFixed(r.raw < 10 ? 1 : 0)} sets`}
                  </span>
                </li>
              ))}
          </ul>
          <p className="muted radarlegend__cap">Your 3 lowest-volume areas right now.</p>
        </Card>
      )}

      <Card
        title="Weakest areas"
        subtitle="Compared to yourself, or to lifter standards"
        actions={
          <Segmented
            label="Weakest view"
            value={prefs.weakest_view}
            options={WEAKEST}
            onChange={(v) => set({ weakest_view: v })}
          />
        }
      >
        {prefs.weakest_view === 'standards' ? (
          <StandardsPanel
            standards={standards ?? []}
            bodyweightUpdatedAt={profile?.bodyweight_updated_at ?? null}
            hasBodyweight={!!profile?.bodyweight_lb}
          />
        ) : (
          <RelativePanel radar={radar} mode={prefs.radar_mode} metric={prefs.volume_metric} />
        )}
      </Card>

      <FrequencyLists rows={frequency ?? []} window={prefs.time_window} />
    </div>
  )
}

function RelativePanel({
  radar,
  mode,
  metric,
}: {
  radar: { muscle: string; raw: number; value: number }[]
  mode: RadarMode
  metric: VolumeMetric
}) {
  const ranked = radar.slice().sort((a, b) => a.value - b.value)
  if (!ranked.some((r) => r.raw > 0)) {
    return <p className="muted">Log some working sets to rank your weakest areas.</p>
  }
  const unit = mode === 'strength' || metric === 'tonnage' ? 'lb' : metric === 'total_reps' ? 'reps' : 'sets'
  return (
    <ul className="bars">
      {ranked.map((r) => (
        <li key={r.muscle} className="bar">
          <span className="bar__label">{r.muscle}</span>
          <span className="bar__track">
            <span className="bar__fill" style={{ width: `${r.value}%` }} />
          </span>
          <span className="bar__val mono">
            {metric === 'hard_sets' && mode === 'volume'
              ? r.raw.toFixed(r.raw < 10 ? 1 : 0)
              : fmtNum(r.raw)}{' '}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  )
}

function bandIndex(b: StandardBand) {
  return BANDS.indexOf(b)
}

function StandardsPanel({
  standards,
  bodyweightUpdatedAt,
  hasBodyweight,
}: {
  standards: { lift_key: LiftKey; best_e1rm_lb: number; novice_lb: number; intermediate_lb: number; advanced_lb: number; elite_lb: number; standard_band: StandardBand }[]
  bodyweightUpdatedAt: string | null
  hasBodyweight: boolean
}) {
  const byLift = new Map(standards.map((s) => [s.lift_key, s]))
  const stale =
    !bodyweightUpdatedAt ||
    Date.now() - new Date(bodyweightUpdatedAt).getTime() > 1000 * 60 * 60 * 24 * 60

  if (!hasBodyweight) {
    return (
      <Banner kind="warn">
        Set your bodyweight in Profile to compare your lifts against strength standards.
      </Banner>
    )
  }
  if (standards.length === 0) {
    return (
      <p className="muted">
        Log one of the five main lifts (squat, bench, deadlift, overhead press, row) and we’ll place
        you against the standards.
      </p>
    )
  }

  return (
    <>
      {stale ? (
        <Banner kind="warn">
          Your bodyweight looks stale — update it in Profile so these standards stay accurate.
        </Banner>
      ) : null}
      <ul className="stds">
        {LIFT_ORDER.filter((k) => byLift.has(k)).map((k) => {
          const s = byLift.get(k)!
          const pos = Math.max(
            0,
            Math.min(100, ((s.best_e1rm_lb - s.novice_lb) / (s.elite_lb - s.novice_lb)) * 100),
          )
          const next =
            s.standard_band === 'beginner'
              ? { band: 'novice' as StandardBand, lb: s.novice_lb }
              : s.standard_band === 'novice'
                ? { band: 'intermediate' as StandardBand, lb: s.intermediate_lb }
                : s.standard_band === 'intermediate'
                  ? { band: 'advanced' as StandardBand, lb: s.advanced_lb }
                  : s.standard_band === 'advanced'
                    ? { band: 'elite' as StandardBand, lb: s.elite_lb }
                    : null
          return (
            <li key={k} className="std">
              <div className="std__head">
                <span className="std__lift">{LIFT_LABEL[k]}</span>
                <span className={`std__band std__band--${s.standard_band}`}>
                  {BAND_LABEL[s.standard_band]}
                </span>
              </div>
              <div className="std__track" aria-hidden="true">
                <span
                  className="std__fill"
                  style={{ width: `${pos}%`, opacity: 0.25 + (bandIndex(s.standard_band) / 4) * 0.75 }}
                />
                <span className="std__marker" style={{ left: `${pos}%` }} />
              </div>
              <div className="std__foot">
                <span className="mono">{fmtNum(s.best_e1rm_lb)} lb e1RM</span>
                {next ? (
                  <span className="muted">
                    {fmtNum(Math.max(0, next.lb - s.best_e1rm_lb))} lb to {BAND_LABEL[next.band]}
                  </span>
                ) : (
                  <span className="muted">Elite — maxed out 🎉</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

const DIM_TITLE: Record<'workout' | 'exercise' | 'muscle', { title: string; icon: string }> = {
  workout: { title: 'Top workouts', icon: '📋' },
  exercise: { title: 'Top exercises', icon: '🏋️' },
  muscle: { title: 'Top muscles', icon: '💪' },
}

function FrequencyLists({
  rows,
  window,
}: {
  rows: { dimension: string; key: string; label: string | null; cnt: number }[]
  window: TimeWindow
}) {
  const dims: ('workout' | 'exercise' | 'muscle')[] = ['workout', 'exercise', 'muscle']
  const any = rows.length > 0
  return (
    <Card title="Most often" subtitle={`Completed in the ${window === 'all' ? 'all-time' : window} window`}>
      {!any ? (
        <p className="muted">Complete a session and your most-trained workouts, lifts, and muscles show up here.</p>
      ) : (
        <div className="freqcols">
          {dims.map((d) => {
            const top = rows.filter((r) => r.dimension === d).slice(0, 5)
            return (
              <div key={d} className="freqcol">
                <h3 className="freqcol__title">
                  <span aria-hidden="true">{DIM_TITLE[d].icon}</span> {DIM_TITLE[d].title}
                </h3>
                {top.length === 0 ? (
                  <p className="muted freqcol__empty">—</p>
                ) : (
                  <ol className="freqlist">
                    {top.map((r) => (
                      <li key={r.key} className="freqlist__item">
                        <span className="freqlist__name">{r.label ?? '—'}</span>
                        <span className="freqlist__cnt mono">{r.cnt}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
