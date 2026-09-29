import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

type Props = {
  filePath: string
}

const MIN_ZOOM = 0.4
const MAX_ZOOM = 3
const ZOOM_STEP = 0.15

export default function PdfPreview({ filePath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [fitMode, setFitMode] = useState(true)
  const [rotation, setRotation] = useState(0)
  const [pageCount, setPageCount] = useState(0)

  // Load document once per file
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setZoom(1)
    setFitMode(true)
    setRotation(0)
    setPageCount(0)

    ;(async () => {
      try {
        if (docRef.current) {
          await docRef.current.destroy()
          docRef.current = null
        }
        const data = await window.faxInbox.readPdf(filePath)
        if (cancelled) return
        const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
        if (cancelled) {
          await doc.destroy()
          return
        }
        docRef.current = doc
        setPageCount(doc.numPages)
        setLoading(false)
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError('Vorschau konnte nicht geladen werden.')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      void docRef.current?.destroy()
      docRef.current = null
    }
  }, [filePath])

  const renderPages = useCallback(async () => {
    const doc = docRef.current
    const container = containerRef.current
    if (!doc || !container || loading || error) return

    container.innerHTML = ''
    const pagesWrap = document.createElement('div')
    pagesWrap.className = 'preview-pages'

    const available = Math.max(container.clientWidth - 24, 200)

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const base = page.getViewport({ scale: 1, rotation: rotation })
      const fitScale = available / base.width
      const scale = fitMode ? fitScale : fitScale * zoom
      const viewport = page.getViewport({
        scale: Math.max(scale, 0.2),
        rotation,
      })

      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`

      await page.render({ canvasContext: ctx, viewport }).promise
      pagesWrap.appendChild(canvas)
    }

    container.appendChild(pagesWrap)
  }, [fitMode, zoom, rotation, loading, error])

  useEffect(() => {
    void renderPages()
  }, [renderPages, pageCount])

  useEffect(() => {
    const onResize = () => {
      void renderPages()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [renderPages])

  const zoomIn = () => {
    setFitMode(false)
    setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))
  }

  const zoomOut = () => {
    setFitMode(false)
    setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))
  }

  const fitWidth = () => {
    setFitMode(true)
    setZoom(1)
  }

  const rotate = (dir: 1 | -1) => {
    setRotation((r) => (r + dir * 90 + 360) % 360)
  }

  const zoomLabel = fitMode ? 'Seite' : `${Math.round(zoom * 100)}%`

  return (
    <div className="preview-stack">
      <div className="preview-toolbar" role="toolbar" aria-label="Vorschau-Werkzeuge">
        <button type="button" className="btn btn-ghost tool-btn" onClick={zoomOut} title="Verkleinern" aria-label="Verkleinern">
          −
        </button>
        <span className="zoom-label">{zoomLabel}</span>
        <button type="button" className="btn btn-ghost tool-btn" onClick={zoomIn} title="Vergrößern" aria-label="Vergrößern">
          +
        </button>
        <button type="button" className="btn btn-ghost" onClick={fitWidth} title="Seitenbreite">
          Anpassen
        </button>
        <span className="tool-sep" aria-hidden />
        <button type="button" className="btn btn-ghost" onClick={() => rotate(-1)} title="Gegen Uhrzeigersinn drehen">
          ↺ Drehen
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => rotate(1)} title="Im Uhrzeigersinn drehen">
          ↻ Drehen
        </button>
      </div>
      <div className="preview-body" ref={containerRef}>
        {loading && !error && <p style={{ color: 'var(--text-muted)' }}>Vorschau wird geladen…</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    </div>
  )
}
