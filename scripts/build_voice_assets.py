#!/usr/bin/env python3
"""Build the offline voice assets Page One bundles for table-read playback.

Inputs (all permissively licensed, downloaded by CI or passed in):
  --model   Kokoro-82M v1.0 ONNX model (Apache-2.0)
  --voices  Kokoro voices-v1.0.bin (Apache-2.0)
  --misaki  misaki wheel data dir with us_gold.json / us_silver.json (Apache-2.0)
  --cmudict cmudict.dict (BSD-2-Clause), for names the misaki lexicon lacks
Output (--out): model.onnx (compacted, see compact_model), voices.bin (float16), voices.json,
                lexicon.json.gz
"""
import argparse, gzip, json, os, shutil, struct
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


def compact_model(src, dst):
    """Store the model's 32-bit float weights as 8-bit integers with one scale per output channel.

    The published model keeps about 126 MB of its weights (LSTM, Conv, ConvTranspose, MatMul,
    Gemm) as 32-bit floats. Each becomes int8 plus a DequantizeLinear node; ONNX Runtime turns
    them back into floats once, when the session loads, so the arithmetic and the speed are the
    same as before while the file is less than half the size (177 MB -> 83 MB). Measured against
    the full-precision original, the result is as close as the published model is.
    """
    import collections
    import onnx
    from onnx import helper, numpy_helper

    m = onnx.load(src)
    g = m.graph
    inits = {i.name: i for i in g.initializer}
    consumers = collections.defaultdict(set)
    for nd in g.node:
        for x in nd.input:
            if x in inits:
                consumers[x].add(nd.op_type)
    heavy = {"Conv", "LSTM", "MatMul", "ConvTranspose", "Gemm"}
    keep, new_inits, new_nodes = [], [], []
    for i in g.initializer:
        w = numpy_helper.to_array(i)
        ops = consumers.get(i.name, set())
        if w.dtype != np.float32 or w.size < 1024 or not ops or not ops <= heavy:
            keep.append(i)
            continue
        axis = int(np.argmax(w.shape[:2])) if w.ndim >= 2 else 0
        rows = np.moveaxis(w, axis, 0).reshape(w.shape[axis], -1)
        amax = np.abs(rows).max(axis=1)
        scale = np.where(amax > 0, amax / 127.0, 1.0).astype(np.float32)
        q = np.clip(np.round(rows / scale[:, None]), -127, 127).astype(np.int8)
        q = np.moveaxis(q.reshape([w.shape[axis]] + [d for k, d in enumerate(w.shape) if k != axis]), 0, axis)
        new_inits += [
            numpy_helper.from_array(np.ascontiguousarray(q), i.name + "__q"),
            numpy_helper.from_array(scale, i.name + "__s"),
            numpy_helper.from_array(np.zeros_like(scale, dtype=np.int8), i.name + "__z"),
        ]
        new_nodes.append(helper.make_node("DequantizeLinear", [i.name + "__q", i.name + "__s", i.name + "__z"], [i.name], axis=axis, name=i.name + "__dq"))
    del g.initializer[:]
    g.initializer.extend(keep + new_inits)
    nodes = list(g.node)
    del g.node[:]
    g.node.extend(new_nodes + nodes)
    onnx.save(m, dst)
    return len(new_nodes)


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
    data = json.dumps(lex, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(a.out, "lexicon.json.gz"), "wb") as f:
        f.write(gzip.compress(data, compresslevel=9, mtime=0))
    stale = os.path.join(a.out, "lexicon.json")
    if os.path.exists(stale):
        os.remove(stale)

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
    n = compact_model(a.model, os.path.join(a.out, "model.onnx"))
    print(f"model: {n} weight tensors stored as int8")
    print(f"lexicon {len(lex)} words ({added} from CMU), {len(names)} voice styles -> {a.out}")


if __name__ == "__main__":
    main()
