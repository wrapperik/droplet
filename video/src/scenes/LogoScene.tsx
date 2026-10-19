import { useCurrentFrame } from "remotion";
import ChatThread, { type ThreadMessage } from "../../../src/components/ChatThread.tsx";
import IntentBar from "../../../src/components/IntentBar.tsx";
import { specColours } from "../../../src/lib/logoHandoff.ts";
import { beat, beatsIn } from "../timing.ts";
import { FINAL_BLOCKS, PROJECT_NAME } from "../seed.ts";
import HomeFrame from "../ui/HomeFrame.tsx";
import { typedAt } from "../ui/motion.ts";
import Pointer from "../ui/Pointer.tsx";
import Stage from "../ui/Stage.tsx";

const ASK = "Can you make me a logo?";

const ASKED: ThreadMessage = { id: 1, from: "you", text: ASK };

const THINKING: ThreadMessage = { id: 2, from: "droplet", text: "", pending: true };

const REPLY: ThreadMessage = {
  id: 2,
  from: "droplet",
  text: "I cannot make logos or images. I can write the brief for one, with your colours and fonts, so a free design tool or a designer has everything it needs.",
  blocks: [
    {
      type: "brief",
      does: "Handmade gift boxes for small businesses and gifting clients in Pretoria.",
      feel: ["warm", "friendly", "handmade"],
      usedFor: "Invoices, social media and the website.",
    },
  ],
};

const BRAND = {
  name: PROJECT_NAME,
  colours: specColours({ blocks: FINAL_BLOCKS.map((block) => ({ hex: block.hex, role: block.role ?? null })) }),
  fontsFact: "Fraunces and DM Sans",
};

// When each thing happens, in beats: the question is typed, sent, Droplet thinks, and its answer arrives with the brief.
const SENT = 3.4;
const ANSWERED = 5.4;

const messagesAt = (b: number): ThreadMessage[] => (b < SENT ? [] : b < ANSWERED ? [ASKED, THINKING] : [ASKED, REPLY]);

export default function LogoScene() {
  const frame = useCurrentFrame();
  const b = beatsIn(frame);
  const typed = b < SENT ? typedAt(frame, ASK, beat(0.6), beat(2.9)) + (Math.floor(b * 2) % 2 === 0 ? "|" : "") : "";

  return (
    <Stage
      camera={[
        { at: 0, scale: 1.3, fx: 0.5, fy: 0.86 },
        { at: beat(SENT), scale: 1.2, fx: 0.5, fy: 0.3, frames: 26 },
        { at: beat(ANSWERED + 0.4), scale: 1.3, fx: 0.5, fy: 0.45, frames: 30 },
      ]}
      overlay={<Pointer stops={[{ at: beat(9.6), selector: ".logo-brief__header .copy-text", click: true }]} />}
    >
      <HomeFrame
        layout="chat"
        collapsed
        conversation={<ChatThread messages={messagesAt(b)} brand={BRAND} onOpenHandoff={() => {}} />}
        footer={
          <div className={typed ? "vid-typed" : undefined} style={{ display: "contents" }}>
            <IntentBar showTip={false} hints={{ placeholder: typed || "Write your message..." }} />
          </div>
        }
      />
    </Stage>
  );
}
