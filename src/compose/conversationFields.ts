import { z } from 'zod'
import { FACT_KEYS, MAX_FACT_LENGTH } from '../lib/facts.ts'
import { blocksField } from './blocks.ts'

export { blocksField }

// The parts of a turn that are about the conversation rather than the workspace, shared by the palette's turn and the invoice's so
// both talk the same way. The message is what was done or answered. The question is the one thing Droplet asks next, and the
// replies are answers the founder can tap instead of typing. A tapped reply is sent as the founder's own message.

export const MAX_MESSAGE_LENGTH = 1200
export const MAX_QUESTION_LENGTH = 200
export const MAX_REPLY_LENGTH = 40
export const MAX_REPLIES = 4
export const MAX_TITLE_LENGTH = 100

export const messageField = z
  .string()
  .trim()
  .min(1)
  .max(MAX_MESSAGE_LENGTH)
  .describe(
    'What you say to the founder: an answer, advice, or what you did and why. First person, plain. Short paragraphs separated by a blank line. Use "- " lines for options or items and "1. " lines for steps or a ranking. Put **double asterisks** round the key words only. No headings, tables or other markup. Do not put your question here.',
  )

export const questionField = z
  .string()
  .trim()
  .min(1)
  .max(MAX_QUESTION_LENGTH)
  .optional()
  .describe('One short question that moves the work forward, which the founder can answer in a few words. It ends with a question mark. Leave it out when nothing needs asking.')

export const repliesField = z
  .array(z.string().trim().min(1).max(MAX_REPLY_LENGTH))
  .max(MAX_REPLIES)
  .optional()
  .describe('Two to four likely answers to your question, as the founder would say them, each a few words. Only with a question. Never a price.')

export const titleField = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TITLE_LENGTH)
  .optional()
  .describe(
    'A name for this chat in the founder\'s history: two to five words on its subject, such as "Pricing gift boxes". Give it when the chat has no name yet and has a subject, or when the subject has clearly changed. Otherwise leave it out. Sentence case, no quotation marks, no full stop, under 40 characters.',
  )

export const MAX_QUOTE_LENGTH = 120

// Droplet opens a workspace only when the founder asked for it outright or agreed to an offer. It says so here, and quotes the founder's own
// words, which the app checks are really in their message: a reply that opens a workspace without a quote that is there is refused.
export const opensSchema = z.object({
  because: z.enum(['asked', 'agreed']).describe('"asked" if the founder asked for this workspace outright, "agreed" if they said yes to your offer of it (including a tap on an Open button).'),
  quote: z.string().trim().min(3).max(MAX_QUOTE_LENGTH).describe('The founder\'s own words from <request> that ask for the workspace or agree to it, copied exactly. Not your words.'),
})

export type Opens = z.infer<typeof opensSchema>

export const opensField = opensSchema
  .optional()
  .describe('Only when this reply opens a workspace that is not on screen. Leave it out otherwise, and never open one the founder did not ask for or agree to.')

export const MAX_PROPOSALS = 3

// A fact about the business that the founder has said, offered for them to remember. Droplet only proposes: it is remembered when the founder presses
// Remember. The quote is the founder's own words that it came from, and the app checks that it is really in what they wrote.
export const proposalSchema = z.object({
  key: z.enum(FACT_KEYS).describe('Which fact: profile.stage (how far along), profile.what, profile.who_for, profile.where, brand.values, brand.voice, brand.fonts, logo.status, business.name, business.offer, business.pricing, preference.style.'),
  value: z.string().trim().min(1).max(MAX_FACT_LENGTH).describe('The fact in a short plain line, in the founder\'s words. Never an address, an email, a phone number or a bank detail.'),
  quote: z.string().trim().min(3).max(MAX_QUOTE_LENGTH).describe('The founder\'s own words from <request> or <conversation> that say it, copied exactly. Not your words.'),
})

export type Proposal = z.infer<typeof proposalSchema>

export const proposeField = z
  .array(proposalSchema)
  .max(MAX_PROPOSALS)
  .optional()
  .describe('Facts about the business the founder has just said, up to three, for them to choose to remember. Only what they said, and never what <project> already shows with the same value. Leave it out when there is nothing new.')
