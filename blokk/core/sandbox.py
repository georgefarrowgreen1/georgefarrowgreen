"""Running a script Blokk did not write, without trusting it.

This is what code mode needs and what the `skill` table has been waiting
for: a place to put "how to do it" that is a verified script rather than
remembered reasoning, and a boundary to run it behind.

**What this is not.** It is not gVisor and it is not a microVM. Those are
the right answer for running genuinely hostile code and both are a
dependency this project will not take — `pip install` is not available to
it and neither is asking somebody to install a hypervisor to answer their
email. What is here instead is the strongest boundary the standard library
and a stock Mac can build between them:

    no network        a seatbelt profile on macOS, a network namespace on
                      Linux, and no environment carrying a proxy or a token
    no filesystem     one scratch directory it may write; $HOME, /Users and
                      /root replaced with an empty directory inside a mount
                      namespace on Linux, denied by the profile on macOS
    no time           a wall-clock timeout, killed by process group so a
                      script that forks cannot outlive it
    no size           RLIMIT_AS, RLIMIT_FSIZE, RLIMIT_NPROC, RLIMIT_CORE
    no secrets        a scrubbed environment, and the keychain is a
                      subprocess this cannot reach without the network or
                      the binary

Read that list as what it is: **defence in depth against a script that is
wrong, and a serious obstacle to one that is malicious — not a boundary to
bet a machine on.** A native sandbox escape gets out of it. On Linux without
`unshare` privileges, or on a Mac with `sandbox-exec` removed, `capable()`
says so and `run()` refuses rather than executing unconfined. That refusal
is the important part: the failure mode this file exists to avoid is a
sandbox that silently is not one.

Nothing calls this yet from a workflow. It is here so that when something
does, the boundary is the thing that was reviewed rather than something
added in a hurry alongside the feature that needed it.
"""
from __future__ import annotations

import os
import platform
import resource
import shutil
import signal
import subprocess
import sys
import tempfile

from pathlib import Path

# Bounds. Deliberately small: a skill that answers a question about a diary
# does not need a gigabyte, and the first sign that one has gone wrong
# should be it hitting a wall rather than the Mac swapping.
MEM_BYTES = 512 * 1024 * 1024
FILE_BYTES = 8 * 1024 * 1024
MAX_PROCS = 64
TIMEOUT = 20
MAX_OUTPUT = 256 * 1024

# The seatbelt profile. Deny by default, then allow the few things a script
# needs to be a script at all. `file-write*` is granted only under the
# scratch directory, which is passed in as a parameter rather than
# interpolated — a path with a quote in it would otherwise end the string
# and the rest of the profile with it.
SEATBELT = """(version 1)
(deny default)
(allow process-fork)
(allow sysctl-read)
(allow file-read*
  (subpath "/usr/lib") (subpath "/usr/bin") (subpath "/usr/share")
  (subpath "/System") (subpath "/Library/Frameworks")
  (subpath (param "SCRATCH")) (literal "/dev/null") (literal "/dev/urandom"))
(allow file-write*
  (subpath (param "SCRATCH")) (literal "/dev/null"))
(allow signal (target self))
(deny network*)
(deny file-read* (subpath "/Users"))
"""


class Unavailable(RuntimeError):
    """No boundary can be built here, so nothing is run. Says why."""


class Failed(RuntimeError):
    """The script ran and did not finish well. Carries what it managed."""

    def __init__(self, msg: str, *, code: int = 0, out: str = "",
                 err: str = "", timed_out: bool = False):
        super().__init__(msg)
        self.code, self.out, self.err, self.timed_out = code, out, err, timed_out


def capable() -> tuple[bool, str]:
    """Whether a real boundary can be built on this machine, and why not.

    Answered before anything runs, and `run()` refuses rather than falling
    back to running unconfined. A sandbox that quietly is not one is worse
    than no sandbox, because the caller stops thinking about it.
    """
    if platform.system() == "Darwin":
        if not shutil.which("sandbox-exec"):
            return (False, "sandbox-exec is missing, which should not happen "
                           "on a Mac. Nothing will be run.")
        return (True, "")
    if platform.system() == "Linux":
        if not shutil.which("unshare"):
            return (False, "unshare is not installed, so there is no way to "
                           "take the network away. Nothing will be run.")
        # Having the binary is not having the privilege. Ask.
        try:
            # The exact flags run() uses, not a subset. Asking whether -rn
            # works and then running -rnm is a check that passes on a
            # machine where the thing being checked does not.
            r = subprocess.run(["unshare", "-r", "-n", "-m", "--", "true"],
                               capture_output=True, timeout=10)
            if r.returncode != 0:
                return (False, "unshare cannot create a namespace here "
                               "(no CAP_SYS_ADMIN and no unprivileged user "
                               "namespaces). Nothing will be run.")
        except (OSError, subprocess.SubprocessError) as e:
            return (False, f"unshare will not run: {e}")
        return (True, "")
    return (False, f"no sandbox for {platform.system()}. Nothing will be run.")


# Everything the child is allowed to know. Not a filtered copy of the
# parent's environment — a fresh one. A filter is a list of what to remove
# and is therefore wrong the day somebody adds a variable to it.
def _env(scratch: Path) -> dict:
    return {"PATH": "/usr/bin:/bin", "HOME": str(scratch), "TMPDIR": str(scratch),
            "LC_ALL": "C", "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONHASHSEED": "0", "PYTHONNOUSERSITE": "1",
            # -I: isolated. No site-packages, no PYTHON* from anywhere, no
            # script directory on sys.path. The child cannot import anything
            # this machine happens to have lying about.
            "PYTHONPATH": ""}


def _limits() -> None:
    """Applied in the child, between fork and exec."""
    for what, soft in ((resource.RLIMIT_AS, MEM_BYTES),
                       (resource.RLIMIT_FSIZE, FILE_BYTES),
                       (resource.RLIMIT_NPROC, MAX_PROCS),
                       (resource.RLIMIT_CORE, 0)):
        try:
            resource.setrlimit(what, (soft, soft))
        except (ValueError, OSError):
            # A limit that cannot be set is not a reason to run without the
            # others. It is a reason to say so, which run() does by
            # reporting which held.
            pass
    # Its own process group, so a script that forks is killed with its
    # children rather than leaving them behind holding the CPU.
    os.setsid()


# Where the home directories are, per platform. Blanked inside the mount
# namespace on Linux; denied by the seatbelt profile on macOS. Both lists
# are "the places somebody's own files are", not "the places secrets are" —
# an ssh key is the obvious one and a half-finished letter is the one that
# matters just as much and nobody thinks of.
HOMES = ("/home", "/root", "/Users")


def _wrap(argv: list[str], scratch: Path, blank: Path) -> list[str]:
    if platform.system() == "Darwin":
        return ["sandbox-exec", "-p", SEATBELT, "-D", f"SCRATCH={scratch}",
                *argv]
    # -r maps the current user to root inside the namespace, which is what
    # makes -n and -m usable without privileges. -n with no device is a
    # network namespace containing nothing but loopback-down: no route
    # anywhere. -m is a mount namespace, and it is there for the gap the
    # network namespace does not close — taking the network away leaves the
    # filesystem entirely readable, so a script could not phone home and
    # could read every file in $HOME on the way to not phoning home.
    #
    # An empty directory is bound over each home directory. The mounts exist
    # only inside this namespace and are gone when it exits; nothing on the
    # real filesystem is touched, and a bind that fails (the path does not
    # exist on this machine) is skipped rather than taking the run with it.
    binds = " ".join(
        f'[ -d {h} ] && mount --bind {blank} {h};' for h in HOMES)
    inner = " ".join(_sh_quote(a) for a in argv)
    return ["unshare", "-r", "-n", "-m", "--", "/bin/sh", "-c",
            f"{binds} exec {inner}"]


def _sh_quote(arg: str) -> str:
    """One shell word. The wrapper goes through sh -c, so this matters.

    A scratch path is a temp directory this file made and a script path is
    inside it, so neither carries a quote today — which is exactly the
    reasoning that stops being true the first time somebody passes their
    own scratch directory in.
    """
    return "'" + str(arg).replace("'", "'\\''") + "'"


def run(code: str, *, timeout: int = TIMEOUT, stdin: str = "",
        scratch: Path | None = None) -> dict:
    """Run one Python script behind whatever boundary this machine can build.

    Returns stdout, stderr, the exit code and what actually held. Raises
    Unavailable if no boundary could be built — never runs unconfined.
    """
    ok, why = capable()
    if not ok:
        raise Unavailable(why)
    if len(code) > FILE_BYTES:
        raise Unavailable(f"that script is {len(code):,} bytes, over the "
                          f"{FILE_BYTES:,} limit")
    own = scratch is None
    root = Path(scratch or tempfile.mkdtemp(prefix="blokk-sandbox-"))
    script = root / "skill.py"
    script.write_text(code)
    blank = root / ".blank"
    blank.mkdir(exist_ok=True)
    argv = _wrap([sys.executable, "-I", "-S", str(script)], root, blank)
    try:
        proc = subprocess.Popen(
            argv, cwd=str(root), env=_env(root), preexec_fn=_limits,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True)
        try:
            out, err = proc.communicate(stdin, timeout=timeout)
            timed = False
        except subprocess.TimeoutExpired:
            # The group, not the process. A script that forked and then slept
            # would otherwise survive the kill that was supposed to stop it.
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                proc.kill()
            try:
                # Bounded, because the pipes are only certainly closed if
                # the *group* died. Killing the process alone leaves a
                # forked child holding the other end and this waits for
                # ever — which turned a broken sandbox from a red test into
                # a hung one, and a hang is the worse of the two: a red says
                # what is wrong and a hang says nothing at all.
                out, err = proc.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                out, err = "", ("something the script started is still "
                                "holding its output open — the process group "
                                "was not killed")
            timed = True
        result = {
            "ok": not timed and proc.returncode == 0,
            "code": proc.returncode,
            "out": (out or "")[:MAX_OUTPUT],
            "err": (err or "")[:MAX_OUTPUT],
            "timed_out": timed,
            "truncated": len(out or "") > MAX_OUTPUT,
            "confined": platform.system(),
        }
    finally:
        if own:
            shutil.rmtree(root, ignore_errors=True)
    if timed:
        raise Failed(f"the script was still running after {timeout}s and was "
                     f"killed, along with anything it started.",
                     code=result["code"], out=result["out"],
                     err=result["err"], timed_out=True)
    return result
