'use client'

import { useTranslation } from '@payloadcms/ui'

import type { StaticLabel } from '../types.js'
import { resolveLabel } from '../utilities.js'

export function useResolveLabel(): (label: StaticLabel | undefined) => string {
  const { i18n } = useTranslation()
  return (label) => resolveLabel(label, i18n.language)
}
