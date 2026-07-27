#!/usr/bin/env python3
import json, os, re, subprocess, sys, tempfile, threading, time
import numpy as np
import redis as redis_mod

REDIS_ADDR = os.getenv('REDIS_ADDR', 'uncver-redis-stream:6379')
INPUT_STREAM = os.getenv('INPUT_STREAM', 'uncver:ai:router')
VOICE = os.getenv('VOICE', 'af_heart')

pipeline = None

def init_pipeline():
    global pipeline
    from kokoro import KPipeline as P
    pipeline = P(lang_code='a')
    print(f'[kokoro] Using voice: {VOICE}')

def listen():
    r = redis_mod.Redis.from_url(f'redis://{REDIS_ADDR}')
    last_id = '0'
    r.xadd(INPUT_STREAM, {'source': 'kokoro', 'type': 'kokoro:announce',
        'data': 'Kokoro ready — high-quality neural voice online.',
        'timestamp': str(int(time.time()))}, maxlen=1000, approximate=True)
    while True:
        try:
            results = r.xread({INPUT_STREAM: last_id}, count=10, block=0)
            if not results:
                time.sleep(0.5); continue
            for _, msgs in results:
                for mid, fields in msgs:
                    last_id = mid
                    mt = (fields.get(b'type') or b'').decode()
                    if mt == 'kokoro:speak':
                        text = extract(fields)
                        if text:
                            threading.Thread(target=speak, args=(text,), daemon=True).start()
        except Exception as e:
            print(f'[kokoro] Error: {e}', file=sys.stderr)
            time.sleep(2)

def extract(fields):
    for k in (b'data', b'text'):
        v = fields.get(k, b'').decode()
        if v and not v.startswith('{'):
            return clean(v)
    return ''

def clean(t):
    for s in ('\n{"call"', '\n{"tool"'):
        i = t.find(s)
        if i > 0: t = t[:i].strip()
    return t

lock = threading.Lock()

def speak(text):
    with lock:
        chunks = re.split(r'(?<=[.!?])\s+', text.strip())
        chunks = [c for c in chunks if c]
        if not chunks:
            return
        for i, chunk in enumerate(chunks):
            if i > 0:
                time.sleep(0.05)
            gen = pipeline(chunk, voice=VOICE, speed=1.0)
            audio, sr = None, 24000
            for _, _, a in gen:
                audio = a if audio is None else np.concatenate([audio, a])
            if audio is None:
                continue
            import soundfile as sf
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                wav = f.name
            try:
                sf.write(wav, audio, sr)
                subprocess.run(['aplay', '-q', wav], check=False)
            finally:
                try: os.unlink(wav)
                except: pass
        first = chunks[0][:50] + ('...' if len(chunks[0]) > 50 else '')
        print(f'[kokoro] Spoke: {first} ({len(chunks)} chunks)')

if __name__ == '__main__':
    print('[kokoro] Starting')
    init_pipeline()
    listen()
