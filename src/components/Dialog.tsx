'use client'

import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import styles from './CropImageField.module.css'

type DialogProps = {
  children: ReactNode
  /** Id of the element that titles the dialog. */
  labelledBy: string
  onClose: () => void
}

/**
 * A modal `<dialog>`: the browser keeps focus inside it and fires `cancel` on Escape.
 * Focus goes back to whatever opened it once it unmounts.
 */
export function Dialog({ children, labelledBy, onClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    dialog?.showModal()
    return () => {
      // Close first: while the dialog is modal the rest of the page is inert and can't take focus.
      dialog?.close()
      if (opener instanceof HTMLElement) {
        opener.focus()
      }
    }
  }, [])

  // Clicking the scrim closes the dialog. A crop drag that starts in the content and ends
  // on the scrim fires its click on their common ancestor, so it doesn't close anything.
  return createPortal(
    <dialog
      aria-labelledby={labelledBy}
      className={styles.backdrop}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      ref={ref}
    >
      <div aria-hidden className={styles.scrim} onClick={onClose} />
      {children}
    </dialog>,
    document.body,
  )
}
