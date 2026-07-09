import re

with open('enrichment.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Replace the Tier 1 code handling of response
old_code = '''
                    triage_resp = await http.post_json("https://openrouter.ai/api/v1/chat/completions", payload=triage_payload, headers=headers)
                    triage_content = triage_resp["choices"][0]["message"]["content"]
'''

new_code = '''
                    triage_resp = await http.post_json("https://openrouter.ai/api/v1/chat/completions", payload=triage_payload, headers=headers)
                    if not triage_resp or "choices" not in triage_resp or not triage_resp["choices"]:
                        log.warning("Tier 1 Triage received invalid response: %s", triage_resp)
                        return # Abort if we can't parse
                    triage_content = triage_resp["choices"][0]["message"]["content"]
'''

code = code.replace(old_code, new_code)

with open('enrichment.py', 'w', encoding='utf-8') as f:
    f.write(code)
