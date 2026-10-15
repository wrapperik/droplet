/* eslint-disable react/only-export-components -- this is not a hot-reloaded screen: it only builds the PDF on demand */
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { readableTextColour } from '../lib/colour.ts'
import { brandSheetFilename, type BrandSheetData } from '../lib/paletteExport.ts'

// The one-page brand sheet. It is loaded only when someone presses Download, because the PDF library is large.
// The sheet is laid out on A4 in the PDF library's built-in Helvetica, so it does not match the app's typeface yet.
const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#0E1A2B' },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold' },
  date: { marginTop: 4, color: '#4A5A70' },
  heading: { marginTop: 24, marginBottom: 8, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 4, color: '#4A5A70' },
  row: { flexDirection: 'row', gap: 8 },
  roleTile: { flexGrow: 1, flexBasis: 0, height: 70, padding: 8, justifyContent: 'space-between', borderRadius: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colourTile: { width: 123, height: 82, padding: 8, justifyContent: 'space-between', borderRadius: 6 },
  bold: { fontFamily: 'Helvetica-Bold' },
  small: { fontSize: 8 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sample: { width: 90, height: 36, borderRadius: 6, alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica-Bold', fontSize: 16 },
  footer: { position: 'absolute', left: 40, right: 40, bottom: 28, color: '#4A5A70', fontSize: 8 },
})

function BrandSheet({ data }: { data: BrandSheetData }) {
  return (
    <Document title={data.title} author="Droplet">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.date}>{data.date}</Text>

        <Text style={styles.heading}>Roles</Text>
        <View style={styles.row}>
          {data.roles.map((role) => {
            const ink = readableTextColour(role.hex)
            return (
              <View key={role.label} style={[styles.roleTile, { backgroundColor: role.hex, color: ink, borderWidth: 0.5, borderColor: '#CBD5E1' }]}>
                <Text style={[styles.bold, { color: ink }]}>{role.label}</Text>
                <View>
                  <Text style={{ color: ink }}>{role.hex}</Text>
                  <Text style={[styles.small, { color: ink }]}>{role.chosen ? 'Chosen' : 'Suggested'}</Text>
                </View>
              </View>
            )
          })}
        </View>

        <Text style={styles.heading}>All colours</Text>
        <View style={styles.grid}>
          {data.colours.map((colour) => {
            const ink = readableTextColour(colour.hex)
            return (
              <View key={colour.name} style={[styles.colourTile, { backgroundColor: colour.hex, borderWidth: 0.5, borderColor: '#CBD5E1' }]}>
                <View>
                  <Text style={[styles.bold, { color: ink }]}>{colour.name}</Text>
                  {colour.role ? <Text style={[styles.small, { color: ink }]}>{colour.role}</Text> : null}
                </View>
                <View>
                  <Text style={[styles.bold, { color: ink }]}>{colour.hex}</Text>
                  <Text style={[styles.small, { color: ink }]}>RGB {colour.rgb}</Text>
                </View>
              </View>
            )
          })}
        </View>

        <Text style={styles.heading}>Text on background</Text>
        <View style={styles.pair}>
          <View style={[styles.sample, { backgroundColor: data.keyPair.backgroundHex, color: data.keyPair.textHex, borderWidth: 0.5, borderColor: '#CBD5E1' }]}>
            <Text style={{ color: data.keyPair.textHex }}>Aa</Text>
          </View>
          <View>
            <Text style={styles.bold}>
              {data.keyPair.ratio}  {data.keyPair.verdict}
            </Text>
            <Text style={styles.note}>{data.summary}</Text>
          </View>
        </View>

        {data.typography && (
          <>
            <Text style={styles.heading}>Typography</Text>
            <Text style={styles.bold}>Headings: {data.typography.heading}</Text>
            <Text style={styles.bold}>Text: {data.typography.body}</Text>
            <Text style={styles.note}>{data.typography.note} Both are free on Google Fonts.</Text>
          </>
        )}
        {data.voice && (
          <>
            <Text style={styles.heading}>Voice</Text>
            <Text style={styles.bold}>{data.voice}</Text>
          </>
        )}

        <Text style={styles.footer}>Made with Droplet. Contrast is computed from the WCAG 2.x formula.</Text>
      </Page>
    </Document>
  )
}

// Builds the PDF and hands it to the browser as a download. Returns false if anything went wrong.
export async function downloadBrandSheet(data: BrandSheetData, projectName: string): Promise<boolean> {
  try {
    const blob = await pdf(<BrandSheet data={data} />).toBlob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = brandSheetFilename(projectName)
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch {
    return false
  }
}
