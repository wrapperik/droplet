/* eslint-disable react/only-export-components -- this is not a hot-reloaded screen: it only builds the PDF on demand */
import { Document, Ellipse, Page, Polygon, Polyline, Rect, StyleSheet, Svg, Text, View, pdf } from '@react-pdf/renderer'
import { INK, SLATE, drawBoard, type Drawing, type Mark } from '../lib/boardDrawing.ts'
import { pdfSafe, type SummarySheet } from '../lib/boardExport.ts'
import type { BoardItem } from '../lib/boardTypes.ts'

// The board as a PDF: the board on one landscape A4 page, as drawn marks scaled to fit, and the summary on a portrait page after it. Both come
// from the same marks the PNG is painted from. It is loaded only when someone asks for the file, because the PDF library is large. The library's
// built-in Helvetica is used for now, so it does not match the app's typeface yet.

const PAGE = { w: 842, h: 595 }
const EDGE = 36
const HEADER = 40

const styles = StyleSheet.create({
  board: { padding: EDGE, fontFamily: 'Helvetica', color: INK },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  date: { marginTop: 3, fontSize: 9, color: SLATE },
  summary: { padding: 48, fontFamily: 'Helvetica', fontSize: 11, color: INK, lineHeight: 1.4 },
  heading: { marginTop: 22, marginBottom: 6, fontSize: 12, fontFamily: 'Helvetica-Bold' },
  point: { flexDirection: 'row', gap: 6, marginBottom: 3 },
  bullet: { width: 8 },
  note: { marginTop: 4, fontSize: 9, color: SLATE },
  pair: { marginBottom: 6 },
  small: { fontSize: 9, color: SLATE },
  footer: { position: 'absolute', left: 36, right: 36, bottom: 20, fontSize: 8, color: SLATE },
})

// How much the board is shrunk to fit the page. Never made larger than it is.
export const fitScale = (drawing: Pick<Drawing, 'width' | 'height'>) => Math.min((PAGE.w - EDGE * 2) / drawing.width, (PAGE.h - EDGE * 2 - HEADER) / drawing.height, 1)

function MarkView({ mark, drawing, scale }: { mark: Mark; drawing: Drawing; scale: number }) {
  const width = drawing.width * scale
  const height = drawing.height * scale
  const box = { position: 'absolute' as const, left: 0, top: 0 }
  const paint = (fill: string | null, stroke: string | null, strokeWidth: number) => ({ fill: fill ?? 'none', stroke: stroke ?? 'none', strokeWidth })
  if (mark.kind === 'text') {
    return (
      <View style={{ position: 'absolute', left: mark.x * scale, top: mark.y * scale, width: mark.w * scale, height: mark.h * scale, overflow: 'hidden', justifyContent: mark.middle ? 'center' : 'flex-start' }}>
        <Text style={{ fontFamily: mark.bold ? 'Helvetica-Bold' : 'Helvetica', fontSize: mark.size * scale, lineHeight: mark.lineHeight, color: mark.colour, textAlign: mark.align === 'centre' ? 'center' : 'left' }}>{pdfSafe(mark.text)}</Text>
      </View>
    )
  }
  return (
    <Svg style={box} width={width} height={height} viewBox={`0 0 ${drawing.width} ${drawing.height}`}>
      {mark.kind === 'rect' && <Rect x={mark.x} y={mark.y} width={mark.w} height={mark.h} rx={mark.radius} ry={mark.radius} {...paint(mark.fill, mark.stroke, mark.strokeWidth)} />}
      {mark.kind === 'ellipse' && <Ellipse cx={mark.x + mark.w / 2} cy={mark.y + mark.h / 2} rx={mark.w / 2} ry={mark.h / 2} {...paint(mark.fill, mark.stroke, mark.strokeWidth)} />}
      {mark.kind === 'polygon' && <Polygon points={mark.points.map((point) => `${point.x},${point.y}`).join(' ')} {...paint(mark.fill, mark.stroke, mark.strokeWidth)} />}
      {mark.kind === 'line' && <Polyline points={mark.points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={mark.stroke} strokeWidth={mark.strokeWidth} strokeLinejoin="round" strokeLinecap="round" />}
    </Svg>
  )
}

function SummaryPage({ sheet, name }: { sheet: SummarySheet; name: string }) {
  return (
    <Page size="A4" style={styles.summary}>
      <Text style={styles.title}>{pdfSafe(name)}: summary</Text>
      {sheet.by !== '' && <Text style={styles.date}>{sheet.by}</Text>}
      {sheet.sections.map((section) => (
        <View key={section.label} wrap={false}>
          <Text style={styles.heading}>{section.label}</Text>
          {section.lines.map((line, index) => (
            <View key={index} style={styles.point}>
              <Text style={styles.bullet}>•</Text>
              <Text style={{ flex: 1 }}>{pdfSafe(line)}</Text>
            </View>
          ))}
        </View>
      ))}
      {sheet.remembered.length > 0 && (
        <View wrap={false}>
          <Text style={styles.heading}>Remembered for this project</Text>
          {sheet.remembered.map((row) => (
            <View key={row.label} style={styles.pair}>
              <Text style={styles.small}>{row.label}</Text>
              <Text>{pdfSafe(row.value)}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.footer} fixed>
        Made with Droplet.
      </Text>
    </Page>
  )
}

function BoardPdf({ drawing, sheet, name, date }: { drawing: Drawing | null; sheet: SummarySheet | null; name: string; date: string }) {
  const scale = drawing ? fitScale(drawing) : 1
  return (
    <Document title={`${pdfSafe(name)} board`} author="Droplet">
      {drawing && (
        <Page size={[PAGE.w, PAGE.h]} style={styles.board}>
          <View style={{ height: HEADER }}>
            <Text style={styles.title}>{pdfSafe(name)}: the board</Text>
            <Text style={styles.date}>{date}</Text>
          </View>
          <View style={{ width: drawing.width * scale, height: drawing.height * scale, position: 'relative' }}>
            {drawing.marks.map((mark, index) => (
              <MarkView key={index} mark={mark} drawing={drawing} scale={scale} />
            ))}
          </View>
        </Page>
      )}
      {sheet && <SummaryPage sheet={sheet} name={name} />}
    </Document>
  )
}

// The PDF itself. A board with nothing on it has no board page, and a summary with nothing in it has no summary page.
export function buildBoardPdf(items: BoardItem[], sheet: SummarySheet | null, projectName: string, now: Date): Promise<Blob> {
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(now)
  return pdf(<BoardPdf drawing={drawBoard(items)} sheet={sheet} name={projectName} date={date} />).toBlob()
}
