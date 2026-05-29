'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDocumentDrawer, useField, useListDrawer } from '@payloadcms/ui'

import type { CropData, CropDefinition, GeneratedUrls } from '../types.js'
import { buildCropRequests } from '../crop-requests.js'
import { isRecord } from '../isRecord.js'

export type MediaDoc = {
  id: number | string
  url?: string | null
  width?: number | null
  height?: number | null
  filename?: string | null
  filesize?: number | null
  mimeType?: string | null
  alt?: string | null
}

function isMediaDoc(v: unknown): v is MediaDoc {
  return isRecord(v) && 'id' in v
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`
  return `${Math.round(bytes / 1_000)}KB`
}

export function useCropImageField(args: {
  path: string
  cropDefinitions: CropDefinition[]
  mediaCollectionSlug: string
  apiRoute: string
  endpoint: string
}) {
  const { path, cropDefinitions, mediaCollectionSlug, apiRoute, endpoint } = args

  const { value: imageRaw, setValue: setImageValue } = useField<MediaDoc | number | null>({
    path: `${path}.image`,
  })
  const { value: cropData, setValue: setCropData } = useField<CropData | null>({
    path: `${path}.cropData`,
  })
  const { value: generatedUrls, setValue: setGeneratedUrls } = useField<GeneratedUrls | null>({
    path: `${path}.generatedUrls`,
  })

  const imageDoc: MediaDoc | null =
    imageRaw !== null && typeof imageRaw !== 'number' && typeof imageRaw !== 'string'
      ? imageRaw
      : null
  const imageId: number | string | null =
    imageDoc?.id ?? (typeof imageRaw === 'number' || typeof imageRaw === 'string' ? imageRaw : null)

  const [fetchedDoc, setFetchedDoc] = useState<MediaDoc | null>(null)

  // imageDoc from Payload's form store may be incomplete (only {id}, no url/filename)
  // when the form loads from the DB — always fetch the full doc when imageId changes.
  useEffect(() => {
    if (!imageId) {
      setFetchedDoc(null)
      return
    }
    const controller = new AbortController()
    fetch(`${apiRoute}/${mediaCollectionSlug}/${imageId}?depth=0`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (isMediaDoc(data)) setFetchedDoc(data)
      })
      .catch(() => null)
    return () => controller.abort()
  }, [imageId, mediaCollectionSlug])

  // fetchedDoc takes priority: it always has all fields; imageDoc may have only {id}.
  const media: MediaDoc | null = imageId ? (fetchedDoc ?? imageDoc) : null

  const [ListDrawer, , { openDrawer: openMediaDrawer, closeDrawer: closeMediaDrawer }] =
    useListDrawer({
      collectionSlugs: [mediaCollectionSlug],
    })

  const [CreateMediaDrawer, , { openDrawer: openCreateDrawer, closeDrawer: closeCreateDrawer }] =
    useDocumentDrawer({ collectionSlug: mediaCollectionSlug })

  const [modalOpen, setModalOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const selectDoc = useCallback(
    (doc: Record<string, unknown>, docID: string) => {
      const newDoc: MediaDoc = {
        id: typeof doc.id === 'number' || typeof doc.id === 'string' ? doc.id : docID,
        url: typeof doc.url === 'string' ? doc.url : null,
        width: typeof doc.width === 'number' ? doc.width : null,
        height: typeof doc.height === 'number' ? doc.height : null,
        filename: typeof doc.filename === 'string' ? doc.filename : null,
        filesize: typeof doc.filesize === 'number' ? doc.filesize : null,
        mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : null,
        alt: typeof doc.alt === 'string' ? doc.alt : null,
      }
      if (String(newDoc.id) !== String(imageId)) {
        setCropData(null)
        setGeneratedUrls(null)
      }
      setImageValue(newDoc)
      setFetchedDoc(newDoc)
      setModalOpen(true)
    },
    [imageId, setImageValue, setCropData, setGeneratedUrls],
  )

  const handleListSelect = useCallback(
    ({ docID, doc }: { collectionSlug: string; docID: string; doc: Record<string, unknown> }) => {
      closeMediaDrawer()
      selectDoc(doc, docID)
    },
    [selectDoc, closeMediaDrawer],
  )

  const handleDocCreate = useCallback(
    ({ doc }: { doc: { id?: string | number; [key: string]: unknown } }) => {
      const id = typeof doc.id === 'string' || typeof doc.id === 'number' ? String(doc.id) : ''
      if (id) {
        selectDoc(doc, id)
        closeCreateDrawer()
      }
    },
    [selectDoc, closeCreateDrawer],
  )

  const handleSave = async (finalCrops: CropData) => {
    if (!media?.id) return

    setCropData(finalCrops)
    setModalOpen(false)
    setGenerating(true)

    const requests = buildCropRequests(cropDefinitions, finalCrops, media.id)
    const results = await Promise.all(
      requests.map(({ key, body }) =>
        fetch(endpoint, {
          body: JSON.stringify(body),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })
          .then((res) => res.json())
          .then((data: unknown) => {
            if (isRecord(data) && typeof data.url === 'string') {
              return { name: key, url: data.url }
            }
            return null
          })
          .catch((e: unknown) => {
            console.error(`[CropImageField] Network error for crop "${key}":`, e)
            return null
          }),
      ),
    )

    const newUrls: GeneratedUrls = { ...(generatedUrls ?? {}) }
    for (const result of results) {
      if (result) newUrls[result.name] = result.url
    }

    setGeneratedUrls(newUrls)
    setGenerating(false)
  }

  const remove = () => {
    setImageValue(null)
    setCropData(null)
    setGeneratedUrls(null)
    setFetchedDoc(null)
  }

  const urls = generatedUrls ?? {}
  const crops = cropData ?? {}
  const anyCropSet = cropDefinitions.some((d) => crops[d.name])
  const allCropsReady = cropDefinitions.every((d) =>
    d.sizes ? d.sizes.every((s) => urls[`${d.name}.${s.name}`]) : Boolean(urls[d.name]),
  )

  const fileMeta = media
    ? [
        media.filesize ? formatFileSize(media.filesize) : null,
        media.width && media.height ? `${media.width}×${media.height}` : null,
        media.mimeType ?? null,
      ]
        .filter(Boolean)
        .join(' — ')
    : null

  return {
    media,
    fileMeta,
    urls,
    crops,
    anyCropSet,
    allCropsReady,
    modalOpen,
    setModalOpen,
    previewOpen,
    setPreviewOpen,
    generating,
    ListDrawer,
    CreateMediaDrawer,
    openMediaDrawer,
    openCreateDrawer,
    handleListSelect,
    handleDocCreate,
    handleSave,
    remove,
  }
}
