import ast

# 1. Read firecrawl_discovery.py to get INDUSTRY_QUERIES
with open("c:\\Projects\\AVLpoint\\sources\\firecrawl_discovery.py", "r", encoding="utf-8") as f:
    fc_code = f.read()

# We can parse it and find the assignment
module = ast.parse(fc_code)
queries = None
for node in module.body:
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "INDUSTRY_QUERIES":
                # extract source segment
                # Since ast doesn't give us the exact string easily in old python, 
                # we'll just evaluate it safely
                queries = ast.literal_eval(node.value)
                break

print(f"Extracted {len(queries)} queries.")

# 2. Rewrite nimbleway_search.py
with open("c:\\Projects\\AVLpoint\\sources\\nimbleway_search.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
in_queries = False
for line in lines:
    if line.startswith("INDUSTRY_QUERIES = ["):
        in_queries = True
        new_lines.append("INDUSTRY_QUERIES = [\n")
        for q in queries:
            new_lines.append(f'    "{q}",\n')
        new_lines.append("]\n")
        continue
    
    if in_queries:
        if line.strip() == "]":
            in_queries = False
        continue
    
    # 3. Also patch the `is_seen_company` call in nimbleway_search.py
    if "if await self.db.is_seen_company(v.company_name):" in line:
        line = line.replace("if await self.db.is_seen_company(v.company_name):", "if await self.db.is_seen_company(v.company_name, v.website_url):")
        
    new_lines.append(line)

with open("c:\\Projects\\AVLpoint\\sources\\nimbleway_search.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Patched nimbleway_search.py")
