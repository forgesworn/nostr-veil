/** NIP-85 assertion kind numbers */
export const NIP85_KINDS = {
  USER: 30382,
  EVENT: 30383,
  ADDRESSABLE: 30384,
  IDENTIFIER: 30385,
  PROVIDER: 10040,
} as const

/** Kind 30382 user assertion metrics */
export interface UserMetrics {
  followers?: number
  rank?: number
  first_created_at?: number
  post_cnt?: number
  reply_cnt?: number
  reactions_cnt?: number
  zap_amt_recd?: number
  zap_amt_sent?: number
  zap_cnt_recd?: number
  zap_cnt_sent?: number
  zap_avg_amt_day_recd?: number
  zap_avg_amt_day_sent?: number
  reports_cnt_recd?: number
  reports_cnt_sent?: number
  t?: string
  active_hours_start?: number
  active_hours_end?: number
}

/** Kind 30383/30384 event assertion metrics */
export interface EventMetrics {
  rank?: number
  comment_cnt?: number
  quote_cnt?: number
  repost_cnt?: number
  reaction_cnt?: number
  zap_cnt?: number
  zap_amount?: number
}

/** Kind 30385 identifier assertion metrics */
export interface IdentifierMetrics {
  rank?: number
  comment_cnt?: number
  reaction_cnt?: number
}

/** Provider declaration entry for kind 10040 */
export interface ProviderEntry {
  kind: number
  metric: string
  servicePubkey: string
  relayHint: string
}

/** Unsigned event template */
export interface EventTemplate {
  kind: number
  tags: string[][]
  content: string
  created_at?: number
}

/** Parsed assertion */
export interface ParsedAssertion {
  kind: number
  subject: string
  metrics: Record<string, string | number>
}

/** Parsed provider declaration */
export interface ParsedProvider {
  kind: number
  metric: string
  servicePubkey: string
  relayHint: string
}

/** Validation result */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}
