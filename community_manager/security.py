from __future__ import annotations

import re

SENSITIVE = re.compile(r"(?i)(bearer\s+|access_token=|client_secret=|cookie=)([^\s,&]+)")

def redact(value: str) -> str:
    return SENSITIVE.sub(r"\1[REDACTED]", value or "")

