-- Staff (synced from desktop, no fingerprint on API)
CREATE TABLE IF NOT EXISTS staff (
  id SERIAL PRIMARY KEY,
  local_id INTEGER UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  role VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_local_id ON staff(local_id);

-- Staff attendance (one row per scan)
CREATE TABLE IF NOT EXISTS staff_attendance (
  id SERIAL PRIMARY KEY,
  local_id INTEGER UNIQUE NOT NULL,
  staff_local_id INTEGER NOT NULL,
  staff_id INTEGER NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  CONSTRAINT fk_staff_attendance_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_attendance_local_id ON staff_attendance(local_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_id ON staff_attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_scanned_at ON staff_attendance(scanned_at);
