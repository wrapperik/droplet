import {
  computeTotals,
  dueDateOf,
  isIsoDate,
  lineIsBlank,
  lineProblems,
  type InvoiceContent,
  type LineProblem,
} from './invoice.ts'
import { formatRand } from './money.ts'

// What an invoice still needs before it can be sent, worked out in code from what is on it. A required item blocks the export and is
// named; a recommended item is only suggested. Every item says which part of the workspace fixes it.

export type IssueSeverity = 'required' | 'recommended'
export type Issue = {
  id: string
  severity: IssueSeverity
  text: string
  // The component that fixes it: a tool or a window of the invoice workspace.
  fix: 'business' | 'client' | 'terms' | 'vat' | 'lines'
}

export type Readiness = { ready: boolean; required: Issue[]; recommended: Issue[] }

// A tax invoice for more than this must show the client's address as well as their name (SARS).
export const RECIPIENT_DETAILS_ABOVE_CENTS = 500_000

const PROBLEM_WORDS: Record<LineProblem, string> = { description: 'a description', quantity: 'a quantity', price: 'a price' }

// A VAT number is ten digits. Spaces are ignored.
export const vatNumberIsValid = (value: string) => /^\d{10}$/.test(value.replace(/\s/g, ''))

export type CheckOptions = {
  // The numbers of the project's other invoices, which this one must not repeat.
  usedNumbers?: string[]
}

export function checkInvoice(content: InvoiceContent, { usedNumbers = [] }: CheckOptions = {}): Readiness {
  const { details, business, client, lines, vatRegistered } = content
  const totals = computeTotals(lines, vatRegistered)
  const issues: Issue[] = []
  const need = (id: string, text: string, fix: Issue['fix']) => issues.push({ id, severity: 'required', text, fix })
  const suggest = (id: string, text: string, fix: Issue['fix']) => issues.push({ id, severity: 'recommended', text, fix })

  if (business.name.trim() === '') need('business-name', 'Add your business name.', 'business')
  if (vatRegistered) {
    if (business.vatNumber.trim() === '') need('vat-number', 'Add your VAT number. A tax invoice must show it.', 'vat')
    else if (!vatNumberIsValid(business.vatNumber)) need('vat-number', 'Your VAT number should be ten digits.', 'vat')
    if (business.address.trim() === '') need('business-address', 'Add your business address. A tax invoice must show it.', 'business')
  }

  if (client.name.trim() === '') need('client-name', 'Add the name of the client.', 'client')
  if (vatRegistered && totals.totalCents > RECIPIENT_DETAILS_ABOVE_CENTS && client.address.trim() === '') {
    need('client-address', `Add the client's address. A tax invoice for more than ${formatRand(RECIPIENT_DETAILS_ABOVE_CENTS).replace(/[\s\u00a0]+/g, ' ').replace(/,00$/, '')} must show it.`, 'client')
  }

  if (details.number.trim() === '') need('number', 'Give the invoice a number.', 'terms')
  else if (usedNumbers.includes(details.number.trim())) need('number', `The number ${details.number.trim()} is already used by another invoice.`, 'terms')
  if (!isIsoDate(details.issueDate)) need('date', 'Choose the date of the invoice.', 'terms')
  if (dueDateOf(details) === null) need('due', 'Choose when payment is due.', 'terms')

  const begun = lines.map((line, index) => ({ line, index })).filter(({ line }) => !lineIsBlank(line))
  if (begun.length === 0) need('lines', 'Add at least one line, with a description, a quantity and a price.', 'lines')
  for (const { line, index } of begun) {
    const problems = lineProblems(line)
    if (problems.length > 0) need(`line-${line.id}`, `Line ${index + 1} needs ${problems.map((problem) => PROBLEM_WORDS[problem]).join(' and ')}.`, 'lines')
  }
  if (begun.length > 0 && begun.every(({ line }) => lineProblems(line).length === 0) && totals.totalCents === 0) {
    need('total', 'The total is nothing. Give a line a price.', 'lines')
  }

  if (!vatRegistered && business.address.trim() === '') suggest('business-address', 'Add your address, so the client knows where the invoice comes from.', 'business')
  if (business.email.trim() === '' && business.phone.trim() === '') suggest('contact', 'Add an email address or a phone number, so the client can reach you.', 'business')
  if (business.accountNumber.trim() === '') suggest('bank', 'Add your bank details, so the client knows how to pay you.', 'business')
  if (client.address.trim() === '' && !issues.some((issue) => issue.id === 'client-address')) suggest('client-address', "Add the client's address.", 'client')

  const required = issues.filter((issue) => issue.severity === 'required')
  return { ready: required.length === 0, required, recommended: issues.filter((issue) => issue.severity === 'recommended') }
}

// Which toolbar steps are complete: a step is complete when nothing required of its part is outstanding. A tool with nothing to
// complete (the list of invoices) has no entry. Recommended items never hold a step back.
export type StepId = 'business' | 'client' | 'terms' | 'vat' | 'total' | 'ready'

export function stepsDone(readiness: Readiness): Record<StepId, boolean> {
  const clear = (fix: Issue['fix']) => !readiness.required.some((issue) => issue.fix === fix)
  return {
    business: clear('business'),
    client: clear('client'),
    terms: clear('terms'),
    vat: clear('vat'),
    // The total is the lines, worked out: it is done when every line is whole and the sum is more than nothing.
    total: clear('lines'),
    ready: readiness.ready,
  }
}
