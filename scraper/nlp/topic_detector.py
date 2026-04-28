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


def detect_topics(text: str) -> list[str]:
    """Return list of canonical topic names found in text (may be multiple)."""
    text_lower = text.lower()
    matched = [
        topic
        for topic, keywords in _TOPIC_KEYWORDS.items()
        if any(kw in text_lower for kw in keywords)
    ]
    return matched
