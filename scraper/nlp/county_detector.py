import re

from config import COUNTY_NAMES

# County-specific aliases and common references
_ALIASES: dict[str, list[str]] = {
    "Nairobi":           ["nairobi", "nbi", "jiji la nairobi"],
    "Mombasa":           ["mombasa", "msa", "bandari"],
    "Murang'a":          ["murang'a", "muranga"],
    "Taita-Taveta":      ["taita-taveta", "taita taveta", "taita"],
    "Tana River":        ["tana river", "tana"],
    "Trans-Nzoia":       ["trans-nzoia", "trans nzoia"],
    "Uasin Gishu":       ["uasin gishu", "eldoret"],
    "Elgeyo-Marakwet":   ["elgeyo-marakwet", "elgeyo marakwet", "iten"],
    "West Pokot":        ["west pokot", "kapenguria"],
    "Homa Bay":          ["homa bay", "homabay"],
    "Tharaka-Nithi":     ["tharaka-nithi", "tharaka nithi", "tharaka", "chuka"],
    "Kisumu":            ["kisumu", "lakeside city", "lake victoria city"],
    "Nakuru":            ["nakuru", "nakuru city"],
    "Kisii":             ["kisii", "gusii"],
    "Kakamega":          ["kakamega"],
    "Machakos":          ["machakos", "macha"],
    "Kiambu":            ["kiambu", "thika"],
    "Nyeri":             ["nyeri"],
    "Garissa":           ["garissa"],
    "Turkana":           ["turkana", "lodwar"],
    "Mandera":           ["mandera"],
    "Wajir":             ["wajir"],
    "Marsabit":          ["marsabit"],
    "Isiolo":            ["isiolo"],
    "Meru":              ["meru"],
    "Embu":              ["embu"],
    "Kitui":             ["kitui"],
    "Makueni":           ["makueni", "wote"],
    "Nyandarua":         ["nyandarua", "ol kalou"],
    "Kirinyaga":         ["kirinyaga", "kerugoya"],
    "Laikipia":          ["laikipia", "nanyuki"],
    "Narok":             ["narok"],
    "Kajiado":           ["kajiado", "ngong", "kitengela"],
    "Kericho":           ["kericho"],
    "Bomet":             ["bomet"],
    "Vihiga":            ["vihiga"],
    "Bungoma":           ["bungoma"],
    "Busia":             ["busia"],
    "Siaya":             ["siaya"],
    "Migori":            ["migori"],
    "Nyamira":           ["nyamira"],
    "Nandi":             ["nandi", "kapsabet"],
    "Baringo":           ["baringo", "kabarnet"],
    "Samburu":           ["samburu", "maralal"],
    "Lamu":              ["lamu", "kisiwa cha lamu"],
    "Kwale":             ["kwale", "diani"],
    "Kilifi":            ["kilifi", "malindi", "watamu"],
}


def _build_patterns() -> list[tuple[str, re.Pattern]]:
    patterns = []
    for county in COUNTY_NAMES:
        terms = list(dict.fromkeys(
            _ALIASES.get(county, [county.lower()]) + [county.lower()]
        ))
        pattern = re.compile(
            r"\b(" + "|".join(re.escape(t) for t in terms) + r")\b",
            re.IGNORECASE,
        )
        patterns.append((county, pattern))
    return patterns


_PATTERNS = _build_patterns()


def detect_county(text: str) -> tuple[str, float] | tuple[None, float]:
    """Return (county_name, confidence) or (None, 0.0) if no match.

    Confidence: canonical name and a distinct alias both present = 1.0,
    canonical name only = 0.90, alias only = 0.85.

    Scores every county and returns the best, rather than returning the first
    match in COUNTY_NAMES order. Order-based matching silently misattributed
    articles: an article naming several counties was credited entirely to
    whichever appeared earliest in the list, so Mombasa at index 0 beat every
    other Coast county. Ties break on the longest matched term, so "Homa Bay"
    wins over a bare "Bay" style prefix of another county.
    """
    if not text:
        return None, 0.0

    text_lower = text.lower()
    best: tuple[str, float, int] | None = None

    for county_name, pattern in _PATTERNS:
        found = [m.group(0).lower() for m in pattern.finditer(text)]
        if not found:
            continue

        canonical = county_name.lower()
        canonical_hit = canonical in found
        alias_hit = any(f != canonical for f in found)

        if canonical_hit and alias_hit:
            confidence = 1.0
        elif canonical_hit:
            confidence = 0.90
        else:
            confidence = 0.85

        longest = max(len(f) for f in found)
        candidate = (county_name, confidence, longest)

        if best is None or (confidence, longest) > (best[1], best[2]):
            best = candidate

    if best is None:
        return None, 0.0
    return best[0], best[1]
