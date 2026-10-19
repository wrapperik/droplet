import { useEffect, useState, type ReactNode } from "react";
import { setPortalFrame } from "../shims/reactDom.ts";

// A box the size of the video's frame. While it is mounted, a dialog that the app draws into the page's body is drawn
// in here instead, so it sits over the video and nothing else. The box makes its own containing block, so the
// dialog's `position: fixed` is fixed to the frame.
export default function PortalHost({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <div ref={setHost} style={{ position: "absolute", inset: 0, zIndex: 1000, transform: "translateZ(0)", pointerEvents: "none" }} />
      {host && <Redirect host={host}>{children}</Redirect>}
    </>
  );
}

function Redirect({ host, children }: { host: HTMLElement; children: ReactNode }) {
  // Named before the dialog below it is drawn, which happens in this same pass.
  setPortalFrame(host);
  useEffect(() => () => setPortalFrame(null), []);
  return <>{children}</>;
}
