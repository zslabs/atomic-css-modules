import CheckIcon from '@/assets/check.svg?react'
import CopyIcon from '@/assets/copy.svg?react'
import { useState } from 'react'
import styles from './copy-button.module.css'

type CopyButtonProps = {
  code: string
}

export function CopyButton({ code }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={copied ? 'Copied' : 'Copy'}
      onClick={() => {
        void onCopy()
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}
