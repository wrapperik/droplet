// The tasks the composer can name a request as, or chat for ordinary conversation.
export const TASKS = ['ideation', 'brand', 'logo', 'invoice', 'correspondence', 'chat'] as const
export type Task = (typeof TASKS)[number]
