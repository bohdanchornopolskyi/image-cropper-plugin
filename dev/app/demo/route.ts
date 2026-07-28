import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { CropImageValue } from '../../../src/types.js'
import { getCropUrl, getFocalPosition } from '../../../src/utilities.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({ collection: 'posts', limit: 1, depth: 1 })
  const post = docs[0] as Record<string, unknown> | undefined

  const cardImage = (post?.cardImage ?? null) as CropImageValue | null
  const heroImage = (post?.heroImage ?? null) as CropImageValue | null

  const lgUrl = getCropUrl(cardImage, 'card', 'lg')
  const mdUrl = getCropUrl(cardImage, 'card', 'md')
  const smUrl = getCropUrl(cardImage, 'card', 'sm')

  const hasCrops = Boolean(lgUrl || mdUrl || smUrl)

  const heroDesktopUrl = getCropUrl(heroImage, 'desktop')
  const heroMobileUrl = getCropUrl(heroImage, 'mobile')
  const hasHeroCrops = Boolean(heroDesktopUrl || heroMobileUrl)

  const heroRawImage =
    heroImage?.image && typeof heroImage.image === 'object'
      ? (heroImage.image as {
          id?: number | string
          focalX?: number
          focalY?: number
          url?: string
        })
      : null
  const focalRawUrl = typeof heroRawImage?.url === 'string' ? heroRawImage.url : null
  const focalPosition = getFocalPosition(heroRawImage)

  const nextImageLoaderExample = `\
// Custom loader — maps Next.js width breakpoints to your pre-generated sizes.
// Add to your Next.js page/component:

import Image from 'next/image'
import { getCropUrl } from 'payload-plugin-image-cropper/utilities'

function cardImageLoader({ width }) {
  if (width <= 390) return getCropUrl(post.cardImage, 'card', 'sm')
  if (width <= 768) return getCropUrl(post.cardImage, 'card', 'md')
  return getCropUrl(post.cardImage, 'card', 'lg')
}

<Image
  loader={cardImageLoader}
  src={getCropUrl(post.cardImage, 'card', 'lg')}
  alt="Card"
  width={1200}
  height={675}
  sizes="(max-width: 390px) 390px, (max-width: 768px) 768px, 1200px"
  priority
/>`

  const s3Example = `\
// S3 integration — upload crop files to S3 and store the CDN URL.
// In your payload.config.ts:

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { cropImagePlugin } from 'payload-plugin-image-cropper'

const s3 = new S3Client({ region: process.env.S3_REGION })

cropImagePlugin({
  mediaDir: path.join(process.cwd(), 'public/media'),

  async onCropGenerated({ buffer, filename, format }) {
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: \`crops/\${filename}\`,
      Body: buffer,
      ContentType: format === 'jpeg' ? 'image/jpeg'
                 : format === 'png'  ? 'image/png'
                 : 'image/webp',
    }))
    return { url: \`https://\${process.env.S3_BUCKET}.s3.amazonaws.com/crops/\${filename}\` }
    // returning a url skips the local disk write
  },
})`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Multi-size crop demo</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f0f0f; color: #e8e8e8; padding: 2rem; line-height: 1.6; }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 2rem; color: #fff; }
    h2 { font-size: 1.1rem; font-weight: 600; margin: 2.5rem 0 1rem; color: #fff; border-bottom: 1px solid #2a2a2a; padding-bottom: .5rem; }
    .notice { background: #1e2a1e; border: 1px solid #3a5a3a; border-radius: 6px; padding: 1rem 1.25rem; color: #8fc98f; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden; }
    .card img { width: 100%; height: auto; display: block; }
    .card-meta { padding: .75rem; }
    .card-meta strong { display: block; font-size: .85rem; color: #fff; }
    .card-meta span { font-size: .75rem; color: #888; }
    .card-placeholder { aspect-ratio: 16/9; background: #222; display: flex; align-items: center; justify-content: center; color: #555; font-size: .8rem; }
    .srcset-demo { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden; }
    .srcset-demo img { width: 100%; height: auto; display: block; }
    .srcset-meta { padding: .75rem; font-size: .8rem; color: #888; }
    pre { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 1.25rem; font-size: .78rem; overflow-x: auto; white-space: pre-wrap; color: #c9d1d9; line-height: 1.7; }
    .tag { display: inline-block; background: #2a1a3a; color: #c9a0ff; border-radius: 4px; padding: 2px 8px; font-size: .7rem; font-family: monospace; margin-left: .5rem; vertical-align: middle; }
  </style>
</head>
<body>
  <h1>Multi-size crop demo</h1>

  ${!post ? `<div class="notice">No posts found. <a href="/admin" style="color:#8fc98f">Create a post in the admin</a>, upload an image, and crop it to see the generated sizes here.</div>` : ''}
  ${post && !hasCrops ? `<div class="notice">Post found but <strong>cardImage</strong> has not been cropped yet. <a href="/admin/collections/posts" style="color:#8fc98f">Open the post in admin</a>, set a card image, and crop it.</div>` : ''}

  <h2>Generated sizes <span class="tag">generatedUrls</span></h2>
  <div class="grid">
    ${['lg', 'md', 'sm'].map((size, i) => {
      const url = [lgUrl, mdUrl, smUrl][i]
      const dims = [{ w: 1200, h: 675 }, { w: 768, h: 432 }, { w: 390, h: 219 }][i]
      const label = ['Large — 1200×675', 'Medium — 768×432', 'Small — 390×219'][i]
      const key = `card.${size}`
      return `
    <div class="card">
      ${url
        ? `<img src="${url}" alt="${label}" loading="lazy">`
        : `<div class="card-placeholder">${key} not generated yet</div>`}
      <div class="card-meta">
        <strong>${label}</strong>
        <span>key: ${key} &nbsp;·&nbsp; getCropUrl(value, 'card', '${size}')</span>
      </div>
    </div>`
    }).join('')}
  </div>

  <h2>Standard HTML — <code>&lt;picture&gt;</code> srcset</h2>
  <div class="srcset-demo">
    <picture>
      <source media="(min-width: 1024px)" srcset="${lgUrl || ''}">
      <source media="(min-width: 640px)"  srcset="${mdUrl || ''}">
      <img
        src="${smUrl || lgUrl || mdUrl || ''}"
        alt="Card image"
        style="width:100%;height:auto;display:block;"
      >
    </picture>
    <div class="srcset-meta">Resize the browser to see the browser pick a different source.</div>
  </div>

  <h2>Hero image crops <span class="tag">heroImage</span></h2>
  ${post && !hasHeroCrops ? `<div class="notice">Post found but <strong>heroImage</strong> has not been cropped yet. <a href="/admin/collections/posts" style="color:#8fc98f">Open the post in admin</a>, set a hero image, and crop both the desktop and mobile presets.</div>` : ''}
  <div class="grid">
    ${['desktop', 'mobile'].map((name, i) => {
      const url = [heroDesktopUrl, heroMobileUrl][i]
      const label = [`Desktop — 1920×1080 (16:9)`, `Mobile — 828×1470 (9:16)`][i]
      return `
    <div class="card">
      ${url
        ? `<img src="${url}" alt="${label}" loading="lazy">`
        : `<div class="card-placeholder">${name} not generated yet</div>`}
      <div class="card-meta">
        <strong>${label}</strong>
        <span>key: ${name} &nbsp;·&nbsp; getCropUrl(post.heroImage, '${name}')</span>
      </div>
    </div>`
    }).join('')}
  </div>

  <h2>Real-world hero banner <span class="tag">resize your actual browser window</span></h2>
  <p style="color:#888;font-size:.85rem;margin-bottom:1rem;">
    This is the realistic case: one full-width banner, fixed height, <code>object-fit: cover;
    object-position: ${focalPosition ?? '50% 50%'}</code>. Now actually resize the browser window
    (not a box on this page) — as it narrows, <code>cover</code> has to crop more off the sides, and
    <code>object-position</code> is what decides which side gets kept. If you deliberately put the
    focal point away from the bird (e.g. to the left), you should see the visible slice stay anchored
    on the left as the window narrows — the bird can drift out of frame if that's where you placed the
    point. That's expected: focal point isn't "keep the subject visible," it's "keep this exact spot
    visible" — you place it on the subject yourself when that's what you want centered.
  </p>
  ${
    focalRawUrl
      ? `<div style="width:100%;height:380px;overflow:hidden;border-radius:8px;border:1px solid #2a2a2a;">
    <img src="${focalRawUrl}" alt="Hero banner" style="width:100%;height:100%;object-fit:cover;object-position:${focalPosition ?? '50% 50%'};display:block;">
  </div>
  <p style="color:#888;font-size:.8rem;margin-top:.5rem;">object-position: <code>${focalPosition ?? '50% 50%'}</code></p>`
      : `<div class="notice">No heroImage set yet — pick one to see this section.</div>`
  }

  <h2>Focal point without a crop <span class="tag">getFocalPosition</span></h2>
  ${!heroRawImage ? `<div class="notice">No heroImage set yet — pick one to see this section.</div>` : ''}
  ${heroRawImage && !focalPosition ? `<div class="notice">heroImage has no focal point set. Open it in the Media collection and drag the focal point dot, then reload this page.</div>` : ''}
  <p style="color:#888;font-size:.85rem;margin-bottom:1rem;">
    These boxes use the <strong>original, un-cropped</strong> image — no preset defined for any of these shapes.
    Each one applies <code>object-fit: cover; object-position: ${focalPosition ?? '50% 50%'}</code>,
    derived straight from the focal point on the Media doc. Compare where the subject lands across
    shapes instead of resizing the browser — a baked crop wouldn't move at all, but this does, because
    it's the same source image reframed live via CSS.
  </p>
  <div class="grid">
    ${[
      { label: 'Wide banner (21:9)', ratio: '21/9' },
      { label: 'Square (1:1)', ratio: '1/1' },
      { label: 'Portrait (3:4)', ratio: '3/4' },
    ]
      .map(
        ({ label, ratio }) => `
    <div class="card">
      ${
        focalRawUrl
          ? `<div style="aspect-ratio:${ratio};overflow:hidden;"><img src="${focalRawUrl}" alt="${label}" loading="lazy" style="width:100%;height:100%;object-fit:cover;object-position:${focalPosition ?? '50% 50%'};display:block;"></div>`
          : `<div class="card-placeholder" style="aspect-ratio:${ratio};">no image</div>`
      }
      <div class="card-meta">
        <strong>${label}</strong>
        <span>object-position: ${focalPosition ?? '50% 50% (no focal point set)'}</span>
      </div>
    </div>`,
      )
      .join('')}
  </div>

  <h2>Focal point marker <span class="tag">raw focalX / focalY</span></h2>
  <p style="color:#888;font-size:.85rem;margin-bottom:1rem;">
    The most direct check: the full, un-cropped image (nothing trimmed — <code>object-fit: contain</code>)
    with a marker drawn at the exact <code>focalX</code>/<code>focalY</code> percent stored on the Media
    doc. If this dot isn't where you dragged it in the admin, the data is wrong; if it is, any framing
    oddity in the cards above is just how <code>cover</code> crops that particular aspect ratio, not a
    focal-point bug.
  </p>
  ${
    focalRawUrl
      ? `
  <div style="position:relative;display:inline-block;max-width:100%;background:#000;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden;">
    <img src="${focalRawUrl}" alt="Full hero image" style="display:block;max-width:100%;height:auto;">
    ${
      heroRawImage && typeof heroRawImage.focalX === 'number' && typeof heroRawImage.focalY === 'number'
        ? `<div style="position:absolute;left:${heroRawImage.focalX}%;top:${heroRawImage.focalY}%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:2px solid #ff3b3b;box-shadow:0 0 0 2px #fff, 0 0 8px rgba(0,0,0,.6);"></div>
         <div style="position:absolute;left:${heroRawImage.focalX}%;top:0;bottom:0;width:1px;background:rgba(255,59,59,.5);"></div>
         <div style="position:absolute;top:${heroRawImage.focalY}%;left:0;right:0;height:1px;background:rgba(255,59,59,.5);"></div>`
        : ''
    }
  </div>
  <p style="color:#888;font-size:.8rem;margin-top:.5rem;">focalX/focalY: <code>${heroRawImage?.focalX ?? '—'}, ${heroRawImage?.focalY ?? '—'}</code> — cross-check against <code>GET /api/media/${heroRawImage?.id ?? ''}</code> or the focal point dot position in <a href="/admin/collections/media/${heroRawImage?.id ?? ''}" style="color:#8fc98f">the Media admin editor</a>.</p>`
      : ''
  }

  <h2>Next.js Image — custom loader</h2>
  <pre>${nextImageLoaderExample.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>

  <h2>S3 integration — <code>onCropGenerated</code></h2>
  <pre>${s3Example.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
