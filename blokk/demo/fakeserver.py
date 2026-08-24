"""An OpenAI-compatible server that behaves — and misbehaves — like a real one.

`ServedModel` is the layer between Blokk and llama-server, mlx-lm, Ollama and
the rest. Every method on it was marked `# pragma: no cover` and meant it:
nothing in the suite had ever spoken HTTP to it. The error handling in there
is careful and specific — an IncompleteRead is not an OSError, a grammar can
leave content null, a proxy answers 200 with HTML — and all of it was written
from reasoning about what servers do, never once run.

So this is a real server on a real socket, and the misbehaviours are the ones
that actually happen:

    ok            a normal completion, with usage
    stream        SSE, in fragments, the way llama-server sends it
    plain         a *non*-SSE answer to a stream request, which plenty do
    cut           SSE that stops mid-object — the connection dying
    halt          SSE of whole chunks that stops with no [DONE] — every
                  chunk parses and the answer is still not finished
    garbled       one mangled chunk in the middle of a stream that then
                  ends properly — a proxy in the way
    nulls         content: null, which llama-server sends when a grammar
                  leaves nothing to say
    html          200 with an error page, which is a proxy in the way
    nochoices     200 with {} — a server that is not a model server
    nomessage     a choice with no message in it
    truncate      Content-Length that lies, so the read dies part way
    boom          500
    slow          answers after a delay, for timeouts

It is deliberately not a mock: mocks agree with whatever you believed when
you wrote them, which is the thing this file exists to stop.
"""
from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# What the last request carried, so a probe can assert that guided decoding
# and the model name really went out rather than being assembled and dropped.
SEEN: list[dict] = []


class _Handler(BaseHTTPRequestHandler):
    behaviour = "ok"
    reply = "The last week of August is free. The dog charge is £25."
    delay = 0.0

    def log_message(self, *a):                     # noqa: A003 - quiet
        pass

    def _json(self, code: int, obj) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):                             # noqa: N802
        # Half the fixtures here exist to make the client give up mid-answer,
        # and a client giving up mid-answer is a BrokenPipeError on this
        # side. Swallowed rather than left to print a traceback into a green
        # suite: output that is noisy when everything is fine is output
        # people stop reading.
        try:
            self._post()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _post(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n)
        try:
            req = json.loads(raw or b"{}")
        except ValueError:
            req = {}
        SEEN.append(req)
        how = type(self).behaviour
        if type(self).delay:
            time.sleep(type(self).delay)

        if how == "boom":
            return self._json(500, {"error": "out of memory"})
        if how == "html":
            body = b"<html><body>502 Bad Gateway</body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        if how == "nochoices":
            return self._json(200, {})
        if how == "nomessage":
            return self._json(200, {"choices": [{"finish_reason": "stop"}]})
        if how == "nulls":
            return self._json(200, {"choices": [{"message": {
                "role": "assistant", "content": None}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 0}})
        if how == "truncate":
            # Content-Length says more than is sent, then the socket closes.
            # This is what a server dying mid-answer looks like from here,
            # and it arrives as IncompleteRead rather than as a socket error.
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "4096")
            self.end_headers()
            self.wfile.write(b'{"choices": [{"message": {"content": "half')
            self.wfile.flush()
            return
        if how in ("stream", "cut", "halt", "garbled") and req.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            words = type(self).reply.split(" ")
            for i, w in enumerate(words):
                if how == "halt" and i == 3:
                    # Complete chunks, then the socket closes with no
                    # [DONE] and no finish_reason. Every chunk parses, so
                    # the only thing that says the answer is unfinished is
                    # that nobody said it was finished.
                    return
                if how == "garbled" and i == 3:
                    # One mangled chunk in the middle of an otherwise whole
                    # stream — a proxy in the way. Skipping it and carrying
                    # on gives a short answer that looks complete, which is
                    # the outcome this codebase ranks worst.
                    self.wfile.write(b'data: {"choices":[{"delta":{"cont\n\n')
                    self.wfile.flush()
                    continue
                if how == "cut" and i == 3:
                    # Half an object, then nothing. A chat box that renders
                    # this as a finished answer is the silent-truncation
                    # failure invariant 6 is about.
                    self.wfile.write(b'data: {"choices":[{"delta":{"cont')
                    self.wfile.flush()
                    return
                chunk = {"choices": [{"delta": {
                    "content": (" " if i else "") + w}}]}
                self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
                self.wfile.flush()
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            return
        # "plain": a stream was asked for and the whole thing comes back at
        # once, with a JSON content type. Plenty of servers do this and a
        # chat box that breaks on them is worse than one that is not
        # incremental.
        text = type(self).reply
        if req.get("response_format", {}).get("type") == "json_schema":
            # Guided decoding: answer in the shape that was asked for, the
            # way a server with a grammar attached would.
            text = json.dumps({"do": "reply", "say": type(self).reply})
        return self._json(200, {
            "choices": [{"message": {"role": "assistant", "content": text}}],
            "usage": {"prompt_tokens": 42, "completion_tokens": 9},
            "model": req.get("model")})


class Fake:
    """Start one, set `behaviour`, point a ServedModel at `.endpoint`."""

    def __init__(self, behaviour: str = "ok", reply: str | None = None,
                 delay: float = 0.0):
        _Handler.behaviour = behaviour
        _Handler.delay = delay
        if reply is not None:
            _Handler.reply = reply
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.port = self.httpd.server_address[1]
        self.endpoint = f"http://127.0.0.1:{self.port}/v1"
        self.thread = threading.Thread(target=self.httpd.serve_forever,
                                       daemon=True)
        self.thread.start()

    def behaving(self, how: str, reply: str | None = None,
                 delay: float = 0.0) -> None:
        _Handler.behaviour = how
        _Handler.delay = delay
        if reply is not None:
            _Handler.reply = reply

    def close(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()
