ALTER TABLE appointments ADD COLUMN family_relation TEXT NOT NULL DEFAULT '';
ALTER TABLE appointments ADD COLUMN linked_patient_record TEXT NOT NULL DEFAULT '';
