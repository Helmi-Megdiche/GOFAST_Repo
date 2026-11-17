-- GH-10 round 2 (review item 1): `core.account_for_login` (0005) is replaced by `core.login_account` (0006),
-- which the app uses. Nothing calls the old one, so the app loses the right to run it.
-- Only the owner of a function can revoke a right on it, and the owner is fastgo_public_reader (0005).
-- The migrator takes that role for this transaction only: set_config(..., true) lasts to the end of the
-- transaction (the runner uses one transaction per file) and is what the one-door rule allows. No SET ROLE.
select set_config('role', 'fastgo_public_reader', true);
revoke execute on function core.account_for_login(text, text) from fastgo_app;
select set_config('role', 'fastgo_migrator', true);
