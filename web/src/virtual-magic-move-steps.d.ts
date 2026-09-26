declare module 'virtual:magic-move-steps' {
  import type { KeyedTokensInfo } from '@shikijs/magic-move/types'

  export type StepId = 'before' | 'registry' | 'output'

  export interface MagicMoveStep {
    id: StepId
    label: string
  }

  export const STEPS: MagicMoveStep[]
  export const COMPILED_STEPS: KeyedTokensInfo[]
}
