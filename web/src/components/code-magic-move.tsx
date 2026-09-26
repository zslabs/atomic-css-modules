import FaceKissHeartEyes from '@/assets/face-kiss-heart-eyes.svg?react'
import styles from '@/styles/code-magic-move.module.css'
import { ShikiMagicMovePrecompiled } from '@shikijs/magic-move/react'
import '@shikijs/magic-move/style.css'
import type { KeyedTokensInfo } from '@shikijs/magic-move/types'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { COMPILED_STEPS, STEPS, type StepId } from 'virtual:magic-move-steps'

const compiledSteps: KeyedTokensInfo[] = COMPILED_STEPS.slice()

export function CodeMagicMove() {
  const [stepId, setStepId] = useState<StepId>('before')
  const [showDecoration, setShowDecoration] = useState(false)
  const stepIndex = Math.max(
    0,
    STEPS.findIndex((entry) => entry.id === stepId)
  )

  return (
    <div>
      <div
        className={styles.group}
        role="group"
        aria-label="Transformation steps"
      >
        {STEPS.map((entry) => {
          const isActive = entry.id === stepId
          return (
            <button
              key={entry.id}
              type="button"
              className={styles.button}
              aria-pressed={isActive}
              onClick={() => setStepId(entry.id)}
            >
              <span className={styles.label}>{entry.label}</span>
              {isActive ? (
                <motion.span
                  layoutId="magic-move-pill"
                  className={styles.pill}
                />
              ) : null}
            </button>
          )
        })}
      </div>
      <div className={styles.codeWrapper}>
        <div className={styles.codeScroll}>
          <ShikiMagicMovePrecompiled
            steps={compiledSteps}
            step={stepIndex}
            options={{
              stagger: 0.3,
              containerStyle: false,
            }}
            onStart={() => setShowDecoration(false)}
            onEnd={() => {
              if (stepId === 'output') setShowDecoration(true)
            }}
          />
        </div>
        <AnimatePresence>
          {showDecoration ? (
            <motion.div
              className={styles.outputDecoration}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <FaceKissHeartEyes />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
