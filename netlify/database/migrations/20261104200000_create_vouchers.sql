CREATE TABLE vouchers (
  code TEXT PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount > 0),
  balance INTEGER NOT NULL CHECK (balance >= 0),
  recipient TEXT,
  sender TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE voucher_log (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL REFERENCES vouchers(code),
  change INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX voucher_log_code_idx ON voucher_log (code, id);
