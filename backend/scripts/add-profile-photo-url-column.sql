-- Run once on production MySQL/Postgres if profile photo deploy broke auth before server restart.
ALTER TABLE users ADD COLUMN profilePhotoUrl TEXT NULL;
