-- Montage — PostgreSQL Schema

-- ============================================================================
-- Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Users Table (local auth, replaces Supabase Auth + montage_user_tiers)
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    tier TEXT NOT NULL DEFAULT 'free',
    is_admin BOOLEAN NOT NULL DEFAULT false,
    videos_this_month INT NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Jobs Table
-- ============================================================================

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    params JSONB NOT NULL,
    script TEXT,
    progress INT NOT NULL DEFAULT 0,
    result_path TEXT,
    thumbnail_path TEXT,
    duration_s INT,
    error TEXT,
    cost_estimate REAL NOT NULL DEFAULT 0.02,
    cost_actual REAL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Videos Table
-- ============================================================================

CREATE TABLE videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    duration_s INT,
    platform_profile TEXT NOT NULL DEFAULT 'tiktok_9_16',
    style_playbook TEXT NOT NULL DEFAULT 'clean_professional',
    size_bytes INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_jobs_user_status ON jobs(user_id, status);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);
CREATE INDEX idx_videos_user ON videos(user_id, created_at DESC);

-- ============================================================================
-- Updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
