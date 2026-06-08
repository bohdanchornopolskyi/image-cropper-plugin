'use client'

import { useTranslation } from '@payloadcms/ui'

import type { PluginTranslationKey } from '../translations/index.js'

const NS = 'plugin-image-cropper'
type NamespacedKey = `${typeof NS}:${PluginTranslationKey}`

export function usePluginTranslation() {
  const { t } = useTranslation<object, NamespacedKey>()
  return (key: PluginTranslationKey, opts?: Record<string, unknown>) => t(`${NS}:${key}`, opts)
}
