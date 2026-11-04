-- Vouchers can now be made ahead of time as stock. A stock voucher has no expiry
-- until it is issued, so the validity clock starts at issue, not at creation.
ALTER TABLE vouchers ADD COLUMN months INTEGER NOT NULL DEFAULT 6;
ALTER TABLE vouchers ALTER COLUMN expires_at DROP NOT NULL;
CREATE INDEX vouchers_stock_idx ON vouchers (amount, created_at) WHERE expires_at IS NULL;
