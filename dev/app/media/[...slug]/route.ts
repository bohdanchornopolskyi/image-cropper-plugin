import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const MEDIA_DIR = path.resolve(dirname, '../../../media')

const CONTENT_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const safeName = path.basename(slug.join('/'))
  const filePath = path.join(MEDIA_DIR, safeName)

  try {
    const buffer = await fs.promises.readFile(filePath)
    const ext = path.extname(safeName).slice(1).toLowerCase()
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
    return new Response(buffer, { headers: { 'Content-Type': contentType } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
