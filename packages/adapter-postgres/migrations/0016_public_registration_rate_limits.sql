CREATE TABLE public_registration_rate_limit (
  scope_hash text NOT NULL,
  client_hash text NOT NULL,
  remaining_tokens double precision NOT NULL
    CHECK (remaining_tokens >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (scope_hash, client_hash)
);

CREATE INDEX public_registration_rate_limit_updated_at_idx
  ON public_registration_rate_limit(updated_at);
