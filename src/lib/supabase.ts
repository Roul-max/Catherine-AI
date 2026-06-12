import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.");
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }

  return supabaseInstance;
}

export async function savePreferences(userId: string, prefs: any) {
  try {
     const supabase = getSupabase();
     await supabase.from("preferences").upsert({ user_id: userId, ...prefs });
  } catch (e) {
     throw e;
  }
}

export async function loadPreferences(userId: string) {
  try {
     const supabase = getSupabase();
     const { data, error } = await supabase.from("preferences").select("*").eq("user_id", userId).single();
     if (error) throw error;
     return data;
  } catch (e) {
     throw e;
  }
}

export async function saveMessage(conversationId: string, role: string, content: string) {
  try {
     const supabase = getSupabase();
     const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, role, content });
     if (error) throw error;
  } catch(e) {
     throw e;
  }
}

export async function loadMessages(conversationId: string) {
  try {
     const supabase = getSupabase();
     const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
     if (error) throw error;
     return data;
  } catch(e) {
     throw e;
  }
}
