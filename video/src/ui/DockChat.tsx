import ChatBar from "../../../src/components/ChatBar.tsx";
import ChatThread, { type ThreadMessage } from "../../../src/components/ChatThread.tsx";
import IntentBar from "../../../src/components/IntentBar.tsx";

const noop = () => {};

// The conversation docked beside a workspace, as Home draws it: the chat bar, the thread, and the message bar
// at the foot.
export default function DockChat({ messages, placeholder = "Write your message..." }: { messages: ThreadMessage[]; placeholder?: string }) {
  return (
    <>
      <ChatBar onFullScreen={noop} />
      <ChatThread messages={messages} paged onUndoReceipt={noop} onShowReceipt={noop} />
      <IntentBar docked showTip={false} hints={{ placeholder }} />
    </>
  );
}
