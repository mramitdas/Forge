# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Vercel + Supabase deployment: serverless FastAPI backend via Mangum and a
  Next.js frontend project.
- Per-table page-size selector (50 / 100 / 500 / 1000) across paginated lists.
- `GYM_ENVIRONMENT` selects which env file the backend loads
  (`.env` or `.env.production`).

### Changed

- Env files split into dev (`backend/.env`) and production
  (`backend/.env.production`); all `.env*` are git-ignored except examples.
- SSL handling relaxed for managed Postgres poolers (`require` semantics).

### Documentation

- README updated for deployment, env selection, e2e gates, and CI.
