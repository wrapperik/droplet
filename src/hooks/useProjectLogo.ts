import { useEffect, useState } from 'react'
import { loadLogo, type LogoSave } from '../lib/logoStore.ts'

// The project's logo: undefined until it has been read, then the logo or null if there is none. Read again when the project changes or `version`
// does (the handoff card adds or removes the logo while the invoice is on screen), and what arrives for a project no longer wanted is dropped.
export function useProjectLogo(projectId: string, version = 0): LogoSave | null | undefined {
  const [state, setState] = useState<{ key: string; logo: LogoSave | null } | null>(null)
  const key = `${projectId}:${version}`
  useEffect(() => {
    let wanted = true
    void loadLogo(projectId).then((logo) => {
      if (wanted) setState({ key, logo })
    })
    return () => {
      wanted = false
    }
  }, [projectId, key])
  // While the same project reloads for a new version the earlier answer stands, so the logo does not blink out.
  return state === null || state.key.split(':')[0] !== projectId ? undefined : state.logo
}
