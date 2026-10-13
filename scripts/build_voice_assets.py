#!/usr/bin/env python3
"""Build the offline voice assets Page One bundles for table-read playback.

Inputs (all permissively licensed, downloaded by CI or passed in):
  --model   Kokoro-82M v1.0 ONNX model (Apache-2.0)
  --voices  Kokoro voices-v1.0.bin (Apache-2.0)
  --misaki  misaki wheel data dir with us_gold.json / us_silver.json (Apache-2.0)
  --cmudict cmudict.dict (BSD-2-Clause), for names the misaki lexicon lacks
Output (--out): model.onnx, voices.bin (float16), voices.json, lexicon.json
"""
import argparse, json, os, shutil, struct
import numpy as np

# Voices offered in Page One: (id, label, group, kokoro voice, pitch factor for stylised child voices)
VOICES = [
    ("narrator", "Narrator (warm)", "narrator", "af_heart", 1.0),
    ("narrator_m", "Narrator (deep)", "narrator", "bm_george", 1.0),
    ("f_heart", "Heart (woman, US)", "female", "af_heart", 1.0),
    ("f_bella", "Bella (woman, US)", "female", "af_bella", 1.0),
    ("f_nicole", "Nicole (woman, soft)", "female", "af_nicole", 1.0),
    ("f_aoede", "Aoede (woman, US)", "female", "af_aoede", 1.0),
    ("f_kore", "Kore (woman, US)", "female", "af_kore", 1.0),
    ("f_sarah", "Sarah (woman, US)", "female", "af_sarah", 1.0),
    ("f_emma", "Emma (woman, British)", "female", "bf_emma", 1.0),
    ("f_isabella", "Isabella (woman, British)", "female", "bf_isabella", 1.0),
    ("m_michael", "Michael (man, US)", "male", "am_michael", 1.0),
    ("m_fenrir", "Fenrir (man, US)", "male", "am_fenrir", 1.0),
    ("m_puck", "Puck (man, US)", "male", "am_puck", 1.0),
    ("m_adam", "Adam (man, US)", "male", "am_adam", 1.0),
    ("m_george", "George (man, British)", "male", "bm_george", 1.0),
    ("m_fable", "Fable (man, British)", "male", "bm_fable", 1.0),
    ("m_lewis", "Lewis (man, British)", "male", "bm_lewis", 1.0),
    ("c_girl", "Girl (child)", "child", "af_nicole", 1.24),
    ("c_boy", "Boy (child)", "child", "am_puck", 1.30),
]

# ARPAbet (CMU) to the phoneme alphabet Kokoro was trained on (misaki, US English)
VOW = {"AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "W", "AY": "I", "EH": "ɛ", "ER": "ɜɹ", "EY": "A",
       "IH": "ɪ", "IY": "i", "OW": "O", "OY": "Y", "UH": "ʊ", "UW": "u"}
CON = {"B": "b", "CH": "ʧ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "ʤ", "K": "k", "L": "l",
       "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "ɹ", "S": "s", "SH": "ʃ", "T": "t", "TH": "θ", "V": "v",
       "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ"}


def arpabet(phones):
    out = []
    for ph in phones:
        base, stress = ph.rstrip("012"), ph[len(ph.rstrip("012")):]
        if base in VOW:
            v = VOW[base]
            if base == "AH" and stress == "0":
                v = "ə"
            if base == "ER" and stress == "0":
                v = "əɹ"
            mark = "ˈ" if stress == "1" else "ˌ" if stress == "2" else ""
            out.append(mark + v)
        elif base in CON:
            out.append(CON[base])
    return "".join(out)


def pick(v):
    return v.get("DEFAULT") or next(iter(v.values())) if isinstance(v, dict) else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--voices", required=True)
    ap.add_argument("--misaki", required=True)
    ap.add_argument("--cmudict", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    # lexicon: misaki gold, then silver, then CMU for anything still missing (mostly names)
    lex = {}
    for name in ("us_gold.json", "us_silver.json"):
        for k, v in json.load(open(os.path.join(a.misaki, name), encoding="utf-8")).items():
            v = pick(v)
            if v and k not in lex:
                lex[k] = v
    lower = {k.lower() for k in lex}
    added = 0
    for line in open(a.cmudict, encoding="utf-8", errors="ignore"):
        parts = line.split("#")[0].split()
        if len(parts) < 2 or "(" in parts[0]:
            continue
        w = parts[0].lower()
        if w in lower or not w.replace("'", "").isalpha():
            continue
        lex[w] = arpabet(parts[1:])
        lower.add(w)
        added += 1
    with open(os.path.join(a.out, "lexicon.json"), "w", encoding="utf-8") as f:
        json.dump(lex, f, ensure_ascii=False, separators=(",", ":"))

    # voices: the selected styles as float16, one block of 510x256 per Kokoro voice
    src = np.load(a.voices)
    names = sorted({v[3] for v in VOICES})
    with open(os.path.join(a.out, "voices.bin"), "wb") as f:
        for n in names:
            f.write(src[n].reshape(510, 256).astype(np.float16).tobytes())
    meta = {
        "rows": 510, "dim": 256, "order": names,
        "voices": [{"id": i, "label": l, "group": g, "style": s, "pitch": p} for i, l, g, s, p in VOICES],
    }
    json.dump(meta, open(os.path.join(a.out, "voices.json"), "w"), indent=1)
    shutil.copyfile(a.model, os.path.join(a.out, "model.onnx"))
    print(f"lexicon {len(lex)} words ({added} from CMU), {len(names)} voice styles -> {a.out}")


if __name__ == "__main__":
    main()
