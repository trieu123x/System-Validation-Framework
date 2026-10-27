-- Idempotent migration: never deletes inventory, users or transactions.
BEGIN;
ALTER TABLE chi_nhanh ADD COLUMN IF NOT EXISTS email VARCHAR(254);
CREATE TABLE IF NOT EXISTS mail_admin_config (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    email VARCHAR(254) NOT NULL
);
INSERT INTO mail_admin_config(singleton, email)
VALUES (TRUE, 'lamlt.b23cn478@stu.ptit.edu.vn')
ON CONFLICT (singleton) DO NOTHING;
-- Preserve manually edited addresses. Assign only missing addresses.
UPDATE chi_nhanh
SET email = CASE WHEN ma_cn IN ('CN01','CN02') THEN 'vudinhngocminh@gmail.com'
            ELSE 'test' || LPAD(SUBSTRING(ma_cn FROM '([0-9]+)$'), 4, '0') || '@gmail.com' END
WHERE (email IS NULL OR TRIM(email) = '') AND NOT gia_lap
  AND (ma_cn IN ('CN01', 'CN02') OR ma_cn ~ '[0-9]+$');
-- Default new branch addresses (when code ends in digits); update via SQL anytime.
CREATE OR REPLACE FUNCTION assign_branch_email() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email IS NULL OR BTRIM(NEW.email) = '' THEN
    IF NEW.ma_cn IN ('CN01','CN02') THEN
      NEW.email := 'vudinhngocminh@gmail.com';
    ELSIF NEW.ma_cn ~ '[0-9]+$' AND NOT NEW.gia_lap THEN
      NEW.email := 'test' || LPAD(SUBSTRING(NEW.ma_cn FROM '([0-9]+)$'), 4, '0') || '@gmail.com';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tr_assign_branch_email ON chi_nhanh;
CREATE TRIGGER tr_assign_branch_email BEFORE INSERT ON chi_nhanh
FOR EACH ROW EXECUTE FUNCTION assign_branch_email();
COMMIT;
