import './ChatGlow.css'

// The glow behind a chat with nothing said in it: a few large, soft orbs of Droplet blue that drift slowly on closed paths, so the loop has no
// seam. It is one container clipped to the working screen, so the orbs can move without ever leaving it. Whether it is strong, quiet or gone is
// decided by its ancestors in CSS (`data-start` on .home, and `home--docked`), so it needs no props and no state.
export default function ChatGlow() {
  return (
    <div className="chat-glow" aria-hidden="true">
      <span className="chat-glow__orb chat-glow__orb--halo" />
      <span className="chat-glow__orb chat-glow__orb--core" />
      <span className="chat-glow__orb chat-glow__orb--accent" />
    </div>
  )
}
