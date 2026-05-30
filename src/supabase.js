import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://idtfvfusnlcwidqvxvse.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkdGZ2ZnVzbmxjd2lkcXZ4dnNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMjE3MTMsImV4cCI6MjA5NTY5NzcxM30.JrXvO4MmRU5q3tA7qZrq8GXFGxB_LwxFvgrDU9TU21s'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
