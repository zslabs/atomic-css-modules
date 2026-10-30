import FaceKissHeartEyes from '@/assets/face-kiss-heart-eyes.svg?react'
import { tokens } from '@/css/tokens'
import { ShikiMagicMovePrecompiled } from '@shikijs/magic-move/react'
import '@shikijs/magic-move/style.css'
import type { KeyedTokensInfo } from '@shikijs/magic-move/types'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { COMPILED_STEPS, STEPS, type StepId } from 'virtual:magic-move-steps'
import styles from './code-magic-move.module.css'

const compiledSteps: KeyedTokensInfo[] = COMPILED_STEPS.slice()

const pillTransition = {
  duration: durationTokenSeconds(tokens.duration['200']),
  ease: cubicBezierToken(tokens.ease.out),
}

function durationTokenSeconds(value: string): number {
  const amount = Number.parseFloat(value)
  if (Number.isNaN(amount)) {
    throw new Error(`Expected a duration token, received "${value}"`)
  }
  if (value.endsWith('ms')) return amount / 1000
  return amount
}

function cubicBezierToken(
  value: string
): readonly [number, number, number, number] {
  const parts = value
    .slice(value.indexOf('(') + 1, value.lastIndexOf(')'))
    .split(',')
    .map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Expected a cubic-bezier token, received "${value}"`)
  }
  const [x1, y1, x2, y2] = parts
  if (
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined
  ) {
    throw new Error(`Expected a cubic-bezier token, received "${value}"`)
  }
  return [x1, y1, x2, y2]
}

export function CodeMagicMove() {
  const [stepId, setStepId] = useState<StepId>('before')
  const [showDecoration, setShowDecoration] = useState(false)
  const stepIndex = Math.max(
    0,
    STEPS.findIndex((entry) => entry.id === stepId)
  )
  // Magic Move resolves the previous animation as soon as the next one
  // starts, and then calls that animation's onEnd. Keep the icon tied to the
  // transition that is still current, so a late callback cannot show it on
  // another step.
  const latestTransitionRef = useRef(0)
  const transitionStepRef = useRef(stepId)
  let transitionId = latestTransitionRef.current
  if (transitionStepRef.current !== stepId) {
    transitionStepRef.current = stepId
    transitionId = ++latestTransitionRef.current
  }

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
                  transition={pillTransition}
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
              if (latestTransitionRef.current !== transitionId) return
              if (stepId === 'output') setShowDecoration(true)
            }}
          />
        </div>
        {stepId === 'output' ? (
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
        ) : null}
      </div>
    </div>
  )
}
