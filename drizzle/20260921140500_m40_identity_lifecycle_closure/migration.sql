-- CASA M40 Identity + Lifecycle Closure
-- Adds an explicit non-terminal school-section transition.
-- Primary -> Secondary within the same CASA school record remains the same
-- student, permanent card identity, and biometric identity.

ALTER TYPE "student_progression_decision"
  ADD VALUE IF NOT EXISTS 'TRANSITIONED';
