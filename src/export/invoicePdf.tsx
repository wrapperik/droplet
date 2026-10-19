/* eslint-disable react/only-export-components -- this is not a hot-reloaded screen: it only builds the PDF on demand */
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { mixHex, readableTextColour } from '../lib/colour.ts'
import type { InvoiceContent } from '../lib/invoice.ts'
import { invoiceView, type InvoiceView, type LogoSlot, type Text as ViewText } from '../lib/invoiceView.ts'
import type { FontPair } from '../lib/brandType.ts'
import { PDF_FONTS } from './pdfFonts.ts'
import { templateOf, type InvoiceTemplate, type InvoiceTemplateId } from '../lib/invoiceTemplates.ts'
import type { ResolvedRoles } from '../lib/palette.ts'

// The invoice as a PDF on A4, in the founder's brand. It is made from the same view-model as the page on screen, so the two say
// exactly the same things; this file only lays them out. It is loaded only when someone presses Export, because the PDF library
// is large. The PDF library's built-in Helvetica is used for now, so it does not match the brand's typeface yet.

// The locale puts a narrow no-break space between digits, which Helvetica cannot draw. A plain no-break space it can.
const safe = (text: string) => text.replace(/ /g, ' ')
const words = (part: ViewText) => safe(part.text)

type Colours = { background: string; text: string; primary: string; onPrimary: string; soft: string; rule: string }

// A typeface as the styles that draw it. With no brand pair the library's built-in Helvetica is used.
type Style = { fontFamily: string; fontWeight?: 400 | 700 }
export type Face = { regular: Style; bold: Style }
export type Faces = { heading: Face; body: Face }

const HELVETICA: Face = { regular: { fontFamily: 'Helvetica' }, bold: { fontFamily: 'Helvetica-Bold' } }
const embedded = (family: string): Face => ({ regular: { fontFamily: family, fontWeight: 400 }, bold: { fontFamily: family, fontWeight: 700 } })

// The faces for a brand pair, or Helvetica for both when there is none or a family has no file to embed.
export function facesFor(pair?: FontPair): Faces {
  if (pair && PDF_FONTS[pair.heading] && PDF_FONTS[pair.body]) return { heading: embedded(pair.heading), body: embedded(pair.body) }
  return { heading: HELVETICA, body: HELVETICA }
}

const registered = new Set<string>()
function registerFonts(pair: FontPair) {
  for (const family of new Set([pair.heading, pair.body])) {
    if (registered.has(family)) continue
    const files = PDF_FONTS[family]
    Font.register({ family, fonts: [{ src: files.regular, fontWeight: 400 }, { src: files.bold, fontWeight: 700 }] })
    registered.add(family)
  }
}

// How each template is laid out and drawn. The page on screen (`InvoiceDocument.css`) draws the same looks.
const titleSize: Record<InvoiceTemplateId, number> = { band: 22, minimal: 34, classic: 15, striped: 28, rounded: 28, boxed: 40 }
const businessSize: Record<InvoiceTemplateId, number> = { band: 18, minimal: 13, classic: 18, striped: 14, rounded: 13, boxed: 14 }
const filledHead = (id: InvoiceTemplateId) => id === 'striped' || id === 'rounded'

const colourStyles = ({ background, text, primary, onPrimary, soft, rule }: Colours, id: InvoiceTemplateId, faces: Faces) => {
  const grid = id === 'boxed'
  const pill = id === 'rounded'
  const barTotal = id === 'band' || id === 'striped' || id === 'rounded'
  const cellBox = grid ? { padding: 5, paddingHorizontal: 7, borderWidth: 0.5, borderColor: rule } : {}
  const onBlock = id === 'band' || pill
  return StyleSheet.create({
    page: { backgroundColor: background, color: text, ...faces.body.regular, fontSize: 10, lineHeight: 1.4 },
    stripe: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 14, backgroundColor: primary },
    // The header: the title and the brand. The logo is drawn straight on the page, with no tile behind it.
    header: {
      flexDirection: id === 'band' || id === 'classic' ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: id === 'classic' ? 'center' : id === 'rounded' ? 'flex-start' : id === 'band' ? 'stretch' : 'center',
      ...(id === 'band' ? { gap: 22 } : {}),
      ...(id === 'classic' ? { paddingTop: 36, paddingHorizontal: 40, gap: 14 } : {}),
      ...(id === 'minimal' || id === 'boxed' ? { paddingTop: 40 } : {}),
      ...(id === 'striped' ? { paddingTop: 34 } : {}),
    },
    brand: {
      flexDirection: id === 'classic' || pill ? 'column' : 'row',
      alignItems: id === 'rounded' ? 'flex-end' : 'center',
      gap: pill ? 6 : 12,
      ...(id === 'classic' ? {} : { paddingHorizontal: 40 }),
      ...(pill ? { paddingTop: 34 } : {}),
    },
    logo: { objectFit: 'contain', height: 44, maxWidth: 130 },
    business: { ...faces.heading.bold, fontSize: businessSize[id], textAlign: pill ? 'right' : id === 'classic' ? 'center' : 'left' },
    kind: {
      ...(id === 'minimal' ? faces.heading.regular : faces.heading.bold),
      fontSize: titleSize[id],
      letterSpacing: id === 'band' ? 2 : id === 'classic' ? 5 : id === 'striped' ? 3 : pill ? 2 : 0,
      textTransform: id === 'minimal' || id === 'boxed' ? 'none' : 'uppercase',
      ...(onBlock ? { backgroundColor: primary, color: onPrimary } : {}),
      ...(id === 'band' ? { paddingVertical: 20, paddingHorizontal: 40 } : {}),
      ...(pill ? { width: '60%', paddingTop: 34, paddingBottom: 40, paddingHorizontal: 40, borderBottomRightRadius: 90 } : {}),
      ...(id === 'classic' ? { width: '100%', textAlign: 'center', paddingVertical: 8, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: text } : {}),
      ...(id === 'minimal' || id === 'boxed' || id === 'striped' ? { paddingRight: 40 } : {}),
    },
    body: { flexGrow: 1, paddingVertical: 30, paddingHorizontal: 40, gap: 22 },
    meta: { flexDirection: 'row', gap: 28 },
    label: { ...faces.body.bold, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
    partyLabel: { ...faces.body.bold, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', ...(grid ? { backgroundColor: soft, paddingVertical: 4, paddingHorizontal: 7, borderBottomWidth: 0.5, borderBottomColor: rule } : {}) },
    strong: { ...faces.body.bold },
    parties: { flexDirection: 'row', gap: 28 },
    party: { flexGrow: 1, flexBasis: 0, gap: 1 },
    head: {
      flexDirection: 'row',
      ...(id === 'band' || id === 'minimal' ? { paddingBottom: 5, borderBottomWidth: 0.75, borderBottomColor: id === 'minimal' ? rule : text } : {}),
      ...(id === 'classic' ? { borderTopWidth: 1.5, borderTopColor: text, borderBottomWidth: 0.5, borderBottomColor: text, paddingTop: 7, paddingBottom: 5 } : {}),
      ...(filledHead(id) ? { backgroundColor: primary, paddingVertical: 7, paddingHorizontal: 8, ...(pill ? { borderRadius: 14 } : {}) } : {}),
      ...(grid ? { backgroundColor: soft } : {}),
    },
    headLabel: { ...faces.body.bold, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', color: filledHead(id) ? onPrimary : text, ...(grid ? { padding: 5, paddingHorizontal: 7, borderWidth: 0.5, borderColor: rule } : {}) },
    row: {
      flexDirection: 'row',
      paddingVertical: grid ? 0 : 6,
      ...(filledHead(id) ? { paddingHorizontal: 8 } : {}),
      ...(id === 'band' || id === 'minimal' ? { borderBottomWidth: 0.5, borderBottomColor: id === 'minimal' ? rule : text } : {}),
    },
    rowSoft: { backgroundColor: soft, ...(pill ? { borderRadius: 14 } : {}) },
    rowLast: id === 'classic' ? { borderBottomWidth: 1.5, borderBottomColor: text } : {},
    cellDescription: { flexGrow: 1, flexBasis: 0, paddingRight: 8, ...cellBox },
    cellQuantity: { width: 46, textAlign: 'right', ...cellBox },
    cellPrice: { width: 84, textAlign: 'right', ...cellBox },
    cellAmount: { width: 92, textAlign: 'right', ...cellBox },
    totals: { alignSelf: 'flex-end', width: 230, gap: 4 },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    total: {
      alignSelf: 'flex-end',
      width: 230,
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: barTotal ? primary : grid ? soft : background,
      color: barTotal ? onPrimary : text,
      paddingVertical: barTotal ? 9 : 8,
      paddingHorizontal: barTotal ? 12 : grid ? 7 : 0,
      borderRadius: id === 'band' ? 5 : pill ? 16 : 0,
      ...(id === 'minimal' ? faces.heading.regular : faces.heading.bold),
      fontSize: id === 'minimal' ? 15 : 12,
      ...(id === 'minimal' ? { borderTopWidth: 0.5, borderTopColor: rule } : {}),
      ...(id === 'classic' ? { borderTopWidth: 1.5, borderTopColor: text } : {}),
      ...(grid ? { borderWidth: 0.5, borderColor: rule } : {}),
    },
    payment: { gap: 1, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: text },
    foot: { flexDirection: 'row', gap: 28, alignItems: 'flex-start', backgroundColor: primary, color: onPrimary, paddingTop: 20, paddingBottom: 26, paddingHorizontal: 40 },
    footPart: { flexGrow: 1, flexBasis: 0, gap: 1 },
  })
}

function InvoiceDocument({ view, colours, template, faces }: { view: InvoiceView; colours: Colours; template: InvoiceTemplate; faces: Faces }) {
  const styles = colourStyles(colours, template.id, faces)
  const id = template.id
  const payment = view.payment
    ? view.payment.map((part, index) => (
        <Text key={index} style={index === 0 ? styles.strong : undefined}>
          {safe(part)}
        </Text>
      ))
    : null
  const tail = (
    <>
      {payment ? (
        template.footerBand ? (
          <View style={styles.footPart} wrap={false}>
            {payment}
          </View>
        ) : (
          <View style={styles.payment} wrap={false}>
            {payment}
          </View>
        )
      ) : null}
      {view.notes ? <Text style={template.footerBand ? styles.footPart : undefined}>{safe(view.notes)}</Text> : null}
    </>
  )
  // The logo, if the founder brought one. With none, the business name alone is the brand: the page's placeholder and its note are not printed.
  const brand = (
    <View style={styles.brand}>
      {view.logo?.kind === 'added' ? <Image src={view.logo.src} style={styles.logo} /> : null}
      <Text style={styles.business}>{words(view.from[0])}</Text>
    </View>
  )
  const kind = <Text style={styles.kind}>{view.title}</Text>
  return (
    <Document title={`${view.title} ${view.number.text}`} author={view.from[0].text}>
      <Page size="A4" style={styles.page}>
        {id === 'striped' ? <View style={styles.stripe} fixed /> : null}
        <View style={[styles.header, id === 'striped' ? { paddingLeft: 14 } : {}]}>
          {id === 'band' || id === 'rounded' ? (
            <>
              {kind}
              {brand}
            </>
          ) : (
            <>
              {brand}
              {kind}
            </>
          )}
        </View>

        <View style={[styles.body, id === 'striped' ? { paddingLeft: 54 } : {}]}>
          <View style={styles.meta}>
            <View>
              <Text style={styles.label}>Number</Text>
              <Text style={styles.strong}>{words(view.number)}</Text>
            </View>
            <View>
              <Text style={styles.label}>Date</Text>
              <Text style={styles.strong}>{words(view.issued)}</Text>
            </View>
            <View>
              <Text style={styles.label}>{view.dueLabel}</Text>
              <Text style={styles.strong}>{words(view.due)}</Text>
            </View>
            {view.reference ? (
              <View>
                <Text style={styles.label}>Reference</Text>
                <Text style={styles.strong}>{safe(view.reference)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.parties}>
            <View style={styles.party}>
              <Text style={styles.partyLabel}>From</Text>
              {view.from.slice(1).map((part, index) => (
                <Text key={index}>{words(part)}</Text>
              ))}
            </View>
            <View style={styles.party}>
              <Text style={styles.partyLabel}>Billed to</Text>
              {view.to.map((part, index) => (
                <Text key={index} style={index === 0 ? styles.strong : undefined}>
                  {words(part)}
                </Text>
              ))}
            </View>
          </View>

          <View>
            <View style={styles.head}>
              <Text style={[styles.headLabel, styles.cellDescription]}>Description</Text>
              <Text style={[styles.headLabel, styles.cellQuantity]}>Qty</Text>
              <Text style={[styles.headLabel, styles.cellPrice]}>Price</Text>
              <Text style={[styles.headLabel, styles.cellAmount]}>Amount</Text>
            </View>
            {view.lines.map((line, index) => (
              <View key={index} style={[styles.row, filledHead(id) && index % 2 === 1 ? styles.rowSoft : {}, index === view.lines.length - 1 ? styles.rowLast : {}]} wrap={false}>
                <Text style={styles.cellDescription}>{words(line.description)}</Text>
                <Text style={styles.cellQuantity}>{line.quantity}</Text>
                <Text style={styles.cellPrice}>{words(line.unit)}</Text>
                <Text style={styles.cellAmount}>{words(line.amount)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totals}>
            <View style={styles.totalsRow}>
              <Text style={styles.strong}>Subtotal</Text>
              <Text>{safe(view.subtotal)}</Text>
            </View>
            {view.vat ? (
              <View style={styles.totalsRow}>
                <Text style={styles.strong}>{view.vat.label}</Text>
                <Text>{safe(view.vat.amount)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.total}>
            <Text>{view.totalLabel}</Text>
            <Text>{safe(view.total)}</Text>
          </View>

          {!template.footerBand && tail}
        </View>
        {template.footerBand && (payment || view.notes) ? <View style={[styles.foot, id === 'striped' ? { paddingLeft: 54 } : {}]}>{tail}</View> : null}
      </Page>
    </Document>
  )
}

// The PDF itself, in the founder's brand. `logoPng` is the logo as a PNG data address (see `pngForPdf`: an SVG is turned into one first, since this
// library draws no SVG), or nothing.
export function buildInvoicePdf(content: InvoiceContent, roles: ResolvedRoles, logoPng?: string | null, fonts?: FontPair): Promise<Blob> {
  const colours: Colours = {
    background: roles.background.hex,
    text: roles.text.hex,
    primary: roles.primary.hex,
    onPrimary: readableTextColour(roles.primary.hex),
    soft: mixHex(roles.background.hex, roles.primary.hex, 0.12),
    rule: mixHex(roles.background.hex, roles.text.hex, 0.35),
  }
  const logo: LogoSlot | null = logoPng ? { kind: 'added', src: logoPng, alt: 'Logo' } : null
  const faces = facesFor(fonts)
  if (fonts && faces.body !== HELVETICA) registerFonts(fonts)
  return pdf(<InvoiceDocument view={invoiceView(content, logo)} colours={colours} template={templateOf(content.details)} faces={faces} />).toBlob()
}

// Builds the PDF and hands it to the browser as a download. Returns false if anything went wrong.
export async function downloadInvoice(content: InvoiceContent, roles: ResolvedRoles, fileName: string, logoPng?: string | null, fonts?: FontPair): Promise<boolean> {
  try {
    // The brand's typefaces are fetched as the PDF is made. If they cannot be, the invoice is made in Helvetica, rather than not at all.
    const blob = await buildInvoicePdf(content, roles, logoPng, fonts).catch(() => buildInvoicePdf(content, roles, logoPng))
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch {
    return false
  }
}
