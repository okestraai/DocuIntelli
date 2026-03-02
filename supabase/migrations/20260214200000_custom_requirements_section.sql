-- Add section column to custom requirements so users can assign them to existing
-- template sections or create their own custom sections.
ALTER TABLE life_event_custom_requirements
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'Custom';
