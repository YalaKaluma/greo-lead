CREATE TABLE IF NOT EXISTS home_dashboard_snapshots (
    id SERIAL PRIMARY KEY,
    user_number VARCHAR NOT NULL,
    snapshot_date DATE NOT NULL,
    payload JSONB NOT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'on_demand',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_home_dashboard_user_date UNIQUE (user_number, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_home_dashboard_snapshots_user_number
    ON home_dashboard_snapshots(user_number);

CREATE INDEX IF NOT EXISTS idx_home_dashboard_snapshots_snapshot_date
    ON home_dashboard_snapshots(snapshot_date);

CREATE INDEX IF NOT EXISTS idx_home_dashboard_user_created
    ON home_dashboard_snapshots(user_number, created_at);
