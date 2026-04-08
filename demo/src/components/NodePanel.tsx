import { Tip } from './Tooltip.js'
import type { TrustNode } from '../graph.js'

interface NodePanelProps {
  node: TrustNode | null
  onClose: () => void
}

function truncate(hex: string): string {
  return hex.slice(0, 8) + '\u2009\u00b7\u2009' + hex.slice(-6)
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

const METRIC_LABELS: Record<string, string> = {
  rank: 'Trust rank',
  followers: 'Followers',
  zap_amt_recd: 'Sats received',
  zap_amt_sent: 'Sats sent',
  zap_cnt_recd: 'Zaps in',
  zap_cnt_sent: 'Zaps out',
  post_cnt: 'Posts',
  reply_cnt: 'Replies',
  reactions_cnt: 'Reactions',
  reports_cnt_recd: 'Reports',
  first_created_at: 'First seen',
}

export function NodePanel({ node, onClose }: NodePanelProps) {
  const isOpen = node !== null

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 380,
        height: '100%',
        background: '#0a0c12',
        borderLeft: '2px solid #141825',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'auto',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {node && (
        <>
          {/* Header bar */}
          <div style={{
            padding: '1rem 1.2rem',
            borderBottom: '1px solid #141825',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            flexShrink: 0,
          }}>
            {/* Status dot */}
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: node.ringEndorsements > 0 ? '#d97706' : node.endorsements > 0 ? '#0d9488' : '#4b5563',
              boxShadow: node.ringEndorsements > 0 ? '0 0 8px #d97706' : node.endorsements > 0 ? '0 0 6px #0d9488' : 'none',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '1.05rem',
                fontFamily: "'JetBrains Mono', monospace",
                color: node.ringEndorsements > 0 ? '#d97706' : '#0d9488',
                fontWeight: 600,
              }}>
                {truncate(node.pubkey)}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#4b5563',
                cursor: 'pointer',
                fontSize: '1.4rem',
                lineHeight: 1,
                padding: '0 4px',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              &times;
            </button>
          </div>

          {/* Ring verified badge */}
          {node.ringEndorsements > 0 && (
            <div style={{
              margin: '0.8rem 1.2rem 0',
              padding: '0.5rem 0.8rem',
              background: 'rgba(217, 119, 6, 0.06)',
              border: '1px solid rgba(217, 119, 6, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="#d97706" strokeWidth="1.5" />
                <path d="M4 7l2 2 4-4" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: '0.85rem', color: '#d97706', letterSpacing: '0.08em', fontWeight: 500 }}>
                RING VERIFIED
              </span>
            </div>
          )}

          {/* Heartwood signer badge — show for a subset of ring-endorsed nodes */}
          {node.ringEndorsements > 0 && parseInt(node.pubkey.slice(-2), 16) < 128 && (
            <div style={{
              margin: '0.5rem 1.2rem 0',
              padding: '0.45rem 0.8rem',
              background: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="4" width="12" height="8" rx="1.5" stroke="#10b981" strokeWidth="1.2" />
                <path d="M5 4V3a2 2 0 0 1 4 0v1" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: '0.8rem', color: '#10b981', letterSpacing: '0.06em' }}>
                Signed via <Tip term="Heartwood">Heartwood ESP32</Tip>
              </span>
            </div>
          )}

          {/* Endorsement stats - always visible, no hover tricks */}
          <div style={{ padding: '1rem 1.2rem', display: 'flex', gap: '1px', background: '#141825' }}>
            <StatCell label="Standard" value={node.endorsements} colour="#0d9488" desc="Public NIP-85 endorsements" />
            <StatCell label="Ring" value={node.ringEndorsements} colour="#d97706" desc="Anonymous LSAG group scores" />
            <StatCell label="Providers" value={node.providers.length} colour="#7b68ee" desc="Unique data sources" />
          </div>

          {/* NIP-85 metrics table */}
          {Object.keys(node.metrics).length > 0 && (
            <div style={{ padding: '0.8rem 1.2rem', flex: 1 }}>
              <div style={{
                fontSize: '0.7rem',
                color: '#4b5563',
                letterSpacing: '0.2em',
                marginBottom: '0.5rem',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                NIP-85 METRICS
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {Object.entries(node.metrics).map(([key, value]) => (
                    <tr key={key} style={{ borderBottom: '1px solid #111520' }}>
                      <td style={{
                        padding: '0.4rem 0',
                        fontSize: '0.85rem',
                        color: '#6b7280',
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {METRIC_LABELS[key] ?? key}
                      </td>
                      <td style={{
                        padding: '0.4rem 0',
                        fontSize: '0.95rem',
                        color: '#e0e0e0',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 500,
                        textAlign: 'right',
                      }}>
                        {formatNumber(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Full pubkey at bottom */}
          <div style={{
            padding: '0.8rem 1.2rem',
            borderTop: '1px solid #141825',
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: '0.65rem',
              color: '#374151',
              letterSpacing: '0.15em',
              marginBottom: '0.3rem',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              FULL PUBKEY
            </div>
            <div style={{
              fontSize: '0.7rem',
              fontFamily: "'JetBrains Mono', monospace",
              color: '#4b5563',
              wordBreak: 'break-all',
              lineHeight: 1.8,
              userSelect: 'all',
            }}>
              {node.pubkey}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatCell({ label, value, colour, desc }: { label: string; value: number; colour: string; desc: string }) {
  return (
    <div style={{
      flex: 1,
      background: '#0a0c12',
      padding: '0.7rem 0.5rem',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '1.5rem',
        color: value > 0 ? colour : '#1e2433',
        fontWeight: 700,
        fontFamily: "'JetBrains Mono', monospace",
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.7rem',
        color: '#6b7280',
        marginTop: '0.3rem',
        letterSpacing: '0.08em',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '0.65rem',
        color: '#374151',
        marginTop: '0.2rem',
        lineHeight: 1.3,
      }}>
        {desc}
      </div>
    </div>
  )
}
