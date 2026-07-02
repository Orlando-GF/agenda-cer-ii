CREATE TABLE queue_procedures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO queue_procedures (name)
SELECT DISTINCT trim(requested_procedure)
FROM queue_requests
WHERE trim(requested_procedure) <> '';

ALTER TABLE queue_requests ADD COLUMN procedure_id INTEGER REFERENCES queue_procedures(id);

UPDATE queue_requests
SET procedure_id = (
  SELECT id
  FROM queue_procedures
  WHERE lower(queue_procedures.name) = lower(trim(queue_requests.requested_procedure))
  LIMIT 1
)
WHERE trim(requested_procedure) <> '';

CREATE INDEX idx_queue_requests_procedure ON queue_requests(procedure_id);
