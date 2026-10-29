PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  email TEXT, phone TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS responsibles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  professional_registration TEXT, email TEXT, phone TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY, client_id TEXT REFERENCES clients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0), property_type TEXT NOT NULL
    CHECK(property_type IN ('residential','commercial','rural','land','mixed','other')),
  address_line TEXT, city TEXT, state TEXT, postal_code TEXT, country TEXT NOT NULL DEFAULT 'BR',
  latitude REAL, longitude REAL, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  deleted_at TEXT, CHECK(latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK(longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE TABLE IF NOT EXISTS property_units (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  name TEXT NOT NULL, level_label TEXT, purpose TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(property_id, id)
);
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY, property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  responsible_id TEXT REFERENCES responsibles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','in_progress','review','confirmed','archived')),
  started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(property_id, id)
);
CREATE TABLE IF NOT EXISTS survey_versions (
  id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK(version_number > 0), description TEXT,
  created_at TEXT NOT NULL, created_by TEXT, UNIQUE(survey_id, version_number), UNIQUE(survey_id, id)
);
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  survey_version_id TEXT NOT NULL, name TEXT NOT NULL, room_type TEXT, level_label TEXT,
  notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(survey_id, id),
  FOREIGN KEY(survey_id, survey_version_id) REFERENCES survey_versions(survey_id, id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS building_elements (
  id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  room_id TEXT, element_type TEXT NOT NULL CHECK(element_type IN
    ('wall','floor','ceiling','door','window','column','beam','stair','fixture','opening','other')),
  label TEXT, geometry_json TEXT, properties_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(survey_id, id),
  FOREIGN KEY(survey_id, room_id) REFERENCES rooms(survey_id, id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS laser_devices (
  id TEXT PRIMARY KEY, manufacturer TEXT NOT NULL, model TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK(protocol IN ('unknown','bluetooth_le','bluetooth_classic','usb','file_import','manual')),
  compatibility_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK(compatibility_status IN ('unverified','documented','tested','unsupported')),
  notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(manufacturer, model)
);
CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  device_id TEXT REFERENCES laser_devices(id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK(method IN ('laser','camera_ar','image_estimate','manual','import','derived','simulator','point_cloud')),
  started_at TEXT NOT NULL, ended_at TEXT, metadata_json TEXT,
  UNIQUE(survey_id, id)
);
CREATE TABLE IF NOT EXISTS measurements (
  id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  room_id TEXT, element_id TEXT, device_session_id TEXT,
  quantity TEXT NOT NULL CHECK(quantity IN ('length','area','volume','angle','count','coordinate')),
  original_value REAL NOT NULL CHECK(original_value >= 0), original_unit TEXT NOT NULL,
  normalized_value REAL NOT NULL CHECK(normalized_value >= 0), normalized_unit TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('laser','camera_ar','image_estimate','manual','import','derived','simulator','point_cloud')),
  source_label TEXT, measured_at TEXT NOT NULL,
  validation_state TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK(validation_state IN ('unreviewed','needs_review','confirmed','rejected')),
  uncertainty_value REAL CHECK(uncertainty_value IS NULL OR uncertainty_value >= 0),
  uncertainty_unit TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  UNIQUE(survey_id, id),
  FOREIGN KEY(survey_id, room_id) REFERENCES rooms(survey_id, id) ON DELETE RESTRICT,
  FOREIGN KEY(survey_id, element_id) REFERENCES building_elements(survey_id, id) ON DELETE RESTRICT,
  FOREIGN KEY(survey_id, device_session_id) REFERENCES device_sessions(survey_id, id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS measurement_revisions (
  id TEXT PRIMARY KEY, measurement_id TEXT NOT NULL REFERENCES measurements(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK(revision_number > 0), previous_value REAL,
  previous_unit TEXT, next_value REAL NOT NULL, next_unit TEXT NOT NULL,
  reason TEXT NOT NULL, changed_at TEXT NOT NULL, changed_by TEXT,
  UNIQUE(measurement_id, revision_number)
);
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  room_id TEXT, kind TEXT NOT NULL CHECK(kind IN ('photo','video','document','sketch','plan','point_cloud','mesh','other')),
  file_name TEXT NOT NULL, mime_type TEXT, relative_path TEXT NOT NULL,
  checksum_sha256 TEXT, captured_at TEXT, metadata_json TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(survey_id, room_id) REFERENCES rooms(survey_id, id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  action TEXT NOT NULL, occurred_at TEXT NOT NULL, actor_id TEXT, details_json TEXT
);
CREATE TABLE IF NOT EXISTS backup_records (
  id TEXT PRIMARY KEY, file_path TEXT NOT NULL, created_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL, checksum_sha256 TEXT, size_bytes INTEGER,
  status TEXT NOT NULL CHECK(status IN ('created','verified','restored','failed')),
  notes TEXT
);
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum_sha256 TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_properties_client ON properties(client_id);
CREATE INDEX IF NOT EXISTS idx_units_property ON property_units(property_id);
CREATE INDEX IF NOT EXISTS idx_surveys_property ON surveys(property_id);
CREATE INDEX IF NOT EXISTS idx_rooms_survey ON rooms(survey_id);
CREATE INDEX IF NOT EXISTS idx_elements_survey_room ON building_elements(survey_id, room_id);
CREATE INDEX IF NOT EXISTS idx_measurements_survey_room ON measurements(survey_id, room_id);
CREATE INDEX IF NOT EXISTS idx_measurements_validation ON measurements(validation_state);
CREATE INDEX IF NOT EXISTS idx_revisions_measurement ON measurement_revisions(measurement_id, revision_number);
CREATE INDEX IF NOT EXISTS idx_media_survey ON media_assets(survey_id);

CREATE TRIGGER IF NOT EXISTS measurement_revision_guard
BEFORE UPDATE OF original_value, original_unit, normalized_value, normalized_unit ON measurements
WHEN OLD.validation_state = 'confirmed'
 AND (OLD.original_value != NEW.original_value OR OLD.original_unit != NEW.original_unit
   OR OLD.normalized_value != NEW.normalized_value OR OLD.normalized_unit != NEW.normalized_unit)
BEGIN
  SELECT RAISE(ABORT, 'Confirmed measurements must be revised through an explicit revision workflow');
END;

CREATE TRIGGER IF NOT EXISTS measurement_revision_capture
AFTER UPDATE OF original_value, original_unit, normalized_value, normalized_unit ON measurements
WHEN OLD.original_value != NEW.original_value OR OLD.original_unit != NEW.original_unit
  OR OLD.normalized_value != NEW.normalized_value OR OLD.normalized_unit != NEW.normalized_unit
BEGIN
  INSERT INTO measurement_revisions
    (id, measurement_id, revision_number, previous_value, previous_unit, next_value, next_unit, reason, changed_at)
  VALUES
    (lower(hex(randomblob(16))), OLD.id, OLD.revision + 1, OLD.original_value, OLD.original_unit,
     NEW.original_value, NEW.original_unit, 'Updated through database trigger', NEW.updated_at);
  UPDATE measurements SET revision = OLD.revision + 1 WHERE id = OLD.id;
END;
