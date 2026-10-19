import InvoiceWorkspace from "../../../src/components/invoice/InvoiceWorkspace.tsx";
import type { HeaderSlots } from "../../../src/components/WorkspaceShell.tsx";
import type { GuideStepId } from "../../../src/lib/invoiceGuide.ts";
import type { InvoiceState } from "../../../src/lib/invoiceState.ts";
import { PROJECT_ID, PROJECT_NAME } from "../seed.ts";

const noop = () => {};

type Props = {
  state: InvoiceState;
  step: GuideStepId;
  // The furthest part reached, as an index: parts beyond it are shown but cannot be pressed.
  reached: number;
  slots: HeaderSlots;
};

// The app's own invoice workspace, in Guide mode. What is on the invoice and which part is showing come from
// the frame, so every frame is the workspace as it would look at that moment.
export default function InvoiceStage({ state, step, reached, slots }: Props) {
  return (
    <InvoiceWorkspace
      mode="guide"
      projectId={PROJECT_ID}
      projectName={PROJECT_NAME}
      state={state}
      dispatch={noop}
      onReplace={noop}
      progress={{ invoiceId: state.history.present.invoiceId, step, reached }}
      onProgress={noop}
      onFinished={noop}
      headerSlots={slots}
    />
  );
}
