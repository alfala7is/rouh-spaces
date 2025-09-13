CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function to set app.space_id
CREATE OR REPLACE FUNCTION set_app_space(space uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.space_id', space::text, true);
END;
$$ LANGUAGE plpgsql;

