import { useVeilFlow, type Screen } from './hooks/useVeilFlow.js'

const SCREEN_TITLES: Record<Screen, string> = {
  circle: 'The Circle',
  source: 'The Source',
  veil: 'The Veil',
  verification: 'Verification',
  reveal: 'The Reveal',
}

export function App() {
  const flow = useVeilFlow()
  const title = SCREEN_TITLES[flow.state.screen]

  return (
    <div style={{ minHeight: '100vh', padding: '2rem 3rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '1.5rem', marginBottom: '2.5rem', borderBottom: '1px solid #1a1a2e', paddingBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', letterSpacing: '0.2em', fontWeight: 300, color: '#7b68ee' }}>VEIL</h1>
        <span style={{ fontSize: '0.7rem', opacity: 0.4, letterSpacing: '0.1em' }}>PRIVACY-PRESERVING WEB OF TRUST</span>
      </header>
      <main>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 400, marginBottom: '1.5rem', opacity: 0.8 }}>{title}</h2>
        <p style={{ opacity: 0.5, marginBottom: '2rem' }}>Screen: {flow.state.screen}</p>
        <button
          onClick={flow.next}
          style={{
            padding: '0.6rem 1.5rem',
            background: 'transparent',
            border: '1px solid #7b68ee',
            color: '#7b68ee',
            fontFamily: 'inherit',
            fontSize: '0.8rem',
            cursor: 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          NEXT →
        </button>
      </main>
    </div>
  )
}
