-- Montage — Database Schema
-- Supabase PostgreSQL
-- Run in Supabase SQL Editor

-- Jobs table
CREATE TABLE IF NOT EXISTS montage_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  params JSONB NOT NULL,
  script TEXT,
  progress INT DEFAULT 0,
  result_path TEXT,
  thumbnail_path TEXT,
  duration_s INT,
  error TEXT,
  cost_estimate REAL DEFAULT 0.02,
  cost_actual REAL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Videos table
CREATE TABLE IF NOT EXISTS montage_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES montage_jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  duration_s INT,
  platform_profile TEXT DEFAULT 'tiktok_9_16',
  style_playbook TEXT DEFAULT 'clean_professional',
  size_bytes INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- User tiers
CREATE TABLE IF NOT EXISTS montage_user_tiers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free',
  videos_this_month INT DEFAULT 0,
  reset_at TIMESTAMPTZ DEFAULT now(),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE montage_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE montage_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE montage_user_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own jobs" ON montage_jobs FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own videos" ON montage_videos FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users own tier" ON montage_user_tiers FOR ALL USING (user_id = auth.uid());

-- Auto-create tier on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO montage_user_tiers (user_id, tier, reset_at)
  VALUES (NEW.id, 'free', now() + INTERVAL '30 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('montage-videos', 'montage-videos', false, 52428800, ARRAY['video/mp4', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — users access their own folder
CREATE POLICY "Users access own montage folder"
ON storage.objects FOR ALL
USING (auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON montage_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON montage_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_user ON montage_videos(user_id, created_at DESC);
