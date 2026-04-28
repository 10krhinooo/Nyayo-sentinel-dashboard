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


def detect_county(text: str) -> str | None:
    """Return canonical county name if found in text, else None."""
    for county_name, pattern in _PATTERNS:
        if pattern.search(text):
            return county_name
    return None
