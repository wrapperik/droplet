import './ChatGlow.css'

// The glow behind a chat with nothing said in it: a few large, soft orbs of Droplet blue that drift slowly on closed paths, so the loop has no
// seam. It is one container clipped to the working screen, so the orbs can move without ever leaving it. Whether it is centred, sunk or gone is
// decided by its ancestors in CSS (`data-start` on .home, and `home--docked`), so it needs no props and no state. When the first message is sent the whole
// stage sinks to the foot of the screen and spreads wide, like a glowing horizon, and fades up into the screen's own colour.
export default function ChatGlow() {
  return (
    <div className="chat-glow" aria-hidden="true">
      {/* The orbs drift inside the stage; the stage carries them down. Two transforms on two elements, so neither disturbs the other. */}
      <div className="chat-glow__stage">
        <span className="chat-glow__orb chat-glow__orb--halo" />
        <span className="chat-glow__orb chat-glow__orb--core" />
        <span className="chat-glow__orb chat-glow__orb--accent" />
      </div>
    </div>
  )
}
