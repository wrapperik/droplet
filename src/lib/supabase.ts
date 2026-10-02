import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

// Created lazily-safe: the app still renders without env values so UI work can start before the backend exists.
export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null
