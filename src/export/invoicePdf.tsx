/* eslint-disable react/only-export-components -- this is not a hot-reloaded screen: it only builds the PDF on demand */
import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { mixHex, readableTextColour } from '../lib/colour.ts'
import type { InvoiceContent } from '../lib/invoice.ts'
import { invoiceView, type InvoiceView, type LogoSlot, type Text as ViewText } from '../lib/invoiceView.ts'
import { templateOf, type InvoiceTemplate, type InvoiceTemplateId } from '../lib/invoiceTemplates.ts'
import type { ResolvedRoles } from '../lib/palette.ts'

// The invoice as a PDF on A4, in the founder's brand. It is made from the same view-model as the page on screen, so the two say
// exactly the same things; this file only lays them out. It is loaded only when someone presses Export, because the PDF library
// is large. The PDF library's built-in Helvetica is used for now, so it does not match the brand's typeface yet.

// The locale puts a narrow no-break space between digits, which Helvetica cannot draw. A plain no-break space it can.
const safe = (text: string) => text.replace(/ /g, ' ')
const words = (part: ViewText) => safe(part.text)

type Colours = { background: string; text: string; primary: string; onPrimary: string; soft: string; rule: string }

// How each template differs from the Band layout, as the style it changes. The page on screen (`InvoiceDocument.css`) draws the same looks.
const titleSize: Record<InvoiceTemplateId, number> = { band: 10, minimal: 34, classic: 26, striped: 28, rounded: 28, boxed: 40 }
const plainTop = (id: InvoiceTemplateId) => id === 'minimal' || id === 'classic' || id === 'striped' || id === 'boxed'
const filledHead = (id: InvoiceTemplateId) => id === 'striped' || id === 'rounded'

const colourStyles = ({ background, text, primary, onPrimary, soft, rule }: Colours, id: InvoiceTemplateId) => {
  const plain = plainTop(id)
  const heading = plain ? text : onPrimary
  const pill = id === 'rounded'
  const grid = id === 'boxed'
  const cellBox = grid ? { padding: 5, paddingHorizontal: 7, borderWidth: 0.5, borderColor: rule } : {}
  const barTotal = id === 'band' || id === 'striped' || id === 'rounded'
  return StyleSheet.create({
    page: { backgroundColor: background, color: text, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.4 },
    band: {
      backgroundColor: plain ? background : primary,
      color: heading,
      paddingVertical: plain ? 0 : 26,
      paddingHorizontal: 40,
      paddingTop: id === 'minimal' || id === 'classic' || id === 'boxed' ? 40 : id === 'striped' ? 34 : plain ? 0 : 26,
      flexDirection: id === 'classic' ? 'row-reverse' : id === 'rounded' ? 'column-reverse' : 'row',
      justifyContent: 'space-between',
      alignItems: id === 'rounded' ? 'flex-start' : plain ? 'center' : 'flex-end',
      ...(id === 'rounded' ? { width: '78%', paddingTop: 30, paddingBottom: 36, borderBottomRightRadius: 90, gap: 10 } : {}),
    },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    // A tile in the page's own background, so a logo of any colour reads on the band. The PDF draws the same tile.
    logoTile: { backgroundColor: background, borderRadius: 5, padding: 5, width: pill ? 54 : 66, height: pill ? 38 : 46, justifyContent: 'center', alignItems: 'center' },
    logo: { objectFit: 'contain', maxWidth: 56, maxHeight: 36 },
    business: { color: heading, fontFamily: 'Helvetica-Bold', fontSize: id === 'band' ? 20 : id === 'minimal' ? 13 : pill ? 13 : 14 },
    kind: {
      color: heading,
      fontFamily: id === 'minimal' ? 'Helvetica' : 'Helvetica-Bold',
      fontSize: titleSize[id],
      letterSpacing: id === 'band' ? 1.2 : id === 'classic' || pill ? 2 : id === 'striped' ? 3 : 0,
      textTransform: id === 'minimal' || id === 'boxed' ? 'none' : 'uppercase',
    },
    body: { flexGrow: 1, paddingVertical: 30, paddingHorizontal: 40, gap: 22 },
    meta: { flexDirection: 'row', gap: 28 },
    label: { fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
    partyLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', ...(grid ? { backgroundColor: soft, paddingVertical: 4, paddingHorizontal: 7, borderBottomWidth: 0.5, borderBottomColor: rule } : {}) },
    strong: { fontFamily: 'Helvetica-Bold' },
    parties: { flexDirection: 'row', gap: 28 },
    party: { flexGrow: 1, flexBasis: 0, gap: 1 },
    head: {
      flexDirection: 'row',
      paddingBottom: filledHead(id) || grid ? 0 : 5,
      borderBottomWidth: filledHead(id) || grid ? 0 : id === 'classic' ? 0.5 : 0.75,
      borderBottomColor: id === 'minimal' ? rule : text,
      ...(id === 'classic' ? { borderTopWidth: 1.5, borderTopColor: text, paddingTop: 7, paddingBottom: 5 } : {}),
      ...(filledHead(id) ? { backgroundColor: primary, color: onPrimary, paddingVertical: 7, paddingHorizontal: 8, ...(pill ? { borderRadius: 14 } : {}) } : {}),
      ...(grid ? { backgroundColor: soft } : {}),
    },
    headLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', color: filledHead(id) ? onPrimary : text, ...(grid ? { padding: 5, paddingHorizontal: 7, borderWidth: 0.5, borderColor: rule } : {}) },
    row: { flexDirection: 'row', paddingVertical: grid ? 0 : 6, ...(filledHead(id) ? { paddingHorizontal: 8 } : {}), borderBottomWidth: id === 'classic' || filledHead(id) || grid ? 0 : 0.5, borderBottomColor: id === 'minimal' ? rule : text },
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
      fontFamily: 'Helvetica-Bold',
      fontSize: id === 'minimal' ? 14 : 12,
      ...(id === 'minimal' ? { borderTopWidth: 0.5, borderTopColor: rule } : {}),
      ...(id === 'classic' ? { borderTopWidth: 1.5, borderTopColor: text } : {}),
      ...(grid ? { borderWidth: 0.5, borderColor: rule } : {}),
    },
    payment: { gap: 1, flexGrow: 1, flexBasis: 0, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: text },
    foot: { flexDirection: 'row', gap: 28, alignItems: 'flex-start', backgroundColor: primary, color: onPrimary, paddingTop: 20, paddingBottom: 26, paddingHorizontal: 40 },
    footPart: { flexGrow: 1, flexBasis: 0, gap: 1 },
  })
}

function InvoiceDocument({ view, colours, template }: { view: InvoiceView; colours: Colours; template: InvoiceTemplate }) {
  const styles = colourStyles(colours, template.id)
  const grid = template.id === 'boxed'
  const soft = filledHead(template.id)
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
  return (
    <Document title={`${view.title} ${view.number.text}`} author={view.from[0].text}>
      <Page size="A4" style={styles.page}>
        <View style={styles.band}>
          <View style={styles.brand}>
            {/* The logo, if the founder brought one. With none, the business name alone is the brand: the page's placeholder and its note are not printed. */}
            {view.logo?.kind === 'added' ? (
              <View style={styles.logoTile}>
                <Image src={view.logo.src} style={styles.logo} />
              </View>
            ) : null}
            <Text style={styles.business}>{words(view.from[0])}</Text>
          </View>
          <Text style={styles.kind}>{view.title}</Text>
        </View>

        <View style={styles.body}>
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
            {view.lines.map((line, index) => {
              const striped = (soft || grid) && index % 2 === (grid ? 0 : 1)
              const last = index === view.lines.length - 1
              return (
                <View key={index} style={[styles.row, striped && !grid ? styles.rowSoft : {}, last ? styles.rowLast : {}]} wrap={false}>
                  <Text style={styles.cellDescription}>{words(line.description)}</Text>
                  <Text style={styles.cellQuantity}>{line.quantity}</Text>
                  <Text style={styles.cellPrice}>{words(line.unit)}</Text>
                  <Text style={styles.cellAmount}>{words(line.amount)}</Text>
                </View>
              )
            })}
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
        {template.footerBand && (payment || view.notes) ? <View style={styles.foot}>{tail}</View> : null}
      </Page>
    </Document>
  )
}

// The PDF itself, in the founder's brand. `logoPng` is the logo as a PNG data address (see `pngForPdf`: an SVG is turned into one first, since this
// library draws no SVG), or nothing.
export function buildInvoicePdf(content: InvoiceContent, roles: ResolvedRoles, logoPng?: string | null): Promise<Blob> {
  const colours: Colours = {
    background: roles.background.hex,
    text: roles.text.hex,
    primary: roles.primary.hex,
    onPrimary: readableTextColour(roles.primary.hex),
    soft: mixHex(roles.background.hex, roles.primary.hex, 0.12),
    rule: mixHex(roles.background.hex, roles.text.hex, 0.35),
  }
  const logo: LogoSlot | null = logoPng ? { kind: 'added', src: logoPng, alt: 'Logo' } : null
  return pdf(<InvoiceDocument view={invoiceView(content, logo)} colours={colours} template={templateOf(content.details)} />).toBlob()
}

// Builds the PDF and hands it to the browser as a download. Returns false if anything went wrong.
export async function downloadInvoice(content: InvoiceContent, roles: ResolvedRoles, fileName: string, logoPng?: string | null): Promise<boolean> {
  try {
    const blob = await buildInvoicePdf(content, roles, logoPng)
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
