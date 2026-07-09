import re

with open('pipeline_v2.py', 'r', encoding='utf-8') as f:
    code = f.read()

watchdog_fixed = '''
    async def watchdog():
        if args.max_runtime > 0:
            log.info("Watchdog started: will stop pipeline in %d minutes", args.max_runtime)
            await asyncio.sleep(args.max_runtime * 60)
            log.warning("Max runtime reached (%d minutes). Initiating graceful shutdown.", args.max_runtime)
            stop.set()
            if enrich_task:
                enrich_task.cancel()
            consumer_task.cancel()
'''

code = re.sub(r'async def watchdog\(\):.*?watchdog_task = asyncio\.create_task\(watchdog\(\)\)', watchdog_fixed + '\n    watchdog_task = asyncio.create_task(watchdog())', code, flags=re.DOTALL)

with open('pipeline_v2.py', 'w', encoding='utf-8') as f:
    f.write(code)
