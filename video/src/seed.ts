import { setDocumentStorage, type DocKind, type DocumentStorage } from "../../src/lib/storage.ts";
import type { InvoiceContent } from "../../src/lib/invoice.ts";
import type { ProjectMemory } from "../../src/lib/memorySave.ts";
import type { PaletteBlock } from "../../src/lib/palette.ts";
import type { LogoSave } from "../../src/lib/logoSave.ts";
import type { PaletteSave } from "../../src/lib/paletteSave.ts";
import { staticFile } from "remotion";

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

// The palette Kindred Gifting ends up with (soft pink, pastel yellow and cream, with a warm near-black for text), and the one the app starts a brand on. Ids stay the same from one
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
  palette(["#D6336C", "#F6E4A6", "#E8A0A8", "#F8F4EE", "#2E2226"]),
  palette(["#F4C3C3", "#F6E4A6", "#E8A0A8", "#F8F4EE", "#2E2226"]),
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

// The look chosen in the invoice part, which the invoice keeps from then on.
export const invoiceFinal = (): InvoiceContent => ({ ...invoiceBase(), details: { ...invoiceBase().details, template: "striped" }, client: CLIENT, lines: FINAL_LINES });

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
// The logo the founder made in another tool and brought back: a stock monogram, licensed separately and kept out of git
// (public/kindred-logo.png). It exists from the logo part on, so earlier parts still show it as outstanding. Each part
// says which side of that it is on before it draws (see `useLogoAdded`).
let logoAdded = false;
export const setLogoAdded = (added: boolean) => {
  logoAdded = added;
};

const LOGO_FILE = "kindred-logo.png";
let logoSave: Promise<LogoSave | null> | null = null;

// The file as the app keeps a logo: a PNG data address with its name and size.
const readLogo = (): Promise<LogoSave | null> =>
  (logoSave ??= fetch(staticFile(LOGO_FILE))
    .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`${LOGO_FILE} is missing`))))
    .then(
      (blob) =>
        new Promise<LogoSave>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ kind: "png", name: "kindred-gifting-logo.png", size: blob.size, dataUrl: String(reader.result), savedAt: SAVED_AT });
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => null));

export function installSeed(): void {
  const documents = new Map<string, unknown>();
  const key = (projectId: string, kind: DocKind) => `${projectId}:${kind}`;
  documents.set(key(PROJECT_ID, "palette"), savedPalette);
  documents.set(key(PROJECT_ID, "memory"), memory());

  const driver: DocumentStorage = {
    read: async (projectId, kind) => {
      if (kind === "logo" && projectId === PROJECT_ID) return logoAdded ? readLogo() : null;
      return documents.get(key(projectId, kind)) ?? null;
    },
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
