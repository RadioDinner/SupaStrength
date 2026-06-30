import { describe, expect, it } from 'vitest'
import { maxLoadableLb, snapDumbbell, solvePlates } from '../../src/engine/plates'
import { HOME_BARBELL_LB, HOME_DUMBBELLS, HOME_GYM, HOME_GYM_WITH_MICROS } from './support'

const opts = (rounding: 'up' | 'down' | 'nearest', micros = false) => ({
  rounding,
  microPlatesEnabled: micros,
})

describe('solvePlates — home gym (45 bar, one pair each 2.5..45)', () => {
  it('loads 185 as 45 + 25 per side, exact', () => {
    const s = solvePlates(185, HOME_BARBELL_LB, HOME_GYM, opts('down'))
    expect(s.exact).toBe(true)
    expect(s.loadedTotalLb).toBe(185)
    expect(s.deltaLb).toBe(0)
    expect(s.perSide).toEqual([
      { denominationLb: 45, count: 1 },
      { denominationLb: 25, count: 1 },
    ])
  })

  it('loads 135 as a single 45 per side', () => {
    const s = solvePlates(135, HOME_BARBELL_LB, HOME_GYM, opts('down'))
    expect(s.exact).toBe(true)
    expect(s.perSide).toEqual([{ denominationLb: 45, count: 1 }])
  })

  it('empty bar for a target at/below bar weight', () => {
    const s = solvePlates(45, HOME_BARBELL_LB, HOME_GYM, opts('down'))
    expect(s.perSide).toEqual([])
    expect(s.loadedTotalLb).toBe(45)
    expect(s.exact).toBe(true)
  })

  it('187.5 is not loadable without micros → rounds down to 185 / up to 190', () => {
    const down = solvePlates(187.5, HOME_BARBELL_LB, HOME_GYM, opts('down'))
    expect(down.exact).toBe(false)
    expect(down.loadedTotalLb).toBe(185)
    expect(down.deltaLb).toBe(-2.5)

    const up = solvePlates(187.5, HOME_BARBELL_LB, HOME_GYM, opts('up'))
    expect(up.loadedTotalLb).toBe(190)
    expect(up.deltaLb).toBe(2.5)

    const near = solvePlates(187.5, HOME_BARBELL_LB, HOME_GYM, opts('nearest'))
    expect(near.loadedTotalLb).toBe(190) // tie → up
  })

  it('187.5 becomes exactly loadable with 1.25 micros enabled', () => {
    const s = solvePlates(187.5, HOME_BARBELL_LB, HOME_GYM_WITH_MICROS, opts('down', true))
    expect(s.exact).toBe(true)
    expect(s.loadedTotalLb).toBe(187.5)
    expect(s.perSide).toEqual([
      { denominationLb: 45, count: 1 },
      { denominationLb: 25, count: 1 },
      { denominationLb: 1.25, count: 1 },
    ])
  })

  it('above 320 triggers the ceiling and returns the max loadable', () => {
    const s = solvePlates(325, HOME_BARBELL_LB, HOME_GYM, opts('up'))
    expect(s.ceilingReached).toBe(true)
    expect(s.loadedTotalLb).toBe(320)
  })

  it('loads the full 320 lb stack symmetrically', () => {
    const s = solvePlates(320, HOME_BARBELL_LB, HOME_GYM, opts('down'))
    expect(s.exact).toBe(true)
    expect(s.ceilingReached).toBe(false)
    const perSideSum = s.perSide.reduce((acc, p) => acc + p.denominationLb * p.count, 0)
    expect(perSideSum).toBe(137.5)
  })
})

describe('solvePlates — odd inventory (closest subset-sum, not greedy)', () => {
  it('finds the closest achievable with a gappy plate set', () => {
    // Only 45/25/10/5 pairs: 47.5 per side isn't achievable.
    const inv = [
      { denominationLb: 45, quantity: 2 },
      { denominationLb: 25, quantity: 2 },
      { denominationLb: 10, quantity: 2 },
      { denominationLb: 5, quantity: 2 },
    ]
    const up = solvePlates(140, 45, inv, opts('up')) // per side 47.5 → 50 → 145
    expect(up.loadedTotalLb).toBe(145)
    const down = solvePlates(140, 45, inv, opts('down')) // → 45 → 135
    expect(down.loadedTotalLb).toBe(135)
  })
})

describe('maxLoadableLb', () => {
  it('home gym caps at 320 (322.5 with micros)', () => {
    expect(maxLoadableLb(HOME_BARBELL_LB, HOME_GYM, false)).toBe(320)
    expect(maxLoadableLb(HOME_BARBELL_LB, HOME_GYM_WITH_MICROS, true)).toBe(322.5)
  })
})

describe('snapDumbbell — discrete owned bells', () => {
  it('snaps to the nearest owned bell (ties up)', () => {
    expect(snapDumbbell(22.5, HOME_DUMBBELLS, 'nearest').weightLb).toBe(25)
    expect(snapDumbbell(22.5, HOME_DUMBBELLS, 'down').weightLb).toBe(20)
    expect(snapDumbbell(22.5, HOME_DUMBBELLS, 'up').weightLb).toBe(25)
  })

  it('exact match', () => {
    const s = snapDumbbell(20, HOME_DUMBBELLS, 'nearest')
    expect(s.exact).toBe(true)
    expect(s.weightLb).toBe(20)
  })

  it('past the biggest bell hits the ceiling', () => {
    const s = snapDumbbell(30, HOME_DUMBBELLS, 'up')
    expect(s.ceilingReached).toBe(true)
    expect(s.weightLb).toBe(25)
  })

  it('no owned bells → null', () => {
    expect(snapDumbbell(20, [], 'nearest').weightLb).toBeNull()
  })
})
