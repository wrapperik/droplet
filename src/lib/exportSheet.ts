import { resolveRoles, type PaletteBlock } from './palette.ts'
import { brandSheetData, type BrandChoicesForSheet } from './paletteExport.ts'

// Makes the one-page brand sheet and hands it to the browser as a download. The PDF library is large, so it is
// fetched only now. Used by the Export button and by the AI's export action, so both do exactly the same thing.
export async function exportBrandSheet(blocks: PaletteBlock[], projectName: string, choices: BrandChoicesForSheet = {}): Promise<boolean> {
  const { downloadBrandSheet } = await import('../export/brandSheet.tsx')
  return downloadBrandSheet(brandSheetData(blocks, resolveRoles(blocks), projectName, new Date(), choices), projectName)
}
