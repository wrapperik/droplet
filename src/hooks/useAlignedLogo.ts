import { useEffect, useMemo, useState } from 'react'
import type { LogoSave } from '../lib/logoSave.ts'
import { alignedPng } from '../lib/logoRaster.ts'

// The project's logo with the empty space round it trimmed, so it sits centred and sized by the mark itself. It keeps the shape of `useProjectLogo`:
// undefined until the logo has been read, null if there is none. While the trimmed copy is being made the logo as it was is drawn, and if it cannot be made
// that stays.
export function useAlignedLogo(logo: LogoSave | null | undefined): { dataUrl: string } | null | undefined {
  const [aligned, setAligned] = useState<{ from: string; dataUrl: string } | null>(null)
  const source = logo?.dataUrl
  useEffect(() => {
    if (!logo) return
    let wanted = true
    void alignedPng(logo).then((dataUrl) => {
      if (wanted && dataUrl) setAligned({ from: logo.dataUrl, dataUrl })
    })
    return () => {
      wanted = false
    }
  }, [logo])
  const shown = aligned && aligned.from === source ? aligned.dataUrl : source
  // One object for one image, so what is given the page does not change on every render.
  const drawn = useMemo(() => (shown ? { dataUrl: shown } : null), [shown])
  return logo === undefined ? undefined : logo === null ? null : drawn
}
