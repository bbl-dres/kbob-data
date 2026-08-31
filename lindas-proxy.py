#!/usr/bin/env python3
"""
Lokaler Proxy fuer den LINDAS-SPARQL-Endpunkt.

Serviert index.html und leitet Anfragen an /query an den echten
Endpunkt weiter. Weil Frontend und Proxy dieselbe Origin haben, entfaellt
CORS vollstaendig.

Nur Standardbibliothek, keine Installation noetig.

    python3 lindas-proxy.py                 # startet auf http://localhost:8765
    python3 lindas-proxy.py --check         # Erreichbarkeit testen, ohne Server
    python3 lindas-proxy.py --endpoint https://lindas.admin.ch/query
    python3 lindas-proxy.py --user me       # Passwort wird abgefragt
"""

import argparse
import base64
import getpass
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_ENDPOINT = "https://int.lindas.admin.ch/query"
DEFAULT_GRAPH = "https://lindas.admin.ch/fobl/kbob/dd-fm"
HERE = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(HERE, "index.html")

CFG = {"endpoint": DEFAULT_ENDPOINT, "auth": None, "timeout": 300}


def upstream(query, accept="application/sparql-results+json"):
    """Schickt eine Query an den echten Endpunkt. Gibt (status, headers, body) zurueck."""
    body = urllib.parse.urlencode({"query": query}).encode("utf-8")
    req = urllib.request.Request(CFG["endpoint"], data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
    req.add_header("Accept", accept)
    req.add_header("User-Agent", "kbob-data/1.0.0")
    if CFG["auth"]:
        req.add_header("Authorization", "Basic " + CFG["auth"])

    try:
        with urllib.request.urlopen(req, timeout=CFG["timeout"]) as resp:
            return resp.status, resp.headers.get("Content-Type", "text/plain"), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", "text/plain"), e.read()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))

    # Bewusst KEINE Access-Control-Allow-Origin-Header: der Proxy liefert das
    # Frontend selbst aus, alles ist same-origin. Ein "*" wuerde jeder im
    # Browser offenen Website erlauben, ueber localhost mit den hinterlegten
    # Zugangsdaten Abfragen an den Endpunkt zu schicken.
    def _send(self, status, ctype, payload):
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "POST, GET, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        if path in ("/", "/index.html"):
            if not os.path.exists(FRONTEND):
                self._send(500, "text/plain; charset=utf-8",
                           "index.html liegt nicht neben diesem Skript.\n"
                           "Erwartet: " + FRONTEND)
                return
            with open(FRONTEND, "rb") as fh:
                html = fh.read()
            # Endpunkt im Formular auf den Proxy vorbelegen
            html = html.replace(
                b'value="https://int.lindas.admin.ch/query"',
                b'value="/query"')
            self._send(200, "text/html; charset=utf-8", html)
            return

        # Statische Dateien aus css/ und js/
        if path.startswith("/css/") or path.startswith("/js/"):
            self._statisch(path)
            return

        if path == "/health":
            started = time.time()
            status, ctype, body = upstream("SELECT * WHERE { ?s ?p ?o } LIMIT 1")
            self._send(200, "application/json; charset=utf-8", json.dumps({
                "endpoint": CFG["endpoint"],
                "status": status,
                "dauer_s": round(time.time() - started, 2),
                "auszug": body[:400].decode("utf-8", "replace"),
            }, ensure_ascii=False, indent=2))
            return

        self._send(404, "text/plain; charset=utf-8", "Nicht gefunden")

    def _statisch(self, path):
        """Liefert eine Datei aus css/ oder js/ neben diesem Skript."""
        ziel = os.path.normpath(os.path.join(HERE, path.lstrip("/")))
        # Nur genau diese beiden Ordner, damit ".." nicht heraus fuehrt
        erlaubt = [os.path.join(HERE, "css") + os.sep, os.path.join(HERE, "js") + os.sep]
        if not any(ziel.startswith(o) for o in erlaubt) or not os.path.isfile(ziel):
            self._send(404, "text/plain; charset=utf-8", "Nicht gefunden")
            return
        typ = "text/css" if ziel.endswith(".css") else "application/javascript"
        with open(ziel, "rb") as fh:
            self._send(200, typ + "; charset=utf-8", fh.read())

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/query":
            self._send(404, "text/plain; charset=utf-8", "Nur /query wird weitergeleitet")
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8")

        ctype_in = (self.headers.get("Content-Type") or "").lower()
        if "application/sparql-query" in ctype_in:
            query = raw
        else:
            parsed = urllib.parse.parse_qs(raw)
            query = (parsed.get("query") or [""])[0]

        if not query.strip():
            self._send(400, "text/plain; charset=utf-8", "Leere Query")
            return

        accept = self.headers.get("Accept") or "application/sparql-results+json"
        try:
            status, ctype, body = upstream(query, accept)
        except (urllib.error.URLError, socket.timeout) as e:
            reason = getattr(e, "reason", e)
            self._send(502, "text/plain; charset=utf-8",
                       "Der Endpunkt ist von diesem Rechner aus nicht erreichbar. "
                       "Moegliche Ursachen: VPN, Firmen-Proxy oder ein Endpunkt, der "
                       "nicht oeffentlich zugaenglich ist (die Integrationsumgebung "
                       "von LINDAS kann Anmeldung verlangen).\n"
                       "Technischer Hintergrund: %s: %s" % (type(e).__name__, reason))
            return

        self._send(status, ctype, body)


def check():
    print("Endpunkt: %s" % CFG["endpoint"])
    host = urllib.parse.urlparse(CFG["endpoint"]).hostname
    try:
        addr = socket.gethostbyname(host)
        print("DNS:      %s -> %s" % (host, addr))
    except socket.gaierror as e:
        print("DNS:      fehlgeschlagen (%s)" % e)
        print("\nDer Hostname loest nicht auf. Kein CORS-Problem, sondern Netzwerk oder VPN.")
        return 1

    started = time.time()
    try:
        status, ctype, body = upstream("SELECT * WHERE { ?s ?p ?o } LIMIT 1")
    except (urllib.error.URLError, socket.timeout) as e:
        print("Verbindung fehlgeschlagen: %s" % getattr(e, "reason", e))
        print("\nDer Endpunkt ist von hier aus nicht erreichbar. Ein lokaler Proxy")
        print("aendert daran nichts — das Problem liegt im Netzwerkpfad (VPN,")
        print("Firmen-Proxy oder ein nicht oeffentlich zugaenglicher Endpunkt).")
        return 1

    print("Status:   HTTP %d in %.2fs" % (status, time.time() - started))
    print("Antwort:  %s" % body[:300].decode("utf-8", "replace").replace("\n", " "))

    if status == 200:
        print("\nDer Endpunkt antwortet. Wenn der Browser trotzdem scheitert, war es CORS —")
        print("dann loest der Proxy das Problem. Ohne --check erneut starten.")
        return 0
    if status in (401, 403):
        print("\nDer Endpunkt verlangt eine Anmeldung. Mit --user erneut versuchen")
        print("(das Passwort wird abgefragt); die Integrationsumgebung ist haeufig")
        print("nicht offen zugaenglich.")
        return 1
    print("\nUnerwarteter Status. Der Antworttext oben sagt meist, woran es liegt.")
    return 1


def main():
    ap = argparse.ArgumentParser(description="Lokaler Proxy fuer den LINDAS-SPARQL-Endpunkt")
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--timeout", type=int, default=300, help="Sekunden bis Abbruch")
    ap.add_argument("--user")
    ap.add_argument("--password",
                    help="besser weglassen: ohne Angabe wird das Passwort abgefragt "
                         "und landet nicht im Prozesslisting und in der Shell-History")
    ap.add_argument("--check", action="store_true", help="nur Erreichbarkeit testen")
    args = ap.parse_args()

    CFG["endpoint"] = args.endpoint
    CFG["timeout"] = args.timeout
    if args.user:
        passwort = args.password
        if passwort is None:
            passwort = getpass.getpass("Passwort fuer %s: " % args.user)
        token = "%s:%s" % (args.user, passwort)
        CFG["auth"] = base64.b64encode(token.encode("utf-8")).decode("ascii")

    if args.check:
        sys.exit(check())

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("Frontend:  http://localhost:%d" % args.port)
    print("Proxy:     /query  ->  %s" % CFG["endpoint"])
    print("Test:      http://localhost:%d/health" % args.port)
    print("Beenden mit Ctrl-C\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")


if __name__ == "__main__":
    main()
