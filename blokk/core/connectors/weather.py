"""Weather, through the gate. Read-only, no key, no account.

Open-Meteo answers a forecast for a point on earth as JSON, with no API key,
no sign-up and no attribution string to carry around. That matters more than
it sounds: every other option here wanted an account, and an account is a
credential to store, rotate and leak.

What leaves the machine is a latitude and a longitude, rounded, and nothing
else. No mail, no calendar, no identifier. That is the whole request.

Fields, never prose. The connector returns a day as numbers and a short
label — 'rain', 'overcast' — and lets whatever reads it do the writing. Hand
a small model a paragraph of forecast copy and it will paraphrase it badly;
hand it `{"rain_chance": 80, "wind_kph": 34}` and it can say something true.
"""
from __future__ import annotations

import json
from urllib.parse import quote

from core import egress

API = "https://api.open-meteo.com/v1/forecast"
GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
HOSTS = ("api.open-meteo.com", "geocoding-api.open-meteo.com")

# WMO 4677, collapsed to the words a person would use. The full table has
# twenty-eight entries and distinguishes "slight" from "moderate" drizzle,
# which is not a distinction anyone reschedules a bike ride over.
CODES = {
    0: "clear", 1: "mostly clear", 2: "some cloud", 3: "overcast",
    45: "fog", 48: "freezing fog",
    51: "drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "showers", 81: "showers", 82: "heavy showers",
    85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorms", 96: "thunderstorms with hail",
    99: "thunderstorms with hail",
}


def describe(code) -> str:
    try:
        return CODES.get(int(code), f"weather code {code}")
    except (TypeError, ValueError):
        return "unknown"


class Weather:
    """Reads a forecast for one place. There is no method here that writes."""

    kind = "weather"
    writes = False

    def __init__(self, ref: str = "", store=None, workspace_id: str = ""):
        # `ref` is where you are: "54.97,-1.61", or a place name to look up
        # once. Not a keychain reference — this source has no credential, and
        # a field that means two things is a field somebody will fill in
        # wrongly, so connect.py says so in its usage line.
        self.ref = (ref or "").strip()
        self.store = store
        self.workspace_id = workspace_id

    # ------------------------------------------------------------- location
    def _cached(self) -> dict | None:
        if self.store is None:
            return None
        row = self.store.one("SELECT value FROM setting WHERE key=?",
                             f"place:{self.ref.lower()}")
        if not row:
            return None
        try:
            return json.loads(row["value"])
        except (ValueError, TypeError):
            return None

    def _remember(self, place: dict) -> None:
        if self.store is None:
            return
        self.store.x("INSERT INTO setting(key,value) VALUES(?,?) "
                     "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                     f"place:{self.ref.lower()}", json.dumps(place))

    def where(self) -> dict:
        """The point this connector asks about, and how it got there.

        A pair of numbers is used as given. A name is looked up once and the
        answer kept, so a place name does not cost a request every night.
        """
        if not self.ref:
            raise egress.Refused(
                "no location set for this workspace. Give it one — a town, "
                "or coordinates:  "
                "connect.py add <workspace> weather \"Newcastle upon Tyne\"")
        if "," in self.ref:
            lat, _, lon = self.ref.partition(",")
            try:
                return {"lat": round(float(lat), 3), "lon": round(float(lon), 3),
                        "place": self.ref, "source": "as given"}
            except ValueError:
                pass                       # not coordinates; look it up
        got = self._cached()
        if got:
            return {**got, "source": "looked up once, remembered"}
        url = f"{GEOCODE}?name={quote(self.ref)}&count=1&language=en&format=json"
        d = egress.fetch_json(self.store, self.workspace_id, url)
        hits = d.get("results") or []
        if not hits:
            # Open-Meteo's geocoder is a gazetteer of place names — it does
            # not know postcodes, which is the first thing a British user
            # tries. Say that, rather than "not found" over a valid postcode.
            raise egress.Refused(
                f"nowhere called {self.ref!r} was found. This looks up place "
                f"names, not postcodes — try the town, or coordinates like "
                f"54.97,-1.61 (right-click a spot in Maps).")
        h = hits[0]
        place = {"lat": round(float(h["latitude"]), 3),
                 "lon": round(float(h["longitude"]), 3),
                 "place": ", ".join(x for x in (h.get("name"), h.get("admin1"),
                                                h.get("country")) if x)}
        self._remember(place)
        return {**place, "source": "looked up"}

    # -------------------------------------------------------------- reading
    def check(self) -> dict:
        """Where it thinks you are, and whether it can reach the forecast."""
        try:
            here = self.where()
        except egress.Refused as e:
            return {"ok": False, "detail": str(e)}
        try:
            days = self.forecast(days=1)
        except egress.Refused as e:
            return {"ok": False, "place": here["place"], "detail": str(e)}
        return {"ok": True, "place": here["place"],
                "at": f"{here['lat']},{here['lon']}",
                "found_by": here["source"],
                "today": days[0]["summary"] if days else "no days returned",
                "sends": "a latitude and a longitude, and nothing else"}

    def forecast(self, days: int = 3) -> list[dict]:
        """One day per row: numbers, a short label, and a sentence's worth."""
        days = max(1, min(int(days or 3), 16))     # the API's own ceiling
        here = self.where()
        url = (f"{API}?latitude={here['lat']}&longitude={here['lon']}"
               f"&daily=weather_code,temperature_2m_max,temperature_2m_min,"
               f"precipitation_probability_max,wind_speed_10m_max"
               f"&timezone=auto&forecast_days={days}")
        d = egress.fetch_json(self.store, self.workspace_id, url)
        daily = d.get("daily") or {}
        out = []
        for i, day in enumerate(daily.get("time") or []):
            def at(key, default=None):
                col = daily.get(key) or []
                return col[i] if i < len(col) else default
            label = describe(at("weather_code"))
            hi, lo = at("temperature_2m_max"), at("temperature_2m_min")
            rain, wind = at("precipitation_probability_max"), at("wind_speed_10m_max")
            out.append({
                "date": day, "summary": _sentence(label, hi, lo, rain, wind),
                "label": label, "high_c": hi, "low_c": lo,
                "rain_chance": rain, "wind_kph": wind,
                # It came from outside. quarantine_read decides what a model
                # may see of it; this only labels it. There is no free text
                # in here to hide an instruction in, which is the point of
                # returning fields.
                "provenance": "external",
            })
        return out

    def dry_windows(self, days: int = 7, rain_under: int = 25,
                    wind_under: int = 40) -> list[dict]:
        """Days you could be outside. The question a forecast is usually for.

        Thresholds, not judgement: under a quarter chance of rain and under
        40 km/h of wind. Anything cleverer belongs where it can be argued
        with, not buried in a connector.
        """
        out = []
        for d in self.forecast(days=days):
            rain = d["rain_chance"] if d["rain_chance"] is not None else 100
            wind = d["wind_kph"] if d["wind_kph"] is not None else 0
            if rain <= rain_under and wind <= wind_under:
                out.append({**d, "why": f"{rain}% rain, {round(wind)} km/h wind"})
        return out


def _sentence(label: str, hi, lo, rain, wind) -> str:
    bits = [label]
    if hi is not None and lo is not None:
        bits.append(f"{round(lo)}–{round(hi)}°C")
    elif hi is not None:
        bits.append(f"up to {round(hi)}°C")
    if rain is not None:
        bits.append(f"{rain}% rain")
    if wind is not None and wind >= 30:
        bits.append(f"windy, {round(wind)} km/h")
    return ", ".join(bits)
