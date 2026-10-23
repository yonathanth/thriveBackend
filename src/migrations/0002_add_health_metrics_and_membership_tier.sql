-- Create health_metric table
CREATE TABLE IF NOT EXISTS health_metric (
  id SERIAL PRIMARY KEY,
  local_id INTEGER UNIQUE NOT NULL,
  member_local_id INTEGER,
  member_id INTEGER,
  measured_at TIMESTAMPTZ NOT NULL,
  
  -- Core metrics
  weight REAL,
  bmi REAL,
  body_fat_percent REAL,
  heart_rate INTEGER,
  
  -- Body composition
  muscle_mass REAL,
  lean_body_mass REAL,
  bone_mass REAL,
  skeletal_muscle_mass REAL,
  visceral_fat INTEGER,
  subcutaneous_fat_percent REAL,
  protein_percent REAL,
  
  -- Metabolic and other
  bmr INTEGER,
  body_age INTEGER,
  body_type TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  
  CONSTRAINT fk_health_metric_member FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE SET NULL
);

-- Create indexes for health_metric
CREATE INDEX IF NOT EXISTS idx_health_metric_local_id ON health_metric(local_id);
CREATE INDEX IF NOT EXISTS idx_health_metric_member_id ON health_metric(member_id);
CREATE INDEX IF NOT EXISTS idx_health_metric_member_local_id ON health_metric(member_local_id);
CREATE INDEX IF NOT EXISTS idx_health_metric_measured_at ON health_metric(measured_at);

-- Add membership_tier column to member table
ALTER TABLE member ADD COLUMN IF NOT EXISTS membership_tier VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_member_membership_tier ON member(membership_tier);




