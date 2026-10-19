import { useCurrentFrame } from "remotion";
import { reduceInvoice, openInvoiceWorkspace, type InvoiceState } from "../../../src/lib/invoiceState.ts";
import type { Receipt } from "../../../src/compose/receipt.ts";
import type { ThreadMessage } from "../../../src/components/ChatThread.tsx";
import { beat, beatsIn } from "../timing.ts";
import { INVOICE_ID, invoiceFinal, setLogoAdded } from "../seed.ts";
import DockChat from "../ui/DockChat.tsx";
import HomeFrame from "../ui/HomeFrame.tsx";
import InvoiceStage from "../ui/InvoiceStage.tsx";
import Pointer from "../ui/Pointer.tsx";
import Stage from "../ui/Stage.tsx";

const CHANGE = { type: "update_line", id: 1, patch: { quantity: 15 } } as const;

const receipt = (undone: boolean): Receipt => ({
  heading: "Changed 1 line on the invoice",
  lines: [{ mark: "", text: "Gift box, small: quantity 12 to 15" }],
  left: [],
  ...(undone ? { status: "Undone. The invoice is as it was." } : {}),
});

// What the scene shows, by beat: the invoice as it was, then Droplet's change to it, then the change undone. The
// number stays the same through all three, because it belongs to the invoice and not to the version.
const stateAt = (b: number): InvoiceState => {
  const start = openInvoiceWorkspace(invoiceFinal(), INVOICE_ID);
  if (b < 2.4) return start;
  const changed = reduceInvoice(start, CHANGE);
  return b < 7.3 ? changed : reduceInvoice(changed, { type: "undo" });
};

const messagesAt = (b: number): ThreadMessage[] => {
  const asked: ThreadMessage = { id: 1, from: "you", text: "Make it 15 small gift boxes." };
  if (b < 1.4) return [asked];
  const undone = b >= 7.3;
  return [
    asked,
    {
      id: 2,
      from: "droplet",
      text: "Done. The gift boxes are now 15, and the totals follow.",
      receipt: receipt(undone),
      receiptLive: undone ? undefined : { undo: true, show: true },
    },
  ];
};

export default function UndoScene() {
  const frame = useCurrentFrame();
  setLogoAdded(true);
  const b = beatsIn(frame);

  return (
    <Stage
      camera={[
        { at: 0, scale: 1.1, fx: 0.55, fy: 0.45 },
        { at: beat(1.6), scale: 1.3, fx: 0.72, fy: 0.35, frames: 36 },
        { at: beat(8), scale: 1.2, fx: 0.38, fy: 0.55, frames: 40 },
      ]}
      overlay={<Pointer stops={[{ at: beat(7), selector: ".receipt__button", click: true }]} />}
    >
      <HomeFrame
        layout="workspace"
        collapsed
        dock={<DockChat messages={messagesAt(b)} />}
        workspace={(slots) => <InvoiceStage state={stateAt(b)} step="lines" reached={5} slots={slots} />}
      />
    </Stage>
  );
}
