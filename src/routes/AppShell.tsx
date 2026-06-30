/**
 * Authenticated app shell (BUILD_PLAN M1): routed content + bottom tab nav,
 * mobile-first. New milestones add routes/tabs here.
 */
import { NavLink, Route, Routes } from 'react-router-dom'
import { HomePage } from '../features/home/HomePage'
import { ProfilePage } from '../features/settings/ProfilePage'
import { EquipmentPage } from '../features/equipment/EquipmentPage'
import { ExercisesPage } from '../features/exercises/ExercisesPage'
import { WorkoutsPage } from '../features/workouts/WorkoutsPage'
import { WorkoutBuilderPage } from '../features/workouts/WorkoutBuilderPage'

const TABS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/workouts', label: 'Workouts', icon: '📋', end: false },
  { to: '/exercises', label: 'Exercises', icon: '📚', end: false },
  { to: '/equipment', label: 'Equipment', icon: '🏋️', end: false },
  { to: '/profile', label: 'Profile', icon: '👤', end: false },
]

export function AppShell() {
  return (
    <div className="app">
      <header className="appbar">
        <span className="brand__mark" aria-hidden="true">
          🏋️
        </span>
        <span className="appbar__title">SupaStrength</span>
      </header>

      <main className="app__main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workouts" element={<WorkoutsPage />} />
          <Route path="/workouts/:id" element={<WorkoutBuilderPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => `tab ${isActive ? 'tab--active' : ''}`}
          >
            <span className="tab__icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="tab__label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
