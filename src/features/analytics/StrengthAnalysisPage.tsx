/**
 * Strength analysis (session 003b): the Symmetric-Strength-style body map +
 * class comparison the user asked for, on the house class ladder
 * (`engine/strengthClasses`).
 *
 *   - Interactive front/back body map — every muscle group filled by its
 *     estimated strength band, tap to inspect what drives it.
 *   - Strongest / weakest muscle lists over the ranked groups.
 *   - Estimated 1RM per main lift with its band.
 *   - "Compare to a lifter" — a 7-stop class slider; per lift, your e1RM as
 *     paired bars against the expected 1RM for that class at YOUR bodyweight
 *     and sex (ratio-form thresholds, like the standards seed).
 *
 * Everything is computed client-side from `useLiftE1rms` + profile — no new
 * tables, views, or seeds required.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ScanSearch } from 'lucide-react'
import { Banner, Card, EmptyState, SkeletonList } from '../../components/ui'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../settings/useProfile'
import { useMuscleGroups } from '../exercises/useExercises'
import { useLiftE1rms } from './useAnalytics'
import { BodyMap } from './BodyMap'
import {
  BAND_LABEL,
  CLASS_BLURB,
  CLASS_SCORE,
  GROUP_KEYS,
  MUSCLE_LIFT_WEIGHTS,
  STRENGTH_CLASSES,
  bandForScore,
  expectedE1rmLb,
  liftScore,
  muscleScores,
  overallScore,
  type GroupKey,
  type StrengthBand,
  type StrengthClass,
} from '../../engine/strengthClasses'
import type { LiftKey } from '../../data/types'

const LIFT_LABEL: Record<LiftKey, string> = {
  squat: 'Back squat',
  bench: 'Bench press',
  deadlift: 'Deadlift',
  ohp: 'Overhead press',
  row: 'Pendlay row',
}
const LIFT_ORDER: LiftKey[] = ['squat', 'deadlift', 'bench', 'ohp', 'row']

const fmtLb = (n: number) => `${Math.round(n)}`

export function StrengthAnalysisPage() {
  const { user } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile(user!.id)
  const { data: groups } = useMuscleGroups()
  const { data: lifts, isLoading: liftsLoading } = useLiftE1rms()

  const [selected, setSelected] = useState<GroupKey | null>(null)
  // null = the user hasn't dragged yet → default to their own class.
  const [sliderClass, setSliderClass] = useState<StrengthClass | null>(null)

  const bodyweight = profile?.bodyweight_lb ?? null
  const sex = profile?.sex ?? 'male'

  const groupLabels = useMemo(() => {
    const out: Partial<Record<GroupKey, string>> = {}
    for (const g of groups ?? []) out[g.group_key as GroupKey] = g.display_name
    return out
  }, [groups])

  // --- scores ---------------------------------------------------------------
  const e1rmByLift = useMemo(() => {
    const m = new Map<LiftKey, number>()
    for (const l of lifts ?? []) m.set(l.lift_key, l.best_e1rm_lb)
    return m
  }, [lifts])

  const liftScores = useMemo(() => {
    const out: Partial<Record<LiftKey, number>> = {}
    if (!bodyweight) return out
    for (const [lift, e1rm] of e1rmByLift) out[lift] = liftScore(lift, e1rm, bodyweight, sex)
    return out
  }, [e1rmByLift, bodyweight, sex])

  const muscle = useMemo(() => muscleScores(liftScores), [liftScores])
  const bands = useMemo(() => {
    const out: Partial<Record<GroupKey, StrengthBand | null>> = {}
    for (const g of GROUP_KEYS) out[g] = muscle[g] == null ? null : bandForScore(muscle[g])
    return out
  }, [muscle])

  const overall = overallScore(liftScores)
  const overallBand = overall == null ? null : bandForScore(overall)

  // Default slider stop = your class (Subpar reads against Untrained).
  const defaultClass: StrengthClass =
    overallBand == null || overallBand === 'subpar' ? 'untrained' : overallBand
  const compareClass = sliderClass ?? defaultClass

  const loading = profileLoading || liftsLoading
  if (loading) return <SkeletonList rows={3} />

  const hasLifts = e1rmByLift.size > 0
  const ranked = GROUP_KEYS.filter((g) => muscle[g] != null).sort(
    (a, b) => (muscle[b] ?? 0) - (muscle[a] ?? 0),
  )

  return (
    <div className="page">
      <Card
        title="Strength analysis"
        subtitle={
          hasLifts
            ? 'Estimated from your logged main lifts'
            : 'These lifts have not been logged yet'
        }
        actions={
          <Link className="linkbtn" to="/analytics">
            <ChevronLeft size={18} aria-hidden="true" />
            Stats
          </Link>
        }
      >
        {!bodyweight ? (
          <Banner kind="warn">
            Set your bodyweight in <Link to="/profile">Profile</Link> — the class ladder is
            bodyweight-relative, so nothing here can be ranked without it.
          </Banner>
        ) : overall != null ? (
          <div className="strank">
            <span className="strank__label">Overall</span>
            <span className="strank__band">{BAND_LABEL[bandForScore(overall)]}</span>
            <span className="strank__score mono">score {Math.round(overall)}</span>
          </div>
        ) : (
          <p className="muted">
            Log a working set on any of the five main lifts (squat, bench, deadlift, overhead
            press, row) and the map lights up.
          </p>
        )}
      </Card>

      <Card title="Estimated strength by muscle group" subtitle="Tap a muscle to inspect it">
        <BodyMap
          sex={sex}
          bands={bands}
          groupLabels={groupLabels}
          selected={selected}
          onSelect={setSelected}
        />
        <ul className="classlegend" aria-label="Strength class legend">
          {(['subpar', ...STRENGTH_CLASSES] as StrengthBand[]).map((b, i) => (
            <li key={b} className="classlegend__item">
              <span className={`classlegend__swatch classlegend__swatch--${i}`} aria-hidden="true" />
              {BAND_LABEL[b]}
            </li>
          ))}
          <li className="classlegend__item">
            <span className="classlegend__swatch classlegend__swatch--unranked" aria-hidden="true" />
            Not ranked
          </li>
        </ul>
        {selected ? (
          <MuscleDetail
            group={selected}
            label={groupLabels[selected] ?? selected}
            score={muscle[selected] ?? null}
            band={bands[selected] ?? null}
            e1rmByLift={e1rmByLift}
            liftScores={liftScores}
            hasBodyweight={!!bodyweight}
          />
        ) : null}
      </Card>

      {ranked.length > 0 ? (
        <Card title="Strongest & weakest" subtitle="Ranked muscle groups, best first">
          <div className="rankcols">
            <RankList
              title="Strongest"
              groups={ranked.slice(0, Math.ceil(ranked.length / 2))}
              labels={groupLabels}
              bands={bands}
              onPick={setSelected}
            />
            <RankList
              title="Weakest"
              groups={ranked.slice(Math.ceil(ranked.length / 2)).reverse()}
              labels={groupLabels}
              bands={bands}
              onPick={setSelected}
            />
          </div>
        </Card>
      ) : null}

      <Card title="Estimated one-rep maxes" subtitle="Best logged e1RM per main lift">
        {hasLifts ? (
          <ul className="liftlist">
            {LIFT_ORDER.map((k) => {
              const e1rm = e1rmByLift.get(k)
              const s = liftScores[k]
              return (
                <li key={k} className="liftlist__row">
                  <span className="liftlist__name">{LIFT_LABEL[k]}</span>
                  {e1rm ? (
                    <span className="liftlist__val">
                      <span className="mono">{fmtLb(e1rm)} lb</span>
                      {s !== undefined ? (
                        <span className="liftlist__band">{BAND_LABEL[bandForScore(s)]}</span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="liftlist__val muted">not logged</span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<ScanSearch size={40} aria-hidden />}
            title="No main lifts logged"
            hint="Estimated 1RMs come from your logged working sets on the five main barbell lifts."
          />
        )}
      </Card>

      <Card
        title="Compare to a lifter"
        subtitle="Drag to see the expected lifts at each class — at your bodyweight"
      >
        {bodyweight ? (
          <CompareSlider
            compareClass={compareClass}
            onChange={setSliderClass}
            bodyweight={bodyweight}
            sex={sex}
            e1rmByLift={e1rmByLift}
          />
        ) : (
          <p className="muted">Set your bodyweight in Profile to unlock the comparison.</p>
        )}
      </Card>
    </div>
  )
}

function MuscleDetail({
  group,
  label,
  score,
  band,
  e1rmByLift,
  liftScores,
  hasBodyweight,
}: {
  group: GroupKey
  label: string
  score: number | null
  band: StrengthBand | null
  e1rmByLift: Map<LiftKey, number>
  liftScores: Partial<Record<LiftKey, number>>
  hasBodyweight: boolean
}) {
  const drivers = Object.keys(MUSCLE_LIFT_WEIGHTS[group]) as LiftKey[]
  return (
    <div className="mdetail" aria-live="polite">
      <div className="mdetail__head">
        <h3 className="mdetail__name">{label}</h3>
        {band != null && score != null ? (
          <span className="mdetail__band">
            {BAND_LABEL[band]} <span className="mono">· {Math.round(score)}</span>
          </span>
        ) : (
          <span className="mdetail__band mdetail__band--none">Not ranked</span>
        )}
      </div>
      {drivers.length === 0 ? (
        <p className="muted">
          The five main lifts don’t load this group enough to rank it — it stays neutral on the
          map.
        </p>
      ) : (
        <>
          <p className="muted mdetail__cap">Ranked from the lifts that train it:</p>
          <ul className="mdetail__lifts">
            {drivers.map((k) => {
              const e1rm = e1rmByLift.get(k)
              const s = liftScores[k]
              return (
                <li key={k} className="mdetail__lift">
                  <span>{LIFT_LABEL[k]}</span>
                  {e1rm && s !== undefined ? (
                    <span className="mdetail__liftval">
                      <span className="mono">{fmtLb(e1rm)} lb</span>{' '}
                      <span className="muted">{BAND_LABEL[bandForScore(s)]}</span>
                    </span>
                  ) : (
                    <span className="muted">{hasBodyweight ? 'not logged' : 'needs bodyweight'}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function RankList({
  title,
  groups,
  labels,
  bands,
  onPick,
}: {
  title: string
  groups: GroupKey[]
  labels: Partial<Record<GroupKey, string>>
  bands: Partial<Record<GroupKey, StrengthBand | null>>
  onPick: (g: GroupKey) => void
}) {
  return (
    <div className="rankcol">
      <h3 className="rankcol__title">{title}</h3>
      <ol className="ranklist">
        {groups.map((g) => {
          const band = bands[g]
          return (
            <li key={g}>
              <button type="button" className="ranklist__row" onClick={() => onPick(g)}>
                <span className="ranklist__name">{labels[g] ?? g}</span>
                <span className="ranklist__band muted">{band ? BAND_LABEL[band] : '—'}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function CompareSlider({
  compareClass,
  onChange,
  bodyweight,
  sex,
  e1rmByLift,
}: {
  compareClass: StrengthClass
  onChange: (c: StrengthClass) => void
  bodyweight: number
  sex: 'male' | 'female'
  e1rmByLift: Map<LiftKey, number>
}) {
  const idx = STRENGTH_CLASSES.indexOf(compareClass)
  const expected = LIFT_ORDER.map((k) => ({
    lift: k,
    lb: expectedE1rmLb(k, compareClass, bodyweight, sex),
    you: e1rmByLift.get(k) ?? null,
  }))
  const max = Math.max(...expected.map((e) => Math.max(e.lb, e.you ?? 0))) || 1

  return (
    <div className="cmp">
      <input
        type="range"
        className="cmp__slider"
        min={0}
        max={STRENGTH_CLASSES.length - 1}
        step={1}
        value={idx}
        aria-label="Comparison class"
        aria-valuetext={BAND_LABEL[compareClass]}
        onChange={(e) => onChange(STRENGTH_CLASSES[Number(e.target.value)] ?? 'untrained')}
      />
      <div className="cmp__stops" aria-hidden="true">
        {STRENGTH_CLASSES.map((c, i) => (
          <button
            key={c}
            type="button"
            tabIndex={-1}
            title={BAND_LABEL[c]}
            className={`cmp__stop${i === idx ? ' cmp__stop--on' : ''}`}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div className="cmp__head">
        <span className="cmp__class">{BAND_LABEL[compareClass]}</span>
        <span className="cmp__score mono">score {CLASS_SCORE[compareClass]}</span>
      </div>
      <p className="muted cmp__blurb">{CLASS_BLURB[compareClass]}</p>

      <div className="cmp__legend" aria-hidden="true">
        <span className="cmp__key">
          <span className="cmp__swatch cmp__swatch--you" /> You
        </span>
        <span className="cmp__key">
          <span className="cmp__swatch cmp__swatch--them" /> {BAND_LABEL[compareClass]} lifter
        </span>
      </div>

      <ul className="cmp__bars">
        {expected.map(({ lift, lb, you }) => {
          const delta = you != null ? Math.round(you - lb) : null
          return (
            <li key={lift} className="cmp__row">
              <div className="cmp__rowhead">
                <span className="cmp__lift">{LIFT_LABEL[lift]}</span>
                {delta != null ? (
                  <span className={`cmp__delta mono ${delta >= 0 ? 'cmp__delta--up' : 'cmp__delta--down'}`}>
                    {delta >= 0 ? '+' : ''}
                    {delta} lb
                  </span>
                ) : (
                  <span className="cmp__delta muted">not logged</span>
                )}
              </div>
              <div className="cmp__track" role="img" aria-label={
                you != null
                  ? `${LIFT_LABEL[lift]}: you ${fmtLb(you)} lb, ${BAND_LABEL[compareClass]} lifter ${fmtLb(lb)} lb`
                  : `${LIFT_LABEL[lift]}: ${BAND_LABEL[compareClass]} lifter ${fmtLb(lb)} lb, you not logged`
              }>
                <div className="cmp__barline">
                  {you != null ? (
                    <>
                      <span className="cmp__bar cmp__bar--you" style={{ width: `${(you / max) * 100}%` }} />
                      <span className="cmp__val mono">{fmtLb(you)}</span>
                    </>
                  ) : (
                    <span className="cmp__val muted">—</span>
                  )}
                </div>
                <div className="cmp__barline">
                  <span className="cmp__bar cmp__bar--them" style={{ width: `${(lb / max) * 100}%` }} />
                  <span className="cmp__val mono">{fmtLb(lb)}</span>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
