
CREATE DOMAIN userid AS INTEGER;

CREATE DOMAIN patchid AS UUID;
CREATE DOMAIN pageid AS UUID;
CREATE DOMAIN buildid AS UUID;

CREATE TYPE patchstatus AS ENUM ('active', 'deleted', 'merged');

CREATE TABLE builds (
    build_id buildid PRIMARY KEY,
    time TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE defrefs (
    ref JSONB PRIMARY KEY,
    build_id buildid NOT NULL REFERENCES builds ON DELETE CASCADE
);

CREATE TABLE crossrefs (
    ref JSONB,
    build_id buildid NOT NULL REFERENCES builds ON DELETE CASCADE,
    PRIMARY KEY (ref, build_id)
);

CREATE TABLE pages (
    page_id pageid PRIMARY KEY,
    args JSONB NOT NULL,
    version INTEGER NOT NULL,
    build_id buildid REFERENCES builds ON DELETE SET NULL,
    unique (args)
);

CREATE INDEX on pages (build_id);

CREATE TABLE revisions (
    page_id pageid REFERENCES pages,
    version INTEGER NOT NULL DEFAULT 1,
    prev_version INTEGER NULL,
    merger_user_id userid NULL,
    merger_username TEXT NULL,
    author_user_id userid NOT NULL,
    author_username TEXT NOT NULL,
    reason TEXT NOT NULL,
    time TIMESTAMP NOT NULL DEFAULT NOW(),
    text TEXT NOT NULL,
    args JSONB NOT NULL,
    PRIMARY KEY(page_id, version),
    UNIQUE (page_id, version, args), -- redundant but needed for pages fk
    CHECK (
        CASE WHEN version < 1 THEN FALSE
        WHEN version = 1 THEN prev_version IS NULL
        ELSE prev_version IS NOT NULL AND version = prev_version + 1 END
    )
);

ALTER TABLE revisions ADD FOREIGN KEY (page_id, prev_version) REFERENCES revisions (page_id, version);

ALTER TABLE pages
ADD CONSTRAINT page_has_valid_latest_revision
FOREIGN KEY (page_id, args, version)
REFERENCES revisions (page_id, args, version) DEFERRABLE;

CREATE TABLE patches (
    -- TODO: make SERIAL
    patch_id patchid PRIMARY KEY,
    -- No FK here, if base_version is null it won't exist. If base_version is
    -- not null, the revisions FK activates, which also implies the page does.
    page_id pageid NOT NULL,
    base_version INTEGER NULL,
    version INTEGER NOT NULL DEFAULT 1,
    author_user_id userid NOT NULL,
    author_username TEXT NOT NULL,
    reason TEXT NOT NULL,
    time TIMESTAMP NOT NULL DEFAULT NOW(),
    text TEXT NOT NULL,
    build_skipped BOOLEAN NOT NULL,
    status patchstatus DEFAULT 'active',
    args JSONB NOT NULL,
    FOREIGN KEY (page_id, base_version) REFERENCES revisions (page_id, version),
    CHECK (version >= 1)
);

CREATE INDEX ON patches (status, time);

CREATE TABLE drafts (
    user_id userid,
    page_id pageid REFERENCES pages,
    version INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY(page_id, user_id),
    FOREIGN KEY(page_id, version) REFERENCES revisions (page_id, version)
);


CREATE TABLE alerts (
    user_id userid,
    args JSONB,
    on_submission BOOLEAN NOT NULL,
    on_write BOOLEAN NOT NULL,
    build_id buildid NOT NULL REFERENCES builds ON DELETE CASCADE,
    PRIMARY KEY (user_id, args)
);
