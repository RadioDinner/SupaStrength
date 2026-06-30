/**
 * Per-entry rest timer (SPEC §4 "Rest timer"). Counts down the prescribed rest;
 * tap to start/pause, or reset. Self-contained.
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'

function fmt(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function RestTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running])

  const done = remaining === 0

  return (
    <div
      className={`resttimer ${done ? 'resttimer--done' : ''} ${running ? 'resttimer--running' : ''}`}
    >
      <span
        className="resttimer__time mono"
        role="timer"
        aria-label={`Rest timer, ${fmt(remaining)} remaining`}
      >
        {fmt(remaining)}
      </span>
      <Button
        variant="ghost"
        onClick={() => {
          if (done) {
            setRemaining(seconds)
            setRunning(true)
          } else {
            setRunning((r) => !r)
          }
        }}
      >
        {done ? 'Restart' : running ? 'Pause' : 'Start rest'}
      </Button>
      {!done && remaining !== seconds ? (
        <Button
          variant="ghost"
          onClick={() => {
            setRunning(false)
            setRemaining(seconds)
          }}
        >
          Reset
        </Button>
      ) : null}
    </div>
  )
}
