/**
 * Interactive anatomical body map (Strength analysis). Front + back views,
 * every rankable muscle group filled by its strength band's ramp step and
 * tappable — one focusable element per (view, group), Enter/Space toggles.
 * Decorative anatomy (head, hands, shins, …) stays neutral silhouette;
 * rankable-but-unlogged groups get the distinct "unranked" fill so "no data"
 * never impersonates a band. Selection wears the amber lamp, per the system.
 */
import { useMemo } from 'react'
import type { Sex } from '../../data/types'
import type { GroupKey, StrengthBand } from '../../engine/strengthClasses'
import { BODY_VIEWS, type BodyView } from './bodyPaths'

export interface BodyMapProps {
  sex: Sex
  /** Band per group; null/absent = unranked (no logged lifts cover it). */
  bands: Partial<Record<GroupKey, StrengthBand | null>>
  groupLabels: Partial<Record<GroupKey, string>>
  selected: GroupKey | null
  onSelect: (group: GroupKey | null) => void
}

const BAND_INDEX: Record<StrengthBand, number> = {
  subpar: 0,
  untrained: 1,
  novice: 2,
  intermediate: 3,
  proficient: 4,
  advanced: 5,
  elite: 6,
  world_class: 7,
}

function fillFor(band: StrengthBand | null | undefined): string {
  if (band == null) return 'var(--bodymap-unranked)'
  return `var(--class-${BAND_INDEX[band]})`
}

function View({
  view,
  label,
  bands,
  groupLabels,
  selected,
  onSelect,
}: {
  view: BodyView
  label: string
} & Omit<BodyMapProps, 'sex'>) {
  // One clickable <g> per muscle group present in this view (a group's left +
  // right + every named part move as one control), decorative paths beneath.
  const { decorative, groups } = useMemo(() => {
    const decorative: string[] = []
    const byGroup = new Map<GroupKey, string[]>()
    for (const part of view.parts) {
      if (part.group == null) decorative.push(...part.paths)
      else byGroup.set(part.group, [...(byGroup.get(part.group) ?? []), ...part.paths])
    }
    return { decorative, groups: [...byGroup.entries()] }
  }, [view])

  return (
    <figure className="bodymap__view">
      <svg
        viewBox={view.viewBox}
        className="bodymap__svg"
        role="group"
        aria-label={`${label} view`}
      >
        <g className="bodymap__decor" aria-hidden="true">
          {decorative.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {groups.map(([group, paths]) => {
          const band = bands[group] ?? null
          const name = groupLabels[group] ?? group
          const isSelected = selected === group
          return (
            <g
              key={group}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={name}
              className={`bodymap__muscle${isSelected ? ' bodymap__muscle--selected' : ''}`}
              style={{ fill: fillFor(band) }}
              onClick={() => onSelect(isSelected ? null : group)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(isSelected ? null : group)
                }
              }}
            >
              {paths.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          )
        })}
      </svg>
      <figcaption className="bodymap__caption">{label}</figcaption>
    </figure>
  )
}

export function BodyMap({ sex, bands, groupLabels, selected, onSelect }: BodyMapProps) {
  const views = BODY_VIEWS[sex]
  return (
    <div className="bodymap">
      <View
        view={views.front}
        label="Front"
        bands={bands}
        groupLabels={groupLabels}
        selected={selected}
        onSelect={onSelect}
      />
      <View
        view={views.back}
        label="Back"
        bands={bands}
        groupLabels={groupLabels}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  )
}
