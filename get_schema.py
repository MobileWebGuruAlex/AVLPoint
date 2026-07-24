import sqlite3
conn = sqlite3.connect('vendors.db')
c = conn.cursor()
c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='vendors'")
print(c.fetchone()[0])
