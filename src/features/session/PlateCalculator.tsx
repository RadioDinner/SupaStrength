/**
 * Inline plate calculator (SPEC §6 [P2]) — the engine's `solvePlates` over the
 * session location's bar + plate inventory + rounding prefs. Pure display.
 */
import { useMemo } from 'react'
import { solvePlates, type PlateStock } from '../../engine/plates'
import type { Barbell, EquipmentPreferences, PlateInventory } from '../../data/types'

export function PlateCalculator({
  targetLb,
  bar,
  plates,
  prefs,
}: {
  targetLb: number
  bar: Barbell | null
  plates: PlateInventory[]
  prefs: EquipmentPreferences | null
}) {
  const solution = useMemo(() => {
    if (!bar || !targetLb || targetLb <= 0) return null
    const inventory: PlateStock[] = plates.map((p) => ({
      denominationLb: p.denomination_lb,
      quantity: p.quantity,
    }))
    return solvePlates(targetLb, bar.weight_lb, inventory, {
      rounding: prefs?.rounding_direction ?? 'down',
      microPlatesEnabled: prefs?.micro_plates_enabled ?? false,
    })
  }, [targetLb, bar, plates, prefs])

  if (!bar) return <div className="platecalc muted">Set a default barbell to use the plate calculator.</div>
  if (!solution) return <div className="platecalc muted">Enter a target weight.</div>

  return (
    <div className="platecalc">
      <div className="platecalc__bar">
        {bar.name} ({bar.weight_lb} lb) · per side:
      </div>
      <div className="platecalc__plates">
        {solution.perSide.length === 0 ? (
          <span className="muted">empty bar</span>
        ) : (
          solution.perSide.map((p) => (
            <span key={p.denominationLb} className="plate">
              {p.count}×{p.denominationLb}
            </span>
          ))
        )}
      </div>
      <div className="platecalc__total">
        Loads <strong>{solution.loadedTotalLb} lb</strong>
        {solution.exact ? null : (
          <span className="muted">
            {' '}
            ({solution.deltaLb > 0 ? '+' : ''}
            {solution.deltaLb} vs {targetLb})
          </span>
        )}
        {solution.ceilingReached ? <span className="warntext"> · max loadable</span> : null}
      </div>
    </div>
  )
}
