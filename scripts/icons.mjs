import sharp from 'sharp'
import { readFile, mkdir } from 'node:fs/promises'

const svg = await readFile('src/brand/icon.svg')
await mkdir('public/icons', { recursive: true })
for (const size of [16, 32, 48, 128]) {
  await sharp(svg, { density: 320 }).resize(size, size).png().toFile(`public/icons/icon${size}.png`)
}
