import { useCurrentFrame } from "remotion";
import type { InvoiceContent } from "../../../src/lib/invoice.ts";
import { TEMPLATE_IDS, type InvoiceTemplateId } from "../../../src/lib/invoiceTemplates.ts";
import type { GuideStepId } from "../../../src/lib/invoiceGuide.ts";
import { openInvoiceWorkspace } from "../../../src/lib/invoiceState.ts";
import type { ThreadMessage } from "../../../src/components/ChatThread.tsx";
import { beat, beatsIn } from "../timing.ts";
import { CLIENT, FINAL_LINES, INVOICE_ID, invoiceBase, setLogoAdded } from "../seed.ts";
import DockChat from "../ui/DockChat.tsx";
import HomeFrame from "../ui/HomeFrame.tsx";
import InvoiceStage from "../ui/InvoiceStage.tsx";
import { typedAt } from "../ui/motion.ts";
import Pointer from "../ui/Pointer.tsx";
import Stage from "../ui/Stage.tsx";

const THREAD: ThreadMessage[] = [
  { id: 1, from: "you", text: "Invoice for Kindred Gifting" },
  {
    id: 2,
    from: "droplet",
    text: "I have opened an invoice for Kindred Gifting, with your business details and brand colours already on it. Check the client, add the lines, and I will flag anything missing before you export.",
  },
];

// The looks the founder tries at the start, in beats, by their place in the picker. The last is kept.
const TEMPLATE_CLICKS: { at: number; template: InvoiceTemplateId }[] = [
  { at: 1.4, template: "classic" },
  { at: 2.9, template: "rounded" },
  { at: 4.4, template: "striped" },
];

const templateAt = (b: number): InvoiceTemplateId => TEMPLATE_CLICKS.filter((click) => b >= click.at).pop()?.template ?? "band";

// What is on the invoice at a moment of the scene. The lines arrive one by one, and the client's address, which
// the invoice needs, is missing until it is typed in.
const invoiceAt = (frame: number): InvoiceContent => {
  const base = invoiceBase();
  const b = beatsIn(frame);
  const lines = FINAL_LINES.filter((_, index) => (index === 0 ? true : index === 1 ? b >= 9.6 : b >= 10.8));
  const address = typedAt(frame, CLIENT.address, beat(15.8), beat(18.6));
  return { ...base, details: { ...base.details, template: templateAt(b) }, lines, client: { ...base.client, address } };
};

// The lines are added to the page while the client part is showing, so the client is what the words on screen are about.
const stepAt = (b: number): GuideStepId => (b < 6 ? "business" : b < 12 ? "client" : b < 15 ? "review" : b < 19.6 ? "client" : "review");

export default function InvoiceScene() {
  const frame = useCurrentFrame();
  setLogoAdded(true);
  const b = beatsIn(frame);
  const state = openInvoiceWorkspace(invoiceAt(frame), INVOICE_ID);

  return (
    <>
      <Stage
        camera={[
          { at: 0, scale: 1.3, fx: 0.27, fy: 0.4 },
          { at: beat(5.8), scale: 1.3, fx: 0.62, fy: 0.56, frames: 36 },
          { at: beat(9.2), scale: 1.25, fx: 0.3, fy: 0.62, frames: 30 },
          { at: beat(11.6), scale: 1.15, fx: 0.58, fy: 0.38, frames: 30 },
          { at: beat(15.2), scale: 1.25, fx: 0.62, fy: 0.52, frames: 30 },
          { at: beat(17.2), scale: 1, frames: 24 },
          { at: beat(22.2), scale: 1.12, fx: 0.55, fy: 0.3, frames: 40 },
        ]}
        overlay={
          <Pointer
            stops={[
              ...TEMPLATE_CLICKS.map((click) => ({ at: beat(click.at), selector: `.templates__option:nth-child(${TEMPLATE_IDS.indexOf(click.template) + 1})`, click: true })),
              { at: beat(14.6), selector: ".ready__fix", click: true },
              { at: beat(19.4), selector: '.taskbar__item[data-id="review"] .taskbar__button', click: true },
              { at: beat(21.6), selector: ".workspace__button--fixed", click: true },
            ]}
          />
        }
      >
        <HomeFrame
          layout="workspace"
          collapsed
          dock={<DockChat messages={THREAD} />}
          workspace={(slots) => <InvoiceStage state={state} step={stepAt(b)} reached={5} slots={slots} />}
        />
      </Stage>
    </>
  );
}
