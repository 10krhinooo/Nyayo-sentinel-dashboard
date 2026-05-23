import re

from config import COUNTY_NAMES

# County-specific aliases and common references
_ALIASES: dict[str, list[str]] = {
    "Nairobi":           ["nairobi", "nbi", "the capital", "jiji la nairobi", "mji mkuu"],
    "Mombasa":           ["mombasa", "msa", "the coast", "coastal city", "bandari", "pwani"],
    "Murang'a":          ["murang'a", "muranga"],
    "Taita-Taveta":      ["taita-taveta", "taita taveta", "taita"],
    "Tana River":        ["tana river", "tana"],
    "Trans-Nzoia":       ["trans-nzoia", "trans nzoia"],
    "Uasin Gishu":       ["uasin gishu", "eldoret"],
    "Elgeyo-Marakwet":   ["elgeyo-marakwet", "elgeyo marakwet", "iten"],
    "West Pokot":        ["west pokot", "kapenguria"],
    "Homa Bay":          ["homa bay", "homabay"],
    "Tharaka-Nithi":     ["tharaka-nithi", "tharaka nithi"],
    "Kisumu":            ["kisumu", "lakeside city", "lake victoria city", "ziwa victoria", "pwani ya ziwa"],
    "Nakuru":            ["nakuru", "nakuru city", "bonde la ufa"],
    "Kisii":             ["kisii", "gusii"],
    "Kakamega":          ["kakamega", "western kenya"],
    "Machakos":          ["machakos", "macha"],
    "Kiambu":            ["kiambu", "thika"],
    "Nyeri":             ["nyeri", "mt kenya region"],
    "Garissa":           ["garissa", "nep"],
    "Turkana":           ["turkana", "lodwar", "bonde la turkana"],
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
    "Narok":             ["narok", "mara region"],
    "Kajiado":           ["kajiado", "ngong", "kitengela"],
    "Kericho":           ["kericho", "tea county"],
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
    "Tharaka-Nithi":     ["tharaka", "chuka"],
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

    Confidence: regex alias match = 0.85, exact county name match = 0.90,
    both agree = 1.0 (alias hit for a county whose canonical name also appears).
    """
    text_lower = text.lower()
    for county_name, pattern in _PATTERNS:
        if pattern.search(text):
            canonical_hit = bool(re.search(r"\b" + re.escape(county_name.lower()) + r"\b", text_lower))
            alias_hit = any(
                re.search(r"\b" + re.escape(alias) + r"\b", text_lower)
                for alias in _ALIASES.get(county_name, [])
                if alias != county_name.lower()
            )
            if canonical_hit and alias_hit:
                confidence = 1.0
            elif canonical_hit:
                confidence = 0.90
            else:
                confidence = 0.85
            return county_name, confidence
    return None, 0.0
