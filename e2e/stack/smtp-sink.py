# Minimal SMTP server that stores every message the Auth server sends (staff
# invites, password resets) as a file, so tests can follow the real links.
import asyncio, os, sys, time
from aiosmtpd.controller import Controller

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

class Handler:
    async def handle_DATA(self, server, session, envelope):
        name = f"{time.time_ns()}_{envelope.rcpt_tos[0]}.eml"
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(envelope.content)
        return '250 OK'

controller = Controller(Handler(), hostname='127.0.0.1', port=int(sys.argv[2]))
controller.start()
asyncio.get_event_loop().run_forever()
