ALTER TABLE queue_procedures ADD COLUMN specialty_id INTEGER REFERENCES queue_specialties(id);

ALTER TABLE queue_requests ADD COLUMN requested_procedure_other TEXT NOT NULL DEFAULT '';

UPDATE queue_procedures
SET specialty_id = (
  SELECT specialty_id
  FROM queue_requests
  WHERE queue_requests.procedure_id = queue_procedures.id
  LIMIT 1
)
WHERE specialty_id IS NULL;

CREATE TABLE queue_request_procedures (
  request_id INTEGER NOT NULL REFERENCES queue_requests(id) ON DELETE CASCADE,
  procedure_id INTEGER NOT NULL REFERENCES queue_procedures(id),
  PRIMARY KEY (request_id, procedure_id)
);

INSERT OR IGNORE INTO queue_request_procedures (request_id, procedure_id)
SELECT id, procedure_id
FROM queue_requests
WHERE procedure_id IS NOT NULL;

CREATE INDEX idx_queue_procedures_specialty ON queue_procedures(specialty_id, active, name);
CREATE INDEX idx_queue_request_procedures_procedure ON queue_request_procedures(procedure_id);
