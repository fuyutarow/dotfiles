"""Resident cross-encoder for `repo-retrieve definition` — keeps the reranker on the GPU so a query
pays ~1-2 s, not a 5 s model load.

Run under ccc's OWN interpreter (it already carries torch + transformers + the HF cache), started
on demand by systemd socket activation (cocoindex/repo-retrieve-rerank.{socket,service}.wsl):
systemd owns the listening socket and passes it as fd 3; this process exits after IDLE_SECONDS
without a request, which hands the VRAM back, and the next request starts it again.
Run by hand (tests, macOS): `python rerank_server.py --socket <path>` binds the path itself.

Protocol: one JSON line {"query": str, "docs": [str, ...]} in, one JSON line out:
  {"scores": [float, ...]}   — log-odds of "this definition implements the query" (yes - no)
  {"error": str}
Why log-odds, not probability: measured 2026-10-01, the probabilities of the top candidates all
saturate at 0.99x and stop separating; the logits keep a usable gap (ledger in README).

Model: Qwen/Qwen3-Reranker-0.6B (Apache-2.0, multilingual incl. Japanese, trained on code). On the
firedancer FireOps 24-query set it moved the correct definition into the top 3 for 21/24, from 16/24
with embeddings alone (README, "Measurements").
"""

import json
import os
import socket
import sys
import threading
import time

MODEL = os.environ.get("REPO_RETRIEVE_RERANK_MODEL", "Qwen/Qwen3-Reranker-0.6B")
IDLE_SECONDS = int(os.environ.get("REPO_RETRIEVE_RERANK_IDLE", "1800"))
MAX_TOKENS = 384
BATCH = 64
MAX_REQUEST_BYTES = 4_000_000
INSTRUCT = (
    "Given a description of what a developer needs (in English or Japanese), judge whether this "
    "code definition already implements that functionality"
)
PREFIX = (
    "<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and "
    'the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n'
    "<|im_start|>user\n"
)
SUFFIX = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"


class Reranker:
    def __init__(self) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if self.device == "cuda" else torch.float32
        self.tok = AutoTokenizer.from_pretrained(MODEL, padding_side="left")
        self.model = (
            AutoModelForCausalLM.from_pretrained(MODEL, dtype=dtype, attn_implementation="sdpa")
            .to(self.device)
            .eval()
        )
        self.yes = self.tok.convert_tokens_to_ids("yes")
        self.no = self.tok.convert_tokens_to_ids("no")
        self.lock = threading.Lock()

    def score(self, query: str, docs: list[str]) -> list[float]:
        pairs = [f"{PREFIX}<Instruct>: {INSTRUCT}\n<Query>: {query}\n<Document>: {d}{SUFFIX}" for d in docs]
        out: list[float] = []
        with self.lock, self.torch.no_grad():
            for i in range(0, len(pairs), BATCH):
                enc = self.tok(
                    pairs[i : i + BATCH], padding=True, truncation=True, max_length=MAX_TOKENS, return_tensors="pt"
                ).to(self.device)
                logits = self.model(**enc).logits[:, -1, :]
                out += (logits[:, self.yes] - logits[:, self.no]).float().tolist()
        return out


def serve(listener: socket.socket) -> None:
    reranker = Reranker()
    last = [time.monotonic()]
    listener.settimeout(5.0)

    def handle(conn: socket.socket) -> None:
        with conn:
            buf = b""
            while b"\n" not in buf and len(buf) < MAX_REQUEST_BYTES:
                chunk = conn.recv(65536)
                if not chunk:
                    break
                buf += chunk
            try:
                req = json.loads(buf.split(b"\n", 1)[0])
                query, docs = req["query"], req["docs"]
                if not isinstance(query, str) or not isinstance(docs, list) or not all(isinstance(d, str) for d in docs):
                    raise ValueError("query must be a string and docs a list of strings")
                reply = {"scores": reranker.score(query, docs)}
            except Exception as e:  # a bad request answers with its reason; the server keeps serving
                reply = {"error": f"{type(e).__name__}: {e}"}
            conn.sendall((json.dumps(reply) + "\n").encode())
            last[0] = time.monotonic()

    while time.monotonic() - last[0] < IDLE_SECONDS:
        try:
            conn, _ = listener.accept()
        except TimeoutError:
            continue
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


def main() -> None:
    if len(sys.argv) == 3 and sys.argv[1] == "--socket":
        path = sys.argv[2]
        if os.path.exists(path):
            os.unlink(path)
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(path)
        os.chmod(path, 0o600)
        listener.listen(16)
    elif os.environ.get("LISTEN_FDS") == "1":
        listener = socket.socket(fileno=3)  # systemd socket activation
    else:
        sys.exit("usage: rerank_server.py --socket <path>   (or start via systemd socket activation)")
    serve(listener)


main()
