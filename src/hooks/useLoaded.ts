import { useCallback, useEffect, useState } from 'react'

// Something read from storage, which is not there at once: `loaded` is false until it has been read, and `value` is the stand-in given until
// then. It is read again when the key changes (another project), and what arrives for a key that is no longer wanted is dropped. `set` puts
// in a value that is known without reading, such as what was just saved.
export function useLoaded<T>(key: string, load: () => Promise<T>, whileLoading: T): { value: T; loaded: boolean; set: (value: T) => void } {
  const [state, setState] = useState<{ key: string; value: T } | null>(null)

  useEffect(() => {
    let wanted = true
    load().then((value) => {
      if (wanted) setState({ key, value })
    })
    return () => {
      wanted = false
    }
    // The key says what is loaded: `load` is made from it, and is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const set = useCallback((value: T) => setState({ key, value }), [key])
  const loaded = state !== null && state.key === key
  return { value: loaded ? state.value : whileLoading, loaded, set }
}
