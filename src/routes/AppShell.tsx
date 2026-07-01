/**
 * Authenticated app shell (BUILD_PLAN M1): routed content + bottom tab nav,
 * mobile-first. New milestones add routes/tabs here.
 */
import { lazy, Suspense } from 'react'
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
import { Logo, SkeletonList } from '../components/ui'
import { HomePage } from '../features/home/HomePage'
import { useTheme } from '../hooks/useTheme'

// Route-split every non-landing screen into its own chunk so the initial bundle
// stays small on the phone/cellular target. AnalyticsPage in particular pulls in
// Recharts (+ d3), which no longer loads until the Stats tab is opened.
const WorkoutsPage = lazy(() => import('../features/workouts/WorkoutsPage').then((m) => ({ default: m.WorkoutsPage })))
const WorkoutBuilderPage = lazy(() => import('../features/workouts/WorkoutBuilderPage').then((m) => ({ default: m.WorkoutBuilderPage })))
const RoutinesPage = lazy(() => import('../features/routines/RoutinesPage').then((m) => ({ default: m.RoutinesPage })))
const RoutineBuilderPage = lazy(() => import('../features/routines/RoutineBuilderPage').then((m) => ({ default: m.RoutineBuilderPage })))
const SessionPage = lazy(() => import('../features/session/SessionPage').then((m) => ({ default: m.SessionPage })))
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const ProgressPage = lazy(() => import('../features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage })))
const HistoryPage = lazy(() => import('../features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })))
const ExercisesPage = lazy(() => import('../features/exercises/ExercisesPage').then((m) => ({ default: m.ExercisesPage })))
const EquipmentPage = lazy(() => import('../features/equipment/EquipmentPage').then((m) => ({ default: m.EquipmentPage })))
const ProfilePage = lazy(() => import('../features/settings/ProfilePage').then((m) => ({ default: m.ProfilePage })))

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
        <h1 className="appbar__title">SupaStrength</h1>
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
        <Suspense fallback={<SkeletonList rows={3} />}>
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
        </Suspense>
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
