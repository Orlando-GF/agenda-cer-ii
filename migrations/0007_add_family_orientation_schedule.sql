PRAGMA foreign_keys = OFF;

CREATE TABLE schedules_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('profissional', 'exame', 'orientacao')),
  professional_id INTEGER REFERENCES professionals(id),
  schedule_date TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('manha', 'tarde', 'noite')),
  time_label TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schedules_new (
  id, kind, professional_id, schedule_date, period, time_label, capacity, notes, active, created_by, created_at
)
SELECT id, kind, professional_id, schedule_date, period, time_label, capacity, notes, active, created_by, created_at
FROM schedules;

DROP TABLE schedules;
ALTER TABLE schedules_new RENAME TO schedules;

CREATE INDEX idx_schedules_date ON schedules(schedule_date);

PRAGMA foreign_keys = ON;
