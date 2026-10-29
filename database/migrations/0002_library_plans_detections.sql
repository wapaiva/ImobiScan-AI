PRAGMA foreign_keys = ON;

-- Object parametric library (master prompt section 15).
-- Third-party models may only be registered with an explicit license field;
-- origin and licence are mandatory metadata, never assumed.
CREATE TABLE IF NOT EXISTS object_categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, parent_id TEXT REFERENCES object_categories(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS object_definitions (
  id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES object_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  default_dimensions_json TEXT NOT NULL CHECK(json_valid(default_dimensions_json)),
  parameters_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(parameters_json)),
  representation_2d_json TEXT CHECK(representation_2d_json IS NULL OR json_valid(representation_2d_json)),
  representation_3d_json TEXT CHECK(representation_3d_json IS NULL OR json_valid(representation_3d_json)),
  insertion_points_json TEXT CHECK(insertion_points_json IS NULL OR json_valid(insertion_points_json)),
  placement_rules_json TEXT CHECK(placement_rules_json IS NULL OR json_valid(placement_rules_json)),
  unit TEXT NOT NULL DEFAULT 'm' CHECK(unit IN ('mm','cm','m','km','in','ft')),
  model_origin TEXT NOT NULL CHECK(length(trim(model_origin)) > 0),
  license TEXT NOT NULL CHECK(length(trim(license)) > 0),
  family_id TEXT,
  notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_object_defs_category ON object_definitions(category_id);
CREATE INDEX IF NOT EXISTS idx_object_defs_family ON object_definitions(family_id);

-- Instances of library objects placed inside a survey (doors, windows, fixtures…).
CREATE TABLE IF NOT EXISTS object_instances (
  id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  definition_id TEXT NOT NULL REFERENCES object_definitions(id) ON DELETE RESTRICT,
  room_id TEXT, element_id TEXT,
  parameter_overrides_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(parameter_overrides_json)),
  position_json TEXT CHECK(position_json IS NULL OR json_valid(position_json)),
  rotation REAL CHECK(rotation IS NULL OR (rotation >= 0 AND rotation < 6.283185307179586)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(survey_id, id),
  FOREIGN KEY(survey_id, room_id) REFERENCES rooms(survey_id, id) ON DELETE RESTRICT,
  FOREIGN KEY(survey_id, element_id) REFERENCES building_elements(survey_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_object_instances_survey ON object_instances(survey_id);

-- 2D plan / geometry versions (master prompt sections 10.3 and 13):
-- every applied change creates a new version; previous data is never destroyed.
CREATE TABLE IF NOT EXISTS plan_versions (
  id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  survey_version_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK(version_number > 0),
  geometry_json TEXT NOT NULL CHECK(json_valid(geometry_json)),
  summary TEXT, source TEXT NOT NULL DEFAULT 'manual'
    CHECK(source IN ('manual','laser_import','camera_estimate','derived','merged','restored')),
  consistency_report_json TEXT CHECK(consistency_report_json IS NULL OR json_valid(consistency_report_json)),
  created_at TEXT NOT NULL, created_by TEXT,
  UNIQUE(survey_id, version_number), UNIQUE(survey_id, id),
  FOREIGN KEY(survey_id, survey_version_id) REFERENCES survey_versions(survey_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_plan_versions_survey ON plan_versions(survey_id, version_number);

-- Recognized objects from photo/video analysis (section 11). Detection is kept
-- strictly separate from geometry: no dimensions are inferred from appearance.
-- The link to media uses a single-column foreign key on media_assets.id
-- (the parent primary key) plus BEFORE INSERT/UPDATE guards that enforce the
-- same-survey consistency rule. A composite FK would require
-- UNIQUE(survey_id, id) on media_assets, which migration 0001 does not define;
-- rebuilding a published table from an unpublished migration would be the
-- riskier option. CHECK clauses cannot run subqueries in SQLite, and the
-- trigger approach works identically on node:sqlite and better-sqlite3.
CREATE TABLE IF NOT EXISTS detected_objects (
  id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE RESTRICT,
  media_asset_id TEXT REFERENCES media_assets(id) ON DELETE RESTRICT, room_id TEXT,
  object_class TEXT NOT NULL,
  bbox_json TEXT CHECK(bbox_json IS NULL OR json_valid(bbox_json)),
  detection_source TEXT NOT NULL CHECK(detection_source IN ('local_model','cloud_model','manual_annotation')),
  dimensions_known INTEGER NOT NULL DEFAULT 0 CHECK(dimensions_known IN (0,1)),
  correction_notes TEXT, created_at TEXT NOT NULL,
  UNIQUE(survey_id, id),
  FOREIGN KEY(survey_id, room_id) REFERENCES rooms(survey_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_detected_objects_survey ON detected_objects(survey_id, object_class);
CREATE INDEX IF NOT EXISTS idx_detected_objects_media ON detected_objects(media_asset_id);

CREATE TRIGGER IF NOT EXISTS detected_objects_media_survey_insert_guard
BEFORE INSERT ON detected_objects
WHEN NEW.media_asset_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM media_assets ma WHERE ma.id = NEW.media_asset_id AND ma.survey_id = NEW.survey_id
)
BEGIN
  SELECT RAISE(ABORT, 'detected_objects.media_asset_id must reference a media asset of the same survey');
END;

CREATE TRIGGER IF NOT EXISTS detected_objects_media_survey_update_guard
BEFORE UPDATE OF media_asset_id, survey_id ON detected_objects
WHEN NEW.media_asset_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM media_assets ma WHERE ma.id = NEW.media_asset_id AND ma.survey_id = NEW.survey_id
)
BEGIN
  SELECT RAISE(ABORT, 'detected_objects.media_asset_id must reference a media asset of the same survey');
END;
