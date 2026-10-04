/* eslint-disable react/only-export-components -- this is not a hot-reloaded screen: it only builds the PDF on demand */
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { readableTextColour } from '../lib/colour.ts'
import type { InvoiceContent } from '../lib/invoice.ts'
import { invoiceView, type InvoiceView, type Text as ViewText } from '../lib/invoiceView.ts'
import type { ResolvedRoles } from '../lib/palette.ts'

// The invoice as a PDF on A4, in the founder's brand. It is made from the same view-model as the page on screen, so the two say
// exactly the same things; this file only lays them out. It is loaded only when someone presses Export, because the PDF library
// is large. The PDF library's built-in Helvetica is used for now, so it does not match the brand's typeface yet.

// The locale puts a narrow no-break space between digits, which Helvetica cannot draw. A plain no-break space it can.
const safe = (text: string) => text.replace(/ /g, ' ')
const words = (part: ViewText) => safe(part.text)

type Colours = { background: string; text: string; primary: string; onPrimary: string }

const colourStyles = ({ background, text, primary, onPrimary }: Colours) =>
  StyleSheet.create({
    page: { backgroundColor: background, color: text, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.4 },
    band: { backgroundColor: primary, color: onPrimary, paddingVertical: 26, paddingHorizontal: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    business: { color: onPrimary, fontFamily: 'Helvetica-Bold', fontSize: 20 },
    kind: { color: onPrimary, fontFamily: 'Helvetica-Bold', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
    body: { paddingVertical: 30, paddingHorizontal: 40, gap: 22 },
    meta: { flexDirection: 'row', gap: 28 },
    label: { fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 1, textTransform: 'uppercase' },
    strong: { fontFamily: 'Helvetica-Bold' },
    parties: { flexDirection: 'row', gap: 28 },
    party: { flexGrow: 1, flexBasis: 0, gap: 1 },
    head: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: text, paddingBottom: 5 },
    row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: text, paddingVertical: 6 },
    cellDescription: { flexGrow: 1, flexBasis: 0, paddingRight: 8 },
    cellQuantity: { width: 46, textAlign: 'right' },
    cellPrice: { width: 84, textAlign: 'right' },
    cellAmount: { width: 92, textAlign: 'right' },
    totals: { alignSelf: 'flex-end', width: 230, gap: 4 },
    totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    total: { alignSelf: 'flex-end', width: 230, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: primary, color: onPrimary, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 5, fontFamily: 'Helvetica-Bold', fontSize: 12 },
    payment: { paddingTop: 14, borderTopWidth: 0.5, borderTopColor: text, gap: 1 },
  })

function InvoiceDocument({ view, colours }: { view: InvoiceView; colours: Colours }) {
  const styles = colourStyles(colours)
  return (
    <Document title={`${view.title} ${view.number.text}`} author={view.from[0].text}>
      <Page size="A4" style={styles.page}>
        <View style={styles.band}>
          <Text style={styles.business}>{words(view.from[0])}</Text>
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
              <Text style={styles.label}>From</Text>
              {view.from.slice(1).map((part, index) => (
                <Text key={index}>{words(part)}</Text>
              ))}
            </View>
            <View style={styles.party}>
              <Text style={styles.label}>Billed to</Text>
              {view.to.map((part, index) => (
                <Text key={index} style={index === 0 ? styles.strong : undefined}>
                  {words(part)}
                </Text>
              ))}
            </View>
          </View>

          <View>
            <View style={styles.head}>
              <Text style={[styles.label, styles.cellDescription]}>Description</Text>
              <Text style={[styles.label, styles.cellQuantity]}>Qty</Text>
              <Text style={[styles.label, styles.cellPrice]}>Price</Text>
              <Text style={[styles.label, styles.cellAmount]}>Amount</Text>
            </View>
            {view.lines.map((line, index) => (
              <View key={index} style={styles.row} wrap={false}>
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

          {view.payment ? (
            <View style={styles.payment} wrap={false}>
              {view.payment.map((part, index) => (
                <Text key={index} style={index === 0 ? styles.strong : undefined}>
                  {safe(part)}
                </Text>
              ))}
            </View>
          ) : null}
          {view.notes ? <Text>{safe(view.notes)}</Text> : null}
        </View>
      </Page>
    </Document>
  )
}

// The PDF itself, in the founder's brand.
export function buildInvoicePdf(content: InvoiceContent, roles: ResolvedRoles): Promise<Blob> {
  const colours: Colours = {
    background: roles.background.hex,
    text: roles.text.hex,
    primary: roles.primary.hex,
    onPrimary: readableTextColour(roles.primary.hex),
  }
  return pdf(<InvoiceDocument view={invoiceView(content)} colours={colours} />).toBlob()
}

// Builds the PDF and hands it to the browser as a download. Returns false if anything went wrong.
export async function downloadInvoice(content: InvoiceContent, roles: ResolvedRoles, fileName: string): Promise<boolean> {
  try {
    const blob = await buildInvoicePdf(content, roles)
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
