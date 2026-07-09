import re

with open('pipeline_v2.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Add max-runtime argument
code = code.replace(
    'parser.add_argument("--enrich-only", action="store_true",\n                        help="skip discovery; only run enrichment over existing DB")',
    'parser.add_argument("--enrich-only", action="store_true",\n                        help="skip discovery; only run enrichment over existing DB")\n    parser.add_argument("--max-runtime", type=int, default=0, help="maximum runtime in minutes before graceful shutdown")'
)

# Add watchdog task
watchdog_code = '''
    async def watchdog():
        if args.max_runtime > 0:
            log.info("Watchdog started: will stop pipeline in %d minutes", args.max_runtime)
            await asyncio.sleep(args.max_runtime * 60)
            log.warning("Max runtime reached (%d minutes). Initiating graceful shutdown.", args.max_runtime)
            stop.set()
            
    watchdog_task = asyncio.create_task(watchdog())
'''

# Insert watchdog task right after metrics_task creation
code = code.replace(
    'metrics_task = asyncio.create_task(metrics_loop(db, started_at, stop))',
    'metrics_task = asyncio.create_task(metrics_loop(db, started_at, stop))\n' + watchdog_code
)

with open('pipeline_v2.py', 'w', encoding='utf-8') as f:
    f.write(code)
