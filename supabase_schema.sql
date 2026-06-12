-- Users
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT UNIQUE,
  name TEXT
);

-- Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT,
  summary TEXT
);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL, 
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Preferences
CREATE TABLE public.preferences (
  user_id TEXT PRIMARY KEY,
  theme TEXT,
  voice_id TEXT,
  playback_rate FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

-- Development Policies (To be replaced with auth.uid() checks in production)
CREATE POLICY "Allow public insert on messages" ON public.messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on messages" ON public.messages FOR SELECT USING (true);

CREATE POLICY "Allow public insert on preferences" ON public.preferences FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select on preferences" ON public.preferences FOR SELECT USING (true);
CREATE POLICY "Allow public update on preferences" ON public.preferences FOR UPDATE USING (true);
