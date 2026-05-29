'use client'

import { type ReactNode } from 'react'

function Icon({
  children,
  strokeLinejoin,
  strokeWidth = '1.5',
}: {
  children: ReactNode
  strokeLinejoin?: 'round'
  strokeWidth?: string
}) {
  return (
    <svg
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin={strokeLinejoin}
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  )
}

export function CropIcon() {
  return (
    <Icon>
      <polyline points="6,2 6,18 22,18" />
      <polyline points="2,6 18,6 18,22" />
    </Icon>
  )
}

export function EditSvg() {
  return (
    <Icon strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Icon>
  )
}

export function XSvg() {
  return (
    <Icon strokeWidth="2">
      <line x1="18" x2="6" y1="6" y2="18" />
      <line x1="6" x2="18" y1="6" y2="18" />
    </Icon>
  )
}

export function GridIcon() {
  return (
    <Icon>
      <rect height="7" rx="1" width="7" x="3" y="3" />
      <rect height="7" rx="1" width="7" x="14" y="3" />
      <rect height="7" rx="1" width="7" x="3" y="14" />
      <rect height="7" rx="1" width="7" x="14" y="14" />
    </Icon>
  )
}
