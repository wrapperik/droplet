// Which workspace is on screen. Only one is shown at a time, and each keeps its own state while another is shown. The one asked for is
// shown if it is open; if not, whichever is open comes next, so the screen is never left empty while a workspace exists.
export type WorkspaceView = 'brand' | 'invoice' | 'board'

const ORDER: WorkspaceView[] = ['brand', 'invoice', 'board']

export function shownWorkspace(open: Record<WorkspaceView, boolean>, view: WorkspaceView): WorkspaceView | null {
  if (open[view]) return view
  return ORDER.find((candidate) => open[candidate]) ?? null
}
