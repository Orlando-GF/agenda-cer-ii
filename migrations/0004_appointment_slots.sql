PRAGMA foreign_keys = OFF;

CREATE TABLE appointments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK (slot_number > 0),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  observation TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (schedule_id, patient_id),
  UNIQUE (schedule_id, slot_number)
);

INSERT INTO appointments_new (
  id, schedule_id, slot_number, patient_id, observation, created_by, created_at, updated_at
)
SELECT id, schedule_id,
       ROW_NUMBER() OVER (PARTITION BY schedule_id ORDER BY created_at, id) AS slot_number,
       patient_id, observation, created_by, created_at, updated_at
FROM appointments;

DROP TABLE appointments;
ALTER TABLE appointments_new RENAME TO appointments;

CREATE INDEX idx_appointments_schedule ON appointments(schedule_id);

PRAGMA foreign_keys = ON;
