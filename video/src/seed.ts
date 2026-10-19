import { setDocumentStorage, type DocKind, type DocumentStorage } from "../../src/lib/storage.ts";
import type { InvoiceContent } from "../../src/lib/invoice.ts";
import type { ProjectMemory } from "../../src/lib/memorySave.ts";
import type { PaletteBlock } from "../../src/lib/palette.ts";
import type { PaletteSave } from "../../src/lib/paletteSave.ts";

// Made-up data for a made-up business. The video shows the app's real components, drawn from a project
// kept in memory (the app's own storage driver, swapped for one that reads this). Nothing here is a real
// person, business or account.
export const PROJECT_ID = "kindred-gifting";
export const PROJECT_NAME = "Kindred Gifting";
export const USER_NAME = "Megan";
export const INVOICE_ID = "inv-0042";

export const BUSINESS: InvoiceContent["business"] = {
  name: "Kindred Gifting",
  address: "14 Jacaranda Lane, Waterkloof, Pretoria, 0181",
  email: "hello@kindredgifting.example",
  phone: "082 555 0148",
  vatNumber: "4123456789",
  accountHolder: "Kindred Gifting (Pty) Ltd",
  bankName: "Example Bank",
  accountNumber: "62 0000 1234",
  branchCode: "250655",
};

export const CLIENT: InvoiceContent["client"] = {
  name: "Pretoria Print Works",
  contact: "Thandi Mokoena",
  address: "27 Church Street, Hatfield, Pretoria, 0083",
  email: "accounts@pretoriaprint.example",
  vatNumber: "4987654321",
  reference: "PO 7731",
};

// The palette Kindred Gifting ends up with (dark blues, in step with Droplet's own), and the one the app starts a brand on. Ids stay the same from one
// to the next, so a colour keeps its place on the strip as it changes.
const palette = (hexes: [string, string, string, string, string]): PaletteBlock[] => [
  { id: 1, hex: hexes[0], role: "primary" },
  { id: 2, hex: hexes[1], role: "accent" },
  { id: 3, hex: hexes[2] },
  { id: 4, hex: hexes[3], role: "background" },
  { id: 5, hex: hexes[4], role: "text" },
];

// What the brand screen shows, one after another. The last is the confirmed palette. The one before it has a
// primary colour that text cannot be read on, so the contrast circle for it fails until it is fixed.
export const BRAND_STEPS: PaletteBlock[][] = [
  palette(["#1F8FE0", "#0B4F8A", "#7CC0F5", "#CFE9FB", "#0E1A2B"]),
  palette(["#3E7D5A", "#E9B949", "#A8C3A0", "#F2F5EE", "#1E2A22"]),
  palette(["#7A4E9E", "#F0A04B", "#C9B3E0", "#F7F1F8", "#2A1B38"]),
  palette(["#3B9DFF", "#0B4F8A", "#21426B", "#0E1A2B", "#F4F8FB"]),
  palette(["#1C6DD0", "#0B4F8A", "#21426B", "#0E1A2B", "#F4F8FB"]),
];

export const FINAL_BLOCKS = BRAND_STEPS[BRAND_STEPS.length - 1];
export const FONT_PAIR_ID = "warm";
export const VOICE_WORDS = ["Warm", "Helpful", "Honest"];

const SAVED_AT = "2026-10-12T09:30:00.000Z";

export const savedPalette: PaletteSave = {
  blocks: FINAL_BLOCKS,
  fonts: FONT_PAIR_ID,
  voice: VOICE_WORDS,
  savedAt: SAVED_AT,
};

const isoDay = "2026-10-19";

export const invoiceBase = (): InvoiceContent => ({
  details: {
    kind: "invoice",
    number: "INV-0042",
    issueDate: isoDay,
    terms: "14",
    customDueDate: "",
    notes: "Thank you for ordering from Kindred Gifting.",
  },
  business: BUSINESS,
  client: { ...CLIENT, address: "" },
  lines: [{ id: 1, description: "Gift box, small", quantity: 12, unitCents: 45000 }],
  vatRegistered: true,
});

export const FINAL_LINES: InvoiceContent["lines"] = [
  { id: 1, description: "Gift box, small", quantity: 12, unitCents: 45000 },
  { id: 2, description: "Printed card insert", quantity: 12, unitCents: 3500 },
  { id: 3, description: "Delivery, Pretoria East", quantity: 1, unitCents: 25000 },
];

export const invoiceFinal = (): InvoiceContent => ({ ...invoiceBase(), client: CLIENT, lines: FINAL_LINES });

const memory = (): ProjectMemory => ({
  business: { details: BUSINESS, confirmedAt: SAVED_AT },
  facts: { "brand.fonts": { value: "Fraunces and DM Sans", confirmedAt: SAVED_AT, earlier: [] } },
  clients: [{ id: "client-pretoria-print-works", client: CLIENT, confirmedAt: SAVED_AT }],
  invoices: [
    {
      id: INVOICE_ID,
      content: invoiceFinal(),
      revision: 1,
      updatedAt: SAVED_AT,
    },
    {
      id: "inv-0041",
      content: {
        ...invoiceFinal(),
        details: { ...invoiceFinal().details, number: "INV-0041", issueDate: "2026-10-05" },
        client: { ...CLIENT, name: "Hatfield Florist", contact: "", address: "3 Burnett Street, Hatfield, Pretoria, 0083", email: "", vatNumber: "", reference: "" },
        lines: [{ id: 1, description: "Gift box, large", quantity: 6, unitCents: 62000 }],
      },
      revision: 1,
      updatedAt: "2026-10-05T10:00:00.000Z",
      exportedAt: "2026-10-05T10:05:00.000Z",
    },
  ],
});

// The app's storage driver, reading the made-up project above. Writes are kept for the life of the page only.
export function installSeed(): void {
  const documents = new Map<string, unknown>();
  const key = (projectId: string, kind: DocKind) => `${projectId}:${kind}`;
  documents.set(key(PROJECT_ID, "palette"), savedPalette);
  documents.set(key(PROJECT_ID, "memory"), memory());

  const driver: DocumentStorage = {
    read: async (projectId, kind) => documents.get(key(projectId, kind)) ?? null,
    write: async (projectId, kind, value) => {
      documents.set(key(projectId, kind), value);
      return true;
    },
    remove: async (projectId, kind) => {
      documents.delete(key(projectId, kind));
    },
  };
  setDocumentStorage(driver);
}
