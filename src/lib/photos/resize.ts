import { fitWithin } from '@/domain/photos'

/** Reduz uma foto no navegador: JPEG, lado maior 1600 px. Uma foto de telemóvel fica em ~300 KB. */
export async function resizeImage(file: File, max = 1600): Promise<{ blob: Blob; w: number; h: number }> {
  if (!file.type.startsWith('image/')) throw new Error('O ficheiro não é uma imagem. Escolha uma foto JPG, PNG ou WebP.')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Não foi possível ler esta imagem. Tente outra foto.')
  }
  const { w, h } = fitWithin(bmp.width, bmp.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
  if (!blob) throw new Error('Não foi possível preparar a foto. Tente outra imagem.')
  return { blob, w, h }
}
