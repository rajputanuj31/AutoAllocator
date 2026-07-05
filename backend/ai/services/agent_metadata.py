"""Shared utilities for decoding ERC-8004 agent tokenURI metadata."""

from __future__ import annotations

import base64
import ipaddress
import json
import socket
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_METADATA_BYTES = 64_000


def _is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("https", "http"):
        return False
    hostname = parsed.hostname
    if not hostname:
        return False
    if hostname in ("localhost", "127.0.0.1", "0.0.0.0"):
        return False
    try:
        for info in socket.getaddrinfo(hostname, None):
            addr = info[4][0]
            ip = ipaddress.ip_address(addr)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
    except socket.gaierror:
        return False
    return True


def decode_agent_uri(uri: str) -> dict:
    """Decode agent metadata from data: URI or HTTPS URL."""
    if uri.startswith("data:application/json;base64,"):
        raw = base64.b64decode(uri.split(",", 1)[1])
        return json.loads(raw.decode("utf-8"))
    if uri.startswith("data:application/json,"):
        return json.loads(uri.split(",", 1)[1])

    if not _is_safe_url(uri):
        raise ValueError(f"Unsafe or unsupported metadata URI: {uri}")

    req = Request(uri, headers={"User-Agent": "AutoAllocator/1.0"})
    with urlopen(req, timeout=5) as resp:
        body = resp.read(MAX_METADATA_BYTES + 1)
    if len(body) > MAX_METADATA_BYTES:
        raise ValueError("Metadata response too large")
    return json.loads(body.decode("utf-8"))
