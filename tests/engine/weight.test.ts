import { describe, expect, it } from 'vitest'
import {
  add,
  addLb,
  eq,
  formatLb,
  fromLb,
  gt,
  gte,
  lt,
  lte,
  max,
  min,
  roundToStepLb,
  scaleByPct,
  sub,
  toCp,
  toLb,
  ZERO,
} from '../../src/engine/weight'

describe('weight — exact lb arithmetic (no float drift)', () => {
  it('round-trips exact plate denominations', () => {
    for (const lb of [45, 35, 25, 15, 10, 5, 2.5, 1.25, 0.25, 320, 187.5]) {
      expect(toLb(fromLb(lb))).toBe(lb)
    }
  })

  it('adds +2.5 lb forty times with zero drift (golden test)', () => {
    let w = fromLb(45)
    for (let i = 0; i < 40; i++) w = addLb(w, 2.5)
    expect(toLb(w)).toBe(145) // 45 + 100
  })

  it('adds +1.25 micro increments exactly', () => {
    let w = fromLb(100)
    for (let i = 0; i < 8; i++) w = addLb(w, 1.25)
    expect(toLb(w)).toBe(110)
  })

  it('scaleByPct rounds to the nearest centi-pound', () => {
    expect(toLb(scaleByPct(fromLb(185), 55))).toBe(101.75)
    expect(toLb(scaleByPct(fromLb(200), 2.5))).toBe(5)
  })

  it('roundToStepLb honors direction', () => {
    expect(toLb(roundToStepLb(fromLb(187.5), 5, 'down'))).toBe(185)
    expect(toLb(roundToStepLb(fromLb(187.5), 5, 'up'))).toBe(190)
    expect(toLb(roundToStepLb(fromLb(187.5), 5, 'nearest'))).toBe(190) // ties up
    expect(toLb(roundToStepLb(fromLb(186), 5, 'nearest'))).toBe(185)
  })

  it('add / sub / toCp / ZERO', () => {
    expect(toLb(add(fromLb(45), fromLb(25)))).toBe(70)
    expect(toLb(sub(fromLb(100), fromLb(2.5)))).toBe(97.5)
    expect(toCp(fromLb(2.5))).toBe(250)
    expect(toLb(ZERO)).toBe(0)
  })

  it('comparisons + min/max', () => {
    expect(gt(fromLb(100), fromLb(95))).toBe(true)
    expect(lt(fromLb(95), fromLb(100))).toBe(true)
    expect(gte(fromLb(100), fromLb(100))).toBe(true)
    expect(lte(fromLb(100), fromLb(100))).toBe(true)
    expect(eq(fromLb(2.5), fromLb(2.5))).toBe(true)
    expect(toLb(max(fromLb(100), fromLb(95)))).toBe(100)
    expect(toLb(min(fromLb(100), fromLb(95)))).toBe(95)
  })

  it('formatLb trims trailing zeros', () => {
    expect(formatLb(fromLb(45))).toBe('45')
    expect(formatLb(fromLb(182.5))).toBe('182.5')
    expect(formatLb(fromLb(186.25))).toBe('186.25')
  })
})
