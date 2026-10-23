#!/usr/bin/env python3
import psycopg2

conn = psycopg2.connect("postgresql://gym:gym_dev_pass@localhost:5432/gym_erp_test")
conn.autocommit = True
cur = conn.cursor()
cur.execute("CREATE ROLE gym_admin LOGIN SUPERUSER PASSWORD 'gym_admin_pass'")
cur.execute("ALTER ROLE gym NOSUPERUSER NOBYPASSRLS")
conn.close()
print("test roles ready")