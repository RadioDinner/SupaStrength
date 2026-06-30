/**
 * The pure progression engine (BUILD_PLAN M5a). No I/O, no Supabase, no React —
 * deterministic functions over plain inputs, reused verbatim on native/offline.
 *
 * Modules:
 * - `weight`   — exact lb arithmetic (centi-pound integers, no float drift).
 * - `plates`   — solvePlates / dumbbell snap / max-loadable (plate calc #2/#3).
 * - `pipeline` — resolvePipeline + applyProgression (the step state machine).
 * - `failure`  — chainable failure-response evaluation.
 * - `warmups`  — threshold-gated warmup ramp generation.
 * - `schedule` — rotation pointer next-day / advance.
 * - `prescribe`— consolidation-hold consumption (read path).
 */
export * as weight from './weight'
export * from './plates'
export * from './pipeline'
export * from './failure'
export * from './warmups'
export * from './schedule'
export * from './prescribe'
export * from './presets'
export type * from './types'
