import { z } from 'zod'

// The parts of a turn that are about the conversation rather than the workspace, shared by the palette's turn and the invoice's so
// both talk the same way. The message is what was done or answered. The question is the one thing Droplet asks next, and the
// replies are answers the founder can tap instead of typing. A tapped reply is sent as the founder's own message.

export const MAX_MESSAGE_LENGTH = 1200
export const MAX_QUESTION_LENGTH = 200
export const MAX_REPLY_LENGTH = 40
export const MAX_REPLIES = 4

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
