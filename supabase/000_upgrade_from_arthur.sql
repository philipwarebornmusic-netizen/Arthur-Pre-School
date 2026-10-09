-- Run this as its own SQL Editor query before schema.sql when upgrading the Arthur pilot database.
-- PostgreSQL cannot change an existing function's return type with CREATE OR REPLACE FUNCTION.
drop function if exists public.accept_invitation(text);
