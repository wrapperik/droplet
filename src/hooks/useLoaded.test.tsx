import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLoaded } from './useLoaded.ts'

// A read that finishes when the test says so.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useLoaded', () => {
  it('is not loaded, and gives the stand-in, until the read arrives', async () => {
    const read = deferred<string>()
    const { result } = renderHook(() => useLoaded('a', () => read.promise, 'stand-in'))
    expect(result.current).toMatchObject({ loaded: false, value: 'stand-in' })
    await act(async () => read.resolve('real'))
    expect(result.current).toMatchObject({ loaded: true, value: 'real' })
  })

  it('reads again for another key, and is not loaded while it does, so one project\'s data is never shown as another\'s', async () => {
    const reads: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() }
    const { result, rerender } = renderHook(({ id }) => useLoaded(id, () => reads[id].promise, 'stand-in'), { initialProps: { id: 'a' } })
    await act(async () => reads.a.resolve('from a'))
    expect(result.current.value).toBe('from a')
    rerender({ id: 'b' })
    expect(result.current).toMatchObject({ loaded: false, value: 'stand-in' })
    await act(async () => reads.b.resolve('from b'))
    expect(result.current).toMatchObject({ loaded: true, value: 'from b' })
  })

  it('drops what arrives for a key that is no longer wanted', async () => {
    const reads: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() }
    const { result, rerender } = renderHook(({ id }) => useLoaded(id, () => reads[id].promise, 'stand-in'), { initialProps: { id: 'a' } })
    rerender({ id: 'b' })
    // the slow read of the first arrives after the second was asked for
    await act(async () => reads.a.resolve('late, from a'))
    expect(result.current).toMatchObject({ loaded: false, value: 'stand-in' })
    await act(async () => reads.b.resolve('from b'))
    expect(result.current.value).toBe('from b')
  })

  it('takes a value that is known without reading, such as what was just saved', async () => {
    const { result } = renderHook(() => useLoaded('a', async () => 'saved before', 'stand-in'))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    act(() => result.current.set('saved now'))
    expect(result.current).toMatchObject({ loaded: true, value: 'saved now' })
  })
})
