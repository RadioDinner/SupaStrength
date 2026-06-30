# Vendored exercise dataset

`exercises.json` is a **pinned, vendored copy** of the public-domain
[`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db)
`dist/exercises.json` (license: **Unlicense** — public domain). 873 exercises.

It is vendored (not fetched at build time) so the seed is reproducible and
offline, per `docs/BUILD_PLAN.md` ("Fetch & pin … vendor it into
`supabase/seed/data/`"). To refresh it, re-download `dist/exercises.json` from the
upstream repo and re-run the generator:

```bash
node supabase/seed/build-exercise-seed.mjs   # regenerates ../exercises_seed.sql
```

Fields used: `name`, `equipment`, `mechanic`, `category`, `primaryMuscles`,
`secondaryMuscles`, `instructions`, `id`. Images are intentionally **not** loaded
(out of scope for v1). Mapping rules (equipment → movement_type/loading_style,
source muscles → our 12 groups, the 5 `lift_key` mains) live in the generator.
