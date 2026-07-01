CREATE TABLE queue_specialties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE queue_professionals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE,
  specialty_id INTEGER NOT NULL REFERENCES queue_specialties(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE queue_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_number TEXT NOT NULL COLLATE NOCASE,
  patient_name TEXT NOT NULL COLLATE NOCASE,
  phone TEXT NOT NULL DEFAULT '',
  specialty_id INTEGER NOT NULL REFERENCES queue_specialties(id),
  requester_id INTEGER NOT NULL REFERENCES queue_professionals(id),
  requested_procedure TEXT NOT NULL,
  medical_request_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'chamado', 'atendido', 'nao_compareceu', 'desistiu', 'cancelado')),
  entered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  called_at TEXT,
  observation TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE queue_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES queue_requests(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  from_status TEXT,
  to_status TEXT,
  action TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queue_professionals_specialty ON queue_professionals(specialty_id);
CREATE INDEX idx_queue_requests_specialty_status_date ON queue_requests(specialty_id, status, medical_request_date, entered_at);
CREATE INDEX idx_queue_requests_record ON queue_requests(record_number);
CREATE INDEX idx_queue_movements_request ON queue_movements(request_id, created_at);
