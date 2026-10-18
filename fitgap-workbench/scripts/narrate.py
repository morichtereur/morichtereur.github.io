#!/usr/bin/env python3
"""Generate the voice-over for the walkthrough video with Kokoro-82M (Apache-2.0), fully offline.

Usage:
  python scripts/narrate.py <model-dir> <out-dir> [--voice af_heart] [--speed 1.0]

<model-dir> must contain model_q8.onnx (Kokoro-82M q8, e.g. joined from the npm package kokoro-q8-shards) and
voices.npz (voice style vectors, e.g. built from the voices/*.bin files of the npm package kokoro-js).
Needs: pip install kokoro-onnx soundfile.  Writes <out-dir>/<id>.wav and <out-dir>/manifest.json
({ id: { file, duration } }), which scripts/walkthrough.mjs reads via NARRATION=<out-dir>/manifest.json.
"""
import argparse, json, os, sys, time

here = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('model_dir'); ap.add_argument('out_dir')
ap.add_argument('--voice'); ap.add_argument('--speed', type=float)
args = ap.parse_args()

import soundfile as sf
import espeakng_loader
from kokoro_onnx import Kokoro, EspeakConfig

spec = json.load(open(os.path.join(here, 'narration.json'), encoding='utf-8'))
voice = args.voice or spec.get('voice', 'af_heart'); speed = args.speed or spec.get('speed', 1.0)
lang = 'en-gb' if voice.startswith('b') else spec.get('lang', 'en-us')
os.makedirs(args.out_dir, exist_ok=True)
k = Kokoro(os.path.join(args.model_dir, 'model_q8.onnx'), os.path.join(args.model_dir, 'voices.npz'),
           espeak_config=EspeakConfig(lib_path=espeakng_loader.get_library_path(), data_path=espeakng_loader.get_data_path()))
manifest = {}; t0 = time.time()
for line in spec['lines']:
    samples, sr = k.create(line['text'], voice=voice, speed=speed, lang=lang)
    path = os.path.join(args.out_dir, f"{line['id']}.wav"); sf.write(path, samples, sr)
    manifest[line['id']] = {'file': path, 'duration': round(len(samples) / sr, 3)}
    print(f"{line['id']:>4}  {len(samples) / sr:5.1f}s  {line['text'][:70]}", flush=True)
json.dump({'voice': voice, 'speed': speed, 'order': [l['id'] for l in spec['lines']], 'clips': manifest},
          open(os.path.join(args.out_dir, 'manifest.json'), 'w'), indent=1)
total = sum(c['duration'] for c in manifest.values())
print(f"{len(manifest)} clips, {total:.0f}s of speech, generated in {time.time() - t0:.0f}s with voice {voice}")
