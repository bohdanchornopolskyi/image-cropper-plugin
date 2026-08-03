'use client'

import { useDocumentDrawer, useField, useListDrawer } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { CropData, CropDefinition, GeneratedUrls } from '../types.js'

import { buildCropRequests } from '../crop-requests.js'
import { isRecord } from '../isRecord.js'

export type MediaDoc = {
  alt?: null | string
  filename?: null | string
  filesize?: null | number
  height?: null | number
  id: number | string
  mimeType?: null | string
  url?: null | string
  width?: null | number
}

function isMediaDoc(v: unknown): v is MediaDoc {
  return isRecord(v) && 'id' in v
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)}MB`
  }
  return `${Math.round(bytes / 1_000)}KB`
}

export function useCropImageField(args: {
  apiRoute: string
  cropDefinitions: CropDefinition[]
  endpoint: string
  mediaCollectionSlug: string
  path: string
}) {
  const { apiRoute, cropDefinitions, endpoint, mediaCollectionSlug, path } = args

  const {
    filterOptions,
    setValue: setImageValue,
    value: imageRaw,
  } = useField<MediaDoc | null | number>({
    path: `${path}.image`,
  })
  const { setValue: setCropData, value: cropData } = useField<CropData | null>({
    path: `${path}.cropData`,
  })
  const { setValue: setGeneratedUrls, value: generatedUrls } = useField<GeneratedUrls | null>({
    path: `${path}.generatedUrls`,
  })

  const imageDoc: MediaDoc | null =
    imageRaw !== null && typeof imageRaw !== 'number' && typeof imageRaw !== 'string'
      ? imageRaw
      : null
  const imageId: null | number | string =
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
        if (isMediaDoc(data)) {
          setFetchedDoc(data)
        }
      })
      .catch(() => null)
    return () => controller.abort()
  }, [imageId, mediaCollectionSlug])

  // fetchedDoc takes priority: it always has all fields; imageDoc may have only {id}.
  const media: MediaDoc | null = imageId ? (fetchedDoc ?? imageDoc) : null

  const [ListDrawer, , { closeDrawer: closeMediaDrawer, openDrawer: openMediaDrawer }] =
    useListDrawer({
      collectionSlugs: [mediaCollectionSlug],
      filterOptions,
    })

  const [CreateMediaDrawer, , { closeDrawer: closeCreateDrawer, openDrawer: openCreateDrawer }] =
    useDocumentDrawer({ collectionSlug: mediaCollectionSlug })

  const [modalOpen, setModalOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [generating, setGenerating] = useState(false)

  const selectDoc = useCallback(
    (doc: Record<string, unknown>, docID: string) => {
      const newDoc: MediaDoc = {
        id: typeof doc.id === 'number' || typeof doc.id === 'string' ? doc.id : docID,
        alt: typeof doc.alt === 'string' ? doc.alt : null,
        filename: typeof doc.filename === 'string' ? doc.filename : null,
        filesize: typeof doc.filesize === 'number' ? doc.filesize : null,
        height: typeof doc.height === 'number' ? doc.height : null,
        mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : null,
        url: typeof doc.url === 'string' ? doc.url : null,
        width: typeof doc.width === 'number' ? doc.width : null,
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
    ({ doc, docID }: { collectionSlug: string; doc: Record<string, unknown>; docID: string }) => {
      closeMediaDrawer()
      selectDoc(doc, docID)
    },
    [selectDoc, closeMediaDrawer],
  )

  const handleDocCreate = useCallback(
    ({ doc }: { doc: { [key: string]: unknown; id?: number | string } }) => {
      const id = typeof doc.id === 'string' || typeof doc.id === 'number' ? String(doc.id) : ''
      if (id) {
        selectDoc(doc, id)
        closeCreateDrawer()
      }
    },
    [selectDoc, closeCreateDrawer],
  )

  const handleSave = async (finalCrops: CropData) => {
    if (!media?.id) {
      return
    }

    setCropData(finalCrops)
    setModalOpen(false)
    setGenerating(true)

    const requests = buildCropRequests(cropDefinitions, finalCrops, media.id)
    const results = await Promise.all(
      requests.map(({ body, key }) =>
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
      if (result) {
        newUrls[result.name] = result.url
      }
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
    allCropsReady,
    anyCropSet,
    CreateMediaDrawer,
    crops,
    fileMeta,
    generating,
    handleDocCreate,
    handleListSelect,
    handleSave,
    ListDrawer,
    media,
    modalOpen,
    openCreateDrawer,
    openMediaDrawer,
    previewOpen,
    remove,
    setModalOpen,
    setPreviewOpen,
    urls,
  }
}
