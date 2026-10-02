// Placeholder data until projects come from Supabase.
export type ProjectSummary = { id: string; name: string }

export type AssetStatus = 'resolved' | 'outstanding'
export type AssetSummary = { id: string; label: string; status: AssetStatus }

export const mockUser = { name: 'Megan' }

export const mockProjects: ProjectSummary[] = [
  { id: 'duckstack', name: 'DuckStack' },
  { id: 'colour-palette', name: 'Colour Palette' },
  { id: 'typography', name: 'Typography' },
]

// Assets of the current project. Outstanding assets never block anything; they are only flagged.
export const mockAssets: AssetSummary[] = [
  { id: 'asset-palette', label: 'Palette', status: 'resolved' },
  { id: 'asset-type', label: 'Type pairing', status: 'resolved' },
  { id: 'asset-logo', label: 'Logo', status: 'outstanding' },
  { id: 'asset-invoice', label: 'Invoice 0001', status: 'outstanding' },
]
