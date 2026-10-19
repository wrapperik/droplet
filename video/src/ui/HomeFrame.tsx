import { useEffect, useState, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { cancelRender, continueRender, delayRender } from "remotion";
import ChatGlow from "../../../src/components/ChatGlow.tsx";
import Sidebar from "../../../src/components/Sidebar.tsx";
import Wordmark from "../../../src/components/Wordmark.tsx";
import type { HeaderSlots } from "../../../src/components/WorkspaceShell.tsx";
import { PROJECT_ID, PROJECT_NAME, USER_NAME } from "../seed.ts";
import "../../../src/pages/Home.css";

const noop = () => {};

const CHATS = [
  { id: "c1", title: "Invoice for Kindred Gifting", current: true },
  { id: "c2", title: "Names for the gift range", current: false, updatedAt: "2026-10-12T09:00:00.000Z" },
  { id: "c3", title: "Colours for the brand", current: false, updatedAt: "2026-10-10T14:00:00.000Z" },
];

type Props = {
  // `start`: nothing said yet, the bar in the middle. `chat`: a conversation fills the screen.
  // `workspace`: a task is open, with the conversation docked beside it.
  layout: "start" | "chat" | "workspace";
  collapsed?: boolean;
  // How far the glow behind an empty chat has drifted, in seconds of its own loop.
  glowSeconds?: number;
  // The conversation docked beside a workspace.
  dock?: ReactNode;
  // The bar and greeting at the foot of a start or chat screen.
  footer?: ReactNode;
  // The conversation that fills the screen in `chat`.
  conversation?: ReactNode;
  // A workspace, given the slots in the header it draws its controls into.
  workspace?: (slots: HeaderSlots) => ReactNode;
  panes?: boolean;
  // The board, which fills the whole working screen under the header, as Home draws it.
  board?: boolean;
};

// The app's own home screen: the sidebar, the working screen with its header, and (with a task open) the
// conversation beside it. It is the same markup as Home.tsx, with nothing behind it to load. Header controls
// are drawn into slots, as the app does, so the render waits until the slots exist.
export default function HomeFrame({ layout, collapsed = false, glowSeconds = 0, dock, footer, conversation, workspace, panes = true, board = false }: Props) {
  const [handle] = useState(() => delayRender("Waiting for the header slots"));
  const [start, setStart] = useState<HTMLElement | null>(null);
  const [end, setEnd] = useState<HTMLElement | null>(null);
  const [shelf, setShelf] = useState<HTMLElement | null>(null);
  const needsSlots = layout === "workspace";
  const ready = !needsSlots || (start && end && shelf);

  useEffect(() => {
    if (!ready) return;
    try {
      continueRender(handle);
    } catch (error) {
      cancelRender(error);
    }
  }, [ready, handle]);

  const docked = layout === "workspace";
  const slots: HeaderSlots = { start, end, shelf };

  return (
    <MemoryRouter>
      <div className={docked ? "home home--docked" : "home"} data-start={layout === "start" || undefined} style={{ ["--glow-seconds" as string]: glowSeconds }}>
        <Sidebar
          projects={[
            { id: PROJECT_ID, name: PROJECT_NAME },
            { id: "other", name: "Weekend market stall" },
          ]}
          currentProjectId={PROJECT_ID}
          onSelectProject={noop}
          chats={CHATS}
          onNewChat={noop}
          onOpenChat={noop}
          onDeleteChat={noop}
          collapsed={collapsed}
          onToggleCollapsed={noop}
          mobileOpen={false}
          userName={USER_NAME}
        />

        <div className="home__screen glass glass--strong" data-immersive={board || undefined}>
          <ChatGlow />
          <div className="home__top">
            <header className="home__header">
              <div className="home__header-start">
                <div className="home__tools" ref={setStart} />
              </div>
              <div className="home__brand">
                <Wordmark link={false} />
              </div>
              <div className="home__header-end">
                <div className="home__tools" ref={setEnd} />
              </div>
            </header>
            <div className="home__shelf" ref={setShelf} />
          </div>

          <main className={docked ? (board ? "home__canvas home__canvas--board" : panes ? "home__canvas home__canvas--panes" : "home__canvas") : "home__canvas home__canvas--chat"}>
            {conversation && <div className="home__conversation">{conversation}</div>}
            {workspace && <div className={board ? "home__component home__component--board" : "home__component"}>{workspace(slots)}</div>}
          </main>

          {footer && <footer className="home__footer">{footer}</footer>}
        </div>

        {dock && <aside className="home__chat on-shell">{dock}</aside>}
      </div>
    </MemoryRouter>
  );
}
