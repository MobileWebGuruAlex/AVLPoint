import sqlite3

def run_stats():
    c = sqlite3.connect('vendors.db')
    
    # Query separated by region
    query = """
        SELECT 
            CASE WHEN country IN ('US', 'USA', 'United States', 'United States of America') OR country IS NULL OR country = '' THEN 'U.S. Priority' ELSE 'International' END as region,
            COUNT(*) as total,
            SUM(CASE WHEN contact_email IS NOT NULL AND contact_email != '' THEN 1 ELSE 0 END) email,
            SUM(CASE WHEN contact_phone IS NOT NULL AND contact_phone != '' THEN 1 ELSE 0 END) phone,
            SUM(CASE WHEN street_address IS NOT NULL AND street_address != '' THEN 1 ELSE 0 END) street,
            SUM(CASE WHEN city IS NOT NULL AND city != '' THEN 1 ELSE 0 END) city,
            SUM(CASE WHEN state_province IS NOT NULL AND state_province != '' THEN 1 ELSE 0 END) state,
            SUM(CASE WHEN zip_postal_code IS NOT NULL AND zip_postal_code != '' THEN 1 ELSE 0 END) zip,
            SUM(CASE WHEN services IS NOT NULL AND services != '' AND services != '[]' THEN 1 ELSE 0 END) svc,
            SUM(CASE WHEN welding_processes IS NOT NULL AND welding_processes != '' AND welding_processes != '[]' THEN 1 ELSE 0 END) weld,
            SUM(CASE WHEN industries_served IS NOT NULL AND industries_served != '' AND industries_served != '[]' THEN 1 ELSE 0 END) ind,
            SUM(CASE WHEN website_url IS NOT NULL AND website_url != '' THEN 1 ELSE 0 END) web,
            SUM(CASE WHEN company_description IS NOT NULL AND company_description != '' THEN 1 ELSE 0 END) descr,
            SUM(CASE WHEN employee_count IS NOT NULL AND employee_count != '' THEN 1 ELSE 0 END) emp,
            SUM(CASE WHEN year_established IS NOT NULL AND year_established != '' THEN 1 ELSE 0 END) yr
        FROM vendors
        GROUP BY region
    """
    
    results = c.execute(query).fetchall()
    labels = ['Total', 'Email', 'Phone', 'Street', 'City', 'State', 'Zip', 'Services', 'Welding', 'Industries', 'Website', 'Description', 'Employees', 'Year Est.']
    
    print("="*60)
    print("AVLPOINT DATABASE STATISTICS (U.S. FIRST PRIORITY)")
    print("="*60)
    
    for row in results:
        region = row[0]
        data = row[1:]
        total = data[0]
        
        print(f"\n--- {region.upper()} DATABASE ---")
        for l, v in zip(labels, data):
            pct = f"({v/total*100:.1f}%)" if total > 0 and l != 'Total' else ""
            print(f"  {l:15s}: {v:,} {pct}")
            
    print("\n" + "="*60)

if __name__ == "__main__":
    run_stats()
