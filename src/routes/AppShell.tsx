/**
 * Authenticated app shell (BUILD_PLAN M1): routed content + bottom tab nav,
 * mobile-first. New milestones add routes/tabs here.
 */
import { NavLink, Route, Routes } from 'react-router-dom'
import {
  Home,
  ClipboardList,
  CalendarDays,
  BarChart3,
  Library,
  User,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react'
import { Logo } from '../components/ui'
import { HomePage } from '../features/home/HomePage'
import { ProfilePage } from '../features/settings/ProfilePage'
import { EquipmentPage } from '../features/equipment/EquipmentPage'
import { ExercisesPage } from '../features/exercises/ExercisesPage'
import { WorkoutsPage } from '../features/workouts/WorkoutsPage'
import { WorkoutBuilderPage } from '../features/workouts/WorkoutBuilderPage'
import { RoutinesPage } from '../features/routines/RoutinesPage'
import { RoutineBuilderPage } from '../features/routines/RoutineBuilderPage'
import { SessionPage } from '../features/session/SessionPage'
import { AnalyticsPage } from '../features/analytics/AnalyticsPage'
import { ProgressPage } from '../features/progress/ProgressPage'
import { HistoryPage } from '../features/history/HistoryPage'
import { useTheme } from '../hooks/useTheme'

const TABS: { to: string; label: string; Icon: LucideIcon; end: boolean }[] = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/workouts', label: 'Workouts', Icon: ClipboardList, end: false },
  { to: '/routines', label: 'Routines', Icon: CalendarDays, end: false },
  { to: '/analytics', label: 'Stats', Icon: BarChart3, end: false },
  { to: '/exercises', label: 'Exercises', Icon: Library, end: false },
  { to: '/profile', label: 'Profile', Icon: User, end: false },
]

export function AppShell() {
  const { resolved, toggle } = useTheme()
  return (
    <div className="app">
      <header className="appbar">
        <Logo size={22} />
        <span className="appbar__title">SupaStrength</span>
        <span className="appbar__spacer" />
        <button
          type="button"
          className="iconbtn"
          onClick={toggle}
          aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
          title="Toggle theme"
        >
          {resolved === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>
      </header>

      <main className="app__main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workouts" element={<WorkoutsPage />} />
          <Route path="/workouts/:id" element={<WorkoutBuilderPage />} />
          <Route path="/routines" element={<RoutinesPage />} />
          <Route path="/routines/:id" element={<RoutineBuilderPage />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/progress" element={<ProgressPage />} />
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
              <t.Icon size={20} />
            </span>
            <span className="tab__label">{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
