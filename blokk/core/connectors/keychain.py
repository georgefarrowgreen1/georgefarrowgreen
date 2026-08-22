"""
macOS Keychain.

Passwords live here, not in the database, not in a .env, not in the repo.
The database stores only the service name, so a leaked blokk.db leaks
metadata rather than access.

    security add-generic-password -s blokk-cottages-mail -a you@icloud.com -w
    (it prompts; paste the app-specific password)

First read prompts for Keychain access once and then remembers.
"""
from __future__ import annotations

import subprocess


class KeychainError(RuntimeError):
    pass


def secret(ref: str) -> str:
    """Return the password stored under service name `ref`."""
    try:
        out = subprocess.run(
            ["security", "find-generic-password", "-s", ref, "-w"],
            capture_output=True, text=True, timeout=20)
    except FileNotFoundError:
        raise KeychainError("`security` not found — this path is macOS only")
    if out.returncode != 0:
        raise KeychainError(
            f"nothing in the keychain under '{ref}'. Add it with:\n"
            f"  security add-generic-password -s {ref} -a <account> -w")
    return out.stdout.strip()


def account(ref: str) -> str:
    """The account (usually the address) stored alongside the password."""
    out = subprocess.run(["security", "find-generic-password", "-s", ref],
                         capture_output=True, text=True, timeout=20)
    for line in out.stderr.splitlines() + out.stdout.splitlines():
        if '"acct"<blob>=' in line:
            return line.split('="')[-1].rstrip('"')
    raise KeychainError(f"no account recorded for '{ref}'")


def put(ref: str, acct: str, password: str) -> None:
    subprocess.run(["security", "add-generic-password", "-U",
                    "-s", ref, "-a", acct, "-w", password],
                   capture_output=True, text=True, timeout=20)
