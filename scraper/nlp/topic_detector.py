import re

_TOPIC_KEYWORDS: dict[str, list[str]] = {
    "Healthcare": [
        "hospital", "health", "clinic", "doctor", "nurse", "medicine",
        "nhif", "sha", "medical", "disease", "treatment", "pharmacy",
        "ambulance", "maternity", "dispensary", "cancer", "malaria", "hiv",
        # Swahili
        "hospitali", "afya", "daktari", "muuguzi", "dawa", "ugonjwa",
        "matibabu", "zahanati", "chanjo", "upasuaji", "kliniki",
    ],
    "Education": [
        "school", "education", "university", "college", "teacher", "student",
        "curriculum", "tvet", "bursary", "scholarship", "exam", "kcse", "kcpe",
        "cbc", "dropout", "tuition", "headteacher", "principal",
        # Swahili
        "shule", "elimu", "chuo kikuu", "mwalimu", "mwanafunzi", "mtihani",
        "masomo", "ada ya shule", "bwana mkubwa wa shule",
    ],
    "Land & Housing": [
        "land", "housing", "eviction", "title deed", "settlement",
        "squatter", "landlord", "rent", "property", "grabbing", "nms",
        "affordable housing", "slum", "demolition", "encroachment",
        # Swahili
        "ardhi", "nyumba", "kufukuzwa", "hati ya ardhi", "makazi",
        "mpangaji", "pango", "ujenzi haramu", "kuondolewa",
    ],
    "Water & Sanitation": [
        "water", "sanitation", "sewage", "drought", "pipe", "borehole",
        "water shortage", "flush", "nwsc", "toilet", "latrine", "clean water",
        "flooding", "sewerage",
        # Swahili
        "maji", "usafi wa mazingira", "ukosefu wa maji", "kisima",
        "mafuriko", "mto", "choo", "mfumo wa maji",
    ],
    "Roads & Transport": [
        "road", "highway", "sgr", "matatu", "potholes", "traffic",
        "transport", "bus", "infrastructure", "bridge", "ketraco",
        "tarmac", "passable", "impassable", "flyover", "bypass",
        # Swahili
        "barabara", "usafiri", "daraja", "lami", "foleni", "magari",
        "gari la moshi", "njia kuu",
    ],
    "Security & Police": [
        "police", "security", "crime", "robbery", "shooting", "nps",
        "officer", "arrest", "terrorism", "bandit", "militia",
        "kidnap", "extrajudicial", "murder", "gang", "vigilante", "gsu",
        # Swahili
        "polisi", "usalama", "uhalifu", "wizi", "uuaji", "kukamatwa",
        "magaidi", "majambazi", "mauaji", "ujambazi", "uvamizi",
    ],
    "Corruption": [
        "corruption", "bribery", "embezzlement", "scandal", "graft",
        "tender", "fraud", "looting", "impunity", "eacc", "odpp",
        "kickback", "ghost worker", "inflated", "siphon", "irregular",
        # Swahili
        "ufisadi", "rushwa", "ubadhirifu", "kashfa", "fedha za umma",
        "wizi wa umma", "ulaghai", "kupoteza fedha",
    ],
    "Agriculture": [
        "farm", "agriculture", "crop", "fertilizer", "maize",
        "tea", "coffee", "livestock", "irrigation", "kari", "asal",
        "harvest", "drought", "food production", "horticulture", "dairy",
        # Swahili
        "kilimo", "shamba", "mazao", "mbolea", "mahindi", "chai",
        "kahawa", "mifugo", "umwagiliaji", "mavuno", "ukame", "wakulima",
    ],
    "Youth Unemployment": [
        "unemployment", "youth", "jobs", "hustle", "hustler", "graduate",
        "intern", "neet", "jobless", "employment", "gen z",
        "tarmacking", "idle", "work permit", "casual", "jua kali",
        # Swahili
        "ukosefu wa kazi", "vijana", "kazi", "wasomi wasio na kazi",
        "bora maisha", "kutafuta kazi", "ajira",
    ],
    "Taxation & Revenue": [
        "tax", "revenue", "kra", "vat", "levy", "customs", "tariff",
        "budget", "exchequer", "treasury", "finance bill",
        "fuel levy", "sin tax", "withholding", "itax", "taxpayer",
        # Swahili
        "kodi", "mapato", "bajeti", "ushuru", "tozo", "fedha za serikali",
        "malipo ya kodi",
    ],
    "Devolution": [
        "devolution", "county government", "governor", "mca",
        "cec", "equalization", "intergovernmental", "ward",
        "county assembly", "devolved", "county funds", "senator",
        # Swahili
        "ugatuzi", "serikali ya kaunti", "gavana", "mkutano wa kaunti",
        "bunge la kaunti", "fedha za kaunti",
    ],
    "Food Security": [
        "hunger", "food", "famine", "malnutrition", "relief food",
        "wfp", "starving", "food insecurity", "food prices",
        "subsidized maize", "ration", "emergency food",
        # Swahili
        "njaa", "chakula", "baa la njaa", "utapiamlo", "msaada wa chakula",
        "uhaba wa chakula", "bei ya chakula", "chakula cha msaada",
    ],
}


def _compile_patterns() -> dict[str, re.Pattern[str]]:
    """Compile one word-boundary alternation per topic.

    Plain substring matching produced false positives that were invisible in
    aggregate: "sha" (Healthcare) matched "share" and "Mombasa shamba", "kra"
    (Taxation) matched "Ankara", and "ward" (Devolution) matched "award",
    "towards" and "forward". Every article containing those common words was
    attributed to a topic it never mentioned.
    """
    patterns: dict[str, re.Pattern[str]] = {}
    for topic, keywords in _TOPIC_KEYWORDS.items():
        # Longest first so "affordable housing" wins over "housing" when both
        # are present, which keeps the strong-keyword count honest.
        ordered = sorted(set(keywords), key=len, reverse=True)
        alternation = "|".join(re.escape(kw) for kw in ordered)
        patterns[topic] = re.compile(rf"\b(?:{alternation})\b", re.IGNORECASE)
    return patterns


_PATTERNS = _compile_patterns()

# A keyword is "strong" when it identifies the topic on its own. Length was
# previously used as a proxy for specificity, which handed 0.90 to generic
# terms like "infrastructure", "employment" and "agriculture" on a single hit.
_STRONG_KEYWORDS: dict[str, set[str]] = {
    "Healthcare": {"nhif", "sha", "hospitali", "dispensary", "mortuary", "doctors strike"},
    "Education": {"kcse", "kcpe", "cbc", "tvet", "helb", "shule", "school fees"},
    "Land & Housing": {"title deed", "affordable housing", "squatter", "land grabbing"},
    "Water & Sanitation": {"borehole", "nwsc", "water rationing", "maji safi"},
    "Roads & Transport": {"matatu", "sgr", "boda boda", "tarmac", "barabara"},
    "Security & Police": {"gsu", "nps", "police brutality", "usalama", "banditry"},
    "Corruption": {"eacc", "odpp", "ufisadi", "embezzlement", "graft"},
    "Agriculture": {"kari", "asal", "fertiliser", "fertilizer", "mkulima", "extension officer"},
    "Youth Unemployment": {"hustler fund", "jua kali", "tarmacking", "gen z", "ajira"},
    "Taxation & Revenue": {"kra", "itax", "finance bill", "ushuru", "paye"},
    "Devolution": {"mca", "cec", "county assembly", "equalization fund", "ugatuzi"},
    "Food Security": {"wfp", "relief food", "njaa", "malnutrition", "subsidized maize"},
}


def detect_topics(text: str) -> list[tuple[str, float]]:
    """Return list of (topic, confidence) tuples found in text.

    Confidence: a strong keyword scores 0.90, two or more ordinary matches
    0.75, a single ordinary match 0.60.
    """
    if not text:
        return []

    results: list[tuple[str, float]] = []
    for topic, pattern in _PATTERNS.items():
        matches = {m.group(0).lower() for m in pattern.finditer(text)}
        if not matches:
            continue

        strong = matches & _STRONG_KEYWORDS.get(topic, set())
        if strong:
            confidence = 0.90
        elif len(matches) >= 2:
            confidence = 0.75
        else:
            confidence = 0.60
        results.append((topic, confidence))
    return results
