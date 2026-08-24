"""
iCloud Calendar over CalDAV. Read-only.

Uses the same app-specific password as mail. Stdlib only — urllib plus
ElementTree, because pulling in a CalDAV library for two REPORT calls is not
worth the dependency on a machine that has to still boot in two years.

Every request goes through core/egress.py, like everything else that leaves.
It did not for a long time, for one honest reason: the gate only made GET and
POST and CalDAV is PROPFIND and REPORT. So this file called urlopen itself
and was the single exception to "there is one place anything leaves", which
is the kind of exception that is fine until the day somebody adds a second
one next to it. The gate makes those two methods now, and the workspace's
allowlist, the refusal to resolve to a private address, the redirect
re-check and logs/egress.log all apply here.

Setup:
  security add-generic-password -s blokk-cottages-cal -a you@icloud.com -w
  python3 connect.py add cottages caldav blokk-cottages-cal

The principal URL differs per Apple account, so it is discovered rather than
hardcoded. That discovery is the fiddly part; everything after it is a
date-range REPORT.
"""
from __future__ import annotations

import base64
import re
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as ET

from core.connectors.keychain import account, secret

HOST = "caldav.icloud.com"
BASE = f"https://{HOST}"
NS = {"d": "DAV:", "c": "urn:ietf:params:xml:ns:caldav"}


class IcloudCalendar:
    kind = "caldav"
    writes = False

    def __init__(self, keychain_ref: str, store=None, workspace_id: str = ""):
        # Handed the store and the workspace for the same reason the web and
        # weather connectors are: those two are what core/egress.py needs to
        # answer "may this workspace talk to that host".
        self.ref = keychain_ref
        self.store = store
        self.workspace_id = workspace_id
        self._home: str | None = None

    def _req(self, url: str, method: str, body: str, depth="1") -> str:
        # The gate check comes before the keychain read, on purpose. There is
        # no reason to take somebody's password out of the keychain for a
        # request that is about to be refused, and a secret that is never
        # fetched is a secret that cannot be dropped somewhere.
        if self.store is None:
            # No store means nobody can answer whether this workspace may
            # reach this host, and a connector that cannot be checked does
            # not get to make the request. This is the path a unit test or a
            # half-built registry takes, and it should fail loudly rather
            # than quietly bypassing the only gate there is.
            raise RuntimeError(
                "this calendar was built without a store, so its request "
                "cannot be checked against the workspace's allowlist")
        cred = base64.b64encode(
            f"{account(self.ref)}:{secret(self.ref)}".encode()).decode()
        headers = {"Authorization": f"Basic {cred}", "Depth": depth,
                   "Content-Type": "application/xml; charset=utf-8"}
        from core import egress
        out = egress.fetch(self.store, self.workspace_id, url,
                           data=body.encode(), headers=headers,
                           method=method, timeout=30)
        return out["text"]

    def _calendar_home(self) -> str:
        if self._home:
            return self._home
        x = self._req(f"{BASE}/", "PROPFIND",
                      '<d:propfind xmlns:d="DAV:"><d:prop>'
                      '<d:current-user-principal/></d:prop></d:propfind>', "0")
        href = ET.fromstring(x).find(".//d:current-user-principal/d:href", NS)
        if href is None:
            raise RuntimeError("could not discover the principal URL")
        x = self._req(f"{BASE}{href.text}", "PROPFIND",
                      '<d:propfind xmlns:d="DAV:" '
                      'xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop>'
                      '<c:calendar-home-set/></d:prop></d:propfind>', "0")
        home = ET.fromstring(x).find(".//c:calendar-home-set/d:href", NS)
        if home is None:
            raise RuntimeError("no calendar-home-set on the principal")
        self._home = home.text.rstrip("/")
        return self._home

    def check(self) -> dict:
        x = self._req(self._calendar_home() + "/", "PROPFIND",
                      '<d:propfind xmlns:d="DAV:"><d:prop>'
                      '<d:displayname/><d:resourcetype/></d:prop></d:propfind>')
        names = [e.text for e in ET.fromstring(x).findall(".//d:displayname", NS) if e.text]
        return {"ok": True, "home": self._home, "calendars": names}

    def events(self, days: int = 90, back: int = 0) -> list[dict]:
        """Occurrences in the window. `back` opens it behind today.

        Kept in step with ical.py on purpose: the two calendars must not
        disagree about what "in the window" means, or the same question
        answers differently depending on which one a workspace happens to
        be wired to.
        """
        start = (datetime.now(timezone.utc) - timedelta(days=max(0, back))
                 ).strftime("%Y%m%dT000000Z")
        end = (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y%m%dT000000Z")
        body = ('<c:calendar-query xmlns:d="DAV:" '
                'xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/>'
                '<c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR">'
                f'<c:comp-filter name="VEVENT"><c:time-range start="{start}" end="{end}"/>'
                '</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>')
        out = []
        for cal in self._collections():
            try:
                x = self._req(cal, "REPORT", body)
            except Exception:                                    # noqa: BLE001
                continue      # a shared calendar you cannot read is not fatal
            for data in ET.fromstring(x).findall(".//c:calendar-data", NS):
                ics = data.text or ""
                out.append({
                    "summary": _ics(ics, "SUMMARY"),
                    "start": _ics(ics, "DTSTART"),
                    "end": _ics(ics, "DTEND"),
                    "provenance": "self",
                })
        return out

    def _collections(self) -> list[str]:
        x = self._req(self._calendar_home() + "/", "PROPFIND",
                      '<d:propfind xmlns:d="DAV:"><d:prop>'
                      '<d:resourcetype/></d:prop></d:propfind>')
        hrefs = []
        for resp in ET.fromstring(x).findall(".//d:response", NS):
            if resp.find(".//c:calendar", NS) is not None:
                h = resp.find("d:href", NS)
                if h is not None:
                    hrefs.append(BASE + h.text)
        return hrefs


def _ics(blob: str, key: str) -> str:
    m = re.search(rf"^{key}[^:]*:(.+)$", blob, re.M)
    return m.group(1).strip() if m else ""
