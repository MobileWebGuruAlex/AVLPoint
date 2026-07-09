import re

with open('setup_scheduler.ps1', 'r', encoding='utf-8') as f:
    code = f.read()

# Add -WakeToRun
code = re.sub(
    r'(-StartWhenAvailable )',
    r'\1\n    -WakeToRun ',
    code
)

with open('setup_scheduler.ps1', 'w', encoding='utf-8') as f:
    f.write(code)
