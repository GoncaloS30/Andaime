import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createPhotoStore } from './photoStore'

const blob = (s: string) => new Blob([s], { type: 'image/jpeg' })

describe('photoStore', () => {
  it('guarda, lê, remove e limpa no IndexedDB', async () => {
    const st = createPhotoStore(indexedDB)
    expect(st.persistent).toBe(true)
    await st.put('a', blob('1'))
    await st.put('b', blob('2'))
    expect(await (await st.get('a'))!.text()).toBe('1')
    await st.remove('a')
    expect(await st.get('a')).toBeNull()
    await st.clear()
    expect(await st.get('b')).toBeNull()
  })
  it('sem IndexedDB funciona em memória e diz que não persiste', async () => {
    const st = createPhotoStore(null)
    expect(st.persistent).toBe(false)
    await st.put('a', blob('x'))
    expect(await (await st.get('a'))!.text()).toBe('x')
  })
})
