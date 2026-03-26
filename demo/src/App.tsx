import { useVeilFlow, type Screen } from './hooks/useVeilFlow.js'
import { RelayProvider } from './components/RelayProvider.js'
import { EventTicker } from './components/EventTicker.js'
import { Network } from './screens/Network.js'
import { Circle } from './screens/Circle.js'
import { Source } from './screens/Source.js'
import { Veil } from './screens/Veil.js'
import { Verification } from './screens/Verification.js'
import { Reveal } from './screens/Reveal.js'
import type { ComponentType } from 'react'

const SCREEN_TITLES: Record<Screen, string> = {
  circle: 'The Circle',
  source: 'The Source',
  veil: 'The Veil',
  verification: 'Verification',
  reveal: 'The Reveal',
  network: 'The Network',
}

const SCREEN_NUMBERS: Record<Screen, number> = {
  circle: 1,
  source: 2,
  veil: 3,
  verification: 4,
  reveal: 5,
  network: 6,
}

const SCREENS: Record<Screen, ComponentType<{ flow: ReturnType<typeof useVeilFlow> }>> = {
  circle: Circle,
  source: Source,
  veil: Veil,
  verification: Verification,
  reveal: Reveal,
  network: Network,
}

function AppInner() {
  const flow = useVeilFlow()
  const title = SCREEN_TITLES[flow.state.screen]
  const screenNum = SCREEN_NUMBERS[flow.state.screen]
  const ScreenComponent = SCREENS[flow.state.screen]

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem 2rem', paddingBottom: '5.5rem' }}>
      <header style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '1.5rem',
        marginBottom: '2.5rem',
        borderBottom: '1px solid #1a1a2e',
        paddingBottom: '1rem',
      }}>
        <h1 style={{ fontSize: '2rem', letterSpacing: '0.2em', fontWeight: 300, color: '#7b68ee' }}>VEIL</h1>
        <span style={{ fontSize: '0.9rem', color: '#b0b0b0', letterSpacing: '0.1em' }}>ANONYMOUS GROUP TRUST FOR NOSTR</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div
              key={n}
              style={{
                width: 24,
                height: 3,
                background: n <= screenNum ? '#7b68ee' : '#1a1a2e',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>
      </header>

      <main>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 400, marginBottom: '1.5rem', color: '#e0e0e0' }}>
          <span style={{ color: '#7b68ee', opacity: 0.7, marginRight: '0.6rem', fontSize: '1rem' }}>
            {String(screenNum).padStart(2, '0')}
          </span>
          {title}
        </h2>

        <ScreenComponent flow={flow} />
      </main>

      {/* Spinner keyframes for Verification screen */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export function App() {
  return (
    <RelayProvider useDemoData={true}>
      <AppInner />
      <EventTicker />
    </RelayProvider>
  )
}
