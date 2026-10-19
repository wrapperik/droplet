import { useEffect, useRef } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import BoardWorkspace from "../../../src/components/board/BoardWorkspace.tsx";
import IntentBar from "../../../src/components/IntentBar.tsx";
import "../../../src/components/ChatGreeting.css";
import { beat, beatsIn } from "../timing.ts";
import { PROJECT_ID, PROJECT_NAME, USER_NAME } from "../seed.ts";
import DockChat from "../ui/DockChat.tsx";
import HomeFrame from "../ui/HomeFrame.tsx";
import { arrive, typedAt } from "../ui/motion.ts";
import Pointer from "../ui/Pointer.tsx";
import Stage from "../ui/Stage.tsx";
import ZoomInOnce from "../ui/ZoomInOnce.tsx";
import { BOARD_THREAD, BRAINSTORM_MESSAGE, boardAt } from "./boardData.ts";

const noop = () => {};

// The bar in the middle of an empty chat. What is typed so far is the field's placeholder, which is drawn like
// typed text (see stage.css), so the frame can decide it. The menu is opened by pressing the bar's workspaces button,
// as a person would, when the frame says it is open.
function StartBar({ typed, menuOpen }: { typed: string; menuOpen: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menuOpen) ref.current?.querySelector<HTMLButtonElement>('button[aria-label="Choose a task"]')?.click();
  }, [menuOpen]);
  return (
    <div ref={ref} className="vid-typed" style={{ display: "contents" }}>
      <IntentBar showTip hints={{ placeholder: typed }} />
    </div>
  );
}

// The home screen: the founder writes what they want, picks "Shape the business idea" from the menu, and the screen
// becomes the brainstorm board, which the brand part then fills in.
export default function HomeScene() {
  const frame = useCurrentFrame();
  const b = beatsIn(frame);
  const docked = b >= 11;
  const typed = typedAt(frame, BRAINSTORM_MESSAGE, beat(1), beat(5.5));
  const caret = Math.floor(b * 2) % 2 === 0 && b < 6.5 ? "|" : "";
  const menuOpen = b >= 7 && b < 11;
  const emerge = arrive(frame, beat(11), 20);

  return (
    <Stage
      camera={[
        { at: 0, scale: 1.4, fx: 0.57, fy: 0.47 },
        { at: beat(7.3), scale: 1.2, fx: 0.62, fy: 0.6, frames: 28 },
        { at: beat(11), scale: 1, frames: 1 },
        { at: beat(12), scale: 1.12, fx: 0.42, fy: 0.5, frames: 60 },
      ]}
      overlay={
        <>
          {docked && <ZoomInOnce />}
          <Pointer
            hideFrom={beat(11)}
            stops={[
              { at: beat(7), selector: 'button[aria-label="Choose a task"]', click: true },
              { at: beat(10.4), selector: ".task-menu__item:nth-child(1)", click: true },
            ]}
          />
        </>
      }
    >
      {docked ? (
        <HomeFrame
          key="board"
          layout="workspace"
          board
          collapsed
          dock={<DockChat messages={BOARD_THREAD} />}
          workspace={(slots) => (
            <div style={{ position: "absolute", inset: 0, opacity: emerge, scale: String(interpolate(emerge, [0, 1], [0.96, 1])) }}>
              <BoardWorkspace projectId={PROJECT_ID} projectName={PROJECT_NAME} state={boardAt(-1)} dispatch={noop} headerSlots={slots} topInset={110} />
            </div>
          )}
        />
      ) : (
        <HomeFrame
          key="start"
          layout="start"
          glowSeconds={frame / 30}
          footer={
            <>
              <h2 className="chat-greeting">{`Good morning, ${USER_NAME}`}</h2>
              <StartBar key={menuOpen ? "open" : "closed"} typed={typed + caret} menuOpen={menuOpen} />
            </>
          }
        />
      )}
    </Stage>
  );
}
