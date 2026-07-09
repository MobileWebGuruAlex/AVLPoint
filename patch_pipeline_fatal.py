import re

with open('pipeline_v2.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Add import
code = code.replace("from http_client import ConcurrentClient", "from http_client import ConcurrentClient, FatalAPIError")

# Catch FatalAPIError and exit
replace_block = '''
            except FatalAPIError as e:
                log.error("Fatal API Error encountered: %s. Aborting pipeline.", e)
                raise
            except Exception as e:
'''

code = code.replace("except Exception as e:\n                log.warning(\"Enrichment batch crashed", replace_block + "log.warning(\"Enrichment batch crashed")

with open('pipeline_v2.py', 'w', encoding='utf-8') as f:
    f.write(code)
