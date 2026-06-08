-- Email preferences: let managers opt out of reminder/digest emails.
alter table profiles add column if not exists email_opt_out boolean not null default false;
